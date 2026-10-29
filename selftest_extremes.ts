/** Closed controls for #1632. Runs on the render pool, standalone or through selftest's tally. */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, cpSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Plate, readPlate } from './tools/plate.ts';
import { extremesOf, extremesPlate, extremesText, extremesRefusal, premultipliedDiff, ExtremesError, type ExtremesReading } from './src/extremes.ts';
import { localChannels, deformChannels, identifyAttachment } from './src/render_channels.ts';
import { sampleAll, sampleSetupPose, framingViewport, renderFrame, BACKGROUND, type Frame, type Viewport, type Piece, spinePoser, loadPosable } from './src/render.ts';
import { corePoser } from './src/render_core.ts';
import { galleryRecipes, runRecipe } from './tools/emit_hashes.ts';
import { overlapFixture, OVERLAP_PLATE } from './fixtures/public.ts';

const ROOT = import.meta.dir;
const hash = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
type Say = (name: string, ok: boolean, detail: string, why: string) => number;

export function runExtremesSuite(report?: Say): number {
  console.log('\n── extremes: original geometry pairs, independent channels and native diffs (issue #1632) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string): void => {
    bad += report ? report(name, ok, detail, 'An extreme picture must be an observable, reproducible reading on the frame grid') : (console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`), ok ? 0 : 1);
  };
  const work = mkdtempSync(join(tmpdir(), 'rigc-extremes-'));
  const evidence = process.env.RIGC_EXTREMES_EVIDENCE;
  if (evidence !== undefined) mkdirSync(evidence, { recursive: true });
  const commands: Array<{ args: string[]; exit: number | null; stdout: string; stderr: string }> = [];
  const source = {}, stillSource = {};
  const frame = (index: number, x: number, value = x): Frame => ({ index, time: index / 12, pieces: [], attachments: [identifyAttachment({ slot: 'part', attachment: 'part', vertices: [x, 0, x + 2, 0], color: [1, 1, 1, 1] as [number, number, number, number] }, source)], channels: [{ path: ['bone', 'part', 'translate.x'], value }] });
  const grid = [frame(0, 0, 5), frame(1, 4, -1), frame(2, -3, 9), frame(3, 4, 9)];
  const read = extremesOf('swing', 12, grid);
  say('EX01_FARTHEST_CORRESPONDING_VERTICES_AND_CHANNELS_ARE_DISTINCT', read.geometryPair?.frames[0].index === 1 && read.geometryPair.frames[1].index === 2 && read.geometryPair.maxVertexDistance === 7 && read.channels[0].min.index === 1 && read.channels[0].max.index === 2, extremesText(read).slice(-600));
  say('EX02_STILL_AND_SINGLE_FRAME_SKIP_WITHOUT_PAIR', extremesOf('still', 12, [frame(0, 0), frame(1, 0)]).status === 'SKIP' && extremesOf(null, 12, [frame(0, 0)]).geometryPair === null, 'no fabricated pair');
  const edge = extremesOf('two', 12, grid.slice(0, 2));
  say('EX03_TWO_FRAMES_AND_EXACT_TIMESTAMPS', edge.geometryPair?.frames[1].index === 1 && edge.geometryPair.frames[1].time === 1 / 12, 'two frames: sole pair at copied timestamps');
  const tied = extremesOf('ties', 12, [frame(0, 0), frame(1, 4), frame(2, 0), frame(3, 4)]);
  say('EX04_EARLIEST_PAIR_AND_CHANNEL_TIES', tied.geometryPair?.frames[0].index === 0 && tied.geometryPair.frames[1].index === 1 && tied.channels[0].max.index === 1, 'earliest ordered pair; earliest channel sample');
  const changed = frame(1, 1); changed.attachments![0].attachment = 'other';
  const switchedReading = extremesOf('switch', 12, [frame(0, 0), changed]);
  const refused = switchedReading.reason;
  say('EX05_SWITCHED_ATTACHMENT_IS_NAMED_AND_OBSERVATION_SKIPS', refused.includes('identity') && switchedReading.status === 'SKIP' && switchedReading.channelStatus === 'READ' && switchedReading.channels.length === 1, refused);
  const missing = { ...frame(1, 0), attachments: [] };
  const absent = extremesOf('missing', 12, [frame(0, 0), missing]).status === 'SKIP';
  const topology = frame(1, 1); topology.attachments![0].vertices.push(3, 4);
  const count = extremesOf('topology', 12, [frame(0, 0), topology]).status === 'SKIP';
  say('EX06_ABSENT_GEOMETRY_AND_CHANGED_VERTEX_COUNT_REFUSED', absent && count, 'no unrelated indices compared');
  const unknown = frame(1, 1); unknown.attachments = unknown.attachments!.map((a) => ({ ...a }));
  const unknownReason = extremesOf('unknown', 12, [frame(0, 0), unknown]).reason;
  say('EX06B_ORIGINAL_SOURCE_IDENTITY_UNAVAILABLE_IS_NAMED', unknownReason.includes('source identity unavailable'), unknownReason);
  const clipped = grid.map((f) => ({ ...f, pieces: [] }));
  say('EX07_CLIPPED_DRAW_PIECES_DO_NOT_SUPPLY_CORRESPONDENCE', extremesOf('clip', 12, clipped).geometryPair?.maxVertexDistance === 7, 'empty/clipped draw output still reads original attachment vertices');
  const other = grid.map((f) => ({ ...f, attachments: [...f.attachments!, identifyAttachment({ ...f.attachments![0], slot: 'still', attachment: 'still', vertices: [0, 0] }, stillSource)] }));
  say('EX08_SLOT_AND_HIDE_FILTER_ORIGINAL_GEOMETRY_EXPLICITLY', extremesOf('slot', 12, other, { slots: ['still'] }).status === 'SKIP' && extremesOf('hide', 12, other, { hidden: ['part'] }).status === 'SKIP', 'excluded moving original vertices cannot choose a pair');
  const scalars = localChannels([{ name: 'local', x: -3, y: 8, scaleX: -2, scaleY: 0.5, shearX: 19, shearY: -7, rotation: 4 }], [{ name: 'dial', time: 0.25 }]);
  say('EX08B_SIGNED_COMPONENTS_AND_MAPPED_TIME_ARE_READ_WITHOUT_WORLD_DECOMPOSITION', scalars.length === 8 && scalars.some((c) => c.path[2] === 'scale.x' && c.value === -2) && scalars.some((c) => c.path[0] === 'slider' && c.value === 0.25), JSON.stringify(scalars));
  const deform = deformChannels('s', 'mesh', [5, -2, 8, 3], [2, -3, 6, 7], source);
  const deformFrames = grid.slice(0, 2).map((f, i) => ({ ...f, channels: deform.map((v, c) => identifyAttachment({ ...v, value: i ? v.value : [7, -4, 0, 2][c] }, source)) }));
  const deformRead = extremesOf('deform', 12, deformFrames);
  say('EX08C_DEFORM_COORDINATES_EXTREMIZED_INDEPENDENTLY', deformRead.channels.length === 4 && deformRead.channels[0].min.value === 3 && deformRead.channels[0].max.value === 7 && deformRead.channels[1].min.value === -4 && deformRead.channels[1].max.value === 1, JSON.stringify(deformRead.channels));
  const channelFrames = grid.slice(0, 2).map((f, i) => ({ ...f, channels: [
    { path: ['bone', 'part', 'rotate'], value: i ? 9 : -2 },
    identifyAttachment({ path: ['deform', 'same-slot', 'same-name', '0'], value: i }, i ? stillSource : source),
  ] }));
  const ambiguous = extremesOf('deform-alias', 12, channelFrames);
  say('EX08D_DEFORM_SOURCE_ALIAS_REFUSES_ONLY_AMBIGUOUS_SERIES', ambiguous.channelStatus === 'PARTIAL' && ambiguous.channels.length === 1 && ambiguous.channels[0].max.value === 9 && ambiguous.channelRefusals[0].reason.includes('different original attachment sources'), JSON.stringify(ambiguous.channelRefusals));
  const invalid = extremesOf('bad-channel', 12, channelFrames.map((f) => ({ ...f, channels: [f.channels[0], { path: ['bone', 'other', 'rotate'], value: NaN }] })));
  say('EX08E_BAD_CHANNEL_DOES_NOT_INVALIDATE_OTHER_CHANNEL_OR_GEOMETRY', invalid.geometryPair !== null && invalid.status === 'READ' && invalid.channelStatus === 'PARTIAL' && invalid.channels[0].min.value === -2, JSON.stringify(invalid.channelRefusals));
  const lostFrame = extremesOf('lost-channels', 12, channelFrames.map((f, i) => i ? { ...f, channelError: 'planted unavailable channel reader' } : f));
  say('EX08F_CHANNEL_READER_FAILURE_IS_NAMED_SEPARATELY_FROM_VALID_GEOMETRY', lostFrame.geometryPair !== null && lostFrame.status === 'READ' && lostFrame.channelStatus === 'SKIP' && lostFrame.channelRefusals[0].reason.includes('planted unavailable'), JSON.stringify(lostFrame.channelRefusals));
  const imageRefusal = extremesRefusal('image-failure', 12, grid, 'planted image read failure', read);
  say('EX08G_IMAGE_REFUSAL_PRESERVES_VALID_CHANNELS_AND_GEOMETRY_READING', imageRefusal.status === 'SKIP' && imageRefusal.geometryPair === read.geometryPair && JSON.stringify(imageRefusal.channels) === JSON.stringify(read.channels) && imageRefusal.channelStatus === 'READ', imageRefusal.reason);
  const unnamedDeform = extremesOf('unknown-deform', 12, channelFrames.map((f) => ({ ...f, channels: [f.channels[0], { path: ['deform', 'same-slot', 'same-name', '0'], value: 1 }] })));
  say('EX08H_DEFORM_SOURCE_UNAVAILABLE_REFUSES_ONLY_THAT_CHANNEL', unnamedDeform.channelStatus === 'PARTIAL' && unnamedDeform.channels.length === 1 && unnamedDeform.channelRefusals[0].reason.includes('source identity unavailable'), JSON.stringify(unnamedDeform.channelRefusals));
  const a = new Plate(3, 1), b = new Plate(3, 1);
  a.data.set([255, 99, 42, 0, 0, 0, 0, 64, 200, 40, 10, 128]);
  b.data.set([0, 0, 0, 0, 0, 0, 0, 192, 100, 80, 20, 128]);
  const d = premultipliedDiff(a, b);
  say('EX09_TRANSPARENT_RGB_ZERO_ALPHA_AND_PREMULTIPLIED_COLOUR', d.data[0] === 0 && d.data[4] === 128 && d.data[8] === Math.round(100 * 128 / 255) && d.data[11] === 255, `luminances ${d.data[0]},${d.data[4]},${d.data[8]}`);
  let dims = false; try { premultipliedDiff(a, new Plate(1, 1)); } catch { dims = true; }
  say('EX10_DIFF_REFUSES_UNRELATED_PIXEL_GRIDS', dims, 'no implicit resizing');

  // A line coincides with the stationary body's stripe at setup, then moves with the overlaid part.
  // The clean moving part has no stripe. The ROI is interior to BOTH endpoint rectangles.
  const body = new Plate(32, 32); body.data.fill(255);
  for (let x = 0; x < 32; x++) body.set(x, 15, [0, 0, 0, 255]);
  const clean = new Plate(16, 16); clean.data.fill(255);
  const plant = new Plate(16, 16); plant.data.fill(255);
  for (let x = 0; x < 16; x++) plant.set(x, 7, [0, 0, 0, 255]);
  const quad = (slot: string, page: string, x: number, y: number, size: number): Piece => ({ kind: 'region', slot, page, world: [x, y, x, y + size, x + size, y + size, x + size, y], uvs: [0, 1, 0, 0, 1, 0, 1, 1], tint: [1, 1, 1, 1] });
  const lineFrame = (index: number, dy: number): Frame => ({ ...frame(index, dy), pieces: [quad('body', 'body', 0, 0, 32), quad('moving', 'moving', 8, 8 + dy, 16)] });
  const lineFrames = [lineFrame(0, 0), lineFrame(1, 4)];
  const vp: Viewport = { minX: 0, minY: 0, maxX: 32, maxY: 32, width: 32, height: 32, scale: 1 };
  const lineRead = extremesOf('baked-line', 12, lineFrames);
  const pngs: Plate[] = [];
  for (const [name, page] of [['clean', clean], ['plant', plant]] as const) {
    const plate = extremesPlate(lineRead, lineFrame(0, 0), lineFrames, new Map([['body', body], ['moving', page]]), vp)!;
    const path = join(work, `${name}.png`); plate.writePng(path); pngs.push(readPlate(path));
  }
  const roi = (plate: Plate): number => {
    let n = 0;
    // Moved stripe is world y=20..21 -> screen rows 11..12 (sampled texel convention).
    for (let y = 10; y <= 13; y++) for (let x = 11; x <= 20; x++) if (plate.data[(y * plate.width + 3 * vp.width + x) * 4] !== 0) n++;
    return n;
  };
  const cleanCount = roi(pngs[0]), plantedCount = roi(pngs[1]);
  say('EX11_PLANTED_BAKED_MOVING_LINE_READ_FROM_PNG_WITH_CLEAN_ZERO_ROI', cleanCount === 0 && plantedCount > 0, `clean=${cleanCount}, planted=${plantedCount} changed pixels in fixed interior ROI; ${work}`);
  say('EX12_SIX_NATIVE_PANELS_AND_LEGEND_NO_SHRINK', pngs[0].width === 6 * vp.width && pngs[0].height > vp.height && pngs[0].data[4 * (vp.width * pngs[0].width + 0) + 3] === 255, `${pngs[0].width}x${pngs[0].height}; each panel ${vp.width}x${vp.height}`);
  const again = extremesPlate(lineRead, lineFrame(0, 0), lineFrames, new Map([['body', body], ['moving', plant]]), vp)!;
  again.writePng(join(work, 'again.png'));
  say('EX13_JSON_AND_PNG_BYTE_DETERMINISTIC', extremesText(lineRead) === extremesText(extremesOf('baked-line', 12, lineFrames)) && hash(readFileSync(join(work, 'again.png'))) === hash(readFileSync(join(work, 'plant.png'))), 'independent repeat; encoded PNG bytes and JSON bytes');

  const run = (args: string[]): SpawnSyncReturns<string> => {
    const r = spawnSync(process.execPath, [join(ROOT, 'cli.ts'), ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    commands.push({ args: [process.execPath, join(ROOT, 'cli.ts'), ...args], exit: r.status, stdout: r.stdout, stderr: r.stderr });
    return r;
  };
  const fixture = overlapFixture();
  const motion = join(work, 'channels.motion.json');
  writeFileSync(motion, JSON.stringify({ spec: 'rigc-motion/1', archetype: fixture.rig, cut: fixture.rig, easings: {}, animations: {
    channels: { duration: 1, loop: false, tracks: [
      { bone: 'arm', property: 'rotate', keys: [{ t: 0, v: [-20] }, { t: 1, v: [35] }] },
      { bone: 'arm', property: 'translate', keys: [{ t: 0, v: [-2, 3] }, { t: 1, v: [6, -4] }] },
      { bone: 'arm', property: 'scale', keys: [{ t: 0, v: [1, 1] }, { t: 1, v: [1.2, 0.8] }] },
      { bone: 'arm', property: 'shear', keys: [{ t: 0, v: [-3, 5] }, { t: 1, v: [4, -6] }] },
    ] }, still: { duration: 1, loop: false, tracks: [{ bone: 'arm', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [0] }] }] },
  } }));
  const built = join(work, 'built');
  const build = run(['build', '--rig', fixture.rigPath, '--motion', motion, '--images', fixture.imagesDir, '--out', built]);
  const render = (name: string, extra: string[]): SpawnSyncReturns<string> => run(['render', '--candidate', built, '--max', '64', '--out', join(work, name), ...extra]);
  let cliReady = build.status === 0;
  say('EX14_PUBLIC_RECIPE_CHANNEL_SWING_BUILD_IS_GREEN', cliReady, `exit ${build.status}; ${(build.stdout + build.stderr).slice(-350)}`);
  if (cliReady) {
    const before = render('plain', []), withFlag = render('flag', ['--extremes']), repeat = render('repeat', ['--extremes']);
    cliReady = [before, withFlag, repeat].every((r) => r.status === 0);
    say('EX15_REAL_CLI_FLAG_IS_OBSERVATIONAL_AND_WRITES_ONE_LINE_PER_SET', cliReady && (withFlag.stdout.match(/EXTREMES /g) ?? []).length === 2, `exits=${before.status},${withFlag.status},${repeat.status}; ${(withFlag.stdout + withFlag.stderr).slice(-650)}`);
    if (cliReady) {
      const dir = (name: string): string => join(work, name, 'channels');
      const c = JSON.parse(readFileSync(join(dir('flag'), 'extremes.json'), 'utf8')) as ExtremesReading;
      const expected: Array<[string, number, number]> = [['rotate', -20, 35], ['translate.x', -2, 6], ['translate.y', OVERLAP_PLATE.armY - 4, OVERLAP_PLATE.armY + 3], ['scale.x', 1, Math.fround(1.2)], ['scale.y', Math.fround(0.8), 1], ['shear.x', -3, 4], ['shear.y', -6, 5]];
      const matched = expected.every(([name, min, max]) => { const channel = c.channels.find((x) => x.path.join('/') === `bone/arm/${name}`); return channel?.min.value === min && channel.max.value === max; });
      say('EX16_COMPONENTWISE_ROTATE_TRANSLATE_SCALE_SHEAR_MATCH_KEY_EXTREMA', matched, JSON.stringify(c.channels.filter((x) => x.path[1] === 'arm')));
      const tree = (path: string): Record<string, string> => Object.fromEntries(readdirSync(path, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? Object.entries(tree(join(path, e.name))).map(([k, v]) => [`${e.name}/${k}`, v]) : [[e.name, hash(readFileSync(join(path, e.name)))]]));
      const plain = tree(join(work, 'plain')), flagged = tree(join(work, 'flag'));
      say('EX17_EXISTING_FRAMES_FILES_UNCHANGED_WHEN_FLAG_ENABLED', Object.entries(plain).every(([p, h]) => flagged[p] === h), `${Object.keys(plain).length} existing file hashes compared`);
      const geom = render('geometry', ['--geometry']), geomExtra = render('geometry-extra', ['--geometry', '--extremes']);
      const geometryFiles = geom.status === 0 ? tree(join(work, 'geometry')) : {};
      const geometryExtraFiles = geomExtra.status === 0 ? tree(join(work, 'geometry-extra')) : {};
      say('EX17B_ORIGINAL_GEOMETRY_JSON_AND_FRAMES_UNCHANGED_WITH_OPTIONAL_SOURCE_IDENTITY', geom.status === 0 && geomExtra.status === 0 && Object.keys(geometryFiles).length > 0 && Object.entries(geometryFiles).every(([p, h]) => geometryExtraFiles[p] === h), `${Object.keys(geometryFiles).length} existing geometry/frame file hashes; exits ${geom.status}/${geomExtra.status}`);
      say('EX18_REAL_CLI_REPEAT_JSON_PNG_BYTES_IDENTICAL', JSON.stringify(tree(join(work, 'flag'))) === JSON.stringify(tree(join(work, 'repeat'))), 'all output files identical in repeat');
      // #1642: the output allowlist is closed. A leaked ordinary frame must fail this control.
      const onlyRun = render('only', ['--extremes-only']);
      const onlyFiles = onlyRun.status === 0 ? tree(join(work, 'only')) : {};
      const expectedOnly = Object.fromEntries(Object.entries(flagged).filter(([p]) => /\/extremes\.(json|png)$/.test(p)));
      const onlyMatches = (files: Record<string, string>): boolean =>
        Object.keys(files).length === Object.keys(expectedOnly).length &&
        Object.entries(files).every(([p, h]) => expectedOnly[p] === h);
      say('EX26_EXTREMES_ONLY_CLOSED_OUTPUT_BYTES', onlyRun.status === 0 && onlyMatches(onlyFiles), `exit ${onlyRun.status}; ${Object.keys(onlyFiles).length} files; ${(onlyRun.stderr ?? '').slice(-350)}`);
      if (onlyRun.status === 0) writeFileSync(join(work, 'only', 'channels', 'f0000.png'), 'planted ordinary frame');
      say('EX27_EXTREMES_ONLY_ORDINARY_FRAME_PLANT_GOES_RED', onlyRun.status === 0 && !onlyMatches(tree(join(work, 'only'))), 'same output checker reads disk and rejects an unexpected ordinary frame');
      if (onlyRun.status === 0) rmSync(join(work, 'only', 'channels', 'f0000.png'));
      const reuse = render('plain', ['--extremes-only', '--extremes']);
      say('EX28_EXTREMES_ONLY_REUSED_OUTPUT_CLEARS_FRAMES_CONTACT_AND_INDEX', reuse.status === 0 && onlyMatches(tree(join(work, 'plain'))), 'reused ordinary output; explicit --extremes is redundant');
      for (const poser of ['core', 'spine']) {
        const oldRun = render(`old-${poser}`, ['--extremes', '--poser', poser, '--fps', '1', '--hide', 'arm']);
        const newRun = render(`only-${poser}`, ['--extremes-only', '--poser', poser, '--fps', '1', '--hide', 'arm']);
        const oldFiles = oldRun.status === 0 ? tree(join(work, `old-${poser}`)) : {};
        const newFiles = newRun.status === 0 ? tree(join(work, `only-${poser}`)) : {};
        const expected = Object.fromEntries(Object.entries(oldFiles).filter(([p]) => /\/extremes\.(json|png)$/.test(p)));
        say(`EX29_EXTREMES_ONLY_BOTH_POSERS_SUBSET_FPS_SKIP[${poser}]`, oldRun.status === 0 && newRun.status === 0 && Object.keys(expected).length === 2 && JSON.stringify(expected) === JSON.stringify(newFiles), `exits ${oldRun.status}/${newRun.status}; still subset has JSON only`);
      }
      for (const flag of ['sheet', 'sheet-format', 'page-edges', 'geometry', 'folds', 'pass-through', 'seam', 'overlaps', 'angle-range']) {
        const values: Record<string, string[]> = { 'sheet-format': ['json-hash'], 'page-edges': ['pot'], 'pass-through': ['body:arm'], seam: ['body:arm'], 'angle-range': ['arm:root'] };
        const refused = render(`refuse-${flag}`, ['--extremes-only', `--${flag}`, ...(values[flag] ?? [])]);
        say(`EX30_EXTREMES_ONLY_INCOMPATIBLE_OUTPUT_REFUSED[${flag}]`, refused.status === 2 && refused.stderr.includes(`--extremes-only takes no --${flag}`) && !existsSync(join(work, `refuse-${flag}`)), `exit ${refused.status}; no output`);
      }

      const two = render('two', ['--extremes', '--animation', 'channels', '--fps', '1']);
      const edgeRead = two.status === 0 ? JSON.parse(readFileSync(join(work, 'two', 'channels@1fps', 'extremes.json'), 'utf8')) as ExtremesReading : null;
      say('EX19_REAL_TWO_FRAME_ANIMATION_AND_STILL_SKIP', edgeRead?.grid.length === 2 && JSON.parse(readFileSync(join(work, 'flag', 'still', 'extremes.json'), 'utf8')).status === 'SKIP', `edge exit ${two.status}`);
      for (const [name, extra] of [['slot', ['--slot', 'body']], ['hide', ['--hide', 'arm']]] as const) {
        const sub = render(name, ['--extremes', ...extra]);
        const subRead = sub.status === 0 ? JSON.parse(readFileSync(join(work, name, 'channels', 'extremes.json'), 'utf8')) as ExtremesReading : null;
        say(`EX20_SLOT_HIDE_REAL_CLI_EXCLUDES_MOVING_GEOMETRY[${name}]`, sub.status === 0 && subRead?.status === 'SKIP', `exit ${sub.status}; ${subRead?.reason}`);
      }
      // Both real poser APIs: only mappings actually applied, not stale mix-zero or inactive-target times.
      const sliderRig = JSON.parse(readFileSync(fixture.rigPath, 'utf8')) as { bones: Array<Record<string, unknown>>; constraints?: unknown[]; skins: Record<string, unknown> };
      sliderRig.bones.push({ name: 'channel_driver', parent: 'root', skin: true });
      sliderRig.skins.active_driver = { bones: ['channel_driver'], attachments: {} };
      sliderRig.constraints = [
        { name: 'applied', type: 'slider', animation: 'channels', time: 0.5, mix: 1, additive: true },
        { name: 'off', type: 'slider', animation: 'channels', time: 0.9, mix: 0, additive: true },
        { name: 'hidden_driver', type: 'slider', animation: 'channels', bone: 'channel_driver', property: 'rotate', from: 0, to: 0.2, scale: 0.05, max: 10, local: true, mix: 1, additive: true },
      ];
      const sliderRigPath = join(work, 'slider.rig.json'); writeFileSync(sliderRigPath, JSON.stringify(sliderRig));
      const sliderMotion = JSON.parse(readFileSync(motion, 'utf8')) as { animations: Record<string, { tracks: unknown[] }> };
      sliderMotion.animations.still.tracks.push({ slider: 'off', property: 'mix', keys: [{ t: 0, v: [0] }, { t: 1, v: [1] }] });
      const sliderMotionPath = join(work, 'slider.motion.json'); writeFileSync(sliderMotionPath, JSON.stringify(sliderMotion));
      const sliderBuilt = join(work, 'slider-built');
      const sliderBuild = run(['build', '--rig', sliderRigPath, '--motion', sliderMotionPath, '--images', fixture.imagesDir, '--out', sliderBuilt]);
      let sliderFaults: string[] = [];
      if (sliderBuild.status !== 0) sliderFaults.push(`slider build ${sliderBuild.status}: ${(sliderBuild.stdout + sliderBuild.stderr).slice(-600)}`);
      else {
        const loaded = loadPosable(join(sliderBuilt, 'skeleton.json'), join(sliderBuilt, 'skeleton.atlas'), sliderBuilt);
        const posers = [spinePoser(loaded.data), corePoser(readFileSync(join(sliderBuilt, 'skeleton.model.json'), 'utf8'), readFileSync(join(sliderBuilt, 'skeleton.atlas'), 'utf8'))];
        for (const skin of [undefined, 'active_driver']) {
          const wanted = skin === undefined ? ['applied'] : ['applied', 'hidden_driver'];
          for (const [i, poser] of posers.entries()) {
            const rows = sampleSetupPose(poser, { channels: true, ...(skin === undefined ? {} : { skin }) })[0].channels ?? [];
            const names = rows.filter((r) => r.path[0] === 'slider').map((r) => r.path[1]).sort();
            if (JSON.stringify(names) !== JSON.stringify(wanted)) sliderFaults.push(`poser ${i}, skin ${skin}: mappings ${names}, expected ${wanted}`);
            if (!rows.some((r) => r.path[0] === 'slider' && r.path[1] === 'applied' && r.value === 0.5)) sliderFaults.push(`poser ${i}, skin ${skin}: applied mapped time not 0.5`);
            const on = sampleAll(poser, 1, { channels: true, ...(skin === undefined ? {} : { skin }) }).get('still')!.at(-1)!;
            if (!on.channels?.some((r) => r.path[0] === 'slider' && r.path[1] === 'off')) sliderFaults.push(`poser ${i}, skin ${skin}: positive control did not apply the slider when mix keyed to 1`);
          }
        }
      }
      say('EX20D_SLIDER_MIX_ZERO_AND_INACTIVE_BONE_ARE_NOT_STALE_APPLIED_MAPPINGS', sliderFaults.length === 0, sliderFaults.join('; ') || 'both posers: boneless applied time 0.5, mix-zero absent, inactive driver absent until activating skin');
      // An attachment switch remains a successful ordinary render, but cannot pair original vertices.
      const switched = JSON.parse(readFileSync(join(built, 'skeleton.json'), 'utf8')) as { skins: Array<{ attachments: Record<string, Record<string, Record<string, unknown>>> }>; animations: Record<string, Record<string, unknown>> };
      const table = switched.skins[0].attachments.arm;
      table.arm_alt = { ...table.arm, path: table.arm.path ?? 'arm' };
      switched.animations.channels.slots = { arm: { attachment: [{ time: 0, name: 'arm' }, { time: 1, name: 'arm_alt' }] } };
      const switchPath = join(built, 'switch.json'); writeFileSync(switchPath, JSON.stringify(switched));
      const switchedRun = run(['render', '--candidate', switchPath, '--atlas', join(built, 'skeleton.atlas'), '--poser', 'spine', '--animation', 'channels', '--max', '64', '--extremes', '--out', join(work, 'flag')]);
      const skipped = switchedRun.status === 0 ? JSON.parse(readFileSync(join(dir('flag'), 'extremes.json'), 'utf8')) as ExtremesReading : null;
      say('EX20B_UNCOMPARABLE_GEOMETRY_DOES_NOT_CHANGE_SUCCESS_EXIT_OR_KEEP_STALE_PNG', switchedRun.status === 0 && skipped?.reason.includes('EXTREMES_OBSERVATION_REFUSED') === true && skipped.channelStatus === 'READ' && skipped.channels.some((c) => c.path.join('/') === 'bone/arm/rotate' && c.min.value === -20 && c.max.value === 35) && !existsSync(join(dir('flag'), 'extremes.png')), `exit ${switchedRun.status}; ${skipped?.reason}; ${(switchedRun.stderr ?? '').slice(-300)}`);
      table.arm_alt.name = 'arm'; writeFileSync(switchPath, JSON.stringify(switched));
      const alias = run(['render', '--candidate', switchPath, '--atlas', join(built, 'skeleton.atlas'), '--poser', 'spine', '--animation', 'channels', '--max', '64', '--extremes', '--out', join(work, 'alias')]);
      const aliasRead = alias.status === 0 ? JSON.parse(readFileSync(join(work, 'alias', 'channels', 'extremes.json'), 'utf8')) as ExtremesReading : null;
      say('EX20C_EQUAL_DISPLAY_NAME_AND_VERTEX_COUNT_DO_NOT_ALIAS_DIFFERENT_SOURCES', alias.status === 0 && aliasRead?.reason.includes('actual source identity') === true && aliasRead.status === 'SKIP' && aliasRead.channels.some((c) => c.path.join('/') === 'bone/arm/rotate' && c.min.value === -20 && c.max.value === 35), `exit ${alias.status}; ${aliasRead?.reason}`);
    }
  }

  // Every public gallery recipe, through BOTH actual posers, on one viewport and one grid.
  for (const recipe of galleryRecipes(ROOT, (line) => console.log(`  .. ${line}`))) {
    const recipeWork = join(work, recipe.name.replaceAll('/', '-'));
    const build = runRecipe(recipe, recipeWork, ROOT);
    let sets = 0, pictures = 0, skip = 0, refusedSets = 0, ordinaryFrames = 0, deformSeries = 0; const faults: string[] = [];
    if (build.exits.some((e) => e !== 0)) faults.push(`build exits ${build.exits}`);
    else {
      const out = join(recipeWork, 'out');
      const loaded = loadPosable(join(out, 'skeleton.json'), join(out, 'skeleton.atlas'), out);
      const spine = spinePoser(loaded.data);
      const core = corePoser(readFileSync(join(out, 'skeleton.model.json'), 'utf8'), readFileSync(join(out, 'skeleton.atlas'), 'utf8'));
      const view = framingViewport(spine, 32)!;
      const left = sampleAll(core, 12, { geometry: true, channels: true });
      const right = sampleAll(spine, 12, { geometry: true, channels: true });
      const setups = [sampleSetupPose(core)[0], sampleSetupPose(spine)[0]];
      for (const [name, frames] of left) {
        sets++;
        try {
          const rightFrames = right.get(name)!;
          for (let i = 0; i < frames.length; i++) {
            ordinaryFrames++;
            if (hash(renderFrame(frames[i], loaded.pages, view, BACKGROUND).data) !== hash(renderFrame(rightFrames[i], loaded.pages, view, BACKGROUND).data)) faults.push(`${name}/f${i}: ordinary frame pixels differ`);
          }
          const observe = (f: Frame[]): ExtremesReading => {
            try { return extremesOf(name, 12, f); }
            catch (err) {
              if (!(err instanceof ExtremesError) || !err.message.includes('attachment identity or vertex count changed')) throw err;
              return extremesRefusal(name, 12, f, err.message);
            }
          };
          const readings = [observe(frames), observe(rightFrames)];
          if (['gallery/look', 'gallery/nod', 'gallery/portrait'].includes(recipe.name)) {
            deformSeries += readings[0].channels.filter((c) => c.path[0] === 'deform').length;
            if (readings.some((r) => r.channelStatus !== 'READ')) faults.push(`${name}: source-bound channel read unexpectedly refused: ${JSON.stringify(readings.map((r) => r.channelRefusals))}`);
          }
          if (readings[0].reason.includes('REFUSED') || readings[1].reason.includes('REFUSED')) {
            refusedSets++;
            if (readings[0].reason !== readings[1].reason) faults.push(`${name}: correspondence refusals differ`);
            if (readings.some((r) => !r.channels.some((c) => c.path[0] === 'bone'))) faults.push(`${name}: geometry refusal erased valid local channels`);
            continue;
          }
          const p = readings.map((r, i) => extremesPlate(r, setups[i], i === 0 ? frames : right.get(name)!, loaded.pages, view));
          if (p[0] === null && p[1] === null) skip++;
          else if (p[0] === null || p[1] === null || hash(p[0].data) !== hash(p[1].data)) faults.push(`${name}: extreme pixels differ`);
          else pictures++;
          // Deform coordinates must be separate channel rows; lookup-driven sets must expose mapping times.
          if (recipe.name === 'gallery/look' && !readings[0].channels.some((c) => c.path[0] === 'slider')) faults.push(`${name}: no slider mappings`);
        } catch (e) { faults.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
      }
    }
    if (['gallery/look', 'gallery/nod', 'gallery/portrait'].includes(recipe.name) && deformSeries === 0) faults.push('no actual source-bound deform channels measured');
    say(`EX21_GALLERY_BOTH_POSERS_PIXELS[${recipe.name}]`, faults.length === 0 && sets > 0, `${sets} sets, ${pictures} identical pictures, ${skip} still SKIPs, ${refusedSets} named correspondence SKIPs, ${ordinaryFrames} ordinary frame pairs, ${deformSeries} unambiguous deform series; ${faults.join('; ')}`);
  }
  if (evidence !== undefined) {
    for (const name of ['clean.png', 'plant.png', 'again.png']) cpSync(join(work, name), join(evidence, name));
    writeFileSync(join(evidence, 'line-extremes.json'), extremesText(lineRead));
    writeFileSync(join(evidence, 'commands.json'), JSON.stringify(commands, null, 2) + '\n');
    writeFileSync(join(evidence, 'roi.json'), JSON.stringify({ clean: cleanCount, planted: plantedCount, roi: { x: [11, 20], y: [10, 13], panel: 3 }, viewport: vp, sheet: { width: pngs[0].width, height: pngs[0].height } }, null, 2) + '\n');
    if (existsSync(join(work, 'repeat', 'channels', 'extremes.json'))) {
      cpSync(join(work, 'repeat', 'channels', 'extremes.json'), join(evidence, 'cli-extremes.json'));
      cpSync(join(work, 'repeat', 'channels', 'extremes.png'), join(evidence, 'cli-extremes.png'));
    }
  }
  console.log(`  .. extremes evidence: ${work}`);
  return bad;
}

if (import.meta.main) process.exit(runExtremesSuite() === 0 ? 0 : 1);
