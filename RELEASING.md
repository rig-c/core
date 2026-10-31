# Releasing

The cut is one click: merge the release pull request. Everything either side of
that click is [`.github/workflows/release.yml`](.github/workflows/release.yml),
and no npm credential exists on any machine — the publish authenticates to the
registry over OIDC (npm trusted publishing), so there is no token to leak and no
2FA prompt to answer. See [Publishing](#publishing).

## The loop

Every push to `main` runs `release.yml`, which hands the new commits to
[release-please](https://github.com/googleapis/release-please-action):

- **Nothing releasable since the last tag** → the run does nothing. Commit types
  release-please hides from the changelog (`docs`, `test`, `ci`, `build`,
  `chore`, `refactor`, `style`) do not open a release pull request on their own.
  **Visibility is what makes a type releasable**, which is why
  `release-please-config.json` carries a `changelog-sections` array: it is the
  default node list plus `check` → *Instrument*, so instrument work on shipped
  sources counts and gets its own changelog line instead of riding along
  silently ([#163](https://github.com/rig-c/core/issues/163)). Overriding the
  array replaces the default rather than extending it, so the whole list is
  written out — dropping a row from it hides that type.

  ⚠️ **`docs` is the one hidden type that most often changes the package, and
  for twenty-two landings nothing noticed.** The published tree is an allowlist
  and it includes guides:
  `docs/AUTHORING.md`, `docs/FACE.md`, `docs/INGEST.md`, `docs/RIGGING.md`,
  `docs/MOTION.md`, `docs/PROMPTING.md` and `docs/SPEC_COVERAGE.md` all ship, and
  `CLAUDE.md` calls the first of them a first-class deliverable — the guide and
  the validator's messages together are the only interface an agent that cannot
  see the rig actually has. So a correction to a shipped guide changes what
  `npm install rig-c` hands somebody, under a type the release machinery is
  told to ignore, and the guides stay wrong on the registry until something else
  happens to cut a release.

  ⛔ The fix is **not** to un-hide `docs`: most of `docs/` does not ship
  (`LADDER.md`, `PILOT.md`, `RELEASING.md` itself), so every note to a working
  document would open a release pull request and the type would stop meaning
  anything — **visibility is what makes a type releasable**, and a type that is
  always visible carries no information.

  ✅ **What does the noticing is the `ships` job in
  [`.github/workflows/squash-text.yml`](.github/workflows/squash-text.yml)**
  ([#516](https://github.com/rig-c/core/issues/516); in that workflow since
  [#1359](https://github.com/rig-c/core/issues/1359), so a title edit re-runs it
  without re-running the selftest). It runs on
  every pull request, extracts both ends of the landing and asks **`npm pack
  --dry-run`** what each one publishes — not the `files` array, because npm adds
  `package.json`, `README.md` and `LICENSE` on top of it, so a literal reading of
  the array is blind to the second most edited file in the package. If a path
  inside the pack changes and the **subject the squash will write** carries a
  type release-please hides, the job names the paths and refuses. That subject
  is read by `scripts/commit_parse.ts subject`, the same assembly the `parses`
  job judges: **a branch of one commit squashes to that commit's own subject**,
  and only a branch of several to the pull request title — so retype the commit
  (amend it) on a one-commit branch, and the title on a longer one.

  🔒 **Its verdict is not "you used the wrong type".** A doc correction really is
  a `docs` change; what is missing is that it also ships. Either remedy clears
  it: land it under a type the changelog shows, or put a `Release-As:` footer in
  a **commit message on the branch** — the squash body is made of the commits,
  not of the pull request body.

  🕳️ **What it still cannot see**, and the reason the release-time half of #516
  is worth keeping on the table: GitHub lets the squash subject be rewritten in
  the merge box **after** the check has reported. Over the 100 newest merged
  pull requests (#1211–#1364, 97 of one commit) the subject the job reads is the
  one on `main` on all 100; the pull request title is on 49. Until #1359 the
  job read the title, and this paragraph cited
  [#353](https://github.com/rig-c/core/pull/353) as a merge-box rewrite — it is
  one commit, and `main` carries that commit's subject, which is the merge
  setting working as documented rather than an edit. So when a cut looks
  overdue, the old manual reading still settles it: **look at what changed
  inside `files`, not at the commit types.**
- **Something releasable** → it opens, or updates, a pull request titled
  `release: vX.Y.Z` containing exactly three generated changes: the
  `package.json` version, `CHANGELOG.md`, and `.release-please-manifest.json`.
  `feat` bumps the minor, `fix`, `perf` and `check` bump the patch. A `!` or a
  `BREAKING CHANGE:` footer bumps the **minor** while the package is pre-1.0
  (`bump-minor-pre-major`) — 1.0.0 is a deliberate act, not the side effect of
  one commit. To force a version, put `Release-As: 1.0.0` in a commit footer.
- **That pull request is merged** → the merge is a push to `main`, so
  `release.yml` runs again; this time release-please tags `vX.Y.Z`, creates the
  GitHub release, and the same run publishes the package.

Squash-merge the release pull request, so the commit on `main` keeps its
`release: vX.Y.Z` subject.

### A commit release-please cannot parse is a release that does not happen

release-please hands every commit to `@conventional-commits/parser`, and a
commit the parser throws on is logged at debug level and **counted as
nothing** — the run concludes success. The squash of
[#1352](https://github.com/rig-c/core/pull/1352) (1c04a03) went that way: line
20 of its body opened with a code span holding a nested call, the parser read
the line's start as a footer token and stopped at `20:23`, and the run opened no
release pull request ([#1354](https://github.com/rig-c/core/issues/1354); #1353
recovered it with an empty commit restating the subject).

✅ **What catches it is
[`.github/workflows/squash-text.yml`](.github/workflows/squash-text.yml)**,
which runs [`scripts/commit_parse.ts`](scripts/commit_parse.ts) on every pull
request when it is opened, pushed to, reopened or **edited**. It assembles the
text the squash will write and parses it with the parser release-please runs —
the version the action's lockfile pins, pinned exactly as a devDependency — and
refuses by line, column and the line itself. Which text that is follows the
repository's merge settings (`COMMIT_OR_PR_TITLE`, `COMMIT_MESSAGES`): **one
commit squashes to its own subject and body**, so the pull request title is not
read at all; **several squash to the pull request title** over every commit
message. The pull request body never reaches `main`; it is read only for a
`BEGIN_COMMIT_OVERRIDE` block, which release-please reads in place of the
commit. So the fix for a refusal is in the commit message (or, for a branch of
several commits, the title), never in the body.

What the grammar trips on, measured on the pinned parser: a line that opens
with a word and an open parenthesis is read as the start of a footer token, and
it fails when another parenthesis or the end of the line comes before the
closing one — a line opening with a code span around a nested call, or
`name(` left open. The same text later in the line parses. Over the whole of
`main` (`bun scripts/commit_parse.ts history 1000 main`), 7 commits are ones
release-please skipped: three bodies of that shape, and four subjects that are
not conventional (one of them GitHub's own `Revert "…"` title — retitle a
revert `revert: …`).

🕳️ The merge box can still rewrite the title and body after the check has run,
and nothing a pull request check can read sees that edit.

## One-time setup (owner, GitHub)

**Settings → Actions → General → Workflow permissions → tick "Allow GitHub
Actions to create and approve pull requests."** It is off by default, and while
it is off release-please cannot open the release pull request at all — the run
fails with *GitHub Actions is not permitted to create or approve pull requests*.
Nothing in a workflow file can grant this; it is a repository setting.

The neighbouring "Workflow permissions" radio can stay on the read-only default:
`release.yml` declares per job the write scopes it needs.

`release-please-config.json` carries a `bootstrap-sha`. It marks where
release-please stops reading history on its very first run, so the first
changelog covers the release and not the whole repository. It is set once, to
the commit that introduces these files, and is not maintained afterwards.

## Cutting a release

1. Land the work on `main` with conventional-commit subjects. CI runs on every
   push.
2. Wait for the `release` run to open or update the `release: vX.Y.Z` pull
   request.
3. Read the diff — the version and the generated changelog are the whole review.
4. **Read the candidate against the dependant.** A tarball of the release
   pull request's head, installed into a copy of a dependant's checkout, has
   to type-check under the dependant's own `typecheck` script and build its
   public example to the same bytes as the same build on the last release
   ([#1212](https://github.com/rig-c/core/issues/1212)). Manual for now;
   from a checkout of the release pull request's head, with the dependant's
   checkout beside it and its examples fetched (`bun run fetch-examples`
   there). This step checks the public scarf example's config, animation file
   and fetched inputs, including each wrapper's `layers.json`, by name before
   packing or installing anything:

   <!-- release-dependant-example: the selftest runs this exact block with a stub comparison command -->
   ```sh
   dependant='../rig-parts'
   for input in examples/scarf/config.json examples/scarf/animations.json examples/scarf/inputs/painting.png examples/scarf/inputs/layers/full examples/scarf/inputs/layers/head examples/scarf/inputs/layers/full/layers.json examples/scarf/inputs/layers/head/layers.json; do
     if [ ! -e "$dependant/$input" ]; then
       echo "FAIL  RELEASE_DEPENDANT_INPUT: $dependant/$input is missing; check the checkout and run bun run fetch-examples in $dependant" >&2
       exit 1
     fi
   done
   bun scripts/dependant_check.ts --dependant "$dependant" -- bun cli.ts build --config examples/scarf/config.json --source examples/scarf/inputs/painting.png --full examples/scarf/inputs/layers/full --head examples/scarf/inputs/layers/head --out '{out}'
   ```

   It writes nothing into the dependant: it packs this tree as the smoke
   does, copies the checkout twice into a temp directory, installs the
   candidate into one copy and `<name>@latest` — the last release as the
   registry serves it, printed as the version installed; not this tree's
   version, which on a release pull request is the one being cut and not yet
   served; `--baseline` names another — into the other, runs
   the dependant's `typecheck` on the candidate, the build command in both
   (each `{out}` becomes an output directory of that copy's own), and
   compares every file the two builds wrote by SHA-256. It exits 0 only when
   the type check passes, both builds exit 0 and every file is identical; 1
   names each one that is not; 2 is a pack, copy or install that did not
   complete, which measured nothing. A difference in the bytes is what the
   notes' negative form (below) then has to name for that dependant — it is
   red because "identical" is the only reading a release is approved on
   without reading further. `--patch <file>` applies a change of the
   dependant's own that has not landed yet to the candidate copy only, which
   is how #1212 verified the dependant's switch to the named entries before
   it was theirs to land. `<name>` is the name the dependant declares: the
   package's own, `rig-c`, or one of the aliases it is also published as,
   `spine-rigc` or `@rig-c/core` — in which case the candidate is repacked under that name by
   `scripts/alias_tarball.ts`, its files unchanged, so the dependant's own
   imports resolve. rig-parts 0.16.0 declares `spine-rigc`, and on the tree
   that renamed the package the check came back green against
   `spine-rigc@latest` (2.20.4): type check exit 0, 106 of 106 files
   byte-identical.
5. **Approve the `ci` run.** It is already there and sitting in
   `action_required`, so the required `test` check is blocked until you do:
   `gh api -X POST repos/rig-c/core/actions/runs/<id>/approve`, or **Approve
   and run** in the Actions tab. Every cut needs this — see below for why, and
   for why the branch name is not worth memorising.
6. **Merge it.** That is the cut.
7. Watch the second `release` run: it tags `vX.Y.Z`, creates the GitHub release,
   runs the selftest's six shards and their merge on the tag (`gate`), and
   publishes (`publish`, whose log says which tally it accepted — see
   *Publishing* below). Its last step confirms the published package installs and
   builds, waiting up to 15 minutes for the registry to serve it — if that step
   ends saying the confirmation was NOT taken, the registry was still
   processing and nothing is wrong with the cut: re-run the confirmation
   (Actions → release → Run workflow, with the version) rather than re-cutting
   anything. *Whether the tarball runs*, below, has the window and the codes.
8. Confirm every name: `npm view rig-c version`, `npm view spine-rigc version` and
   `npm view @rig-c/core version` print the version just cut, and each name's npm page shows the provenance
   attestation linking its tarball to the workflow run.

### What the release notes say about `build`'s bytes

Every release's notes state, **exactly once**, whether `build`'s output moved
since the previous tag — the version tag immediately before this one — in one
of these two sentences, written verbatim with that tag in place of `vX.Y.Z`:

```text
Every file `build` writes is byte-identical to vX.Y.Z's
`build`'s output is not byte-identical to vX.Y.Z's: <what moved>
```

Verbatim, because a dependant's release intake reads the release body for
these exact words and decides between taking the bump and opening a card on
them ([#1167](https://github.com/rig-c/core/issues/1167)). A body with
neither, with both, or with a paraphrase is one that intake cannot read.

⚖️ **What the positive form rests on, and so what it covers.** It is stated
only when both of these hold:

1. **The two tags' builds compare IDENTICAL.** The release step, with the
   corpus fetched (`bun run fetch-examples`) in both checkouts:

   ```sh
   bun tools/emit_hashes.ts recipes --out recipes.json                              # on the release tag
   bun tools/emit_hashes.ts run --recipes recipes.json --out prev.json --work <dir>  # in a checkout of the previous tag
   bun tools/emit_hashes.ts run --recipes recipes.json --out new.json --work <dir>   # in a checkout of the release tag
   bun tools/emit_hashes.ts compare prev.json new.json
   ```

   and `compare` has to print `IDENTICAL`. For v2.10.1 against v2.10.0 it
   printed `IDENTICAL — 19 recipe(s), 57 file(s), every exit code, size and
   hash equal`, at about 11 s a side. This is **one machine's reading of both
   tags**, which is why `skeleton.model.json` can be in it although the
   tracked base leaves it out as machine-dependent: across two machines it is
   not held, on one machine it is.
2. **`tools/emit_hashes.base.json` is unmoved between the two tags** — the
   diff of that one file between them is empty. `EH06` holds that file to what
   `bun tools/emit_hashes.ts base` writes on the tree, so between releases a
   change that moved a gallery build's Spine files either regenerated it in
   the same pull request or went red.

What the sentence covers is therefore what that comparison measured, and no
more:

- **the tree's recipes**, two groups — every `gallery/<name>/` with a
  `rig.json`, built the way its README states, and every fetched editor export
  under `examples/`, ingested and rebuilt. How many there are is whatever
  `recipes` writes on the release tag; 19 is the 2.10.1 reading, not a rule;
- **every file those builds write** — `skeleton.json`, `skeleton.atlas` and
  `skeleton.model.json` each;
- **with the flags those recipes pass** (each row's commands are in
  `recipes.json`). A flag none of them passes is not exercised — on the
  2.10.1 recipes that includes `--pack`, so packed atlas pages are outside it.

It is **not** a statement about every possible input. A dependant that needs
its own rigs held runs `bun tools/emit_hashes.ts run` over its own recipes
from a clone of each tag — the tool does not ship — and compares the two
documents.

The negative form names what moved: the rows and files `compare` names, and
the change that moved them.

**Migration:** a draft that uses the negative form also carries a paragraph
starting `**Migration:**` that says what a reader of the moved bytes has to
change — which field now means something else, and where the old meaning is
read instead. "The bytes moved" tells a dependant that it must look; the
paragraph tells it what to do once it has. 2.2.0 is the case it is written
from: its header `x`/`y`/`width`/`height` changed from the stage to the
setup-pose bounding box, the entry said so only as a *Bug Fix*, and a consumer
that read the header as the stage was mis-sized in silence
([#1168](https://github.com/rig-c/core/issues/1168)); its notes and its
`CHANGELOG.md` entry now open with the paragraph that should have been there.
The drafting tooling outside this tree refuses a negative-form draft without
one since 2026-10-05.

🕳️ Nothing in this repository writes or reads a release body — the notes are
drafted over release-please's generated list — so no selftest control holds
this rule. `CUR31` and `CUR112` read this document, and each holds it to a file
in the tree that performs what it states (`release.yml`, the smoke's
`--help`, `ci.yml`); the release body has no such file here. The tooling that
drafts the notes is outside this tree: it runs the comparison above before the
notes are written, and refuses the positive form unless `compare` reads
`IDENTICAL` and the tracked base is unmoved.

### The build report's `spec` is a contract too

`build --report` and `repack --report` write a JSON document whose `spec` is
`build-report/1` ([#1213](https://github.com/rig-c/core/issues/1213),
`docs/AUTHORING.md` §5.3). A dependant reads its build verdict and its packing
figures from that document instead of from the printed sentences, so the
`spec` is a promise of the same kind as the byte-identity sentence above: a
string a program outside this tree decides on.

- **Additive under the same spec.** A field may be added to `build-report/1`
  in any release. A field that is renamed, removed, retyped or made to mean
  something else moves the spec (`build-report/2`), and a release that moves
  it is a breaking change whose notes carry a `**Migration:**` paragraph
  saying which field moved and where its old meaning is read.
- **The printed sentences are not promised by it, and do not move with it.**
  The lines `build` prints stay what `docs/AUTHORING.md` documents them as;
  the flag changes none of them (`BR03`).
- **Held, not stated.** `BR09` holds the document's keys to the census of what
  a dependant reads, and names a key outside it, so a field added without a
  row there is red before it is released; `BR01`, `BR02`, `BR05` and `BR08`
  hold every value to the lines the same run printed, and `BR04` holds two
  documents of one build byte-identical.

## Publishing

**Automated, on the release push.** The second `release` run — the one that tags
`vX.Y.Z` — resolves that tag to a full commit SHA, requires it to match the
run's `GITHUB_SHA`, and gates and publishes that verified commit. It authenticates over OIDC (npm
trusted publishing): the runner exchanges a short-lived GitHub token for a
publish grant, so there is no `NPM_TOKEN` in this repository and no OTP to type.
That is what `id-token: write` in the `publish` job's permissions is for, and it is also
what lets the publish carry `--provenance`. The registry side of it is
configured — the fields are recorded below, and nothing there is outstanding.

**The canonical npm package is `@rig-c/core`.** `rig-c` is the checkout
manifest name the publish packs from and the convenience install name;
`spine-rigc` is the legacy install name. Do not retry the short name `rigc`.
The first publish of `rigc@0.2.0` was refused by the registry
with `403 Package name too similar to existing packages rc,rfdc,bigi`, which is
a registry-side rule no account setting or flag overrides, and npm support
confirmed on 2026-10-09 that no manual exception exists; the scope `@rigc` is
held by an existing user. So the package shipped as `spine-rigc` — `0.2.1` by
hand, before the automation existed, and every version after it the
workflow's — until issue [#1258](https://github.com/rig-c/core/issues/1258)
renamed it `rig-c`: the project's own name with the one hyphen the filter
needs, and no third party's product name in it. When the repository moved to
the `rig-c` organisation as `rig-c/core`, issue
[#1347](https://github.com/rig-c/core/issues/1347) added `@rig-c/core`: the
same package under the toolchain's npm scope, beside `@rig-c/parts` and
`@rig-c/play`. `@rig-c/core` is the name to install. `bin` installs the
command as `rigc` under any of the three names.

`spine-rigc` is **an alias, not a retirement**. The workflow also publishes
`@rig-c/core` through its alias-packing step; that mechanism does not change
which name is canonical. The workflow publishes each release under all three
names, with the same product files. `rig-c@2.20.4` went up by hand from the
registry's own `spine-rigc@2.20.4` tarball with the `name` line changed and
nothing else (213 files, the same list); every version after it is the
workflow's, every name from one run. The two tarballs never share a
`dist.shasum` — one line of one file differs by design — so "the same files"
is read off the unpacked tarballs, path by path and byte by byte, with the
manifest's `name` line the one permitted difference: `scripts/alias_tarball.ts
compare` is that reading, and on the two 2.20.4 tarballs as the registry
serves them it reads 213 of 213 files the same. `rig-c` also lists a
`0.0.0-stage` version npm created while it processed that first publish; it
is npm's, and it is left alone.

**How the other names are published.** After `npm publish` has published `rig-c`
from the checkout — gated by `prepublishOnly`, below — the next steps of the same
job, one per alias, run `bun scripts/alias_tarball.ts pack --name <alias> --out
"$RUNNER_TEMP/alias-<alias>"`: each packs the same checkout, extracts the tarball into the
runner's temp directory, rewrites the one `"name"` line of the extracted
`package.json`, packs that again, and prints the path only after `compare`
reads it as the package's files. `npm publish <that tarball> --provenance
--access public` publishes it — `--access public` is what keeps the scoped
`@rig-c/core` from publishing restricted, which is npm's default for a scope.
The scoped name changes nothing else in that path: `npm pack` names its tarball
`rig-c-core-<version>.tgz`, and neither the tool nor the smoke reads a
tarball by its file name. The
checkout is never modified, so the confirmation reads the tree the gate read.
**No lifecycle script runs on the alias, by design:** `npm publish <tarball>`
runs none, and a second `prepublishOnly` could not mean anything — renaming the
package in the checkout leaves the tree modified, which the tally reader
refuses (`TALLY_DIRTY`), so it would run the whole selftest again over a tree
that is no longer the commit the gate ran at. The gate's verdict is about this
commit, and each alias is this commit's files. `CUR122` holds `release.yml` to
that order and to the alias names `ALIASES` in `scripts/alias_tarball.ts`
states — one step per name, and every name in both confirmation calls, so
dropping either alias from the publish or from a confirmation is red — and
`CUR121` drives the tool under every name and the confirmation's reading of
each alias over fakes that differ each way they can.

**An alias is kept, and never retired by a release step** ([#1278](https://github.com/rig-c/core/issues/1278)). It stays for as long as links from outside this repository point at it — the npm page, forum threads, articles, badges other READMEs copied — and it never gets a version of its own: every cut publishes every name from one run, or none. Retiring it (deprecating, un-publishing, letting the name fall behind the package's version line) is not a release step and not a convention; it is a separate card that opens only after three things are written down in it: **npm history** — what is lost when the alias stops (download history, the package page, the provenance links of every version published under it); **external links** — an inventory of what points at the alias name and where each resolves after the rename and after a retirement (GitHub redirects the repository URL; nothing but the alias covers the npm page); and **what the alias says** — one sentence in the README naming the package's current name, and no `npm deprecate`, because a banner on every install is a retirement wearing an alias's name. The same policy holds for every package of the toolchain (`spine-rigc` → `rig-c`, `spine-parts` → `rig-parts` → `@rig-c/parts`, `spine-html` → `rig-play` → `@rig-c/play`).

`prepublishOnly` runs `scripts/prepublish_gate.ts` before npm packs anything,
so a tree that fails its own gates cannot be published — by the workflow or by
hand. It runs `bun run typecheck` and `bun run lint` and then the selftest, the
same gate CI runs on
every push, and they run over the same corpus: the publish job runs
`bun run fetch-examples` before `npm publish`, as each of the shard jobs runs it
before its share of the selftest. The selftest comes by one of two paths:

- **`RIGC_PREPUBLISH_TALLY` unset** — by hand, or anywhere else — the full
  selftest in this process, `bun run selftest`, which is what `prepublishOnly`
  ran before issue #1249.
- **`RIGC_PREPUBLISH_TALLY=<path>`** — the release run — the merged tally
  document the run's `gate` job wrote, read and held to the tree being
  published. It is accepted only when its commit is that tree's
  `git rev-parse HEAD`, the tree has no change against that commit, the
  `selftest.ts` that wrote it is the one on disk, every shard of its declared
  count is in it once and exited 2 over no FAIL line, the merge exited 0 over
  no FAIL line, and every registered suite is in it exactly once. Anything else
  — no file, a file that is not one, another commit, a red, partial or
  inconsistent tally — prints each reason under its name (`TALLY_COMMIT`,
  `TALLY_DIRTY`, `TALLY_SOURCE`, `TALLY_SHARD_MISSING`, `TALLY_SHARD_RED`,
  `TALLY_MERGE_EXIT`, `TALLY_FORGED`, `TALLY_SUITE_MISSING`, `TALLY_SPEC`,
  `TALLY_ABSENT`) and runs the full selftest instead. There is no other
  variable, flag or shortcut: the variable names evidence that is checked, and
  evidence that does not check out is a reason to run the gate, never to skip
  it. `TY46` drives the reader over the merge's own document and one plant per
  refusal.

**Reading the publish step's log.** On the accepted path the step prints, after
typecheck and lint,

```text
prepublish: accepted tally <path> for <sha>: <n> suites, <m> case lines, 0 FAIL
```

— `<sha>` is the commit the gate ran at and this tree is at, `<n>` the
registered suites and `<m>` the case lines the merged run printed. A step that
prints `prepublish: the tally RIGC_PREPUBLISH_TALLY names was NOT accepted, so
the full selftest runs:` followed by its reasons is the fallback: the publish
is still gated, by a one-process selftest in this job, and takes the ~19 minutes
that costs. That is a cut to read, not one that went wrong — the reasons say
which clause the tally failed.

**What runs where.** `release.yml`'s release push is `plan` (release-please:
the release commit, the tag, the GitHub release) → `gate` (the selftest as six
shards and their merge, `selftest-shards.yml`, on the verified push SHA — the same reusable
workflow `ci.yml` calls on every change, so the two cannot drift; `CUR120`) →
`publish` (check out that verified push SHA, fetch the corpus, download the
`selftest-merged-tally` artifact, `npm publish` with `RIGC_PREPUBLISH_TALLY` set
on that step alone, then the alias's publish from the tarball
`scripts/alias_tarball.ts` packs) → the confirmation of both names. `CUR119` holds that order, the one
condition `gate` and `publish` run under — `plan`'s resolved `publish` output,
whichever event resolved it — the OIDC token on `publish` alone, release-please
held to a push, and what each dispatch reaches: a `version` dispatch reaches
`confirm` only, and a `tag` dispatch runs `plan`'s resolve step, then `gate`,
then `publish` (*Republishing a cut whose publish failed*, below). The publish job fetches the corpus
even when the tally is accepted, because the fallback has to read the tree the
gate read. Without `examples/` the core suite's corpus controls are red rather
than HOLEs — a construct no row reaches is never a pass — so a publish gate with
no corpus measures a different environment from the one CI admitted every
commit in, and v1.6.0 was tagged and then refused by it on exactly those
controls (issue #1003). `CUR112` holds the two workflows to that order. ⚠️ The
tag and the GitHub release exist before `gate` runs, as they did before the
publish's own selftest: a red gate leaves a tagged, released, unpublished
version — the shape v1.6.0 was left in, and the one a dispatch now repairs.
There is no build step to guard: the package ships its TypeScript sources and
bun runs them.

### Republishing a cut whose publish failed

a release-please failure after the tag leaves a version unpublished; the next cut carries it, or the tag is republished by dispatch.

It happens when the run that merged the release pull request gets as far as
the tag and the GitHub release and then stops before the publish lands: a red
`gate` (v1.6.0, above), or — on another package of the toolchain — a transient
signing-service `502` from `npm publish --provenance` (issue
[#1504](https://github.com/rig-c/core/issues/1504)). Re-running that run cannot
recover it: release-please no longer reports `release_created` for a tag it has
already cut, so `gate` and `publish` are skipped and the registry keeps serving
the previous version. A push re-run can also cut a tag at a newer commit than
that run's original `GITHUB_SHA`; the tag existing does not prove the run's
provenance names its commit. A publish by hand would lose provenance, and the trusted
publisher of every name is pinned to `release.yml`.

**Source provenance has to name the checkout.** npm records `GITHUB_REF` and
`GITHUB_SHA` from the workflow run in its provenance, not the commit that
`actions/checkout` later selects. Dispatching on `main` while checking out an
older tag therefore names `main`'s commit as the source of the tag's files.
Before any publish — `rig-c` or either alias — the publish job compares
`GITHUB_SHA` to `git rev-parse HEAD` on a `workflow_dispatch`. If they differ,
it fails with `PROVENANCE_SHA_MISMATCH`, naming both full SHAs, and no publish
runs. This dispatch guard is unchanged.

On a push that created a release, `plan` resolves the cut tag through
`gh api "repos/$REPO/commits/refs%2Ftags%2F$CUT_TAG" --jq .sha`: the commits API peels
the observed annotated tag to its commit instead of returning its tag-object
SHA, and the full `refs/tags/` namespace avoids a same-named branch. The shorter
`commits/tags%2F...` spelling is insufficient: a read-only check on `git/git`'s
annotated `v2.45.0` returned HTTP 422 there, while the full namespace resolved
commit `786a3e4b8d754d2b14b1208b98eeb0a554ef19a8`; the lightweight core
`v2.67.1` full ref resolved `ebf243299d5edba458726fd359e84947ded01a7b`. These
are specific API observations; the workflow mocks model them rather than proving
live API behavior. Lookup failure, a missing or
invalid full SHA, or an invalid stable cut-tag spelling fails closed as
`RELEASE_TAG_UNRESOLVED`. Before emitting `publish=true`, the plan compares
that full SHA with `GITHUB_SHA`. A difference is `PROVENANCE_SHA_MISMATCH`,
naming both SHAs, saying the tag remains cut and printing the exact tag-ref recovery command below with the actual tag.
Neither `gate` nor any of the three publishes can start on that refusal. Both
`gate` and the publish checkout use the verified full SHA, so a moved tag is
not resolved again on a push. A matching push follows the same gate and all
three publishes; a push with no newly created release performs no lookup and
publishes nothing. Dispatch retains its existing refusal order and tag/HEAD
semantics. This refuses a mismatched attestation; it
does not rewrite the run's provenance variables or re-attest a published version
(issues [#1542](https://github.com/rig-c/core/issues/1542) and
[#1551](https://github.com/rig-c/core/issues/1551)). `CUR133` executes the
resolve, dispatch guard and publish bodies with closed command mocks, including
annotated tags, a mismatched re-run, failed lookups and each dispatch refusal.
It also holds both push consumers to the verified SHA. These are mocked workflow
readings; they do not cut a live tag or publish a package.

**Only dispatched refs containing the guard can enforce it.** GitHub runs
`release.yml` from the dispatch's selected ref. A tag whose workflow predates
this fix cannot acquire it by checking out newer code or by changing `main`.
For a tag that contains the fix, dispatch on that tag explicitly so the run's
SHA and checkout agree:

```sh
gh workflow run release.yml --ref vX.Y.Z -f tag=vX.Y.Z
```

Another dispatched ref can pass only when it contains the guard and resolves
to the same commit as the requested tag. A current `main` carrying the guard
will refuse an older tag when those SHAs differ; selecting the old tag instead
would run its old, unguarded workflow. Such a historical cut is not repaired by
this fix: leave it for the next cut or obtain a separate recovery decision.
The guard neither changes trusted-publisher settings nor authorizes an old
workflow to publish.

`plan` then skips release-please — it is a step held to a push, so a dispatch
never cuts a tag or a release — and its *Resolve the tag to publish* step checks
the tag. Everything after it is the push path's own: `gate` (the six shards and
their merge over the tag), then `publish` (checkout of the tag, the dispatch
provenance check, the corpus, the merged tally, the publish under all three
names, the registry confirmation),
under the same condition — `plan`'s `publish` output — from the same file. There
is no path from the dispatch to `publish` that does not pass `gate`. The resolve
step refuses, each as one `::error::` line naming its rule, and the refusal
fails `plan`, so nothing after it starts:

| refusal | when |
| --- | --- |
| `RELEASE_DISPATCH_INPUT` | the dispatch gave both `tag` and `version`, or neither |
| `RELEASE_TAG_FORM` | the tag is not `vX.Y.Z` (or `vX.Y.Z-<prerelease>`) |
| `RELEASE_TAG_PRERELEASE` | the tag carries a prerelease (`vX.Y.Z-<prerelease>`): this workflow publishes under `latest` only (*Below latest*) |
| `RELEASE_TAG_UNRELEASED` | the tag has no GitHub release: only a tag release-please cut is published |
| `RELEASE_ALREADY_PUBLISHED` | the registry already serves that version of `rig-c` |
| `RELEASE_TAG_BELOW_LATEST` | the version is below the registry's `latest` for `rig-c` (a prerelease is below its release) |

**Two inputs, one per dispatch.** `tag` publishes a cut tag; `version` re-runs
a confirmation (*Whether the tarball runs*). Both are optional, because GitHub
refuses a dispatch that omits a required input; an omitted string input reads
as empty. The `confirm` job runs only on a dispatch with `version` and no `tag`,
and `plan` does not run on one; any other dispatch runs `plan`, where the
resolve step resolves a `tag` alone and refuses the rest. `CUR131` holds that
shape, each refusal's name and order, and this section.

**One run publishes at a time.** A push cut and a `tag` dispatch share one
concurrency group, `release-publish`, with nothing cancelled: a `tag` dispatch
queues behind a cut in flight, and a cut behind a republish, so two runs never
reach `publish` together. A `version` dispatch publishes nothing and runs in
`release-confirm`, so a confirmation does not queue behind either. The ref is
not in the group — the registry is one per package, and a dispatch may name any
ref. `CUR132` evaluates the group over a push, a `tag` dispatch and a `version`
dispatch, and holds the first two to one group and the third to another.

**Half-published.** The aliases `spine-rigc` and `@rig-c/core` are published
after `rig-c`, in the same job, so a failure between those steps leaves the
version up under the package name and missing under one alias or both.
`RELEASE_ALREADY_PUBLISHED` reads the package name only, so such a version is
refused rather than published again: a second `npm publish` of the package's
version is refused by the registry anyway (*You cannot publish over the
previously published versions*), and the alias steps run only after it. The
missing alias version is published by hand from the tag with the tarball
commands in *If the automation is unavailable* (without provenance), or left
for the next cut, which publishes every name.

**Below latest.** `npm publish` refuses to put `latest` on a version lower than
the highest one published unless a `--tag` is given — *Cannot implicitly apply
the "latest" tag*, read in the publish command of npm 12.2.0, the version
`npm@latest` installs at this writing — and the publish steps here pass no
`--tag`. So once a later version is cut, the dispatch refuses the older tag by
name, `RELEASE_TAG_BELOW_LATEST`, naming the tag and the `latest` served,
before anything is checked out or published; it is never attempted silently.
Such a version goes out, if at all, under a dist-tag, which this workflow has
no path for. The comparison is semver order computed in `node` (a prerelease
below its release), not `sort -V`, which sorts `1.0.0-rc.1` after `1.0.0`.

A prerelease tag is refused outright, `RELEASE_TAG_PRERELEASE`, right after the
form check, rather than published under a dist-tag. The form check still admits
the `vX.Y.Z-<prerelease>` spelling so that this refusal can name the tag. Without
it, a prerelease above the registry's `latest` would pass every other refusal
and be published under `latest`, because the publish steps pass no `--tag`. The
push path has never needed one: release-please here runs `release-type: node`
with no prerelease configuration, none of this repository's tags is a
prerelease, and the registry carries the one dist-tag `latest`. So there is no
dist-tag variant of this dispatch. If release-please is ever configured to cut
prereleases, the card that does so adds the `--tag` path to the publish steps
and removes this refusal, together.

### The registry side (owner, npmjs.com)

It cannot be done from here, since it needs the account. Recorded so the
settings can be checked or rebuilt: **one form per name**, because npm keys a
trusted publisher to the package. npmjs.com → **rig-c** → **Settings** →
**Trusted Publisher** → *GitHub Actions*, and the same under **spine-rigc**
and **@rig-c/core**, each filled in as

- Organization or user: `rig-c`
- Repository: `core`
- Workflow filename: `release.yml`
- Environment name: *blank* (the workflow declares no environment; a value here
  that the workflow does not match rejects the publish)
- Allowed actions: `npm publish`

`spine-rigc`'s form has published every automated cut since v0.4.0, and `rig-c`'s
every automated cut since it was registered — both from the repository's
path under the owner's account until issue [#1347](https://github.com/rig-c/core/issues/1347). npm matches the
repository named in the workflow's OIDC claim, so after the move each form has
to be re-pointed at `rig-c` / `core`, and `@rig-c/core`'s exists only after
the scoped name has been published once by hand; all three are the owner's.
Until they are, a publish is refused on authentication — the package's own
first, so the alias steps after it never run and a cut waits for the forms
rather than going out under fewer names.

The fields are case-sensitive and npm does not validate them on save, so a typo
would only surface as a failed publish.

**Settings → Publishing access → Require two-factor authentication and disallow
tokens** is on. It costs the automation nothing: trusted publishing presents no
token at all, so there is none for that setting to disallow. What it closes is
the unattended path — a token sitting on a machine, publishing without a human.
The interactive fallback below still works, because an OTP is exactly what the
setting asks for.

Two properties of that configuration are load-bearing in the workflow:

- Both publish steps must live in **`release.yml`**. Renaming the file, or
  moving either publish into another workflow, breaks that name's trusted
  publisher until its form is updated to match.
- It must run on a **GitHub-hosted runner**. npm does not support trusted
  publishing from self-hosted runners, so this job never moves to a private
  machine.

Confirm a cut afterwards: `npm view rig-c version`, `npm view spine-rigc version` and `npm view @rig-c/core version`.

**The exchange is proven.** **v0.4.0** and **v0.5.0** both published automatically
over OIDC, with provenance attestations, from release runs `32944316689` and
`33155874461` — everything up to the registry was always testable here, the
token swap itself was not, and those two cuts are what settled it. Still watch a
cut: **Actions → release →** the run for the release commit,
step *Publish to npm*. A rejection there names its own cause; a mismatch against
the trusted publisher above is the first thing to re-read, since npm matches the
`workflow_ref` claim — repository and workflow filename — and accepts no
approximation of it. If it ever fails on authentication rather than on a mismatch,
try dropping `registry-url` from the `setup-node` step: it exists only to write
an `.npmrc`, and the `.npmrc` it writes carries a `NODE_AUTH_TOKEN` placeholder
that nothing sets. The fallback below is a contingency for that case, not a
parallel path.

### What the tarball contains

`files` in `package.json` is an allowlist, so the published package is the
runtime, the guides an authoring agent reads, and nothing else. The benchmark
corpus, the reference frames, the selftest, the fixtures and the measuring tools
stay in the repository: they are the yardstick, not the tool.

⚠️ **The list is not written out here, and that is deliberate.** It was, and it
drifted for twenty-one days: the paragraph was written on 2026-08-23 with #68 and
never touched again, while **twelve** entries joined the allowlist under it
between 2026-08-29 and 2026-09-05 — `bin/rigc.cjs`, four more `tools/` modules,
five more guides, `.claude-plugin` and `skills`. It went on describing a
two-guide package. A hand-kept copy of a machine-readable list is the
`✅ applied` antipattern with a different subject, so **ask the tool** (and
`git log -S '"<entry>"' -- package.json` for when one arrived):

```sh
npm pack --dry-run          # the file list and the size
npm pack --dry-run --json   # the same list, one object per file
```

⭐ **`npm pack` and the `files` array are not the same answer** — measured on
`v0.20.0`, npm packs **55** paths where a literal expansion of the array yields
**52**, because npm always adds `package.json`, `README.md` and `LICENSE`
whatever the allowlist says. The `ships` job reads the first of those two, for
that reason.

#### What an install has, and which entry it runs

`@esotericsoftware/spine-core` is a **devDependency** (issue
[#1061](https://github.com/rig-c/core/issues/1061)): `bun install` in a clone
and in CI installs it, and an install of the package does not. Every module still
ships — the runtime-linking ones included — so the difference is in which entry
the installed `rigc` runs, and `bin/rigc.cjs` decides it by one fact: whether the
runtime resolves from the package's own location.

| an install with | `rigc` runs | `rigc --version` prints (stdout, then stderr) |
| --- | --- | --- |
| no `@esotericsoftware/spine-core` (what `npm install rig-c` gives) | `cli_core.ts` — `build` and `repack` (gated without the parse, `A00_ROUNDTRIP_PARSE` a SKIP), `explain`, `ingest`, `split`, `diff`, `check`, `render`, `inspect`, `texture-scale`, `pose`, `chainfit`, `guide`, `skills`, `review`; every other command refused by name | the version, then `entry: cli_core.ts — @esotericsoftware/spine-core absent — …` |
| `@esotericsoftware/spine-core` installed beside it | `cli.ts` — every command, `build` through the round trip | the version, then `entry: cli.ts — @esotericsoftware/spine-core <version> present` |

The commands in the first row are the set the command table derives — a
`runtime` of `false`, or one carrying a body of its own for this entry — and
`CUR117` holds the row to that set in both directions.

No environment variable and no flag chooses the entry. `CUR113` holds that
`cli_core.ts`'s static closure, within what `files` ships, reaches none of the
modules that import the runtime and none of the modules registering a command the
command table marks as needing it; `CUR114` holds that `cli.ts` reaches every one
of those linkers; `CUR115` holds the manifest (the runtime only in
`devDependencies`, at the version `bun.lock` resolves) and runs the launcher in a
copy with and without the runtime beside it.

`publishConfig.provenance` is deliberately **not** set. Provenance can only be
attested from a run holding an OIDC token, so setting it in `package.json` would
fail the manual fallback below; the workflow passes `--provenance` on the
command line instead, where it applies to the automated publish only.

#### The import surface

`exports` in `package.json` is the second allowlist: `files` decides what is in
the tarball, `exports` decides what a dependant may import out of it. The
**named entries are the API**, and an entry is named because a dependant was
observed needing the module behind it — the map is the list, and this table
adds what the map cannot say. Each entry is spelled under the package's name;
an install of an alias carries the same map, so `spine-rigc/plate` and
`@rig-c/core/plate` are the same entry as `rig-c/plate`:

| entry | named by | needs installed beside the package |
| --- | --- | --- |
| `rig-c/plate` | [#859](https://github.com/rig-c/core/issues/859) | nothing |
| `rig-c/font5x7` | [#859](https://github.com/rig-c/core/issues/859) | nothing |
| `rig-c/transform` | [#859](https://github.com/rig-c/core/issues/859) | nothing |
| `rig-c/render` | [#1167](https://github.com/rig-c/core/issues/1167) | `@esotericsoftware/spine-core` |
| `rig-c/render-shared` | [#1561](https://github.com/rig-c/core/issues/1561), agreed for parts#713 | nothing; Spine inputs require the explicitly registered `rig-c/render` side |
| `rig-c/png` | [#1167](https://github.com/rig-c/core/issues/1167) | nothing |
| `rig-c/compile` | [#1167](https://github.com/rig-c/core/issues/1167) | nothing |
| `rig-c/rig` | [#1212](https://github.com/rig-c/core/issues/1212) | nothing |
| `rig-c/mesh` | [#1212](https://github.com/rig-c/core/issues/1212) | nothing |
| `rig-c/errors` | [#1212](https://github.com/rig-c/core/issues/1212) | nothing |
| `rig-c/meshcompare` | [#1230](https://github.com/rig-c/core/issues/1230), [#1595](https://github.com/rig-c/core/issues/1595), by agreement | nothing |
| `rig-c/core` | [#1275](https://github.com/rig-c/core/issues/1275) | nothing |
| `rig-c/runtime` | [#1591](https://github.com/rig-c/core/issues/1591), requested for play#200 — **experimental, not promised until it stabilises** | nothing |
| `rig-c/cli` | [#859](https://github.com/rig-c/core/issues/859) | resolved and spawned rather than imported; which entry it runs is the table in *What an install has* above |
| `rig-c/package.json` | [#859](https://github.com/rig-c/core/issues/859) | nothing |

The CLI observation surface is promised by agreement for parts#839 before its
adoption (#1642):

| CLI surface | promised outputs | runtime requirement |
| --- | --- | --- |
| `rigc render --extremes-only` | Same `extremes.json` and readable `extremes.png` bytes as `--extremes`, per selected set; no ordinary frames, contact sheet or `frames.json`. Existing posing, subset and viewport options apply; other diagnostic/sheet output flags are refused by name. | rigc builds use the core entry; Spine exports require the runtime as for `render` |

⚠️ **Three things are spelled `rig-c/core`, and they are different things.**
The **import** `rig-c/core` is the row above: one entry of this package, the
posing core, the `./core` key of `exports`. The **package** `@rig-c/core` is
the whole of this package under the toolchain's npm scope — an alias of
`rig-c` with the same files (*Publishing* above, issue
[#1347](https://github.com/rig-c/core/issues/1347)) — so installed under that
name the same entry is imported as `@rig-c/core/core`; `@rig-c/core` on its
own names no entry at all, since `exports` has no `.` key. The **repository**
[`rig-c/core`](https://github.com/rig-c/core) is where this tree lives on
GitHub. The entry was not renamed when the other two arrived, and nothing about
it changed: an import is always written in code with the package name in front
of the entry, so the first two never meet in one specifier.

🔒 **The contract.** Renaming or removing a named entry, **or a symbol the
smoke lists for it**, is a breaking change — and so is a listed symbol
changing kind, from a function to a constant or back. The file behind an
entry may move: the entry moves with it, and that is not breaking. The
symbols are listed once, in `OBSERVED_SYMBOLS` in
[`scripts/install_smoke.ts`](scripts/install_smoke.ts), each row naming the
dependant and the issue it was observed in, and the smoke imports every entry
from the install and reads every listed symbol as present with the kind it has
today. A rename goes red naming the entry and the symbol — its
`rename-symbol` plant renames `loadPosable` in the packed
`src/render.ts`, a symbol no module inside the package imports, so the
package still runs and only the probe can tell — and a removed entry goes
red naming the entry (`drop-named-entry` takes `./render` away, and
`drop-rig-entry`, `drop-mesh-entry` and `drop-errors-entry` each take one
of the three #1212 named, `drop-meshcompare-entry` the one #1230 named, and
`drop-core-named-entry` the one #1275 named). The list grows by observation: a module or a symbol
nobody was seen using is not promised, however public it looks, and one that
somebody is seen using is added to that table with their name and the issue
— a later observation of an entry already listed is a row of its own, so
each row still says when its symbols were first seen.

What the three #1212 named promise, as observed in rig-parts 0.14.0 — every
import of the package anywhere in its tree, its `src/` and its dev files
alike:

| entry | values held | types observed |
| --- | --- | --- |
| `rig-c/rig` | `parseRigSpec`, `splitRigSkin`, `RIG_SPEC_VERSION`, `RIG_SKIN_CONSTRAINT_KEYS`, `RIG_KEYS` | `RigSpec`, `RigBone`, `RigConstraint`, `RigSkin`, `RigSkinConstraintKey` |
| `rig-c/mesh` | `traceAlphaOutline`, `traceOutline`, `earClip`, `offsetPolygon`, `prunePolygon`, `simplifyClosedPolygon`, `signedArea`, `findSelfIntersection`, `checkHullOrder`, `measureAuthoredMeshFit`, `MeshError` | `AlphaMask` |
| `rig-c/errors` | `CompileError` | — |

and, through `rig-c/transform`, `computeExactFrameTransforms`,
`normaliseDegrees` and `toWorld` beside the three #1167 listed. The table in
the smoke is the one that is checked; this one is its reading for a person.

A later observation of the same entry is its own row, as the rule above says:
rig-parts's automatic mesh mode (its `c03dd8a`, PR #131) was read calling
`reduceMesh` with the types `SourceMesh` and `RefinementRegion` from
`rig-c/mesh`, which the agreed row had not recorded — found by rigc#1238's
D1 over the installed package, recorded by #1241. Every other import that
package makes goes through the `./*.ts` courtesy keys, which the surface
paragraph above already says are not promised.

🤝 **Agreed rows are promised before observation**
([#1224](https://github.com/rig-c/core/issues/1224)). Through
`rig-c/mesh`, `measureMeshQuality`, `writeMeshQualityReport`,
`MeshReductionError`, `MESH_QUALITY_REPORT_SPEC` and `reduceMesh` are held, and
the report's and the reduction's types recorded, because the dependant agreed in writing to import them from
that entry before either side had written them (docs/MESH_REDUCTION.md, P1;
rig-parts#126) — a contract nobody can be observed using yet, which renaming
would still break. The row says so in place of an observation
(`AGREED_IN_1224`). The later agreed rows follow the same rule: a written
dependant contract can precede use; a symbol that is merely exported is not
promised.

The segments preflight is also promised by agreement
([#1450](https://github.com/rig-c/core/issues/1450), parts#378), through
`rig-c/mesh`. A dependant preflights with the functions the compiler calls,
rather than maintaining a second lattice, distance or reach rule:

| promised signature | return and units |
| --- | --- |
| `buildSegmentsLattice(input: {mask: AlphaMask; threshold: number; cell: number}): SegmentsLattice` | Part-local pixel points, y down; dimensionless six-decimal UVs; triangle indices, hull vertex count and cell/pass/island counts. `alpha` and `threshold` are alpha bytes; `cell` is whole pixels, at least one |
| `segmentDistance(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number` | Non-negative distance to the finite segment, including a zero-length segment as its point. All points share a coordinate frame and length unit; the result uses that unit |
| `influenceShares(p: readonly [number, number], segments: readonly EntrySegment[], influence: SegmentsInfluence): InfluenceShares` | Dimensionless weights on the six-decimal grid closing at one, in first-named bone order, and pre-cap in-reach count; or nearest bone/distance when no link reaches. Points/endpoints share a frame and `radius` its length unit. A segment's `bone` indexes the distinct mesh-bone list, `entry` the authored segment entries; returned weights use `bone: 'control'` and `control` for that index |

The compiler measures these points and distances through its exact setup frame
in part pixels. The module's doc blocks state the same contract; the optional
fourth `influenceShares` argument is a selftest plant, outside the promised
three-argument preflight call. The row records `SegmentsLattice`,
`SegmentsLatticeReport`, `EntrySegment`, `SegmentsInfluence` and `InfluenceShares`
as the signatures' types. The installed-package smoke calls all three against
an actual `segments` build: lattice vertex count, an authored integer distance
in the compiler's nearest-link refusal, and emitted vertex shares within
`1e-12`. Its `drop-mesh-entry` plant removes this named surface while leaving
compiler-relative imports working, and must name each of the three missing
functions as well as the entry.

`ArtFitBounds.maxOvershoot` and `maxUndercut` widened from `number` to
`number | null` ([#1254](https://github.com/rig-c/core/issues/1254)) is
additive: a dependant that passes numbers type-checks and is read exactly as
before, and only a caller that writes `null` gets the new meaning
(docs/MESH_REDUCTION.md, §1 *A distance bound may be declared absent*).

`measureAuthoredMeshFit`'s optional fifth argument, `connectivity: 4 | 8`
([#1262](https://github.com/rig-c/core/issues/1262)), is additive on a
promised symbol: it defaults to 4, so a call with four arguments is read
exactly as before — the install smoke's call of it is unchanged and holds the
same values — and only a caller that passes `8` gets the rows' fill
(docs/MESH_REDUCTION.md, §4, P12).

Replay to an accepted step ([#1268](https://github.com/rig-c/core/issues/1268))
is additive on the agreed row's types: `ReductionChanges.acceptedAt` is a new
key, written last in `changes`, and `MeshReductionInput.stopAfterAccepted` an
optional input that, left out, leaves the mesh, `accepted` and every other
report byte as before (measured on 19 recorded inputs), while a caller that
sets it may meet a new `Termination` reason, `replayed-to-accepted-step`
(docs/MESH_REDUCTION.md, §7 *Mechanism 2*).

Boundary runs and `acceptedAt` per operation
([#1279](https://github.com/rig-c/core/issues/1279)) change the shape of
one key of the agreed row's types, agreed by its only reader
(rig-parts#126, §8 Q10): `ReductionChanges.acceptedAt` goes from `number[]`
to `AcceptedOperation[]`, `{ step, kind, count, sourceVertices }`, and a
reader of the attempt number reads `.step`. A call without the new optional
`MeshReductionInput.boundaryRuns` tries no run, every entry has `count: 1`,
and every other byte of the mesh and the report is as before — measured on
the 18 inputs of the stage-D1 record at 2.20.0. The deviation floor the same
landing adds refuses no candidate the rows would accept: every result was
measured byte-identical with the floor and with every candidate measured,
18 of 18 without the field and 18 of 18 with it (docs/MESH_REDUCTION.md, §8
*Stage B — boundary runs as steps*). The record holds 18 inputs where §7
cites 19; §7's figure is its own measurement and stays as written.

The triangulation post-pass and the weight-aware removal order
([#1283](https://github.com/rig-c/core/issues/1283)) are additive on the
agreed row's types, agreed by its only reader (rig-parts#126, §8 Q3, Q9 and
Q11): two optional inputs, `MeshReductionInput.retriangulate` (`'delaunay'`)
and `MeshReductionInput.removalOrder` (`'deformation-load'`), each echoed in
`effective` only when set, and one new key written last in `changes`,
`retriangulation` (`Retriangulation`), only when `retriangulate` is set. A
call that sets neither writes the mesh and every byte of the report as
before — measured byte-identical against `b2503e4` on the 18 inputs of the
stage-D1 record, 18 of 18 without `boundaryRuns` and 18 of 18 with it
(docs/MESH_REDUCTION.md, §8 *Stage B — triangulation post-pass and
weight-aware order*). A caller that sets `retriangulate` gets triangles that
are no longer the removals', and a report that says so.

The amplitude on a reduction
([#1287](https://github.com/rig-c/core/issues/1287)) is additive on the
agreed row's types: one optional input, `MeshReductionInput.motionAmplitude`
(`MotionAmplitude | null`, the measurement's field from #1280), read by the
result's own measurement only and echoed in `effective` only when set. A
call without it writes the mesh and every byte of the report as before —
measured byte-identical against `5be70d8` on the 18 inputs of the stage-D1
record, 90 of 90 calls across no opt-in, `boundaryRuns`, `retriangulate`,
`removalOrder` and all three — and a call with it changes no mesh, step or
acceptance, only the two rows it measures and its echo, 54 of 54
(docs/MESH_REDUCTION.md, §8 *Stage B — the amplitude on a reduction*). The
validator it shares with the measurement, `validateMotionAmplitude`, is
merely exported, so by the rule above it is not promised.

The gradation left to the author and the comparison's amplitude
([#1291](https://github.com/rig-c/core/issues/1291)) are additive on the
agreed rows' types, asked for by their only sender (rig-parts#126, its STOP
on the rerun): `MotionAmplitude.gradation` widens from `number` to an
optional `number | null`, so an amplitude that sets it type-checks and is
read exactly as before, and one that leaves it out or sets `null` — refused
until now — is admitted, measures `MQ_DEFORM_LOAD` and leaves
`MQ_ALLOCATION_CONTRAST` `not-measurable` naming it; and
`MotionComparisonInput.motionAmplitude` (`MotionAmplitude | null`) is a new
optional input, handed to the setup measurement only and echoed in
`effective` only when set. A call that sets neither writes every byte as
before — measured against `32e5cc1` on the 18 inputs of the stage-D1 record,
108 of 108 reduction and measurement calls, and on `MQ79`'s ramp, 4 of 4
posed comparisons (docs/MESH_REDUCTION.md, §8 *G — what it derives from* and
*Stage B — the amplitude on a comparison*). A reader of `gradation` as a
`number` reads `number | null | undefined`. `ComparePlant` and
`compareMeshesInMotionPlanted` on `rig-c/meshcompare` are the suite's
plants, merely exported, so by the rule above not promised.

The region pixel set computed by scanline
([#1263](https://github.com/rig-c/core/issues/1263)) changes no promised
symbol and no output, and what it adds to the module behind `rig-c/mesh` —
`closedPolygonCentres` and `inClosedPolygon`, with `authoredMeshFitOf` from
#1262 and the two plant types — is merely exported, so by the rule above it is
not promised.

The skinning-envelope residual and its helper
([#1294](https://github.com/rig-c/core/issues/1294)) are additive on the
agreed row's types and add a row of their own. `MeshMeasureInput.skinning`
(`SkinningResidualInput | null`) is a new optional input; set, the report
gains one row, `MQ_SKINNING_RESIDUAL`, the key `MeasureRow.skinning` on that
row only, and `effective.skinning`, the echo. `skinningEnvelopeBone` — the
helper that turns declared rotation and scale ranges into an envelope entry,
which the dependant asked to be rig-c's so that both sides read one
definition of `linear` (rig-parts#126, Q3) — is held through `rig-c/mesh`
under the `AGREED_IN_1294` row, with `SkinningEnvelope`,
`SkinningEnvelopeBone`, `SkinningResidualInput`, `SkinningDetail`,
`SkinningEcho`, `BoneMotionRange` and `EnvelopeBoneRanges` recorded. A call
without the field writes every byte as before — measured against `e948469` on
the 18 inputs of the stage-D1 record, 70 of 70 reduction reports, meshes and
measurements (docs/MESH_REDUCTION.md, §7 *Mechanism 1 — implemented, the
measurement half*). `uvCarriers` is now defined in `src/meshcarriers.ts`
and re-exported from `rig-c/meshcompare` as it was, so the `AGREED_IN_1230`
row reads the same function. `skinningResidual`, `termsAt`,
`skinningSamplesOf`, `validateSkinning`, `sourceMeshDigest`,
`skinningEchoOf`, `SKINNING_READING`, the plant types and the two planted
entries (`measureMeshQualitySkinningPlanted`, `skinningEnvelopeBonePlanted`)
are merely exported, so by the rule above they are not promised.

The residual as a step condition of the reduction
([#1295](https://github.com/rig-c/core/issues/1295)) is additive on the
agreed row's types: `ReductionTargets.skinning` (`ReductionSkinning | null`,
`{ envelope, maxResidual }`) is a new optional field, measured against the
call's own `source`; set with a number, every removal, boundary run and
post-pass is held to `MQ_SKINNING_RESIDUAL` as well as to every row it was
held to before, the result's measurement carries that row, and
`effective.targets.skinning` echoes the field — `null` included — only when
the input set it. A call without it writes the mesh and every byte of the
report as before — measured against `cbf4012` on the 18 inputs of the
stage-D1 record, 128 of 128 reports and meshes across no opt-in, the three
other opt-ins together and a replay to the middle accepted step of each, and 8
of 8 measurements with #1294's field, whose carrier search now buckets the
samples (docs/MESH_REDUCTION.md, §7 *Mechanism 1 — implemented, the reducer
half*).
The field's type, `ReductionSkinning`, is reached through the recorded
`MeshReductionInput`; the smoke records no new name, because no dependant has
named one. What the reducer half adds beside it on `rig-c/mesh` —
`SkinningCarry`, `CarryPlant`, `CarryTally`, `CarryReading`, `CarryCheck`,
`CARRY_TOLERANCE`, `TermsMesh`, `SkinningContract`, `skinningContract`,
`sampleResidual`, `envelopeTerms`, `validateReductionSkinning`, and the
`reduceMeshWith` hooks `SkinningHooks`, `SkinningInspection` and
`SkinningVetoPlant` — is merely exported, so by the rule above it is not
promised; `carrierIn`, `resolveCarriers` and `CONTAINS` in
`src/meshcarriers.ts` are on no entry at all.

The over-bound report on a comparison
([#1315](https://github.com/rig-c/core/issues/1315)) is additive on the
agreed rows' types: `MotionComparisonInput.overBound`
(`OverBoundRequest`, `{ maxSamples, triangles }`) is a new optional input;
set, each candidate's report gains `CandidateReport.overBound`
(`OverBoundReport | null`) — the samples over each declared local-deformation
bound with the candidate triangle that carries them, and each triangle's
worst value of every declared motion row over the selection frames — and
`effective.overBound`, the echo. `null` is refused, as is any partial
request. A call without the field writes every byte as before — measured
against `5896cc7` on every call the `mesh-compare` suite makes without it, 165 of
165 (123 posed, 19 with no schedule, 23 refusals)
(docs/MESH_REDUCTION.md, §10 *Implemented — the over-bound report*).
`OverBoundRequest`, `OverBoundReport`, `OverBoundRow`, `OverBoundSample` and
`TriangleMaxima` are reached through the recorded `MotionComparisonInput` and
`CandidateReport`; the smoke records no new name, because no dependant has
named one. `OverBoundPlant`, a member of `ComparePlant`, is the suite's plant,
merely exported, so by the rule above not promised.

Named lines on a reduction and a measurement
([#1326](https://github.com/rig-c/core/issues/1326)) are additive on the
agreed row's types: `MeshReductionInput.lines` and `MeshMeasureInput.lines`
(`NamedLine[]`, `{ name, vertices, closed, maxDeviation }`) are new optional
inputs, with `MeshMeasureInput.lineSource` (`LineSource`, `{ id, mesh }`)
beside the measurement's; set, the report gains one `MQ_LINE_DEVIATION` row
per line, `MeasureRow.object.line` on those rows only, `effective.lines` (and
on a measurement `effective.lineSource`, by id and digest), and a reduction
may record `AcceptedOperation.kind` `'line-run'` under `boundaryRuns`; a
malformed value is refused `REDUCE_INPUT_LINE`, a new code. A call without the
field writes every byte as before — measured against `d0f289b` on the 18
inputs of the stage-D1 record, 54 of 54 reductions (as recorded and under the
three opt-ins together) and measurements, and 10 of 10 calls of the stage-A
fixtures (docs/MESH_REDUCTION.md, §11). `NamedLine` and `LineSource` are reached
through the recorded `MeshReductionInput` and `MeshMeasureInput`; the smoke
records no new name, because no dependant has named one yet — the row is added
when one is seen importing them. `validateLines`, `lineDeviation`,
`lineDeviationRows` and the `LinePlant` members of `ReductionPlant` are merely
exported, so by the rule above not promised.

What refused each kept vertex
([#1374](https://github.com/rig-c/core/issues/1374)) is additive on the
agreed row's types: `MeshReductionInput.explainKept` (`'by-row'` or
`'by-vertex'`) is a new optional input; set, `ReductionChanges` ends in
`kept` (`KeptRefusals`, `{ pass, rows, vertices? }`) and `effective` echoes
`explainKept`; any other value, `null` included, is refused
`REDUCE_INPUT_MISSING`. A call without the field writes every byte as before —
measured against `183928d` on 22 reductions of the blink fixtures (both
sources, the residual declared and absent, no opt-in, the three Stage B
opt-ins together, a replay, a budget cut, `protect.hull`, and a named line),
22 of 22 meshes and reports identical (docs/MESH_REDUCTION.md, §2). `KeptRefusals`,
`KeptRow` and `KeptVertex` are reached through the recorded
`MeshReductionInput` and `ReductionChanges`; the smoke records no new name,
because no dependant has named one yet. `reduceMeshWith`'s attempt observer,
which rig-parts read the same figures through, stays merely exported, and so
does `KeptPlant`, a member of `ReductionPlant`.

🤝 **The same agreement names a second entry**
([#1230](https://github.com/rig-c/core/issues/1230)). The contract puts the
motion comparison on an entry of its own, `rig-c/meshcompare`, and says
it needs nothing beside the package — the core is its only poser
(docs/MESH_REDUCTION.md, P1 and P2). Through it `compareMeshesInMotion` and
`uvCarriers` are held, and `MotionComparisonInput`, `BuiltCandidate` and
`CompareAttachment` recorded, under the `AGREED_IN_1230` row. Because the
promise is "no runtime", the call is held where that is true: with the runtime
taken away, the smoke runs one comparison from the install on the build it
just wrote — the flag mesh against itself (0 at every frame), against the same
document with one hull vertex moved (that distance, at every frame), and two
candidates under one id (refused as the `MeshReductionError` that
`rig-c/mesh` exports) — and holds the report to `operation: 'compare'`
and the core poser at the installed version
(`SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`, the
contract's `MQ45`). Its line prints the comparison's frames, samples and wall
time.

[#1595](https://github.com/rig-c/core/issues/1595) also holds
`prepareMotionReference` and `comparePreparedMotion`, with types
`MotionReferenceInput` and `PreparedMotionReference`, on that runtime-free
entry. The install smoke calls the pair and checks its self-comparison report
against the one-shot bytes. A prepared handle binds the reference model,
schedule, art bytes and every reference-side option; the candidate list is
supplied separately for each call.

🎞️ **An entry for the poser a browser player links**
([#1275](https://github.com/rig-c/core/issues/1275)). rig-play, the
successor of spine-html, poses `skeleton.model.json` with rigc's own core and
links no Spine runtime; it was seen importing the core's files through the
`./*.ts` courtesy, which promises nothing, and `rig-c/render` — the one named
entry that poses — needs the runtime. So `rig-c/core` names the poser:
`src/core/entry.ts`, a module that only re-exports, so the core's files keep
their names and the entry moves with them. Observed in rig-play, issue #1275
(`OBSERVED_IN_1275`):

| entry | values held | types observed |
| --- | --- | --- |
| `rig-c/core` | `readModel`, `underSkin`, `underNoSkin`, `CoreInputError`, `CORE_DOCUMENT_SPEC`, `CORE_DOCUMENT_SPECS`, `CORE_BLEND_MODES`, `activeBones`, `poseRawSetup`, `poseRawAnimation`, `poseRawAnimationEach`, `loopedTime`, `setupBounds`, `poseWalkSetup`, `poseLoopingWalk`, `documentPageLookup`, `drawnRegions`, `regionPageUvs`, `meshPageUvs`, `readUvSequences`, `clipThrough`, `clipShapeOf`, `convexWhy`, `REGION_UVS`, `REGION_TRIANGLES`, `eventsFired` | `CompiledDocument`, `RawPose`, `RawBone`, `RawDrawn`, `RawClip`, `RawClipped`, `RawEvent`, `RawReset`, `WalkPose`, `CoreSlotRow`, `CoreBlendMode`, `ClipShape`, `ClipResult`, `DrawnRegion`, `UvPage`, `UvRegion`, `UvSource`, `ModelPage`, `ModelPageRegion` |

🤝 **A second `rig-c/core` row is promised by request**
([#1276](https://github.com/rig-c/core/issues/1276)): `openTrack`, with the
types `LiveTrack` and `TrackOptions` — the live track the rig-play 1.0 plan asked
for on that issue (a player steps once per frame by a `dt` it does not know in
advance), before the player could be seen calling it. It is the agreement
exception above applied to this entry, and the row says so in place of an
observation (`REQUESTED_IN_1276`).

🤝 **A third, by the same exception**
([#1336](https://github.com/rig-c/core/issues/1336)): the types
`LocalAdjust`, `AdjustableLocals` and `BoneLocals` — what `TrackOptions.adjust`
takes, a player's own bone-local value written after the animation's
timelines and before the world transforms, the constraints and the physics
step, requested on that issue before the player could call it
(`REQUESTED_IN_1336`). The same row holds the issue's other piece, the live
tracks: `openTracks`, with the types `LiveTracks`, `TracksOptions`,
`MixOptions`, `QueueOptions` and `TrackEntryView` — several animations on
several tracks of one document, set, queued, mixed and emptied as spine-core's
`AnimationState` does, which the player asked for with the same four shapes.
The hook itself is an option of `openTrack` and of `openTracks`, so the row
holds `openTracks` as its one value and `openTrack` stays the row above's.
[#1344](https://github.com/rig-c/core/issues/1344) widened that surface
without adding to it: an entry's `alpha` and `additive` are fields of
`MixOptions` (and so of `QueueOptions`) and of `TrackEntryView`, and
`setAlpha` a method of `LiveTracks` — all types the row already names, so the
row keeps its symbols and no row is added for that issue: a row is keyed by
the symbols an entry exports, and none was added.

The additive evaluation context requested by
[#1540](https://github.com/rig-c/core/issues/1540) promises one more type through
`rig-c/core`: `LocalAdjustContext` (`REQUESTED_IN_1540`). `LocalAdjust` now takes
`(locals, ctx)` with readonly `trackTime: number | null`,
`animation: string | null` and `globalTime: number`. The first two identify the
current track-0 entry, with unwrapped seconds starting at 0; no entry means
null/null, with no upper-track or global-time fallback. An explicit empty entry
retains its numeric clock and null name until removed, as `current(0)` does.
`globalTime` is the walk's elapsed seconds, independent of the physics clock.
One callback follows the whole composition, including a fade; unary callbacks
keep their output and schedule. AUTHORING states reset, queue and replay
semantics. The install smoke's types row records the type promise under the
existing types policy; its direct core probe additionally exercises both live
entries' callback context and unary pose bytes from the runtime-free install.
That runtime probe does not type-check consumers.

🤝 **A fourth, by the same exception**
([#1396](https://github.com/rig-c/core/issues/1396)): `physicsClockStep` and
`PHYSICS_CLOCK_LEAD`, the render's physics clock (issue
[#1380](https://github.com/rig-c/core/issues/1380)), which the player asked
to import from `rig-c/core` so that it can pass it to the live tracks' new
option before it could be seen doing so (`REQUESTED_IN_1396`). The option
itself — `clock` on `TrackOptions` and `TracksOptions`, what each step moves
the physics clock by — is additive on types the rows above already name: left
out, a track poses exactly what it posed before (`CO46`–`CO52` unchanged), so
the row adds the two symbols and no type. The two live in `src/core/raw.ts`,
which the entry already reached, so its closure gained no module (`CUR123`).

🤝 **A fifth, by the same exception**
([#1416](https://github.com/rig-c/core/issues/1416)): the type
`PhysicsEnvironment`, what the live tracks' new `setEnvironment` takes — the
wind and gravity directions spine-core 4.3 keeps on its `Skeleton` — which the
issue asked for as something the consumer sets (`REQUESTED_IN_1416`). The
methods themselves — `setEnvironment`, `environment`, `physicsTranslate` and
`physicsRotate` on `LiveTrack` and `LiveTracks` — are additive on types the
rows above already name: nothing set, a track poses exactly what it posed
before (`CO57`), so the row adds one type and no value. It lives in
`src/core/constraints_physics.ts`, which the entry already reached, so its
closure gained no module (`CUR123`).

**Live named physics parameters, promised by request**
([#1541](https://github.com/rig-c/core/issues/1541), `REQUESTED_IN_1541`):

| entry | values promised | types promised |
| --- | --- | --- |
| `rig-c/core` | methods on `LiveTrack` and `LiveTracks`: `setPhysicsParameters`, `readPhysicsParameters`, `clearPhysicsParameters` | `PhysicsParameters`, `PhysicsParameterPatch`, `PhysicsParameterRead` |

These methods are additive on the already promised track types. Patches are per
instance, applied after authored/keyed/slider fields and before integration;
clear removes a patch without resetting history. Read separates the current
patch from the last evaluated six values, with `null` effective before any
evaluation (composed before start or an inactive constraint). AUTHORING states
the complete timing and refusal contract. The internal parameter-layer module
is part of the runtime-free core closure, not an additional import promise.
The installed and browser-bundled probes call all three methods on both track
types, exercise all six fields, and refuse a partially invalid patch atomically.

**Named setup mesh reads, promised by request**
([#1538](https://github.com/rig-c/core/issues/1538), `REQUESTED_IN_1538`):

| entry | values promised | types promised |
| --- | --- | --- |
| `rig-c/core` | `readSetupMesh` | `SetupMeshTarget`, `SetupMesh` |

`readSetupMesh(view, { slot, attachment, skin? })` reads selected or unselected
mesh and linked-mesh setup world vertices, detached triangles and hull. Omitted
skin retains the view; `null`, a name and `all` use the core's no/named/all-skin
rules. A named skin falls back to the default table without applying its
activation lists. Definition equality ignores object property insertion order
recursively, including weighted binding records; array positions, key presence
and leaf values (`Object.is`, including signed zero) remain significant.
Differing all-skin definitions are refused rather than chosen by an order the
model lacks. Selected geometry includes setup-slider deform;
unselected geometry is stored geometry through unchanged setup matrices, with
no hypothetical selection or deform. AUTHORING §14 states the measured
nonselected slider distinction (the official method reads the selected slot's
deform array, worst delta `2.9999999999999982` in `S1538_09`), the full contract and
named `CoreInputError` refusals. No new math, runtime or node dependency is added.
The entry re-exports the implementation in `raw.ts`; the smoke's observed row
checks the value and both types, and its direct and browser-bundle probes call
it on the installed fixture and test output-array isolation without spine-core.

🤝 **A sixth, by the same exception**
([#1417](https://github.com/rig-c/core/issues/1417)): `bezierPolyline` and
`BEZIER_PIECES`, the polyline the poser draws a Bézier segment as — the
runtime's ten pieces, not the exact cubic — which `@rig-c/pose` asked for so
that its curve fitter holds each fit to the poser's own evaluation instead of
a mirror of it (`REQUESTED_IN_1417`). The entry re-exports the one function
the poser calls rather than a copy, because a copy is the drift the request
exists to remove: `CA12` holds the export identical to the function
`channelAt` calls, and every Bézier sample a probe poses through the export
equal at tolerance 0 to the poser's, with a copy of it planted red. Nothing
about the evaluation changed, so no pose moved. Both live in
`src/core/animation.ts`, which the entry already reached, so its closure
gained no module (`CUR123`).

The promise is "no runtime, and nothing a browser lacks", so it is held where
that is true. With the runtime taken away, the smoke imports `rig-c/core`
from the install and calls `readModel` then `poseRawSetup` on the build it
just wrote (`SMOKE_CORE_POSES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`: the
fixture's bones in order, the `hand` bone's world matrix with determinant 1,
and `readModel("{}")` refused as the `CoreInputError` the entry exports). Then
it bundles `import { readModel, poseRawSetup } from 'rig-c/core'` with vite —
library mode, one entry, the browser build vite makes by default, no node
polyfill, at the version this tree's `bun.lock` resolves, installed into a
directory of its own and never into the install — and runs **the bundle**
under Bun with `globalThis.document` undefined on the same document, holding
every bone it poses to the direct import's
(`SMOKE_CORE_BUNDLES_FOR_A_BROWSER_WITH_NO_NODE_MODULE`; its line prints the
vite version, the bundle's bytes and the `hand` matrix). ⚠️ The bundle
carrying the string `node:` zero times is checked and is **not sufficient**,
measured: vite replaces a node builtin it meets in a browser build with an
empty module and only warns, so a core module importing `node:fs` — even
calling it on `readModel`'s path — bundled to zero `node:` strings and exit 0.
So the config the smoke writes refuses every node builtin at resolution, by
name (`NODE_MODULE_REACHED`), and the warning is a fault as well; the
`import-node-in-core` plant puts an import of `node:fs` at the top of the
packed `src/core/index.ts` and has to go red at that step alone. In a clone,
`CUR123` holds the entry's static closure: every module it reaches by value is
under `src/core/`, none names a package or a node builtin by value, and the
one module outside `src/core/` it names is `src/model.ts`, as a type — that
module imports `node:crypto`, and a type import is erased. The adapter in
`src/render_core.ts` (`corePosed`, `pieces`, `clipCover`, `placementOf`)
reaches `src/atlas.ts` and `src/model.ts` by value and is not on this entry.

📞 **A symbol a dependant calls is held by a call, not only by its kind**
(#1212). Present and callable is not what a caller relies on, so the smoke
also calls, from the install, the functions that dependant was seen calling,
each on the smallest input that tells a working function from a stub and
against a value that is a fact of the definition or of the smoke's own
fixture: `parseRigSpec` on the fixture the build accepts and on the same rig
plus a bone whose parent is not declared, `splitRigSkin` on the fixture's
short-form skin and on a long-form skin listing each kind
`RIG_SKIN_CONSTRAINT_KEYS` names, `traceAlphaOutline` on a 4x4 square with
one clear pixel inside (16 vertices enclosing 16 px, `holePixels` 1),
`earClip` on a rectangle and on three collinear points (a `MeshError`),
`measureAuthoredMeshFit` on a mesh over half of an opaque mask, and
`RIG_SPEC_VERSION` and `RIG_KEYS` against the fixture's own spec. The
refusal is read **across the package boundary**: it has to be an instance
of the `CompileError` that `rig-c/errors` exports, or a dependant that
catches it by its class misses it. The `fork-compile-error` plant gives the
packed `src/rig.ts` a `CompileError` of its own — same name, same message,
every build still green — and the probe has to go red alone, naming the
entry and the class.

The renderer read entry is promised by agreement before parts#713 consumes it
([#1561](https://github.com/rig-c/core/issues/1561)). It is an explicit facade,
not the implementation module's whole namespace:

| entry | values held | types recorded |
| --- | --- | --- |
| `rig-c/render-shared` | `loadCandidate`, `throughPoser`, `sampleAnimation`, `sampleSetupPose`, `pageFor`, `projector`, `rasterisePiece`, `renderFrame`; failure classes `CandidateAtlasError`, `CandidatePairError`, `PoserChoiceError`, `SlotSubsetError`, `SpineRuntimeError`, `CoreInputError` | `Candidate`, `SkeletonFacts`, `PoserChoice`, `PoserName`, `MakeCorePoser`, `Poser`, `Posed`, `PoseSource`, `PoseOptions`, `DrawOptions`, `SkinRoster`, `SlotSubset`, `Frame`, `BoneSnapshot`, `AttachmentPose`, `AttachmentRest`, `Piece`, `PieceCommon`, `PieceTexture`, `UvWindow`, `Quad`, `Mesh`, `ClipSource`, `Viewport`, `EmitPixel`, `Plate`, `RGBA`, `EnvironmentStep`, `EnvironmentChange` |

These are the existing official functions and classes, with their existing
arguments and results. Importing the entry registers no Spine side, even if the
optional runtime is installed. A valid rigc build chooses the core after the
model, skeleton digest, atlas placement and rosters agree; missing or mismatched
inputs retain the named refusal and its reason. A /3 build can use its own page
placement without an atlas. Spine inputs, explicit Spine choice and a core
fallback require the registered side: a consumer asking for those explicitly
imports `rig-c/render`, which still eagerly imports the optional runtime.
`throughPoser` reports the chosen poser and reason beside its value; its callback
must write nothing, since the existing registered fallback can rerun it.
`loadCandidate` retains its deferred forced-core refusal order; callers must not
interpret the flag alone as proof that `choice.core` exists.

`SMOKE_RENDER_SHARED_READS_THE_INSTALLED_BUILD` calls the eight reads in a fresh
process against the gated stock fixture **before installing the runtime** and
again with the runtime beside the package. It reads setup and animation region
and mesh geometry, page selection, projected and rasterised pixels, and the skin
roster. Missing model/page/atlas, digest/atlas/roster mismatch, unknown
animation/skin/slot/page and an unregistered Spine side are refused by name.
Runtime-present calls explicitly load `rig-c/render` and compare core and Spine
poses and pixels. `drop-render-shared-entry` removes the named key;
`stub-render-shared-sampler` keeps `sampleSetupPose` callable but makes it return
no frames, which only the installed call probe must catch. `CUR135` holds the
facade's exact values, original function identity and runtime-free value closure;
types remain recorded rather than runtime-checked, under the rule below.

This additive entry is a **minor** release contract, first published in 2.69.0
([#1562](https://github.com/rig-c/core/pull/1562)); it is not available in 2.68.0.
Consumers can pin `>=2.69.0 <3.0.0`. A source or packed-candidate result is not
a postcut registry confirmation.

🧪 **`rig-c/runtime` is experimental, and not promised until it stabilises**
([#1591](https://github.com/rig-c/core/issues/1591), requested for play#200).
It is the in-place runtime poser, stage 0 of that issue: one model compiled at
load, one pose per skeleton overwritten in place, held equal to the oracle at
tolerance 0 by `tools/core_gate.ts`'s third dumper. Its stages widen what it
poses and may reshape what it exports, so the 🔒 contract above does **not**
cover it yet: a minor may rename or remove the entry or any of its symbols, and
a dependant pins an exact version. Everything else about a named entry holds.
The smoke lists its symbols in a row of their own marked `experimental`
(`OBSERVED_SYMBOLS` in `scripts/install_smoke.ts`), so a break is still seen
from the install, imported with the runtime taken away as an entry that needs
nothing beside the package:

| entry | values read | types recorded |
| --- | --- | --- |
| `rig-c/runtime` | `compileRuntime`, `RuntimePose`, `RuntimeRefusal`, `RuntimeInputError`, `RUNTIME_FEATURES`, `RUNTIME_STAGE` | `RuntimeModel`, `RuntimeOptions`, `RuntimeMissing`, `RuntimeFeature`, `RuntimeAnimation`, `RuntimeAttachment`, `RuntimeSlot` |

It carries `rig-c/core`'s browser promise, which is not experimental: its
static value closure reaches only `src/runtime/` and `src/core/`, names no
package and no node builtin by value, and leaves those two only for a type
import of `src/model.ts` (`CUR136`, beside `rig-c/core`'s `CUR123`). The day it
stabilises, its row loses the marker, and the contract above starts covering it
in that release's notes.

What is **not** promised, so nobody reads more into an entry than is there:

- **Any other export of an entry's module.** An entry exposes the whole file
  behind it; only the symbols the smoke lists are held. `rig-c/compile`
  is the compiler's whole module and promises one function out of it.
- **Types, by the smoke.** `BoneTransform` (through `rig-c/transform`),
  `BoneSnapshot`, `Frame` and `Mesh` (through `rig-c/render`), the five
  `Rig*` types (through `rig-c/rig`), `AlphaMask` (through
  `rig-c/mesh`) and the nineteen through `rig-c/core` were observed and are **not held by the smoke**: a type
  does not exist at run time, and checking one against the install needs
  `tsc`, which neither the package nor the `installs` job has — that job
  installs no dev dependencies, on purpose. A renamed type surfaces in the
  dependant's own type check, and since #1212 that check is run against the
  candidate before a release is approved (*Cutting a release*, step 4) — by
  hand, for the one dependant it names.
- **The paths behind the patterns** — below.

`rig-c/render` loads `@esotericsoftware/spine-core` when it is imported,
and since 2.0.0 the package declares the runtime as a devDependency only
([#1061](https://github.com/rig-c/core/issues/1061)), so `npm install
rig-c` does not bring it. A dependant importing that entry installs
`@esotericsoftware/spine-core` itself, at the version the installed
`package.json` names under `devDependencies`. Every other importable entry
loads without it. Both halves are measured, not remembered: the smoke
imports every listed entry once more after taking the runtime away, and holds
each to the column above — an entry that stops needing the runtime is as red
as one that starts.

⏳ Every other key is a **courtesy**, and says so by being a pattern: up to
`v1.2.3` the package had no map, so any shipped file resolved by its path, and
under Bun a module also resolved with its extension left off. The patterns
keep both spellings of every shipped path working, so a dependant that
deep-imports `rig-c/tools/plate.ts` does not meet `Cannot find module`.
**Moving an unnamed file is not a breaking change**; the courtesy is what makes
it survivable, not a promise that the path is stable. This section once said
the patterns could go in `2.0.0`; `2.0.0` kept them and they are still in the
map at 2.x. Removing them breaks every import by path, so it is a major's
decision: not in any 2.x release, and the major that removes them says so in
its notes.

📦 **For a dependant: import by entry, not by path.** `rig-c/plate`, not
`rig-c/tools/plate.ts` — the two load the same module today, but the entry
is the contract and moves with the file, while the path spelling is the
courtesy and stops resolving the day the file moves. Since #1212 every module
the observed dependant imports has an entry — `rig`, `mesh` and `errors` were
the last three it reached through `./*.ts` — so it needs the courtesy for
none of them; its switch was type-checked and built against a candidate of
that change to the same bytes, and is that dependant's to land.

⚠️ `"./*": "./*"` alone was tried and rejected: under Bun it resolves a path
spelled in full and **1 of the 42** shipped modules spelled without its
extension, where the package with no map resolved all 42. Bun does not try an
array of targets either, so the fallback is spelled per extension instead.
`bun run smoke` resolves every shipped path both ways from the install. Its
battery removes the map and its patterns, drops each protected named entry,
renames a listed symbol, forks the parser's error class from its entry's,
stubs the renderer read sampler while keeping it callable, and puts a node
import in the core's closure, which only the browser bundle can see. The
battery in `scripts/install_smoke.ts` is the checked list.

### Whether the tarball runs

What the package *holds* and whether it *works* are two different facts, and
until [#556](https://github.com/rig-c/core/issues/556) only the first was
checked. `prepublishOnly` gates the source tree; the `ships` job reads packed
path lists; `CUR16` resolves the relative imports of shipped modules. None of
them starts the program. The two smokes that had been taken — v0.20.0 and
v0.20.2 — were taken **by hand, after the cut**, and the tree recorded neither,
which is the `✅ applied` antipattern with a release attached to it.

**The gate is the `installs` job in
[`ci.yml`](.github/workflows/ci.yml)**, on every pull request and every push to
`main`. It runs `bun run smoke` — [`scripts/install_smoke.ts`](scripts/install_smoke.ts) —
which packs a tarball out of the branch, installs it into an **empty** directory
that has a `package.json` of its own, and runs it in three phases (issue
[#1061](https://github.com/rig-c/core/issues/1061)):

1. **As installed — no runtime.** The install must not have brought
   `@esotericsoftware/spine-core`; `rigc --version` must name `cli_core.ts`; and
   `rigc build` on that entry — the build every install runs — must exit 0 and
   write `skeleton.json`, `skeleton.atlas`, `skeleton.model.json` and the packed
   page, print no `FAIL` line, print the rules the fixture reaches, and report
   `A00_ROUNDTRIP_PARSE` as a SKIP. Anything else is `SMOKE_CORE_ENTRY_BUILDS`,
   a fault of the case with the first lines the build printed
   ([#1178](https://github.com/rig-c/core/issues/1178): until then a non-zero
   exit here was a `HOLE`, and a `HOLE` does not move the exit code, so a package
   whose installed `build` was broken printed green). It runs with `--report` beside
   `--out`, and the document it writes must parse, say `build-report/1`, `build`
   and the `model` supplier, and carry one gate per summary line printed with
   that line's figures — anything else is `SMOKE_CORE_BUILD_WRITES_ITS_REPORT`
   ([#1213](https://github.com/rig-c/core/issues/1213)).
2. **The runtime installed beside it**, at the version the installed
   `package.json` declares as its devDependency. The same `rigc --version` must
   now name `cli.ts`, and the build runs through the round trip: compile, the
   round trip against that version (the emitted `skeleton.spine` is compared with
   it rather than with a number written into the smoke), the named assertions the
   fixture reaches, `skeleton.json`, `skeleton.atlas` and the packed page PNG on
   disk, and `rigc validate` reading it back. The two builds of the fixture are
   then compared file by file — every file each `--out` holds, by name, then
   byte for byte — and any difference is `SMOKE_ENTRIES_BUILD_THE_SAME_BYTES`,
   naming the file, both sizes and the first byte at which they part: the core
   entry's promise is the same files with another gate, and this holds it on an
   install where `RC29` holds it in a clone. The import surface is probed
   here: every named entry, and every symbol `OBSERVED_SYMBOLS` lists, read
   through its entry — and the functions the dependant was seen calling,
   called (*The import surface*).
3. **The runtime taken away again.** `rigc --version` names `cli_core.ts` once
   more, every listed entry is imported again and held to whether it needs
   the runtime, `rig-c/meshcompare` compares meshes of the round-tripped
   build from the install (*The import surface*, `MQ45`), `rig-c/core`
   poses its setup pose from the install and again from a vite browser
   bundle of the entry that resolved no node module (*The import surface*,
   [#1275](https://github.com/rig-c/core/issues/1275)), and `rigc render`
   and `rigc check` run without it on the
   round-tripped build — the same bytes as the core entry's, by the comparison
   above, and read from that side so a broken core build goes red at one step
   rather than three. `rigc review check` runs on the same build
   ([#1457](https://github.com/rig-c/core/issues/1457)): first with nothing
   beside the package, where it has to be refused in one line naming the review
   package, exit 2; then with the package that line names installed the way it
   says, unpinned, where it has to exit 0 — `SMOKE_REVIEW_REFUSED_UNTIL_INSTALLED`
   and `SMOKE_REVIEW_CHECKS_THE_BUILD`.
   `rigc skills install` and the without-Bun shim check run in this phase.

What that proves: the `bin` shim resolves and hands off, and picks its entry by
whether the runtime resolves; `files` is closed under what each entry needs at
run time, not just under the imports a scanner can see; the package installs,
builds and runs without the runtime, and builds the same bytes through the round
trip with it.

The package carries no art and no spec — `gallery/`, `fixtures/` and `examples/`
are outside the allowlist — so the fixture is authored into the install
directory: a four-deep bone chain, three region attachments, one contour mesh,
one animation with two rotate timelines. Its plates come from the package's own
`tools/plate.ts`, imported as a **bare specifier**, and the run refuses a
resolution that lands anywhere but inside the install. Nothing under this
repository is on the fixture's path; the tarball is the only thing that crosses.

🌱 **The plants are in the tool, so every run has seen it fail.** Packages are
broken on purpose — `tools/plate.ts` out of `files`, `src/validate.ts` out of the
packed tree, `@esotericsoftware/spine-core` put back in `dependencies` (the
install then has the runtime, which is not the package this tree packs),
`cli_core.ts` out of `files` (the install's `rigc --version` dies), the skills
plant, the import-surface controls (the map removed, the map cut to its
named entries, each protected named entry removed in turn, one listed symbol
renamed, the parser's error class forked from its entry's), the renderer read
sampler stub (callable but returning no setup frame), one in the core's
closure (an import of `node:fs` that Bun loads and only the browser bundle
refuses), and two on
the core entry's build — its body made to refuse, and one byte appended to the
atlas it wrote, which only the comparison can see; both edit one line of
`src/cli/core_commands.ts`, because every module that entry reaches is a static
import and removing one stops `rigc --version` first, and both must go red at
their one step and no other — each
patched into an **extraction** of the tarball and packed again from there, so the
checkout is never modified and there is no restore to forget. The rename is
held to its one step the same way: each named entry is the module that defines
its symbols, so renaming a symbol another shipped module imports breaks that
importer too. The plant once renamed `headerBoxNumber`, which an assertion body
imports, and `rigc --version`, both builds, render and the skills died with it
while the case stayed green by reading only the import surface
([#1184](https://github.com/rig-c/core/issues/1184)); it now renames a
symbol nothing inside the package imports and must go red at the
observed-symbol probe alone. A package whose own import does not resolve is
what `src/validate.ts` out of the packed tree already shows. A plant case is
green only when the smoke went red at the step it was supposed to, naming what
went missing, and the plant itself is refused if it removed nothing from the
pack. Beside them is the other direction: a *correct* tarball installed at an
absolute path with spaces and non-ASCII in it has to pass. It found a real defect
the first time it ran — `new URL('.', import.meta.url).pathname` is
percent-encoded, so a generator written the way the gallery's `make_parts.ts`
scripts were then written writes into a directory called `install%20smoke`. The
25 sites that were written that way were repaired in
[#558](https://github.com/rig-c/core/issues/558) and `CUR32` now refuses a new
one; the fixture keeps the correct spelling, and the comment beside it, because
this case is what found the defect in the first place.

Run it locally the way CI does, or narrow it:

```sh
bun run smoke                                  # every case
bun run smoke -- --case clean                  # just the green one
bun run smoke -- --case drop-plate             # just one plant
bun run smoke -- --installer bun               # `bun add` instead of `npm install`
bun run smoke -- --source registry --version 0.21.0
bun run smoke -- --source registry --version 0.21.0 --wait 15   # …and wait for it
bun run smoke -- --keep                        # leave the install directories to look at
```

It needs `npm`, `bun` and `tar` on PATH and the network for exactly one package,
`@esotericsoftware/spine-core`, which phase 2 installs beside the package — the
package's own install fetches nothing. It deliberately does **not** need this repository's dev
dependencies, and the CI job deliberately does not install them — a job holding
the repository's own tooling would be answering a different question. `npm pack`
does not run `prepublishOnly` (measured: the pack returns in under a second,
where the gates it would run take minutes), so the smoke's pack is not a second
gate run wearing a disguise.

🕳️ **What it cannot see.** The tarball a branch packs is not the tarball npm
serves until a publish makes it one; how the rig *looks* is `rigc check`'s
question and not this one; and a green run is one platform's answer, the runner's.

🖥️ **Which platforms answer.** The `installs` gate is one Linux runner on the
Bun the action resolves that day. Beside it, the `installs-matrix` job in
[`ci.yml`](.github/workflows/ci.yml) runs the same `bun run smoke` across a
macOS runner and a Windows runner ([#1214](https://github.com/rig-c/core/issues/1214)),
each on the Bun the action resolves that day. It is not a required check. A red
macOS or Windows leg names a platform the package does not yet install and run
on. `package.json` declares `engines.bun` (`>=1.4.0`), and that floor is
declared rather than tested in CI: older `1.4.x` releases are untested until an
issue reports one ([#1570](https://github.com/rig-c/core/issues/1570)).

⚖️ **The registry half is a confirmation, not the gate**, and it is the last step
of [`release.yml`](.github/workflows/release.yml): after the publish it waits for
the registry to serve the new version — its packument, and then the tarball
behind it — and runs the same script with `--source registry` on those bytes. It answers the one thing the gate cannot reach — the
artifact people actually receive — and it is not the gate for the reason this
repository applies to every check: its own firing cannot be observed without
publishing something broken. What *is* observable, and was measured before the
step was written, is the mechanism: the whole battery, plants included, was run
against the published `spine-rigc@0.21.0` and came back green, so the
`--source registry` path has been seen both to pass on a good package and to go
red on three broken ones. A red there does not un-publish anything; it says the
cut needs a follow-up.

#### How long the registry takes, and what a red there means

⏳ **A publish returns before the registry serves what it published.** npm says
so on the way out — *"Your package is being processed and may take a few minutes
to become available."* — and that notice, which states no upper bound, is the
only statement of the window there is. And it is **two** windows, not one: the
packument can answer for a version whose tarball is still a 404. **[observed]**,
from the publish step's own log line (the notice above) to the moment the
version appears in the registry's packument (`time[version]` at
`https://registry.npmjs.org/spine-rigc`), and — where anybody looked — to the
first moment its `dist.tarball` answered:

| cut | release run | publish step returned | packument (`time[version]`) | delay to packument | tarball fetchable | delay to tarball |
| --- | --- | --- | --- | --- | --- | --- |
| v0.22.0 | `35104574039` | 2026-09-16 13:52:57.549Z | 13:57:08.543Z | 4 min 11 s | not measured | not measured |
| v0.22.1 | `35112124244` | 2026-09-16 15:00:05.473Z | 15:02:12.422Z | 2 min 07 s | not measured | not measured |
| v0.22.2 | `35124107989` | 2026-09-16 16:49:18.964Z | 16:51:56.700Z | 2 min 38 s | not measured | not measured |
| v1.1.0 | `35978786643` | 2026-09-24 09:05:59.452Z | 09:08:15.516Z | 2 min 16 s | between 09:13:07Z (404) and 09:13:40Z (200) ¹ | 7 min 08 s – 7 min 41 s ¹ |

¹ **[observed, from a second machine]** — a poll of the `dist.tarball` URL taken
by hand beside the run, recorded in
[#833](https://github.com/rig-c/core/issues/833); nothing in the run's own
log times the tarball, because the script that ran then did not ask for it. What
the run's log does carry agrees: its wait saw the packument at 09:08:37Z, its
first `npm pack` failed a second later, and the dispatch re-run at 09:14:20Z
fetched the tarball on its first attempt. The v1.1.0 row is the longest delay
in the table, and it is the tarball's.

There is no constant in that and nobody has promised one, so the step passes
`--wait 15` and the script backs off — 5 s, 10 s, 20 s, then every 30 s —
printing how long it has been asking and which piece it is still missing.

📦 **"Served" means the fetch a case makes has succeeded** (issue
[#833](https://github.com/rig-c/core/issues/833)). Each attempt asks
`npm view <spec> dist.tarball`; once the packument answers, the same attempt
runs `npm pack <spec>` — the fetch itself, through npm's own configuration,
cache and integrity check — and the wait ends only on a non-empty tarball. The
cases install **those bytes**, copied, so there is no second fetch to race. A
`HEAD` on `dist.tarball` was the alternative and was rejected: it would ask a
URL from outside npm, which is not the fetch a case makes, and a fake registry
on `PATH` could not drive it offline. The job's `timeout-minutes` is above the
wait, deliberately: a job cancelled mid-wait reports neither outcome.

🚨 **The two outcomes are different facts and they no longer print the same
red** (issue #563). The confirmation went red on the first three cuts above and
all three packages were fine: the wait was 60 s, and it ended in a trailing
`npm view`'s raw `E404`. 🚨 **And then v1.1.0 went red the same way one layer
further in** (issue #833): the wait ended on the packument, the first `npm pack`
got a tarball that was not there yet, and the run printed *the published
artifact does not build* — exit 1 — over a package a dispatch confirmed green
six minutes later. Metadata without bytes is a version still arriving, so it is
exit 3 now, and the line says it was the tarball that never came.

| exit | what it means | what to do |
| --- | --- | --- |
| `0` | the published package installs and builds | nothing |
| `1` | **the published artifact does not build** — the registry handed over its tarball and a case went red on those bytes | read the named fault; the cut needs a follow-up |
| `2` | no case ran, so the run measured nothing | a broken invocation, not a verdict |
| `3` | **the registry did not serve the version inside `--wait`** — either its packument never answered, or it answered and the tarball behind it never did (v1.1.0's case; the line says which). The confirmation was NOT taken, and nothing about the package is known | re-run the confirmation |

**Re-running a confirmation costs nothing and publishes nothing.** Actions →
**release** → **Run workflow**, with the version (no leading `v`) and the tag
left empty, or `gh workflow run release.yml -f version=X.Y.Z`. A `version`
dispatch runs the `confirm` job only: `plan`'s `if:` does not admit a dispatch
with a version and no tag, and `gate` and `publish` need `plan`, so all three
are skipped; release-please, which makes the tag and the release, is a step
held to `github.event_name == 'push'` besides (`CUR119`). A `tag` dispatch is
the other input and the other path (*Republishing a cut whose publish
failed*). By hand, from a checkout of the tag:

```sh
bun run smoke -- --source registry --version <version> --case clean
bun run smoke -- --source registry --version <version> --case clean --alias spine-rigc --alias @rig-c/core
```

The second line is the one the workflow runs: after the case, it fetches the
same version under each alias — within what is left of `--wait`, asked at least
once — and holds its unpacked files to the ones the case installed, one
`SMOKE_ALIAS_CARRIES_THE_SAME_FILES` line per alias. `--alias` is given once per
name rather than as one list, the shape every other flag of the smoke has, so
each name stays the one token after its own flag — which is how `CUR122` reads
the workflow's calls back against `ALIASES`. An alias is compared rather than
installed a second time: identical files are the stronger claim, and the
comparison takes seconds. An alias that differs is exit `1`; one the registry
has not served yet is exit `3` when the case itself was green.

### If the automation is unavailable

The old path still works and needs nothing from the workflow. Publish from the
tag, never from a working `main` — the tarball has to be the tree the GitHub
release names:

```sh
npm login                        # once per machine; `npm whoami` to check
git fetch --tags
git checkout vX.Y.Z              # the tagged tree
bun install --frozen-lockfile
bun run fetch-examples           # the corpus the selftest in prepublishOnly reads
npm publish                      # runs prepublishOnly, then asks for the OTP
npm publish "$(bun scripts/alias_tarball.ts pack --name spine-rigc --out ../alias-spine-rigc)"   # each alias, from the same tree
npm publish "$(bun scripts/alias_tarball.ts pack --name @rig-c/core --out ../alias-rig-c-core)" --access public
```

The package's own `npm publish` takes no flags here — `publishConfig.access`
in `package.json` already says `public`; the scoped alias passes
`--access public` as the workflow does, because a scoped name is the one whose
default is restricted. This is how `spine-rigc@0.2.1` shipped. It authenticates
as a logged-in human with a one-time password, which "require two-factor
authentication and disallow tokens" permits; what that setting rules out is
doing this from a script, unattended. Reach for it when the automation is broken
and a release cannot wait — then fix the workflow.

## Why the release pull request's check has to be approved by hand

⚠️ **The `ci` run does fire, and it waits for you.** A `pull_request` run is
created on release-please's pull request like any other; what GitHub withholds
to prevent recursive runs is not the run but its *permission to start*, so the
run lands in **`action_required`** and the pull request's required `test` check
reads as **blocked rather than absent**. ⇒ **Approving it is a standing step of
every cut**, not a special case.

Observed on every `pull_request` run `ci.yml` has ever had on a release branch:
each one was started by `github-actions[bot]`, every first attempt concluded
`action_required`, and the only ones that went green are second attempts, after
a human approved them. The v0.4.0 cut is the worked example — pull request #169,
one bot-authored commit and no push of anyone's own, run `32943138182` sitting
in `action_required`, approved, green, merged a minute later.

The usual way to make the run start on its own is a personal access token or a
GitHub App, and this repository deliberately does not use one:

- The base of the release pull request is a commit on `main` that `ci.yml`
  already tested on push.
- The pull request adds only generated version and changelog text. There is no
  source change for a test run to have an opinion about.
- The token would be the only long-lived credential in the repository.

Two things that follow from this, both learned the hard way:

- **How to approve, and why nothing else clears the check.** Every cut:
  `gh api -X POST repos/rig-c/core/actions/runs/<id>/approve`, or **Approve
  and run** in the Actions tab. A push of your own to the release branch —
  merging `main` in to resolve a conflict — changes nothing about this; it
  produces another run needing the same approval. Until one is approved and
  green the required `test` check reads as blocked, and a green
  `workflow_dispatch` run on the same commit does **not** satisfy it: a required
  check is matched by the run that reported it, not by the SHA.
- **The release branch is named after `package-name`, so do not hard-code it.**
  release-please derives it from `release-please-config.json`; since the package
  became `rig-c` it is
  `release-please--branches--main--components--rig-c` (it was
  `…--components--spine-rigc` before #1258), and it changes again with the next
  rename. Anything scripted reads it from the pull request:
  `gh pr view <n> --json headRefName`.

If a rendered check is ever wanted anyway, it takes no edit to `release.yml`:
create a fine-grained personal access token scoped to `rig-c/core` with
**Contents: read and write** and **Pull requests: read and write**, store it as
the repository secret `RELEASE_PLEASE_TOKEN`, and the workflow picks it up
(`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`). The cost is a
credential to rotate.

## Queued for 3.0.0

A major is cut when this list is worth cutting, not on a schedule.

1. **Removing the `./*.ts` courtesy keys from `exports`** ([#1212](https://github.com/rig-c/core/issues/1212), [The import surface](#the-import-surface)) — removing the pattern keys (`./*`, `./*.ts`, `./*.mjs`, `./*.cjs`, `./*.json`, `./*.md`) breaks every deep import by path, so it is reserved for a major rather than any `2.x` release.
2. **Removing the `--profile spine-html` alias** ([#1277](https://github.com/rig-c/core/issues/1277) / [#1405](https://github.com/rig-c/core/pull/1405) / [#1586](https://github.com/rig-c/core/issues/1586)) — removing a CLI `--profile` value (and `PROFILE_ALIASES` entry) that consumer scripts pass is a breaking change; `2.x` accepts it as `--profile rig-play` and prints the deprecation line on stderr until the next major release.
