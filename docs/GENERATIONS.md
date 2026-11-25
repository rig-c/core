# Spine data generations — the policy

**What rigc does with Spine data from a generation other than the one it emits, and
why.** Spine data is locked to the editor generation that exported it — 3.8, 4.0, 4.1,
4.2, 4.3 — and rigc emits and reads 4.3. This page is the public statement of the
policy that governs everything else: how a generation is detected, what happens to a
file from another one, how such a file reaches rigc, and what is deliberately not in
this tree.

---

## 1. What a generation is, and why a mismatch is silent

A generation is the `MAJOR.MINOR` pair a runtime is locked to. spine-ts stores the
version string a file states and never compares it against its own (the comment above
`A16` in `src/validate.ts` cites where other runtimes do), so a file from another
generation is read with the wrong reader's rules and nothing says so. The measurements
behind the policy (the counts are of shipped skeletons outside this repository):

| # | combination | what happens |
| --- | --- | --- |
| 1 | 4.0–4.2 JSON on the **4.3** runtime (`spine-core` 4.3.13) | of 1,454 shipped web skeletons, 1,302 parse and 152 throw — and **the 1,302 that parse load 0 of 8,672 constraints**. 4.3 reads constraints from the top-level `constraints` array alone, and ignores the `ik` / `transform` / `path` / `physics` arrays earlier generations keep them in |
| 2 | 3.8.99 JSON on the **4.0** runtime | parses without an exception and poses as NaN: after one second, 238 of 248 bones in one rig have non-finite world transforms. 3.8 writes rotate keys as `angle` and curves as a scalar `curve` plus `c2`/`c3`/`c4`; 4.0 reads `value` and indexes `curve` as an array |
| 3 | 4.2.29 **binary** `.skel` on 4.3.13 | 42 of 42 fail to parse. Binary is fully generation-locked |
| 4 | physics **defaults** | an omitted `inertia` is 1 to the 4.2 parser and 0.5 to the 4.3 one; an omitted `damping` is 1 and 0.85 (`getValue(constraintMap, "inertia", 1)` and `"damping", 1` at `SkeletonJson.js:240`/`:242` of `spine-core` 4.2.120; `0.5` and `0.85` at `SkeletonJson.js:306`/`:308` of the `spine-core` 4.3.13 this package pins). JSON omits a field equal to its default, so the same file is two different constraints under two readers. 111 of 9,187 shipped physics constraints omit `inertia` |
| 5 | an official 3.8 core | `@esotericsoftware/spine-core`, `spine-webgl` and `spine-player` start at 4.0.1 on npm. There is no official 3.8 npm bundle |
| 6 | the bone inheritance key | 4.0 and 4.1 spell it `transform`, 4.2 and 4.3 spell it `inherit` (`getValue(boneMap, "transform", "Normal")` at `SkeletonJson.js:91` of `spine-core` 4.1.56, `getValue(boneMap, "inherit", "Normal")` at `:94` of 4.2.120). The old key is an unknown field to the newer reader, so the bone falls back to Normal inheritance without a word |
| 7 | guessing the generation | a catalog builder handed the "nearest" runtime it had (4.2) to 19 skeletons labelled `3.8.99`; they loaded, and posed as NaN (row 2) |

Row 6's rename is **4.1 → 4.2**, as [SPEC_COVERAGE.md](SPEC_COVERAGE.md)'s
format-change timeline also records. `A02_NO_BONE_TRANSFORM_KEY` refuses the key in 4.3
data whichever generation last wrote it, so its detail names both generations that
spelled it rather than guessing one: `bone "…" uses "transform", the key 4.0 and 4.1
spelled; 4.2 and 4.3 spell it "inherit"`.

Rows 1, 2 and 6 each **opened without an error**. That is the whole reason this is a
policy rather than a compatibility note.

## 2. The policy

Five rules:

1. **The data states its generation.** It is detected from `skeleton.spine`. **An
   unknown generation gets no runtime** — never the nearest one (row 7) — and is shown
   as unsupported where a person or an agent will see it.
2. **Play on that generation's official runtime.** Data is not converted in order to be
   played. A renderer that supports several generations draws on top of the matching
   core; it does not rewrite the data.
