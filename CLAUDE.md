# CLAUDE.md

Guidance for AI-assisted sessions working on this repository.

## What this is

rigc compiles a **rig spec** plus a motion spec — and, for a cut with measured art
behind it, a cut manifest — into Spine 4.3 skeleton data and a one-part-per-page
atlas, then round-trips the result through `@esotericsoftware/spine-core` and
50 named assertions before anything is written. Read [README.md](README.md) for
the formats, the CLI and the assertion list; [`src/rig.ts`](src/rig.ts) is the
rig spec's own documentation.

[docs/AUTHORING.md](docs/AUTHORING.md) is the guide an agent authors *from* — the
two input files field by field, the emission rules, the CLI loop, and the map from
each named failure to the file that has to change. It is a first-class deliverable,
not a summary of this file: the guide and the validator's messages together are the
only interface an agent that cannot see the rig actually has. **Anything that
changes an input format, an error message or an assertion changes that guide too.**

## The doctrine: a tool for AI, not for people

Everything below follows from one observation. An agent authoring a rig cannot see
it. Spine's parser accepts a great deal of wrongness in silence — the constraint
that vanishes, the NaN curve, the mesh that quietly loses its bone weights — so an
agent with only a parser for feedback will report success on a broken rig and be
sincere about it. rigc exists to convert that silence into a named failure.

- **The validator's messages are the UI.** They are what the agent reads and what
  it acts on, so a failure detail must name the object, the value found and the
  value required. `A20_MESH_WEIGHTS_COHERENT: mesh "x" vertex 12 weights sum to
  0.9000` is the product. "invalid mesh" is not.
- **Everything in a rig spec resolves by name, and a miss is refused by name.**
  A bone's `parent`, a slot's `bone`, a constraint's `bones` and `target`, a
  draw-order key's `slot`, and an authored mesh's vertex `weights`. The last of
  those used to be the exception — weights carried raw indices into the *emitted*
  bone array, so inserting a bone rebound every vertex of every mesh below it with
  a green gate and an unmoved `diff` (issue #45, the third example in the
  paragraph above, reproduced rather than caught). Spine's index encoding is still
  reachable behind `"boneIndexing": "raw"`, because what it buys is exactly the
  silence, and that has to be asked for.
- **The compiler never invents a value that is not in the spec.** No defaults
  guessed from the art, no re-measuring of plates, no "reasonable" fallbacks. If a
  number is missing, that is a `CompileError` naming the field. A compiler that
  fills in gaps produces rigs nobody can reason about — and it makes the manifest
  stop being the record of what was measured.
- **Emit only after green.** `build` compiles, validates, and writes *only* if
  every assertion passes. Never reorder that. A wrong file on disk outlives the
  console output that warned about it.
