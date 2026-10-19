/**
 * The bodies of the commands that run through spine-core — `build`,
 * `validate` and `bench` (the gate is the round trip), `bonedist` (it poses
 * both skeletons through the runtime by design), `preview` and `vote` (the
 * page names its atlas pages through the runtime's reader, and its gate line
 * is the round trip's) — moved here unchanged from `cli.ts` (issue #1052, step
 * 4e of #380), with the helpers only they call. Only `cli.ts` imports this
 * module (`SPINE_COMMAND_RUNS`); an entry that does not links nothing of the
 * runtime, and refuses these commands naming what each needs it for.
 */
import { type BallotCandidateInput, type BallotInput, buildBallot, ledgerLineText, MAX_CANDIDATES, MIN_CANDIDATES, parseLedger, readBallotManifest, resultFilename, TIE, verifyResult, VOTE_RULES } from '../ballot.ts';
import { boneDistance, boneDistLines, type BoneDistReport } from '../bonedist.ts';
import { IDENTITY_CORRESPONDENCE } from '../correspondence.ts';
import { checkLines, type CheckReport } from '../check.ts';
import { compile } from '../compile.ts';
import { diffLines, type DiffReport, diffSkeletons, reportedFigures, sectionFigures } from '../diff.ts';
import { findRung, RUNG_IDS, type RungSkeleton } from '../ladder.ts';
import { buildPreview, buildPreviewPanes, PLAYER_LINE, type PreviewGate, type PreviewInput, type PreviewPage } from '../preview.ts';
import { atlasPageNames } from '../render.ts';
import { BoneDistError } from '../bonedist.ts';
import { assertionCountForProfile, CLI_DEFAULT_PROFILE, reportLines, validate, type ValidateProfile } from '../validate.ts';
import { failLine } from '../guide.ts';
import { type CliRefusal, type CommandRun, DEFAULT_BALLOT, PACKAGE_ROOT, DEFAULT_LEDGER, parseJsonNamed, readAnimationFlag, readJsonFile, readPackageMeta, readSkeletonText, readVersion, resolveBuild, resolveCut, resolveViewable, runCheck, spinePairOf, type BuildGate, runBuild, readProfile, STAGELESS_FRAMING, UsageError, writeJson, modelTextBeside } from './shared.ts';
import { cmdRepack } from './repack.ts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';


