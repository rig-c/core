# The compiled model — a census of what `compile` writes, and who owns each byte

**Status: a measurement, not a design** (issue #908, step 0a of issue #380). Taken on
2026-09-29 at commit `574f596` of `main`. Nothing under `src/` moved to produce it.

**A dated record:** what this page states was measured on the date it carries and is not kept current, so the selftest's currency gate leaves its figures alone.

Every `file.ts:NNN` below is a coordinate at `574f596`. When the lines have moved, read
the row's *writes* column rather than the number, and re-take the census at the new
commit: the row list that generated §1.3 checked each line against a token that line
must carry, which is how a re-take finds every row that went stale. That generator was a
scratch script and is not in the tree, so a re-take starts from §1.1's definition. It answers the
three questions step 1 of #380 needs answered before the compiler can hand a neutral
model to a Spine emitter: *which writes are content and which are Spine's shape*, *what
the model's fields are, from the values that exist*, and *what an emitter that must
reproduce today's bytes has to own*.

The frame is [ROADMAP_TO_1.0.md](ROADMAP_TO_1.0.md) *What changes the frame*, and the rule this
serves is [CLAUDE.md](../CLAUDE.md) *Conventions*: `src/compile.ts` stays independent of
the runtime (`CUR07` holds that it links no `spine-core`). This page adds the other half
of that sentence as a count: how much of `compile.ts` is **shaped** like Spine even
though it links nothing of it.

## The finding

1. **305 site lines, in 218 rows: 215 neutral, 88 Spine-shape, 2 open** (the table in
   §1 is generated from the row list that also checks every line number against the
   tree, so these figures are its sums and nothing else).
2. **There is no neutral object before the emitter today.** The compiler builds the
   Spine objects themselves: `compile.ts` references 14 `Spine*` types of
   [`types.ts`](../src/types.ts) 111 times (imports and comments included), and every constructor writes the 4.3
   spelling as it goes. What is separable *now* is three statements — the two
   whole-object passes and `JSON.stringify` (`compile.ts:3423`, `:3427`, and
   `keyorder.ts` behind them) — plus the atlas writer. And **24 sites in `compile.ts`
   read the Spine-shaped objects back** to compute later ones (§1.3): world transforms,
   deform geometry, path lengths, linked-mesh resolution, the bone index a weighted
   vertex points at. So the neutral model #380's design describes as *already built,
   then made serialisable* is, measured, **a model to be constructed**: step 1 is a
   change to how `compile` builds, not a serialiser beside it.
3. **Float spelling is model content, not emitter formatting.** Rewriting every
   fractional number of a build as the full double of the *same* float32 moved the pose
   `spine-core` computes on **19 of 19** builds, by up to `8.22e-3` (§4). spine-core's
   JSON reader keeps setup values as doubles, so *which* decimal `f32` names is a value.
   `f32` and `keyTime` therefore belong to the model, and the model must hold the
   numbers the file holds. The colour hex spelling is the opposite: upper-casing every
   hex string left `SkeletonData` identical on 13 of 13 builds that carry one.
4. **Every Spine-shape class was made to change and measured**: key order, restated
   parser defaults, the header version string, colour case, atlas blank lines and a
   region renamed on both sides leave the loaded pose identical on every build; the two
   4.3 spellings with a generation history (`inherit`, the `constraints[]` array) are
   misread by 4.3 when spelled the older way. A neutral control (one bone's `x` + 1)
   moves the pose on 19 of 19.

---

## 1. The census

### 1.1 What a site is

A **site** is one source line that writes a value into the emitted skeleton object or
the atlas text, or places a finished sub-object into it. Consecutive lines of one kind
share a row, and the row counts its lines. A line that writes values of two classes
appears in two rows (`compile.ts:3138`, `:4641`, `:4977`, `:6312`, `mesh.ts:1604`).
Lines that only *produce* a value a counted line writes (`f32`, `rgbaHex`,
`buildVertexGeometry`'s `raw.map(f32)`) are not counted again; they are named in §3.

- **neutral** — a value any backend posing this rig would carry: a transform, a key's
  time, value or curve, geometry and weights, a constraint's parameters, a measured
  size, a name the spec states.
- **Spine-shape** — present because the output is Spine 4.3 JSON or a 4.x atlas: a
  discriminator, a 4.3 spelling, a key position, an omission at the parser's default,
  header bookkeeping, text layout, a region name that is a PNG basename, an index into
  the emitted bone array.
- **open** — neither can be argued from the tree; the row says why.

The `fmt` column marks a neutral site that applies `f32`/`keyTime` or the hex encoder
inline. §4 is why those are counted neutral.

⚠️ **The input vocabulary is already Spine's** ([AUTHORING.md](AUTHORING.md) *The
vocabulary is Spine's*), so a neutral row often passes a Spine *name* through — a blend
mode, a path `rotateMode`, a constraint field. The class is about the value's meaning in
the output, and step 1 does not change the inputs.

### 1.2 Totals

| class | rows | site lines |
| --- | --- | --- |
| neutral | 144 | 215 |
| Spine-shape | 72 | 88 |
| open | 2 | 2 |
| **all** | 218 | 305 |

| file | neutral | Spine-shape | open |
| --- | --- | --- | --- |
| `src/atlas.ts` | 4 | 11 | 2 |
| `src/compile.ts` | 210 | 72 | 0 |
| `src/keyorder.ts` | 0 | 3 | 0 |
| `src/mesh.ts` | 1 | 2 | 0 |

| inline formatting on the site | neutral site lines | Spine-shape site lines |
| --- | --- | --- |
| `f32` | 112 | 3 |
| `hex` | 5 | 0 |

`src/timelines.ts` and `src/slots.ts` have **no site**: `compile.ts` takes four
functions of `timelines.ts` (`float32Step`, `physicsKeyRefusal`, `physicsRuleFor`,
`SLOT_COLOR_CHANNELS`), every one a check or a tolerance, and does not import
`slots.ts` at all (it is `check`'s slot tracker). `src/mesh.ts` does have sites: its
`encodeWeightedVertices` writes the weighted run of every generated mesh.

### 1.3 The rows

| # | site | writes | class | why | fmt |
| --- | --- | --- | --- | --- | --- |
| 1 | `compile.ts:1724` | atlas page line = the PNG path relative to the atlas | Spine-shape | a page is named by a path relative to the atlas file, the 4.x atlas convention |  |
| 2 | `compile.ts:1725-1726` | page `size` | neutral | the measured PNG size |  |
| 3 | `compile.ts:1729` | region name line | Spine-shape | region name = PNG basename, the join key the loader looks up |  |
| 4 | `compile.ts:1730-1731` | region `bounds` x, y | neutral | the region covers its page: a fact of the one-part-per-page route |  |
| 5 | `compile.ts:1732-1733` | region `bounds` width, height | neutral | the measured PNG size |  |
| 6 | `compile.ts:1734-1735` | region `offsets` x, y | neutral | nothing trimmed: a fact of the loose route |  |
| 7 | `compile.ts:1736-1737` | region `offsets` original size | neutral | the measured PNG size |  |
| 8 | `compile.ts:1772` | `CompiledImage.page` (loose PNG) | Spine-shape | the page line is a path relative to `--out` |  |
| 9 | `compile.ts:1931` | `CompiledImage.page` (`--atlas-in`) | Spine-shape | same, for a region lifted off a pack |  |
| 10 | `compile.ts:2171` | `CompiledImage.region` default | Spine-shape | region name = PNG basename (the header comment of the gather step) |  |
| 11 | `compile.ts:2526` | the `--atlas-in` pack re-emitted with re-anchored page names and canonical blank lines | Spine-shape | the imported text passes through by line; only its paths and blank lines are put into rigc shape |  |
| 12 | `atlas.ts:423` | page name line replaced | Spine-shape | a path re-anchored to `--out` |  |
| 13 | `atlas.ts:425` | line join of the passed-through pack | Spine-shape | text layout |  |
| 14 | `atlas.ts:459,460,462,463` | blank lines dropped, collapsed, trailing newline | Spine-shape | atlas whitespace shape (`A07`) |  |
| 15 | `atlas.ts:592` | no pages = the empty file | Spine-shape | text layout (#608) |  |
| 16 | `atlas.ts:595` | one blank line between page blocks | Spine-shape | text layout |  |
| 17 | `atlas.ts:596` | page name line | Spine-shape | a path |  |
| 18 | `atlas.ts:597` | `size: w, h` | neutral | page size |  |
| 19 | `atlas.ts:598` | `filter: Linear, Linear` | open | a policy constant no input can state and nothing measures; whether it is model content (a sampling hint any backend needs) or an emitter constant is a step-1 decision |  |
| 20 | `atlas.ts:599` | `pma: false` | open | a policy constant (parts are straight alpha, `A06` under `spine-html`); nothing reads the PNG for it, so it is neither measured content nor a 4.3 spelling |  |
| 21 | `atlas.ts:601` | region name line | Spine-shape | region name = PNG basename |  |
| 22 | `atlas.ts:602` | `bounds:` | neutral | the region's rectangle on its page |  |
| 23 | `atlas.ts:603` | `offsets:` | neutral | trim offsets and the untrimmed size |  |
| 24 | `atlas.ts:604` | `rotate: 0` | neutral | a fact: the packer never turns a region (`PACK_NO_ROTATE`) |  |
| 25 | `atlas.ts:607` | line join and trailing newline | Spine-shape | text layout |  |
| 26 | `compile.ts:3333` | `skeleton.spine` | Spine-shape | the version string of the linked runtime |  |
| 27 | `compile.ts:3335-3336` | stage origin `x`, `y` | neutral | the stage box origin (an omitted origin is the 0 the crop contract means) |  |
| 28 | `compile.ts:3337-3338` | stage `width`, `height` | neutral | the stage box |  |
| 29 | `compile.ts:3340` | `fps` | Spine-shape | the editor dopesheet rate: header bookkeeping nothing poses from |  |
| 30 | `compile.ts:3341` | `referenceScale` | neutral | physics reads it (`SkeletonJson` scales it into `SkeletonData.referenceScale`) |  |
| 31 | `compile.ts:3343` | `images` | Spine-shape | header bookkeeping: an images path spelled relative with a trailing slash |  |
| 32 | `compile.ts:3344` | `audio` | Spine-shape | header bookkeeping |  |
| 33 | `compile.ts:2542` | bone appended in declaration order | neutral | the bone list, parents first |  |
| 34 | `compile.ts:3465` | `name` | neutral | bone identity |  |
| 35 | `compile.ts:3466` | `parent` | neutral | hierarchy |  |
| 36 | `compile.ts:3467` | `length` | neutral | bone length | f32 |
| 37 | `compile.ts:3476-3477` | `x`, `y` of a root placed from the manifest | neutral | setup transform | f32 |
| 38 | `compile.ts:3482-3483` | `x`, `y` placed from the manifest, parent-local | neutral | setup transform | f32 |
| 39 | `compile.ts:3486-3487` | `x`, `y` as stated | neutral | setup transform | f32 |
| 40 | `compile.ts:3491` | `rotation` | neutral | setup transform | f32 |
| 41 | `compile.ts:3492-3495` | `scaleX`, `scaleY`, `shearX`, `shearY` | neutral | setup transform | f32 |
| 42 | `compile.ts:3496` | `inherit` | Spine-shape | the 4.2/4.3 spelling; 4.0/4.1 wrote `transform` and 4.3 loads that silently as Normal (`A02`) |  |
| 43 | `compile.ts:3497` | `skin` | neutral | skin-required flag |  |
| 44 | `compile.ts:3498` | `color` | Spine-shape | editor affordance; nothing poses from it |  |
| 45 | `compile.ts:3499` | `icon` | Spine-shape | editor affordance in the editor's icon vocabulary |  |
| 46 | `compile.ts:2706` | `name`, `bone` | neutral | slot identity and its bone |  |
| 47 | `compile.ts:2707` | `attachment`, omitted when null | Spine-shape | the null setup attachment is spelled by absence, the 4.3 parser default |  |
| 48 | `compile.ts:2708` | `color` from the motion setup | neutral | slot tint | hex |
| 49 | `compile.ts:2709` | `color` from the rig | neutral | slot tint, as stated |  |
| 50 | `compile.ts:2710` | `dark` | neutral | two-colour tint |  |
| 51 | `compile.ts:2711` | `blend` | neutral | blend mode |  |
| 52 | `compile.ts:2712` | slot appended | neutral | the slot array IS the draw order |  |
| 53 | `compile.ts:2600` | the `default` skin, exactly when the spec has one | neutral | a skin the spec states (#801) |  |
| 54 | `compile.ts:2604` | every declared skin | neutral | skins the spec states |  |
| 55 | `compile.ts:2729` | every state of a manifest mesh slot: the same geometry | neutral | mesh geometry |  |
| 56 | `compile.ts:2732` | a manifest state as a region | neutral | attachment placement |  |
| 57 | `compile.ts:2747` | manifest parts filed under `default` | Spine-shape | a manifest has no skins; filing its parts under the format's default skin is 4.3's convention |  |
| 58 | `compile.ts:2775` | a rig-skin attachment under its placeholder | neutral | attachment placement |  |
| 59 | `compile.ts:2777` | a slot's attachments into its skin | neutral | attachment placement |  |
| 60 | `compile.ts:3626` | `name` on an attachment, first | neutral | the attachment's stated name |  |
| 61 | `compile.ts:3374` | skins array order | Spine-shape | `default` first, the rest in the editor's comparator (#541) |  |
| 62 | `compile.ts:3378` | skin `name` | neutral | skin identity |  |
| 63 | `compile.ts:3379` | skin `bones` | neutral | skin members |  |
| 64 | `compile.ts:3380` | skin `ik`/`transform`/`path`/`physics`/`slider` lists | neutral | skin members |  |
| 65 | `compile.ts:3386` | a skin's slot keys | Spine-shape | keyed in the editor's comparator |  |
| 66 | `compile.ts:3361-3363` | `skeleton`, `bones`, `slots` placed | neutral | the three collections |  |
| 67 | `compile.ts:3393` | `events` only when non-empty, between skins and animations | Spine-shape | position and omission are the editor's layout |  |
| 68 | `compile.ts:3400` | `animations` key order | Spine-shape | the editor's comparator, because a slider's animation is an ordinal in the binary half (#535, #543) |  |
| 69 | `compile.ts:3402` | `constraints` only when non-empty | Spine-shape | 4.3's one typed array; the 4.1 per-type arrays load and vanish (`A01`) |  |
| 70 | `compile.ts:3423` | the two whole-object passes | Spine-shape | parser defaults dropped, then every kinded object put in the editor key order |  |
| 71 | `compile.ts:3427` | `skeletonText` | Spine-shape | two-space JSON and a trailing newline |  |
| 72 | `keyorder.ts:251-252` | keys deleted and re-inserted in row order | Spine-shape | key order |  |
| 73 | `keyorder.ts:545` | keys the 4.3 parser reads back unchanged, deleted | Spine-shape | omission of parser defaults |  |
| 74 | `compile.ts:3351` | event `int` | neutral | event payload |  |
| 75 | `compile.ts:3352` | event `float` | neutral | event payload | f32 |
| 76 | `compile.ts:3353` | event `string` | neutral | event payload |  |
| 77 | `compile.ts:3354` | event `audio` | neutral | the event's own audio path payload |  |
| 78 | `compile.ts:3355-3356` | event `volume`, `balance` | neutral | event payload | f32 |
| 79 | `compile.ts:3357` | event definition placed | neutral | in the order the rig declares |  |
| 80 | `compile.ts:2893` | rig constraint appended | neutral | constraint list in declaration order |  |
| 81 | `compile.ts:2899` | ik flags that differ from the per-key default, remembered for the keys | Spine-shape | exists only because the 4.3 parser reads each key flag from its own default rather than from the constraint (#273) |  |
| 82 | `compile.ts:2920` | physics (motion table) `name` | neutral | constraint identity |  |
| 83 | `compile.ts:2921` | physics `type` | Spine-shape | 4.3's `constraints[]` discriminator |  |
| 84 | `compile.ts:2922` | physics `bone` | neutral | constraint target |  |
| 85 | `compile.ts:2927` | a component at 0 left out | Spine-shape | omission at the parser's 0 (a second copy of `PARSER_DEFAULTS['physics constraint']`) |  |
| 86 | `compile.ts:2928` | physics component | neutral | constraint parameter | f32 |
| 87 | `compile.ts:2940` | a parameter at its default left out | Spine-shape | omission at the parser default (`PHYSICS_PARAMS` restates `PARSER_DEFAULTS`' row) |  |
| 88 | `compile.ts:2941` | physics parameter | neutral | constraint parameter | f32 |
| 89 | `compile.ts:2943` | motion physics appended after the rig constraints | neutral | constraint list |  |
| 90 | `compile.ts:6312` | constraint `name` | neutral | constraint identity |  |
| 91 | `compile.ts:6312` | constraint `type` | Spine-shape | 4.3's `constraints[]` discriminator |  |
| 92 | `compile.ts:6316` | every copied field (`copy`) | neutral | constraint parameters as stated | f32 |
| 93 | `compile.ts:6328` | ik `bones` | neutral | constrained bones |  |
| 94 | `compile.ts:6329` | ik `target` | neutral | target bone |  |
| 95 | `compile.ts:6334` | ik `scaleY` mode | neutral | a mode, as stated |  |
| 96 | `compile.ts:6339` | transform `bones` | neutral | constrained bones |  |
| 97 | `compile.ts:6340` | transform `source` | Spine-shape | 4.3 spelling: `source` + `properties` replaced the 4.2 `target` + mix fields |  |
| 98 | `compile.ts:6355` | transform `properties` map | Spine-shape | the 4.3 `properties`/`to` map, passed through in that spelling |  |
| 99 | `compile.ts:6378` | path `bones` | neutral | constrained bones |  |
| 100 | `compile.ts:6397` | path `slot` | neutral | the slot carrying the path |  |
| 101 | `compile.ts:6403` | path position/spacing/rotate modes | neutral | modes, as stated |  |
| 102 | `compile.ts:6406` | path rotation/position/spacing/mixes | neutral | constraint parameters | f32 |
| 103 | `compile.ts:6430` | slider `animation` | neutral | the animation it drives, by name |  |
| 104 | `compile.ts:6432` | slider `additive`, `loop` | neutral | constraint parameters |  |
| 105 | `compile.ts:6434` | slider `mix` | neutral | constraint parameter | f32 |
| 106 | `compile.ts:6442` | slider `bone` | neutral | driving bone |  |
| 107 | `compile.ts:6450` | slider `property` | neutral | driving property |  |
| 108 | `compile.ts:6452` | slider `from`, `to`, `scale`, `max` | neutral | constraint parameters | f32 |
| 109 | `compile.ts:6454` | slider `local` | neutral | constraint parameter |  |
| 110 | `compile.ts:6789` | slider `time` | neutral | constraint parameter | f32 |
| 111 | `compile.ts:6804` | physics (rig) `bone` | neutral | constraint target |  |
| 112 | `compile.ts:6807` | physics `scaleY` mode | neutral | a mode, as stated |  |
| 113 | `compile.ts:4013` | bounding box `type` | Spine-shape | 4.3's attachment discriminator |  |
| 114 | `compile.ts:4014-4015` | bounding box `vertexCount`, `vertices` | neutral | polygon geometry | f32 |
| 115 | `compile.ts:4017` | bounding box `color` | Spine-shape | editor display colour |  |
| 116 | `compile.ts:4042` | clipping `type` | Spine-shape | 4.3's attachment discriminator |  |
| 117 | `compile.ts:4043-4045` | clipping `end`, `convex`, `inverse` | neutral | clip parameters |  |
| 118 | `compile.ts:4046-4047` | clipping `vertexCount`, `vertices` | neutral | polygon geometry | f32 |
| 119 | `compile.ts:4049` | clipping `color` | Spine-shape | editor display colour |  |
| 120 | `compile.ts:4633` | weighted run: bone-count prefix (named weights) | Spine-shape | 4.3's weighted-vertex encoding |  |
| 121 | `compile.ts:4641` | weighted run: bone INDEX into the emitted bone array | Spine-shape | 4.3's index encoding of a binding that the spec states by name |  |
| 122 | `compile.ts:4641` | weighted run: bind x, y and weight | neutral | mesh weights | f32 |
| 123 | `compile.ts:4280` | path `type` | Spine-shape | 4.3's attachment discriminator |  |
| 124 | `compile.ts:4281-4282` | path `closed`, `constantSpeed` | neutral | path parameters |  |
| 125 | `compile.ts:4283-4284` | path `vertexCount`, `vertices` | neutral | path geometry | f32 |
| 126 | `compile.ts:4285` | path `lengths` | neutral | curve lengths, stated or measured off the setup pose | f32 |
| 127 | `compile.ts:4286` | path `color` | Spine-shape | editor display colour |  |
| 128 | `compile.ts:4436` | `path` of a mesh or linked mesh texture | Spine-shape | a region reference, written only where it differs from the attachment's name (the parser's fallback) |  |
| 129 | `compile.ts:4437` | mesh tint `color` | neutral | tint |  |
| 130 | `compile.ts:4460` | sequence `count` | neutral | frame count |  |
| 131 | `compile.ts:4461-4462` | sequence `start`, `digits` | Spine-shape | they spell the frame regions' names, `<stem><start + i>` zero-padded |  |
| 132 | `compile.ts:4463` | sequence `setup` | neutral | setup frame |  |
| 133 | `compile.ts:4551` | sequence region `width`, `height` | neutral | drawing size | f32 |
| 134 | `compile.ts:4552` | sequence region `path` | Spine-shape | a region-name reference |  |
| 135 | `compile.ts:4553-4557` | sequence region `x`, `y`, `rotation`, `scaleX`, `scaleY` | neutral | attachment transform | f32 |
| 136 | `compile.ts:4558` | sequence region tint | neutral | tint |  |
| 137 | `compile.ts:4559` | sequence block placed | neutral | the series |  |
| 138 | `compile.ts:4601` | region `width`, `height` | neutral | drawing size | f32 |
| 139 | `compile.ts:4603` | region `path` | Spine-shape | a region reference, written only where it differs from the attachment's name |  |
| 140 | `compile.ts:4604-4608` | region `x`, `y`, `rotation`, `scaleX`, `scaleY` | neutral | attachment transform | f32 |
| 141 | `compile.ts:4609` | region tint | neutral | tint |  |
| 142 | `compile.ts:4862` | authored mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 143 | `compile.ts:4864-4868` | authored mesh `uvs`, `triangles`, `vertices`, `hull`, `edges` | neutral | mesh geometry | f32 |
| 144 | `compile.ts:4869-4870` | authored mesh `width`, `height` | neutral | drawing size | f32 |
| 145 | `compile.ts:4872` | authored mesh sequence | neutral | the series |  |
| 146 | `compile.ts:4977` | linked mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 147 | `compile.ts:4977` | linked mesh `source`, `width`, `height` | neutral | the source mesh, drawing size | f32 |
| 148 | `compile.ts:4979` | linked mesh `path` | Spine-shape | a region reference, written only where it differs from the name |  |
| 149 | `compile.ts:4983` | linked mesh `slot`, left out when it is its own | Spine-shape | omission at the parser's fallback |  |
| 150 | `compile.ts:4984` | linked mesh `skin`, left out when `default` | Spine-shape | omission at the parser's fallback |  |
| 151 | `compile.ts:4985` | linked mesh `timelines`, written only when false | Spine-shape | omission at the parser's `true` |  |
| 152 | `compile.ts:4986` | linked mesh tint | neutral | tint |  |
| 153 | `compile.ts:4987` | linked mesh sequence | neutral | the series |  |
| 154 | `compile.ts:5160` | ring/ribbon mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 155 | `compile.ts:5162-5165` | ring/ribbon `uvs`, `triangles`, `vertices`, `hull`+`edges` | neutral | mesh geometry | f32 |
| 156 | `compile.ts:5166-5167` | ring/ribbon `width`, `height` | neutral | drawing size | f32 |
| 157 | `compile.ts:5725` | grid mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 158 | `compile.ts:5727-5730` | grid `uvs`, `triangles`, `vertices`, `hull`+`edges` | neutral | mesh geometry | f32 |
| 159 | `compile.ts:5731-5732` | grid `width`, `height` | neutral | drawing size | f32 |
| 160 | `compile.ts:6055` | segments mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 161 | `compile.ts:6057-6060` | segments `uvs`, `triangles`, `vertices`, `hull`+`edges` | neutral | mesh geometry | f32 |
| 162 | `compile.ts:6061-6062` | segments `width`, `height` | neutral | drawing size | f32 |
| 163 | `compile.ts:6221` | contour mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 164 | `compile.ts:6223-6226` | contour `uvs`, `triangles`, `vertices`, `hull`+`edges` | neutral | mesh geometry | f32 |
| 165 | `compile.ts:6227-6228` | contour `width`, `height` | neutral | drawing size | f32 |
| 166 | `compile.ts:6981` | manifest region `width`, `height` | neutral | drawing size |  |
| 167 | `compile.ts:6983,6984,6986` | manifest region `x`, `y`, `rotation`, left out at 0 | Spine-shape | omission at the parser's 0, a second copy of the region row | f32 |
| 168 | `compile.ts:7065` | manifest ring/ribbon mesh `type` | Spine-shape | 4.3's attachment discriminator |  |
| 169 | `compile.ts:7066-7069` | manifest mesh `uvs`, `triangles`, `vertices`, `hull`+`edges` | neutral | mesh geometry | f32 |
| 170 | `compile.ts:7070-7071` | manifest mesh `width`, `height` | neutral | the part window |  |
| 171 | `mesh.ts:1599` | weighted run: bone-count prefix (generated meshes) | Spine-shape | 4.3's weighted-vertex encoding |  |
| 172 | `mesh.ts:1604` | weighted run: bone INDEX | Spine-shape | 4.3's index encoding |  |
| 173 | `mesh.ts:1604` | weighted run: bind x, y and weight | neutral | mesh weights (the weight on a 1e-6 grid) |  |
| 174 | `compile.ts:3138` | physics/path/slider timeline placed under its constraint | neutral | a timeline: target, property, keys |  |
| 175 | `compile.ts:3138` | the every-global physics timeline under the empty name | Spine-shape | the 4.3 spelling of the timeline that names no constraint (#726) |  |
| 176 | `compile.ts:3139-3140` | bone / slot timeline placed | neutral | a timeline: target, property, keys |  |
| 177 | `compile.ts:3196` | ik / transform timeline placed | neutral | a timeline |  |
| 178 | `compile.ts:3244` | deform timeline placed skin/slot/attachment | neutral | a timeline |  |
| 179 | `compile.ts:3281` | sequence timeline placed beside deform | neutral | a timeline |  |
| 180 | `compile.ts:3310` | one entry per animation | neutral | the animation |  |
| 181 | `compile.ts:3311,3312,3313,3315,3317,3318,3319,3320,3321,3322` | timeline groups, each only when non-empty, in `readAnimation` order | Spine-shape | the format's grouping and its omission of empty groups |  |
| 182 | `compile.ts:1082-1083` | `rgba` / `rgb` key's `color` | neutral | the colour, on the 8-bit channel grid | hex |
| 183 | `compile.ts:1084` | `alpha` key's `value` | neutral | the alpha | f32 |
| 184 | `compile.ts:1085` | `rgba2` key's `light`, `dark` | neutral | two-colour tint | hex |
| 185 | `compile.ts:1089` | `rgb2` key's `light`, `dark` | neutral | two-colour tint | hex |
| 186 | `compile.ts:1517` | a named easing over a hold written as `stepped` | Spine-shape | the editor's encoding of a hold (#369): both pose the same |  |
| 187 | `compile.ts:7164` | `inherit` key | Spine-shape | the 4.3 spelling of the inherit timeline key (`A02`) |  |
| 188 | `compile.ts:7172` | a key with no value channel (`reset`) | neutral | key time |  |
| 189 | `compile.ts:7178` | value key `time` | neutral | key time | f32 |
| 190 | `compile.ts:7199` | value key channels | neutral | key values | f32 |
| 191 | `compile.ts:7206,7209,7215` | value key `curve` | neutral | the curve | f32 |
| 192 | `compile.ts:7220` | value key appended | neutral | keys in time order |  |
| 193 | `compile.ts:7281` | draw-order key with no offsets | neutral | a key restoring the setup order | f32 |
| 194 | `compile.ts:7307` | draw-order offsets sorted by setup index | Spine-shape | the order the 4.3 reader walks the offsets in |  |
| 195 | `compile.ts:7308` | draw-order key `time`, `offsets` | neutral | the permutation, as stated | f32 |
| 196 | `compile.ts:7370` | event key `time`, `name` | neutral | event firing | f32 |
| 197 | `compile.ts:7375,7381,7387,7399` | event key `int`, `float`, `string`, `volume`/`balance` | neutral | event payload | f32 |
| 198 | `compile.ts:7401` | event key appended | neutral | keys in time order |  |
| 199 | `compile.ts:7518` | ik/transform key `time` | neutral | key time | f32 |
| 200 | `compile.ts:7533` | ik/transform key channels | neutral | key values | f32 |
| 201 | `compile.ts:7543` | the rig's ik flag restated on every key that omits it | Spine-shape | compensates the 4.3 parser reading a key flag from its own default (#273) |  |
| 202 | `compile.ts:7549` | ik key flag as stated | neutral | key value |  |
| 203 | `compile.ts:7557,7560,7565` | ik/transform key `curve` | neutral | the curve | f32 |
| 204 | `compile.ts:7576` | ik/transform key appended | neutral | keys in time order |  |
| 205 | `compile.ts:7939` | sequence key `time` | neutral | key time | f32 |
| 206 | `compile.ts:7940-7942` | sequence key `mode`, `index`, `delay` | neutral | key values | f32 |
| 207 | `compile.ts:7943` | sequence key appended | neutral | keys in time order |  |
| 208 | `compile.ts:8055` | deform key from a `transform` model | neutral | the displacement run | f32 |
| 209 | `compile.ts:8075` | deform key with a null run | neutral | a key returning to setup | f32 |
| 210 | `compile.ts:8123` | deform key `time` | neutral | key time | f32 |
| 211 | `compile.ts:8127` | deform `offset`, left out at 0 | Spine-shape | omission at the parser's 0, a second copy of the deform row |  |
| 212 | `compile.ts:8128` | deform `vertices` | neutral | the displacement run | f32 |
| 213 | `compile.ts:8129` | deform key appended | neutral | keys in time order |  |
| 214 | `compile.ts:8265,8271,8278` | deform key `curve` | neutral | the curve | f32 |
| 215 | `compile.ts:8702` | attachment key `time`, `name` | neutral | attachment swap | f32 |
| 216 | `compile.ts:8733` | colour key `time` + channels | neutral | key time and colour | f32 |
| 217 | `compile.ts:8739,8745,8762` | colour key `curve` | neutral | the curve | f32 |
| 218 | `compile.ts:8740,8767` | colour key appended | neutral | keys in time order |  |

### 1.4 Where the compiler reads its own Spine-shaped output

Not writes, and not in the totals — but each is a place where a later stage of
`compile` takes a value **off the Spine object** rather than off anything neutral, so
each is a place step 1 has to give a model-side source to.

| # | site | reads | off the Spine shape because |
| --- | --- | --- | --- |
| 1 | `compile.ts:2547` | `computeWorldTransforms(bones)` | world transforms are computed from the emitted `SpineBone`s, f32 values and `inherit` string included |
| 2 | `compile.ts:3479` | the same, per bone, over the bones built so far | a child's local position is solved against its parent's emitted values |
| 3 | `compile.ts:2783` | `resolveLinkedMeshes` over the skin tables | a link's source is found by JSON key and checked by `type` |
| 4 | `compile.ts:2877` | the slots that can show a path | read off the emitted skins' `type === 'path'` |
| 5 | `compile.ts:2977` | what an attachment key may name | the union of the emitted skins' placeholders |
| 6 | `compile.ts:2994` | which slots may take `rgba2`/`rgb2` | the emitted slots' `dark` |
| 7 | `compile.ts:3039` | the every-global physics target | the emitted constraints' `type` and `<property>Global` |
| 8 | `compile.ts:3238` | `deformGeometryOf(attachment)` | decodes the emitted weighted run, bone counts and indexes (`:7665`-`:7826`) |
| 9 | `compile.ts:3275` | `compileSequenceTrack` | reads the emitted `sequence`, `type`, `timelines`, `source` |
| 10 | `compile.ts:3284` | `compileDrawOrder(…, slots)` | an offset is checked against the emitted slot index |
| 11 | `compile.ts:3405` | every slot's bone exists | off the emitted slots |
| 12 | `compile.ts:3439` | `buildRigInfo(rig, bones, …)` | the axis subtree is walked over the emitted bones' `parent` |
| 13 | `compile.ts:3996` | raw weighted run → `meshBones` | bone INDEX into the emitted bone array |
| 14 | `compile.ts:4263` | `setupWorldVertices` | decodes the emitted run to measure path lengths |
| 15 | `compile.ts:4635` | named weights → index | position in the emitted bone array |
| 16 | `compile.ts:4804` | an authored mesh's vertex count | the Spine `uvs` length |
| 17 | `compile.ts:4837` | raw weighted run → bound bones | bone INDEX |
| 18 | `compile.ts:5100` | ring/ribbon bone refs | bone INDEX |
| 19 | `compile.ts:5404` | `meshBoneRef` | bone INDEX |
| 20 | `compile.ts:5672` | grid anchor | bone INDEX |
| 21 | `compile.ts:5896`, `:5913` | segments: parents and lengths | off the emitted bones |
| 22 | `compile.ts:6170` | contour anchor | bone INDEX |
| 23 | `compile.ts:7012` | manifest mesh bone refs | bone INDEX |
| 24 | `compile.ts:8496` | derived group values | the emitted bones' `x`, `y`, `parent` |

Rows 13–23 are one fact eleven times: **a weighted vertex names its bone by position in
the emitted bone array**, so the geometry is encoded against the output while it is
built. The by-name form exists only on the way in (`RigMeshBinding`, and a generated
mesh's `anchor`/`control` references) and is not kept.

---

## 2. The model's fields

A draft, built only from values `compile` computes today; every field names the value it
is. It is a reading aid for step 1, not an interface anybody implements. Line numbers are
`compile.ts`'s unless another file is named.

```ts
/** Already on the float32 grid: `f32` (:843) or, for a key time, `keyTime` (:979). See §4. */
type F32 = number;

interface CompiledModel {
  /** `header.x/y/width/height` (:3335-3338); null exactly when `noStage` (:2117). */
  stage: { x: F32; y: F32; width: F32; height: F32 } | null;
  /** `rig.skeleton.referenceScale` (:3341); physics reads it. */
  referenceScale?: number;
  // Added after this census by issue #958: `CompiledModel.referenceScale` is required,
  // the stated number or the parser's 100, and the document writes it after `spec`;
  // the emitter takes it from the model, not from the header it is handed.
  /** Header bookkeeping: `rig.skeleton.fps` (:3340), `imagesPath` (:3342), `rig.skeleton.audio` (:3344). */
  bookkeeping: { fps?: number; images?: string; audio?: string | null };

  /** `bones` (:2540), each `buildBone` (:3464-3501), parents first. */
  bones: Array<{
    name: string;
    parent?: string;
    length?: F32;
    /** `cropPointOf` then `toBoneLocal` (:3469-3484), or the spec's own (:3486-3487). */
    x?: F32;
    y?: F32;
    /** `rotationOf` (:3548). */
    rotation?: F32;
    scaleX?: F32;
    scaleY?: F32;
    shearX?: F32;
    shearY?: F32;
    /** The MODE, as the spec states it (:3496). What key spells it is the emitter's. */
    inherit?: string;
    /** `skin` (:3497). */
    skinRequired?: boolean;
    /** `color`, `icon` (:3498-3499): editor affordances. */
    editor?: { color?: string; icon?: string };
  }>;
  /** `transforms` (:2547): the setup world matrix per bone. Computed, never emitted. */
  setupWorld: Map<string, BoneTransform>;

  /** `slots` (:2566), in draw order (:2706-2712). */
  slots: Array<{
    name: string;
    bone: string;
    /** `setupAttachment` (:2642); null is "shows nothing". */
    setup: string | null;
    /** `rgbaHex(setup.color)` (:2708) or the rig's (:2709): 8-bit channels. */
    color?: string;
    dark?: string;
    blend?: string;
  }>;

  /**
   * `skinTables` (:2567) in the order the spec declares them — NOT `editorSkinOrder`'s,
   * which is the emitter's (:3374) — with each skin's members from `skinParts` (:2452).
   */
  skins: Array<{
    name: string;
    bones: string[];
    constraints: Record<'ik' | 'transform' | 'path' | 'physics' | 'slider', string[]>;
    /** slot -> placeholder -> attachment, in the spec's order (the emitter sorts, :3386). */
    attachments: Map<string, Map<string, CompiledAttachment>>;
  }>;

  /**
   * `constraints` (:2818): `buildRigConstraint` (:6279) for the rig's, then the motion
   * spec's physics table (:2919-2942). Today's fields, minus `type`, which becomes `kind`.
   */
  constraints: Array<{ kind: 'ik' | 'transform' | 'path' | 'physics' | 'slider'; name: string } & Record<string, unknown>>;

  /** `events` (:3348-3357), in the rig's declared order. */
  events: Map<string, { int?: number; float?: F32; string?: string; audio?: string; volume?: F32; balance?: F32 }>;

  /** `animations` (:2986) in the motion spec's order — NOT `editorAnimationOrder`'s (:3400). */
  animations: Map<string, CompiledAnimation>;

  // --- carried as `CompileResult` carries them today (types.ts:1552), unchanged ---
  images: CompiledImage[];
  pageGrids: CompileResult['pageGrids'];
  droppedStates: DroppedState[];
  absentParts: CompileResult['absentParts'];
  meshBones: string[];
  meshes: CompileResult['meshes'];
  physics: CompileResult['physics'];
  deformTransforms: CompileResult['deformTransforms'];
  trackDerivations: CompileResult['trackDerivations'];
  rig: RigInfo;
}

/** The region an attachment draws: `path` where stated or measured, else its name, else its placeholder. */
type RegionName = string;

type CompiledAttachment =
  /** `buildRigRegion` (:4543), `placeRegion` (:6972). */
  | { kind: 'region'; name?: string; region: RegionName; x?: F32; y?: F32; rotation?: F32; scaleX?: F32; scaleY?: F32;
      width: F32; height: F32; color?: string; sequence?: CompiledSequence }
  /** `buildRigMesh` (:4784), `buildGeneratedMesh` (:5084) and its three generators, `buildMesh` (:6998). */
  | { kind: 'mesh'; name?: string; region: RegionName; color?: string; uvs: F32[]; triangles: number[];
      /** The 4.3 weighted run, bone INDEX-encoded (:4627, mesh.ts:1589) — the only form kept. */
      vertices: F32[];
      hull: number; edges: number[]; width: F32; height: F32; sequence?: CompiledSequence }
  /** `buildRigLinkedMesh` (:4920); `slot`/`skin`/`timelines` as `PendingLink` holds them in full (:4958). */
  | { kind: 'linkedmesh'; name?: string; region: RegionName; source: string; slot: string; skin: string; timelines: boolean;
      width: F32; height: F32; color?: string; sequence?: CompiledSequence }
  /** `buildRigBoundingBox` (:4007), `buildRigClipping` (:4021), `buildRigPath` (:4238). */
  | { kind: 'boundingbox'; name?: string; vertexCount: number; vertices: F32[]; editorColor?: string }
  | { kind: 'clipping'; name?: string; end?: string; convex?: boolean; inverse?: boolean; vertexCount: number; vertices: F32[];
      editorColor?: string }
  | { kind: 'path'; name?: string; closed?: boolean; constantSpeed?: boolean; vertexCount: number; vertices: F32[];
      lengths: F32[]; editorColor?: string };

/** `emitSequence` (:4459); `frames` is `sequenceFrameRegion` (:4453) for each i, which the gather step computes (:2252). */
interface CompiledSequence { count: number; start?: number; digits?: number; setup?: number; frames: RegionName[] }

interface CompiledAnimation {
  /** `declaredDurations[animName]` (:2999), held to the last key (:3302). */
  duration: number;
  /** `boneTimelines` (:3001), `slotTimelines` (:3000). */
  bones: Map<string, Map<string, Key[]>>;
  slots: Map<string, Map<string, Key[]>>;
  /** `constraintTimelines` (:3151) and `familyTimelines` (:3003), per constraint kind. */
  constraints: Map<'ik' | 'transform' | 'path' | 'physics' | 'slider', Map<string, Map<string, Key[]> | Key[]>>;
  /** The physics timelines that name no constraint — filed today under the empty name (:3138). */
  everyGlobalPhysics: Map<string, Key[]>;
  /** `deformTimelines` (:3204): skin -> slot -> attachment -> deform and/or sequence keys. */
  attachments: Map<string, Map<string, Map<string, { deform?: Key[]; sequence?: Key[] }>>>;
  /** `compileDrawOrder` (:7259). */
  drawOrder?: Array<{ time: F32; offsets?: Array<{ slot: string; offset: number }> }>;
  /** `compileEvents` (:7338). */
  events?: Array<{ time: F32; name: string; int?: number; float?: F32; string?: string; volume?: F32; balance?: F32 }>;
}

/**
 * A timeline key as the compilers build it (:7123, :7451, :7897, :7948, :8622): `time`,
 * the channels its timeline defines, and `curve` as `easingCurve` (:1509) or `rawCurve`
 * (:7098) returns it — absolute control points per channel, or `'stepped'`, which
 * includes a named easing over a hold (:1517, Spine-shape: see §3).
 */
type Key = { time: F32; curve?: F32[] | 'stepped' } & Record<string, unknown>;
```

### 2.1 Fields the model would want and nothing computes today

- **A weighted vertex's bones by name.** Every mesh's bindings are encoded to bone
  indexes as they are built (§1.4 rows 13–23), and the named form is dropped. A model
  that is to outlive a bone insertion has to keep it; today it is re-derivable only by
  decoding the run against `bones`, which is what `deformGeometryOf` does.
- **A curve as its easing.** Only the absolute control points reach the result; the
  easing's name and handles stay in the motion spec.
- **A draw-order key as a permutation.** Only the offsets exist, sorted by setup index
  (`:7307`).
- **Setup world vertices per attachment.** Computed transiently, for weighted deform
  targets (`deformGeometryOf`) and path lengths (`setupWorldVertices`), and not kept.
- **An ik key's effective flags.** The rig's flags are restated onto keys (`:7543`)
  because the 4.3 parser does not inherit them; the model has the constraint's flags
  and the key's own, and nothing holds the flag *in effect*.
- **Region placement on a page for a loose part.** Implicit (the part is its page);
  only an `--atlas-in` part carries `CompiledImage.atlas`. Closed by #935 for what the
  pose reads: every region record and sequence frame carries its rectangle's size, trim
  and original size (`ModelAtlasRect`), image or none; the page and `x`/`y` stay the
  atlas's, since `--pack` moves them after the model is written.

---

## 3. What a byte-identical emitter must own

Step 1's gate is byte identity: every build in every corpus emits the same bytes before
and after. Everything below is **not model content**, and the emitter has to reproduce
each item exactly. Each names the line that does it today.

**Header**

- `spine` is `SPINE_VERSION`, the linked runtime's version (`compile.ts:169`, `:3333`).
- The stage is four fields or none, `x, y, width, height` in that order (`:3334`-`:3338`).
- `images` spelled by `skeletonImagesPath`/`relativeImagesPath` — relative to `--out`,
  `./` prefix, trailing slash, `--copy-images` pointing at `--out` itself
  (`:1656`-`:1702`); `fps` and `audio` as stated (`:3340`, `:3344`).

**Layout and order**

- Top-level keys in `EDITOR_KEY_ORDER['top level']`; `constraints` only when non-empty
  (`:3402`), `events` only when non-empty and between `skins` and `animations` (`:3393`).
- `skins`: `default` first, the rest in the editor's comparator (`editorSkinOrder`,
  `:378`); a skin's slot keys in the comparator (`editorSlotKeyOrder`, `:424`);
  `animations` keyed in the comparator (`editorAnimationOrder`, `:296`), whose pairs no
  measured round trip orders are refused (`refuseNamesTheEditorCouldKeyDifferently`,
  `:762`) — **that refusal is the emitter's**, and it is a `CompileError` today.
- Animation groups in `readAnimation` order, each only when non-empty (`:3311`-`:3322`);
  a skin entry `name`, then members, then `attachments` (`:3377`-`:3387`).
- Field order: `EDITOR_KEY_ORDER`, 32 kinds and 149 keys
  ([`keyorder.ts:91`](../src/keyorder.ts)), applied by `inEditorKeyOrder` (`:3423`).
  ⚠️ **A key its row does not list keeps the position its constructor gave it, and a
  kind with no row keeps the constructor's order whole** (`arrange`, `keyorder.ts:244`).
  So for those — a linked mesh, a path attachment, a sequence, the path and slider
  constraints, an event definition, the keys of a dozen timeline kinds, and every
  unlisted key such as a bone's `shearX` or an attachment's `name` — **the constructor's
  insertion order is the byte contract**, and a model-to-JSON emitter has to restate it.
- Draw-order offsets sorted by setup index (`:7307`).

**Omission of what the 4.3 parser supplies**

- `PARSER_DEFAULTS`, 37 kinds and 156 fields (`keyorder.ts:368`), applied by
  `withoutParserDefaults` before the key order (`:3423`).
- **And nine more omissions inline, in the constructors**, five of which restate a
  `PARSER_DEFAULTS` row (the slot's, the physics constraint's twice, the region's, the
  deform key's): a slot's null `attachment` (`:2707`), a physics component at 0
  (`:2927`) and a physics parameter at its default (`:2940`, the `PHYSICS_PARAMS` table,
  `:1428`), a region's or mesh's `path` equal to its name (`attachmentPath`, `:4403`), a
  linked mesh's own `slot`, `default` skin and `timelines: true` (`:4983`-`:4985`), a
  manifest region's `x`, `y`, `rotation` at 0 (`:6983`-`:6986`), and a deform key's
  `offset` at 0 (`:8127`).
- The rig's ik flags restated on every key that omits them (`:2899`, `:7543`, #273).

**Spellings**

- The `type` discriminator on every constraint (`:2921`, `:6312`) and every attachment
  but a region (`:4013`, `:4042`, `:4280`, `:4862`, `:4977`, `:5160`, `:5725`, `:6055`,
  `:6221`, `:7065`).
- `inherit` as the bone key and the inherit timeline's key (`:3496`, `:7164`); a
  transform constraint's `source` and `properties` (`:6340`, `:6355`); the every-global
  physics timeline under the empty name (`:3138`).
- The weighted run: bone count, then per binding the bone's INDEX (`:4633`, `:4641`,
  `mesh.ts:1599`, `:1604`).
- A sequence's frame regions `<stem><start + i>` padded to `digits` (`:4453`).
- `'stepped'` for a named easing over a hold (`easingCurve`, `:1517`, #369); and a
  Bézier as absolute control points per channel (`bezierForChannel`, `:1455`).
- A colour as lower-case two-digit hex per channel (`channelHex`, `:1019`;
  `COLOUR_KEYS`, `:1081`). ⚠️ The **8-bit rounding** in `channelHex` is value, not
  spelling — it decides the channel the runtime reads — and a hold on a colour key is
  decided by comparing the hex strings (`:8761`), so that one comparison is taken on
  the emitter's spelling.

**Text**

- `JSON.stringify(skeleton, null, 2)` and one trailing newline (`:3427`).
- The atlas: `writeAtlasText` ([`atlas.ts:591`](../src/atlas.ts)) — page name, `size`,
  `filter: Linear, Linear`, `pma: false`, per region its name, `bounds`, `offsets`,
  `rotate: 0`, one blank line between pages, none trailing, one newline, the empty file
  for no pages; `buildAtlasText`'s one page per part (`compile.ts:1721`); the
  `--atlas-in` pass-through with page names re-anchored and blank lines canonical
  (`rewritePageNames`, `atlas.ts:420`; `canonicalAtlasShape`, `atlas.ts:456`); region
  name = PNG basename (`:2171`); page name = path relative to `--out` (`:1772`,
  `:1931`).

**Not the emitter's, although the brief listed it there**: `f32` (`:843`), `keyTime`
(`:979`), the weight grid `r6` (`mesh.ts:147`) and `onModelGrid` (`:892`). They choose
the number the runtime reads (§4), later compile stages compute from their output
(`computeWorldTransforms` over f32'd bones, §1.4 row 1; the comment on `computeWorldTransforms` (`transform.ts:82`)
says one bit there can move a float32 spelling in the file), and so the model has to
carry what they return — and, added after this census by issue #942, the same two grids
bound what the model document spells: every number in it is a fixed point of `f32` or of
the six-decimal grid, the depth fold report included, and `MX01` in `selftest.ts` holds it.

---

## 4. The measurement that the classes are real

Each Spine-shape class was **made to change** on real builds and the result loaded
through `spine-core` 4.3.13, the way `render` loads a build (`posableFromText`), then
posed at 30 fps over every animation (`sampleAll`, with bones and geometry). Two
fingerprints were compared against the untouched build: `SkeletonData` whole (with the
process-global `id` counters and the ids derived from them left out, which a second
load of the *same* text changes), and every sampled pose.

The population is **19 builds**: the twelve editor exports under `examples/` through
`ingest` then `build` (all twelve built green), and the seven `gallery/` rigs built from
their own specs. The instrument was a scratch script and is not in the tree.

| rewrite of every build | builds it touched | edits | SkeletonData and pose unchanged | SkeletonData differs, pose unchanged | pose moves: builds (largest max-abs) | load refused | builds with nothing to touch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| reverse every kinded object field order | 19 | 9921 | 19 | 0 | 0 | 0 | 0 |
| restate every constant parser default | 19 | 9439 | 19 | 0 | 0 | 0 | 0 |
| spell every fraction as the full double of its float32 | 19 | 59242 | 0 | 0 | 19 (8.22e-3) | 0 | 0 |
| header spine version 4.3.13 -> 4.3.99 | 19 | 19 | 0 | 19 | 0 | 0 | 0 |
| bone inherit -> transform (the 4.1 spelling, A02) | 5 | 20 | 0 | 0 | 5 (3.58e+2) | 0 | 14 |
| constraints[] -> per-type top-level arrays (the 4.1 shape, A01) | 7 | 52 | 0 | 0 | 3 (2.60e+2) | 4 | 12 |
| every colour hex spelled upper case | 13 | 264 | 13 | 0 | 0 | 0 | 6 |
| control: first non-root bone x += 1 (a neutral value) | 19 | 19 | 0 | 0 | 19 (3.59e+2) | 0 | 0 |
| atlas+skeleton: the first region renamed on both sides | 19 | 19 | 0 | 19 | 0 | 0 | 0 |
| atlas: extra blank line between two pages | 19 | 19 | 19 | 0 | 0 | 0 | 0 |

Read by row:

- **Key order, restated defaults, colour case, atlas blank lines** leave `SkeletonData`
  itself identical on every build that carries them: the bytes are the emitter's alone.
- **The version string and a region renamed on both sides** change `SkeletonData`
  (`version`, a region path) and no pose: bookkeeping and a join key.
- **`inherit` → `transform`** and **`constraints[]` → per-type arrays** are the two 4.3
  spellings that have a generation history (`A02`, `A01`), and 4.3 misreads the older
  spelling: poses move by up to 358 on the five builds with a bone `inherit`, and the
  seven builds with constraints either move (3) or refuse to load (4, `IK Constraint not
  found`, `Transform constraint not found`, `Path constraint not found`). Fourteen builds
  carry no `inherit` and twelve no constraint, so those rewrites had nothing to touch
  there — a HOLE on those rows, not a pass.
- **Fractions spelled as the full double of the same float32** move the pose on 19 of
  19 builds, by up to `8.22e-3` and never less than `1.70e-5` — both above the six
  decimals #380's pose gate compares at. This is the row that moved `f32` from
  "formatting" into the model.
- **The control** — one neutral value changed — moves the pose on 19 of 19, so the
  instrument sees a one-unit change wherever one is made.

---

## 5. What this does not settle

- **The two `open` rows** (`filter: Linear, Linear`, `pma: false`, `atlas.ts:598`-`:599`)
  are policy constants no input states. Whether a model carries them — a sampling hint
  and an alpha convention any backend needs — or the atlas emitter keeps them as
  constants is a step-1 decision; nothing here can measure it.
- **Step 1's shape.** §1.4 and the finding's second point are where the design stops
  being derivable from this census: a model that is *constructed* first means every
  row of §1.4 needs a model-side source, and the weighted-run encoding (§1.4 rows
  13–23) needs a by-name form nothing keeps today.
- **Emission after `compile` returns.** `build --pack` repacks the parts
  (`packAtlas`, called from `cli.ts`) and `--copy-images` rewrites the page names
  (`copyAtlasPages`, `src/emit.ts`). Both write atlas text outside `compile` and outside
  this census; step 1's byte-identity gate still covers them, because it compares what
  lands on disk.
- **Estimates.** #380 carries "5–8k lines" for a core and "1–2 squad-days" for the
  split, unmeasured. This page gives counts, not days.

## 6. What the document costs a build (issue #926)

Measured 2026-09-30 at `11e6b36` on an Apple M4 laptop (bun 1.3.11), wall clock, in one process, phase by phase, two runs each, the machine shared with other work: over the 19 tree recipes (`emit_hashes recipes`), spelling `skeleton.model.json` twice (the build's and `A18`'s second compile's) and writing it took **4.1 % and 4.2 %** of the build's in-process time, the rest being the two compiles (82 %) and `validate` (14 %); on a synthetic 901-bone rig with 450 physics constraints whose document is 20.8 MB, **5.3 % and 5.8 %**. Of the spelling itself, `JSON.stringify(doc, null, 2)` is a third (6.9 of 18.2 ms over the 19 rows); a one-line spelling stringifies in 4.7 ms instead and writes files 3.3 times smaller (the synthetic's 20.8 MB as 6.3 MB), which is 0.5 % of those builds' time for the two spellings together. Against the pre-model release 1.5.1 (whose Spine files are byte-identical on all 19 rows), the whole CLI build over the 19 rows took 1.05 and 1.11 times as long. So the document stays as it is spelled; the per-phase table is in the pull request for #926. On the private corpus of 14 production rigs, re-measured the same day on the same machine while two other builds ran: `emit_hashes run` over the 14 recipes took 13.3 s wall clock (the card's 70.0 s was not reproduced), the document's share of the in-process build time was 5.7 % (3.2 % to 6.8 % per rig), and the largest document was 11.9 MB (2.8 MB compact).

## 7. The Spine file the document was written beside (issue #968)

The document ends with one section that is not the model's: `"spine": { "sha256": "<64 lowercase hex>" }`, the SHA-256 of the exact bytes `build` writes to `skeleton.json` in the same run (`spineFileSha256` in `src/model.ts`). `readModel` refuses a document without it, with any other field in it, or with a value that is not 64 lowercase hex digits, each by path.

It exists because `rigc render` poses a rigc build through rigc's own core, from this document, when it finds the document beside the skeleton, and nothing else tied the two files. A `skeleton.json` edited after the build and left beside the document it was built with was drawn from the document: the build's rig, not the file the render was pointed at. The selftest's `RF89`, `RF91` and `RF93` plants edit the Spine file alone, and read exit 0 where the file itself is refused. The render now takes the core only when the file beside the document hashes to this value, and otherwise poses through spine-core, naming both digests on its `poser` line. `--poser core` on such a pair exits 2.

The value is deterministic wherever the Spine file is, since `A18` holds the file byte for byte across two compiles. The Spine bytes themselves are unchanged by it: `tools/emit_hashes.base.json` holds `skeleton.json` and `skeleton.atlas` only and stays current. The atlas is not digested. The core reads the page layout from the atlas beside the document, the same file spine-core reads, but the region trims it poses corners from are the model's own `atlas` rectangles.

## 8. Where each region sits on its page (issue #1016)

Measured 2026-10-01 at `0984c47` of `main` and built on top of it; §7's last sentence ("the core reads the page layout from the atlas beside the document") describes that commit and is superseded here rather than rewritten.

**What the draw read from the atlas.** Per drawn region, mesh or linked mesh, `src/core/uvs.ts` and `src/render_core.ts` took, for the first region of the name the record draws (its `path`, else its name; a series' frame name per frame): the page's name and `size`; the region's `x`, `y`, `width`, `height`, `offsetX`, `offsetY`, `originalWidth`, `originalHeight` and `degrees`; and, for texture substitution's key, its `index:`. Nothing else: no `filter`, `pma`, `format`, `repeat` or `scale:`. On the 19 tree recipes that is 273 drawn names over 137 pages, 3 of them turned, none trimmed.

**When each of those becomes final in `build`:**

| route | page name | page size | x, y, turn | trim, original size | final at |
| --- | --- | --- | --- | --- | --- |
| loose parts (default) | `compile` | `compile` | `compile` | `compile` | `compile` returns, before the gate |
| `--atlas-in` | `compile` (re-anchored) | `compile` | `compile` | `compile` | `compile` returns, before the gate |
| `--copy-images` | renamed after the gate (`copyAtlasPages`) | unchanged | unchanged | unchanged | computable from the text alone before the gate (`plannedPageCopies`) |
| `--pack` (`pot`, `free`) | `skeleton.png`… | the packer's | the packer's | unchanged (the packer never trims or turns) | `packAtlas`, after the first gate and before the packed one |

Measured on `gallery/nod` (10 regions) and `gallery/flex` (20) through the CLI: against the loose build, `--copy-images` changed the page name of every region and nothing else; `--pack` and `--pack --page-edges free` changed the page name, the page size and `x, y` of every region (nod onto one 1024x1024 page, or 1234x762 with free edges; flex onto 2048x1024, or 1398x732).

**The order this gives.** Before this change the document was spelled once, before the first gate, and handed unchanged to the packed gate; nothing in it depended on the atlas. So #939's objection holds against putting the four values in the model, and does not hold against spelling them from the atlas text `build` writes: every route's final text exists before anything of the pair is written. The document is now `modelDocument(model, skeletonText, atlasText)`, with `atlasText` the text written beside it:

- loose and `--atlas-in`: the compile's own text, as before;
- `--copy-images`: the compile's text with the copies' page names, planned before the gate; the copy after the gate is held to the plan before the pair is written;
- `--pack`: spelled again from the packed text for the packed gate, and that is the document written. `A18` in that gate compares it with a second compile's document spelled from the second, independent pack, so the new input is under the comparison rather than assumed.

The document is written once, after every gate, as before. The alternative of writing the document after the pack and gating it then is the same thing for `--pack` and is not available for `--copy-images` without spelling it after the gate; a rewrite of a written document was not considered, since it would put a file on disk that no gate read.

**The section.** `pages`, after `rig` and before `spine`: every page of the written atlas and every region on it, in file order — `{ name, width, height, regions: [{ name, x, y, width, height, offsetX, offsetY, originalWidth, originalHeight, degrees, index }] }`, the numbers as `parseAtlasText` reads them and the region name as the line spells it. All regions, not only the drawn ones: which regions a rig draws is the core's lookup rule, and a writer choosing a subset would restate it. On the 19 recipes the section adds 308 regions (the 12 example packs carry 35 regions no record draws) and 3,799 leaves; every one is an integer, so `MX01` holds unchanged. A page holds at least one region: the atlas text cannot state a page with none (its block would end before a region line, which the round trip refuses as `A07_ATLAS_TEXT_SHAPE`), so no build writes one, and `readModel` refuses a page whose `regions` is empty by the page's name (issue #1054) — before that rule a forged document carrying one was read, and nothing on the model side named it.

**The version.** `readModel` of rigc 1.6 refuses a section it does not know by name, so a document with `pages` under the old spec would be refused by every installed reader. The spec is `rigc-compiled/2`. `readModel` reads `/2` with `pages` required and checked field by field, and `/1` with `pages: null`; the core then reads the placement from the atlas beside the document as before, and with no atlas given refuses the `/1` document by name.

**What the core draws from.** `corePoser` looks regions up in the document's `pages` (`documentPageLookup`, the first region of a name in file order — `atlasRegionLookup` over the same text). When an atlas is also given, it must be the one the document was written beside: the first page or region field that differs is refused by name, and the render then draws through spine-core saying why.

**Measured after the change**, on the 19 recipes: every `skeleton.json` and `skeleton.atlas` byte-identical to `0984c47`; each document differs from `0984c47`'s in `/spec` and the added `/pages` leaves only, and with `pages` removed and the spec set back to `/1` is byte-identical to it on 19 of 19; each document's `pages` equals `pagesOfAtlas` of the atlas written beside it on 19 of 19, and on the gallery's loose, `--copy-images`, `--pack` and `--pack --page-edges free` builds and an `--atlas-in` probe with and without `--copy-images` (`MG09`). Drawn by the core with no atlas text and the page images loaded by the names the document states, the 19 rows' 2,612 frames and 50 contact sheets are pixel-identical to the CLI's render of the same builds with the atlas present, on the same framing box (`RC10` holds the gallery rows).

**What this does not do.** `rigc render`, `check` and `bench --frames` still refuse a build directory without its `skeleton.atlas` before any posing: they load the Spine skeleton through spine-core (`loadPosable` in `src/render.ts`), which needs the atlas, for the rosters the core poser is checked against, the skins, the slot subset, the stage and the page images. Removing that read is a change to `src/render.ts` and `src/check.ts`, not to the document.

## 9. What only the Spine files held, and a compile that does not call the Spine emitter (issue #1026)

Measured 2026-10-01 at `caee5ab` of `main` and built on top of it. §8's "What this does not do" was closed by issue #1020; what that change still read off `skeleton.json` and the atlas is the subject here.

**What only the files held.** On the 19 tree recipes: the order `skeleton.json` keys its animations in (the editor's, which differs from the document's spec order on 5 of 19); the order it lists its skins and keys each skin's slots in (the editor's; 18 of 19 skins key their slots in another order than the document's table); the stage (the header's `x`, `y`, `width`, `height`, which no document field stated); each atlas page's `pma:` (read by `A06`) and its `scale:` line (read by `check`'s texture note and `check.json`'s `textureFrom.candidateScales`; 12 of 19 atlases state one); and the Spine file's bytes, which `spine.sha256` records (§7).

**Two ways to state the orders, both measured.** The document's own arrays could be written in the file's order, or the order could be stated beside them. Written in the file's order, 18 of the 19 documents would be rewritten (a skin's slot keys on 18, the animations on 5, where 6,308 leaves move to another index), and every reader of the arrays would read another order: in a copy of the tree writing them so, six controls went red — `MD01` (the animations held in the spec's order), `MD04` (an animations map inserted in reverse, which the Spine file cannot show, no longer moved the document), `VF05` (the model-side suppliers of issue #1025 put the document's own skin order through the emitter's rule, which it could no longer show matters), `DM13`, `CO12` and `CN04` (plants and probes that tell the document's order from the file's). Stated beside them, as `editorOrder`, no existing leaf moves: the 19 documents gain 687 leaves and change `/spec` alone, and with the new fields removed and the spec set back to `/2` they are byte-identical to `caee5ab`'s on 19 of 19. `A18` compares either equally. The order is stated.

⚠️ **The order a file keys is the keys of an object, not the sort.** `skeleton.json`'s `animations` and a skin's `attachments` are JSON objects, and an object lists an integer-like key first whatever order it was filled in: two animations named `-a` and `5`, which the editor's comparator orders `-a, 5`, are keyed `5, -a` in the file and read so by spine-core. `editorOrder` states the keys (`MG12` builds the pair); `src/deformstructure.ts`'s reading of a `/2` document, which derives the order by the comparator, would order those two the other way.

🔁 **Issue #1034 (2026-10-02) measured the rest of that sentence and moved the rule into the function.** On a probe keying `5, -a, 10, 2b, 01`: the file and spine-core list the animations `5, 10, -a, 01, 2b`, the comparator `-a, 01, 2b, 5, 10`; the skins, an ARRAY, keep the comparator's order (`default, -a, 01, 2b, 5, 10` everywhere); a skin's slot keys are an object's and were the file's already (`editorSlotKeyOrder` returns an object). Two readers walked the comparator's animation order — the survey on a `/2` document, and the constraint-timeline supplier (`modelConstraintTimelineSources`) on **every** document, `/3` included — and three orders no `editorOrder` field states were walked in the model's order: an animation's deform timelines (skin, slot and attachment are each an object's keys), its constraint groups (keyed by constraint name), and the survey's skins (sorted by the emitter, which the survey's header said the file kept from the model). Since then `editorAnimationOrder` returns the keyed order itself (`keyedOrder` over the comparator's list — no byte moves, the emitter keyed the object either way), every reader takes the orders from `fileAnimationOrder` / `fileSkinOrder` (`src/compile.ts`: the stated order on `/3`, the one source there, and the emitter's rule on `/2` and `/1`), and the per-animation groups go through `keyedOrder` over the model's order. `VF11` and `DM12`/`DM13` hold it on the probe.

🔁 **Issue #1039 (2026-10-02) measured the two groups #1034 left: an animation's bones and the events.** On the walk probe, whose tracks key five bones `-a, 5, 2b, 10, …, 01`: the document lists an animation's `bones` in that order, the file and spine-core `5, 10, -a, 2b, …` (an object again). One reader walked the document's order — the bones an animation keys (`modelAnimatedBones`, A15's), now `keyedOrder` over the list; the bone timelines' supplier already read the file's order, because it rebuilds the object. The core applies the bones in the document's order and that reaches no pose: each bone's timelines write that bone alone, and the raw grid is equal at 0 ulp with every animation's bones reversed (`CO33`). Two timelines writing one property of one bone do reach a pose — the later sets it, 7 px apart on the probe — but they are keyed by the format's own words, which no integer-like name reorders, and the core and the emitter take them in the document's order (`CO34`). The events need nothing: the declarations are an object in the file, but the rig spec stating them is a JSON object too, so the model holds them in the file's order before the compiler reads them (a spec spelling `-a, 2b, 5, 01, 10` is read `5, 10, -a, 2b, 01`), and an animation's event keys are an array (`VF20`). `VF19` holds the bones on the probe.

**The sections.** `rigc-compiled/3`:

- `stage`, after `referenceScale`: `{ x, y, width, height }`, or `null` for a rig that declares no stage. A model field (`CompiledModel.stage`); the Spine emitter writes the header's four fields from it.
  Since issue #1168 the stage may carry a fifth field, `box: { slot, attachment }`, written only where the rig spec asks for its stage as a bounding box (`skeleton.stageBox`): it names the slot and attachment of the box `compile` wrote from these four numbers, and `A50_STAGE_BOX_IS_THE_STAGE` reads it on both suppliers. Absent, the section is byte-for-byte what it was; a reader that predates the field refuses it by name (`stage: field "box" is not one this reader knows`).
- `editorOrder`, after `animations`: `{ skins: [{ name, slots }], animations }`, computed in the compile by the three functions the emitter is handed (`editorSkinOrder`, `editorSlotKeyOrder`, `editorAnimationOrder`), over the same model. A model field (`CompiledModel.editorOrder`).
- every page of `pages` gains `pma` (the runtime's reading of the page's `pma:` line, `false` without one) and `scale` (the number the page's own `scale:` line states, `null` without one — not defaulted to 1, which is what an importer divides by and not what the line says), spelled from the atlas text written beside the document, so they move with `--pack` and `--copy-images` as the placement does.

`readModel` reads `/3` with all of these required and checked by path (a stage missing a field, an editor order naming an animation the document does not hold or leaving a slot key out, a page without `pma`), `/2` with `stated: null` and pages without either field, and `/1` as before. A present atlas beside a `/3` document is held to its pages' `pma` and `scale` too.

**Who reads them.** On a `/3` build, `render` and `check` read the animation and skin orders, whether a stage is declared and the pages' `scale:` lines from the document, and nothing from `skeleton.json` but the rosters and the digest they compare it to; `check` with the atlas gone prints the texture note it prints with it. The deform survey reads the stated animation order. On a `/2` or `/1` document they read what they read before, and the render's `poser` line names the files: `a rigc-compiled/2 document, which does not state the order its skins and animations are listed in or its stage, read from <skeleton.json>, or its pages' scale: lines, read from <atlas>`. The survey's order on a `/2` document is derived by the comparator, as before, and reads no file.

**`spine.sha256`, measured.** The digest is compared in two places: `corePoser` when it is handed the skeleton beside the document (`render`, `render --geometry`, `check`), and the survey's model path. On `gallery/ride`: a bone's rotation edited in `skeleton.json` is refused and drawn through spine-core, and the frames differ from the build's, which is the case the digest exists for (the rosters `rosterDifference` compares do not see a value); the same skeleton re-indented, the same data in other bytes, is refused too and drawn through spine-core pixel for pixel alike; `--poser core` on either exits 2 naming both digests. A Spine file without a document beside it never reads the digest, and a document without a Spine file beside it has nothing to compare. So the digest is a statement about one pair of files, written by what writes the pair; a build that writes no Spine pair needs no digest, and whatever writes the pair later — the converter — is where it belongs. That is a proposal, not a change: the field stays where it is (§7), because a document without it is a command surface no command has yet.

**A compile that does not call the Spine emitter.** `compileModel` (`src/compile.ts`) is everything `compile` did up to its one `emitSkeleton` call: the model (with `stage` and `editorOrder`), the rest of the header, the atlas text and the declared durations. `compile` is that entry followed by the emission, and its result is the shape it was. With `emitSkeleton` made to throw in a scratch copy of the tree, `build` exits 1 naming the emitter's error on 19 of 19 recipes, and `compileModel` returns the model on 19 of 19, whose documents — the `spine` section aside, which needs the Spine text — are the real builds' on 19 of 19. `MD11` holds the same in a copy of the tree. `PHYSICS_PARAMS` and `UNSTATED_REFERENCE_SCALE` moved to `src/keyorder.ts`, beside the parser's other defaults, and the emitter re-exports them, so the entry reads nothing from the emitter's module; `compile.ts` still imports `emitSkeleton`, once, for `compile`.

**Measured after the change**, on the 19 recipes: every `skeleton.json` and `skeleton.atlas` byte-identical to `caee5ab`; the documents as above; each document's stage, editor order and page flags equal to the files written beside it on 19 of 19; `render_hashes` IDENTICAL (2,827 files), `survey_hashes` IDENTICAL, and `check`'s `check.json` and stdout byte-identical with the atlas present (plain and `--texture-from`).
