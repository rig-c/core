/**
 * Does the PUBLISHED PACKAGE build a rig on a machine that has never seen this
 * repository?
 *
 *     bun run smoke                      the whole battery, on this tree's tarball
 *     bun run smoke -- --case clean      just the green one
 *     bun run smoke -- --source registry --version 0.21.0
 *
 * Four exit codes, because a caller has to be able to tell the outcomes apart
 * without reading prose: **0** every case passed, **1** a case went red —
 * against `--source registry`, the published artifact does not build — **2**
 * nothing ran at all, and **3** the registry never served the version inside
 * `--wait`, which says nothing about the package. See *The wait* below.
 *
 * Nothing else in this repository asks that question. `prepublishOnly` gates the
 * SOURCE TREE, the `ships` job in `squash-text.yml` reads packed PATH LISTS, `CUR16` reads
 * the relative imports of shipped modules, and `release.yml` publishes and never
 * installs. Each of those is a fact about a list; this is the fact about a
 * program — `npm pack`, `npm install` into an empty directory, and a real build:
 * compile, the round trip through `spine-core`, and files on disk.
 *
 * 🔒 **Nothing under this repository is on the fixture's path at run time.** The
 * rig spec, the motion spec and the plate generator below are authored as text
 * into the install directory, and the generator imports `rig-c/tools/plate.ts`
 * as a BARE specifier, so it resolves inside the install or not at all —
 * `SMOKE_FIXTURE_CAME_FROM_THE_PACKAGE` prints the path it resolved to and
 * refuses one that is not under the install. The only thing that crosses from the
 * checkout is the tarball this script packed out of it, which is the subject.
 *
 * 🌱 **The plants are part of the tool, not a story in a pull request.** A smoke
 * that has never been seen to fail proves that a program ran, not that a program
 * was checked, so every case but the first two rebuilds the tarball from a
 * PATCHED COPY of the extracted package — an allowlist entry removed, a module
 * removed, a dependency added back, the skills removed, the `exports` map
 * removed, its deep paths removed, a named entry removed (one plant per entry
 * since #1212), one observed symbol renamed, the parser's error class forked
 * from the one its entry exports, the core entry's build made to refuse, one byte of that build's
 * output moved, a node builtin imported inside `rig-c/core`'s closure (#1275) — and INVERTS the verdict: such a case is green only when the smoke
 * went red at the step it was supposed to, naming what went missing. The worktree is never patched; the patch is applied to the extraction
 * and packed from there, and a plant that removed nothing is itself a fault.
 *
 * ## The wait, and the two outcomes it separates (issue #563)
 *
 * ⏳ A publish returns before the registry serves what it published, and npm
 * says so on the way out: *"Your package is being processed and may take a few
 * minutes to become available."* That notice is the only statement of the
 * window anybody has, and it has no upper bound in it, so `--wait <minutes>`
 * keeps asking — 5 s, 10 s, 20 s, then every 30 s — and prints how long it has
 * been asking. The default is 15 minutes against three cuts measured between a
 * publish step returning and the version entering the registry's own packument
 * (`time[version]`): 4 min 11 s, 2 min 07 s and 2 min 38 s, all on 2026-09-16.
 * RELEASING.md carries those figures and their sources.
 *
 * 📦 **"Served" means the bytes, not the metadata** (issue #833). The packument
 * answering is the first half: v1.1.0's packument answered 2 min 38 s into the
 * wait and the tarball behind it was still a 404, so the first `npm pack` of
 * the battery failed and the run printed *the published artifact does not
 * build* over a package a dispatch confirmed green six minutes later. So each
 * attempt, once `npm view <spec> dist.tarball` answers, runs the fetch itself —
 * `npm pack <spec>`, the same command a case would run, through the same npm
 * configuration and cache — and the wait ends only when that has written a
 * non-empty tarball. The cases install **those bytes**, copied, rather than
 * fetching again, so "the fetch the smoke is about to make" and "the fetch the
 * wait saw succeed" are one fetch and there is no second one to race. Every
 * attempt line says which of the two pieces is still missing.
 *
 * 🚨 **Not-yet-served and served-and-broken are different facts and they do not
 * print the same red.** A version the registry has not finished processing says
 * nothing at all about the package: that is exit **3** and a message saying the
 * confirmation was not taken. Only a case going red on an artifact the registry
 * did serve is exit **1** and *the published artifact does not build*. The first
 * real run of the confirmation step went red on a cut that was fine, because a
 * 60-second wait ended in `npm view`'s raw `E404` and nothing said which of the
 * two had happened.
 *
 * What it cannot see, stated so nothing reads more into a green run than is
 * there: it does not run the published artifact unless `--source registry` asks
 * it to (the tarball this tree packs is not the tarball npm serves until a
 * publish makes it one), it says nothing about how the rig LOOKS — `rigc check`
 * is that instrument — and it is one platform's answer, the runner's. Both
 * halves of the probe are `--prefer-online` — npm caches a packument, a
 * negative answer included, and a poll reading its own earlier 404 back would
 * wait out the whole ceiling on a package that had already arrived.
 *
 * ## Why `scripts/` and not `tools/`
 *
 * It does not ship: it runs from a checkout, in CI and from `bun run smoke`, and
 * `scripts/fetch-examples.sh` is the standing example of exactly that. Both
 * directories are inside `bun run typecheck` — `tsconfig.json`'s `include` names
 * every `.ts` under `scripts/` as well as under `tools/` — and inside `bun run
 * lint`, so neither placement escapes a gate. But `tools/` is inside one more,
 * and being inside it is a cost rather than a benefit: `CUR18` asks whether every
 * declared spec key is named by code somewhere outside its own declaration, and
 * its population is `cli.ts`, `src/` and `tools/`. This file embeds a rig spec
 * and a motion spec, so measured against that population it names **56 of the
 * 182 declared keys** for a reason that has nothing to do with anything reading
 * them. Under `tools/` it would dilute a gate by a third of its subject; under
 * `scripts/` it is read by no gate whose population it can weaken.
 */
import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AliasTarballError, compareTarballs } from './alias_tarball.ts';

/** The repository this script packs — it is the subject, and nothing else reaches the fixture. */
const ROOT = resolve(import.meta.dir, '..');

/**
 * The name the package is published and installed under, read from the
 * `package.json` this tree packs and never written here: every bare specifier
 * the fixture and the probes import, the directory an install lands in and the
 * spec `--source registry` asks for are spelled from it. The package was
 * renamed once (issue #1258), and a literal here would have kept installing
 * one name while the tree packed the other.
 */
const NAME = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name?: string }).name ?? '';
if (NAME === '') throw new Error(`install_smoke: ${join(ROOT, 'package.json')} declares no name, so there is no package to install`);

/**
 * The runtime, which the package declares as a devDependency only (issue
 * #1061): an install has none, and the launcher then runs `cli_core.ts`. The
 * smoke measures that install first, then adds the runtime beside it and
 * measures the same `rigc` running `cli.ts`, then takes it away again.
 */
const RUNTIME = '@esotericsoftware/spine-core';

// ---------------------------------------------------------------------------
// The fixture, authored here because the package carries no art and no spec
// ---------------------------------------------------------------------------
//
// `gallery/`, `fixtures/` and `examples/` are outside `files`, so an installed
// package has nothing to build. What it does have is `tools/plate.ts`, which
// writes a PNG with a true size and a true alpha channel — the same choice
// `fixtures/public.ts` makes for the selftest, and the reason the plates below
// are checkerboards and capsules rather than anything anybody could mistake for
// art. No claim about seams, blending or appearance can come from them.
//
// The rig is the smallest one that makes the round trip non-trivial: a four-deep
// bone chain (root -> hip -> torso -> arm -> hand), three region attachments, one
// contour MESH built from a plate's own silhouette, and one animation whose two
// rotate timelines carry a named easing, so `A05_CURVE_ARRAY_LENGTH` reads a
// bezier rather than a constant. Every part carries transparent margin because
// `A19_OVERLAY_PNGS_HAVE_ALPHA` refuses an opaque overlay — the gate wrote this
// paragraph, not a preference.

const PLATE_SOURCE = `import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Plate, type RGBA } from '${NAME}/tools/plate.ts';

// \`fileURLToPath\` and not \`new URL(...).pathname\`: a URL's path is
// percent-encoded, so the gallery's own idiom writes into a directory literally
// named \`install%20smoke\` the moment the install path has a space in it. The
// unusual-path case is what found that, which is the whole reason it is a case.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

const INK: RGBA = [34, 38, 48, 255];
const PALE: RGBA = [214, 220, 232, 255];
const WARM: RGBA = [206, 132, 72, 255];

const stage = new Plate(256, 256);
for (let y = 0; y < 256; y += 32) {
  for (let x = 0; x < 256; x += 32) {
    const dark = (x / 32 + y / 32) % 2 === 0;
    stage.rect(x, y, 32, 32, dark ? [58, 64, 80, 255] : [78, 86, 106, 255]);
  }
}
stage.frame(0, 0, 256, 256, 2, PALE);
stage.textCentred('PLACEHOLDER', 128, 120, 2, PALE);
stage.writePng(join(OUT, 'stage.png'));

const torso = new Plate(48, 64);
torso.disc(24, 16, 16, PALE);
torso.disc(24, 48, 16, PALE);
torso.rect(8, 16, 32, 32, PALE);
torso.textCentred('TORSO', 24, 28, 1, INK);
torso.writePng(join(OUT, 'torso.png'));

const arm = new Plate(20, 48);
arm.disc(10, 10, 9, WARM);
arm.disc(10, 38, 9, WARM);
arm.rect(1, 10, 18, 28, WARM);
arm.writePng(join(OUT, 'arm.png'));

const flag = new Plate(56, 40);
flag.disc(18, 20, 15, WARM);
flag.disc(38, 20, 15, WARM);
flag.rect(18, 5, 20, 30, WARM);
flag.writePng(join(OUT, 'flag.png'));

console.log('RESOLVED ' + import.meta.resolve('${NAME}/tools/plate.ts'));
console.log('PLATES ' + OUT);
`;

const RIG_SPEC = {
  spec: 'rigc-rig/1',
  name: 'install_smoke',
  note: 'Authored by scripts/install_smoke.ts into an install directory. Synthetic plates; no claim about appearance comes from it.',
  images: 'parts',
  skeleton: { x: 0, y: 0, width: 256, height: 256 },
  invariants: { meshSlots: 1, meshTriangles: 96 },
  bones: [
    { name: 'root' },
    { name: 'hip', parent: 'root', x: 128, y: 64 },
    { name: 'torso', parent: 'hip', x: 0, y: 0, length: 64 },
    { name: 'arm', parent: 'torso', x: 0, y: 56, rotation: -20, length: 48 },
    { name: 'hand', parent: 'arm', x: 48, y: 0, length: 28 },
  ],
  slots: [
    { name: 'stage', bone: 'root', attachment: 'stage' },
    { name: 'torso', bone: 'torso', attachment: 'torso' },
    { name: 'arm', bone: 'arm', attachment: 'arm' },
    { name: 'flag', bone: 'hand', attachment: 'flag' },
  ],
  skins: {
    default: {
      stage: { stage: { image: 'stage.png', x: 128, y: 128 } },
      torso: { torso: { image: 'torso.png', y: 32 } },
      arm: { arm: { image: 'arm.png', x: 24, rotation: 90 } },
      flag: {
        flag: {
          type: 'mesh',
          image: 'flag.png',
          generator: { kind: 'contour', tolerance: 0.9, margin: 1.2, maxVertices: 96, alpha: 60 },
        },
      },
    },
  },
};

const MOTION_SPEC = {
  spec: 'rigc-motion/1',
  archetype: 'install_smoke',
  cut: 'install-smoke',
  easings: { settle: [0.28, 0, 0.36, 1] },
  animations: {
    wave: {
      duration: 1,
      loop: true,
      note: 'Two rotate timelines under a named easing, so the emitted curve arrays are beziers and not a pair of constants.',
      tracks: [
        {
          bone: 'arm',
          property: 'rotate',
          keys: [
            { t: 0, v: [0], ease: 'settle' },
            { t: 0.5, v: [18], ease: 'settle' },
            { t: 1, v: [0] },
          ],
        },
        {
          bone: 'hand',
          property: 'rotate',
          keys: [
            { t: 0, v: [0], ease: 'settle' },
            { t: 0.5, v: [-12], ease: 'settle' },
            { t: 1, v: [0] },
          ],
        },
      ],
    },
  },
};

/**
 * The plates the generator writes, and the size each one has to come back at.
 *
 * Read off the PNG header rather than off the file existing: a zero-byte file is
 * a file, and "the plate has a true size and a true alpha channel" is the only
 * thing that makes the build's measurements mean anything.
 */
const PLATES: Array<{ file: string; width: number; height: number }> = [
  { file: 'stage.png', width: 256, height: 256 },
  { file: 'torso.png', width: 48, height: 64 },
  { file: 'arm.png', width: 20, height: 48 },
  { file: 'flag.png', width: 56, height: 40 },
];

/**
 * The assertions this fixture makes the validator run, each named for the
 * feature that guarantees it.
 *
 * ⚠️ Not a count and not the whole list — a total would be a hand-kept number
 * that moves with every new rule, and "no FAIL line" is satisfied by a build
 * that asserted nothing at all. These six are the ones the fixture was built to
 * reach, so a run that does not print them measured something else.
 */
const REQUIRED_ASSERTIONS: Array<[string, string]> = [
  ['A00_ROUNDTRIP_PARSE', 'the round trip through the installed @esotericsoftware/spine-core, which is the dependency under test'],
  ['A04_MESH_TRIANGLES_AND_ENCODING', 'the contour mesh on slot "flag"'],
  ['A05_CURVE_ARRAY_LENGTH', "the two rotate timelines' named easing, emitted as bezier curve arrays"],
  ['A06_ATLAS_PAGE_SIZE_MATCHES_PNG', 'the packed page, whose PNG the validator re-reads off disk'],
  ['A17_ATLAS_PAGE_FILES_EXIST', 'the atlas written beside the skeleton'],
  ['A18_DETERMINISTIC_EMIT', 'the second, independent compile the build runs to compare byte for byte'],
];

/**
 * The surface a dependant may import (issue #859): each `exports` key rigc
 * names, and the file it has to land on in the install. RELEASING.md *The
 * import surface* is where this is stated as a promise; this is where it is
 * checked, and `drop-deep-exports` cuts the map down to exactly these keys.
 */
const NAMED_EXPORTS: Record<string, string> = {
  './plate': 'tools/plate.ts',
  './font5x7': 'tools/font5x7.ts',
  './transform': 'src/transform.ts',
  './render': 'src/render.ts',
  './png': 'src/png.ts',
  './compile': 'src/compile.ts',
  './rig': 'src/rig.ts',
  './mesh': 'src/mesh.ts',
  './errors': 'src/errors.ts',
  './meshcompare': 'src/meshcompare.ts',
  './core': 'src/core/entry.ts',
  './cli': 'cli.ts',
  './package.json': 'package.json',
};

/** What a symbol has to be when the install hands it over: callable, or present and not callable. */
type SymbolKind = 'function' | 'constant';

/**
 * Every symbol a dependant was observed importing, by the named entry it is
 * promised through (issue #1167). RELEASING.md *The import surface* states the
 * promise — renaming or removing a symbol listed here is a breaking change —
 * and this is the one place that list is kept, so the promise and the check
 * cannot drift apart: the probe imports each entry FROM THE INSTALL and reads
 * every value symbol as present, with the kind it has today.
 *
 * - `values` are held. A rename leaves the old name `undefined` on the module
 *   namespace, and the line names the entry and the symbol.
 * - `types` are recorded and NOT held. A type does not exist at run time, and
 *   type-checking a consumer against the install needs `tsc`, which neither
 *   the package nor the `installs` job (no dev dependencies, deliberately)
 *   has. RELEASING.md says so rather than implying otherwise.
 * - `needsRuntime` is whether importing the entry needs
 *   `@esotericsoftware/spine-core` installed beside the package (a
 *   devDependency since 2.0.0). With the runtime taken away again, the probe
 *   imports every entry: one marked `false` has to load, and one marked `true`
 *   has to refuse naming the runtime — so the sentence RELEASING.md states
 *   beside the entry is measured in both directions, not remembered.
 *
 * ⚠️ The list grows by observation only. A symbol nobody was seen using is not
 * promised, however public it looks. The one exception is a symbol written
 * FOR a dependant under a contract it agreed in writing before it could import
 * it — `AGREED_IN_1224` — whose row says so in place of an observation.
 *
 * 🔸 **One row per entry and observation**, not one row per entry: a row's
 * `observed` is when and where ITS symbols were first seen, so a later
 * observation that adds symbols to an entry already listed is a second row for
 * that entry rather than an edit of the first — the first observation stays
 * the record of what was promised then. The probe reads every row and counts
 * entries, not rows, and an entry's rows have to agree on `needsRuntime`.
 */
interface ObservedEntry {
  /** The `exports` key, spelled as `NAMED_EXPORTS` spells it. */
  entry: string;
  /** Who was seen importing it, and the issue that recorded it. */
  observed: string;
  needsRuntime: boolean;
  values: Record<string, SymbolKind>;
  types: string[];
}

const OBSERVED_IN_1167 = 'rig-parts 0.8.2, issue #1167';
/** The same dependant read again — every import of the package anywhere in its tree, `src/` and its dev files alike. */
const OBSERVED_IN_1212 = 'rig-parts 0.14.0, issue #1212';
/**
 * Promised before it could be observed: the mesh-quality operations the
 * dependant agreed to import through `rig-c/mesh` (docs/MESH_REDUCTION.md
 * P1, rig-parts#126) and that issue #1224 added. RELEASING.md *The import
 * surface* says why an agreed contract is the one exception to "observed".
 */
const AGREED_IN_1224 = 'rig-parts#126 agreed (docs/MESH_REDUCTION.md, P1), issue #1224';
/** The dependant's automatic mesh mode read (rig-parts c03dd8a, its PR #131): two types of the agreed row it uses that no row had recorded — found by rigc#1238 D1, recorded by #1241. */
const OBSERVED_IN_131 = 'rig-parts c03dd8a (its PR #131), issue #1241';
/**
 * The second agreed row: the motion comparison, which the same contract puts
 * on an entry of its own, `rig-c/meshcompare` (docs/MESH_REDUCTION.md P1
 * and P2 — the core is the only poser, so the entry needs nothing installed
 * beside the package), added by issue #1230. Its one function is also CALLED
 * from the install with the runtime taken away — `MESHCOMPARE_PROBE_SOURCE`,
 * the contract's `MQ45`.
 */
const AGREED_IN_1230 = 'rig-parts#126 agreed (docs/MESH_REDUCTION.md, P1 and P2), issue #1230';
/**
 * The third agreed row: the skinning residual's envelope helper, which the dependant asked to be rig-c's — "one
 * definition, under rig-c's controls, so parts and the measurement agree on what `linear` means" (rig-parts#126,
 * comment 6072801422, Q3; docs/MESH_REDUCTION.md §7) — and the types of the input it fills
 * (`MeshMeasureInput.skinning`), added by issue #1294 on `rig-c/mesh`, which the measurement already lives behind.
 */
const AGREED_IN_1294 = 'rig-parts#126 agreed (docs/MESH_REDUCTION.md §7, Q3), issue #1294';
/**
 * The poser a runtime-free web player links (issue #1275): rig-play poses
 * `skeleton.model.json` with rigc's own core and was seen importing these from
 * the core's files through the pattern courtesy, which promises nothing. The
 * entry re-exports them (`src/core/entry.ts`) and needs nothing installed
 * beside the package; phase three CALLS `readModel` and `poseRawSetup` from the
 * install, and bundles the entry for a browser (`CORE_PROBE_SOURCE`).
 */
const OBSERVED_IN_1275 = 'rig-play (the successor of spine-html), issue #1275';
/**
 * The live track (issue #1276): promised before it could be observed, as the
 * agreed rows above were — the rig-play 1.0 plan asked for it on the issue
 * (a player steps once per frame by a `dt` it does not know in advance), and
 * the player's own cards are filed on its repository. RELEASING.md *The import
 * surface* says why.
 */
const REQUESTED_IN_1276 = 'rig-play 1.0 plan, requested on issue #1276';
/**
 * The player's four shapes (issue #1336), requested in writing on the issue
 * before the player could call them — the row above's exception again: the
 * types of `TrackOptions.adjust` (piece (b), an option of `openTrack`, which
 * that row holds), and the live tracks over several animations, `openTracks`,
 * with the types of its options, its state and a track's current entry
 * (piece (a)). Issue #1344's entry alpha and additive blending are fields and
 * a method of those same types, so they ride on this row (RELEASING.md *The
 * import surface*).
 */
const REQUESTED_IN_1336 = 'rig-play player migration, requested on issue #1336';
/**
 * The render's physics clock on the core entry (issue #1396): the live tracks
 * take a `clock` option, and the player asked on the issue for the clock the
 * render steps with — `physicsClockStep` and `PHYSICS_CLOCK_LEAD` — to be
 * importable from `rig-c/core` before it could pass it (play#103). The
 * option is a field of `TrackOptions` and `TracksOptions`, which the rows
 * above already name; this row holds the two symbols.
 */
const REQUESTED_IN_1396 = 'rig-play fixed-step clock, requested on issue #1396';
/**
 * The world the physics answers (issue #1416): the live tracks take
 * `setEnvironment`, `physicsTranslate` and `physicsRotate` — methods of
 * `LiveTrack` and `LiveTracks`, which the rows above name — and the issue
 * asked for the environment as a type the consumer sets, so the type a
 * player builds one with is importable from `rig-c/core`. This row holds it.
 */
const REQUESTED_IN_1416 = 'the environment the physics answers, requested on issue #1416';
/**
 * The poser's Bézier evaluation (issue #1417): rig-c/pose fits Bézier curves
 * to dense keys and holds each fit to a tolerance measured the way the poser
 * draws a curve — the ten-piece polyline, not the exact cubic — so it asked
 * for `bezierPolyline` and `BEZIER_PIECES` on `rig-c/core` rather than keep a
 * mirror of them. The entry re-exports the one function the poser calls
 * (`CA12` holds the identity); this row holds the two symbols.
 */
const REQUESTED_IN_1417 = 'rig-c/pose curve fitting, requested on issue #1417';
/** The player's named setup geometry read, agreed on issue #1538. */
const REQUESTED_IN_1538 = 'rig-play named setup mesh read, requested on issue #1538';
/** The player's per-instance physics preview controls, agreed on issue #1541. */
const REQUESTED_IN_1541 = 'rig-play live named physics parameters, requested on issue #1541';
/** The compiler's own lattice/reach preflight, agreed for parts#378 on core#1450. */
const AGREED_IN_1450 = 'parts#378 segments preflight, agreed on issue #1450';