function repositoryUrl(): string {
  const repo = readPackageMeta()?.repository;
  const url = typeof repo === 'string' ? repo : repo?.url;
  return (url ?? 'https://github.com/rig-c/core').replace(/^git\+/, '').replace(/\.git$/, '');
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

/**
 * `cli.ts build`'s gate (issue #1060, `BuildGate`): the round trip through
 * spine-core and every named assertion — the gate `build` has always run,
 * with the arguments it has always been handed, and the same lines.
 */
const ROUND_TRIP_GATE: BuildGate = {
  supplier: 'round-trip',
  heading: (profile) => `  ..    validate (spine-core round trip + machine assertions, profile ${profile})`,
  run: ({ result, atlasText, atlasDir, modelText, reEmit, profile }) => {
    const report = validate({
      skeletonText: result.skeletonText,
      atlasText,
      atlasDir,
      declaredDurations: result.declaredDurations,
      modelText,
      reEmit,
      rig: result.rig,
      profile,
    });
    for (const line of reportLines(report)) console.log(line);
    console.log(
      `  ..    ${Object.entries(report.stats)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`,
    );
    return { report, here: null };
  },
  look: (outDir) => `rigc: look at it: rigc preview --candidate ${outDir}`,
};

export function cmdBuild(flags: Record<string, string>): void {
  runBuild(flags, ROUND_TRIP_GATE);
}

export function cmdValidate(flags: Record<string, string>, positional: string[]): void {
  // A bare directory validates what is on disk. Naming the cut as well lets the
  // gate re-derive the declared durations and the structural expectations, which
  // a directory alone cannot supply — and the report says which it had.
  const named = flags.cut !== undefined || flags.rig !== undefined;
  const profile = readProfile(flags);
  const derivedOpts = named ? resolveCut(flags, 'validate').opts : null;
  // Both files there before the first line, from the one statement of a build (issue #1046): a directory without them
  // read the skeleton unguarded and died on an ENOENT and a stack.
  const { skeletonPath, atlasPath } = spinePairOf(resolveBuild(derivedOpts ? derivedOpts.outDir : (positional[0] ?? '.'), flags.atlas));
  console.log(`rigc validate ${skeletonPath}`);
  console.log(`  ..    atlas ${atlasPath}`);
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');
  const derived = derivedOpts ? compile(derivedOpts) : null;

  const modelText = modelTextBeside(skeletonPath, skeletonText);
  const report = validate({
    skeletonText,
    atlasText,
    atlasDir: dirname(atlasPath),
    declaredDurations: derived?.declaredDurations,
    rig: derived?.rig,
    ...(modelText === undefined ? {} : { modelText }),
    profile,
  });
  for (const line of reportLines(report)) console.log(line);
  if (report.failures.length > 0) {
    console.error(`rigc: ${report.failures.length} assertion(s) failed`);
    process.exit(1);
  }
  console.log('rigc: green');
}

/**
 * Does this skeleton declare a setup stage — a numeric width AND height?
 *
 * Read off the file's header for `preview`, which never loads one; `render`
 * reads the same statement off its candidate (`SkeletonFacts.declaresStage`:
 * the header again on a rigc build the core poses, the loaded `SkeletonData`
 * on an export). Both are the same two fields, because
 * `SkeletonJson` copies them across unconditionally (`SkeletonJson.js:70-73`),
 * so a header that omits them leaves `undefined` on a field typed `number`.
 */
function declaresSetupStage(header: { width?: unknown; height?: unknown }): boolean {
  return typeof header.width === 'number' && typeof header.height === 'number';
}

/** The `skeleton` block of a skeleton file's text, or an empty one where it has none. */
function skeletonHeaderOf(skeletonText: string): { width?: unknown; height?: unknown } {
  const root = JSON.parse(skeletonText) as { skeleton?: { width?: unknown; height?: unknown } };
  return root.skeleton ?? {};
}

/** The animation names an emitted skeleton carries, in the order it lists them. */
function skeletonAnimationNames(skeletonText: string, path: string): string[] {
  const parsed = parseJsonNamed(skeletonText, path);
  if (typeof parsed !== 'object' || parsed === null) throw new UsageError(`${path} is not a skeleton object`);
  const animations = (parsed as { animations?: unknown }).animations;
  if (animations === undefined) return [];
  if (typeof animations !== 'object' || animations === null || Array.isArray(animations)) {
    throw new UsageError(`${path} has an "animations" field that is not an object`);
  }
  return Object.keys(animations);
}

/**
 * The gate's reading of one candidate, taken the way `rigc validate <dir>`
 * takes it (issue #837).
 *
 * ⭐ The same call `cmdValidate` makes on a bare directory: the two texts, the
 * atlas's own directory, the default profile, the build's model document
 * where the one beside the skeleton is its own (`modelTextBeside`, issue #907
 * — the stage A14 and A19 read), and nothing a directory cannot supply — no
 * rig spec, no declared durations, no second compile. So `A09` and
 * `A18` report SKIP here exactly as they do there, and the line is the line
 * that command prints for these files, not the one `build` printed for the
 * compile that wrote them. Measured on every run, because the page must not
 * carry a figure this run did not measure.
 */
function previewGate(skeletonPath: string, skeletonText: string, atlasText: string, atlasDir: string): PreviewGate {
  const modelText = modelTextBeside(skeletonPath, skeletonText);
  const lines = reportLines(validate({ skeletonText, atlasText, atlasDir, ...(modelText === undefined ? {} : { modelText }), profile: CLI_DEFAULT_PROFILE }));
  const refusal = lines.find((line) => line.startsWith('  FAIL  '));
  return {
    // `reportLines` ends on the summary by construction; the gutter is the
    // report's layout, not part of what the gate said.
    summary: lines[lines.length - 1].replace(/^ {2}\.\. {4}/, ''),
    refusal: refusal === undefined ? null : refusal.trimStart(),
  };
}

/**
 * preview — the artifact playing in Esoteric's own web player, as one file.
 *
 * ⚠️ Nothing is rasterised here and nothing is decoded. The pages go into the
 * page as the bytes they are on disk, so a preview works for any PNG a BROWSER
 * can draw rather than for the ones our own decoder reads — which is the right
 * direction for the command whose whole job is "just show me".
 */
export function cmdPreview(flags: Record<string, string>, candidates: string[]): void {
  // Refused rather than ignored: a preview asked to hide `head` that plays the
  // whole rig is a picture that answers a question it was not asked (issue #835).
  for (const flag of ['slot', 'hide'] as const) {
    if (flags[flag] !== undefined) {
      throw new UsageError(
        `preview takes no --${flag}: the Spine Web Player draws what the skeleton draws. A subset of the slots is ` +
          `\`rigc render --${flag} ${flags[flag]}\`, on the whole rig's grid`,
      );
    }
  }
  const several = candidates.length > 1;
  // `--atlas` names ONE atlas, and with several skeletons there is no
  // unambiguous thing it could mean — the refusal `vote` makes, for the reason
  // it makes it.
  if (several && flags.atlas !== undefined) {
    throw new UsageError(
      `--atlas names one atlas and ${candidates.length} --candidate were given; each candidate's atlas has to sit ` +
        'beside its skeleton, which is what `build --out` leaves behind',
    );
  }
  const found = several
    ? candidates.map((target) => {
        const { skeletonPath, atlasPath, atlasDir } = spinePairOf(resolveBuild(target, undefined));
        return { target, skeletonPath, atlasPath, atlasDir };
      })
    : [{ target: flags.candidate, ...resolveViewable(flags) }];
  // ⚠️ By the FILE each one resolves to, not by the text typed: `build/` and
  // `build/skeleton.json` are two spellings of one candidate, and so are
  // `/tmp/x` and `/private/tmp/x` on a machine where one is a link to the other
  // — `resolve` alone left that pair unrefused, measured on macOS. A page
  // showing one skeleton twice is two panes that look like a comparison of
  // nothing. (`vote` accepts a repeat today, exit 0; that is its own card.)
  const identities = found.map((f) => realpathSync(f.skeletonPath));
  for (let i = 1; i < found.length; i++) {
    const first = identities.indexOf(identities[i]);
    if (first < i) {
      throw new UsageError(
        `--candidate ${JSON.stringify(found[i].target)} is ${identities[i]}, which --candidate ` +
          `${JSON.stringify(found[first].target)} already names (candidates ${first + 1} and ${i + 1}); a pane per ` +
          'candidate would show the same skeleton twice',
      );
    }
  }

  // Every candidate's texts and animation are read before a line is printed,
  // so a refusal about any of them comes before the report, as it always has.
  const loaded = found.map((f, i) => {
    const skeletonText = readFileSync(f.skeletonPath, 'utf8');
    const atlasText = readFileSync(f.atlasPath, 'utf8');
    const animations = skeletonAnimationNames(skeletonText, f.skeletonPath);
    let chosen: string | undefined;
    try {
      chosen = readAnimationFlag(flags, animations);
    } catch (err) {
      // With several candidates the refusal has to say WHICH one lacks it.
      if (several && err instanceof UsageError) {
        throw new UsageError(`candidate ${i + 1} (${f.skeletonPath}): ${err.message}`);
      }
      throw err;
    }
    return { ...f, skeletonText, atlasText, animations, chosen };
  });

  // A directory for --out is taken as "put the default name in here", because
  // `--out render/` is what the sibling command means by the same flag and a
  // preview written OVER a directory is not a recoverable mistake.
  const target = resolve(flags.out ?? 'preview.html');
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, 'preview.html') : target;
  const version = readVersion();

  console.log('rigc preview');
  const inputs: PreviewInput[] = loaded.map((candidate, i) => {
    const { skeletonPath, atlasPath, atlasDir, skeletonText, atlasText, animations, chosen } = candidate;
    if (several) console.log(`  ..    pane ${i + 1} of ${loaded.length}`);
    console.log(`  ..    skeleton ${skeletonPath}`);
    console.log(`  ..    atlas    ${atlasPath}`);
    const pages: PreviewPage[] = atlasPageNames(atlasText).map((name) => {
      const path = join(atlasDir, name);
      if (!existsSync(path)) {
        throw new UsageError(
          `the atlas declares page "${name}", which resolves to ${path} and is not there — ` +
            'a page a preview cannot embed is a page the player could not have loaded either',
        );
      }
      return { name, bytes: readFileSync(path) };
    });
    for (const page of pages) {
      console.log(`  ..    page     ${page.name.padEnd(28)} ${(page.bytes.length / 1024).toFixed(1)} KiB`);
    }
    if (!declaresSetupStage(skeletonHeaderOf(skeletonText))) console.log(`  ..    ${STAGELESS_FRAMING.preview}`);
    const gate = previewGate(skeletonPath, skeletonText, atlasText, atlasDir);
    console.log(`  ..    gate     ${gate.summary}`);
    if (gate.refusal !== null) {
      console.log(
        `  ..    gate     refused — ${gate.refusal}. Previewed anyway: looking at a red build is what preview is ` +
          'for, and the page header says the same',
      );
    }
    return {
      skeletonText,
      atlasText,
      pages,
      animation: chosen ?? animations[0] ?? null,
      animations,
      label: skeletonPath,
      version,
      gate,
    };
  });

  const html = several ? buildPreviewPanes(inputs, version) : buildPreview(inputs[0]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const pageCount = inputs.reduce((n, input) => n + input.pages.length, 0);
  console.log(
    several
      ? `  ..    embedded ${pageCount} page(s) + ${inputs.length} skeletons and atlases as data URIs, one pane each; ` +
          `the player itself loads from unpkg (@${PLAYER_LINE}), so the first open needs a network`
      : `  ..    embedded ${pageCount} page(s) + the skeleton and atlas as data URIs; ` +
          `the player itself loads from unpkg (@${PLAYER_LINE}), so the first open needs a network`,
  );
  console.log(`rigc: wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB — open it in a browser)`);
}

/** Load one candidate off disk in the shape a ballot needs. */
function loadBallotCandidate(target: string): { candidate: BallotCandidateInput; animations: string[] } {
  const { skeletonPath, atlasPath } = spinePairOf(resolveBuild(target, undefined));
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');
  const atlasDir = dirname(atlasPath);
  const pages: PreviewPage[] = atlasPageNames(atlasText).map((name) => {
    const path = join(atlasDir, name);
    if (!existsSync(path)) {
      throw new UsageError(
        `the atlas declares page "${name}", which resolves to ${path} and is not there — ` +
          'a page a ballot cannot embed is a page the player could not have loaded either',
      );
    }
    return { name, bytes: readFileSync(path) };
  });
  return {
    candidate: { source: skeletonPath, skeletonText, atlasText, pages },
    animations: skeletonAnimationNames(skeletonText, skeletonPath),
  };
}

/**
 * The one animation every candidate plays.
 *
 * ⚠️ Refused rather than resolved per candidate. Two panes running two
 * different animations look like a comparison and are not one, and a voter has
 * no way to see that it happened — the labels are `A` and `B`, which is the
 * whole point, so nothing on the screen would say so.
 */
function commonAnimation(
  flags: Record<string, string>,
  loaded: { animations: string[] }[],
): string | null {
  const asked = flags.animation;
  if (asked === undefined) {
    const first = loaded[0].animations[0];
    if (first === undefined) {
      const withAny = loaded.findIndex((l) => l.animations.length > 0);
      if (withAny !== -1) {
        throw new UsageError(
          `candidate ${withAny + 1} has animations [${loaded[withAny].animations.join(', ')}] and candidate 1 has none — ` +
            'a ballot plays one animation in every pane, so there is nothing to compare here',
        );
      }
      return null;
    }
    const missing = loaded.findIndex((l) => !l.animations.includes(first));
    if (missing !== -1) {
      throw new UsageError(
        `the default animation is candidate 1's first, ${JSON.stringify(first)}, and candidate ${missing + 1} does not ` +
          `have it (it has [${loaded[missing].animations.join(', ') || 'none'}]); name one they share with --animation`,
      );
    }
    return first;
  }
  const missing = loaded.findIndex((l) => !l.animations.includes(asked));
  if (missing !== -1) {
    throw new UsageError(
      `no animation ${JSON.stringify(asked)} in candidate ${missing + 1}; it has ` +
        `[${loaded[missing].animations.join(', ') || 'none'}]`,
    );
  }
  return asked;
}

/** vote (ballot mode) — write the page a human opens. */
function cmdVoteBallot(flags: Record<string, string>, candidates: string[]): void {
  if (candidates.length < MIN_CANDIDATES) {
    throw new UsageError(
      `a ballot needs ${MIN_CANDIDATES}–${MAX_CANDIDATES} --candidate <dir | skeleton.json>, and ${candidates.length} ` +
        'was given — one candidate on its own is `rigc preview`',
    );
  }
  if (candidates.length > MAX_CANDIDATES) {
    throw new UsageError(
      `${candidates.length} candidates were given and a ballot holds at most ${MAX_CANDIDATES} — they go side by side ` +
        'on one screen, and a comparison that needs scrolling is not a comparison',
    );
  }
  // `--atlas` names ONE atlas and there are several skeletons here, so there is
  // no unambiguous thing it could mean. Each candidate's atlas has to sit beside
  // its skeleton, which is what `build --out` leaves behind.
  if (flags.atlas !== undefined) {
    throw new UsageError(
      '--atlas names one atlas and a ballot has several candidates; each one\'s atlas has to sit beside its skeleton',
    );
  }

  const loaded = candidates.map((target) => loadBallotCandidate(target));
  const animation = commonAnimation(flags, loaded);

  const target = resolve(flags.out ?? DEFAULT_BALLOT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_BALLOT) : target;

  const input: BallotInput = {
    candidates: loaded.map((l) => l.candidate),
    animation,
    version: readVersion(),
  };
  const { html, manifest } = buildBallot(input);

  console.log('rigc vote');
  console.log(`  ..    ballot    ${manifest.ballot}`);
  console.log(`  ..    animation ${animation === null ? '(none — the setup pose)' : animation}`);
  for (let i = 0; i < manifest.candidates.length; i++) {
    const entry = manifest.candidates[i];
    const bytes = loaded[i].candidate.pages.reduce((n, p) => n + p.bytes.length, 0);
    console.log(
      `  ..    ${entry.label}         ${entry.digest.slice(0, 'sha256:'.length + 12)}…  ` +
        `${entry.pages.length} page(s), ${(bytes / 1024).toFixed(1)} KiB  <- ${entry.source}`,
    );
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(
    `  ..    the page shows ${manifest.candidates.map((c) => c.label).join('/')} and nothing else — the paths above are ` +
      'in its manifest, never on the screen',
  );
  console.log(
    `  ..    embedded every candidate's skeleton, atlas and page(s) as data URIs; the player itself loads from ` +
      `unpkg (@${PLAYER_LINE}), so the first open needs a network`,
  );
  console.log(`rigc: wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB — open it in a browser)`);
  console.log(
    `rigc: then record the saved vote with  rigc vote --record ${resultFilename(manifest.ballot)} --ballot ${out}`,
  );
}

/** vote (record mode) — check one saved vote and append it to the ledger. */
function cmdVoteRecord(flags: Record<string, string>): void {
  for (const key of ['candidate', 'out'] as const) {
    if (flags[key] !== undefined) {
      throw new UsageError(`--record and --${key} are the two halves of this command; run them one at a time`);
    }
  }
  const resultPath = resolve(flags.record);
  const ballotPath = resolve(flags.ballot ?? DEFAULT_BALLOT);
  const ledgerPath = resolve(flags.ledger ?? DEFAULT_LEDGER);
  for (const [what, path] of [
    ['result', resultPath],
    ['ballot', ballotPath],
  ] as const) {
    if (!existsSync(path)) {
      throw new UsageError(
        `no ${what} file at ${path}` + (what === 'ballot' ? ' — name the page this vote came from with --ballot' : ''),
      );
    }
  }

  console.log('rigc vote --record');
  console.log(`  ..    result ${resultPath}`);
  console.log(`  ..    ballot ${ballotPath}`);
  console.log(`  ..    ledger ${ledgerPath}`);

  const manifest = readBallotManifest(readFileSync(ballotPath, 'utf8'), ballotPath);
  const result = readJsonFile(resultPath);
  const existing = existsSync(ledgerPath) ? parseLedger(readFileSync(ledgerPath, 'utf8'), ledgerPath) : [];
  const attempts = existing.filter((l) => l.ballot === manifest.ballot).length;
  const again = flags.again !== undefined;

  const { refusals, line } = verifyResult(manifest, result, { attempts, again });
  if (line === null) {
    for (const refusal of refusals) console.error(failLine(refusal.rule, refusal.detail));
    console.error(`rigc: ${refusals.length} refusal(s) — nothing appended to ${ledgerPath}`);
    process.exit(1);
  }
  for (const rule of VOTE_RULES) console.log(`  PASS  ${rule}`);

  line.seq = existing.length + 1;
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, ledgerLineText(line));
  console.log(
    `  ..    ${line.choice === TIE ? 'tie' : `winner ${line.choice} = ${line.winner}`}, ` +
      `reason code ${line.reasonCode}${line.attempt > 1 ? `, attempt ${line.attempt}` : ''}`,
  );
  console.log(
    `  ..    coverage ${line.coverage.length} candidate(s): ` +
      line.coverage.map((c) => `${c.label}=${c.digest.slice(0, 'sha256:'.length + 12)}…`).join(' '),
  );
  console.log(`rigc: appended line ${line.seq} to ${ledgerPath}`);
}

export function cmdVote(flags: Record<string, string>, candidates: string[]): void {
  if (flags.record !== undefined) cmdVoteRecord(flags);
  else if (candidates.length > 0) cmdVoteBallot(flags, candidates);
  else {
    throw new UsageError(
      'vote takes either 2–4 --candidate <dir | skeleton.json> to write a ballot, or --record <result.json> to ' +
        'record one that came back',
    );
  }
}

/**
 * bench — run one rung of the benchmark ladder against a candidate rig.
 *
 * Two questions, asked in this order and never merged:
 *
 *   1. Is the candidate valid Spine at all? That is `validate --profile spine`,
 *      and it is the only part with a pass/fail. The profile is pinned here, not
 *      inherited from the CLI default: the thing being reproduced is an editor
 *      export, and holding it to this project's renderer policy would fail rungs
 *      for reasons the rung is not about.
 *   2. How close is it, structurally, to the reference? That is `diff`, and it
 *      has no threshold at all. There is no score to pass, on purpose — see
 *      `src/diff.ts`. A rung is called cleared by a human reading the measures,
 *      and `docs/LADDER.md` records that judgement.
 *
 * ⚠️ The candidate is validated against the SPINE profile and compared against
 * the reference; the reference is never validated here. It is editor output and
 * is the definition of correct for this exercise, so gating it would be gating
 * the yardstick with the ruler.
 */
export function cmdBench(flags: Record<string, string>, positional: string[]): void {
  const rungId = positional[0];
  if (!rungId) throw new UsageError(`bench takes a rung: ${RUNG_IDS.join(' | ')}`);
  const rung = findRung(rungId);
  if (!rung) throw new UsageError(`unknown rung ${JSON.stringify(rungId)}; known: ${RUNG_IDS.join(', ')}`);
  if (flags.candidate === undefined) throw new UsageError('bench needs --candidate <dir | skeleton.json>');

  // bench judges a reproduction of editor output, so `spine` is PINNED here
  // rather than inherited. It reads the same as the CLI default today (#221) and
  // is kept as its own statement anyway: the ladder's stage-1 gate is defined by
  // `docs/GATE.md` as `validate --profile spine`, and a bench run must go on
  // meaning that whatever a later release decides the default should be.
  const profile: ValidateProfile = flags.profile === undefined ? 'spine' : readProfile(flags);
  const exportDir = resolve(PACKAGE_ROOT, 'examples', rung.example, 'export');
  if (!existsSync(exportDir)) {
    // `bun run fetch-examples` runs `scripts/fetch-examples.sh`, and `scripts/`
    // is not in package.json's `files` — an npm install has no such script to
    // run. Its presence is what tells the two contexts apart, so the remedy
    // named here is one that actually exists in whichever context this is.
    const remedy = existsSync(resolve(PACKAGE_ROOT, 'scripts', 'fetch-examples.sh'))
      ? 'run `bun run fetch-examples` first'
      : `bench needs a checkout of ${repositoryUrl()} — its \`fetch-examples\` script is not part of the installed package`;
    throw new UsageError(`no example corpus at ${exportDir} — ${remedy} (examples/ is gitignored, not shipped)`);
  }

  // Both files there and the skeleton JSON before the first line is printed, refused by name as `render` refuses
  // them (issue #1042): a missing file and a skeleton that is not JSON surfaced as an ENOENT or a SyntaxError and a
  // stack, the second only after the validate block had printed.
  const { skeletonPath, atlasPath } = resolveViewable({ candidate: flags.candidate, ...(flags.atlas === undefined ? {} : { atlas: flags.atlas }) });
  const skeletonText = readSkeletonText(skeletonPath);
  const atlasText = readFileSync(atlasPath, 'utf8');

  console.log(`rigc bench rung ${rung.id} — ${rung.example}`);
  console.log(`  gates      ${rung.gates}`);
  console.log(`  candidate  ${skeletonPath}`);
  console.log(`  atlas      ${atlasPath}`);
  console.log('');

  console.log(`  ── validate (profile ${profile}) ──`);
  const benchModel = modelTextBeside(skeletonPath, skeletonText);
  const report = validate({ skeletonText, atlasText, atlasDir: dirname(atlasPath), ...(benchModel === undefined ? {} : { modelText: benchModel }), profile });
  for (const line of reportLines(report)) console.log(`  ${line}`);
  console.log('');

  const candidateJson: unknown = JSON.parse(skeletonText);
  const diffs: Array<{ skeleton: RungSkeleton; reference: string; report: DiffReport }> = [];
  for (const skeleton of rung.skeletons) {
    const referencePath = join(exportDir, skeleton.file);
    if (!existsSync(referencePath)) {
      console.error(`  MISSING  ${referencePath} — re-run \`bun run fetch-examples\``);
      continue;
    }
    const role = skeleton.role === 'stretch' ? ' (stretch — reported, does not count)' : '';
    console.log(`  ── diff vs ${rung.example}/${skeleton.label}${role} ──`);
    const diff = diffSkeletons(candidateJson, JSON.parse(readFileSync(referencePath, 'utf8')));
    for (const line of diffLines(diff, { candidate: skeletonPath, reference: referencePath })) console.log(`  ${line}`);
    console.log('');
    diffs.push({ skeleton, reference: referencePath, report: diff });
  }

  // Stage 3, optional and behind a flag because the correspondence is an INPUT:
  // a candidate is entitled to its own bone names, so there is nothing sensible
  // to default to and a derived mapping would be a guess reported as a
  // measurement (issue #8). Nothing here gates, and without the flag the report
  // above is unchanged to the byte.
  const boneDists: Array<{ skeleton: RungSkeleton; report: BoneDistReport }> = [];
  if (flags.bones !== undefined) {
    for (const skeleton of rung.skeletons) {
      const referencePath = join(exportDir, skeleton.file);
      if (!existsSync(referencePath)) continue;
      console.log(`  ── bonedist vs ${rung.example}/${skeleton.label} (stage 3) ──`);
      const boneDist = boneDistance({
        candidateSkeleton: skeletonPath,
        candidateAtlas: atlasPath,
        referenceSkeleton: referencePath,
        referenceAtlas: join(exportDir, skeleton.atlas),
        bones: flags.bones,
        // Deliberately NOT `flags.fps`. Inside `bench` that flag already means
        // "the rate this frame set was recorded at, for a set with no sidecar",
        // and one flag doing two unrelated things in one command is how a
        // reader ends up quoting a figure measured at a rate they did not ask
        // for. A run wanting another sampling rate calls `rigc bonedist`, where
        // `--fps` has exactly one meaning.
      });
      for (const line of boneDistLines(boneDist, { allBones: flags['all-bones'] !== undefined })) console.log(`  ${line}`);
      console.log('');
      boneDists.push({ skeleton, report: boneDist });
    }
  }

  // Third, optional and third for a reason: is it the same MOTION? `diff`
  // compares structure, and a reversed easing is the same key count and the same
  // curve kind — so a row of this ladder carrying only `validate` and `diff`
  // records a rig that could be animated backwards. `--frames` folds `check`'s
  // table into the report so a future row carries both.
  let check: CheckReport | null = null;
  if (flags.frames !== undefined) {
    console.log(`  ── check vs frames ${resolve(flags.frames)} ──`);
    check = runCheck(flags.candidate, flags.atlas, flags.frames, flags);
    for (const line of checkLines(check, { allFrames: flags['all-frames'] !== undefined })) console.log(`  ${line}`);
    console.log('');
  }

  console.log('  ── summary ──');
  console.log(`  validate   ${report.failures.length === 0 ? 'green' : `${report.failures.length} FAILED`}  (profile ${profile})`);
  for (const d of diffs) {
    const means = d.report.sections.map((s) => `${s.name}=${s.ratio.toFixed(3)}`).join('  ');
    console.log(`  ${d.skeleton.label.padEnd(10)} ${means}${d.skeleton.role === 'stretch' ? '   [stretch]' : ''}`);
    // Second line, not folded into the first: the figures above are the ones
    // every bench.json on disk already carries, and a ladder record is worth
    // less the moment its headline stops meaning what the older ones meant.
    // The sections whose measures are dominated by name-keyed ones get their
    // name-agnostic figure printed beside — issue #21.
    const split = d.report.sections.filter((s) => s.nameAgnostic !== undefined);
    if (split.length > 0) console.log(`  ${''.padEnd(10)} ${split.map(sectionFigures).join('   ')}`);
    // A third line, for the same reason the second one is not folded into the
    // first: the reported measures are unobservable by construction, so they
    // roll into no mean at all and cannot be shown as one. Each is named with
    // its own figure — a per-section digest would be the mean this block exists
    // to refuse.
    const reported = reportedFigures(d.report);
    if (reported !== null) console.log(`  ${''.padEnd(10)} reported: ${reported}`);
  }
  if (check) {
    // The framing goes first because it is upstream of every MAE below it: a
    // summary that reported those numbers without saying how the two shots were
    // put on each other is how issue #34 stayed invisible for two ladder runs.
    const framing = check.framingFit;
    if (!framing && check.sharedFraming) {
      const f = check.sharedFraming.fit;
      console.log(
        `  framing    one per set (${check.animations.length}); one shared box leaves ` +
          `x${f.scale.toFixed(6)}, rms ${f.rms.toFixed(2)}px — see the check table above for each set's own`,
      );
    }
    if (framing) {
      const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
      const how = !framing.applied
        ? 'measured only — --viewport pinned'
        : framing.source === 'declared'
          ? `frames.json's own box, the candidate measured into it`
          : `fitted to the candidate's pixels, ${framing.passes} pass(es)${framing.settled ? '' : framing.cycled ? ', cycling' : ', unsettled'}`;
      // The MAE-refined offset belongs on this line rather than only in `check`'s
      // own table: it moved the box every figure below was measured in, so a row
      // that quoted the figures without it would not say what they were measured
      // against — issue #146's own version of the #34 lesson above.
      const r = framing.refinement;
      const refined =
        r === null || !r.applied
          ? ''
          : `  MAE-refined ${signed(r.dx)}, ${signed(r.dy)}px (${r.before.toFixed(2)} → ${r.after.toFixed(2)} ref)`;
      console.log(
        `  framing    fit x${framing.fit.scale.toFixed(6)}  rms ${framing.fit.rms.toFixed(2)}px  union residual ` +
          `${signed(framing.fit.residualWidth)} x ${signed(framing.fit.residualHeight)}px  (${how})${refined}`,
      );
    }
    for (const anim of check.animations) {
      const attributed = anim.compared - anim.framesWithoutDrift;
      const drift =
        anim.worstDriftFrame < 0
          ? 'no slot attributable in any of them'
          : `worst slot drift ${anim.worstDrift.toFixed(1)}px, attributed in ${attributed}`;
      // The per-frame change count is carried here and not only in `check`'s own
      // table because it is the one figure a flat MAE cannot imply: a shot can be
      // right at every frame and still hold or blink at the wrong moments.
      const change =
        anim.changeDisagreements === 0
          ? ''
          : `, ${anim.changeDisagreements}/${anim.changePairs} pair(s) change unlike the reference`;
      // Which of the candidate's own bone chains the error is in — one name, so a
      // loop between builds reads a unit to fix rather than a verdict on the shot.
      // The full table is in `check`'s own report; this is its headline.
      const worstChain = [...anim.chains].sort((a, b) => b.maeShare - a.maeShare)[0];
      const chain =
        worstChain === undefined ? '' : `, ${worstChain.chain} carries ${(worstChain.maeShare * 100).toFixed(0)}%`;
      // `ref=` is the same difference over the reference's own drawn pixels. It is
      // carried here and not only in `check`'s own table because this is the line a
      // loop reads between builds, and `mean=` has a denominator the candidate can
      // grow — see `FrameCheck.maeReference`.
      // ...and the contact sheet, when the set ships one: a row reading "over 2
      // frame(s)" for a 311-frame shot is the hole issue #36 closed, and the whole
      // -shot figure is the one that says the frames between the stills were seen.
      const sheet =
        anim.sheet === null
          ? ''
          : `, sheet ${anim.sheet.compared} tile(s) mean=${anim.sheet.meanMae.toFixed(2)} ` +
            `worst=${anim.sheet.worstMae.toFixed(2)}`;
      console.log(
        `  ${anim.dir.padEnd(10)} MAE mean=${anim.meanMae.toFixed(2)} worst=${anim.worstMae.toFixed(2)} ` +
          `ref=${anim.meanMaeReference.toFixed(2)}  over ${anim.compared} frame(s)  ${drift}${change}${chain}${sheet}`,
      );
    }
  } else {
    console.log('  check      not run — pass --frames <dir> to compare against the rendered reference frames.');
    console.log('             Without it this report says nothing about whether the ANIMATION is right.');
  }
  if (boneDists.length > 0) {
    for (const b of boneDists) {
      const w = b.report.worst;
      console.log(
        `  ${b.skeleton.label.padEnd(10)} bonedist worst position ${w.position.value.toFixed(6)} skeleton-size(s), ` +
          `rotation ${w.rotation.value.toFixed(4)}°, scale ${w.scale.value.toFixed(6)}, linear ${w.linear.value.toFixed(6)}  ` +
          `over ${b.report.animations.reduce((n, a) => n + a.compared, 0)} frame(s) × ${b.report.correspondence.pairs} bone pair(s)`,
      );
    }
  } else {
    console.log('  bonedist   not run — pass --bones <correspondence.json | identity> for the stage-3 per-frame');
    console.log('             bone world-transform distance. It reports and gates nothing.');
  }
  console.log('  Section figures are means of their own measures. There is no rung score:');
  console.log('  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.');

  if (flags.json !== undefined) {
    // No `gates` field, deliberately. The rung's gate string names its features
    // and its per-skeleton counts, which `bench/runs/README.md` forbids a run
    // from reading — and this report is one of the six files the run protocol
    // requires committing, so a copy of it here would sit inside every future
    // run's directory, which is exactly where the next author looks for process
    // notes. `rung` identifies the rung and carries nothing (issue #137). The
    // console block above still prints the gate string: that is for the person
    // reading the run, not a file the protocol commits.
    writeJson(flags.json, {
      rung: rung.id,
      example: rung.example,
      profile,
      candidate: { skeleton: skeletonPath, atlas: atlasPath },
      validate: report,
      // `referencePath`, not `reference`: a DiffReport already has a
      // `reference` of its own (the raw counts), and the spread wins.
      diffs: diffs.map((d) => ({
        label: d.skeleton.label,
        role: d.skeleton.role,
        referencePath: d.reference,
        ...d.report,
      })),
      check,
      // Absent rather than null when the flag was not passed: `bonedist: null`
      // in a stored record would read as "measured, nothing to report", and
      // that is the opposite of "not measured".
      ...(boneDists.length === 0
        ? {}
        : { boneDists: boneDists.map((b) => ({ label: b.skeleton.label, role: b.skeleton.role, ...b.report })) }),
    });
  }

  if (report.failures.length > 0) {
    console.error(`rigc: candidate is not valid Spine — ${report.failures.length} assertion(s) failed`);
    process.exit(1);
  }
}

/**
 * bonedist — the ladder's stage 3, run on its own.
 *
 * ⚠️ It reads BOTH skeletons, so it is a finish-line instrument like `bench` and
 * unlike `check`. Every convention behind every figure is printed above the
 * tables, and there is no score — see [`src/bonedist.ts`](src/bonedist.ts).
 */
export function cmdBoneDist(flags: Record<string, string>): void {
  if (flags.candidate === undefined) throw new UsageError('bonedist needs --candidate <dir | skeleton.json>');
  if (flags.reference === undefined) throw new UsageError('bonedist needs --reference <skeleton.json>');
  if (flags.bones === undefined) {
    throw new UsageError(
      `bonedist needs --bones <correspondence.json | ${IDENTITY_CORRESPONDENCE}> — a candidate is entitled to its own bone ` +
        'names, so the mapping is an input and never a guess; pass `identity` to state that the two use the same names',
    );
  }
  // Each side's files there and its skeleton JSON, refused by name as `render` refuses them (issue #1042); a pair
  // that does not load is `boneDistance`'s refusal (`CandidatePairError`, exit 2 below).
  const sideOf = (target: string, atlas: string | undefined): { skeletonPath: string; atlasPath: string } => {
    const side = resolveViewable({ candidate: target, ...(atlas === undefined ? {} : { atlas }) });
    readSkeletonText(side.skeletonPath);
    return side;
  };
  const candidate = sideOf(flags.candidate, flags.atlas);
  const reference = sideOf(flags.reference, flags['reference-atlas']);
  const report = boneDistance({
    candidateSkeleton: candidate.skeletonPath,
    candidateAtlas: candidate.atlasPath,
    referenceSkeleton: reference.skeletonPath,
    referenceAtlas: reference.atlasPath,
    bones: flags.bones,
    ...(flags.fps === undefined ? {} : { fps: Number(flags.fps) }),
  });
  console.log('rigc bonedist — per-frame bone world-transform distance (the ladder\'s stage 3)');
  for (const line of boneDistLines(report, { allBones: flags['all-bones'] !== undefined })) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, report);
}