3. **Generation knowledge lives in one place, and is extracted by machine.** Key
   renames, array shapes and per-generation defaults come from the official runtime
   sources (`SkeletonJson` on each spine-runtimes branch). No repository keeps a
   hand-copied table: hand-kept tables drift.
4. **Conversion is one tool, at build time, trusted only where an oracle passes.**
   Conversion is a translation of meaning, not a re-arrangement (row 4). Its gate is a
   **pose oracle** — the original posed under its own generation's runtime against the
   converted file posed under the target runtime, at the same sample times. Until that
   gate passes by machine it is an internal verification utility, not a command.
5. **"It opened without an error" is not support.** A generation is supported when its
   column is green by machine — a matrix or a full sweep.

rigc is the owner of the first and third: the detection rule, and the knowledge of what
differs between generations. The renderer side detects and nothing more.

## 3. What rigc does today, and the code that does it

### One reader of `skeleton.spine`

[`src/generation.ts`](https://github.com/rig-c/core/blob/main/src/generation.ts) is
the only place in the tree that decides a generation, and it exports exactly this:

| export | what it is |
| --- | --- |
| `SpineGeneration` | the type: `'3.8' \| '4.0' \| '4.1' \| '4.2' \| '4.3'` |
| `SPINE_GENERATIONS` | every generation the module knows, oldest first |
| `spineGeneration` | `spineGeneration(version)` — the generation a `skeleton.spine` string names, or `null` |
| `TOPLEVEL_CONSTRAINT_ARRAYS` | the top-level constraint arrays 4.3 folded into `constraints`: `ik`, `transform`, `path`, `physics`, `slider` |
| `LEGACY_BONE_INHERIT_KEY` | the bone key the older generations spell where 4.3 spells `inherit`: `transform` |
| `PHYSICS_FIELDS_WHOSE_DEFAULT_MOVED` | the physics fields whose omitted default is not the same number before and in 4.3: `inertia`, `damping` — which fields to **count**, not their values (rule 3) |

`spineGeneration(version)` reads the string by three rules, and nothing else:

- **The leading token is the generation.** `4.0-from-4.1.24` is 4.0 data written by a
  4.1 editor — a down-export. Of the shipped files measured, all 418 plain-or-down-exported
  4.0 files and 101 4.1 files load and render on the 4.0 and 4.1 runtimes with 0 failures; reading
  the trailing token would hand them the wrong runtime.
- **Every token must be a known generation, and the chain must ascend.** A down-export
  comes *from* a newer editor, so `4.3-from-4.2.1` is not a string this reader can
  account for.
- **Unknown is `null`, never the nearest.** `null` is what a caller has to act on.

Nine strings found in shipped data, and three this reader refuses:

| `skeleton.spine` | generation |
| --- | --- |
| `3.8.99` | `3.8` |
| `4.0.33` | `4.0` |
| `4.0-from-4.1.24` | `4.0` |
| `4.0-from-4.1-from-4.2.29` | `4.0` |
| `4.1-from-4.2.33` | `4.1` |
| `4.2.09-beta` | `4.2` |
| `4.2.43` | `4.2` |
| `4.3.26` | `4.3` |
| `4.3.75-beta` | `4.3` |
| `4.30` | `null` |
| `4.3-from-4.2.1` | `null` |
| `4.3-from-4.4.1` | `null` |

The last row is a cost stated rather than hidden: a future editor down-exporting as
`4.3-from-4.4.1` is refused by name until that generation is added, which is rule 1's
own answer.

### Where its verdict is read

- **`build` and `validate`** — `A16_SKELETON_VERSION_4_3` takes its verdict from
  `spineGeneration` and refuses anything that is not 4.3:
  `skeleton.spine is "…", expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`.
  `A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS` refuses a top-level array named in
  `TOPLEVEL_CONSTRAINT_ARRAYS` (row 1) and `A02_NO_BONE_TRANSFORM_KEY` refuses a bone
  carrying `LEGACY_BONE_INHERIT_KEY` (row 6). rigc never emits either shape; the two
  checks are what catches a file that does.
- **`ingest`** reads `skeleton.spine` before it reads a field of the file, and a file
  from another generation ends in a coded blocker:
  - `BLOCK GENERATION_UNSUPPORTED` — `the file states "…", which is Spine <generation>
    data, and this reader reads Spine 4.3 only`, followed by what a 4.3 reader loses
    **measured on that file**: the constraints sitting in top-level arrays, counted by
    kind; the bones carrying `transform` where 4.3 spells `inherit`; the physics
    constraints omitting `inertia` or `damping`. Where the file has none of the three,
    the detail says so — `which is three shapes counted and not a guarantee that nothing
    else differs`.
  - `BLOCK GENERATION_UNKNOWN` — `the file states … and no Spine generation matches it`,
    for a label no generation matches or a header stating none, with the same
    measurement and the reason it is not rounded (row 7).

  Both are findings rather than a refusal: the specs and `findings.json` are still
  written, and the exit code is 1. [INGEST.md](INGEST.md) §2.0's finding table is the
  full row for each.

`ingest` and `compile` are 4.3-only, and say so: the compiler emits `"spine": "4.3.13"`,
the version of the `spine-core` it links and is gated against, and `ingest` inverts that
emitter and nothing older.

## 4. How pre-4.3 data reaches rigc

**Through the Spine editor, one generation at a time.** Import the data with an editor of
**its own** generation, then export it as 4.3 JSON. The launcher's `-u` flag pins the
editor version for one run and downloads a version it does not have
([Spine command-line interface](https://esotericsoftware.com/spine-command-line-interface)):

```bash
Spine -u 4.2.43 -i skeleton.json -o project.spine -r skeleton   # 4.2 data; -u 4.1.24, 4.0.64 or 3.8.99 for the others
Spine -u 4.3.26 -i project.spine -o export -e json              # the 4.3 export rigc reads
```

The same-generation import is the rule because the alternative was measured.
**[observed]** A 4.3 editor importing another generation's JSON directly drops
constraints without a word.

The path is measured in [ROADMAP_TO_1.0.md](https://github.com/rig-c/core/blob/main/docs/ROADMAP_TO_1.0.md)
§*1.0 — claimed on 2026-09-24*: each source posed under its own generation's
`spine-core`, the editor's 4.3.26 export and rigc's rebuild posed under 4.3.13, and every
rebuild posing within the editor's own migration noise against the source. 3.8 has no
runtime on npm (row 5), so a 3.8 rig is compared against the export alone.

⚠️ **The export step is not neutral, and what it changes is the editor's behaviour, not
rigc's.** A reader comparing a rebuild against the source it was migrated from should
expect these, each **[observed]** on the editor's 4.3.26 export:

- a transform constraint that is inert — every mix 0, and never keyed — is dropped;
- an empty `default` skin is dropped (measured on a generated three-skin rig), while an
  empty *named* skin is kept;
- a path's `lengths` are re-measured on migration, so the export's array is not the
  source's;
- slot names of the form `a/b` came back as `a-b` on one 4.1 rig.

rigc reproduces the **export**: `build(ingest(export))` is held to the export, and the
distance from the export back to the source is the editor's.

## 5. What rigc does not do, and why

- **Reading pre-4.3 data with that generation's own defaults** is not in the tree. It
  needs the per-generation table rule 3 describes — key renames, array shapes and every
  `getValue(map, key, default)` default, extracted by machine from each branch's
  `SkeletonJson` — and rigc links one `spine-core`, the 4.3.13 this package pins. So
  `ingest` names what a 4.3 reader loses instead of applying defaults it would have to
  type by hand.
- **A conversion utility, and the cross-generation pose oracle that gates it**, are not
  in the tree either. Rule 2 says data is not converted in order to be played, and rule 4
  says a converter is trusted only where the oracle passes — so the editor, run with the
  data's own generation, is the migration path. The pose measurements §4 points at come
  from a tool outside rigc, not from a command of this one.

## 6. Where the policy is canonical

This page is rigc's statement of the policy.
[#706](https://github.com/rig-c/core/issues/706) carries its full original text, its
measurements and its ownership table.