const OBSERVED_SYMBOLS: ObservedEntry[] = [
  {
    entry: './mesh', observed: AGREED_IN_1450, needsRuntime: false,
    values: { buildSegmentsLattice: 'function', segmentDistance: 'function', influenceShares: 'function' },
    types: ['SegmentsLattice', 'SegmentsLatticeReport', 'EntrySegment', 'SegmentsInfluence', 'InfluenceShares'],
  },
  {
    entry: './plate',
    observed: OBSERVED_IN_1167,
    needsRuntime: false,
    values: { decodePng: 'function', encodePng: 'function', PNG_SIGNATURE: 'constant', pngChunk: 'function' },
    types: [],
  },
  { entry: './font5x7', observed: OBSERVED_IN_1167, needsRuntime: false, values: { drawText: 'function', GLYPH_H: 'constant' }, types: [] },
  {
    entry: './transform',
    observed: OBSERVED_IN_1167,
    needsRuntime: false,
    values: { computeWorldTransforms: 'function', cropToSpineY: 'function', toBoneLocal: 'function' },
    types: ['BoneTransform'],
  },
  {
    entry: './render',
    observed: OBSERVED_IN_1167,
    needsRuntime: true,
    values: { loadPosable: 'function', sampleAnimation: 'function', sampleSetupPose: 'function' },
    types: ['BoneSnapshot', 'Frame', 'Mesh'],
  },
  { entry: './png', observed: OBSERVED_IN_1167, needsRuntime: false, values: { assertPng: 'function' }, types: [] },
  { entry: './compile', observed: OBSERVED_IN_1167, needsRuntime: false, values: { headerBoxNumber: 'function' }, types: [] },
  {
    entry: './transform',
    observed: OBSERVED_IN_1212,
    needsRuntime: false,
    values: { computeExactFrameTransforms: 'function', normaliseDegrees: 'function', toWorld: 'function' },
    types: [],
  },
  {
    entry: './rig',
    observed: OBSERVED_IN_1212,
    needsRuntime: false,
    values: {
      parseRigSpec: 'function',
      splitRigSkin: 'function',
      RIG_SPEC_VERSION: 'constant',
      RIG_SKIN_CONSTRAINT_KEYS: 'constant',
      RIG_KEYS: 'constant',
    },
    types: ['RigSpec', 'RigBone', 'RigConstraint', 'RigSkin', 'RigSkinConstraintKey'],
  },
  {
    entry: './mesh',
    observed: OBSERVED_IN_1212,
    needsRuntime: false,
    values: {
      traceAlphaOutline: 'function',
      traceOutline: 'function',
      earClip: 'function',
      offsetPolygon: 'function',
      prunePolygon: 'function',
      simplifyClosedPolygon: 'function',
      signedArea: 'function',
      findSelfIntersection: 'function',
      checkHullOrder: 'function',
      measureAuthoredMeshFit: 'function',
      MeshError: 'function',
    },
    types: ['AlphaMask'],
  },
  { entry: './errors', observed: OBSERVED_IN_1212, needsRuntime: false, values: { CompileError: 'function' }, types: [] },
  {
    entry: './mesh',
    observed: AGREED_IN_1224,
    needsRuntime: false,
    values: { measureMeshQuality: 'function', writeMeshQualityReport: 'function', MeshReductionError: 'function', MESH_QUALITY_REPORT_SPEC: 'constant', reduceMesh: 'function' },
    types: [
      'MeshMeasureInput',
      'MeshQualityReport',
      'MeasureRow',
      'EvidenceSection',
      'CandidateReport',
      'EffectiveSettings',
      'MeshCounts',
      'Termination',
      'MeshReductionInput',
      'MeshReductionResult',
      'ReducedMesh',
      'ReductionChanges',
      'DeformTimelineInput',
      'DeformKeyInput',
    ],
  },
  {
    entry: './mesh',
    observed: OBSERVED_IN_131,
    needsRuntime: false,
    values: { reduceMesh: 'function' },
    types: ['SourceMesh', 'RefinementRegion'],
  },
  {
    entry: './mesh',
    observed: AGREED_IN_1294,
    needsRuntime: false,
    values: { skinningEnvelopeBone: 'function' },
    types: ['SkinningEnvelope', 'SkinningEnvelopeBone', 'SkinningResidualInput', 'SkinningDetail', 'SkinningEcho', 'BoneMotionRange', 'EnvelopeBoneRanges'],
  },
  {
    entry: './meshcompare',
    observed: AGREED_IN_1230,
    needsRuntime: false,
    values: { compareMeshesInMotion: 'function', uvCarriers: 'function' },
    types: ['MotionComparisonInput', 'BuiltCandidate', 'CompareAttachment'],
  },
  {
    entry: './core',
    observed: OBSERVED_IN_1275,
    needsRuntime: false,
    values: {
      readModel: 'function',
      underSkin: 'function',
      underNoSkin: 'function',
      CoreInputError: 'function',
      CORE_DOCUMENT_SPEC: 'constant',
      CORE_DOCUMENT_SPECS: 'constant',
      CORE_BLEND_MODES: 'constant',
      activeBones: 'function',
      poseRawSetup: 'function',
      poseRawAnimation: 'function',
      poseRawAnimationEach: 'function',
      loopedTime: 'function',
      setupBounds: 'function',
      poseWalkSetup: 'function',
      poseLoopingWalk: 'function',
      documentPageLookup: 'function',
      drawnRegions: 'function',
      regionPageUvs: 'function',
      meshPageUvs: 'function',
      readUvSequences: 'function',
      clipThrough: 'function',
      clipShapeOf: 'function',
      convexWhy: 'function',
      REGION_UVS: 'constant',
      REGION_TRIANGLES: 'constant',
      eventsFired: 'function',
    },
    types: [
      'CompiledDocument',
      'RawPose',
      'RawBone',
      'RawDrawn',
      'RawClip',
      'RawClipped',
      'RawEvent',
      'RawReset',
      'WalkPose',
      'CoreSlotRow',
      'CoreBlendMode',
      'ClipShape',
      'ClipResult',
      'DrawnRegion',
      'UvPage',
      'UvRegion',
      'UvSource',
      'ModelPage',
      'ModelPageRegion',
    ],
  },
  { entry: './core', observed: REQUESTED_IN_1276, needsRuntime: false, values: { openTrack: 'function' }, types: ['LiveTrack', 'TrackOptions'] },
  { entry: './core', observed: REQUESTED_IN_1336, needsRuntime: false, values: { openTracks: 'function' }, types: ['LocalAdjust', 'AdjustableLocals', 'BoneLocals', 'LiveTracks', 'TracksOptions', 'MixOptions', 'QueueOptions', 'TrackEntryView'] },
  { entry: './core', observed: REQUESTED_IN_1396, needsRuntime: false, values: { physicsClockStep: 'function', PHYSICS_CLOCK_LEAD: 'constant' }, types: [] },
  { entry: './core', observed: REQUESTED_IN_1416, needsRuntime: false, values: {}, types: ['PhysicsEnvironment'] },
  { entry: './core', observed: REQUESTED_IN_1417, needsRuntime: false, values: { bezierPolyline: 'function', BEZIER_PIECES: 'constant' }, types: [] },
  { entry: './core', observed: REQUESTED_IN_1538, needsRuntime: false, values: { readSetupMesh: 'function' }, types: ['SetupMesh', 'SetupMeshTarget'] },
  { entry: './core', observed: REQUESTED_IN_1541, needsRuntime: false, values: {}, types: ['PhysicsParameters', 'PhysicsParameterPatch', 'PhysicsParameterRead'] },
];

/**
 * The symbol `rename-symbol` renames in the packed copy. The export is renamed
 * and the function kept, so the module still loads, every call inside it still
 * reaches the function, and the build still runs; only a dependant reading the
 * old name can tell.
 *
 * ⚠️ That holds only for a symbol no other module in the package imports, and
 * which the probe's route calls do not read. Every named entry here IS the
 * module that defines its symbols, so renaming the entry's export renames it
 * for the package's own importers too: the plant once renamed
 * `headerBoxNumber`, which `src/assertions/bodies/a50.ts` imports, and then
 * `rigc --version`, both builds, render and the skills all died on the
 * missing export while the case stayed green by reading one step (issue
 * #1184). `loadPosable` is imported by no shipped module, and `alone` on the
 * plant measures that on every run: the day something inside imports it, the
 * other steps go red and the case says so.
 */
const RENAME_PLANT = { entry: './render', symbol: 'loadPosable', renamed: 'loadPosableRenamed' };

/**
 * The named entry each drop plant takes out of the packed map: `./render`, one
 * of the three #1167 added, and each of the three #1212 added — a plant per
 * entry, because each is a different dependant's import that has to go red by
 * its own name.
 */
type DropPlant = 'drop-named-entry' | 'drop-rig-entry' | 'drop-mesh-entry' | 'drop-errors-entry' | 'drop-meshcompare-entry' | 'drop-core-named-entry';
// ⚠️ `./core`'s plant is `drop-core-named-entry`, not `drop-core-entry`: that name was
// taken by #1061 for `cli_core.ts` leaving `files`, a different fault at a different step.
const DROPPED_ENTRIES: Record<DropPlant, string> = {
  'drop-named-entry': './render',
  'drop-rig-entry': './rig',
  'drop-mesh-entry': './mesh',
  'drop-errors-entry': './errors',
  'drop-meshcompare-entry': './meshcompare',
  'drop-core-named-entry': './core',
};
const isDropPlant = (plant: Plant): plant is DropPlant => plant in DROPPED_ENTRIES;

/**
 * What `fork-compile-error` does to the packed `src/rig.ts`: the import of
 * `CompileError` from `./errors.ts` replaced by a class of its own, so the
 * parser throws an error that is a `CompileError` by name and by message and
 * is NOT the class `rig-c/errors` exports. Nothing in the package imports
 * `CompileError` through `src/rig.ts` and a valid spec throws nothing, so the
 * module loads and every build runs; only a dependant that catches the
 * parser's refusal by its class — `instanceof` across the package boundary,
 * issue #1212 — can tell, and the call probe has to go red alone.
 */
const FORK_ERROR_IMPORT = "import { CompileError, NotImplementedError } from './errors.ts';";
const FORK_ERROR_PLANTED = "import { NotImplementedError } from './errors.ts';\nclass CompileError extends Error {}";
const FORK_ERROR_MODULE = 'src/rig.ts';

// A plant aimed at something the table does not list would prove nothing about
// the table, so every target is held to it where it is declared — and an
// entry's rows have to agree on what it needs, or the probe without the
// runtime would hold one entry to two statements.
if (OBSERVED_SYMBOLS.find((row) => row.entry === RENAME_PLANT.entry)?.values[RENAME_PLANT.symbol] === undefined) {
  throw new Error(`install_smoke: RENAME_PLANT names ${RENAME_PLANT.symbol} through ${RENAME_PLANT.entry}, which OBSERVED_SYMBOLS does not list`);
}
for (const [plant, entry] of Object.entries(DROPPED_ENTRIES)) {
  if (!OBSERVED_SYMBOLS.some((row) => row.entry === entry) || !(entry in NAMED_EXPORTS)) {
    throw new Error(`install_smoke: the plant ${plant} drops ${entry}, which is not a named entry OBSERVED_SYMBOLS lists`);
  }
}
if (OBSERVED_SYMBOLS.find((row) => row.entry === './errors')?.values.CompileError === undefined || NAMED_EXPORTS['./rig'] !== FORK_ERROR_MODULE) {
  throw new Error(`install_smoke: fork-compile-error forks the CompileError ${FORK_ERROR_MODULE} throws, and OBSERVED_SYMBOLS has to list CompileError through ./errors and NAMED_EXPORTS map ./rig to ${FORK_ERROR_MODULE}`);
}
for (const row of OBSERVED_SYMBOLS) {
  const other = OBSERVED_SYMBOLS.find((r) => r.entry === row.entry && r.needsRuntime !== row.needsRuntime);
  if (other !== undefined) throw new Error(`install_smoke: OBSERVED_SYMBOLS states ${row.entry} both needs and does not need ${RUNTIME} (${row.observed}; ${other.observed})`);
}

/**
 * The deep paths a dependant was observed importing before the map existed —
 * rig-parts, on 2026-09-27 — which the pattern courtesy has to keep.
 * They are also inside the every-shipped-path sweep below; they are named here
 * so that the failure a dependant would hit is the one this prints.
 */
const OBSERVED_DEEP_PATHS: Record<string, string> = {
  [`${NAME}/tools/plate.ts`]: 'tools/plate.ts',
  [`${NAME}/tools/font5x7.ts`]: 'tools/font5x7.ts',
  [`${NAME}/src/transform.ts`]: 'src/transform.ts',
  [`${NAME}/cli.ts`]: 'cli.ts',
};

/**
 * Imports the package the way a dependant does, from the install directory,
 * calls one symbol through every route that reaches a module, and reads every
 * symbol `OBSERVED_SYMBOLS` lists through its named entry. Run with
 * `without-runtime` (phase three) it only imports each observed entry and
 * holds it to its `needsRuntime`.
 *
 * It prints `EXPORT_BAD <specifier>: <what>` for each failure, so the harness
 * can name the subpath rather than the script, and `EXPORT_COUNTS …` once.
 *
 * ⚠️ The every-path sweep asks Bun and not Node, deliberately: Bun is the
 * runtime rigc runs on, and it is the one whose extension probing made
 * `rig-c/tools/plate` (no `.ts`) resolve before the map existed. Node's
 * `import.meta.resolve` does not look at the disk for a path with no pattern
 * match, so a Node answer here would pass a specifier nothing can load.
 */
