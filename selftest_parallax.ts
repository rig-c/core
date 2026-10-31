import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Plate } from './tools/plate.ts';
/** Fixed controls for the geometry reading in #1662; no quality threshold. */
import { sampleParallax } from './src/parallax_render.ts';
import { readModel } from './src/core/index.ts';
import { poseRawSetup, poseRawDial } from './src/core/raw.ts';
import { fitMotion, parallaxOf, parallaxText, spearman, type ParallaxMesh } from './src/parallax.ts';

type Say = (name: string, ok: boolean, detail: string, why: string) => number;
export function runParallaxMathSuite(report?: Say): number {
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string): void => {
    bad += report ? report(name, ok, detail, 'A geometric reading must distinguish its controls without certifying flatness') : (console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`), ok ? 0 : 1);
  };
  const rest: number[] = [];
  for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) rest.push(x, y);
  const map = (f: (x: number, y: number) => number[]): number[] => rest.flatMap((_, i) => i % 2 ? [] : f(rest[i], rest[i + 1]));
  const affine = map((x, y) => [0.7 * x + 0.2 * y + 3, -0.3 * x + 1.1 * y - 2]);
  const projective = map((x, y) => [(x + 0.2 * y + 3) / (1 + 0.07 * x - 0.04 * y), (y - 2) / (1 + 0.07 * x - 0.04 * y)]);
  const spin = map((x, y) => [x * Math.cos(0.4) - y * Math.sin(0.4), x * Math.sin(0.4) + y * Math.cos(0.4)]);
  for (const [name, target, kind] of [['PLX01_AFFINE_PAPER', affine, 'affine'], ['PLX02_PROJECTIVE_PAPER', projective, 'homography'], ['PLX03_SPIN', spin, 'affine']] as const) {
    const fit = fitMotion(rest, target, kind);
    say(name, fit.status === 'READ' && fit.rms! < 1e-8, JSON.stringify(fit));
  }
  const bulge = (n: number): number[] => map((x, y) => [x + 3 + n * Math.exp(-(x * x + y * y)), y]);
  const small = fitMotion(rest, bulge(0.1), 'homography'), large = fitMotion(rest, bulge(0.4), 'homography');
  say('PLX04_BULGE_SIZE_MOVES_GEOMETRIC_RESIDUAL', small.rms! > 0.001 && large.rms! > 3 * small.rms!, `small=${small.rms}, large=${large.rms}`);
  say('PLX05_STATIONARY_DENOMINATOR_SKIPS', fitMotion(rest, rest, 'affine').ratio === null && fitMotion(rest, rest, 'affine').status === 'SKIP', 'no 0/0 score');
  const line = [0, 0, 1, 0, 2, 0, 3, 0, 4, 0];
  say('PLX06_RANK_DEFICIENT_SKIPS', fitMotion(line, line.map((v, i) => v + (i % 2 ? 2 : 1)), 'affine').status === 'SKIP', 'collinear source');
  const four = fitMotion([0, 0, 1, 0, 1, 1, 0, 1], [0, 0, 2, 1, 3, 4, -1, 2], 'homography');
  say('PLX07_FOUR_POINTS_CANNOT_CERTIFY_FLATNESS', four.status === 'SKIP' && four.ratio === null, JSON.stringify(four));
  for (const scale of [1e-7, 1e7]) {
    const r = rest.map((v) => v * scale + 100 * scale), t = affine.map((v) => v * scale + 100 * scale);
    const fit = fitMotion(r, t, 'affine');
    say(`PLX08_NORMALIZED_SCALE[${scale}]`, fit.status === 'READ' && fit.ratio! < 1e-8, JSON.stringify(fit));
  }
  say('PLX09_SPEARMAN_CONSTANT_AND_SIGN', spearman([1, 1, 1], [1, 2, 3]) === null && spearman([1, 2, 3], [3, 2, 1]) === -1 && spearman([1, 2, 3], [1, 2, 3]) === 1, 'constant undefined; tied ranks; signed per sample');
  const mesh: ParallaxMesh = { slot: 'paper', attachment: 'paper', kind: 'mesh', vertices: rest };
  const reading = parallaxOf('dial', [mesh], [{ value: -1, meshes: [{ ...mesh, vertices: affine }] }, { value: 1, meshes: [{ ...mesh, vertices: spin }] }]);
  say('PLX10_FITS_ARE_PER_SAMPLE_NOT_POOLED', reading.samples.every((s) => s.meshes[0].affine.ratio! < 1e-8), 'two different exact affine maps each explain one sample');
  say('PLX11_NO_VERTICES_SKIP', parallaxOf('empty', [], [{ value: 1, meshes: [] }]).status === 'SKIP', 'not a pass');
  say('PLX12_DETERMINISTIC_JSON_BYTES', parallaxText(reading) === parallaxText(parallaxOf('dial', [mesh], [{ value: -1, meshes: [{ ...mesh, vertices: affine }] }, { value: 1, meshes: [{ ...mesh, vertices: spin }] }])), 'two independent calls');
  const first = { ...mesh, slot: 'a', vertices: rest, depths: rest.filter((_, i) => i % 2 === 0) };
  const second = { ...first, slot: 'b' };
  const layered = parallaxOf('articulated-flat-depth', [first, second], [{ value: 1, meshes: [{ ...first, vertices: affine }, { ...second, vertices: spin }] }]);
  say('PLX13_ARTICULATED_LAYERS_ARE_NOT_ONE_AFFINE', layered.samples[0].layers.spread! > 0.1, `spread=${layered.samples[0].layers.spread}; two paper surfaces with different affine maps`);
  const depthMesh = { ...mesh, depths: rest.flatMap((v, i) => i % 2 ? [] : [v + 2]) };
  const depthSamples = [-0.5, 0.5].map((value) => ({ value, meshes: [{ ...depthMesh, vertices: rest.map((v, i) => i % 2 ? v : v + value * depthMesh.depths[i / 2]) }] }));
  const depth = parallaxOf('declared-depth', [depthMesh], depthSamples, 0, [1, 0]);
  say('PLX22_DEPTH_SIGN_AND_TRAVEL_PER_UNIT', depth.samples[0].meshes[0].depth.spearman === -1 && depth.samples[1].meshes[0].depth.spearman === 1 && depth.samples.every((s) => s.meshes[0].depth.nearTravel === 4 && s.meshes[0].depth.farTravel === 0), 'rho -1/+1; near 4, far 0 world px/dial-unit, separately at both extrema');
  say('PLX23_SLOPED_DEPTH_CAN_BE_EXACT_AFFINE', depth.samples.every((s) => s.meshes[0].affine.ratio! < 1e-8), 'varying declared depth with a perfect affine projection: zero cannot certify paper');
  const identity = {}, alias = parallaxOf('source-switch', [{ ...mesh, identity }], [{ value: 1, meshes: [{ ...mesh, identity: {}, vertices: affine }] }]);
  say('PLX24_SOURCE_SWITCH_SKIPS_SAME_NAMES_AND_COUNTS', alias.samples[0].meshes[0].affine.status === 'SKIP' && alias.status === 'SKIP', 'distinct original source objects cannot supply correspondence');
  const singular = map((x, _y) => [x + 1, 0]);
  say('PLX25_COLLAPSED_TARGET_IS_UNAVAILABLE', fitMotion(rest, singular, 'affine').status === 'SKIP', 'singular fitted affine map');
  for (const scale of [1e-7, 1e7]) {
    const fit = fitMotion(rest.map((v) => (v + 100) * scale), projective.map((v) => (v + 100) * scale), 'homography');
    say(`PLX26_HOMOGRAPHY_NORMALIZED_SCALE[${scale}]`, fit.status === 'READ' && fit.ratio! < 1e-8, `ratio=${fit.ratio}`);
  }
  const appeared = parallaxOf('appearing-mesh', [], [{ value: 1, meshes: [mesh] }]);
  say('PLX28_APPEARING_MESH_WITHOUT_SETUP_IS_NAMED_SKIP', appeared.samples[0].meshes[0]?.affine.status === 'SKIP' && appeared.samples[0].meshes[0]?.slot === 'paper', 'new mesh cannot disappear from the per-mesh report merely because setup has no matching vertices');
  return bad;
}

export function runParallaxSuite(report?: Say): number {
  console.log('\n── parallax: per-sample geometry, unavailable declarations and named-dial CLI (issue #1662) ──');
  let bad = runParallaxMathSuite(report);
  const say = (name: string, ok: boolean, detail: string): void => {
    bad += report ? report(name, ok, detail, 'The real core CLI must produce the reading without changing ordinary render') : (console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`), ok ? 0 : 1);
  };
  const work = mkdtempSync(join(tmpdir(), 'rigc-parallax-'));
  const run = (entry: string, args: string[]) => spawnSync(process.execPath, [join(import.meta.dir, entry), ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
  try {
    mkdirSync(join(work, 'parts'));
    const image = new Plate(32, 32); image.rect(0, 0, 32, 32, [200, 150, 90, 255]); image.writePng(join(work, 'parts', 'paper.png'));
    const rig = { spec: 'rigc-rig/1', name: 'paper', invariants: { meshSlots: 1, meshTriangles: 100 }, images: 'parts', skeleton: { x: -20, y: -20, width: 40, height: 40 }, bones: [{ name: 'root' }, { name: 'paper', parent: 'root' }, { name: 'dial', parent: 'root' }], slots: [{ name: 'paper', bone: 'paper', attachment: 'paper' as string | null }], constraints: [{ name: 'yaw', type: 'slider', animation: 'turn', bone: 'dial', property: 'rotate', from: -1, to: 0, scale: 0.5, max: 1, local: true }], skins: { default: { paper: { paper: { type: 'mesh', image: 'paper.png', generator: { kind: 'grid', cols: 5, rows: 5 } } } } } };
    const motion = { spec: 'rigc-motion/1', archetype: 'paper', cut: 'paper', easings: {}, animations: { turn: { duration: 1, loop: false, tracks: [{ bone: 'paper', property: 'translatex', keys: [{ t: 0, v: [-3] }, { t: 1, v: [3] }] }] } } };
    writeFileSync(join(work, 'rig.json'), JSON.stringify(rig)); writeFileSync(join(work, 'motion.json'), JSON.stringify(motion));
    const candidate = join(work, 'build');
    const built = run('cli_core.ts', ['build', '--rig', join(work, 'rig.json'), '--motion', join(work, 'motion.json'), '--out', candidate, '--copy-images']);
    say('PLX14_GENERATED_DIAL_BUILD', built.status === 0, `exit ${built.status}; ${(built.stdout + built.stderr).slice(-350)}`);
    if (built.status !== 0) return bad;
    const render = (out: string, extra: string[], entry = 'cli_core.ts') => run(entry, ['render', '--candidate', candidate, '--max', '64', '--out', join(work, out), ...extra]);
    const missing = render('missing', ['--parallax', 'absent']);
    say('PLX15_MISSING_DIAL_NAMED_BEFORE_WRITE', missing.status === 2 && missing.stderr.includes('absent') && !existsSync(join(work, 'missing')), `exit ${missing.status}; ${missing.stderr.slice(-400)}`);
    const one = render('one', ['--parallax', 'yaw']), two = render('two', ['--parallax', 'yaw']), linked = render('linked', ['--parallax', 'yaw'], 'cli.ts');
    const ready = one.status === 0 && two.status === 0 && linked.status === 0;
    say('PLX16_BOTH_ENTRIES_AND_REPEAT', ready, `core ${one.status},${two.status}; linked ${linked.status}; ${one.stderr.slice(-500)}`);
    if (ready) {
      const reading = JSON.parse(readFileSync(join(work, 'one', 'parallax.json'), 'utf8')) as ReturnType<typeof parallaxOf>;
      say('PLX17_DIAL_GRID_NOT_LOOKUP_PLAYBACK', reading.samples.length === 9 && reading.samples[0].meshes[0].affine.ratio! < 1e-6 && reading.samples[4].meshes[0].affine.status === 'SKIP', '25 original mesh vertices, exact translations at endpoints; neutral stationary SKIP');
      say('PLX18_CLI_JSON_PNG_BYTE_DETERMINISM', ['parallax.json', 'parallax.png'].every((file) => hash(join(work, 'one', file)) === hash(join(work, 'two', file)) && hash(join(work, 'one', file)) === hash(join(work, 'linked', file))), 'independent core runs and linked entry: JSON and encoded PNG equal');
    }
    const plain = render('plain', []);
    say('PLX19_ORDINARY_RENDER_HAS_NO_READING', plain.status === 0 && !existsSync(join(work, 'plain', 'parallax.json')), `ordinary exit ${plain.status}`);
    const incompatible = render('bad', ['--parallax', 'yaw', '--animation', 'turn']);
    say('PLX20_INCOMPATIBLE_GRID_FLAG_NAMED', incompatible.status === 2 && incompatible.stderr.includes('--animation'), incompatible.stderr.slice(-300));
    const clipRig = { ...rig,
      bones: [...rig.bones, { name: 'late', parent: 'root', x: 64 }],
      slots: [{ name: 'clip', bone: 'root', attachment: 'clip' }, ...rig.slots,
        { name: 'end', bone: 'root', attachment: null }, { name: 'late', bone: 'late', attachment: 'late' }],
      skins: { default: { ...rig.skins.default,
        clip: { clip: { type: 'clipping', vertexCount: 4, vertices: [-8, -8, -8, 8, 8, 8, 8, -8], end: 'end' } },
        late: { late: { image: 'paper.png' } },
      } },
    };
    writeFileSync(join(work, 'clip.rig.json'), JSON.stringify(clipRig));
    const clipDir = join(work, 'clip');
    const clipBuild = run('cli_core.ts', ['build', '--rig', join(work, 'clip.rig.json'), '--motion', join(work, 'motion.json'), '--out', clipDir, '--copy-images']);
    let clipOk = false, clipDetail = `build ${clipBuild.status}; ${clipBuild.stderr.slice(-400)}`;
    if (clipBuild.status === 0) {
      const text = readFileSync(join(clipDir, 'skeleton.model.json'), 'utf8');
      const doc = readModel(text), setup = poseRawSetup(doc);
      const dial = poseRawDial(doc, { bone: 'dial', field: 'rotation', value: 0 }, 'yaw').pose;
      const sampled = sampleParallax(text, readFileSync(join(clipDir, 'skeleton.atlas'), 'utf8'), 'yaw');
      const setupLate = sampled.setup.pieces.filter((p) => p.slot === 'late');
      const sampleLate = sampled.frames.map((f) => f.pieces.filter((p) => p.slot === 'late'));
      clipOk = setup.drawOrder.includes('end') && dial.drawOrder.includes('end') &&
        !setup.clipped.some((r) => r[0] === 'late') && !dial.clipped.some((r) => r[0] === 'late') &&
        setupLate.length === 1 && sampleLate.length === 9 && sampleLate.every((p) => JSON.stringify(p) === JSON.stringify(setupLate));
      clipDetail = JSON.stringify({ setupOrder: setup.drawOrder, dialOrder: dial.drawOrder,
        setupLateClipped: setup.clipped.some((r) => r[0] === 'late'), dialLateClipped: dial.clipped.some((r) => r[0] === 'late'),
        setupLatePieces: setupLate.length, dialLatePieces: sampleLate.map((p) => p.length) });
    }
    say('PLX30_NULL_ATTACHMENT_END_SLOT_ENDS_CLIP_IN_DIAL_AS_IN_SETUP', clipOk, clipDetail);
    const sharedRig = { ...rig, bones: [...rig.bones, { name: 'echo', parent: 'root', y: 48 }],
      slots: [...rig.slots, { name: 'echo', bone: 'echo', attachment: 'echo' }],
      constraints: [...rig.constraints, { ...rig.constraints[0], name: 'echo', animation: 'echo' }],
      skins: { default: { ...rig.skins.default, echo: { echo: { image: 'paper.png' } } } },
    };
    const sharedMotion = { ...motion, animations: { ...motion.animations,
      echo: { duration: 1, loop: false, tracks: [{ bone: 'echo', property: 'translatex', keys: [{ t: 0, v: [-7] }, { t: 1, v: [7] }] }] },
    } };
    writeFileSync(join(work, 'shared.rig.json'), JSON.stringify(sharedRig)); writeFileSync(join(work, 'shared.motion.json'), JSON.stringify(sharedMotion));
    const sharedDir = join(work, 'shared');
    const sharedBuild = run('cli_core.ts', ['build', '--rig', join(work, 'shared.rig.json'), '--motion', join(work, 'shared.motion.json'), '--out', sharedDir, '--copy-images']);
    let sharedOk = false, sharedDetail = `build ${sharedBuild.status}; ${sharedBuild.stderr.slice(-200)}`;
    if (sharedBuild.status === 0) {
      const shared = sampleParallax(readFileSync(join(sharedDir, 'skeleton.model.json'), 'utf8'), readFileSync(join(sharedDir, 'skeleton.atlas'), 'utf8'), 'yaw');
      const setupX = shared.setup.attachments?.find((a) => a.slot === 'echo')?.vertices[0];
      const minX = shared.frames.find((f) => f.index === 0)?.attachments?.find((a) => a.slot === 'echo')?.vertices[0];
      const maxX = shared.frames.find((f) => f.index === 8)?.attachments?.find((a) => a.slot === 'echo')?.vertices[0];
      const reset = shared.reading.sampling.reset;
      sharedOk = setupX !== undefined && minX !== undefined && maxX !== undefined && minX - setupX === -7 && maxX - setupX === 7 && reset.includes('other inputs') && reset.includes('may respond');
      sharedDetail = `only yaw requested; echo slider shares dial.rotate: setup x=${setupX}, endpoints x=${minX}/${maxX} (expected -7/+7 from setup); reset=${reset}`;
    }
    say('PLX29_SHARED_DRIVER_SLIDERS_RESPOND_WITH_OTHER_INPUTS_AT_SETUP', sharedOk, sharedDetail);
    rig.constraints[0].from = 1; rig.constraints[0].max = -1; rig.constraints[0].scale = -0.5;
    writeFileSync(join(work, 'rig.json'), JSON.stringify(rig));
    const reverseBuild = run('cli_core.ts', ['build', '--rig', join(work, 'rig.json'), '--motion', join(work, 'motion.json'), '--out', join(work, 'reverse'), '--copy-images']);
    const reverse = run('cli_core.ts', ['render', '--candidate', join(work, 'reverse'), '--parallax', 'yaw', '--out', join(work, 'reverse-reading'), '--max', '64']);
    const reverseReading = reverse.status === 0 ? JSON.parse(readFileSync(join(work, 'reverse-reading', 'parallax.json'), 'utf8')) as { sampling: { values: number[] } } : null;
    say('PLX27_NEGATIVE_MAPPING_EXTREMES_ARE_NUMERIC_MIN_MAX', reverseBuild.status === 0 && reverse.status === 0 && reverseReading?.sampling.values[0] === -1 && reverseReading.sampling.values[8] === 1, `build ${reverseBuild.status}, render ${reverse.status}, values=${JSON.stringify(reverseReading?.sampling.values)}`);
    rig.slots[0].attachment = null;
    writeFileSync(join(work, 'rig.json'), JSON.stringify(rig));
    const emptyBuild = run('cli_core.ts', ['build', '--rig', join(work, 'rig.json'), '--motion', join(work, 'motion.json'), '--out', join(work, 'empty'), '--copy-images']);
    const empty = run('cli_core.ts', ['render', '--candidate', join(work, 'empty'), '--parallax', 'yaw', '--out', join(work, 'empty-reading')]);
    const skipped = empty.status === 0 && JSON.parse(readFileSync(join(work, 'empty-reading', 'parallax.json'), 'utf8')).status === 'SKIP';
    say('PLX21_NO_DRAWABLE_VERTICES_CLI_SKIP', emptyBuild.status === 0 && skipped, `build ${emptyBuild.status}, render ${empty.status}; ${empty.stderr.slice(-250)}`);
  } finally { rmSync(work, { recursive: true, force: true }); }
  return bad;
}
if (import.meta.main) process.exitCode = (process.argv.includes('--math') ? runParallaxMathSuite() : runParallaxSuite()) ? 1 : 0;

