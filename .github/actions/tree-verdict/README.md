# Tree verdict, Phase A

A successful run is reusable only when its **actual tested checkout tree**, the
associated PR head tree (for PR sources), and the current commit tree are equal.
API `head_sha` identifies the source head; it does not identify a PR's synthetic
merge checkout. A mandatory receipt supplies that separate identity. No receipt,
expired/unreadable artifact, API error, malformed response, non-success, incomplete
pagination, tree mismatch, newer failure or rerun means `reused=false`. The caller
then runs its complete gate. Current runs are excluded. Dispatch/republish never
reuses. There is no publish command or validation bypass in this action.

Phase A ships the action, producer, lifecycle CLI, lint and cheap fixture controls.
**Existing core ci.yml/release.yml/selftest-shards.yml, its prepublish gate and
CUR119/120/131 adoption are excluded** (follow-up #1705). This does not declare the
old duplicate work green. An existing core tally binds exact commit SHA, clean
source and full census: downloading a PR tally with an equal tree but different
commit cannot satisfy it. Core needs an explicit, negatively tested adaptation.

## Frozen action interface

Node >=20, Git and `unzip` are required on the runner. Tests and workflow lint use
Bun >=1.4.4 and Python 3's standard ZIP writer for fixtures. No npm dependency is
installed by the action. Use a full **merged commit SHA**, never a floating branch,
for both the action and a source checkout. Tower supplies that SHA after merge.

| Input | Default | Meaning |
| --- | --- | --- |
| `workflow` | empty | Exact `.github/workflows/name.yml`; required unless `declaration` supplies it |
| `gate` | empty | Exact full gate identity; required unless `declaration` supplies it |
| `declaration` | empty | Additive consumer JSON path; derives workflow and chain-bound gate; conflicting explicit inputs refuse |
| `purpose` | `ci` | `ci` or `publish`; publish writes a verified envelope for the lifecycle CLI |
| `verdict-path` | `${{ runner.temp }}/tree-verdict-verified.json` | Absolute envelope path inside runner.temp; publish invalidates stale content before lookup |
| `receipt-name` | `tree-verdict-receipt` | Source artifact containing exactly `receipt.json` |
| `token` | `${{ github.token }}` | Same-repository read token |

| Output | Success | Miss |
| --- | --- | --- |
| `reused` | `true` | `false` |
| `run-id` | Source run ID | empty |
| `head-sha` | Full API source head SHA | empty |
| `tested-sha` | Full actual tested checkout SHA | empty |
| `pr` | PR number, or `0` for direct default-branch push | empty |
| `verdict-path` | Verified envelope path in publish mode | empty |

Caller permissions (the composite cannot grant them):

```yaml
permissions:
  contents: read
  actions: read
  pull-requests: read
```

Only default-branch push consumers reuse same-repository `push` or `pull_request`
source runs from the exact workflow ID/path. Forks and `pull_request_target` refuse.
Run lists are paginated without filtering away failures, up to 1,000 rows; exceeding
a bound refuses. Latest run/attempt is checked again after artifact verification.
This is a point-in-time check, not a lock on future reruns. Artifacts require a
matching API SHA256 digest, run/head identity, unexpired status and one bounded ZIP
member. Storage redirects receive no repository token. Missing permissions simply
cause full-gate fallback. API background and schema references:
[workflow runs](https://docs.github.com/en/rest/actions/workflow-runs),
[artifacts](https://docs.github.com/en/rest/actions/artifacts).

## One consumer declaration and full-chain identity

Keep the replaced lifecycle string and its complete command inventory in ONE
reviewed file, for example `scripts/tree-verdict.json`:

```json
{
  "schema": "tree-verdict-lifecycle/1",
  "workflow": ".github/workflows/ci.yml",
  "gate": "parts-full/1",
  "chain": "bun run typecheck && bun run lint && bun run selftest",
  "commands": ["bun run typecheck", "bun run lint", "bun run selftest"]
}
```

Use the consumer's actual original chain and script names. Core defines the gate
format as `<label>/<positive-version>/sha256-<64 lowercase hex digits>`; label is
1–20 lowercase letters/digits/hyphens beginning with a letter. The digest is SHA256
of the **exact UTF-8 chain string**. `gate` in the JSON is its versioned label; the
CLI/action derive the full identity. `commands.join(' && ')` must equal `chain`
exactly to claim coverage. A subset never skips part of the chain. A noncovering
declaration or a missing/invalid/wrong-gate envelope executes the entire original
`chain`. A malformed/unreadable declaration blocks publishing because there is no
safe original command to invent. Bump the label version when the gate's semantics
change beyond its command string. The source workflow must make that string the
actual complete gate, including required environment/matrix/fixture policy.

## Pin installation and fresh receipt producer

Check out the consumer into `consumer` and this repository into a **sibling** pin
path, so the source checkout does not dirty the consumer. This is source tooling,
not a consumer runtime/package dependency:

```yaml
- uses: actions/checkout@v4
  with:
    path: consumer
- uses: actions/checkout@v4
  with:
    repository: rig-c/core
    ref: FULL_MERGED_CORE_SHA
    path: tree-verdict-core
    persist-credentials: false
```

After installing the consumer's frozen dependencies, replace its old full gate
step with this producer-wrapped execution (do not run the gate twice):

```yaml
- name: Fresh full gate and tested-tree receipt
  working-directory: consumer
  env:
    GITHUB_TOKEN: ${{ github.token }}
  run: >-
    node ../tree-verdict-core/.github/actions/tree-verdict/producer.mjs
    --declaration scripts/tree-verdict.json
    --out "$RUNNER_TEMP/receipt.json"
- uses: actions/upload-artifact@v4
  with:
    name: tree-verdict-receipt
    path: ${{ runner.temp }}/receipt.json
    if-no-files-found: error
    overwrite: true
```

The producer executes the declared full chain and writes only after exit 0. It
checks actual Git HEAD/tree and clean tracked/index/untracked state before and
after execution, API commit/tree equality, live run ID/attempt/event/workflow and
same-repository PR association. It derives PR number from the runner event and
confirms the PR through the API. API head and tested SHA are stored separately.
Receipt output must be outside the tested checkout. Ignored generated output is
allowed. Any gate/identity/dirty/API failure exits 1 and writes no new receipt;
the upload's ordinary success condition is essential. There is no record-only or
reused mode: never wrap a verdict reader/no-op as the fresh full gate, and never
upload this receipt from a reuse branch. Multi-job gates need a collector that
proves their complete census/identical tested input; this single-command producer
does not invent that integration.

For a gate unrelated to an npm lifecycle, the explicit equivalent is:

```sh
node ../tree-verdict-core/.github/actions/tree-verdict/producer.mjs \
  --workflow .github/workflows/ci.yml --gate full/1 \
  --out "$RUNNER_TEMP/receipt.json" -- bun run full-gate
```

This does not cover a lifecycle chain unless it uses that chain's computed identity
and actually executes the whole chain; prefer declaration mode for publishing.

Receipt JSON fields: `schema: tree-verdict/1`, `gate` (full identity),
`verdict: success`, `repository`, `workflow_path`, `workflow_id`, `run_id`,
`run_attempt`, `head_sha`, `tested_sha`, `tree`, `event`, `pr`. An older run without
this receipt is deliberately ineligible. The producer is an attestation from a
reviewed workflow, not protection against a workflow author deliberately calling
a partial/no-op command the full gate. Review gate wiring and receipt upload order.

## CI skip and concrete npm lifecycle consumer

A guard job exposes the action's `reused` output. Every explicitly declared heavy
job needs that job and uses `needs.tree-verdict.outputs.reused != 'true'`. This
also runs the full gate when an output is empty. On a separate publish consumer,
look up the same declaration and request the file:

```yaml
- id: reuse
  uses: ./tree-verdict-core/.github/actions/tree-verdict
  with:
    declaration: consumer/scripts/tree-verdict.json
    purpose: publish
- name: Publish through npm lifecycle
  working-directory: consumer
  env:
    TREE_VERDICT_PATH: ${{ steps.reuse.outputs.verdict-path }}
    GITHUB_TOKEN: ${{ github.token }}
  run: npm publish --provenance --access public
```

The consumer replaces its literal original `prepublishOnly` chain with a small
tracked wrapper, keeping the original chain only in the declaration above. This
also preserves ordinary local publishing when the sibling helper is absent:

```json
{"scripts": {"prepublishOnly": "node scripts/prepublish.cjs"}}
```

Exact `scripts/prepublish.cjs` example (consumer integration, not edited by Phase A):

```js
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const declaration = path.join(__dirname, 'tree-verdict.json');
const helper = path.resolve(__dirname, '../../tree-verdict-core/.github/actions/tree-verdict/lifecycle.mjs');
const d = JSON.parse(fs.readFileSync(declaration, 'utf8'));
if (typeof d.chain !== 'string' || !d.chain.trim()) process.exit(1);
let result;
if (fs.existsSync(helper)) {
  result = spawnSync('node', [helper, '--declaration', declaration], { stdio: 'inherit' });
} else {
  console.log('tree-verdict helper absent: executing original full chain');
  const windows = process.platform === 'win32';
  result = spawnSync(windows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh',
    windows ? ['/d', '/s', '/c', d.chain] : ['-c', d.chain], { stdio: 'inherit' });
}
process.exit(Number.isInteger(result.status) ? result.status : 1);
```

The sibling source checkout is outside the consumer Git root; no ignore exception
is added. A helper failure that already ran the chain is returned, never retried.
Direct installed-helper form is:

```sh
node ../tree-verdict-core/.github/actions/tree-verdict/lifecycle.mjs \
  --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"
```

`TREE_VERDICT_PATH` supplies `--verdict-path` when omitted. Explicit CLI form:

```sh
node ../tree-verdict-core/.github/actions/tree-verdict/lifecycle.mjs \
  --declaration scripts/tree-verdict.json --verdict-path "$TREE_VERDICT_PATH"
```

A valid covering verdict skips **all** commands and logs source run, actual tested
SHA and gate identity. Otherwise this CLI executes the exact original entire
shell chain in the package directory and returns its real exit code; npm blocks a
failed chain. Missing evidence does not remove typecheck/lint/selftest. The reader
uses fresh runner repository/event/run/ref context, proves actual clean HEAD/tree
rather than trusting `GITHUB_SHA`, checks HEAD equals runner SHA, and brackets the
live source receipt recheck with another checkout proof. A different/dirty checkout
falls back. Environment variables name evidence; none is a boolean bypass. No
`--ignore-scripts` appears in the publish flow. Consumer package changes, its
extra lifecycle hooks and special core tally/census integration are out of Phase A.

For diagnostics only, the low-level CLI returns **0=true / 2=false (full fallback
required)**, never publishes, and is not the complete lifecycle replacement:

```sh
node ../tree-verdict-core/.github/actions/tree-verdict/publish.mjs \
  --verdict "$TREE_VERDICT_PATH" --workflow .github/workflows/ci.yml \
  --gate THE_FULL_COMPUTED_GATE_ID
```

## Workflow lint and fixture evidence

From the consumer package directory with the sibling source pin above:

```sh
bun ../tree-verdict-core/scripts/lint_workflows.ts scripts/lint_workflows.declarations.json .
```

The declaration schema/types are exported by `scripts/lint_workflows.ts`.
`heavyJobs` explicitly lists every heavy job once per workflow; the linter never
infers heaviness from script names. `guard` names the job/step/action/source
workflow; `publishes` inventories every npm publish step and its reviewed lifecycle reader.
For the live action/lifecycle form, an entry is:

```json
{
  "job": "publish", "step": "publish", "verdictStep": "reuse",
  "declaration": "scripts/tree-verdict.json",
  "declarationInput": "consumer/scripts/tree-verdict.json",
  "actionUses": "./tree-verdict-core/.github/actions/tree-verdict",
  "lifecycle": "prepublishOnly",
  "readerCommand": "node scripts/prepublish.cjs",
  "evidenceEnv": "TREE_VERDICT_PATH"
}
```

The workflow must give its npm step `id: publish`, pass
`${{ steps.reuse.outputs.verdict-path }}` in that environment variable, and place
the action proof step before it. `declaration` is read relative to the lint's
consumer root; optional `declarationInput` is the exact action input path relative
to the Actions workspace. Omit that field when both paths are the same. The older
gate-output/artifact form is also represented by the exported TypeScript type.
Omitting an npm publish step from that inventory is an error. This structural
check cannot prove arbitrary shell/reader semantics; the process/negative tests
must hold those. YAML is parsed by Bun's native parser, including flow forms,
anchors and block scripts, rather than line matching. The supported direct
`npm publish` shape is checked; scripts hiding publication must be explicitly
reviewed and represented, not treated as covered by this linter.

- `WFL001_DEFAULT_PUSH_HEAVY_UNGUARDED`: a declared default-push heavy job lacks its fail-closed tree guard.
- `WFL002_PUBLISH_SUITE_WITHOUT_VERDICT`: publication lacks a passed verdict/evidence reader.
- `WFL000_DECLARATION_OR_YAML`: missing/invalid inventory or unreadable/malformed workflow.

This repository's exact landed-scope invocation is:

```sh
bun scripts/lint_workflows.ts scripts/lint_workflows.declarations.json .
```

Its manifest includes only the new focused workflow with `heavyJobs: []`.
Existing core CI/release adoption is explicitly excluded, not certified green.
`tree-verdict-tests.yml` runs this command and the focused action/producer/lifecycle/
lint controls. The fixture executes the real composite shell/Node process against
a mocked API, then a cheap **full fixture gate** and publish sentinel. Positive,
one-byte tree mismatch and API failure print explicit gate/publication counts and
exits. These are not full core selftest or hosted production reuse measurements.
Tree-miss diagnostics compare exact Git leaf entries (up to 20 paths), not a
three-dot merge-base diff, and report parent/base-tip equality as diagnostic only.
Unavailable/truncated path diagnostics do not change fallback correctness.