const EXPORTS_PROBE_SOURCE = `import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = realpathSync(join(HERE, 'node_modules', '${NAME}'));
const plan = JSON.parse(readFileSync(join(HERE, 'exports_probe.json'), 'utf8'));
const bad = [];
const said = (spec, what) => bad.push(spec + ': ' + what);

const where = (spec) => {
  try {
    const url = import.meta.resolve(spec);
    const path = fileURLToPath(url);
    return existsSync(path) ? realpathSync(path) : 'MISSING ' + path;
  } catch (e) {
    return 'THROW ' + (e && e.message ? e.message : String(e));
  }
};
const lands = (spec, file) => {
  const got = where(spec);
  const want = join(ROOT, file);
  if (got !== want) said(spec, 'resolved to ' + got + ' and ' + file + ' in the install was required');
  return got === want;
};
const load = async (spec) => {
  try {
    return await import(spec);
  } catch (e) {
    said(spec, 'import threw ' + (e && e.message ? e.message : String(e)));
    return null;
  }
};

// 0. With the runtime taken away (phase three): every entry a dependant imports
// either loads, or — where it is stated to need the runtime — refuses naming it.
// Both directions, so a stale statement is as red as a broken entry.
// An entry with two rows of observations is still one entry: imported once, counted once.
const entries = [...new Map(plan.symbols.map((row) => [row.entry, row])).values()];
if (process.argv[2] === 'without-runtime') {
  let loaded = 0;
  let refused = 0;
  for (const row of entries) {
    const spec = '${NAME}' + row.entry.slice(1);
    let threw = null;
    try {
      await import(spec);
    } catch (e) {
      threw = e && e.message ? e.message : String(e);
    }
    if (!row.needsRuntime) {
      if (threw === null) loaded += 1;
      else said(spec, 'import without ' + plan.runtime + ' threw ' + threw + ', and this entry is stated to need nothing installed beside the package');
    } else if (threw === null) {
      said(spec, 'imported without ' + plan.runtime + ', and this entry is stated to need it installed beside the package, so the statement is stale');
    } else if (!threw.includes(plan.runtime)) {
      said(spec, 'import without ' + plan.runtime + ' threw ' + threw + ', which does not name the runtime this entry is stated to need');
    } else {
      refused += 1;
    }
  }
  for (const line of bad) console.log('EXPORT_BAD ' + line);
  console.log('EXPORT_COUNTS without ' + plan.runtime + ': ' + loaded + ' entr(ies) loaded, ' + refused + ' refused naming it');
  process.exit(bad.length === 0 ? 0 : 1);
}

// 1. Every named entry, and every deep path a dependant was seen using.
for (const [key, file] of Object.entries(plan.named)) lands('${NAME}' + key.slice(1), file);
for (const [spec, file] of Object.entries(plan.deep)) lands(spec, file);

// 2. One symbol through each route. The expected values are facts of the
// format or of the definition, never a measurement of this package: the IEND
// chunk is the same twelve bytes in every PNG there is, and cropToSpineY is
// height minus y by definition.
const IEND = [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const plates = [];
for (const spec of ['${NAME}/plate', '${NAME}/tools/plate.ts']) {
  const m = await load(spec);
  if (m === null) continue;
  plates.push(m);
  const chunk = typeof m.pngChunk === 'function' ? Array.from(m.pngChunk('IEND', new Uint8Array(0))) : null;
  if (chunk === null || chunk.join(',') !== IEND.join(',')) said(spec, 'pngChunk("IEND", 0 bytes) gave ' + JSON.stringify(chunk) + ' and the PNG IEND chunk was required');
  if (!(m.PNG_SIGNATURE instanceof Uint8Array) || m.PNG_SIGNATURE[1] !== 0x50) said(spec, 'PNG_SIGNATURE is not the PNG signature');
  const png = m.encodePng(1, 1, new Uint8Array([1, 2, 3, 4]));
  const back = Array.from(m.decodePng(png).data);
  if (back.join(',') !== '1,2,3,4') said(spec, 'encodePng then decodePng of one RGBA pixel 1,2,3,4 came back ' + back.join(','));
}
if (plates.length === 2 && plates[0].pngChunk !== plates[1].pngChunk) {
  said('${NAME}/plate', 'is a different module instance from ${NAME}/tools/plate.ts, so one file is loaded twice');
}
const Plate = plates[0] ? plates[0].Plate : null;
for (const spec of ['${NAME}/font5x7', '${NAME}/tools/font5x7.ts']) {
  const m = await load(spec);
  if (m === null || Plate === null) continue;
  const w = m.textWidth('RIGC', 1);
  const plate = new Plate(w, m.GLYPH_H);
  let lit = 0;
  let outside = 0;
  m.drawText('RIGC', 0, 0, 1, (x, y) => {
    lit += 1;
    if (x < 0 || y < 0 || x >= w || y >= m.GLYPH_H) outside += 1;
    plate.blend(x, y, [255, 255, 255, 255]);
  });
  let opaque = 0;
  for (let i = 3; i < plate.data.length; i += 4) if (plate.data[i] === 255) opaque += 1;
  if (lit === 0 || outside !== 0 || opaque !== lit) {
    said(spec, 'drawText("RIGC") onto a ' + w + 'x' + m.GLYPH_H + ' plate plotted ' + lit + ' pixel(s), ' + outside + ' outside it, ' + opaque + ' opaque; a lit, in-bounds, one-to-one drawing was required');
  }
}
for (const spec of ['${NAME}/transform', '${NAME}/src/transform.ts']) {
  const m = await load(spec);
  if (m === null) continue;
  const y = m.cropToSpineY(10, 64);
  if (y !== 64 - 10) said(spec, 'cropToSpineY(10, 64) gave ' + y + ' and 64 - 10 was required');
  const local = m.toBoneLocal({ a: 1, b: 0, c: 0, d: 1, worldX: 3, worldY: 4, worldRotation: 0 }, 5, 7);
  if (local[0] !== 5 - 3 || local[1] !== 7 - 4) said(spec, 'toBoneLocal on an unrotated bone at (3, 4) gave ' + JSON.stringify(local) + ' for (5, 7) and [2, 3] was required');
}
const pkg = await load('${NAME}/package.json');
const version = pkg && pkg.default ? pkg.default.version : undefined;
if (pkg !== null && (pkg.default === undefined || pkg.default.name !== '${NAME}')) said('${NAME}/package.json', 'does not import as a JSON module named ${NAME}');
// The CLI is RESOLVED and spawned rather than imported: importing it runs it,
// and spawning the resolved file is what a dependant that gates through rigc does.
for (const spec of ['${NAME}/cli', '${NAME}/cli.ts']) {
  const file = where(spec);
  if (!file.startsWith(ROOT)) continue;
  const ran = spawnSync(process.execPath, [file, '--version'], { encoding: 'utf8' });
  const out = (ran.stdout || '').trim();
  if (ran.status !== 0 || out !== version) said(spec, 'bun <resolved> --version exited ' + ran.status + ' printing ' + JSON.stringify(out) + ' and ' + JSON.stringify(version) + ' was required');
}

// 2b. Every symbol a dependant was observed importing (issue #1167), through
// the named entry it is promised by, read as present with the kind it has
// today. Types are not here: they do not exist at run time.
let held = 0;
let listed = 0;
for (const row of plan.symbols) {
  const spec = '${NAME}' + row.entry.slice(1);
  const m = await load(spec);
  for (const [name, kind] of Object.entries(row.values)) {
    listed += 1;
    if (m === null) {
      said(spec, 'symbol ' + name + ' could not be read because the entry did not import (observed in ' + row.observed + ')');
      continue;
    }
    const v = m[name];
    const got = v === undefined ? 'missing' : typeof v === 'function' ? 'function' : 'constant';
    if (got === kind) held += 1;
    else said(spec, 'symbol ' + name + ' is ' + (got === 'missing' ? 'not exported' : 'a ' + got) + ' and a ' + kind + ' was required (observed in ' + row.observed + ')');
  }
}

// 2c. The calls behind the symbols a dependant was observed CALLING (issue
// #1212): present and callable is not the contract a caller relies on. Each
// call is the smallest input that tells a working function from a stub, and
// its expected value is a fact of the definition or of this smoke's own
// fixture, never a reading of this package: the rig is the fixture the build
// above accepted, a 4x4 square on the pixel-corner lattice has a boundary of
// 16 unit cracks enclosing 16 pixels, a rectangle has two triangles, and a
// mesh over half of a fully opaque mask covers half its art and nothing
// outside it. The error classes are read ACROSS the package boundary: the
// CompileError a dependant imports from ${NAME}/errors has to be the class
// the installed parser throws, or a refusal caught by its class is missed.
const why = (e) => (e && e.message ? e.message : String(e));
const callable = (m, name) => m !== null && typeof m[name] === 'function';
let calls = 0;
const call = (spec, what, body) => {
  calls += 1;
  try {
    body();
  } catch (e) {
    said(spec, what + ' threw ' + why(e));
  }
};
const errorsM = await load('${NAME}/errors');
const rigM = await load('${NAME}/rig');
const meshM = await load('${NAME}/mesh');
const CompileErrorClass = callable(errorsM, 'CompileError') ? errorsM.CompileError : null;
if (CompileErrorClass !== null) {
  call('${NAME}/errors', 'new CompileError("probe")', () => {
    const made = new CompileErrorClass('probe');
    if (!(made instanceof Error) || !(made instanceof CompileErrorClass) || made.message !== 'probe') said('${NAME}/errors', 'new CompileError("probe") is not an Error and a CompileError carrying the message "probe"');
  });
}
if (rigM !== null) {
  if (rigM.RIG_SPEC_VERSION !== plan.rig.spec) said('${NAME}/rig', 'RIG_SPEC_VERSION is ' + JSON.stringify(rigM.RIG_SPEC_VERSION) + ' and ' + JSON.stringify(plan.rig.spec) + ', the spec string of the fixture the build above accepted, was required');
  const table = rigM.RIG_KEYS;
  const missingFrom = (shape, keys) => keys.filter((k) => !(table && Array.isArray(table[shape]) && table[shape].includes(k)));
  const unlisted = [...missingFrom('RigSpec', Object.keys(plan.rig)).map((k) => 'RigSpec.' + k), ...missingFrom('RigBone', [...new Set(plan.rig.bones.flatMap((b) => Object.keys(b)))]).map((k) => 'RigBone.' + k)];
  if (unlisted.length > 0) said('${NAME}/rig', 'RIG_KEYS does not list ' + unlisted.join(', ') + ', which the fixture the build above accepted writes');
  if (callable(rigM, 'parseRigSpec')) {
    call('${NAME}/rig', 'parseRigSpec on the fixture rig', () => {
      const parsed = rigM.parseRigSpec(plan.rig, 'probe');
      const names = (parsed && Array.isArray(parsed.bones) ? parsed.bones : []).map((b) => b.name).join(',');
      const want = plan.rig.bones.map((b) => b.name).join(',');
      if (names !== want) said('${NAME}/rig', 'parseRigSpec on the fixture rig read bones ' + JSON.stringify(names) + ' and ' + JSON.stringify(want) + ' was required');
    });
    calls += 1;
    let refusal = null;
    try {
      rigM.parseRigSpec({ ...plan.rig, bones: [...plan.rig.bones, { name: 'probe_stray', parent: 'probe_nobody' }] }, 'probe');
    } catch (e) {
      refusal = e;
    }
    const stray = 'parseRigSpec on the fixture rig plus a bone whose parent "probe_nobody" is not declared';
    if (refusal === null) said('${NAME}/rig', stray + ' accepted it, and a refusal naming the parent was required');
    else if (CompileErrorClass !== null && !(refusal instanceof CompileErrorClass)) said('${NAME}/rig', stray + ' threw ' + (refusal && refusal.constructor ? refusal.constructor.name : typeof refusal) + ' "' + why(refusal) + '", which is not an instance of CompileError as ${NAME}/errors exports it, so a dependant catching the refusal by its class misses it');
    else if (!why(refusal).includes('probe_nobody')) said('${NAME}/rig', stray + ' refused it without naming "probe_nobody": ' + why(refusal));
  }
  const kinds = rigM.RIG_SKIN_CONSTRAINT_KEYS;
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.some((k) => typeof k !== 'string')) said('${NAME}/rig', 'RIG_SKIN_CONSTRAINT_KEYS is ' + JSON.stringify(kinds) + ' and a non-empty list of constraint kinds was required');
  else if (callable(rigM, 'splitRigSkin')) {
    call('${NAME}/rig', "splitRigSkin on the fixture's short-form default skin", () => {
      const parts = rigM.splitRigSkin(plan.rig.skins.default, 'probe');
      if (!parts || parts.explicit !== false || parts.attachments !== plan.rig.skins.default) said('${NAME}/rig', "splitRigSkin on the fixture's short-form default skin gave explicit " + (parts && parts.explicit) + ' and other attachments than it was given; the short form handed back as the attachments was required');
    });
    for (const kind of kinds) {
      call('${NAME}/rig', 'splitRigSkin on a long-form skin listing bone probe_bone and ' + kind + ' probe_member', () => {
        const parts = rigM.splitRigSkin({ bones: ['probe_bone'], [kind]: ['probe_member'] }, 'probe');
        const got = parts && parts.constraints ? parts.constraints[kind] : undefined;
        if (!parts || parts.explicit !== true || JSON.stringify(parts.bones) !== '["probe_bone"]' || JSON.stringify(got) !== '["probe_member"]') said('${NAME}/rig', 'splitRigSkin on a long-form skin listing bone probe_bone and ' + kind + ' probe_member gave ' + JSON.stringify(parts) + ', so the RIG_SKIN_CONSTRAINT_KEYS entry ' + JSON.stringify(kind) + ' is not a key a skin lists its members under');
      });
    }
  }
}
if (meshM !== null) {
  if (callable(meshM, 'traceAlphaOutline') && callable(meshM, 'signedArea')) {
    call('${NAME}/mesh', 'traceAlphaOutline on a 4x4 square with one clear pixel inside', () => {
      const side = 6;
      const alpha = new Uint8Array(side * side);
      for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) alpha[y * side + x] = 255;
      alpha[2 * side + 2] = 0;
      const t = meshM.traceAlphaOutline({ width: side, height: side, alpha }, 128);
      const area = Math.abs(meshM.signedArea(t.outline));
      if (t.outline.length !== 16 || area !== 16 || t.artPixels !== 15 || t.islands !== 1 || t.holePixels !== 1) {
        said('${NAME}/mesh', 'traceAlphaOutline on a 4x4 square with one clear pixel inside gave ' + t.outline.length + ' vertices enclosing ' + area + ' px, ' + t.artPixels + ' art px, ' + t.islands + ' island(s) and holePixels ' + t.holePixels + '; the 16 unit cracks of its boundary enclosing its 16 px, 15 art px, 1 island and holePixels 1 were required');
      }
    });
  }
  if (callable(meshM, 'earClip') && callable(meshM, 'measureAuthoredMeshFit')) {
    call('${NAME}/mesh', 'earClip then measureAuthoredMeshFit on the left half of a 4x4 opaque mask', () => {
      const half = [[0, 0], [2, 0], [2, 4], [0, 4]];
      const tri = meshM.earClip(half);
      if (!Array.isArray(tri) || tri.length !== 6 || new Set(tri).size !== 4 || tri.some((i) => !Number.isInteger(i) || i < 0 || i > 3)) said('${NAME}/mesh', 'earClip on a rectangle gave ' + JSON.stringify(tri) + ' and two triangles over its four vertices were required');
      const fit = meshM.measureAuthoredMeshFit({ width: 4, height: 4, alpha: new Uint8Array(16).fill(255) }, 128, half, tri);
      if (!fit || fit.artPixels !== 16 || fit.coveredArt !== 8 || fit.coverage !== 0.5 || fit.overshoot !== 0) said('${NAME}/mesh', 'measureAuthoredMeshFit of a mesh over the left half of a 4x4 opaque mask gave ' + JSON.stringify(fit) + ' and artPixels 16, coveredArt 8, coverage 0.5, overshoot 0 were required');
    });
  }
  if (callable(meshM, 'earClip') && callable(meshM, 'MeshError')) {
    calls += 1;
    let refusal = null;
    try {
      meshM.earClip([[0, 0], [1, 1], [2, 2]]);
    } catch (e) {
      refusal = e;
    }
    if (!(refusal instanceof meshM.MeshError)) said('${NAME}/mesh', 'earClip on three collinear points ' + (refusal === null ? 'returned triangles' : 'threw ' + why(refusal)) + ', and a MeshError as ${NAME}/mesh exports it was required');
  }
}

// #1450: use this install's public functions and a real gated CLI build of
// an authored 12px plate. Only its central 4x4 cell holds art, so there are
// four lattice vertices. Two vertical spans at x=0 and x=12 give the first
// vertex (4,4) distances 4 and 8. The smooth pulls at radius16 are 27/32 and
// 1/2, so the six-decimal shares are 0.627907 and 0.372093.
if (meshM !== null && Plate !== null && ['buildSegmentsLattice', 'segmentDistance', 'influenceShares'].every((n) => callable(meshM, n))) {
  call('${NAME}/mesh', 'segments preflight against an actual compiler build', () => {
    const dir = join(HERE, 'segments-preflight');
    mkdirSync(join(dir, 'parts'), { recursive: true });
    const plate = new Plate(12, 12);
    plate.rect(4, 4, 4, 4, [200, 100, 50, 255]);
    plate.writePng(join(dir, 'parts', 'probe.png'));
    const decoded = plates[0].decodePng(readFileSync(join(dir, 'parts', 'probe.png')));
    const alpha = new Uint8Array(12 * 12);
    for (let i = 0; i < alpha.length; i++) alpha[i] = decoded.data[4 * i + 3];
    const lattice = meshM.buildSegmentsLattice({ mask: { width: 12, height: 12, alpha }, threshold: 128, cell: 4 });
    const influence = { radius: 16, across: true, max: 2, shape: 'smooth' };
    const spans = [{ bone: 0, entry: 0, a: [0, 0], b: [0, -12] }, { bone: 1, entry: 1, a: [12, 0], b: [12, -12] }];
    const rig = {
      spec: 'rigc-rig/1', name: 'segments_preflight', images: 'parts',
      skeleton: { x: 0, y: -12, width: 12, height: 12 },
      invariants: { meshSlots: 1, meshTriangles: 2 }, // One kept square, two triangles.
      bones: [{ name: 'root' }, { name: 'left', parent: 'root', length: 12 }, { name: 'right', parent: 'root', x: 12, length: 12 }],
      slots: [{ name: 'probe', bone: 'root', attachment: 'probe' }],
      skins: { default: { probe: { probe: { type: 'mesh', image: 'probe.png', generator: {
        kind: 'segments', cell: 4, alpha: 128, anchor: [0, 0], influence,
        bones: [{ bone: 'left', from: [0, 0], to: [0, 12] }, { bone: 'right', from: [12, 0], to: [12, 12] }],
      } } } } },
    };
    const motion = { spec: 'rigc-motion/1', archetype: 'segments_preflight', cut: 'segments-preflight', easings: {}, animations: { probe: { duration: 0, tracks: [] } } };
    writeFileSync(join(dir, 'rig.json'), JSON.stringify(rig));
    writeFileSync(join(dir, 'motion.json'), JSON.stringify(motion));
    const launcher = join(ROOT, 'bin', 'rigc.cjs');
    // Official installed launcher, whose native Node interpreter is on PATH.
    const built = spawnSync('node', [launcher, 'build', '--rig', 'rig.json', '--motion', 'motion.json', '--out', 'build'], { cwd: dir, encoding: 'utf8' });
    if (built.status !== 0) throw Error('installed rigc build exited ' + built.status + ': ' + JSON.stringify({ stdout: built.stdout, stderr: built.stderr }));
    const model = JSON.parse(readFileSync(join(dir, 'build', 'skeleton.model.json'), 'utf8'));
    const mesh = model.skins.find((s) => s.name === 'default').attachments.probe.probe;
    const bindings = mesh.vertices.bindings;
    if (lattice.points.length !== 4 || bindings.length !== lattice.points.length) said('${NAME}/mesh', 'buildSegmentsLattice returned ' + lattice.points.length + ' vertices, compiler wrote ' + bindings.length + ', and the one authored art cell requires four');
    let maxShareError = 0;
    lattice.points.forEach(([x, y], i) => {
      const shares = meshM.influenceShares([x, -y], spans, influence);
      if (!('weights' in shares) || shares.weights.length !== 2 || !bindings[i] || bindings[i].length !== 2) throw Error('influenceShares/compiler must both bind the two reachable spans at vertex ' + i);
      for (const w of shares.weights) {
        const emitted = bindings[i].find((b) => b.bone === ['left', 'right'][w.control]);
        if (!emitted) throw Error('influenceShares control ' + w.control + ' is absent from compiler vertex ' + i);
        maxShareError = Math.max(maxShareError, Math.abs(w.weight - emitted.weight));
      }
    });
    if (!(maxShareError <= 1e-12)) said('${NAME}/mesh', 'influenceShares differs from actual compiler bindings by ' + maxShareError + ', at most 1e-12 required');
    const first = meshM.influenceShares([4, -4], spans, influence);
    if (!('weights' in first) || first.weights.length !== 2 || Math.abs(first.weights[0].weight - 0.627907) > 1e-12 || Math.abs(first.weights[1].weight - 0.372093) > 1e-12) said('${NAME}/mesh', 'influenceShares does not give the authored 4px/8px smooth-pull shares 0.627907/0.372093');
    const distance = meshM.segmentDistance([4, -4], spans[0].a, spans[0].b);
    const unreached = JSON.parse(JSON.stringify(rig));
    unreached.skins.default.probe.probe.generator.influence.radius = distance;
    writeFileSync(join(dir, 'unreached.json'), JSON.stringify(unreached));
    const refused = spawnSync('node', [launcher, 'build', '--rig', 'unreached.json', '--motion', 'motion.json', '--out', 'unreached-build'], { cwd: dir, encoding: 'utf8' });
    const detail = (refused.stdout || '') + (refused.stderr || '');
    const nearest = /nearest is "left" at ([0-9.]+)/.exec(detail);
    if (distance !== 4 || refused.status === 0 || !detail.includes('CE_COMPILE_SEGMENTS_VERTEX_UNREACHED') || nearest === null || Math.abs(Number(nearest[1]) - distance) > 1e-12) said('${NAME}/mesh', 'segmentDistance=' + distance + '; expected the actual compiler refusal at the authored 4px distance: ' + detail);
    if (existsSync(join(dir, 'unreached-build', 'skeleton.model.json'))) said('${NAME}/mesh', 'unreached segments build emitted a model after refusing');
    console.log('SEGMENTS_PREFLIGHT vertices ' + lattice.points.length + ', max compiler share difference ' + maxShareError + ', nearest compiler distance ' + (nearest ? nearest[1] : 'MISSING') + ', public distance ' + distance);
  });
}

// 3. Every path the tarball carries, spelled in full — and, for a module, with
// its extension left off, which is how Bun resolved it before the map existed.
let full = 0;
let bare = 0;
let bareTried = 0;
for (const path of plan.paths) {
  if (lands('${NAME}/' + path, path)) full += 1;
  const m = /^(.*)\\.(ts|mjs|cjs)$/.exec(path);
  if (m !== null) {
    bareTried += 1;
    if (lands('${NAME}/' + m[1], path)) bare += 1;
  }
}
for (const line of bad) console.log('EXPORT_BAD ' + line);
console.log('EXPORT_COUNTS named ' + Object.keys(plan.named).length + ', observed symbols ' + held + '/' + listed + ' held across ' + entries.length + ' entries, ' + calls + ' call(s) checked from the install, observed deep paths ' + Object.keys(plan.deep).length + ', shipped paths ' + full + '/' + plan.paths.length + ' in full and ' + bare + '/' + bareTried + ' modules without their extension');
process.exit(bad.length === 0 ? 0 : 1);
`;

/**
 * The step the comparison from the install is recorded under, and the name its
 * fault carries — the contract's `MQ45` (docs/MESH_REDUCTION.md, *Stage A
 * controls*): `rig-c/meshcompare` imports and compares from an install
 * with no spine-core in it.
 */
const MESHCOMPARE_STEP = 'meshcompare';
const MESHCOMPARE_CASE = 'SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE';

/**
 * How far the planted candidate moves one vertex, in the attachment's own
 * units. A planted value, not a measurement: the fixture's bone chain carries
 * no scale, so a rigid pose keeps every length, and the vertex's own UV — a
 * hull sample — reads exactly this at every frame.
 */
const MESHCOMPARE_MOVED = 2;

/**
 * `MQ45` (issue #1230), run from the install with the runtime taken away. It
 * imports `rig-c/meshcompare` — the entry P2 says needs nothing beside the
 * package — and compares the flag mesh of the build this smoke just wrote:
 *
 * - the reference against ITSELF under another id, which has to read 0 at
 *   every frame (MQ00's motion half, from the install) and be `accepted` —
 *   the flag mesh is `contour`-generated, and until issue #1236 no comparison
 *   over such a build could be, because the generator wound its triangles
 *   clockwise in Spine world;
 * - the reference against the same document with one hull vertex moved
 *   `MESHCOMPARE_MOVED` units — the same rig with its mesh changed, which is
 *   inside the comparison's allowlist — which has to read that distance at
 *   that vertex's UV at every frame;
 * - two candidates under one id, which has to be refused as an instance of the
 *   `MeshReductionError` that `rig-c/mesh` exports, so a dependant catching
 *   the refusal by its class across the package boundary catches it.
 *
 * The report has to say `operation: 'compare'` and `poser: { kind: 'core' }`
 * at the installed version. Every expected figure is the fixture's or the
 * plant's — the art samples are the plate's opaque pixels counted here, the
 * hull is the document's — never a reading of this package. The two
 * comparisons are timed here, outside the report (which never carries a time).
 */
const MESHCOMPARE_PROBE_SOURCE = `import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const plan = JSON.parse(readFileSync(join(HERE, 'meshcompare_probe.json'), 'utf8'));
const bad = [];
const said = (what) => bad.push(what);
const why = (e) => (e && e.message ? e.message : String(e));
const load = async (spec) => {
  try {
    return await import(spec);
  } catch (e) {
    said(spec + ': import threw ' + why(e));
    return null;
  }
};
if (existsSync(join(HERE, 'node_modules', ...plan.runtime.split('/')))) said(plan.runtime + ' is installed in this directory, and this comparison is the one an install without it runs');
const mc = await load('${NAME}/meshcompare');
const mesh = await load('${NAME}/mesh');
const plate = await load('${NAME}/plate');
const pkg = await load('${NAME}/package.json');
const version = pkg && pkg.default ? pkg.default.version : undefined;
let summary = null;
if (mc !== null && plate !== null && typeof mc.compareMeshesInMotion === 'function') {
  const model = readFileSync(join(HERE, plan.model), 'utf8');
  const doc = JSON.parse(model);
  const skin = (doc.skins || []).find((k) => k.name === 'default');
  const att = skin && skin.attachments && skin.attachments[plan.slot] ? skin.attachments[plan.slot][plan.attachment] : undefined;
  const png = plate.decodePng(readFileSync(join(HERE, plan.plate)));
  const alpha = new Uint8Array(png.width * png.height);
  let art = 0;
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = png.data[i * 4 + 3];
    if (alpha[i] >= 1) art += 1;
  }
  // Vertex 0 is moved in the frame that carries it: its own x in the attachment's space when the mesh is unweighted,
  // its one binding's x when it is bound to a single bone — either way one rigid frame, so the distance it moves is
  // the distance it reads. A vertex shared between bones would move by a weighted sum of rotations, and is refused.
  const v = att && att.vertices;
  const single = v && v.weighted === true && Array.isArray(v.bindings) && v.bindings[0] && v.bindings[0].length === 1 && v.bindings[0][0].weight === 1;
  if (att === undefined || !v || (v.weighted !== false && !single) || typeof att.hull !== 'number' || att.hull < 1) {
    said('the build has no mesh at ' + plan.slot + '/' + plan.attachment + ' whose hull vertex 0 is carried by one rigid frame, and the planted candidate moves that vertex');
  } else {
    const moved = JSON.parse(model);
    const mv = moved.skins.find((k) => k.name === 'default').attachments[plan.slot][plan.attachment].vertices;
    if (mv.weighted) mv.bindings[0][0].x += plan.moved;
    else mv.xy[0] += plan.moved;
    const movedText = JSON.stringify(moved, null, 2) + '\\n';
    const fit = { minCoverage: 0, maxOvershoot: png.width, maxUndercut: png.width };
    const input = (candidates, bound) => ({
      reference: { id: 'reference', model },
      candidates,
      attachments: [
        {
          attachment: { skin: null, slot: plan.slot, attachment: plan.attachment },
          art: { mask: { width: png.width, height: png.height, alpha }, threshold: 1, frame: { space: 'part-local-drawing-px-y-down', width: png.width, height: png.height, pageScale: 1, conversion: 'texels = px * pageScale' } },
          finalThreshold: 1,
          minArtSamples: 1,
          regions: [],
        },
      ],
      referenceArtFit: fit,
      candidateArtFit: fit,
      schedule: { frames: ['setup', { animation: plan.animation, fps: plan.fps }], phases: ['grid', 'irr'], physics: { mode: 'none' }, selection: [] },
      bounds: { maxLocalDeformation: bound },
      motionRequired: true,
      perFrame: true,
    });
    const timed = (candidates, bound) => {
      const t0 = performance.now();
      try {
        const report = mc.compareMeshesInMotion(input(candidates, bound));
        return { report, ms: performance.now() - t0 };
      } catch (e) {
        said('compareMeshesInMotion with candidate(s) ' + candidates.map((c) => c.id).join(', ') + ' threw ' + why(e));
        return null;
      }
    };
    const local = (c) => (c && c.motion ? c.motion.rows.find((r) => r.code === 'MQ_LOCAL_DEFORMATION' && r.object.region === null) : undefined);
    const perFrame = (c) => (c && c.perFrame ? c.perFrame.filter((p) => p.code === 'MQ_LOCAL_DEFORMATION') : []);
    const self = timed([{ id: 'itself', model }], 0);
    const plant = timed([{ id: 'moved', model: movedText }], plan.moved);
    if (self !== null) {
      const r = self.report;
      if (r.operation !== 'compare') said('the report has operation ' + JSON.stringify(r.operation) + ', and "compare" was required');
      if (!r.poser || r.poser.kind !== 'core' || r.poser.rigcVersion !== version) said('the report names the poser ' + JSON.stringify(r.poser) + ', and kind "core" at the installed version ' + JSON.stringify(version) + ' was required');
      const c = r.candidates[0];
      const frames = c.motion ? c.motion.schedule.walked.length : 0;
      const values = perFrame(c);
      const row = local(c);
      if (frames === 0 || values.length !== frames || values.some((p) => p.value !== 0)) said('the reference against itself reads ' + JSON.stringify(values.map((p) => p.value)) + ' over ' + frames + ' frame(s), and 0 at every frame was required');
      if (!row || !row.sampling || row.sampling.count !== art + att.hull || !row.art || row.art.samples !== art) said('the local-deformation row samples ' + JSON.stringify(row && row.sampling) + ' with ' + JSON.stringify(row && row.art && row.art.samples) + ' art sample(s); the plate has ' + art + ' opaque pixel(s) and the mesh ' + att.hull + ' hull UV(s), and that domain was required');
      // #1236: the flag mesh is contour-generated, and a comparison over such a build was never accepted — the generator
      // emitted clockwise in Spine world and MQ_ORIENTATION read every triangle as flipped. Against itself it is accepted.
      const orientation = c.geometry ? c.geometry.rows.find((g) => g.code === 'MQ_ORIENTATION') : undefined;
      if (c.accepted !== true) said('the reference against itself is not accepted (geometry ' + (c.geometry ? c.geometry.verdict : 'absent') + ', motion ' + (c.motion ? c.motion.verdict : 'absent') + ', MQ_ORIENTATION ' + JSON.stringify(orientation && { state: orientation.state, value: orientation.value, at: orientation.worst && orientation.worst.at }) + '), and accepted === true was required');
      summary = { frames, samples: art + att.hull, selfMs: self.ms, accepted: c.accepted };
    }
    if (plant !== null) {
      const c = plant.report.candidates[0];
      const values = perFrame(c);
      const row = local(c);
      const off = values.filter((p) => p.value === null || Math.abs(p.value - plan.moved) > 1e-6);
      if (values.length === 0 || off.length > 0) said('hull vertex 0 moved ' + plan.moved + ' unit(s) reads ' + off.map((p) => p.value + ' at ' + p.frame).join(', ') + ', and ' + plan.moved + ' at every frame was required (no bone of the fixture is scaled)');
      if (!row || row.worst === null || row.worst.at.vertex !== 0 || row.state !== 'pass') said('the moved candidate has the row ' + JSON.stringify(row && { state: row.state, value: row.value, at: row.worst && row.worst.at }) + ', and its worst at vertex 0, at its bound, was required');
      if (summary !== null) summary.moved = { value: row ? row.value : null, ms: plant.ms };
    }
    let refusal = null;
    try {
      mc.compareMeshesInMotion(input([{ id: 'twin', model }, { id: 'twin', model }], 0));
    } catch (e) {
      refusal = e;
    }
    if (refusal === null) said('two candidates with the id "twin" were compared, and a refusal naming both was required');
    else if (mesh === null || typeof mesh.MeshReductionError !== 'function' || !(refusal instanceof mesh.MeshReductionError)) said('the duplicate-id refusal (' + why(refusal) + ') is not an instance of the MeshReductionError ${NAME}/mesh exports, so a dependant catching it by its class misses it');
    else if (refusal.code !== 'COMPARE_INPUT_MISSING' || !why(refusal).includes('candidates[0]') || !why(refusal).includes('candidates[1]')) said('the duplicate-id refusal is ' + refusal.code + ' (' + why(refusal) + '), and COMPARE_INPUT_MISSING naming candidates[0] and candidates[1] was required');
  }
} else if (mc !== null) {
  said('${NAME}/meshcompare exports no compareMeshesInMotion function');
}
for (const line of bad) console.log('MESHCOMPARE_BAD ' + line);
if (bad.length === 0 && summary !== null && summary.moved !== undefined) {
  console.log('MESHCOMPARE_COUNTS ' + summary.frames + ' frames x ' + summary.samples + ' samples through the core poser at ' + version + '; itself 0 at every frame and accepted ' + summary.accepted + ', hull vertex 0 moved ' + plan.moved + ' reads ' + summary.moved.value + ' at every frame; a duplicate id refused as the MeshReductionError of ${NAME}/mesh; one comparison of one candidate took ' + summary.selfMs.toFixed(1) + ' ms (itself) and ' + summary.moved.ms.toFixed(1) + ' ms (moved) of wall time, both builds posed and both art fits measured');
}
process.exit(bad.length === 0 && summary !== null ? 0 : 1);
`;