/**
 * The bodies of every command whose `runtime` is not `false` (`COMMANDS`), by
 * name — what only `cli.ts` registers, beside `./core_commands.ts`'s.
 */
export const SPINE_COMMAND_RUNS: Readonly<Record<string, CommandRun>> = {
  build: ({ flags }) => cmdBuild(flags),
  repack: (args) => cmdRepack(args, ROUND_TRIP_GATE),
  validate: ({ flags, positional }) => cmdValidate(flags, positional),
  bench: ({ flags, positional }) => cmdBench(flags, positional),
  bonedist: ({ flags }) => cmdBoneDist(flags),
  preview: ({ flags, lists }) => cmdPreview(flags, lists.candidate ?? []),
  vote: ({ flags, lists }) => cmdVote(flags, lists.candidate ?? []),
};

/** `bonedist`'s refusal, whose class lives in the module that poses through spine-core (`CliEntry.refusals`). */
export const SPINE_COMMAND_REFUSALS: readonly CliRefusal[] = [
  { is: (err) => err instanceof BoneDistError, prefix: 'rigc bonedist error: ', status: 1 },
];

/** Each profile's rule count — the validator's, which the usage's `--profile` paragraph states. */
export const PROFILE_RULES = (profile: 'spine' | 'rig-play'): number => assertionCountForProfile(profile);
