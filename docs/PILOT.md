# Running a pilot — putting an agent on the ladder

**This document is for the person running the pilot, not for the agent being
piloted.** It says how to take any agent — a different model, a different harness,
a colleague's setup — through four tiers, ending with a scored attempt at rung 3
that is directly comparable with the runs already on
[the ladder](LADDER.md).

Two files do the work and are handed out separately:

| file | given to | contains |
| --- | --- | --- |
| [`pilot/rung3-runner-prompt.md`](pilot/rung3-runner-prompt.md) | **the agent** | the whole task, T0 → T2, self-contained |
| [`pilot/rung3-evaluator.md`](pilot/rung3-evaluator.md) | **you** | the baselines, the scoring column, the anti-cheat check |

🚫 **The evaluator sheet never reaches the agent.** It carries the two recorded
rung-3 baselines, which are `docs/LADDER.md` per-rung material — on the runner's
forbidden list by the honesty rule, precisely so that the answer key stays out of
the prompt. See *The rules the runner's prompt carries* below.

## What a pilot measures, and what it does not

It measures **how far an agent gets authoring a rig it cannot see, from a written
brief and pictures.** It does not measure how good the model is at anything else,
and a rung is not a pass/fail: there is no rung score, by design. What comes back
is a table of measures a person reads — the same reading
[LADDER.md](LADDER.md)'s *How a rung is scored* describes, applied to one more
run.

⚠️ **Rung 3's brief has never been third-party verified.** Its header in
[`bench/runs/README.md`](../bench/runs/README.md) says **`Brief verified: no`**,
and [`bench/briefs/3-timing-and-spacing.md`](../bench/briefs/3-timing-and-spacing.md)
carries no verification block. The brief is a viewer's report, so it may contain a
claim the frames do not support, and a run can lose real time to one — that has
happened, on rung 2. This does not invalidate a pilot: the baselines were authored
from the same unverified text, so the comparison is like for like. It does mean
that a defect the pilot run hits may be the brief's rather than the agent's, and a
report that does not say so has not told you.

## The tiers

Run them in order and stop where the agent stops. Each tier is a separate,
observable outcome — a report that says "reached T1, failed T2" is a result.

### T0 — the tool works in its hands

**The agent installs rigc and gets the README quickstart to build green from a
scratch directory.**

- Install: `bun add -g @rig-c/core`, or `bunx @rig-c/core` with no install.
- Follow [README.md](../README.md)'s *First rig in ten minutes* exactly: three
  plates, the two inline specs, `rigc build`, then `rigc validate spine`.
- **Pass** = `build` prints `rigc: wrote …skeleton.json` / `…skeleton.atlas`, and
  `validate` ends `rigc: green`.

This is a floor, not a skill test. It fails on environment — no Bun, a proxy that
blocks the registry, a shell that mangles the heredoc — and failing it tells you
about the setup rather than the model. Fix the environment and re-run it.

### T1 — it can author something of its own

**From a one-line ask, the agent writes its own small doll and gets `validate`
green.** For example: *"author a rig and motion spec for a two-part signal flag —
a pole and a pennant that flaps — build it and validate it."*

- Its own names, its own plates, its own animation. The only guide it gets is
  [docs/AUTHORING.md](AUTHORING.md); the quickstart it just ran is the worked
  example.
- **Pass** = a green `build` on specs the agent wrote, not edited from the
  quickstart. Look at the two files: if the doll is the quickstart's buoy with the
  names changed, that is not T1.

T1 separates *followed a recipe* from *read the guide*. It is the tier most likely
to expose a weaker model: the failures worth recording are the ones the guide
already answers — a last key carrying an `ease`, a declared `duration` that does
not match, an `archetype` that does not equal the rig's `name`, a slot whose skin
entry is misspelled so the slot is silently dropped.

### T2 — it completes rung 3 under the run protocol

**The agent attempts rung 3 the way every recorded run attempted it**: fresh
context, the brief and the rendered frames and `docs/AUTHORING.md`, nothing else,
and `bench 3` run **once, at the end**.

- The whole task is [`pilot/rung3-runner-prompt.md`](pilot/rung3-runner-prompt.md).
  Hand it over as it stands; it is written to be pasted.
- The protocol it follows is [`bench/runs/README.md`](../bench/runs/README.md) —
  the run agent section, *What a run may read*, and the output layout.