/**
 * The two steps that read `rig-c/core` from the install with the runtime taken
 * away (issue #1275), and the names their faults carry.
 *
 * - `core-pose` imports the entry under Bun and poses the build's model
 *   document: `readModel`, then `poseRawSetup`.
 * - `core-browser` bundles `import { readModel, poseRawSetup } from 'rig-c/core'`
 *   for a browser with vite (library mode, one entry, no node polyfills), and
 *   then runs THE BUNDLE under Bun with `globalThis.document` undefined on the
 *   same document — and holds every bone it poses to the direct import's, bit
 *   for bit, since one bundle that drops a branch would pose differently.
 *
 * 🚨 Zero `node:` strings in the bundle is necessary and NOT sufficient, measured
 * before this was written: vite replaces a node builtin it meets in a browser
 * build with an empty module and prints a warning, so a core module importing
 * `node:fs` bundled to 0 `node:` strings and exit 0 — even with the import
 * called on `readModel`'s path. So the config this step writes carries a
 * resolver that REFUSES any builtin by name (`NODE_MODULE_REACHED`), the
 * warning is a fault too, and the string count is held beside them. The
 * `import-node-in-core` plant goes red at this step and nowhere else.
 */
const CORE_POSE_STEP = 'core-pose';
const CORE_POSE_CASE = 'SMOKE_CORE_POSES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE';
const CORE_BROWSER_STEP = 'core-browser';
const CORE_BROWSER_CASE = 'SMOKE_CORE_BUNDLES_FOR_A_BROWSER_WITH_NO_NODE_MODULE';
/** `rigc review` from the install (issues #1457, #1486): refused REVIEW_NOT_INSTALLED, the project untouched, before the review package is installed; `review check` exit 0 after. */
const REVIEW_STEP = 'review';
/** The fixture bone whose world matrix both steps print: the last of the chain, under a rotated parent, so the matrix is not the identity. */
const CORE_PROBE_BONE = 'hand';
/** Where the bundle lands, beside `--out` and never in it. */
const CORE_BUNDLE_DIR = 'core-bundle';
const CORE_BUNDLE_FILE = 'core.js';
/** The vite resolver's refusal, which the step reads off the build's output. */
const NODE_REFUSAL = 'NODE_MODULE_REACHED';

/**
 * What `import-node-in-core` puts at the top of the packed core index: an
 * import of a node builtin that nothing calls. Bun loads it, so every other
 * step still runs; vite tree-shakes the binding and, unrefused, would bundle
 * it to nothing — which is exactly the silence the refusal above exists for.
 */
const NODE_PLANT_MODULE = 'src/core/index.ts';
const NODE_PLANT_LINE = "import { readFileSync as plantedNodeRead } from 'node:fs';\nexport const plantedNodeReader = plantedNodeRead;\n";

/**
 * Imports `rig-c/core` — directly from the install (`direct`), or through the
 * browser bundle vite wrote (`bundle`) — and poses the fixture's setup pose.
 * Prints `CORE_BAD <what>` per failure, then `CORE_MATRIX` (the probe bone)
 * and `CORE_BONES` (every bone's matrix and origin, for the comparison of the
 * two runs). Every expected figure is the fixture's: its bone names in order,
 * and a determinant of 1, since no bone of the fixture is scaled.
 */
const CORE_PROBE_SOURCE = `import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const plan = JSON.parse(readFileSync(join(HERE, 'core_probe.json'), 'utf8'));
const mode = process.argv[2];
const bad = [];
const said = (what) => bad.push(what);
const why = (e) => (e && e.message ? e.message : String(e));
if (existsSync(join(HERE, 'node_modules', ...plan.runtime.split('/')))) said(plan.runtime + ' is installed in this directory, and this pose is the one an install without it runs');
let core = null;
if (mode === 'bundle') {
  if (typeof globalThis.document !== 'undefined') said('globalThis.document is defined in this run, and the bundle is held to running without one');
  try {
    core = (await import(pathToFileURL(join(HERE, plan.bundle)).href)).core;
  } catch (e) {
    said('importing the bundle ' + plan.bundle + ' threw ' + why(e));
  }
} else {
  try {
    const at = fileURLToPath(import.meta.resolve('${NAME}/core'));
    if (!at.startsWith(join(HERE, 'node_modules'))) said('${NAME}/core resolved to ' + at + ', which is not under this install');
    core = await import('${NAME}/core');
  } catch (e) {
    said('${NAME}/core: import threw ' + why(e));
  }
}
if (core && (typeof core.readModel !== 'function' || typeof core.poseRawSetup !== 'function')) {
  said((mode === 'bundle' ? 'the bundle' : '${NAME}/core') + ' hands over readModel ' + typeof core.readModel + ' and poseRawSetup ' + typeof core.poseRawSetup + ', and two functions were required');
  core = null;
}
if (core) {
  const text = readFileSync(join(HERE, plan.model), 'utf8');
  try {
    const view = core.readModel(text);
    const pose = core.poseRawSetup(view);
    const selected = pose.drawn.find((row) => row.kind === 'mesh');
    if (!selected) said('named setup probe reached no mesh');
    else {
      const mesh = core.readSetupMesh(view, { slot: selected.slot, attachment: selected.attachment });
      const same = (a, b) => a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
      if (!same(mesh.vertices, selected.vertices) || !same(mesh.triangles, selected.triangles) || mesh.hull !== selected.hull) said('readSetupMesh differs from the installed raw setup mesh');
      mesh.vertices.fill(123); mesh.triangles.reverse();
      const again = core.readSetupMesh(view, { slot: selected.slot, attachment: selected.attachment });
      if (!same(again.vertices, selected.vertices) || !same(again.triangles, selected.triangles)) said('readSetupMesh exposes shared mutable arrays');
      console.log('CORE_SETUP_MESH ' + selected.slot + ' ' + selected.vertices.length / 2 + ' vertices');
      const input = JSON.parse(text);
      const slotBone = input.slots.find((slot) => slot.name === selected.slot).bone;
      const definition = { kind: 'mesh', vertices: { weighted: true, bindings: [
        [{ bone: slotBone, x: 0, y: 0, weight: 1 }], [{ bone: slotBone, x: 3, y: 0, weight: 1 }], [{ bone: slotBone, x: 0, y: 4, weight: 1 }],
      ] }, uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2], hull: 3 };
      const rekey = (value) => Array.isArray(value) ? value.map(rekey) : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, rekey(child)])) : value;
      input.skins.find((skin) => skin.name === 'default').attachments[selected.slot].order_probe = definition;
      input.skins.push({ name: 'order_probe', bones: [], constraints: {}, attachments: { [selected.slot]: { order_probe: rekey(definition) } } });
      if (input.editorOrder) input.editorOrder.skins.push({ name: 'order_probe', slots: [selected.slot] });
      const allView = core.readModel(JSON.stringify(input));
      const target = { slot: selected.slot, attachment: 'order_probe' };
      const allMesh = core.readSetupMesh(allView, target);
      const namedMesh = core.readSetupMesh(allView, { ...target, skin: 'default' });
      if (allMesh.skin !== 'default' || !same(allMesh.vertices, namedMesh.vertices) || !same(allMesh.triangles, namedMesh.triangles) || allMesh.hull !== namedMesh.hull) said('object key order changed the installed named setup mesh');
      for (const change of ['binding value', 'triangle order']) {
        const changed = JSON.parse(JSON.stringify(input));
        const other = changed.skins.find((skin) => skin.name === 'order_probe').attachments[selected.slot].order_probe;
        if (change === 'binding value') other.vertices.bindings[0][0].x += 1;
        else other.triangles.reverse();
        let refusal = null;
        try { core.readSetupMesh(core.readModel(JSON.stringify(changed)), target); } catch (e) { refusal = e; }
        if (refusal === null || !why(refusal).includes('attachment "order_probe"') || !why(refusal).includes('skins [default, order_probe]') || !why(refusal).includes('choose a named skin')) said(change + ' lost the installed named all-skin refusal');
      }
      console.log('CORE_SETUP_EQUIVALENCE object keys accepted; binding value and triangle order refused');
    }
    // A runtime-free installed live fixture; both imported and browser-bundled entries.
    const liveInput = {
      spec: 'rigc-compiled/1', referenceScale: 100, bones: [{ name: 'root' }], slots: [],
      skins: [{ name: 'default', bones: [], constraints: {}, attachments: {} }],
      constraints: [{ kind: 'physics', name: 'spring', declaredIn: 'rig', bone: 'root', x: 1 }], events: [],
      animations: [{ name: 'move', duration: 1, bones: [{ name: 'root', timelines: [{ name: 'translate', keys: [{ time: 0, x: 0, y: 0 }, { time: 1, x: 20, y: 0 }] }] }], slots: [],
        constraints: { ik: [], transform: [], path: [], physics: [], slider: [] }, attachments: [], drawOrder: [], events: [] }],
      images: [], pageGrids: [], droppedStates: [], absentParts: [], meshBones: {}, meshes: {}, physics: [], deformTransforms: [], trackDerivations: [], rig: {}, spine: { sha256: '0'.repeat(64) },
    };
    const liveDoc = core.readModel(JSON.stringify(liveInput));
    const liveSource = JSON.stringify(liveDoc);
    const fields = ['strength', 'damping', 'inertia', 'wind', 'gravity', 'mix'];
    for (const kind of ['single', 'composed']) {
      const live = kind === 'single' ? core.openTrack(liveDoc, 'move', { loop: true, reset: 'animation' }) : core.openTracks(liveDoc, { reset: 'animation' });
      if (kind === 'composed') {
        if (live.readPhysicsParameters('spring').effective !== null) said('physics read invented values before start');
        live.setAnimation(0, 'move', { loop: true, mixDuration: 0 });
        live.start();
      }
      const original = live.readPhysicsParameters('spring');
      if (original.override !== null || !original.effective || fields.some((field) => !Number.isFinite(original.effective[field]))) said('physics initial six values unavailable after pose 0');
      for (const field of fields) {
        live.setPhysicsParameters('spring', { [field]: 0.25 });
        live.step(0.05);
        const changed = live.readPhysicsParameters('spring');
        if (changed.override[field] !== 0.25 || changed.effective[field] !== 0.25) said(kind + ' physics did not set/read ' + field);
        live.clearPhysicsParameters('spring');
        live.step(0.05);
        const cleared = live.readPhysicsParameters('spring');
        if (cleared.override !== null || JSON.stringify(cleared.effective) !== JSON.stringify(original.effective)) said(kind + ' physics did not clear ' + field);
      }
      let refusal = null;
      try { live.setPhysicsParameters('spring', { wind: 8, damping: Infinity }); } catch (e) { refusal = e; }
      if (!(refusal instanceof core.CoreInputError) || !why(refusal).includes('spring') || !why(refusal).includes('damping') || live.readPhysicsParameters('spring').override !== null) said(kind + ' physics did not atomically refuse a nonfinite patch');
    }
    if (JSON.stringify(liveDoc) !== liveSource) said('live physics modified its source document');
    console.log('CORE_PHYSICS_PARAMETERS single/composed six fields set/read/clear; atomic refusal; source unchanged');
    const names = pose.bones.map((b) => b.name);
    if (names.join(',') !== plan.bones.join(',')) said('poseRawSetup posed the bones ' + JSON.stringify(names) + ', and the fixture declares ' + JSON.stringify(plan.bones));
    const bone = pose.bones.find((b) => b.name === plan.bone);
    if (!bone) said('poseRawSetup posed no bone ' + JSON.stringify(plan.bone));
    else {
      const m = { bone: bone.name, a: bone.a, b: bone.b, c: bone.c, d: bone.d, worldX: bone.worldX, worldY: bone.worldY };
      const det = bone.a * bone.d - bone.b * bone.c;
      if (![m.a, m.b, m.c, m.d, m.worldX, m.worldY].every(Number.isFinite)) said('the world matrix of ' + plan.bone + ' is ' + JSON.stringify(m) + ', and six finite numbers were required');
      else if (Math.abs(det - 1) > 1e-9) said('the world matrix of ' + plan.bone + ' has determinant ' + det + ', and 1 was required: no bone of the fixture is scaled');
      console.log('CORE_MATRIX ' + JSON.stringify(m));
    }
    console.log('CORE_BONES ' + JSON.stringify(pose.bones.map((b) => [b.name, b.a, b.b, b.c, b.d, b.worldX, b.worldY])));
  } catch (e) {
    said('readModel then poseRawSetup on ' + plan.model + ' threw ' + why(e));
  }
  if (mode !== 'bundle') {
    let refusal = null;
    try {
      core.readModel('{}');
    } catch (e) {
      refusal = e;
    }
    if (refusal === null || typeof core.CoreInputError !== 'function' || !(refusal instanceof core.CoreInputError)) said('readModel("{}") ' + (refusal === null ? 'returned a document' : 'threw ' + why(refusal) + ', not the CoreInputError ${NAME}/core exports') + ', and a refusal a dependant can catch by that class was required');
  }
}
for (const line of bad) console.log('CORE_BAD ' + line);
process.exit(bad.length === 0 && core !== null ? 0 : 1);
`;

/** The one file vite bundles: the two calls a player makes, through the entry, by its bare name. */
const BROWSER_ENTRY_SOURCE = `import { readModel, poseRawSetup, readSetupMesh, openTrack, openTracks, CoreInputError } from '${NAME}/core';
export const core = { readModel, poseRawSetup, readSetupMesh, openTrack, openTracks, CoreInputError };
`;

/**
 * The vite config the browser step writes into the install: library mode, one
 * entry, ES output, the browser platform vite builds for by default — and a
 * resolver that refuses every node builtin by name, with or without the
 * `node:` prefix, rather than letting vite stub it (see above).
 */
function browserConfigSource(): string {
  const builtins = JSON.stringify([...new Set(builtinModules.map((m) => m.replace(/^node:/, '')))].sort());
  return `const BUILTINS = new Set(${builtins});
export default {
  logLevel: 'info',
  plugins: [
    {
      name: 'rigc-smoke-refuses-node-builtins',
      enforce: 'pre',
      resolveId(id, importer) {
        const bare = id.startsWith('node:') ? id.slice(5) : id;
        if (id.startsWith('node:') || BUILTINS.has(bare) || BUILTINS.has(bare.split('/')[0])) {
          this.error('${NODE_REFUSAL} ' + id + ' imported by ' + importer + ' — a browser has no node module, and this bundle takes none');
        }
        return null;
      },
    },
  ],
  build: {
    lib: { entry: 'browser_entry.mjs', formats: ['es'], fileName: () => '${CORE_BUNDLE_FILE}' },
    outDir: '${CORE_BUNDLE_DIR}',
    emptyOutDir: true,
  },
};
`;
}

/**
 * The bundler, installed once per run into a directory of its own — never
 * into a case's install, which is the subject and has to stay the install a
 * user receives — at the version this tree's lockfile resolves (`bun.lock`),
 * or failing that the range `devDependencies` declares. It is a tool here, not
 * the package under test: the bundle resolves the entry from the case's
 * install, through the importer's own directory.
 */
let bundler: { js: string; version: string; faults: string[] } | null = null;
function bundlerOnce(): { js: string; version: string; faults: string[] } {
  if (bundler !== null) return bundler;
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { devDependencies?: Record<string, string> };
  const lock = existsSync(join(ROOT, 'bun.lock')) ? readFileSync(join(ROOT, 'bun.lock'), 'utf8') : '';
  const wanted = /"vite": \["vite@([^"]+)"/.exec(lock)?.[1] ?? manifest.devDependencies?.vite ?? null;
  if (wanted === null) {
    bundler = { js: '', version: '', faults: [`${CORE_BROWSER_CASE}: this tree declares no vite in devDependencies and bun.lock resolves none, so there is no bundler version to install — the step will not guess one`] };
    return bundler;
  }
  const dir = realpathSync.native(mkdtempSync(join(tmpdir(), 'rigc-smoke-bundler-')));
  LEFT_BEHIND.push(dir);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'rigc-install-smoke-bundler', private: true, version: '0.0.0' }, null, 2)}\n`);
  const installed = run('npm', ['install', `vite@${wanted}`, '--no-audit', '--no-fund', '--no-package-lock'], dir);
  const js = join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
  const pkg = join(dir, 'node_modules', 'vite', 'package.json');
  if (!existsSync(js) || !existsSync(pkg)) {
    bundler = { js: '', version: wanted, faults: [`${CORE_BROWSER_CASE}: npm install vite@${wanted} exited ${installed.status} and left no ${js}. ${installed.out.trim().slice(0, 1500)}`] };
    return bundler;
  }
  bundler = { js, version: (JSON.parse(readFileSync(pkg, 'utf8')) as { version?: string }).version ?? wanted, faults: [] };
  return bundler;
}

// ---------------------------------------------------------------------------
// Running things
// ---------------------------------------------------------------------------

interface Ran {
  status: number;
  /** stdout, stderr and the spawn's own error, in that order — what a step prints when it reports. */
  out: string;
  /**
   * The two streams on their own, for a step that asserts on what was written where (issue #1457). ⚠️ Not `out`:
   * Bun 1.2.0's `spawnSync` hands back an `error` whose message is the child's stderr whenever a child exits
   * non-zero having written to it (measured: `node -e` writing one line to stderr and exiting 2 — Bun 1.4.2 sets no
   * `error`), so on the declared minimum Bun `out` carries that stderr twice.
   */
  stdout: string;
  stderr: string;
}

type Env = Record<string, string | undefined>;

/** One argument of a cmd.exe command line: wrapped in double quotes, with a double quote inside it doubled. */
const cmdQuoted = (arg: string): string => `"${arg.replace(/"/g, '""')}"`;

/** A variable read the way Windows reads it, whatever case the environment spells its name in. */
const envValue = (env: Env, name: string): string | undefined => env[Object.keys(env).find((key) => key.toUpperCase() === name.toUpperCase()) ?? name];

/**
 * Run a command and collect what it printed.
 *
 * 🪟 A batch file on Windows — `node_modules\.bin\rigc.cmd`, which is the shim
 * npm writes there — is refused by `spawnSync` without a shell: `spawnSync
 * …\rigc.cmd EINVAL` on the first Windows run (issue #1214), the hardening
 * Node shipped for CVE-2024-27980, which Bun's `node:child_process` matches.
 * So a command whose name ends in `.cmd` or `.bat` runs as Node's own
 * `shell: true` does on Windows — `cmd.exe /d /s /c "<line>"`, verbatim — with
 * the line built here, every word in double quotes, so an install path with
 * spaces, non-ASCII or a quote in it reaches the batch file as one argument.
 * Inside quotes cmd.exe still expands `%NAME%`; no path the smoke builds has a
 * `%` in it. A bare `npm` is not routed this way: it carries no extension for
 * the refusal to read, and that run measured `npm pack` and `npm install`
 * working when spawned bare.
 */
function run(cmd: string, args: string[], cwd: string, env?: Env): Ran {
  const environment = env ?? process.env;
  const batch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
  const options = { cwd, env: environment, encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024 };
  const r = batch
    ? spawnSync(envValue(environment, 'ComSpec') ?? 'cmd.exe', ['/d', '/s', '/c', `"${[cmd, ...args].map(cmdQuoted).join(' ')}"`], { ...options, windowsVerbatimArguments: true })
    : spawnSync(cmd, args, options);
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const stderr = typeof r.stderr === 'string' ? r.stderr : '';
  const failed = r.error === undefined ? '' : `\n${r.error.message}`;
  return { status: typeof r.status === 'number' ? r.status : 1, out: `${stdout}${stderr}${failed}`, stdout, stderr };
}

/**
 * Where a command lives, or null — used to say "bun is not on PATH" by name rather than as a stack trace.
 *
 * ⚠️ `command -v` is a POSIX shell builtin, and `shell: true` on Windows is
 * cmd.exe, which has no `command`: every prerequisite read as absent and the
 * run stopped at its first line (issue #1214). `where` is cmd's own lookup; it
 * lists every match, one per line, so the first is the one taken.
 */
function onPath(cmd: string): string | null {
  const r = process.platform === 'win32' ? spawnSync('where', [cmd], { encoding: 'utf8' }) : spawnSync('command', ['-v', cmd], { encoding: 'utf8', shell: true });
  const found = typeof r.stdout === 'string' ? (r.stdout.trim().split(/\r?\n/)[0] ?? '').trim() : '';
  return found === '' ? null : found;
}

/** The file name a `bun` on PATH has on this platform. */
const BUN_BINARY = process.platform === 'win32' ? 'bun.exe' : 'bun';

/** Width, height and colour type out of a PNG's first 26 bytes, or null if those bytes are not a PNG header. */
function pngHeader(path: string): { width: number; height: number; colourType: number } | null {
  const buf = readFileSync(path);
  if (buf.length < 26) return null;
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIGNATURE.length; i++) if (buf[i] !== SIGNATURE[i]) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

// ---------------------------------------------------------------------------
// The wait for the registry
// ---------------------------------------------------------------------------

/**
 * What this script exits with. They are the only machine-readable thing a
 * caller gets, and two of them exist because one number cannot carry two
 * facts — see *The wait* at the top of this file.
 */
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOTHING_RAN = 2;
const EXIT_NOT_SERVED = 3;

/** Minutes the registry is given to serve a version, when no `--wait` says otherwise. */
const DEFAULT_WAIT_MINUTES = 15;

/**
 * Sleep on this thread.
 *
 * The script is synchronous end to end — one case after another, each one a
 * `spawnSync` — and a poll is no reason to make it otherwise. `Atomics.wait` is
 * the sleep that needs no child process and no event loop.
 */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `2m 37s`, so an elapsed time reads against the table in RELEASING.md without arithmetic. */
function elapsedText(ms: number): string {
  const whole = Math.round(ms / 1000);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}

/** How long to wait before the attempt after this one: 5 s, 10 s, 20 s, then 30 s for the rest of the wait. */
function backoffMs(attempt: number): number {
  return Math.min(5000 * 2 ** (attempt - 1), 30000);
}

interface RegistryWait {
  served: boolean;
  attempts: number;
  ms: number;
  /** The last thing npm said, so a network that is down is not reported as a version that is late. */
  last: string;
  /** Which piece the registry was still missing when the wait ended — `null` once both arrived. */
  missing: 'packument' | 'tarball' | null;
  /** The attempt the packument first answered on, and when; `null` if it never did. */
  packument: { attempt: number; ms: number } | null;
  /** `dist.tarball` as the packument named it, or '' before it answered. */
  tarballUrl: string;
  /** The tarball the wait fetched, which is what every case installs; '' unless `served`. */
  tgz: string;
}