- 🔒 **Validation is not optional — this is a structural invariant, not a
  default.** There must never be a `--no-validate` or `--emit-anyway` flag, an
  environment escape, or an exported API that hands back emitted artifacts
  without the gate having run. **Correctness is the whole of the reason, and it
  is sufficient by itself.** The gate is one body of assertions with two
  suppliers: the round trip through `@esotericsoftware/spine-core`, which
  `cli.ts build` runs wherever the runtime is installed — a clone, CI, an install
  with it added beside — and rigc's own validator over the model document and
  the emitted text, which `cli_core.ts build` runs where it is not (the published
  package, since 2.0.0: `spine-core` is a devDependency). The second supplier is
  admitted on measurement, not on its word, and the measurement's scope is
  stated rather than rounded up: of the 50 assertions, the 40 the model side
  runs are held to the round trip's verdict lines by `verdict_gate`, the 9
  restated over the emitted text (A01, A02, A05, A07, A16, A31, A35, A52, A18) by
  `RC28`, and `A00_ROUNDTRIP_PARSE` — the parse by the official runtime — does
  not run on the core build and is reported as a SKIP that says so — in its
  place the model side runs its own two parse rules, `A00_MODEL_READ` and
  `A00_MODEL_REGIONS_ON_PAGES`, outside the registry and held by `verdict_gate`
  to accept and refuse what A00 does, so that report counts 42 rules on the model side
  and totals 52 on the core entry, each with a row in AUTHORING §5.2. `core_gate`
  holds rigc's poser to spine-core's poses at tolerance 0. CI runs all of that
  on every change over the public recipes and every selftest call; the 14
  production rigs are measured by hand with private recipes CI does not have,
  before each landing — a practice, not a gate CI enforces. A bypass of either
  supplier turns rigc back into a program that prints plausible JSON. Do not
  accept a "just for testing" bypass.

  A second reason stood here until 2026-09-05, when issue #398 retired it: that a
  build path not linking the runtime would be a Spine-format emitter with no
  runtime dependency, and that rigc therefore "must remain structurally incapable
  of being used as a substitute for" the editor. Declaring a format-agnostic core
  with its own format and player (issue #380) makes that a promise the roadmap
  already contradicts, and an unkeepable promise is worth less than none — so it
  is retired rather than reworded. What that does not touch: this repository
  links `spine-core` as a devDependency, so the Spine Runtimes License covers
  running it from a clone, in CI, or with the runtime installed beside the
  package; the published package links none. That is a fact about what the code
  links, [NOTICE.md](NOTICE.md) states it, and it stands whether or not the
  clause does.

  ⚠️ **None of that authorises an emit path with no oracle behind it.** What the
  invariant requires is that everything written to disk was gated by a reader
  held to a parser rigc did not write: spine-core supplies that reading in CI,
  and the own validator ships only because the gate above holds it equal. A
  backend emitting a format with no such parser needs its own oracle first —
  issue #380's cross-backend oracle was the prerequisite for the core entry's
  build, not a nicety attached to it.
- **Determinism is a contract, not a habit.** `A18_DETERMINISTIC_EMIT` compares a
  second, independent compile byte for byte. Anything non-deterministic —
  iteration over an unordered set, a timestamp, a locale-sensitive format, floating
  noise — breaks it, and that is the point.
- **A gate nobody has seen fail is not a gate.** Every assertion needs a mutant in
  `selftest.ts` that makes it fire, and every suite needs a positive control. An
  assertion whose data is absent reports **SKIP**, never a pass — folding vacuous
  checks into the pass count is how a gate comes to look kept while checking
  nothing.
- **No `any`, no `as any`, in `src/` or `cli.ts`.** `selftest.ts` is the one
  exception and it is scoped: the mutants deliberately forge malformed skeleton
  JSON, so they turn the rule off around the mutant tables and back on after.
  Since 2026-08-22 `bun run lint` enforces this rather than a reader, which is
  also what makes the scope of that exemption checkable — the file's
  `eslint-disable` comments now have to actually bracket every `any` in it.
- **rigc compiles an object. The scene belongs to the consumer.** What the rig
  can *do* is ours — its angles, its jiggle, its expression axes, the sockets
  something attaches to, and the guarantee that its animations meet cleanly at
  their rest poses. *When* it does any of that is not: the order animations play
  in, what else is on screen, where the camera is, how two characters relate.
  The line is not a modesty; crossing it makes the claims contradict each other,
  because the code already refuses what the prose would be promising.

  ⭐ **It is a name for a choice already made, which is why it holds.**
  `gallery/look` deliberately makes a face angle *a value rather than a time* —
  the object offers a dial and does not decide when it turns. A39 poses a
  slider-applied animation at the slider's own mapping for the same reason
  (issue #407): posing it as if a track were playing it invents a moment the
  object never claimed.

  ⚠️ The failure mode is vocabulary, not code. `films/three-scene` states the
  boundary exactly right in its own text — *"that is a property of the rig
  rather than of the assembler"*, measured at 0 differing pixels across the
  hand-offs — and the README caption over it once called the same thing "scene
  direction". The caption now says the rig guarantees the seams and the
  composing is the consumer's, so the phrase survives only as the film's own
  title, which the clause below sanctions. Prefer the honest claim, which is
  also the stronger one and the only measurable one: **rigc makes an object that
  can be directed. It guarantees the seams; the consumer does the composing.**

  🎬 **A demo is the one place a scene belongs, because there we are the
  consumer.** Showing what an object can do means putting it in time, and
  someone has to compose that take — so `films/three-scene` is a scene, made
  deliberately, and its name is honest. What is not honest is presenting that
  composition as a rigc capability. The film may stage; the caption may not
  claim. Read a "scene" in this tree as a question of *who is speaking*: the
  demo says "we composed this with the tool", the product may only say "here is
  what the object gives you to compose with".

- **The same doctrine governs how the repository is worked, and for a while it
  did not.** Everything above says an agent is the author and the messages are
  its only interface — and then the working habit was to carry decisions to the
  owner for a ruling. Those two contradict, in the same file. A tool built on
  the premise that the work happens without a person watching cannot be *built*
  by asking a person to watch.

  ⇒ **The fix is a change of lens, not a transfer of authority.** Most questions
  worth carrying to a person are artifacts of looking at the work through a human
  organisation, where conventions have owners and "which would you prefer" is a
  real question. Under the lens this tool is built for they dissolve, because the
  criterion is never preference: *which reading is derivable*, *which claim is
  measurable*, *does a gate already cover this*. Each of those answers itself,
  and each was asked of a person here at least once.

  What survives the lens is short and none of it is a convention: direction,
  licence posture, what the spend is worth, and any text that speaks as the
  owner. Everything else is decided by stating the argument, because **stating a
  decisive argument *is* the decision** — taking it to a human afterwards is a
  round trip wearing a review's clothes.

  🤝 **And the short list is not a list of things somebody dictates.** The axis
  is not who owns an item, it is *what settles it*: what can be derived is
  settled by derivation, and what cannot is settled by **agreement** — which
  means an objection that has not been raised is a decision that has not been
  made. Reading those four as handed down is how the human frame gets back in
  through the side door, one clause after being shown the door: the authority
  over conventions is removed, and then returned over direction.

  ⚠️ An objection is held to the same standard as everything else here. *"I
  would rather not"* is not one; **"it contradicts X", "it cannot be measured",
  "it breaks Y"** are. A veto without grounds is the same emptiness as a
  question without grounds, pointed the other way.

  🔸 One of the four is the owner's alone, and the reason is observability
  rather than authority: **what the spend is worth cannot be agreed to, because
  an agent cannot see the cost.** The remaining budget, the reset, what else it
  was being saved for — none of that is visible from here, so assent to it
  would have the shape of agreement and none of the content. Which is the same
  criterion applied in the other direction: consultation is worth something
  exactly where measurement is unavailable, and here it is unavailable to the
  agent.

  🔒 **And a question that survives because the tree cannot answer it is a card
  or a check, never a question.** This is the doctrine's own first move applied
  one level up: the answer to "an agent cannot see it" was never "ask someone",
  it was "convert the silence into a named failure". So "I cannot tell" is not a
  reason to escalate — it is the exact condition this tool exists to remove, and
  meeting it means the instrument is missing.

  🚨 **This is not a licence to be more confident.** A reviewer was doing real
  work — forcing the argument to be said out loud — and removing one without
  replacing it makes the tree worse, not faster. The replacement is adversarial
  structure *below*: a task that says **measure it yourself rather than trusting
  this brief, and report what you rejected** comes back having contradicted its
  own instructions where they were wrong, which is the outcome to design for.
  Two claims in a task brief were corrected that way on the day this was written,
  and neither would have been caught by reading the brief again.

  📖 **The reader to write for is an agent with no memory of the conversation
  that produced the work.** So a thing settled in a chat and not written into
  the tree did not happen. What convinces such a reader is exactly what the
  gates already produce — **a claim with its measurement beside it, and the
  alternative that was rejected with the reason** — which is why commit messages
  and pull requests here carry the argument rather than a summary of the diff.
  That is not ceremony; it is the only channel that survives the session.

## Conventions

- Bun + TypeScript, ESM, `.ts` extensions in relative imports.
- `src/` is pure: no clock, no randomness, no network. **Three** files link
  spine-core and they are named here, because an unnamed exception is how a rule
  erodes: `src/validate.ts` owns the round trip, `src/render.ts` poses a
  skeleton in order to draw it, and `src/deformmeasure.ts` poses one in order to
  measure what a deform key did to it. All three are the same justification —
  posing *is* running the runtime, and there is no honest way to read a posed
  vertex without it. Since issue #968 that is `src/render.ts`'s reason for a
  **Spine export** only: a rigc build, whose `skeleton.model.json` sits beside
  the pair, is posed through rigc's own core by render_core.ts (under `src/`,
  linking nothing from the runtime — every frame, geometry file and framing box
  measured identical to the spine-core render on every corpus), and the render
  says which poser drew it. `src/render.ts` still links spine-core for the
  export's poser, for the atlas pages the draw samples and texture
  substitution reads (`TextureAtlas`), and for the spine-core entries
  `validate.ts`'s A10 steps a skeleton through. What the rule protects has not moved: `src/compile.ts` must
  stay independent of the runtime so the compiler and the gate are not checking
  each other's assumptions. Since issue #922 that independence is held by
  controls rather than by this sentence: `MD02` holds the compiler free of every
  Spine shape (the Spine emitter module is the one writer of Spine data, called
  once), and `MD03` holds the set of modules naming those shapes to the one it
  measured. Neither of those modules links spine-core; `CUR07` reads this bullet
  for the ones that do, so they are not named here by path.

  ⚠️ This sentence said **Two** for two weeks after the third file arrived
  (issue #379) — the rule eroded in exactly the way its own clause predicts,
  because nothing read it. `CUR07` in `selftest.ts` now derives the list from
  the tree and compares, and its sharpest clause is the negative one: nothing
  had ever asserted that `src/compile.ts` does *not* link the runtime.
- **A new runtime import that crosses a directory has to be added to `files` in
  `package.json`.** The published package is an allowlist, not the repository,
  and what is in it is deliberately not written out here: `npm pack --dry-run`
  lists what would ship, and RELEASING.md says what belongs there, why, and why
  no document keeps that list by hand. The only **two** modules `src/` reaches
  outside itself are `tools/plate.ts` and `tools/font5x7.ts`. A module added
  under `tools/` and left out of `files` still runs from a clone — the installed
  package is where it throws `Cannot find module`, on the command that needs it.
- **`exports` in `package.json` is the second allowlist**: `files` says what
  ships, `exports` says what a dependant may import, and RELEASING.md *The
  import surface* says which entries are API, which symbols of them are
  promised, and which keys are a courtesy until a major. `bun run smoke` is
  what reads it, from an install.
- Spine data generations — `docs/GENERATIONS.md` is the policy (detect from
  `skeleton.spine`, never guess, play on the matching runtime, the editor is the
  migration path); `src/generation.ts` is its one reader.
- Coordinate contract: manifests are in **crop pixels, y down, origin top-left**;
  Spine world is **y up, origin at the bottom-left of the crop**. The whole
  conversion lives in `src/transform.ts` (`cropToSpineY`, `toBoneLocal`,
  `screenToSpineDegrees`). Do not open-code it anywhere else.
- Conventional Commits, English subject and body. Commit each finished unit.
- Pushing, tagging and cutting a release are the sub-commander's call, delegated
  by the owner; the publishing credentials and npm trusted publishing stay the
  owner's.

## Working with the command post

This repository is commanded by one session at a time, and a command post (HQ)
issues its work. The protocol between them lived in chat and eroded every time a
session rotated — the reader rule above, measured on ourselves. So it is here.

- **One issue = one PR.** The issue is the order: decision, bars, what is out of
  scope. A message that changes an order is copied to the issue.
- **A feature PR is opened and reported, and merged only after HQ's sign.** A
  `release:` PR from release-please merges and cuts on the command post's
  explicit "LGTM #NNN" naming it, quoted in the cut report; the sub-commander
  approves the release PR's awaiting CI run on its current head only. A cut is
  published and cannot be taken back, so the sign has to name the PR it covers,
  and an approval given to an older head would be a sign nobody gave. A release
  PR is never armed: release-please rewrites its head on every push to main, so
  an armed one would merge a head the LGTM never covered — it is merged by hand
  with `--match-head-commit` naming the head the LGTM names. AI review runs at
  most once per PR.
- 🔒 **Never push to an armed PR** — one with auto-merge armed. Disable
  auto-merge first, push, report the new head, and the command post re-arms; a
  merge of main into the branch counts as a push. An armed PR merges whatever
  head turns green, so a push to it lands a commit the sign never saw.
- **The report**, sent when an issue lands or stops: ① the PR and its merge SHA
  ② a verification table — command, exit code, figures ③ every claim in the
  issue that was contradicted, with the measurement ④ what was rejected, with
  the reason ⑤ `STOP` and what blocks, when blocked.
- 🚨 **Figures and names in a report or a document come from
  `git diff origin/main...HEAD` and the run's own output, read in the same turn
  as the report** — never from the session's memory of the work. Compaction
  keeps an early scratch figure at the same weight as the final code, and that
  is the measured way a report comes to describe a branch that does not exist.
- **Artefacts for HQ go to the absolute path the card names, in the private
  workspace — never under a public tree.** `git status -s` runs before every
  report, and any tracked file touched is named in it.
- **No private names on a public surface** — issues, PRs, commits, code and
  docs carry no private corpus, character or game name and no local path. A
  card handed down for this repository is written to that line too.
- **A prose cap in a card applies to prose, not to tables.** A table is the
  measurement; cutting rows to meet a word count deletes evidence.

## Verification — run these before you call a unit finished

| Command | Checks |
| --- | --- |
| `bun run typecheck` | `bunx tsc --noEmit` over the paths `tsconfig.json`'s `include` names — read it there rather than from a copy here, which is how this cell came to be missing two of them. `strict: true` since 2026-10-02 — the comment in that file carries the measurement that raised it |
| `bun run lint` | one rule: `@typescript-eslint/no-explicit-any` as an **error**. `eslint.config.js` says why it is only one |
| `bun run selftest` | the validator's own negative controls, on fixtures it generates. Add `--cuts <cuts.json>` to gate a project's real cuts as well — see *The selftest and its fixtures* |
| `bun run selftest -- --only <suite>[,<suite>…]` | one squad's own suite while iterating — a partial run exits 2 when green (1 when red), prints `SKIP` for every suite it did not run and never the summary; the full run is the only verdict on the tree. ⚠️ The `cli` suite's non-blocking-pipe controls (CLI118–CLI121, issue #1493) start each child through a `perl` shim that sets `O_NONBLOCK` on its stdout again: from Bun 1.4.3 a parent's `spawn` hands the child an inherited pipe put back into blocking mode, so without the shim nothing can be cut and a blocking pipe would read as a pass — measured on linux and macOS, every parent × child pair |
| `bun run smoke` | the **package**, rather than the tree: pack, install into an empty directory, build a rig from the install. Needed when a change touches `files`, `bin/`, a runtime import that crosses a directory, or the dependency — a green checkout cannot see any of those. It installs packages, so unlike the three above it needs a network. CI runs it in `installs` and again on macOS, Windows and the declared minimum Bun in `installs-matrix`. `-- --source registry --version X --wait N` asks the same question of the artifact npm serves, which is what a cut is confirmed with, and answers it in four exit codes: a version the registry has not served yet is **3** and is not a package that failed. RELEASING.md *Whether the tarball runs* says what it proves, what it cannot, and how long the registry has been measured to take |
| `bun run verify:nova -- --label "<issue + purpose>" --owner "<who>" --session "<session id>" [--bun <version>]` | the full selftest on the remote job pool (`NOVA_RUN`, or `nova-run.sh` on `PATH`): the upload carries no `.git` and no `examples/`, so the hand gives it a throwaway repository and fetches the corpus before `bun run selftest`, whose exit it returns — the selftest itself is not taught to tolerate either. All three identity values are required and refused by name before anything is sent. Optional `--bun 1.2.0` selects an exact stable Bun release: its official `SHASUMS256.txt` and Linux x64 baseline archive are checked before upload, the archive's SHA-256 and executable's version checked on the pool, and the command's first line names the selected Bun. Without the flag the pool's Bun and command are unchanged. Selecting a runtime does not promise a pass: the actual selftest exit is returned, with memory ceilings and reported HOLEs unchanged. See README and AUTHORING for refusals and repair |
| `bun cli.ts bench 3 --candidate <dir>` | the ladder still reproduces its rung. `docs/LADDER.md` §*B1's proof* carries that proof beneath the two commands that produce it — and every figure on that page is one **named** candidate's, so compare against the run you passed and not against the first `bench` line the page shows |
| `bun cli.ts check --candidate <dir> --frames <dir>` | the candidate still *looks* like the reference. The gate cannot see a wrong animation — it passed a build with every easing reversed — so a change to timelines, curves or the rasteriser is not verified until this has run |

Neither of the first two existed before 2026-08-22, and both found real defects on
their first run — a `let` assigned inside a callback that made 30 later reads
type-check against `never`, and a spread that quietly overwrote the file paths in
`diff --json`'s and `bench --json`'s own reports. Assume the same of the next rule
anybody adds: turn it on, read what it says, fix it, and only then commit it.

Anything touching an input format, an error message or an assertion also changes
[docs/AUTHORING.md](docs/AUTHORING.md).

## The selftest and its fixtures

`bun run selftest` is **self-contained**. It needs no arguments, no art and no
private repository — a fresh clone can run it, and CI does.

⛔ **The editor round trip (`tools/editor_roundtrip.ts`) is not, and must not
become, a selftest control.** CI has no editor; a control that needed one would
report SKIP for ever, which is how a gate comes to look kept while checking
nothing. Its *refusals* are gated, because they are the half a machine with no
editor can answer for: the suite points the tool at stubs in a temp directory and
reads what comes back, including the case that must *not* be refused — an editor
at an unfamiliar path, which is who `--editor` exists for. The trip itself is run
by hand, on a machine that has the editor. Before a landing it covers the
production rigs and one **parts-built** rig, the exam's task-01 painting through
`@rig-c/parts`. Editor-authored rigs are already in the editor's own shape, so a
refusal that only a generated rig carries cannot appear on them. Issue #1407 was
one: green builds whose meshes listed their bones in two orders, which the editor
refused to import.

Where its fixtures come from, in three tiers:

| Tier | Built by | What it carries |
| --- | --- | --- |
| **generated rigs** | [`fixtures/public.ts`](fixtures/public.ts), into a temp dir per run | `overlay_probe`, `articulated_probe`, `contained_probe`, `segments_probe`, `skirt_probe`, `pass_through_probe`, `leg_stop_probe`, `overlap_probe` — between them: region attachments, attachment swaps, rgba fades, a ring mesh on a control bone, a ribbon on a bone chain, a `segments` mesh over a two-island part pulled by two chains, a skirt of six physics chains weighted through an `influence` reach, a skirt region swung through a leg region it is drawn over (with a second copy of the leg drawn over it, a draw-order key that puts the leg in front, and a squashed hip), a skirt chain swung into a leg three ways — held by a `stops` declaration, by the same network written by hand, and not held — an arm slid across a still body over an opaque stage, once with a draw-order key that puts it behind, an axis bone, a detached emitter, physics constraints, and both measured ceilings |
| **inline probes** | `selftest.ts` itself | the two-slot rig the static-rig and draw-order suites break |
| **the example corpus** | `bun run fetch-examples` | the rung-3 and rung-6 transcriptions and their rendered reference frames, which the `diff`, `check` and mesh suites measure against — and the twelve editor exports themselves, which the `ingest` suite's corpus half ingests, rebuilds and diffs (issue #594). Every suite that reads it names a HOLE when it is absent |

Three rules hold that together and none of them is optional:

- **The plates are checkerboards with `PLACEHOLDER` burned into them.** They exist
  to be structurally real — a true size, a true alpha channel, in the place the
  manifest says — so the compiler measures something and the atlas points
  somewhere. No claim about seams, blending or appearance can come from any of
  them, and none is made.
- **No mutant hardcodes a measured number.** Vertex offsets are found by walking
  the weight run (`weightRuns`, `firstBlendedRun`), atlas edits target the first
  page or region structurally, and the two ceiling mutants state the *smallest*
  whole-pixel edit that crosses the line — which is checkable only because
  `fixtures/public.ts` chose the gap. Reintroducing a literal here is how the
  suite became unrunnable outside one repository the first time.
- **An absent corpus is a HOLE, not a pass.** When `examples/` is missing the
  `diff` and `check` suites say so loudly, the summary repeats it, and a run where
  *nothing* substantive executed exits 2 rather than printing green. Since issue
  #439 that floor is one **per suite** rather than one on their sum, and it is
  counted off the case lines each suite prints rather than restated beside the
  call: any suite that reports it ran and then measures nothing exits 2 by name,
  even when the total grew around it. The summary's own figures are read from the
  same count, so adding a control to a wrapped suite needs no edit to it.
- **A suite's figure counts every case it prints, its own positive control
  included** (issue #451). The tree answered this both ways — four suites counted
  their control and two did not — so for a while no single derivation reproduced
  the summary and four figures stood as literals. The rule is chosen for one
  reason: the tally can only count printed lines, so a convention that subtracts
  something the run printed cannot be derived at all and needs a hand-kept
  exception table beside it, which is the "✅ applied" antipattern this repository
  already has a judgment about. ⚠️ The run's *total* count of positive controls
  was **deleted** rather than derived, because "positive control" is a role and
  not a token on the line: `M16` and `M19` carry the word only because a **control
  bone** is a rig concept, while `PT04` and `PS25` are positive controls whose names
  say nothing at all. Six, seventeen and twenty-nine were each a reading of it and
  none of them was the number. Whether every suite *has* one is an invariant rather
  than a figure, and nothing enforces it yet.
- **A suite may be stated in halves, provided the halves are counted and sum to
  the suite** (issue #453). The `diff` clause states its identity controls and
  its measures as two figures over one suite, and no whole-suite count reproduces
  either half — which is how the last hand-written figure survived #452: it
  reached the summary through an interpolation, so the scanner that refuses a
  typed digit read it as derived. Raising it to 99 produced a **green run, exit
  0**, printing a figure its suite contradicts.

  ⇒ A phase is bracketed the way a suite is and counted off the lines it printed,
  🔒 and the clause that makes the split honest is the floor: **phases that do not
  add up to their suite are a fault**, because two derived halves that need not
  reconcile are two hand-written numbers wearing a derivation. The near-miss
  direction is the load-bearing one — a control weakened to catch only
  over-counting was measured green on a suite one case short.

  ⭐ **With no literal left, the check #452 could not build is built** (`TY13`): a
  top-level constant holding one bare number, named by the summary's code, that
  nothing outside the summary reads. It needed no exception table only because
  the tree had none left to except — and on the run where it names a planted
  constant, `TY10` prints PASS on the same file, which is the card's whole thesis
  in one run.

  ⚠️ Its rejected sibling is worth keeping: a "still matching" clause of the form
  *the summary must name at least one module constant* **goes red exactly when
  the tree improves**, since naming none is the ideal end state. A two-sided
  check has to be two-sided about the right thing.

`--cuts <cuts.json>` (or `RIGC_CUTS=<path>`) adds an **extra suite**: every cut in
that table is compiled, gated and compiled again for `A18`. It is a positive
control and deliberately nothing else — hand-aiming a second set of mutants at
somebody's real art is what made this file unrunnable before. What real art adds
is the geometry: measured offsets, a measured axis, a measured ceiling, a mesh
built over a contour nobody drew by hand. So the question it asks is the one only
those cuts can answer — *does the whole gate still come back green on them?*

`RIGC_EMIT_HASHES_BASE=<hashes.json>` gives the five step-1 gates (`MB07`, `MV09`,
`MS12`, `MA12`, `MD07`) a fuller base hash document written by `tools/emit_hashes.ts`
at an earlier commit, and every recipe whose inputs are present is then held
byte-identical to that document's rows — the gate every cut of issue #380's step 1
landed under. Without it they read the tracked gallery base,
`tools/emit_hashes.base.json`, which `bun tools/emit_hashes.ts base` writes and
`base --check` holds current (`EH06`): a change that moves a gallery build's bytes
on purpose regenerates it in the same PR. With neither, they print `SKIP` and a
HOLE line naming the file and the command; they never pass on nothing.

`tools/render_hashes.ts` is the same instrument for step 3 of issue #380, where
`src/render.ts` stops posing through spine-core: every recipe built, rendered
through `rigc render --geometry` at the protocol rate, and hashed file by file —
frames, contact sheets, `geometry.json`, `frames.json` — with the framing box's
numbers, the setup pose drawn over the same box and every bone snapshot beside
them; every PNG carries two hashes, its file bytes and its decoded pixels. Two
`run` documents from one machine, before and after a cut, are the gate
(`compare`, which names a PNG whose bytes differ and pixels agree as the
encoder's, not a DIFF). The tracked gallery base,
`tools/render_hashes.base.json`, holds the PNGs' pixel hashes only: a one-ulp
change of every libm result moved no PNG and every file carrying a double, and
the PNG encoder on Linux CI wrote different bytes for the same frames than the
macOS base (PR #972). `bun tools/render_hashes.ts base` writes it and `base --check` holds it current (`RH05`), so a change that
moves a gallery render on purpose regenerates it in the same PR. CI uploads a
run over every recipe as the `render-hashes-linux` artifact, which is where a
second machine's doubles are read.

⚠️ A cuts path that is **named and missing** exits 2. Treating a typo as "no cuts
file" would mean the one caller who asked for the extra suite is the one caller
who silently does not get it. A path that is not named at all is a normal run.

## Going public

The repository was a snapshot of a game project's sandbox, and the split moved the
cut-specific *files* out without sanitising the *code*. That inventory is closed;
what follows is what keeps it closed.

- **Cut-specific knowledge lives with the consumer, not here.** Slot names,
  anatomy, plan documents, per-project budgets. If a comment, a default or an
  assertion can only be understood by someone who has seen one particular set of
  art, it is in the wrong repository.
- **An archetype assertion reads the rig, never a name.** A24–A30 and A39 take
  everything they know from the rig spec's `invariants` block, and
  `A13_MESH_BUDGET` takes
  its two numbers from `invariants.meshSlots` / `invariants.meshTriangles`. A
  budget baked in here would be one consumer's frame time failing correct foreign
  data — the editor's own example projects ship meshes many times denser.
- **An assertion with nothing to measure reports SKIP.** Never a pass. A rig that
  declares no invariant is unmeasured, not certified, and the two must not print
  the same. ⚠️ The failure mode is subtler than forgetting to write the SKIP: an
  assertion can have a *default* that quietly turns "nothing to measure" into a
  measurement of the wrong thing. `A21_MESH_RIM_PINNED` resolved a mesh's kind as
  `meshKinds[slot] || 'ring'`, so authored geometry — which has no entry, because
  rigc did not build it — was checked as a ring and reported 40 failures on a
  correct 40-vertex editor mesh. `meshKinds` now has a third state, `authored`,
  and the generator-topology rules skip on it (issue #44).
- **Design notes live with the consumer.** Comments state their invariant outright
  rather than citing a document a reader cannot open.

Two tools moved out with the cuts they only made sense for
(`measure_joint_anchors.ts`, `make_stroke_strip.ts`); they import rigc's generic
helpers back through the owning project's symlink. The generic measuring tools
stayed, minus their per-cut defaults — `tools/measure_contact_depth.ts` now
requires both slot names, because a default would measure the wrong pair on the
next cut and still print a plausible number.