- **Give it a git worktree, not the shared checkout.** The protocol says so and
  gives the reason: a run in progress is a working tree with in-flight edits, and
  a run has already lost time to another agent's refactor landing underneath it.
- **Pass** = a run directory with both specs, a compiled `spine/`, `LOOP.md`,
  `README.md` and `bench.json`, with `bench` run exactly once at the end.

⚠️ **A run that reads `bench` and then keeps editing is not failed — it is
labelled.** The protocol calls that **bench-assisted**: the measures are still
worth recording and they are not comparable with a clean run. The distinction only
survives if the agent says so, which is why the prompt asks for it and why you read
`LOOP.md` rather than the summary.

### T3 — the scores

**What to read off the run, and where to write it down.**

Nothing here is a threshold. You are producing a row that sits beside the two
baselines in [`pilot/rung3-evaluator.md`](pilot/rung3-evaluator.md).

**From `bench 3` — the structural diff.** The summary block prints six section
means plus the two-figure pairs:

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=…  slots=…  attachments=…  constraints=…  animations=…  events=…
             bones … (name-matched) · … (name-agnostic)   slots … (name-matched) · … (name-agnostic)
```

Read, in this order:

1. **`validate green`.** Stage 1 is the only pass/fail in `bench`. Not green means
   the candidate is not valid Spine 4.3 and nothing below it means anything.
2. **`bones` and `slots`, as the pair.** Name-agnostic 1.000 beside a low
   name-matched figure means *the shape is right and the vocabulary differs* —
   which is the expected result, because the brief grants the author its own
   names. Both low means the rig is wrong. LADDER.md's *`bones` and `slots` carry
   two figures* is the full reading.
3. **`animations`, and the two measures under it that carry timing quality** —
   `key_counts` and `curve_kinds`, printed as `n/69` at this rung. These are where
   the two baselines differ from each other, so they are the most informative
   single comparison a pilot produces.
4. **`constraints` and `events`.** At rung 3 both are `1.000` **by absence** —
   vacuous, and evidence of nothing. Do not report them as achievements.
5. **`attachments`.** `names` is the naming gap again; `count`, `type_counts` and
   `region_size` are the substantive ones.

**From `check` — the fidelity figures.** `bench` does not run `check` unless given
`--frames`, and the run's own `check` output is the record. Read four things:

- **the framing line** — `fit x…  rms … px  union residual …`. A union residual
  past a pixel is `check` telling you something reaches where nothing in the
  frames does. Read it *before* reading any drift.
- **MAE, both denominators.** The headline figure is over the **union alpha**, and
  half that denominator is the candidate's own — a large mostly-transparent sprite
  lowers it for free. The line beneath it gives the same difference over the
  **reference's own drawn pixels**, a denominator nothing the agent does can grow.
  ⭐ **That reference-denominator figure is the one to compare between agents.**
- **worst slot drift** — the named part, the frame and the distance
  (`worst 0.8 px "pendulum" at f0002`), plus how many slots got an answer at all.
- **the per-chain table** — `chain / slots / worst slot drift / mean / MAE in it /
  share`. Read `MAE in it` beside `share`: the share alone confounds *wrong* with
  *big*. A chain reading 0 % on `0/n` slots drawn is missing, not clean.

⚠️ **`check`'s figures are not stable across releases the way `bench`'s are.**
LADDER.md keeps a *Measure changes* ledger and recomputes every recorded `bench`
figure when a measure moves; `check`'s rasteriser and framing have changed since
the baselines were recorded, and re-running `check` on the 2026-08-23 candidates
today does not reproduce the numbers written down for them. ⇒ **To compare
fidelity, re-run `check` on both baseline candidates with the same rigc build the
pilot used**, and record all three together. Both baseline candidates are on disk:

```bash
bun cli.ts check --candidate bench/runs/2026-08-23-rung3-1/spine \
                 --frames    bench/reference/3-timing-and-spacing
bun cli.ts check --candidate bench/runs/2026-08-23-rung3-2/spine \
                 --frames    bench/reference/3-timing-and-spacing
```

**Recording the run.** Exactly like the runs already there — one directory,
`bench/runs/<YYYY-MM-DD>-rung3-<n>/`, `<n>` counting attempts at that rung on that
date from 1. The existing rung-3 directories are `2026-08-23-rung3-1/` and
`2026-08-23-rung3-2/`, so a pilot run on a later date starts again at `-1`.

```
bench/runs/<YYYY-MM-DD>-rung3-<n>/
  <name>.rig.json        the rig spec the agent wrote
  <name>.motion.json     the motion spec the agent wrote
  spine/                 skeleton.json + skeleton.atlas
  README.md              the header block, the inputs, the measures verbatim, the reading
  LOOP.md                one entry per turn of the loop
  bench.json             the final `bench 3 --json` report