/**
 * The line npm names a failure on, and not the last line it printed: the last
 * one is the path to a debug log, which says nothing about whether this was a
 * 404 or a network that is down.
 */
function npmSaid(out: string): string {
  const said = out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/A complete log of this run/.test(line));
  return said.find((line) => /\berror code\b/.test(line)) ?? said[0] ?? '';
}

/**
 * Ask the registry for a version — its packument, then the tarball behind it —
 * until both answer or the wait runs out.
 *
 * ⚠️ Every attempt is announced with its elapsed time and with the piece that
 * is still missing. The step this replaced printed six identical lines and then
 * somebody else's `E404`, so a reader had no way to tell a 60-second wait from
 * a 6-minute one without reading the timestamps in the log gutter — and the
 * version after it ended on the packument, which is half of what a case needs.
 *
 * 🔒 The tarball half is `npm pack` rather than a `HEAD` on `dist.tarball`:
 * the pack is the fetch a case makes — the registry and credentials npm is
 * configured with, its cache, its integrity check against the packument — and
 * a URL probed from here would be none of those. `--loglevel=error` rather
 * than `--silent`, because `--silent` prints nothing at all when the pack
 * fails (measured: v1.1.0's fault line ended in an empty string where npm's
 * `E404` should have been).
 */
function waitForRegistry(spec: string, minutes: number, cwd: string, into: string): RegistryWait {
  const started = Date.now();
  const deadline = started + Math.round(minutes * 60_000);
  let attempts = 0;
  let last = '';
  let missing: 'packument' | 'tarball' = 'packument';
  let packument: { attempt: number; ms: number } | null = null;
  let tarballUrl = '';
  const outcome = (served: boolean, tgz: string): RegistryWait => ({
    served,
    attempts,
    ms: Date.now() - started,
    last,
    missing: served ? null : missing,
    packument,
    tarballUrl,
    tgz,
  });
  for (;;) {
    attempts += 1;
    const asked = run('npm', ['view', spec, 'dist.tarball', '--prefer-online'], cwd);
    if (asked.status !== 0) {
      missing = 'packument';
      last = npmSaid(asked.out);
    } else {
      if (packument === null) packument = { attempt: attempts, ms: Date.now() - started };
      tarballUrl = asked.out.trim().split('\n').pop()?.trim() ?? '';
      // A fresh directory per attempt, so a tarball left by an earlier one can
      // never be counted as this one's bytes.
      rmSync(into, { recursive: true, force: true });
      mkdirSync(into, { recursive: true });
      const fetched = run('npm', ['pack', spec, '--pack-destination', into, '--prefer-online', '--loglevel=error'], cwd);
      const tarballs = readdirSync(into).filter((f) => f.endsWith('.tgz'));
      const bytes = tarballs.length === 1 ? statSync(join(into, tarballs[0])).size : 0;
      if (fetched.status === 0 && tarballs.length === 1 && bytes > 0) return outcome(true, join(into, tarballs[0]));
      missing = 'tarball';
      last =
        fetched.status !== 0
          ? npmSaid(fetched.out)
          : `\`npm pack\` exited 0 and left ${tarballs.length} tarball(s) holding no bytes in ${into}`;
    }
    const left = deadline - Date.now();
    if (left <= 0) return outcome(false, '');
    const nap = Math.min(backoffMs(attempts), left);
    const piece =
      missing === 'packument'
        ? `the registry is not serving the packument for ${spec} yet`
        : `the registry is serving the packument for ${spec} but not its tarball yet (${tarballUrl || 'no dist.tarball named'})`;
    console.log(
      `  ${piece} — attempt ${attempts}, ${elapsedText(Date.now() - started)} into a ` +
        `${minutes} min wait; asking again in ${Math.round(nap / 1000)}s`,
    );
    sleepMs(nap);
  }
}

// ---------------------------------------------------------------------------
// The tarball, and the plants that patch a COPY of it
// ---------------------------------------------------------------------------

type Plant =
  | 'none'
  | 'drop-plate'
  | 'drop-src-module'
  | 'add-dependency'
  | 'drop-core-entry'
  | 'drop-skills'
  | 'drop-exports'
  | 'drop-deep-exports'
  | 'drop-named-entry'
  | 'drop-rig-entry'
  | 'drop-mesh-entry'
  | 'drop-errors-entry'
  | 'drop-meshcompare-entry'
  | 'drop-core-named-entry'
  | 'import-node-in-core'
  | 'rename-symbol'
  | 'fork-compile-error'
  | 'refuse-core-build'
  | 'move-core-byte';

/**
 * The line of the packed `src/cli/core_commands.ts` that registers the core
 * entry's `build` body (issue #1060), which the two core-build plants replace.
 *
 * ⭐ Why a patched line and not a module out of `files`: every module the core
 * entry reaches is a static import of `cli_core.ts`'s closure — there is no
 * dynamic `import(` anywhere under `src/` — so a module the build alone needs does not
 * exist, and removing any module kills `rigc --version` before the build is
 * reached (that is `drop-core-entry`, and `drop-src-module` on the other
 * entry). The body is the smallest thing only the core entry's `build` runs:
 * `cli.ts` registers its own (`cmdBuild`), so the round-tripped build, render
 * and check are untouched, and `alone` below holds that no other step went red.
 */
const CORE_BUILD_LINE = '  build: ({ flags }) => runBuild(flags, MODEL_AND_TEXT_GATE),';
const CORE_BUILD_MODULE = 'src/cli/core_commands.ts';
const CORE_BUILD_PLANTS: Record<'refuse-core-build' | 'move-core-byte', string> = {
  'refuse-core-build': "  build: () => { throw new UsageError('install smoke plant: the core entry\\'s build refuses before it compiles'); },",
  // After the gate and after the write, so the gate passes and the files land:
  // one byte appended to the atlas the core entry wrote, which only the
  // comparison against the round-tripped build can see.
  'move-core-byte':
    "  build: ({ flags }) => { runBuild(flags, MODEL_AND_TEXT_GATE); const at = join(flags.out, 'skeleton.atlas'); writeFileSync(at, `${readFileSync(at, 'utf8')}\\n`); },",
};

/** What the comparison holds equal: every file each entry's build of the fixture writes, by name. */
const CORE_OUT = 'core-build';

/** Where the core entry's build writes its `--report` (issue #1213): beside `--out`, never in it. */
const CORE_REPORT = 'core-build.report.json';

/** The `spec` the installed build's report has to carry — spelled here rather than imported, since the smoke reads the install, not the tree. */
const BUILD_REPORT_SPEC_SEEN = 'build-report/1';

/**
 * What is wrong with the installed core build's `--report` document, read
 * against the lines the same build printed: it has to be there and parse, say
 * `build-report/1`, `build` and the `model` supplier, and carry one gate per
 * summary line printed, each with that line's figures. Empty when it holds.
 */
function coreReportProblems(path: string, printed: string): string[] {
  if (!existsSync(path)) return ['no document was written'];
  let doc: { spec?: unknown; command?: unknown; supplier?: unknown; gates?: Array<{ summary?: Record<string, unknown> }> };
  try {
    doc = JSON.parse(readFileSync(path, 'utf8')) as typeof doc;
  } catch (err) {
    return [`the document does not parse: ${(err as Error).message}`];
  }
  const problems: string[] = [];
  if (doc.spec !== BUILD_REPORT_SPEC_SEEN) problems.push(`spec is ${JSON.stringify(doc.spec)}, not "${BUILD_REPORT_SPEC_SEEN}"`);
  if (doc.command !== 'build') problems.push(`command is ${JSON.stringify(doc.command)}, not "build"`);
  if (doc.supplier !== 'model') problems.push(`supplier is ${JSON.stringify(doc.supplier)}, not "model" — this entry links no spine-core`);
  const summaries = [...printed.matchAll(/(\d+) assertions: (\d+) measured \((\d+) passed, (\d+) failed\), (\d+) skipped/g)].map((m) => m.slice(1, 6).map(Number));
  const gates = doc.gates ?? [];
  if (gates.length !== summaries.length || summaries.length === 0) problems.push(`${gates.length} gate(s) in the document and ${summaries.length} summary line(s) printed`);
  gates.forEach((g, i) => {
    const said = summaries[i];
    const s = g.summary ?? {};
    const held = [s.assertions, s.measured, s.passed, s.failed, s.skipped];
    if (said !== undefined && held.join(',') !== said.join(',')) problems.push(`gate ${i + 1}'s summary is ${held.join(',')} and its line says ${said.join(',')}`);
  });
  return problems;
}
const FULL_OUT = 'build';

/**
 * The module each plant takes out of the package, and the step whose output has
 * to name it. `alone` holds that no OTHER step went red — the plant broke one
 * thing, and a red anywhere else would be the plant being larger than it says.
 */
/**
 * A plant that takes one of the entries #1212 named out of the packed map. It
 * has to go red at both steps that import the entry — the probe with the
 * runtime beside the package, and the one after it is taken away — and at no
 * other: nothing inside the package imports itself by a bare specifier, so the
 * builds, render, check and the skills are untouched.
 */
function droppedEntryPlant(plant: Exclude<DropPlant, 'drop-named-entry'>, issue = '#1212'): { names: string[]; steps: string[]; what: string; alone: true } {
  const entry = DROPPED_ENTRIES[plant];
  // The comparison probe imports `rig-c/meshcompare`, and `rig-c/mesh` for the class its refusal is caught
  // by, so taking either entry away reddens that step too — by the entry's name, which is what the plant requires.
  const compares = entry === './meshcompare' || entry === './mesh';
  // The core's two steps import `rig-c/core` by its bare name — the call from the install and the browser bundle — so
  // taking the entry away reddens both of them too, by the entry's name (issue #1275).
  const poses = entry === './core';
  return {
    names: [`${NAME}${entry.slice(1)}`, ...(entry === './mesh' ? ['buildSegmentsLattice', 'segmentDistance', 'influenceShares'] : [])],
    steps: ['exports', 'exports-without-runtime', ...(compares ? [MESHCOMPARE_STEP] : []), ...(poses ? [CORE_POSE_STEP, CORE_BROWSER_STEP] : [])],
    alone: true,
    what: `the named entry \`${entry}\` removed from \`exports\` (issue ${issue}), which the patterns do not rescue — \`./*\` maps it to a file at the package root that does not exist — so a dependant importing \`${NAME}${entry.slice(1)}\` is the one who finds out: both import probes${compares ? ' and the comparison from the install' : ''}${poses ? ', the pose from the install and the browser bundle' : ''} have to go red naming the entry, and nothing else`,
  };
}

const PLANTED: Record<Exclude<Plant, 'none'>, { names: string[]; steps: string[]; what: string; alone?: true }> = {
  'drop-plate': {
    names: ['tools/plate.ts'],
    steps: ['fixture', 'build'],
    what: '`tools/plate.ts` removed from `files`, which is the allowlist hole CLAUDE.md describes: "A module added under `tools/` and left out of `files` still runs from a clone — the installed package is where it throws `Cannot find module`, on the command that needs it"',
  },
  'drop-src-module': {
    names: ['validate.ts'],
    steps: ['build'],
    what: '`src/validate.ts` removed from the packed tree. `files` names the `src` DIRECTORY, so a module leaves the package by leaving the tree rather than by leaving the array, and this is what that looks like from the install: the owner of the spine-core round trip is the module that goes missing',
  },
  'add-dependency': {
    names: ['@esotericsoftware/spine-core'],
    steps: ['install'],
    what: '`@esotericsoftware/spine-core` put back in `dependencies` (issue #1061), which is the package every version before 2.0.0 shipped: the install fetches the runtime, so the state this smoke exists to measure — an install with no spine-core, running the core entry — never happens, and the install step has to say so rather than quietly testing the other package',
  },
  'drop-core-entry': {
    names: ['cli_core.ts'],
    steps: ['version'],
    what: '`cli_core.ts` removed from `files` (issue #1061). A clone always has it, and the launcher only reaches for it where spine-core is absent — which is every install — so a package that ships no core entry is one whose `rigc` dies on its first command, and only an install can show it',
  },
  'drop-skills': {
    names: ['skills/'],
    steps: ['skills'],
    what: '`skills` removed from `files` (issue #831). `rigc skills install` finds the skills from its own location in the install, so a package that ships none is the one place this can be seen — a checkout always has them',
  },
  'drop-exports': {
    names: [`${NAME}/plate`],
    steps: ['exports'],
    what: `\`exports\` removed from \`package.json\` (issue #859), which is the package v1.2.3 shipped: every deep path still resolves, so what goes missing is the named surface, and a dependant importing \`${NAME}/plate\` is the one who finds out`,
  },
  'drop-deep-exports': {
    names: [`${NAME}/tools/plate.ts`],
    steps: ['exports'],
    what: `\`exports\` cut down to its named entries (issue #859), which is the map without its pattern courtesy: \`${NAME}/tools/plate.ts\`, a deep path a dependant was observed importing, stops resolving, and so does the fixture that imports it`,
  },
  'drop-named-entry': {
    names: [`${NAME}${DROPPED_ENTRIES['drop-named-entry'].slice(1)}`],
    steps: ['exports'],
    what: `the named entry \`${DROPPED_ENTRIES['drop-named-entry']}\` removed from \`exports\` (issue #1167), which the patterns do not rescue — \`./*\` maps it to a file at the package root that does not exist — so a dependant importing \`${NAME}${DROPPED_ENTRIES['drop-named-entry'].slice(1)}\` is the one who finds out, and the line has to name the entry`,
  },
  'drop-rig-entry': droppedEntryPlant('drop-rig-entry'),
  'drop-mesh-entry': droppedEntryPlant('drop-mesh-entry'),
  'drop-errors-entry': droppedEntryPlant('drop-errors-entry'),
  'drop-meshcompare-entry': droppedEntryPlant('drop-meshcompare-entry', '#1230'),
  'drop-core-named-entry': droppedEntryPlant('drop-core-named-entry', '#1275'),
  'import-node-in-core': {
    names: [CORE_BROWSER_CASE, NODE_REFUSAL, 'node:fs'],
    steps: [CORE_BROWSER_STEP],
    alone: true,
    what: `an import of \`node:fs\` put at the top of the packed \`${NODE_PLANT_MODULE}\` (issue #1275), which \`${NAME}/core\` reaches: Bun loads it, so the builds, the direct pose and every probe still run, and vite left to itself would tree-shake the binding to a bundle with no \`node:\` string in it and exit 0 — so the browser step, and only it, has to go red naming the module`,
  },
  'rename-symbol': {
    names: [`${NAME}${RENAME_PLANT.entry.slice(1)}`, RENAME_PLANT.symbol],
    steps: ['exports'],
    alone: true,
    what: `\`${RENAME_PLANT.symbol}\` exported as \`${RENAME_PLANT.renamed}\` from \`${NAMED_EXPORTS[RENAME_PLANT.entry]}\` (issues #1167, #1184), a symbol no module inside the package imports: \`rigc --version\`, both builds, the comparison, render and check still work, and only a dependant reading the old name can tell — so the observed-symbol probe has to go red alone, naming the entry and the symbol`,
  },
  'fork-compile-error': {
    names: [`${NAME}/rig`, 'CompileError'],
    steps: ['exports'],
    alone: true,
    what: `the packed \`${FORK_ERROR_MODULE}\` given a \`CompileError\` class of its own in place of the one \`${NAME}/errors\` exports (issue #1212): every module loads, a valid spec throws nothing so every build runs, and the parser's refusal still reads as a CompileError by name and by message — only a dependant catching it by its class, across the package boundary, can tell, so the call probe has to go red alone, naming the entry and the class`,
  },
  'refuse-core-build': {
    names: ['SMOKE_CORE_ENTRY_BUILDS'],
    steps: ['core-build'],
    alone: true,
    what: `the core entry's \`build\` body in \`${CORE_BUILD_MODULE}\` made to refuse (issue #1178) — the build every install runs, which this smoke once recorded as a HOLE when it exited non-zero, and a HOLE does not move the exit code: \`rigc --version\`, the round-tripped build, render and check still work, so the core-build step has to go red alone`,
  },
  'move-core-byte': {
    names: ['SMOKE_ENTRIES_BUILD_THE_SAME_BYTES', 'skeleton.atlas'],
    steps: ['compare'],
    alone: true,
    what: `one byte appended to the \`skeleton.atlas\` the core entry's build wrote, after its gate (issue #1178) — the core build still exits 0 and writes every file, so only the comparison with the round-tripped build of the same fixture can see it, and it has to name the file`,
  },
};

/**
 * A tarball to install, packed either out of this tree or downloaded from the
 * registry, and then — if a plant is asked for — extracted, patched and packed
 * again from the patched copy.
 *
 * 🔒 The patch never touches the worktree. `npm pack` writes into `work`, the
 * extraction is under `work`, and the second pack reads the extraction.
 */
