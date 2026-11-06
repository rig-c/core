# Tree verdict — workflow coverage v2

Reuse means the complete declared publish chain was already covered by successful
jobs over the **exact same Git tree**. It does not mean API `head_sha` was the
checkout SHA. PR CI normally checks out a synthetic merge; its actual tested SHA
and tree are recorded separately. Old `tree-verdict/1` receipts are ineligible.

Phase A supplies the action, Bun coverage compiler/collector, Node lifecycle
reader, lint and cheap controls. **Existing core ci.yml/release.yml, reusable
selftest-shards.yml, prepublish_gate.ts and CUR119/120/131 adoption are excluded**
(core#1705). No old duplicate work is declared green. Core's old tally still binds
an exact commit, clean source and full census; this receipt does not bypass it.

## Frozen interface and runtime

Lookup/lifecycle use Node >=20, Git and `unzip`. The collector and shared YAML
planner require **Bun >=1.4.4**, already present in the consumer CI; there is no npm
runtime dependency. Pin the action/source at a **full merged commit SHA** supplied
by the tower after landing.

| Input | Default | Meaning |
| --- | --- | --- |
| `declaration` | empty | Consumer lifecycle/2 JSON, relative to workspace; derives workflow and full coverage gate |
| `workflow` | empty | Exact source path; required when no declaration is supplied |
| `gate` | empty | Full computed gate; required when no declaration is supplied; conflicts with declaration refuse |
| `checkout` | `.` | Actual consumer checkout directory; reuse requires clean actual HEAD/tree matching target |
| `purpose` | `ci` | `ci` or `publish`; publish writes a verified envelope |
| `verdict-path` | `${{ runner.temp }}/tree-verdict-verified.json` | Envelope inside runner.temp; stale content invalidated |
| `receipt-name` | `tree-verdict-receipt` | Artifact containing exactly `receipt.json` |
| `token` | `${{ github.token }}` | Same-repository read token |

| Output | On reuse | On miss |
| --- | --- | --- |
| `reused` | `true` | `false` |
| `run-id` | Successful source run ID | empty |
| `head-sha` | Full source API head SHA | empty |
| `tested-sha` | Full actual tested checkout SHA | empty |
| `pr` | Source PR number, or `0` for direct push | empty |
| `verdict-path` | Verified envelope in publish mode | empty |
| `tooling-path` | Pinned action source outside consumer tree | same path, also available on misses |

Caller permissions:

```yaml
permissions:
  contents: read
  actions: read
  pull-requests: read
```

A unique eligible merged PR source is preferred over current-main CI. The latest
run/attempt **within that PR head** must succeed: no falling back to an older green
or to main when its receipt is missing. A newer concurrent/reused main CI cannot
shadow valid fresh PR evidence. With no eligible PR, current-commit push CI is the
source; a successful reused run without a fresh receipt is a miss. Multiple eligible
PR sources refuse. Both the PR head tree and the actual tested tree must equal the
target tree. Ordinary merge differences are diagnosed using exact tree leaf entries
(up to 20 paths), not GitHub's three-dot compare. Parent/base-tip equality is only
a diagnostic, never a fresh-head signing requirement.

Dispatch consumers always run the full chain. A fresh dispatch CI collector may
record completed coverage without breaking the workflow's existing dispatch path;
lookup will never accept dispatch as a reusable source. Fork PR collectors exit 0
with `TREE_VERDICT_PRODUCER_NOT_ELIGIBLE: fork pull request` and no receipt after
validating matching base/head repository identities in the run, event and PR API.
Lookup refuses fork PRs and fork run candidates. `pull_request_target` refuses.
Failed/missing/malformed/API/permission/incomplete
pagination evidence always means full fallback. No ignore-scripts or boolean bypass
exists.

## One declaration: original chain, covers and exact leg inventory

Example `scripts/tree-verdict.json` for **core's existing local reusable shard
shape**, with a hypothetical collector added to the caller workflow:

```json
{
  "schema": "tree-verdict-lifecycle/2",
  "workflow": ".github/workflows/ci.yml",
  "gate": "core-full/2",
  "chain": "bun run typecheck && bun run lint && bun run selftest",
  "commands": ["bun run typecheck", "bun run lint", "bun run selftest"],
  "covers": {
    "bun run typecheck": ["merge"],
    "bun run lint": ["merge"],
    "bun run selftest": ["shards", "merge"]
  },
  "jobs": {
    "shards": {
      "path": ["selftest", "shard"], "role": "shard",
      "legs": [
        {"matrix": {"shard": 1}, "apiName": "selftest / shard 1"},
        {"matrix": {"shard": 2}, "apiName": "selftest / shard 2"},
        {"matrix": {"shard": 3}, "apiName": "selftest / shard 3"},
        {"matrix": {"shard": 4}, "apiName": "selftest / shard 4"},
        {"matrix": {"shard": 5}, "apiName": "selftest / shard 5"},
        {"matrix": {"shard": 6}, "apiName": "selftest / shard 6"}
      ]
    },
    "merge": {
      "path": ["selftest", "test"], "role": "merge",
      "legs": [{"matrix": {}, "apiName": "selftest / test"}]
    }
  },
  "producer": {"job": "tree-verdict-receipt"},
  "checkoutPolicy": "event-sha"
}
```

`path` names YAML job IDs through local reusable calls. `apiName` is an exact
runtime **display name**, not a YAML ID; core's outer `test` is distinct from
`selftest / test`. Parts' top-level variant uses paths `["shard"]`, `["test"]`,
literal matrix values `["1","2","3","4"]`, and display names
`selftest shard 1`…`selftest shard 4` plus `test`. It does not rename those jobs.

`commands.join(' && ')` must equal the original `chain` exactly. Every command maps
to existing job groups, every group is referenced, and every matrix leg is listed
once. Sharing the merge job between typecheck/lint/selftest is intentional. `plain`
checks an exact `bun run <script>` or its package-script body. Shards recognize
literal `selftest.ts --shard` calls or core's `bun run selftest` with `RIGC_SHARD`;
all partitions must occur exactly once. A sharded command also requires a merge
invocation and a **direct `needs` edge from merge to its shard** in the same
workflow. Core's shard-step `continue-on-error: true` is supported because the
semantic `--merge` is required and must succeed. One green leg never proves the
matrix. Ordinary/merge steps must use default or explicit `success()` conditions and may
not tolerate failure; skipped or continue-on-error merge/typecheck/lint steps
refuse. Job-level ignored failure is refused.

Mapped commands use a bounded single-invocation argv lexer. The script prefix and
standalone `--merge` or `--shard` flag must belong to the same invocation, with the
mode flag immediately after the script prefix and followed by its argument.
Single/double quoted argument segments are supported. Core's quoted
`"$RUNNER_TEMP"/tally/*.json` arguments retain their boundaries, and a quoted
`"--merge"` is an actual flag. A single argument `"--merge shards"` is not a flag.
Unquoted shell operators (`||`, `;`, `|`, `&`), redirections, comments, command
substitutions, escapes, unsupported variable expansion and multi-command or
multi-line bodies refuse with `COVER_COMMAND`. Simple environment references are
supported inside double-quoted argument segments. Static reusable input/ref
resolution continues through its existing renderer.

The gate format is `<label>/<version>/sha256-<64 lowercase hex>`, hashing canonical
full covers, roles, paths, leg inventory, producer, checkout policy, exact chain and
commands. Changing coverage changes the hash. Increase the label's numeric version
for coverage changes. Optional previous-declaration validation refuses a changed
contract without a numeric version increase:

```sh
bun "$TREE_VERDICT_TOOLS/planner.mjs" scripts/tree-verdict.json . previous-declaration.json
```

Without a previous declaration the compiler does not invent historical state.

## Compiler: bounded static subset, named refusals

Collector and lint call the **same** `compileCoverage` implementation. The
collector cannot accept a caller's unchecked compiled plan or record-only override.
The compiler follows local reusable workflow files, static input defaults and
literal Cartesian matrix axes (maximum 256 legs, five job-path levels, eight source
workflow files). Names support literals, singleton ID defaults and explicit
`matrix.*` substitutions. Other name expressions, including `inputs.*` and
`strategy.job-total`, refuse with `COVER_DYNAMIC`. It validates names/cardinality against the
independent declared leg inventory. Matrix jobs need an explicit supported name;
implicit matrix name formatting is refused rather than guessed.

`fromJSON`, dynamic/unknown matrix axes, include/exclude matrices, `github.*` name
expressions, unresolved inputs, nonlocal reusable calls, matrix reusable callers,
and containers are **`COVER_DYNAMIC` refusals**, not unfinished support. Checkout
refs must resolve to default event SHA or `${{ github.sha }}`; static empty
`inputs.ref` defaults are supported. Override/unknown refs refuse as
`COVER_CHECKOUT`. All covering jobs and collector must use the same static source
checkout path, and mapped command working directories must match it. An explicit
pinned helper repository checkout is distinct from the source checkout; it must
remain outside the source Git root. Prefer the action's `tooling-path` instead.
Shell overrides, a second literal repository checkout, and git checkout steps are outside the declared static subset.

| Refusal | What it rejects |
| --- | --- |
| `COVER_SCHEMA` / `COVER_RUNTIME` | Old/invalid declaration or unsupported Bun |
| `COVER_JOB` | Missing/unknown/duplicated coverage job |
| `COVER_COMMAND` | Missing, conditional, ignored or unsupported single mapped invocation |
| `COVER_MATRIX` | Omitted/duplicated leg or partition, name/cardinality mismatch |
| `COVER_MERGE` | Missing semantic merge or actual dependency edge |
| `COVER_PRODUCER` | Missing success-only collector, incomplete needs, wrong invocation/proof |
| `COVER_DYNAMIC` / `COVER_CHECKOUT` | Unsupported expressions/ref/path/cwd policy |
| `COVER_VERSION` | Changed coverage without version increase when previous supplied |
| `COVER_API_JOBS` | Missing/non-success/ambiguous/wrong-attempt runtime jobs |

## Collector: append after all covering jobs; execute no chain

This is a hypothetical **new fixture/adoption job**, not an edit to existing core
CI in Phase A. Core's caller needs `selftest` because GitHub cannot name reusable
leaf IDs in an outer job's `needs`. Parts' collector instead needs `[shard, test]`.

```yaml
  tree-verdict-receipt:
    needs: selftest
    if: ${{ success() }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      actions: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.4
      - id: tools
        uses: rig-c/core/.github/actions/tree-verdict@FULL_MERGED_CORE_SHA
      - id: receipt
        env:
          TREE_VERDICT_TOOLS: ${{ steps.tools.outputs.tooling-path }}
          GITHUB_TOKEN: ${{ github.token }}
        run: bun "$TREE_VERDICT_TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"
      - uses: actions/upload-artifact@v4
        if: ${{ steps.receipt.outputs.receipt-created == 'true' }}
        with:
          name: tree-verdict-receipt
          path: ${{ runner.temp }}/receipt.json
          if-no-files-found: error
          overwrite: true
```

With no declaration, workflow or gate input and the default `ci` purpose, the
composite supplies tooling for the collector and prints
`TREE_VERDICT_COLLECTOR: tooling only; no lookup expected`. It keeps `reused=false`
and the empty receipt/source outputs. A partial lookup configuration or `publish`
purpose still takes the lookup path and fails closed. `consumer.test.mjs` executes
the actual composite shell for each of these forms.

The collector invocation uses the same bounded single-invocation lexer. It requires
`bun` followed by a command path ending in `producer.mjs`, exactly one
`--declaration` matching the checked declaration path, exactly one `--out` path,
and optionally one `--checkout` path. Option order may vary. Quoted dynamic tooling
and output path references are supported. Extra positional arguments, duplicate or
unknown options and glob-expanded collector paths refuse as `COVER_PRODUCER`.
Shell operators and additional command bodies refuse as `COVER_COMMAND`.

Exact producer command:

```sh
bun "$TREE_VERDICT_TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"
```

The producer appends `receipt-created=false` to `GITHUB_OUTPUT` before collection,
including on a reused output path. Only a completed receipt write changes it to
`receipt-created=true`. Fork skips and failures keep the output false. An eligible
receipt write failure exits 1. Outside Actions, `GITHUB_OUTPUT` is optional.
On Actions (`GITHUB_ACTIONS=true`), missing or empty `GITHUB_OUTPUT` refuses with
`COVER_PRODUCER: GITHUB_OUTPUT required on Actions`, exit 1. The producer step
may not set `GITHUB_OUTPUT` in its own `env` mapping.
`producer.test.mjs` runs this command for fork, PR, push and failure controls.

The collector has exactly one upload, named `tree-verdict-receipt`, whose path
equals the producer's `--out`. Shell `$RUNNER_TEMP` and `${RUNNER_TEMP}` map to
the YAML `${{ runner.temp }}` prefix with the exact same suffix. Literal paths
are resolved relative to the producer working directory or the upload workspace;
a quoted literal `$RUNNER_TEMP` is distinct from expansion.
Upload wildcard characters (`*`, `?`, `[` and `]`) and leading exclusion syntax
refuse before path normalization.
The upload accepts `steps.<producer step id>.outputs.receipt-created == 'true'`,
optionally wrapped in `${{ }}`, with `if-no-files-found: error`. The producer step
ID comes from the declaration, defaulting to `receipt`. Other conditions, that
condition on another step, and `warn`/`ignore` missing-file policies refuse with
`COVER_PRODUCER`. A single legacy unconditional upload is also admitted with the
same name, path and `error` policy. Zero or multiple uploads refuse, including a
guarded upload mixed with an unconditional one.
`planner.test.mjs` runs the lint CLI over valid, malformed and mixed uploads.
Caller adoption follows the shared action pin rollout after core#1709. Existing
pins and unconditional uploads can still produce a red fork receipt job until
that rollout, as accepted in core#1711's scope ruling.
The core rollout PR removes legacy unconditional admission together with its
final action pin update and core CI upload wiring.

It compiles the checked-out workflow graph, verifies clean actual HEAD/tree equals
runner `GITHUB_SHA`, validates repository/run/attempt/event/workflow/PR association,
and reads **every** covering job from:

```text
/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page=N
```

Every page is consumed to the declared total, at most 1,000 rows. All API job IDs
and display names must be unique, including ambiguity from unrelated jobs. Each
expected leg must be `completed/success` in exactly that run/attempt/API head.
Collector itself must be the declared active job. Its receipt records those
normalized rows, source YAML hashes, canonical coverage, compiler version/digest,
collector job ID and actual tested SHA/tree. It recompiles and rechecks clean
checkout before writing. No chain is executed, no old wrapper grammar is accepted,
and no successful reused CI may fabricate fresh evidence. Upload remains success
conditioned. A failed collection exits 1 with no receipt. Fresh dispatch collection
is allowed; reusing dispatch evidence is not. An authenticated fork PR exits 0
without collecting jobs or writing a receipt. The existing output invalidation
also removes a prior receipt at the same validated output path before this skip
(`producer.test.mjs` exercises the entry CLI with fresh and reused paths).

Receipt schema is `tree-verdict/2`. Source artifact name remains
`tree-verdict-receipt`, with exactly `receipt.json`. Digest/size/expiry/run metadata
and bounded ZIP extraction are checked. Read-only API errors are fallback. The
Node reader checks canonical gate and compiler proof, rereads exact-attempt jobs
and collector identity, and rereads overall source success/current attempt after
verification. It does not reinterpret YAML. API `head_sha` stays separate from
`tested_sha`; a changed synthetic tested tree fails even when the PR head tree
still matches main. Each lookup's network budget remains 60 seconds.

[GitHub's attempt-jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt)
provides runtime name/run/attempt/status fields; those fields do not by themselves
prove a checkout. That proof comes from checked source checkout policy plus actual
collector HEAD/tree and exact target-tree comparison. The source workflow/helper
pin is trusted reviewed code; artifact strings cannot replace that trust boundary.

## Concrete publish lifecycle replacement

The action source is already installed by `uses: ...@FULL_SHA` outside the consumer
checkout. No helper directory is added to its Git root. After checking out the
consumer, use:

```yaml
- id: reuse
  uses: rig-c/core/.github/actions/tree-verdict@FULL_MERGED_CORE_SHA
  with:
    declaration: scripts/tree-verdict.json
    purpose: publish
- id: publish
  env:
    TREE_VERDICT_PATH: ${{ steps.reuse.outputs.verdict-path }}
    TREE_VERDICT_TOOLS: ${{ steps.reuse.outputs.tooling-path }}
    GITHUB_TOKEN: ${{ github.token }}
  run: npm publish --provenance --access public
```

For a source in `consumer/`, set `checkout: consumer`, use
`declaration: consumer/scripts/tree-verdict.json`, and run npm in that directory.
The lifecycle CLI uses fresh runner context and clean actual checkout proof again.
A valid covering envelope skips **the entire chain** and logs run/tested SHA/gate.
Missing/invalid/noncovering/old/changed-job evidence runs the exact original entire
chain, preserving its failure exit. Invalid declarations with no readable original
chain block publishing; the command is never guessed.

Consumer package change (not performed in Phase A):

```json
{"scripts": {"prepublishOnly": "node scripts/prepublish.cjs"}}
```

Exact local-safe wrapper; the original chain remains only in its declaration:

```js
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const declaration = path.join(__dirname, 'tree-verdict.json');
const d = JSON.parse(fs.readFileSync(declaration, 'utf8'));
if (typeof d.chain !== 'string' || !d.chain.trim()) process.exit(1);
const helper = process.env.TREE_VERDICT_TOOLS && path.join(process.env.TREE_VERDICT_TOOLS, 'lifecycle.mjs');
let result;
if (helper && fs.existsSync(helper)) {
  result = spawnSync('node', [helper, '--declaration', declaration], { stdio: 'inherit' });
} else {
  console.log('tree-verdict helper absent: executing original full chain');
  const windows = process.platform === 'win32';
  result = spawnSync(windows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
    windows ? ['/d', '/s', '/c', d.chain] : ['-c', d.chain], { stdio: 'inherit' });
}
process.exit(Number.isInteger(result.status) ? result.status : 1);
```

Installed-helper CLI:

```sh
node "$TREE_VERDICT_TOOLS/lifecycle.mjs" --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"
```

Without an explicit path, it reads `TREE_VERDICT_PATH`. Missing helper or envelope
retains ordinary local full validation. Extra consumer lifecycle hooks and core's
old tally/census integration remain consumer work. The lower-level `publish.mjs`
CLI is only a 0=true / 2=false diagnostic; every nonzero requires full fallback.
Never use it alone as a replacement that silently skips the original commands.

## Lint inventory and exact invocation

The workflow-lint inventory keeps heavy jobs explicit; script names do not infer
heaviness. Add `coverageDeclarations: ["scripts/tree-verdict.json"]` so the same
compiler checks the whole cover graph. A publish declaration using the action
also automatically compiles its referenced coverage; no remembered separate check
is needed. Every detected direct npm publish step in a declared workflow needs an
explicit publish inventory entry. Structural lint is not an interpreter for shell
scripts hiding publication.

For a declared heavy job, WFL001 accepts exactly these job conditions, with an
optional `${{ ... }}` wrapper. Replace `guard` with the declared guard job ID.

```text
needs.guard.outputs.reused != 'true'
always() && needs.guard.outputs.reused != 'true'
!cancelled() && needs.guard.outputs.reused != 'true'
```

Any other conjunction or disjunction fails with
`WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED`. Under the `always()` conjunction, a missing
or empty runtime reuse output selects the merge job so it can report a missing
shard unit. The `!cancelled()` conjunction also requires the run to be uncancelled.
The guard must still declare its exact reuse output and be a direct dependency.
The collector requires every covering job as a dependency under `success()`.

The coverage declaration inventories the original chain's jobs. Other guarded
platform matrices in the workflow-lint `heavyJobs` inventory remain subject to the
source run's overall-success requirement. Their legs have no individual coverage
receipt entry. `lookup.test.mjs` controls both an uncovered skipped platform leg
under overall success and an uncovered failed leg under overall failure.
Explicit platform-matrix evidence is a separate follow-up. This original-chain
coverage preserves the previous `prepublishOnly` boundary.
[core#1714](https://github.com/rig-c/core/issues/1714).

Parts gives job ID `test` the display name `selftest merge`; its declaration's
merge leg therefore uses `apiName: "selftest merge"`. The separate required-check
aggregator has job ID `test-status` and display name `test`. Core's reusable
workflow example above uses `selftest / test`. Display names must match the
consumer's actual YAML. `planner.test.mjs` checks the parts display-name binding
and refuses substituting the aggregator's display name.

Receipt upload failures remain failures of the strict collector. A consumer
aggregator that requires collector success also fails when the chain passed and
only the upload failed. Caller rollout removes receipt collection from the
required test aggregator while retaining strict upload errors. An overall failed
source run remains ineligible for reuse. This disposition is part of
[core#1709](https://github.com/rig-c/core/issues/1709).

With the default root checkout and the same pinned action's `tooling-path` in
`TREE_VERDICT_TOOLS`, run lint directly through that source pin:

```sh
bun "$TREE_VERDICT_TOOLS/../../../scripts/lint_workflows.ts" scripts/lint_workflows.declarations.json .
```

The root-checkout sequence uses the same `tools`/`reuse` action output for all
three entry points:

```sh
bun "$TREE_VERDICT_TOOLS/producer.mjs" --declaration scripts/tree-verdict.json --out "$RUNNER_TEMP/receipt.json"
node "$TREE_VERDICT_TOOLS/lifecycle.mjs" --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"
bun "$TREE_VERDICT_TOOLS/../../../scripts/lint_workflows.ts" scripts/lint_workflows.declarations.json .
```

The producer belongs in the success-conditioned collector after its covering
jobs. The lifecycle belongs in the publish hook. Each command runs in the
consumer's existing root directory, preserving artifact-relative paths.

With a pinned core checkout at `tree-verdict-core` beside `consumer`, the optional
sibling-source lint form from the consumer package root is:

```sh
bun ../tree-verdict-core/scripts/lint_workflows.ts scripts/lint_workflows.declarations.json .
```

Alternatively checkout the pinned source solely for lint at a CI workspace sibling;
all source-checkout path/cwd rules above still apply. A publish entry is:

```json
{
  "job": "publish", "step": "publish", "verdictStep": "reuse",
  "declaration": "scripts/tree-verdict.json",
  "actionUses": "rig-c/core/.github/actions/tree-verdict@FULL_MERGED_CORE_SHA",
  "lifecycle": "prepublishOnly", "readerCommand": "node scripts/prepublish.cjs",
  "evidenceEnv": "TREE_VERDICT_PATH"
}
```

Optional `declarationInput` is the workspace-relative action input when it differs
from the lint-root-relative `declaration`, such as `consumer/scripts/tree-verdict.json`.
The TypeScript module exports the complete declaration interface. Existing
`WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED`,
`WFL002_PUBLISH_SUITE_WITHOUT_VERDICT` and `WFL000_DECLARATION_OR_YAML` remain the
structural lint failures; coverage refusals retain their explicit codes.

Exact landed-scope lint command in this repository:

```sh
bun scripts/lint_workflows.ts scripts/lint_workflows.declarations.json .
```

Its manifest covers the new focused workflow only, `heavyJobs: []`; existing core
CI/release adoption stays explicitly excluded. Dedicated CI runs that command and
small controls, not full selftest/build/browser. Fixture process tests execute the
real composite shell/Node action against mocked API and a cheap **full fixture
gate**, with real one-byte Git-tree mutation. Planner plants execute the actual
lint CLI and assert exit 1/code for missing jobs/scripts/legs/merge/dependencies/
collector needs, unsupported dynamic name/matrix/ref, and version comparisons.
Lifecycle plants prove whole-chain fallback, including equal PR head with differing
actual tested tree and a successful main reused run without fresh receipt. These
are not hosted production reuse or full core selftest verdicts.

## Publication inventory and the job lifecycle reader

The shared npm hook allowlist is `prepublishOnly`, `prepare`, `prepack`. Folder
publication retains its declared actual hook reader, including another
`prepublishOnly` invocation when the job reader has already run. Tarball jobs
require their own earlier, unconditional lifecycle reader. Its production CLI
verifies reusable proof or executes the entire declared chain and returns its exit.
The collector records successful coverage and executes no chain.

Add `publicationReaders` and per-step `invocations` to the workflow inventory.
Step selectors accept an ID string or `{ "name": "literal unique step name" }`.
The latter lets existing publish bodies retain their workflow step names.

```json
{
  "publicationReaders": [{
    "job": "publish", "step": "publication-reader",
    "verdictStep": "reuse", "declaration": "scripts/tree-verdict.json"
  }],
  "publishes": [{
    "job": "publish", "step": {"name": "Publish the alias rig-review"},
    "verdictStep": "reuse", "declaration": "scripts/tree-verdict.json",
    "actionUses": "rig-c/core/.github/actions/tree-verdict@FULL_MERGED_CORE_SHA",
    "evidenceEnv": "TREE_VERDICT_PATH",
    "invocations": [{
      "ordinal": 0, "kind": "tarball",
      "producer": {
        "step": {"name": "Publish the alias rig-review"},
        "variable": "alias_tgz",
        "command": "bun scripts/alias_tarball.ts pack --name rig-review --out \"$RUNNER_TEMP/alias-rig-review\" --pack-timeout-ms 300000"
      }
    }]
  }]
}
```

Every direct `npm publish` in a declared step has one zero-based ordinal in source
order. A folder item is `{ "ordinal": 0, "kind": "folder" }`; its publish entry
also supplies `lifecycle` and `readerCommand`, exactly matching the package script.
Existing single bare-publish declarations retain their original interface.

After the source checkout, runtime and dependencies are ready, install the pinned
action as step `reuse`, with `purpose: publish` and the declared declaration input.
Then run this exact reader step before **every** pack or publish step in its job:

```yaml
- id: publication-reader
  env:
    TREE_VERDICT_TOOLS: ${{ steps.reuse.outputs.tooling-path }}
    TREE_VERDICT_PATH: ${{ steps.reuse.outputs.verdict-path }}
  run: node "$TREE_VERDICT_TOOLS/lifecycle.mjs" --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"
```

The reader has no step condition or `continue-on-error`. The pinned action must
precede it. Publish steps receive the exact action verdict output in their declared
evidence environment. Pack and publish steps also reject `continue-on-error`.
The bounded publication contract uses the source-root working directory and its
default shell. The source coverage compiler, receipt schema, OIDC and consumer
byte/provenance equality checks retain their existing contracts.

The publishing **job** may use a single literal `==` or `!=` comparison over
`needs.<job>.outputs.<name>`, with an optional Actions wrapper. That source job must
exist in the same workflow and be a direct dependency. A pack or publish **step**
may compare an earlier, unique same-job `steps.<id>.outputs.<name>` to a literal.
Functions, logical combinations, forward references and other contexts refuse.

Both measured release workflows currently condition their source checkout, Bun and
dependency setup on the target output. Adoption must make those prerequisites
unconditional within a conditional publishing job, using target-job outputs and
same-job output wiring where needed. On no-cut, that job is skipped. An
unconditional reader in an ungated release job would otherwise run another full
chain beside CI. Consumer job scaffolding belongs to parts#1112 and review#407;
publication lint alone supplies no hosted no-cut runtime verdict.

### Bounded shell and producer forms

Every action in a declared workflow is checked against the explicit identities in
`publication.mjs`. Admitted remote actions are checkout, setup-node, setup-bun,
artifact upload/download, release-please and the SHA-pinned tree-verdict action.
Their reviewed major tags or full SHAs are required. Tree-verdict requires a full
SHA. The known local `reference-video-tools` installer is preparation only.
Unknown remote/local actions and reusable calls refuse with `ACTION_INVENTORY`,
including `JS-DevTools/npm-publish`. The local reusable selftest-shards workflow is
admitted. `publication.test.mjs` exercises each admission and named refusal.

Between the job reader and its last publish, checkout, setup, artifact download
and other admitted preparation actions refuse with `PUBLICATION_TREE_CHANGED`.
An unmodeled run step in that interval also refuses. Publication bodies remain
subject to the bounded command reader; adding a pack command cannot admit an
arbitrary source-changing script. Preparation belongs before the reader.
Parts rollout moves its `bun run smoke -- --case clean` step before the reader.
The portable full-file control in `publication.test.mjs` preserves the original
refusal and applies that exact reordering for the positive control. This rollout
bar is recorded in [core#1709](https://github.com/rig-c/core/issues/1709).

The direct-invocation lexer tracks quotes, comments, escaped command words and
nested `$(...)`. A separate conservative text guard keys on **publish** and its
prefixes of at least three characters. It scans argument strings and inline
comments for npm, Bun, Yarn or pnpm publication pairs. Only whole-line `#`
comments are skipped. Other forms refuse by run-line number with
`PUBLICATION_SYNTAX`, including quoted `bash -c`/`eval` commands, quoted publish
diagnostics, `npm run publish` and `npm view package publish`.
The `npm-publish` executable/package also activates the guard, including
`npx @jsdevtools/npm-publish`, versioned package requests, executable paths and
launcher/global-option variants. `publication.test.mjs` plants them in new jobs.

Only full, direct `npm publish` is admitted. Abbreviations `pub`, `publ`, `publi`
and `publis`, and `bun`/`yarn`/`pnpm` publish commands or those prefixes, refuse
by name. The canonical lexer also recognizes npm pack; its abbreviations `pa`
and `pac` refuse. Pack text alone leaves the text guard inactive. Unrelated
heredocs, backticks and other unsupported lexer syntax produce no publication
analysis when the step carries no publish pair. Such syntax with a publish pair
refuses. Queries such as `npm view package version` remain outside the guard.

A substituted publication, publication continuation, unmodeled variable write or
unsupported publication executable form refuses. The parser reads all branches
of supported `if`/early-exit and literal version-tag `case` bodies. Publish flags
are bounded to literal provenance/dry-run/access/tag arguments.
Parts' unquoted `$tag` requires exactly its measured literal empty-or-`--tag rc`
assignment and version case. An arbitrary expansion refuses.

A tarball operand is a quoted simple variable. Its producer is one preceding,
top-level direct command capture in the same run-step shell. The declaration
matches the exact captured command. Supported producers are literal `npm pack`
with `--pack-destination .` and optional `--ignore-scripts`, and the measured
`bun scripts/alias_tarball.ts pack --name ... --out "$RUNNER_TEMP/..."` form with
an optional literal `--pack-timeout-ms`. Every tarball entry in the job must match that reader's declaration, verdict
step and pinned proof source. The job reader is the gate. Producer
shape checks connect the local variable to the declared pack, while the consumer's
equality checks establish its payload relationship. Independent steps may each
assign `alias_tgz`. Captures in `&&`/`||` lists, negated commands, groups or nested conditional
positions refuse. Reassignment, output transforms, another job/step's variable,
and unmodeled variable transport refuse with `PUBLISH_PRODUCER`.
Captured npm pack stdout is a basename, so a destination other than literal `.`
refuses with `PUBLICATION_SYNTAX` even when it is a quoted runner-temp directory.
An uncaptured pack may still use its supported runner-temp destination.
`publication.test.mjs` checks the dot captures and non-dot refusals.

`WFL002_PUBLISH_SUITE_WITHOUT_VERDICT` includes named reasons for syntax,
invocation inventory, condition, producer, ignored failure and missing
reader/proof/hook wiring. The job reader permits the existing helper packs to
suppress their own hooks. Publish-side lifecycle suppression still refuses.

### Source snapshots, prospective wiring and measurement

Portable source fixtures retain these exact main snapshots:

- parts `f06f270dde2f53a0dd5f8e9fce71bb5fd9e4c950`
- review `112fe8d316dd32748f7bd94e5fc6bc269ab27f8c`

`publication-fixtures/sources.json` binds every release YAML, package manifest,
helper copy and the actual parts CI snapshot by SHA-256. The actual parts CI
control uses `heavyJobs: []` and the exact
`fa6209d489aab894a55f4dea4f500ce9eebc745a2a5bd52a7c24df1cdf86bdb4` source,
including its quoted npm-pack diagnostic and unrelated shell syntax. SHAPE fixtures keep release YAML byte-identical and refuse
only missing wiring. FULLY WIRED fixtures split target/publication jobs and add
only necessary job wiring, IDs, action/reader steps and environments. Tests compare
all publish bodies and helper bytes with the snapshots and execute the actual lint
CLI. Their green scope is **publication lint**.

`publication-fixtures/parts-main/sources.json` separately binds the five full
public parts files at `6d0bb3dfaa22fced86cfb07252226509c2c71ae7`. The portable rollout
test moves the original smoke step and comments before the reader as source text,
then compares the complete parsed workflow with an independent one-step move.

Package hook wrappers, declarations and generated coverage CI/collector metadata
are explicit prospective fixture inputs. Review's `fixture-test`, `fixture-check`,
`fixture-build` and `fixture-smoke` literal script wrappers model adoption work;
the raw review hook chain still contains command keys outside the current planner
grammar. Real consumer CI adoption remains with #407. The source coverage grammar
is exercised unchanged against the generated prospective coverage input.

`publication-measurement.json` records the prior npm 10.9.9 and 12.2.2 loopback
measurement and hashes its retained raw receipts. Tarball publish invoked no hooks
and reached actual HTTP PUT. Folder publish ran `prepublishOnly`; a failing hook
blocked its PUT. npm 10's `pack --ignore-scripts` still ran `prepare`, while 12.2.2
suppressed it. These measurements use Node 22.23.4 on macOS.

The standalone POSIX/Python >=3.9 tool accepts already-installed local npm CLI
sources. It creates isolated HOME/config/cache/temp paths, forces its ephemeral
127.0.0.1 registry with dummy local auth, records versions/argv/exits/markers/PUT
and artifact hashes, and closes the server. Supply a new absolute output directory
outside the repository. Repeat `--npm-cli` to measure both local versions:

```sh
python3 .github/actions/tree-verdict/measure-publication.py --out /absolute/cache/new-measurement --npm-cli /absolute/local/npm-cli.js
```

`--only pack` is a one-command preflight. Tests use that preflight; the retained
historical measurement supplies the recorded full matrix.