```

⭐ **Name the model in the run record.** Both `README.md`'s header block and
`LOOP.md`'s use an `agent:` / `model` line — *"Claude Opus 5 (1M context), Claude
Code / Agent SDK"* is the form the existing runs use. A run whose record does not
name the model cannot be compared with anything, and the number it printed becomes
folklore the first time somebody quotes it. The runner prompt instructs the agent
to fill this in honestly; **you verify it**, because the agent is the one party
with an incentive not to.

The header block also carries: the date, the profile (`spine`), whether the
reference was read, whether `docs/AUTHORING.md` §10 was in hand, and clean versus
bench-assisted.

## The rules the runner's prompt carries

Three, and none of them is optional.

**1. The allowed and forbidden lists are quoted verbatim, not linked — and no surface
is named in their place.** The rule
is [`bench/runs/README.md`](../bench/runs/README.md)'s *What a run may read*, and
that section says why in its own first line: *an agent cannot avoid a document it
was never told to avoid, and every leak recorded on this ladder so far arrived
through a document the run was told to read.* The one copy of those lists lives in
that file; [`pilot/rung3-runner-prompt.md`](pilot/rung3-runner-prompt.md) quotes
them in full, with both existing rung-3 run directories named as forbidden. ⚠️ **Their
specs are excluded *on top of* item 9, not by it** — the ladder lets a successor attempt
inherit a prior attempt's specs (owner ruling 2026-08-28), and a pilot run is not a
successor attempt: it measures an agent authoring from zero, so the whole directory
stays out. The prior attempt's measures are forbidden either way.
🆕 **The second half of that rule is dated 2026-08-29** ([#174](https://github.com/rig-c/core/issues/174)):
a launch prompt **names no surface the lists do not name and pastes no threshold**. Four
recorded collisions all had that shape, and the protocol's *What a run may read* carries
them in a table. A prompt that wants the run to know the bar points at the clause card.

**2. The bar is quoted; the baselines never are.** Those are two different things and the
ruling of 2026-08-29 separates them.

- ✅ **[GATE.md](GATE.md) — the clause statements — is allowed reading**, and it is item 11
  of the runner prompt's quoted list. It carries the measure, the comparator, the number and
  the SKIP semantics, and no recorded figure at all.
- 🚫 **Baseline scores never appear in the runner's prompt.** LADDER.md's status
  table, its per-rung sections and its *Operating rules* are on the forbidden list for
  exactly this reason: the table publishes per-skeleton bone, slot and animation counts that
  the briefs withhold on purpose, the per-rung sections publish every previous run's
  measures, and *Operating rules* derives the gate's thresholds by quoting those measures
  back. An agent that knows the target `key_counts` is being scored on aiming at
  a number. The two parts of LADDER.md a runner *may* read are *How a rung is
  scored* and *The honesty rule*.
- ⚠️ **And [`pilot/rung3-evaluator.md`](pilot/rung3-evaluator.md) is still yours alone.**
  Knowing the bar is not knowing what two previous candidates scored against it.

**3. The judge trusts tool output, never the runner's self-report.** A run's
prose is the agent's account of itself and it may be sincerely wrong — that is the
whole reason the gate exists. Every figure you record comes from `bench.json`, the
`check` report, or a command you ran yourself. *"The build was green"* is not a
green build; the `rigc: green` line is.

## Cross-links

- [GATE.md](GATE.md) — the clause statements the run is graded against. Allowed
  reading for the runner, and the only surface that states the bar.
- [LADDER.md](LADDER.md) — *How a rung is scored* (stages, section means, why
  there is no rung score) and *The honesty rule*. Everything else in that file is
  forbidden to the runner, *Operating rules* included: it is the derivation of the
  card above, and it quotes previous candidates' measures to get there.
- [`bench/runs/README.md`](../bench/runs/README.md) — the run protocol, *What a
  run may read*, and the `README.md`/`LOOP.md` layout.
- [AUTHORING.md](AUTHORING.md) — the guide the agent authors from; §8 reading
  frames, §9 `check`, §10 the editor's default conventions.
- [README.md](../README.md) — *First rig in ten minutes*, which is T0.