function tarballFor(
  work: string,
  source: Source,
  plant: Plant,
): { tgz: string; faults: string[]; paths: string[]; evidence: string } {
  const faults: string[] = [];
  const packDir = join(work, 'pack');
  mkdirSync(packDir, { recursive: true });

  // The registry arm does not fetch: the wait already did, and "served" means
  // exactly that fetch succeeded (issue #833). A copy of those bytes is what
  // every case installs, so no second fetch can go red on a tarball the
  // registry is still propagating and be printed as a broken artifact.
  if (source.kind === 'registry') copyFileSync(source.tgz, join(packDir, basename(source.tgz)));
  const packed =
    source.kind === 'tree'
      ? run('npm', ['pack', ROOT, '--pack-destination', packDir, '--silent'], work)
      : { status: 0, out: '', stdout: '', stderr: '' };
  const tarballs = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith('.tgz')) : [];
  if (packed.status !== 0 || tarballs.length !== 1) {
    faults.push(
      `SMOKE_PACK_WROTE_A_TARBALL: \`npm pack\` exited ${packed.status} and left ${tarballs.length} tarball(s) in ${packDir}; one was required. ${packed.out.trim()}`,
    );
    return { tgz: '', faults, paths: [], evidence: '' };
  }
  const first = join(packDir, tarballs[0]);
  const paths = tarPaths(first, work);
  if (plant === 'none') return { tgz: first, faults, paths, evidence: '' };

  // Extract, patch, pack again. `npm pack <dir>` reads that directory's own
  // package.json, so a `files` entry removed from the extraction is a file the
  // second tarball does not carry.
  const patchDir = join(work, 'patched');
  mkdirSync(patchDir, { recursive: true });
  const untar = run('tar', ['-xzf', first, '-C', patchDir], work);
  const pkgDir = join(patchDir, 'package');
  if (untar.status !== 0 || !existsSync(join(pkgDir, 'package.json'))) {
    faults.push(`SMOKE_PLANT_APPLIED: extracting ${first} left no package/package.json under ${patchDir}. ${untar.out.trim()}`);
    return { tgz: '', faults, paths: [], evidence: '' };
  }

  const pkgPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    files?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    exports?: Record<string, string>;
  };
  if (plant === 'drop-plate') {
    pkg.files = (pkg.files ?? []).filter((entry) => entry !== 'tools/plate.ts');
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'add-dependency') {
    pkg.dependencies = { ...(pkg.dependencies ?? {}), [RUNTIME]: pkg.devDependencies?.[RUNTIME] ?? 'latest' };
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'drop-core-entry') {
    pkg.files = (pkg.files ?? []).filter((entry) => entry !== 'cli_core.ts');
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'drop-skills') {
    pkg.files = (pkg.files ?? []).filter((entry) => entry !== 'skills');
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'drop-exports') {
    delete pkg.exports;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'drop-deep-exports') {
    pkg.exports = Object.fromEntries(Object.entries(pkg.exports ?? {}).filter(([key]) => key in NAMED_EXPORTS));
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (isDropPlant(plant)) {
    pkg.exports = Object.fromEntries(Object.entries(pkg.exports ?? {}).filter(([key]) => key !== DROPPED_ENTRIES[plant]));
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'rename-symbol') {
    // The export renamed and the function kept, so every call inside the
    // defining module still reaches it: `export function X(` becomes
    // `function X(`, and an `export { X as Renamed }` is appended. A module
    // that IMPORTS X would not survive this, which is why RENAME_PLANT names a
    // symbol nothing inside imports and `alone` holds it. Checked below, on
    // the tarball.
    const victim = join(pkgDir, NAMED_EXPORTS[RENAME_PLANT.entry]);
    const declared = `export function ${RENAME_PLANT.symbol}(`;
    const text = existsSync(victim) ? readFileSync(victim, 'utf8') : '';
    if (text.split(declared).length !== 2) {
      faults.push(`SMOKE_PLANT_APPLIED: ${NAMED_EXPORTS[RENAME_PLANT.entry]} declares \`${declared}\` ${text.split(declared).length - 1} time(s) where once was required, so the rename plants nothing`);
      return { tgz: '', faults, paths: [], evidence: '' };
    }
    writeFileSync(victim, `${text.replace(declared, `function ${RENAME_PLANT.symbol}(`)}\nexport { ${RENAME_PLANT.symbol} as ${RENAME_PLANT.renamed} };\n`);
  } else if (plant === 'fork-compile-error') {
    const victim = join(pkgDir, FORK_ERROR_MODULE);
    const text = existsSync(victim) ? readFileSync(victim, 'utf8') : '';
    if (text.split(FORK_ERROR_IMPORT).length !== 2) {
      faults.push(`SMOKE_PLANT_APPLIED: ${FORK_ERROR_MODULE} carries \`${FORK_ERROR_IMPORT}\` ${text.split(FORK_ERROR_IMPORT).length - 1} time(s) where once was required, so the plant "${plant}" plants nothing`);
      return { tgz: '', faults, paths: [], evidence: '' };
    }
    writeFileSync(victim, text.replace(FORK_ERROR_IMPORT, FORK_ERROR_PLANTED));
  } else if (plant === 'import-node-in-core') {
    const victim = join(pkgDir, NODE_PLANT_MODULE);
    if (!existsSync(victim)) {
      faults.push(`SMOKE_PLANT_APPLIED: ${NODE_PLANT_MODULE} is not in the packed tree, so the plant "${plant}" plants nothing`);
      return { tgz: '', faults, paths: [], evidence: '' };
    }
    writeFileSync(victim, `${NODE_PLANT_LINE}${readFileSync(victim, 'utf8')}`);
  } else if (plant === 'refuse-core-build' || plant === 'move-core-byte') {
    const victim = join(pkgDir, CORE_BUILD_MODULE);
    const text = existsSync(victim) ? readFileSync(victim, 'utf8') : '';
    if (text.split(CORE_BUILD_LINE).length !== 2) {
      faults.push(`SMOKE_PLANT_APPLIED: ${CORE_BUILD_MODULE} carries \`${CORE_BUILD_LINE.trim()}\` ${text.split(CORE_BUILD_LINE).length - 1} time(s) where once was required, so the plant "${plant}" plants nothing`);
      return { tgz: '', faults, paths: [], evidence: '' };
    }
    writeFileSync(victim, text.replace(CORE_BUILD_LINE, CORE_BUILD_PLANTS[plant]));
  } else {
    const victim = join(pkgDir, 'src', 'validate.ts');
    if (!existsSync(victim)) {
      faults.push(`SMOKE_PLANT_APPLIED: src/validate.ts is not in the packed tree, so removing it plants nothing`);
      return { tgz: '', faults, paths: [], evidence: '' };
    }
    rmSync(victim);
  }

  const repackDir = join(work, 'repack');
  mkdirSync(repackDir, { recursive: true });
  const repacked = run('npm', ['pack', pkgDir, '--pack-destination', repackDir, '--silent'], work);
  const again = readdirSync(repackDir).filter((f) => f.endsWith('.tgz'));
  if (repacked.status !== 0 || again.length !== 1) {
    faults.push(`SMOKE_PLANT_APPLIED: re-packing the patched copy exited ${repacked.status} with ${again.length} tarball(s). ${repacked.out.trim()}`);
    return { tgz: '', faults, paths: [], evidence: '' };
  }
  const second = join(repackDir, again[0]);

  // 🚨 The control on the plant itself, read out of the TARBALL that will be
  // installed rather than out of the directory it was packed from. A plant that
  // removed nothing would let the case go green on a package that is still
  // whole, and the inverted verdict below would then be reporting that a correct
  // package fails.
  //
  // ⚠️ Some plants change the path list and the rest do not, so one clause
  // cannot serve both: `add-dependency` and the `exports` plants leave every
  // path where it was and edit `package.json`, the rename and the two core-build
  // plants edit one shipped module, and a clause written only for the first
  // kind would pass them by construction.
  const before = new Set(paths);
  const after = tarPaths(second, work);
  const gone = [...before].filter((p) => !after.includes(p));
  let evidence = '';
  if (plant === 'add-dependency') {
    const shipped = run('tar', ['-xzOf', second, 'package/package.json'], work);
    const deps = shipped.status === 0 ? ((JSON.parse(shipped.out) as { dependencies?: Record<string, string> }).dependencies ?? {}) : {};
    if (shipped.status !== 0 || !(RUNTIME in deps)) {
      faults.push(
        `SMOKE_PLANT_APPLIED: the packed package.json declares ${Object.keys(deps).join(', ') || 'no dependencies'}, not ${RUNTIME}, so nothing was planted and a red below would be somebody else's fault`,
      );
    } else {
      evidence = `the packed package.json declares ${RUNTIME} ${deps[RUNTIME]} in dependencies, where the tree declares it only as a devDependency`;
    }
  } else if (isDropPlant(plant)) {
    const dropped = DROPPED_ENTRIES[plant];
    const shipped = run('tar', ['-xzOf', second, 'package/package.json'], work);
    const map = shipped.status === 0 ? (JSON.parse(shipped.out) as { exports?: Record<string, string> }).exports : undefined;
    const kept = Object.keys(NAMED_EXPORTS).filter((key) => key !== dropped);
    if (map === undefined || dropped in map || kept.some((key) => !(key in map))) {
      faults.push(
        `SMOKE_PLANT_APPLIED: the packed package.json maps ${map === undefined ? 'no exports' : `exports ${Object.keys(map).join(', ')}`}, and a map without ${dropped} and with every other named entry was required, so the plant "${plant}" planted something else`,
      );
    } else {
      evidence = `the packed package.json maps ${Object.keys(map).length} exports key(s), ${dropped} not among them`;
    }
  } else if (plant === 'fork-compile-error') {
    const shipped = run('tar', ['-xzOf', second, `package/${FORK_ERROR_MODULE}`], work);
    if (shipped.status !== 0 || shipped.out.includes(FORK_ERROR_IMPORT) || !shipped.out.includes(FORK_ERROR_PLANTED)) {
      faults.push(`SMOKE_PLANT_APPLIED: the packed ${FORK_ERROR_MODULE} still imports CompileError from ./errors.ts, or does not declare its own as the plant "${plant}" writes it, so nothing was planted`);
    } else {
      evidence = `the packed ${FORK_ERROR_MODULE} declares a CompileError of its own rather than importing the one ./errors.ts exports`;
    }
  } else if (plant === 'rename-symbol') {
    const file = NAMED_EXPORTS[RENAME_PLANT.entry];
    const shipped = run('tar', ['-xzOf', second, `package/${file}`], work);
    const renamed = `export { ${RENAME_PLANT.symbol} as ${RENAME_PLANT.renamed} };`;
    if (shipped.status !== 0 || shipped.out.includes(`export function ${RENAME_PLANT.symbol}(`) || !shipped.out.includes(renamed)) {
      faults.push(`SMOKE_PLANT_APPLIED: the packed ${file} does not export ${RENAME_PLANT.symbol} under the name ${RENAME_PLANT.renamed} alone, so the plant "${plant}" planted nothing`);
    } else {
      evidence = `the packed ${file} exports ${RENAME_PLANT.symbol} as ${RENAME_PLANT.renamed} and no longer under its own name`;
    }
  } else if (plant === 'import-node-in-core') {
    const shipped = run('tar', ['-xzOf', second, `package/${NODE_PLANT_MODULE}`], work);
    if (shipped.status !== 0 || !shipped.out.startsWith(NODE_PLANT_LINE)) {
      faults.push(`SMOKE_PLANT_APPLIED: the packed ${NODE_PLANT_MODULE} does not open with the planted import of node:fs, so the plant "${plant}" planted nothing`);
    } else {
      evidence = `the packed ${NODE_PLANT_MODULE} opens with an import of node:fs`;
    }
  } else if (plant === 'refuse-core-build' || plant === 'move-core-byte') {
    const shipped = run('tar', ['-xzOf', second, `package/${CORE_BUILD_MODULE}`], work);
    if (shipped.status !== 0 || shipped.out.includes(CORE_BUILD_LINE) || !shipped.out.includes(CORE_BUILD_PLANTS[plant])) {
      faults.push(`SMOKE_PLANT_APPLIED: the packed ${CORE_BUILD_MODULE} still registers the core entry's build as the tree does, or not as the plant "${plant}" writes it, so nothing was planted`);
    } else {
      evidence = `the packed ${CORE_BUILD_MODULE} registers the core entry's build as \`${CORE_BUILD_PLANTS[plant].trim()}\``;
    }
  } else if (plant === 'drop-exports' || plant === 'drop-deep-exports') {
    const shipped = run('tar', ['-xzOf', second, 'package/package.json'], work);
    const map = shipped.status === 0 ? (JSON.parse(shipped.out) as { exports?: Record<string, string> }).exports : undefined;
    const keys = map === undefined ? [] : Object.keys(map);
    const treeKeys = Object.keys((JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { exports?: Record<string, string> }).exports ?? {});
    const planted =
      shipped.status === 0 &&
      (plant === 'drop-exports'
        ? map === undefined
        : keys.length > 0 && keys.length < treeKeys.length && keys.every((key) => key in NAMED_EXPORTS));
    if (!planted) {
      faults.push(
        `SMOKE_PLANT_APPLIED: the packed package.json maps ${map === undefined ? 'no exports' : `exports ${keys.join(', ')}`} where the tree maps ${treeKeys.length} key(s), so the plant "${plant}" planted nothing and a red below would be somebody else's fault`,
      );
    } else {
      evidence = `the packed package.json maps ${keys.length} exports key(s) where the tree maps ${treeKeys.length}`;
    }
  } else if (gone.length === 0) {
    faults.push(
      `SMOKE_PLANT_APPLIED: the plant "${plant}" left the packed path list unchanged at ${after.length} path(s), so nothing was planted and a red below would be somebody else's fault`,
    );
  } else {
    evidence = `the plant took ${gone.join(', ')} out of the pack`;
  }
  return { tgz: second, faults, paths: after, evidence };
}

/** Make one directory under another and hand back its path. */
function mkdirIn(parent: string, name: string): string {
  const path = join(parent, name);
  mkdirSync(path, { recursive: true });
  return path;
}

/** The paths inside a tarball, as `tar -tzf` lists them, with the leading `package/` stripped. */
function tarPaths(tgz: string, cwd: string): string[] {
  const listed = run('tar', ['-tzf', tgz], cwd);
  if (listed.status !== 0) return [];
  return listed.out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.endsWith('/'))
    .map((line) => (line.startsWith('package/') ? line.slice('package/'.length) : line));
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

/** Where a case's tarball comes from: packed out of this tree, or the bytes the registry wait fetched. */
type Source = { kind: 'tree' } | { kind: 'registry'; spec: string; tgz: string };

interface CaseSpec {
  name: string;
  source: Source;
  installer: 'npm' | 'bun';
  plant: Plant;
  /** A directory name for the install root, when the case is about the path itself. */
  dirName: string;
}

interface CaseResult {
  name: string;
  faults: string[];
  /** Which named step each fault came from, so a plant can require the red where it planted it. */
  steps: string[];
  notes: string[];
  output: string;
}

/**
 * Every file in two build directories, compared by name and then byte for
 * byte: one line per difference, naming the file, both sizes and the first
 * byte at which they part. Empty when the two hold the same files with the
 * same bytes.
 */
function sameBuild(core: string, full: string): { differences: string[]; files: Array<{ file: string; bytes: number }> } {
  const listed = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()).sort() : []);
  const a = listed(core);
  const b = listed(full);
  const differences: string[] = [];
  const files: Array<{ file: string; bytes: number }> = [];
  for (const file of a.filter((f) => !b.includes(f))) differences.push(`${CORE_OUT}/${file} has no counterpart in ${FULL_OUT}/`);
  for (const file of b.filter((f) => !a.includes(f))) differences.push(`${FULL_OUT}/${file} has no counterpart in ${CORE_OUT}/`);
  for (const file of a.filter((f) => b.includes(f))) {
    const x = readFileSync(join(core, file));
    const y = readFileSync(join(full, file));
    if (x.equals(y)) {
      files.push({ file, bytes: x.length });
      continue;
    }
    let at = 0;
    while (at < x.length && at < y.length && x[at] === y[at]) at += 1;
    differences.push(`${file}: ${CORE_OUT}/ holds ${x.length} byte(s) and ${FULL_OUT}/ ${y.length}, first differing at byte ${at}`);
  }
  return { differences, files };
}

function runCase(spec: CaseSpec, work: string, keep: boolean): CaseResult {
  const faults: string[] = [];
  const steps: string[] = [];
  const notes: string[] = [];
  let output = '';
  const fault = (step: string, message: string): void => {
    faults.push(message);
    steps.push(step);
  };

  const built = tarballFor(work, spec.source, spec.plant);
  for (const f of built.faults) fault('pack', f);
  if (built.tgz === '') return { name: spec.name, faults, steps, notes, output };
  notes.push(`the tarball carries ${built.paths.length} path(s)`);
  if (built.evidence !== '') notes.push(built.evidence);

  // An EMPTY directory with a package.json of its own, so npm resolves here and
  // does not walk up into whatever this temp directory happens to sit under.
  // `realpathSync` because a module specifier resolves through the real path:
  // on macOS this temp directory is reached as /var/… and reported as /private/var/…,
  // and the control below compares the two. `.native`, because on Windows the
  // temp directory is reached through an 8.3 short name (`RUNNER~1`) that the
  // JavaScript `realpathSync` keeps and the module resolver expands, so the two
  // spellings of one directory read as "not under" each other (issue #1214);
  // the native call asks the OS for the final path, which is the long name.
  const home = realpathSync.native(mkdirIn(work, spec.dirName));
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'rigc-install-smoke', private: true, version: '0.0.0' }, null, 2)}\n`);

  const install =
    spec.installer === 'npm'
      ? run('npm', ['install', built.tgz, '--no-audit', '--no-fund'], home)
      : run('bun', ['add', built.tgz], home);
  output += install.out;
  const pkgRoot = join(home, 'node_modules', NAME);
  if (!existsSync(join(pkgRoot, 'package.json'))) {
    fault(
      'install',
      `SMOKE_INSTALL_EMPTY_DIR: ${spec.installer} install of ${built.tgz} exited ${install.status} and left no node_modules/${NAME}/package.json under ${home}. ${install.out.trim().slice(0, 4000)}`,
    );
    if (!keep) rmSync(home, { recursive: true, force: true });
    return { name: spec.name, faults, steps, notes, output };
  }

  // On Windows `.bin/rigc` is npm's shell-script shim, which only a POSIX shell
  // runs; the shim a Windows caller runs is `rigc.cmd` from npm and `rigc.exe`
  // from bun (issue #1214).
  const bin = join(home, 'node_modules', '.bin', process.platform !== 'win32' ? 'rigc' : spec.installer === 'npm' ? 'rigc.cmd' : 'rigc.exe');
  if (!existsSync(bin)) {
    fault('install', `SMOKE_INSTALL_EMPTY_DIR: the install wrote no node_modules/.bin/rigc under ${home}, so the package's own \`bin\` entry never reached a shim`);
  }

  // 🔒 Phase one: the install as a user receives it — no runtime (issue #1061).
  // The package declares spine-core as a devDependency, so an install that
  // fetched it is installing some other package than the one this tree packs.
  const runtimeDir = join(home, 'node_modules', '@esotericsoftware', 'spine-core');
  const corePkg = join(runtimeDir, 'package.json');
  const shippedManifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version?: string; devDependencies?: Record<string, string> };
  const pkgVersion = shippedManifest.version ?? '';
  const runtimeWanted = shippedManifest.devDependencies?.[RUNTIME] ?? null;
  if (existsSync(corePkg)) {
    fault(
      'install',
      `SMOKE_INSTALL_HAS_NO_SPINE_CORE: the install brought ${RUNTIME} ${(JSON.parse(readFileSync(corePkg, 'utf8')) as { version?: string }).version ?? ''} into node_modules, so it is not the install a user of this package receives — the runtime is a devDependency and nothing installs it`,
    );
  } else {
    notes.push(`installed without ${RUNTIME} (a devDependency${runtimeWanted === null ? '' : ` at ${runtimeWanted}`}, not installed)`);
  }
  const expectVersion = (step: string, entry: string, says: string): void => {
    const ran = run(bin, ['--version'], home);
    output += ran.out;
    const lines = ran.out.split('\n');
    if (ran.status !== 0 || !lines.includes(pkgVersion) || !ran.out.includes(says)) {
      fault(step, `SMOKE_VERSION_NAMES_THE_ENTRY: \`node_modules/.bin/rigc --version\` exited ${ran.status} printing ${JSON.stringify(ran.out.trim().slice(0, 600))}; ${pkgVersion} and "${says}" were required — the launcher has to run ${entry} here and say so`);
    } else {
      notes.push(`--version: ${ran.out.trim().split('\n').join(' / ')}`);
    }
  };

  // The fixture: written here, generated by the package.
  writeFileSync(join(home, 'rig.json'), `${JSON.stringify(RIG_SPEC, null, 2)}\n`);
  writeFileSync(join(home, 'motion.json'), `${JSON.stringify(MOTION_SPEC, null, 2)}\n`);
  writeFileSync(join(home, 'make_plates.ts'), PLATE_SOURCE);

  const plates = run('bun', [join(home, 'make_plates.ts')], home);
  output += plates.out;
  if (plates.status !== 0) {
    fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: \`bun make_plates.ts\` exited ${plates.status}. ${plates.out.trim().slice(0, 4000)}`);
  } else {
    const resolved = /^RESOLVED (.+)$/m.exec(plates.out)?.[1] ?? '';
    const asPath = resolved.startsWith('file://') ? fileURLToPath(resolved) : resolved;
    if (!asPath.startsWith(join(home, 'node_modules'))) {
      fault(
        'fixture',
        `SMOKE_FIXTURE_CAME_FROM_THE_PACKAGE: the generator resolved '${NAME}/tools/plate.ts' to ${asPath || '(nothing)'}, which is not under ${join(home, 'node_modules')} — so the plates were not made by the installed package`,
      );
    } else {
      notes.push(`the plate codec resolved to ${asPath.slice(home.length + 1)}`);
    }
    for (const plate of PLATES) {
      const path = join(home, 'parts', plate.file);
      if (!existsSync(path)) {
        fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} was not written`);
        continue;
      }
      const header = pngHeader(path);
      if (header === null) {
        fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} does not start with a PNG header`);
      } else if (header.width !== plate.width || header.height !== plate.height || header.colourType !== 6) {
        fault(
          'fixture',
          `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} is ${header.width}x${header.height} colour type ${header.colourType}; ${plate.width}x${plate.height} colour type 6 (RGBA, straight alpha) was required`,
        );
      }
    }
  }

  expectVersion('version', 'cli_core.ts', `entry: cli_core.ts — ${RUNTIME} absent`);

  // The build on the core entry (issue #1060) — the build every install runs,
  // since an install has no runtime. It has to exit 0 and write its files, and
  // anything else is a fault of the case (issue #1178: this branch used to
  // record a non-zero exit as a HOLE, and a HOLE does not move the exit code,
  // so a package whose installed `build` was broken printed green).
  // `--report` beside `--out` (issue #1213): the installed build writes the document a dependant reads in place of the sentences.
  const coreBuild = run(bin, ['build', '--rig', 'rig.json', '--motion', 'motion.json', '--out', CORE_OUT, '--profile', 'rig-play', '--pack', '--report', CORE_REPORT], home);
  output += coreBuild.out;
  const coreDir = join(home, CORE_OUT);
  const coreWants = ['skeleton.json', 'skeleton.atlas', 'skeleton.model.json', 'skeleton.png'];
  const coreWrote = coreWants.filter((file) => existsSync(join(coreDir, file)) && statSync(join(coreDir, file)).size > 0);
  const coreBuilt = coreBuild.status === 0 && coreWrote.length === coreWants.length;
  if (!coreBuilt) {
    // The first line it printed on the fault's own line — a plant's report and
    // a log reader see that much — and the next eleven under it.
    const printed = coreBuild.out.trim().split('\n').slice(0, 12);
    fault(
      'core-build',
      `SMOKE_CORE_ENTRY_BUILDS: \`rigc build\` on the core entry exited ${coreBuild.status} and wrote ${coreWrote.length === 0 ? 'nothing' : coreWrote.join(', ')} under ${CORE_OUT}/, printing: ${printed[0] ?? '(nothing)'}` +
        `${printed.slice(1).map((line) => `\n          ${line}`).join('')}\n          exit 0 and ${coreWants.join(', ')} were required`,
    );
  } else {
    notes.push(`the core entry's build wrote ${coreWrote.length} file(s) under ${CORE_OUT}/, ${coreBuild.out.split('\n').filter((line) => /^\s*PASS\s/.test(line)).length} PASS line(s)`);
    // The same rules the round-tripped build is held to below, but the parse:
    // this entry links no spine-core, so A00 has to come back as a SKIP — a
    // PASS would be a parse that did not happen.
    for (const [name, why] of REQUIRED_ASSERTIONS) {
      if (name === 'A00_ROUNDTRIP_PARSE') {
        if (!new RegExp(`^\\s*SKIP\\s+${name}\\b`, 'm').test(coreBuild.out)) fault('core-build', `SMOKE_CORE_ENTRY_BUILDS: the core entry's build printed no SKIP for ${name}, and this entry links none of the runtime that rule is the parse of`);
      } else if (!coreBuild.out.includes(name)) {
        fault('core-build', `SMOKE_CORE_ENTRY_BUILDS: the core entry's build never printed ${name}, which this fixture reaches through ${why}`);
      }
    }
  }
  for (const line of coreBuild.out.split('\n').filter((l) => /^\s*FAIL\s/.test(l))) fault('core-build', `SMOKE_CORE_ENTRY_BUILDS: the core entry's build printed ${line.trim()}`);
  if (coreBuilt) {
    const problems = coreReportProblems(join(home, CORE_REPORT), coreBuild.out);
    if (problems.length > 0) fault('core-build', `SMOKE_CORE_BUILD_WRITES_ITS_REPORT: \`rigc build --report ${CORE_REPORT}\` on the core entry: ${problems.join('; ')}`);
    else notes.push(`the core entry's build wrote ${CORE_REPORT}: ${BUILD_REPORT_SPEC_SEEN}, supplier "model", its gates' summaries the printed ones`);
  }

  // 🔒 Phase two: the runtime installed beside the package, by the version the
  // package declares — and the SAME `rigc` now runs cli.ts and the round trip.
  // The emitted skeleton names that version back, and those two have to be the
  // same fact.
  let coreVersion: string | null = null;
  if (runtimeWanted === null) {
    fault('runtime', `SMOKE_RUNTIME_INSTALLS_BESIDE: the installed package.json declares no ${RUNTIME} devDependency, so there is no version to install beside it`);
  } else {
    const beside =
      spec.installer === 'npm'
        ? run('npm', ['install', `${RUNTIME}@${runtimeWanted}`, '--no-save', '--no-audit', '--no-fund'], home)
        : run('bun', ['add', `${RUNTIME}@${runtimeWanted}`], home);
    output += beside.out;
    if (!existsSync(corePkg)) {
      fault('runtime', `SMOKE_RUNTIME_INSTALLS_BESIDE: ${spec.installer} install of ${RUNTIME}@${runtimeWanted} exited ${beside.status} and left no ${corePkg}. ${beside.out.trim().slice(0, 2000)}`);
    } else {
      coreVersion = (JSON.parse(readFileSync(corePkg, 'utf8')) as { version?: string }).version ?? null;
      notes.push(`${RUNTIME} ${coreVersion ?? '(no version field)'} installed beside it`);
    }
  }
  if (coreVersion !== null) expectVersion('version', 'cli.ts', `entry: cli.ts — ${RUNTIME} ${coreVersion} present`);

  // The build. Every flag is one a stranger would reach for: `--pack` writes a
  // real page PNG and validates the packed atlas as well as the loose one, and
  // `--profile rig-play` runs every rule the package has rather than the
  // twenty-seven the default profile keeps.
  const outDir = join(home, FULL_OUT);
  const build = run(bin, ['build', '--rig', 'rig.json', '--motion', 'motion.json', '--out', FULL_OUT, '--profile', 'rig-play', '--pack'], home);
  output += build.out;
  if (build.status !== 0) {
    fault('build', `SMOKE_BUILD_EXIT_0: \`node_modules/.bin/rigc build\` exited ${build.status}. ${build.out.trim().slice(0, 6000)}`);
  }

  // 🔒 The two entries' builds of the same fixture, from the install (issue
  // #1178): the core entry's promise is "the same flags, the same files, byte
  // for byte; only the gate differs", and `RC29` holds it in a clone. Here it
  // is held on what an install runs. The two `--out` directories are siblings
  // under one install, so a relative path written into either is spelled the
  // same — and the comparison is every file each wrote, not a list kept here.
  // Skipped only when one side already went red for writing nothing, which
  // that side's own fault names; a difference would only restate it.
  if (coreBuilt && build.status === 0) {
    const compared = sameBuild(coreDir, outDir);
    for (const difference of compared.differences) {
      fault('compare', `SMOKE_ENTRIES_BUILD_THE_SAME_BYTES: the core entry's build and the round-tripped build of the same fixture differ — ${difference}`);
    }
    if (compared.differences.length === 0) {
      if (compared.files.length === 0) fault('compare', `SMOKE_ENTRIES_BUILD_THE_SAME_BYTES: ${CORE_OUT}/ and ${FULL_OUT}/ hold no file to compare`);
      else notes.push(`${CORE_OUT}/ and ${FULL_OUT}/ hold the same ${compared.files.length} file(s), byte for byte (${compared.files.map((f) => `${f.file} ${f.bytes}`).join(', ')})`);
    }
  }

  const failLines = build.out.split('\n').filter((line) => /^\s*FAIL\s/.test(line));
  for (const line of failLines) fault('build', `SMOKE_BUILD_ASSERTIONS_PASSED: the build printed ${line.trim()}`);
  const passLines = build.out.split('\n').filter((line) => /^\s*PASS\s/.test(line)).length;
  if (build.status === 0 && passLines === 0) {
    fault('build', 'SMOKE_BUILD_ASSERTIONS_PASSED: the build exited 0 and printed no PASS line at all, so nothing was asserted and a green here means nothing');
  }
  if (build.status === 0) {
    notes.push(`${passLines} assertion(s) passed on the build`);
    for (const [name, why] of REQUIRED_ASSERTIONS) {
      if (!build.out.includes(name)) {
        fault('build', `SMOKE_BUILD_ASSERTIONS_PASSED: the build never printed ${name}, which this fixture reaches through ${why}`);
      }
    }
  }

  // The artifacts. A build that exits 0 and writes nothing is the failure this
  // repository names first — emit only after green, and the file on disk is what
  // outlives the console.
  const skeletonPath = join(outDir, 'skeleton.json');
  for (const file of ['skeleton.json', 'skeleton.atlas', 'skeleton.png']) {
    const path = join(outDir, file);
    if (!existsSync(path) || statSync(path).size === 0) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: ${file} is ${existsSync(path) ? 'empty' : 'missing'} in ${outDir}`);
    }
  }
  if (existsSync(skeletonPath) && statSync(skeletonPath).size > 0) {
    const skeleton = JSON.parse(readFileSync(skeletonPath, 'utf8')) as {
      skeleton?: { spine?: string };
      bones?: unknown[];
      animations?: Record<string, { bones?: Record<string, { rotate?: unknown[] }> }>;
      skins?: Array<{ attachments?: Record<string, Record<string, { type?: string }>> }>;
    };
    const bones = skeleton.bones?.length ?? 0;
    if (bones !== RIG_SPEC.bones.length) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries ${bones} bone(s) and the spec declares ${RIG_SPEC.bones.length}`);
    }
    const rotate = skeleton.animations?.wave?.bones?.arm?.rotate;
    if (!Array.isArray(rotate) || rotate.length === 0) {
      fault('artifacts', 'SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries no rotate timeline for bone "arm" in animation "wave"');
    }
    const meshes = (skeleton.skins ?? []).flatMap((skin) =>
      Object.values(skin.attachments ?? {}).flatMap((slot) => Object.values(slot).filter((att) => att.type === 'mesh')),
    );
    if (meshes.length !== RIG_SPEC.invariants.meshSlots) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries ${meshes.length} mesh attachment(s) and the rig declares ${RIG_SPEC.invariants.meshSlots}`);
    }
    // 🔒 The emitted version against the dependency that was installed, rather
    // than against a number written here: those are the same fact, and a smoke
    // that states its own is checking itself.
    if (coreVersion !== null && skeleton.skeleton?.spine !== coreVersion) {
      fault(
        'artifacts',
        `SMOKE_ARTIFACTS_WRITTEN: skeleton.json says spine "${skeleton.skeleton?.spine ?? '(none)'}" and the installed @esotericsoftware/spine-core is ${coreVersion}`,
      );
    }
  }

  // Read it back with the installed CLI, which is the other half of the claim:
  // the package can validate what somebody else's build wrote.
  const validate = run(bin, ['validate', 'build', '--profile', 'rig-play'], home);
  output += validate.out;
  if (validate.status !== 0) {
    fault('validate', `SMOKE_VALIDATE_READS_BACK: \`node_modules/.bin/rigc validate build\` exited ${validate.status}. ${validate.out.trim().slice(0, 4000)}`);
  }

  // The import surface (issue #859), from the install: every `exports` entry
  // rigc names, the deep paths a dependant was seen importing, and every path
  // the tarball carries. A checkout cannot see any of this — a relative import
  // never reads `exports` — which is why it is here and not in the selftest.
  writeFileSync(
    join(home, 'exports_probe.json'),
    `${JSON.stringify({ named: NAMED_EXPORTS, symbols: OBSERVED_SYMBOLS, runtime: RUNTIME, rig: RIG_SPEC, deep: OBSERVED_DEEP_PATHS, paths: built.paths }, null, 2)}\n`,
  );
  writeFileSync(join(home, 'exports_probe.mjs'), EXPORTS_PROBE_SOURCE);
  const exportsRan = run('bun', [join(home, 'exports_probe.mjs')], home);
  output += exportsRan.out;
  const exportsBad = exportsRan.out.split('\n').filter((line) => line.startsWith('EXPORT_BAD '));
  const exportsCounts = /^EXPORT_COUNTS (.+)$/m.exec(exportsRan.out)?.[1];
  for (const line of exportsBad) {
    fault('exports', `SMOKE_EXPORTS_RESOLVE_FROM_THE_INSTALL: ${line.slice('EXPORT_BAD '.length)}`);
  }
  if (exportsCounts === undefined || (exportsRan.status !== 0 && exportsBad.length === 0)) {
    fault(
      'exports',
      `SMOKE_EXPORTS_RESOLVE_FROM_THE_INSTALL: the import probe exited ${exportsRan.status} without a verdict, so nothing was resolved. ${exportsRan.out.trim().slice(0, 2000)}`,
    );
  } else if (exportsBad.length === 0) {
    notes.push(`exports: ${exportsCounts}`);
    const preflight = /^SEGMENTS_PREFLIGHT (.+)$/m.exec(exportsRan.out)?.[1];
    if (preflight === undefined) fault('exports', 'SMOKE_EXPORTS_RESOLVE_FROM_THE_INSTALL: the segments preflight produced no compiler comparison');
    else notes.push(`segments preflight: ${preflight}`);
  }

  // 🔒 Phase three: the runtime taken away again, and the build rendered and
  // checked by the core entry. `check` is held against the frames `render` just
  // wrote, so it measures that the core entry reads the build and the frames,
  // not how the rig looks.
  //
  // ⚖️ It reads `build/`, the round-tripped build, and not `core-build/`: the
  // comparison above holds the two to the same bytes, so the input is the same
  // either way, and reading the full entry's keeps a broken core build from
  // also reddening render and check — the `refuse-core-build` plant goes red at
  // one step, which is what shows render and check are untouched by it.
  rmSync(runtimeDir, { recursive: true, force: true });
  if (!existsSync(runtimeDir)) {
    expectVersion('version', 'cli_core.ts', `entry: cli_core.ts — ${RUNTIME} absent`);

    // What each observed entry needs installed beside it (issue #1167), read
    // from this install with the runtime gone: RELEASING.md states it beside
    // the entry, and `needsRuntime` in OBSERVED_SYMBOLS is what is checked.
    const bareRan = run('bun', [join(home, 'exports_probe.mjs'), 'without-runtime'], home);
    output += bareRan.out;
    const bareBad = bareRan.out.split('\n').filter((line) => line.startsWith('EXPORT_BAD '));
    const bareCounts = /^EXPORT_COUNTS (.+)$/m.exec(bareRan.out)?.[1];
    for (const line of bareBad) fault('exports-without-runtime', `SMOKE_ENTRIES_STATE_WHAT_THEY_NEED: ${line.slice('EXPORT_BAD '.length)}`);
    if (bareCounts === undefined || (bareRan.status !== 0 && bareBad.length === 0)) {
      fault(
        'exports-without-runtime',
        `SMOKE_ENTRIES_STATE_WHAT_THEY_NEED: the import probe without ${RUNTIME} exited ${bareRan.status} without a verdict. ${bareRan.out.trim().slice(0, 2000)}`,
      );
    } else if (bareBad.length === 0) {
      notes.push(`exports: ${bareCounts}`);
    }
    // MQ45 (issue #1230): the motion comparison from this install, the runtime gone. It reads `build/` for the reason
    // render and check below do — the comparison above holds it to the core entry's bytes, and a broken core build
    // then reddens one step rather than three.
    if (existsSync(join(outDir, 'skeleton.model.json'))) {
      writeFileSync(
        join(home, 'meshcompare_probe.json'),
        `${JSON.stringify({ runtime: RUNTIME, model: `${FULL_OUT}/skeleton.model.json`, plate: 'parts/flag.png', slot: 'flag', attachment: 'flag', animation: 'wave', fps: 12, moved: MESHCOMPARE_MOVED }, null, 2)}\n`,
      );
      writeFileSync(join(home, 'meshcompare_probe.mjs'), MESHCOMPARE_PROBE_SOURCE);
      const compared = run('bun', [join(home, 'meshcompare_probe.mjs')], home);
      output += compared.out;
      const compareBad = compared.out.split('\n').filter((line) => line.startsWith('MESHCOMPARE_BAD '));
      const compareCounts = /^MESHCOMPARE_COUNTS (.+)$/m.exec(compared.out)?.[1];
      for (const line of compareBad) fault(MESHCOMPARE_STEP, `${MESHCOMPARE_CASE}: ${line.slice('MESHCOMPARE_BAD '.length)}`);
      if (compareCounts === undefined || compared.status !== 0) {
        if (compareBad.length === 0) fault(MESHCOMPARE_STEP, `${MESHCOMPARE_CASE}: the comparison probe exited ${compared.status} without a verdict. ${compared.out.trim().slice(0, 2000)}`);
      } else {
        notes.push(`without ${RUNTIME}: ${MESHCOMPARE_CASE} — ${compareCounts}`);
      }
    } else {
      fault(MESHCOMPARE_STEP, `${MESHCOMPARE_CASE}: the full entry wrote no build/skeleton.model.json, so there is no build to compare`);
    }
    // Issue #1275: the poser a runtime-free player links, from this install with the runtime gone — called under Bun,
    // then bundled for a browser and called again from the bundle. Both read `build/` for the reason the comparison does.
    if (existsSync(join(outDir, 'skeleton.model.json'))) {
      writeFileSync(
        join(home, 'core_probe.json'),
        `${JSON.stringify({ runtime: RUNTIME, model: `${FULL_OUT}/skeleton.model.json`, bone: CORE_PROBE_BONE, bones: RIG_SPEC.bones.map((b) => b.name), bundle: `${CORE_BUNDLE_DIR}/${CORE_BUNDLE_FILE}` }, null, 2)}\n`,
      );
      writeFileSync(join(home, 'core_probe.mjs'), CORE_PROBE_SOURCE);
      const read = (ran: Ran): { bad: string[]; matrix: string | undefined; bones: string | undefined } => ({
        bad: ran.out.split('\n').filter((line) => line.startsWith('CORE_BAD ')).map((line) => line.slice('CORE_BAD '.length)),
        matrix: /^CORE_MATRIX (.+)$/m.exec(ran.out)?.[1],
        bones: /^CORE_BONES (.+)$/m.exec(ran.out)?.[1],
      });
      const direct = run('bun', [join(home, 'core_probe.mjs'), 'direct'], home);
      output += direct.out;
      const posed = read(direct);
      for (const line of posed.bad) fault(CORE_POSE_STEP, `${CORE_POSE_CASE}: ${line}`);
      if (direct.status !== 0 || posed.matrix === undefined) {
        if (posed.bad.length === 0) fault(CORE_POSE_STEP, `${CORE_POSE_CASE}: the pose probe exited ${direct.status} without a verdict. ${direct.out.trim().slice(0, 2000)}`);
      } else {
        notes.push(`without ${RUNTIME}: ${CORE_POSE_CASE} — readModel then poseRawSetup through ${NAME}/core posed ${RIG_SPEC.bones.length} bone(s); ${CORE_PROBE_BONE} ${posed.matrix}`);
      }

      // The browser bundle.
      const tool = bundlerOnce();
      const node = onPath('node');
      for (const f of tool.faults) fault(CORE_BROWSER_STEP, f);
      if (node === null) fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: \`node\` is not on PATH, and vite runs on it`);
      if (tool.faults.length === 0 && node !== null) {
        writeFileSync(join(home, 'browser_entry.mjs'), BROWSER_ENTRY_SOURCE);
        writeFileSync(join(home, 'vite.browser.config.mjs'), browserConfigSource());
        const built = run('node', [tool.js, 'build', '--config', 'vite.browser.config.mjs'], home);
        output += built.out;
        const bundle = join(home, CORE_BUNDLE_DIR, CORE_BUNDLE_FILE);
        const refused = built.out.split('\n').find((line) => line.includes(NODE_REFUSAL));
        const externalised = built.out.split('\n').find((line) => /externali[sz]ed for browser compatibility/.test(line));
        if (built.status !== 0 || !existsSync(bundle)) {
          fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: \`vite build\` (vite ${tool.version}, library mode) of ${NAME}/core exited ${built.status} and wrote ${existsSync(bundle) ? '' : 'no '}${CORE_BUNDLE_DIR}/${CORE_BUNDLE_FILE}${refused === undefined ? '' : ` — ${refused.trim().slice(0, 400)}`}. ${refused === undefined ? built.out.trim().slice(0, 1500) : ''}`);
        } else if (externalised !== undefined) {
          fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: vite ${tool.version} externalised a node module out of ${NAME}/core's closure: ${externalised.trim().slice(0, 400)}`);
        } else {
          const text = readFileSync(bundle, 'utf8');
          const nodeStrings = text.split('node:').length - 1;
          const modules = /(\d+) modules transformed/.exec(built.out)?.[1] ?? '?';
          if (nodeStrings !== 0) fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: the bundle ${CORE_BUNDLE_DIR}/${CORE_BUNDLE_FILE} carries the string "node:" ${nodeStrings} time(s), and 0 was required`);
          const ran = run('bun', [join(home, 'core_probe.mjs'), 'bundle'], home);
          output += ran.out;
          const fromBundle = read(ran);
          for (const line of fromBundle.bad) fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: ${line}`);
          if (ran.status !== 0 || fromBundle.bones === undefined) {
            if (fromBundle.bad.length === 0) fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: the bundle's pose probe exited ${ran.status} without a verdict. ${ran.out.trim().slice(0, 2000)}`);
          } else if (posed.bones !== undefined && fromBundle.bones !== posed.bones) {
            fault(CORE_BROWSER_STEP, `${CORE_BROWSER_CASE}: the bundle posed the bones ${fromBundle.bones.slice(0, 600)} and ${NAME}/core imported directly posed ${posed.bones.slice(0, 600)}; the same numbers were required`);
          } else if (nodeStrings === 0) {
            notes.push(
              `without ${RUNTIME}: ${CORE_BROWSER_CASE} — vite ${tool.version} bundled ${NAME}/core for a browser (library mode, ${modules} module(s) transformed, no node builtin resolved) into ${statSync(bundle).size} byte(s) carrying "node:" 0 times; run under Bun with globalThis.document undefined it posed ${CORE_PROBE_BONE} ${fromBundle.matrix ?? ''}, every bone identical to the direct import's`,
            );
          }
        }
      }
    } else {
      fault(CORE_POSE_STEP, `${CORE_POSE_CASE}: the full entry wrote no build/skeleton.model.json, so there is no document to pose`);
    }
    if (existsSync(join(outDir, 'skeleton.model.json'))) {
      const rendered = run(bin, ['render', '--candidate', 'build', '--out', 'frames'], home);
      output += rendered.out;
      if (rendered.status !== 0 || !existsSync(join(home, 'frames', 'frames.json'))) {
        fault('render', `SMOKE_CORE_ENTRY_RENDERS_THE_BUILD: \`rigc render --candidate build\` without ${RUNTIME} exited ${rendered.status} and wrote ${existsSync(join(home, 'frames', 'frames.json')) ? '' : 'no '}frames/frames.json. ${rendered.out.trim().slice(0, 2000)}`);
      } else {
        notes.push(`without ${RUNTIME}: render wrote ${readdirSync(join(home, 'frames')).length} entr(ies) under frames/`);
        const checked = run(bin, ['check', '--candidate', 'build', '--frames', 'frames'], home);
        output += checked.out;
        const poser = checked.out.split('\n').find((line) => /\bposer\b/.test(line))?.trim() ?? '';
        if (checked.status !== 0) {
          fault('check', `SMOKE_CORE_ENTRY_CHECKS_THE_BUILD: \`rigc check --candidate build --frames frames\` without ${RUNTIME} exited ${checked.status}. ${checked.out.trim().slice(0, 2000)}`);
        } else {
          notes.push(`without ${RUNTIME}: check exited 0${poser === '' ? '' : ` (${poser.slice(0, 160)})`}`);
        }
      }
    } else {
      fault('render', 'SMOKE_CORE_ENTRY_RENDERS_THE_BUILD: the full entry wrote no build/skeleton.model.json, so there is no build for the core entry to render');
    }

    // Issues #1457 and #1486: `rigc review` from the install, the runtime gone. The package is not a dependency, so
    // first the refusal — REVIEW_NOT_INSTALLED and its two guidance lines, exit 2, and the project untouched (rigc
    // never installs) — and then the package those lines name, installed the way the first says (no version: the
    // command a reader runs is the one checked), and `rigc review check` over the round-tripped build, which has to
    // exit 0. The name is read off the refusal rather than written here, so a refusal naming the wrong package fails
    // at the install, not in a second copy of the name.
    const manifestBefore = readFileSync(join(home, 'package.json'), 'utf8');
    const refusal = run(bin, ['review', 'check', FULL_OUT], home);
    output += refusal.out;
    // Read off the two streams rather than `out` (see `Ran`): exit 2, nothing on stdout, and the three lines on stderr.
    const named = /^rigc review: REVIEW_NOT_INSTALLED: (\S+) is not installed [^\n]*\nbun add -d (\S+)\nbunx (\S+) (.*)\n$/.exec(refusal.stderr);
    const touched = readFileSync(join(home, 'package.json'), 'utf8') !== manifestBefore;
    if (refusal.status !== 2 || refusal.stdout !== '' || named === null || named[1] !== named[2] || named[1] !== named[3] || named[4] !== `check ${FULL_OUT}` || touched) {
      fault(REVIEW_STEP, `SMOKE_REVIEW_REFUSED_UNTIL_INSTALLED: \`rigc review check ${FULL_OUT}\` with nothing installed beside the package exited ${refusal.status} printing ${JSON.stringify(refusal.stdout.slice(0, 300))} on stdout and ${JSON.stringify(refusal.stderr.slice(0, 600))} on stderr${touched ? ', and changed package.json' : ''}; exit 2, nothing on stdout, package.json unchanged and the lines "rigc review: REVIEW_NOT_INSTALLED: <package> is not installed …", "bun add -d <package>" and "bunx <package> check ${FULL_OUT}" on stderr were required`);
    } else {
      const reviewPackage = named[1];
      const added = spec.installer === 'npm' ? run('npm', ['install', '-D', reviewPackage, '--no-audit', '--no-fund'], home) : run('bun', ['add', '-d', reviewPackage], home);
      output += added.out;
      const reviewManifest = join(home, 'node_modules', ...reviewPackage.split('/'), 'package.json');
      if (!existsSync(reviewManifest)) {
        fault(REVIEW_STEP, `SMOKE_REVIEW_CHECKS_THE_BUILD: ${spec.installer === 'npm' ? 'npm i -D' : 'bun add -d'} ${reviewPackage} exited ${added.status} and left no ${reviewManifest}. ${added.out.trim().slice(0, 2000)}`);
      } else {
        const reviewRead = JSON.parse(readFileSync(reviewManifest, 'utf8')) as { version?: string; engines?: { bun?: unknown } };
        const reviewVersion = reviewRead.version ?? '(no version field)';
        // The floor the installed review declares (issue #1486), compared here on its own rather than through the
        // launcher's code: under a Bun below it — the declared-minimum job — the launcher's refusal is the run.
        const floor = typeof reviewRead.engines?.bun === 'string' ? /^\s*>=\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(reviewRead.engines.bun) : null;
        const running = (/^(\d+)\.(\d+)\.(\d+)/.exec(String(process.versions.bun)) ?? []).slice(1, 4).map(Number);
        const below = floor !== null && running.length === 3 && ((): boolean => {
          for (let i = 0; i < 3; i++) if (running[i] !== Number(floor[i + 1])) return running[i] < Number(floor[i + 1]);
          return false;
        })();
        const checked = run(bin, ['review', 'check', FULL_OUT], home);
        output += checked.out;
        const tooOld = `rigc review: REVIEW_BUN_TOO_OLD: Bun ${String(process.versions.bun)}, ${reviewPackage} needs ${String(reviewRead.engines?.bun)}\n`;
        if (below) {
          if (checked.status !== 2 || checked.stdout !== '' || checked.stderr !== tooOld) {
            fault(REVIEW_STEP, `SMOKE_REVIEW_CHECKS_THE_BUILD: \`rigc review check ${FULL_OUT}\` under Bun ${String(process.versions.bun)}, below the ${String(reviewRead.engines?.bun)} ${reviewPackage} ${reviewVersion} declares, exited ${checked.status} printing ${JSON.stringify(checked.stdout.slice(0, 300))} on stdout and ${JSON.stringify(checked.stderr.slice(0, 600))} on stderr; exit 2, nothing on stdout and ${JSON.stringify(tooOld)} were required`);
          } else {
            notes.push(`without ${RUNTIME}: rigc review refused by name until ${reviewPackage} was installed, then refused REVIEW_BUN_TOO_OLD under Bun ${String(process.versions.bun)} (${reviewPackage} ${reviewVersion} needs ${String(reviewRead.engines?.bun)})`);
          }
        } else if (checked.status !== 0) {
          fault(REVIEW_STEP, `SMOKE_REVIEW_CHECKS_THE_BUILD: \`rigc review check ${FULL_OUT}\` with ${reviewPackage} ${reviewVersion} installed beside the package exited ${checked.status}, and 0 was required. ${checked.out.trim().slice(0, 2000)}`);
        } else {
          notes.push(`without ${RUNTIME}: rigc review refused by name until ${reviewPackage} was installed, then \`review check ${FULL_OUT}\` through ${reviewPackage} ${reviewVersion} exited 0 (${checked.out.trim().split('\n').join(' / ').slice(0, 240)})`);
        }
      }
    }
  }

  // The skills, the way an agent host needs them (issue #831): the INSTALLED
  // package links its own `skills/` into a directory of this install — one with a
  // space in it, so a link that was not relative-and-quoted-safe would show —
  // and the entry skill is read back through the link. A checkout cannot see
  // this: the command finds the skills from where it is installed, and a tree
  // always has them.
  const skillsDir = join(home, 'agent skills');
  const skills = run(bin, ['skills', 'install', '--dir', skillsDir], home);
  output += skills.out;
  const entryLink = join(skillsDir, 'rigc');
  const shippedEntry = join(pkgRoot, 'skills', 'rigc', 'SKILL.md');
  if (skills.status !== 0) {
    fault('skills', `SMOKE_SKILLS_INSTALL_FROM_THE_PACKAGE: \`node_modules/.bin/rigc skills install --dir <tmp>\` exited ${skills.status}, so the package's skills/ directory did not reach a host directory. ${skills.out.trim().slice(0, 2000)}`);
  } else if (!existsSync(join(entryLink, 'SKILL.md')) || !lstatSync(entryLink).isSymbolicLink()) {
    fault('skills', `SMOKE_SKILLS_INSTALL_FROM_THE_PACKAGE: skills install exited 0 and ${entryLink} is ${existsSync(entryLink) ? 'not a link' : 'not there'}, so rigc/SKILL.md cannot be read through one`);
  } else if (isAbsolute(readlinkSync(entryLink)) || realpathSync(entryLink) !== realpathSync(dirname(shippedEntry))) {
    fault('skills', `SMOKE_SKILLS_INSTALL_FROM_THE_PACKAGE: ${entryLink} links to ${readlinkSync(entryLink)}, and a relative link to ${dirname(shippedEntry)} was required`);
  } else if (!readFileSync(join(entryLink, 'SKILL.md')).equals(readFileSync(shippedEntry))) {
    fault('skills', `SMOKE_SKILLS_INSTALL_FROM_THE_PACKAGE: rigc/SKILL.md read through ${entryLink} is not the bytes of ${shippedEntry}`);
  } else {
    notes.push(`skills install linked ${readdirSync(skillsDir).length} skill(s) from the install; rigc/SKILL.md read through ${readlinkSync(entryLink)}`);
  }

  // The shim's own promise, measured rather than assumed: with bun off PATH the
  // `bin` entry has to say so in one sentence instead of dying as `env: bun: No
  // such file or directory`.
  const bunPath = onPath('bun');
  if (bunPath === null) {
    notes.push('SKIP the without-bun control: bun is not on PATH in this run, which is the state it is about');
  } else {
    // EVERY directory on PATH that holds a bun, not only the first: with a
    // version under test put in front of the machine's own — which is how the
    // declared minimum is measured by hand (issue #1214) — removing the first
    // leaves the second, the shim finds it, and the control goes red on every
    // case for a bun that was never absent.
    // Windows spells the variable `Path`, and a second key spelled `PATH`
    // beside it leaves which one the child reads to the order of the two.
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
    const parts = (process.env[pathKey] ?? '').split(delimiter);
    const bunDirs = [...new Set([dirname(bunPath), ...parts.filter((part) => part !== '' && existsSync(join(part, BUN_BINARY)))])];
    const bunDir = bunDirs.join(delimiter);
    const stripped = parts.filter((part) => !bunDirs.includes(part));
    const nodePath = onPath('node');
    if (nodePath !== null && bunDirs.includes(dirname(nodePath))) {
      notes.push(`SKIP the without-bun control: node and bun share ${dirname(nodePath)}, so removing it would remove the shim's own interpreter`);
    } else {
      const withoutBun = run(bin, ['--version'], home, { ...process.env, [pathKey]: stripped.join(delimiter) });
      if (withoutBun.status === 0 || !/runs on Bun/.test(withoutBun.out)) {
        fault(
          'shim',
          `SMOKE_SHIM_NAMES_BUN_WHEN_BUN_IS_ABSENT: with ${bunDir} off PATH the shim exited ${withoutBun.status} saying ${JSON.stringify(withoutBun.out.trim().slice(0, 400))}; a non-zero exit naming Bun was required`,
        );
      } else {
        notes.push('with bun off PATH the shim names Bun and stops');
      }
    }
  }

  if (!keep) rmSync(home, { recursive: true, force: true });
  return { name: spec.name, faults, steps, notes, output };
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

const HELP = `rigc install smoke — does the published package build a rig in an empty directory?

usage:
  bun run smoke                          every case below, on a tarball packed from this tree
  bun run smoke -- --case clean          one case by name
  bun run smoke -- --source registry --version 0.21.0
  bun run smoke -- --source registry --version 0.21.0 --wait 15
  bun run smoke -- --source registry --version 2.39.0 --alias spine-rigc --alias @rig-c/core
  bun run smoke -- --installer bun       install the tarball with \`bun add\` instead of \`npm install\`
  bun run smoke -- --keep                leave the install directories where they are

--wait <minutes> is for \`--source registry\` and nothing else: a publish returns
before the registry serves what it published, so this is how long to keep asking
before giving up. Default ${DEFAULT_WAIT_MINUTES}; \`--wait 0\` asks once and does not sleep.

--alias <name> is for \`--source registry\` too, and is given once per alias: after
the cases, the same version under each other name the package is published as is
fetched — within what is left of --wait, asked at least once — and its unpacked
files are held to the ones the cases installed, byte for byte but for the name
line of package.json. Each alias is read on its own line, so one that differs or
has not arrived is named while the others still pass. The aliases are compared,
not installed: identical files are the stronger claim, and they take seconds.

exit codes:
  0  every case passed
  1  a case went red — against \`--source registry\`, the published artifact does not build —
     or an --alias tarball carries other files or other bytes than the package's
  2  no case ran, so this run measured nothing
  3  the registry did not serve the version — its packument, or the tarball behind it, under
     the name or under --alias — within --wait, so the confirmation was NOT taken; nothing
     here says the package is broken

cases:
  clean          a correct package installs WITHOUT spine-core and its rigc runs the core entry, whose build has to exit 0 and write its files; with spine-core installed beside it the same rigc builds through the round trip, writing the same bytes as the core entry's build of the same fixture, resolves every \`exports\` entry and every shipped path, reads every observed symbol through its entry and calls the ones a dependant was seen calling; with spine-core taken away again it imports every observed entry as stated, compares meshes of that build through ${NAME}/meshcompare, poses its setup pose through ${NAME}/core and through a vite browser bundle of that entry holding no node module, renders and checks that build, refuses \`rigc review\` by name (REVIEW_NOT_INSTALLED, the project untouched) until the review package that refusal names is installed and then runs \`rigc review check\` on that build, links its skills, and the bin shim names Bun when bun is absent
  unusual-path   the same, installed at an absolute path with spaces and non-ASCII in it
  drop-plate     tools/plate.ts out of \`files\`  — the smoke has to go RED naming it
  drop-src-module  src/validate.ts out of the packed tree — the smoke has to go RED naming it
  add-dependency   @esotericsoftware/spine-core put back in \`dependencies\` — the install has to go RED naming it
  drop-core-entry  cli_core.ts out of \`files\` — the install's \`rigc --version\` has to go RED naming it
  drop-skills      \`skills\` out of \`files\` — \`rigc skills install\` has to go RED naming it
  drop-exports     \`exports\` out of package.json — importing ${NAME}/plate has to go RED naming it
  drop-deep-exports  \`exports\` cut to its named entries — the deep path ${NAME}/tools/plate.ts has to go RED naming it
  drop-named-entry   ${DROPPED_ENTRIES['drop-named-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-named-entry'].slice(1)} has to go RED naming it
  drop-rig-entry     ${DROPPED_ENTRIES['drop-rig-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-rig-entry'].slice(1)} has to go RED naming it, with the runtime and without it, and nothing else
  drop-mesh-entry    ${DROPPED_ENTRIES['drop-mesh-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-mesh-entry'].slice(1)} has to go RED naming it, with the runtime and without it, and nothing else
  drop-errors-entry  ${DROPPED_ENTRIES['drop-errors-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-errors-entry'].slice(1)} has to go RED naming it, with the runtime and without it, and nothing else
  drop-meshcompare-entry  ${DROPPED_ENTRIES['drop-meshcompare-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-meshcompare-entry'].slice(1)} and the comparison from the install have to go RED naming it, and nothing else
  drop-core-named-entry  ${DROPPED_ENTRIES['drop-core-named-entry']} out of \`exports\` — importing ${NAME}${DROPPED_ENTRIES['drop-core-named-entry'].slice(1)}, the pose from the install and the browser bundle have to go RED naming it, and nothing else
  import-node-in-core    an import of node:fs at the top of the packed ${NODE_PLANT_MODULE} — the browser bundle, and only it, has to go RED naming the module
  rename-symbol      ${RENAME_PLANT.symbol} exported under another name — the symbol read through ${NAME}${RENAME_PLANT.entry.slice(1)} has to go RED naming both
  fork-compile-error ${FORK_ERROR_MODULE} given a CompileError of its own — the parser's refusal, caught by the class ${NAME}/errors exports, has to go RED alone naming both
  refuse-core-build  the core entry's build body made to refuse — the core-build step, and only it, has to go RED naming SMOKE_CORE_ENTRY_BUILDS
  move-core-byte     one byte appended to the atlas the core entry's build wrote — the comparison, and only it, has to go RED naming the file

A plant case is green when the smoke failed the way the plant says it must, and
red when the smoke passed anyway. Nothing is written inside the repository.
`;

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const flag = (name: string): string | null => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 || at === argv.length - 1 ? null : argv[at + 1];
  };
  const keep = argv.includes('--keep');
  const only = flag('case');
  const installer = flag('installer') === 'bun' ? 'bun' : 'npm';
  const sourceKind = flag('source') === 'registry' ? 'registry' : 'tree';
  const version = flag('version');
  const pkgVersion = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string }).version ?? '';
  const wanted = version ?? pkgVersion;
  const registrySpec = sourceKind === 'registry' ? `${NAME}@${wanted}` : null;

  // A flag that quietly does nothing is worse than one that is refused: a
  // `--wait` on a tarball this tree packs would read as a wait that was taken.
  const waitFlag = flag('wait');
  const waitMinutes = waitFlag === null ? DEFAULT_WAIT_MINUTES : Number(waitFlag);
  if (waitFlag !== null && sourceKind !== 'registry') {
    console.log(
      '  FAIL  SMOKE_WAIT_IS_MINUTES_ON_THE_REGISTRY_PATH: --wait is for `--source registry`. A tarball packed from ' +
        'this tree is on disk the moment `npm pack` returns, so there is nothing here to wait for',
    );
    return EXIT_RED;
  }
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0) {
    console.log(`  FAIL  SMOKE_WAIT_IS_MINUTES_ON_THE_REGISTRY_PATH: --wait ${JSON.stringify(waitFlag)} is not a number of minutes`);
    return EXIT_RED;
  }
  // The same rule for the aliases: there is no second name to compare against
  // in a tarball this tree packs, so a run that was given one and read none
  // would print a confirmation nobody took.
  //
  // ⚖️ `--alias` is repeated, once per name, rather than one flag holding a
  // list (issue #1347). Every other flag here is `--name value`, read by the
  // same index walk, and a repeated flag keeps that shape: each alias stays
  // the one token after its own `--alias`, which is how release.yml's calls
  // are read back by CUR122 and how the by-hand line below is spelled, and a
  // call written before the second alias existed still means what it meant.
  const aliases: string[] = [];
  for (let at = argv.indexOf('--alias'); at !== -1; at = argv.indexOf('--alias', at + 1)) {
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('--')) {
      console.log('  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: --alias needs another name the package is published as');
      return EXIT_RED;
    }
    aliases.push(value);
  }
  if (aliases.length > 0 && sourceKind !== 'registry') {
    console.log(
      '  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: --alias is for `--source registry`. A tarball this tree packs ' +
        `carries one name, ${NAME}, so there is no second tarball here to hold to it`,
    );
    return EXIT_RED;
  }
  for (const alias of aliases) {
    if (alias === NAME) {
      console.log(`  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: --alias ${alias} is the name this tree publishes, not a second one`);
      return EXIT_RED;
    }
    if (aliases.indexOf(alias) !== aliases.lastIndexOf(alias)) {
      console.log(`  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: --alias ${alias} is given twice, so one of the names it was meant to confirm was not given at all`);
      return EXIT_RED;
    }
  }

  console.log(`rigc install smoke — ${registrySpec === null ? `a tarball packed from ${ROOT}` : `${registrySpec} from the registry`}, installed with ${installer}`);

  for (const tool of ['npm', 'bun', 'tar']) {
    if (onPath(tool) === null) {
      console.log(`  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: \`${tool}\` is not on PATH, and this smoke installs and runs a package that needs it`);
      return EXIT_RED;
    }
  }

  // ⏳ The first of the two outcomes issue #563 separates. A version the
  // registry has not finished processing is not a package that fails to build,
  // and the two must not end in the same red — so this returns its own exit
  // code, names what was not taken, and says how to take it later.
  let served: RegistryWait | null = null;
  let source: Source = { kind: 'tree' };
  const waitStarted = Date.now();
  let fetchDir = '';
  const byHand = `bun run smoke -- --source registry --version ${wanted} --case clean${aliases.map((alias) => ` --alias ${alias}`).join('')}`;
  if (registrySpec !== null) {
    fetchDir = realpathSync.native(mkdtempSync(join(tmpdir(), 'rigc-smoke-fetch-')));
    LEFT_BEHIND.push(fetchDir);
    served = waitForRegistry(registrySpec, waitMinutes, ROOT, join(fetchDir, 'pack'));
    if (!served.served) {
      // Which piece never came, in the sentence that carries the exit code:
      // metadata with no bytes behind it is a version still arriving, and the
      // #833 run printed it as an artifact that does not build.
      const never =
        served.missing === 'tarball' && served.packument !== null
          ? `its packument answered on attempt ${served.packument.attempt} (${elapsedText(served.packument.ms)}) and its ` +
            `tarball (${served.tarballUrl || 'no dist.tarball named'}) never did`
          : 'its packument never answered';
      console.log(
        `  FAIL  SMOKE_REGISTRY_SERVED_THE_VERSION: the registry did not serve ${registrySpec} within ${waitMinutes} min ` +
          `(${served.attempts} attempt(s), ${elapsedText(served.ms)}) — ${never} — the confirmation was NOT taken, and nothing here ` +
          'says the package is broken. npm\'s own notice on publish is "Your package is being processed and may take a ' +
          'few minutes to become available". Re-run the confirmation (Actions -> release -> Run workflow, version ' +
          `${wanted}) or take it by hand once the registry answers: ${byHand}` +
          (served.last === '' ? '' : `. The last thing npm said was: ${served.last}`),
      );
      console.log(`rigc install smoke: the registry did not serve ${registrySpec} — confirmation NOT taken`);
      return EXIT_NOT_SERVED;
    }
    const metadata = served.packument === null ? '' : ` — the packument on attempt ${served.packument.attempt} (${elapsedText(served.packument.ms)}), the tarball on attempt ${served.attempts}`;
    console.log(
      `  the registry served ${registrySpec} on attempt ${served.attempts}, ${elapsedText(served.ms)} after this run ` +
        `started asking${metadata}`,
    );
    source = { kind: 'registry', spec: registrySpec, tgz: served.tgz };
  }

  const battery: CaseSpec[] = [
    { name: 'clean', source, installer, plant: 'none', dirName: 'empty' },
    // The negative control the card asks for: a CORRECT package at a path
    // nothing in the tree has ever seen, so a pass here is not a pass about
    // this machine's tidy temp directory.
    { name: 'unusual-path', source, installer, plant: 'none', dirName: 'install smoke ünïcode 한글' },
    { name: 'drop-plate', source, installer, plant: 'drop-plate', dirName: 'planted-plate' },
    { name: 'drop-src-module', source, installer, plant: 'drop-src-module', dirName: 'planted-src' },
    { name: 'add-dependency', source, installer, plant: 'add-dependency', dirName: 'planted-dep' },
    { name: 'drop-core-entry', source, installer, plant: 'drop-core-entry', dirName: 'planted-core-entry' },
    { name: 'drop-skills', source, installer, plant: 'drop-skills', dirName: 'planted-skills' },
    { name: 'drop-exports', source, installer, plant: 'drop-exports', dirName: 'planted-exports' },
    { name: 'drop-deep-exports', source, installer, plant: 'drop-deep-exports', dirName: 'planted-deep-exports' },
    { name: 'drop-named-entry', source, installer, plant: 'drop-named-entry', dirName: 'planted-named-entry' },
    { name: 'drop-rig-entry', source, installer, plant: 'drop-rig-entry', dirName: 'planted-rig-entry' },
    { name: 'drop-mesh-entry', source, installer, plant: 'drop-mesh-entry', dirName: 'planted-mesh-entry' },
    { name: 'drop-errors-entry', source, installer, plant: 'drop-errors-entry', dirName: 'planted-errors-entry' },
    { name: 'drop-meshcompare-entry', source, installer, plant: 'drop-meshcompare-entry', dirName: 'planted-meshcompare-entry' },
    { name: 'drop-core-named-entry', source, installer, plant: 'drop-core-named-entry', dirName: 'planted-core-named-entry' },
    { name: 'import-node-in-core', source, installer, plant: 'import-node-in-core', dirName: 'planted-node-in-core' },
    { name: 'rename-symbol', source, installer, plant: 'rename-symbol', dirName: 'planted-rename' },
    { name: 'fork-compile-error', source, installer, plant: 'fork-compile-error', dirName: 'planted-fork-error' },
    { name: 'refuse-core-build', source, installer, plant: 'refuse-core-build', dirName: 'planted-core-build' },
    { name: 'move-core-byte', source, installer, plant: 'move-core-byte', dirName: 'planted-core-byte' },
  ];
  const chosen = only === null ? battery : battery.filter((c) => c.name === only);
  if (chosen.length === 0) {
    console.log(`  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: no case is named "${only}" — ${battery.map((c) => c.name).join(', ')}`);
    return EXIT_RED;
  }

  let bad = 0;
  let ran = 0;
  for (const spec of chosen) {
    // The long name from the start (see `home` in runCase), so every path a
    // fault prints is the one a child process would print back.
    const work = realpathSync.native(mkdtempSync(join(tmpdir(), 'rigc-smoke-')));
    try {
      const result = runCase(spec, work, keep);
      ran += 1;
      const planted = spec.plant === 'none' ? null : PLANTED[spec.plant];
      if (planted === null) {
        if (result.faults.length === 0) {
          console.log(`  PASS  SMOKE_CASE[${spec.name}]  ${result.notes.join('; ')}`);
        } else {
          bad += 1;
          console.log(`  FAIL  SMOKE_CASE[${spec.name}]`);
          for (const f of result.faults) console.log(`          ${f}`);
        }
      } else {
        // 🌱 Inverted: the plant is green when the smoke went red where it said
        // it would, naming what went missing.
        const missed: string[] = [];
        if (result.faults.length === 0) missed.push('the smoke passed on a package the plant broke');
        for (const step of planted.steps) {
          if (!result.steps.includes(step)) missed.push(`no fault came from the ${step} step, where this plant has to bite`);
        }
        if (planted.alone === true) {
          const elsewhere = [...new Set(result.steps.filter((step) => !planted.steps.includes(step)))];
          if (elsewhere.length > 0) missed.push(`the ${elsewhere.join(', ')} step(s) went red as well, and this plant breaks only ${planted.steps.join(', ')}: ${result.faults.find((_, i) => elsewhere.includes(result.steps[i]))?.split('\n')[0].slice(0, 300) ?? ''}`);
        }
        const said = `${result.faults.join('\n')}\n${result.output}`;
        for (const name of planted.names) {
          if (!said.includes(name)) missed.push(`nothing in the run named ${name}, so the failure does not say what is missing`);
        }
        if (missed.length === 0) {
          console.log(`  PASS  SMOKE_PLANT[${spec.name}]  ${planted.what}`);
          for (const note of result.notes) console.log(`          ${note}`);
          for (const f of result.faults.slice(0, 2)) console.log(`          red: ${f.split('\n')[0].slice(0, 300)}`);
        } else {
          bad += 1;
          console.log(`  FAIL  SMOKE_PLANT[${spec.name}]`);
          for (const m of missed) console.log(`          ${m}`);
        }
      }
    } finally {
      if (!keep) rmSync(work, { recursive: true, force: true });
      else console.log(`          kept: ${work}`);
    }
  }

  // 🚨 The floor. A run that installed nothing and printed a tidy summary is the
  // shape of false green this whole repository is written against.
  if (ran === 0) {
    console.log('  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: no case ran, so this run measured nothing');
    return EXIT_NOTHING_RAN;
  }
  // 🪞 The aliases (issues #1258, #1347): the same version under each of the
  // package's other names, fetched after the cases so it has had their minutes
  // to arrive, and held to the tarball the cases installed. A difference is a
  // fault of what was published, exit 1 like a red case; an alias the registry
  // has not served yet is a confirmation not taken, exit 3 — but only when
  // nothing above went red, because a red case is a fact and a late alias is
  // not. Each alias is read on its own, in the order given, within what is
  // left of the one wait, and each prints its own line.
  const redAliases: string[] = [];
  const lateAliases: string[] = [];
  const sameAliases: string[] = [];
  const fetched = served;
  for (const [index, alias] of aliases.entries()) {
    if (fetched === null) break;
    const aliasSpec = `${alias}@${wanted}`;
    const left = Math.max(0, waitMinutes - (Date.now() - waitStarted) / 60_000);
    const got = waitForRegistry(aliasSpec, left, ROOT, join(fetchDir, `alias-${index}`));
    if (!got.served) {
      lateAliases.push(alias);
      console.log(
        `  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: the registry did not serve ${aliasSpec} within what was left of the ` +
          `${waitMinutes} min wait (${got.attempts} attempt(s), ${elapsedText(got.ms)}; ` +
          `${got.packument === null ? 'its packument never answered' : 'its packument answered and its tarball never did'}) — ` +
          `the alias's confirmation was NOT taken, and nothing here says it differs. Take it by hand once the registry answers: ${byHand}` +
          (got.last === '' ? '' : `. The last thing npm said was: ${got.last}`),
      );
    } else {
      try {
        const reading = compareTarballs(fetched.tgz, got.tgz);
        if (reading.faults.length === 0) {
          sameAliases.push(alias);
          console.log(
            `  PASS  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: the registry served ${aliasSpec} and its ${reading.files} file(s) are ` +
              `${registrySpec}'s, byte for byte but for the name line of package.json`,
          );
        } else {
          redAliases.push(alias);
          console.log(`  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: the registry served ${aliasSpec} and it is not ${registrySpec} under another name:`);
          for (const fault of reading.faults) console.log(`          ${fault}`);
        }
      } catch (error) {
        if (!(error instanceof AliasTarballError)) throw error;
        redAliases.push(alias);
        console.log(`  FAIL  SMOKE_ALIAS_CARRIES_THE_SAME_FILES: the registry served ${aliasSpec} and it could not be read as a package: ${error.message}`);
      }
    }
  }

  const aliasRed = redAliases.length > 0;
  const aliasLate = lateAliases.length > 0;
  const aliasNote = [
    ...redAliases.map((alias) => `; the alias ${alias} differs`),
    ...lateAliases.map((alias) => `; the alias ${alias} was NOT confirmed`),
    ...sameAliases.map((alias) => `; the alias ${alias} carries the same files`),
  ].join('');
  console.log(
    bad === 0 && !aliasRed && !aliasLate ? `rigc install smoke: green — ${ran} case(s)${aliasNote}` : `rigc install smoke: ${bad} of ${ran} case(s) failed${aliasNote}`,
  );
  if (bad === 0 && !aliasRed && !aliasLate) return EXIT_GREEN;
  if (bad === 0 && !aliasRed) return EXIT_NOT_SERVED;
  if (bad === 0) return EXIT_RED;
  // 🚨 The second of the two outcomes, said out loud. Reaching here on a
  // registry source means the wait above ENDED — the registry handed over this
  // version's bytes — so what went red went red on the artifact people receive, and
  // calling that a propagation delay would be the #563 defect pointed the other
  // way.
  if (served !== null) {
    console.log(
      `the published artifact does not build: the registry served ${registrySpec} ${elapsedText(served.ms)} after this ` +
        `run started asking, and ${bad} of ${ran} case(s) above went red on it. ` +
        'This is a fault in what was published, not a wait that was too short',
    );
  }
  return EXIT_RED;
}

/** Directories this run made outside any case — the registry wait's tarball — removed after `main` unless `--keep`. */
const LEFT_BEHIND: string[] = [];

const code = main();
for (const dir of LEFT_BEHIND) {
  if (process.argv.includes('--keep')) console.log(`          kept: ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
