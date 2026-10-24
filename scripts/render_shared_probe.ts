/** Actual installed-package calls, run in a fresh process in each runtime phase. */
export const RENDER_SHARED_PROBE_SOURCE = String.raw`
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const plan = JSON.parse(readFileSync('render_shared_probe.json', 'utf8'));
const spec = plan.name + '/render-shared';
const phase = process.argv[2];
let checks = 0;
const check = (ok, detail) => { checks++; if (!ok) throw new Error(detail); };
const refusal = (body, Class, names) => {
  let got; try { body(); } catch (e) { got = e; }
  check(got instanceof Class && names.every(n => got.message.includes(n)),
    'expected ' + Class.name + ' naming ' + names.join(', ') + '; got ' + (got ? got.constructor.name + ': ' + got.message : 'acceptance'));
};
try {
  const m = await import(spec);
  const resolved = import.meta.resolve(spec);
  check(resolved.includes('/node_modules/' + plan.name + '/'), spec + ' resolved outside this install: ' + resolved);
  const names = ['loadCandidate','throughPoser','sampleAnimation','sampleSetupPose','pageFor','projector','rasterisePiece','renderFrame',
    'CandidateAtlasError','CandidatePairError','PoserChoiceError','SlotSubsetError','SpineRuntimeError','CoreInputError'];
  check(JSON.stringify(Object.keys(m).sort()) === JSON.stringify(names.sort()), spec + ' does not expose exactly the agreed reads and failures');
  const dir = resolve(plan.build);
  const load = (at, forced, atlasless = false) => {
    const skeleton = join(at, 'skeleton.json'), atlas = join(at, 'skeleton.atlas');
    return m.loadCandidate({ skeletonText: readFileSync(skeleton,'utf8'), atlasText: atlasless || !existsSync(atlas) ? null : readFileSync(atlas,'utf8'), atlasDir: at, label: skeleton }, { skeleton, atlas }, forced);
  };
  // Even with the optional package present, this entry does not register it.
  refusal(() => load(dir, 'spine'), m.SpineRuntimeError, ['--poser spine', 'runtime side is not installed']);
  if (phase === 'without-runtime') {
    let resolves = false; try { import.meta.resolve(plan.runtime); resolves = true; } catch {}
    check(!resolves, 'the empty install unexpectedly resolves ' + plan.runtime);
  }
  const candidate = load(dir);
  check(candidate.choice.core !== null, 'the real model/digest/atlas/roster did not select core');
  const read = m.throughPoser(candidate.choice, (poser, roster) => {
    check(roster.skins.includes('default') && roster.unposedUnder(undefined).size === 0, 'skin roster differs from the fixture');
    const setup = m.sampleSetupPose(poser, { bones: true, geometry: true })[0];
    const frames = m.sampleAnimation(poser, 'wave', 4, { bones: true, geometry: true });
    check(setup && setup.pieces.length === plan.slots.length && frames.length === 5, 'sampleSetupPose/sampleAnimation did not sample the real fixture');
    check(setup.pieces.some(p => p.kind === 'mesh') && setup.pieces.some(p => p.kind === 'region'), 'region and mesh reads were not both exercised');
    check(JSON.stringify(frames[0].pieces) !== JSON.stringify(frames[2].pieces), 'wave geometry did not move');
    check(JSON.stringify(poser.bones.map(b => b.name)) === JSON.stringify(plan.bones), 'bone roster differs');
    check(JSON.stringify(candidate.facts.slots.map(s => s.name)) === JSON.stringify(plan.slots), 'slot roster differs');
    refusal(() => m.sampleAnimation(poser, 'probe_missing_animation', 4), Error, ['probe_missing_animation', 'wave']);
    refusal(() => m.sampleSetupPose(poser, { slots: ['probe_missing_slot'] }), m.SlotSubsetError, ['probe_missing_slot']);
    refusal(() => m.sampleSetupPose(poser, { skin: 'probe_missing_skin' }), m.CoreInputError, ['probe_missing_skin']);
    return { setup, frames };
  });
  check(read.poser === 'core' && read.note.includes('rigc core'), 'automatic selection did not report core');
  const viewport = { minX: 0, minY: 0, maxX: 256, maxY: 256, scale: 1, width: 256, height: 256 };
  const project = m.projector(viewport);
  check(JSON.stringify(project(0, 0)) === '[0,256]' && JSON.stringify(project(256, 256)) === '[256,0]', 'projector changed its y-up mapping');
  let samples = 0, alpha = 0;
  for (const piece of read.value.setup.pieces) {
    const page = m.pageFor(candidate.pages, piece);
    check(page === candidate.pages.get(piece.page), 'pageFor did not select the named page');
    m.rasterisePiece(page, piece, project, viewport, (x,y,r,g,b,a) => {
      check(x >= 0 && y >= 0 && x < viewport.width && y < viewport.height && [r,g,b,a].every(Number.isFinite), 'rasterisePiece emitted an invalid pixel');
      samples++; alpha += a;
    });
  }
  check(samples > 0 && alpha > 0, 'rasterisePiece emitted no covered samples');
  const pixels = m.renderFrame(read.value.setup, candidate.pages, viewport, [0,0,0,0]);
  check(pixels.width === viewport.width && pixels.height === viewport.height && pixels.data.some((v,i) => i % 4 === 3 && v > 0), 'renderFrame produced no covered pixels');
  refusal(() => m.pageFor(new Map(), read.value.setup.pieces[0]), Error, [read.value.setup.pieces[0].slot, read.value.setup.pieces[0].page]);
  // A half-transparent red tap beside transparent blue stays red under bilinear
  // sampling; light/dark tint and the coverage/window filters remain the official ones.
  const { Plate } = await import(plan.name + '/plate');
  const tap = new Plate(2,1); tap.set(0,0,[200,0,0,255]); tap.set(1,0,[0,0,200,0]);
  const quad = { kind:'region', slot:'probe_tint', page:'probe_tap', world:[1,0,0,0,0,1,1,1],
    uvs:[1,1,0,1,0,0,1,0], tint:[0.5,1,1,0.5], dark:[0,0.5,0] };
  const unit = {minX:0,minY:0,maxX:1,maxY:1,scale:1,width:1,height:1};
  const taps = []; m.rasterisePiece(tap,quad,m.projector(unit),unit,(...pixel) => taps.push(pixel));
  check(JSON.stringify(taps) === '[[0,0,100,128,0,64]]', 'bilinear alpha/two-colour tint changed: ' + JSON.stringify(taps));
  for (const filtered of [{...quad,tint:[1,1,1,0]}, {...quad,uvWindow:{u0:0,v0:0,u1:0.1,v1:0.1}}]) {
    let covered = 0; m.rasterisePiece(tap,filtered,m.projector(unit),unit,() => covered++);
    check(covered === 0, 'zero alpha or UV window did not filter coverage');
  }
  const hidden = m.throughPoser(candidate.choice,p => m.sampleSetupPose(p,{hidden:['arm']})[0]);
  check(hidden.value.pieces.every(p => p.slot !== 'arm') && hidden.value.pieces.length === read.value.setup.pieces.length-1, 'slot filter changed');
  const absentAtlas = m.throughPoser(load(dir, undefined, true).choice, p => m.sampleSetupPose(p));
  check(absentAtlas.poser === 'core' && JSON.stringify(absentAtlas.value[0].pieces) === JSON.stringify(read.value.setup.pieces), 'a /3 build without an atlas changed its pose');
  const clone = (label, edit, Class, names) => {
    const at = mkdtempSync(join(process.cwd(), 'render-shared-' + label + '-'));
    try { cpSync(dir, at, { recursive: true }); edit(at); refusal(() => load(at), Class, names); }
    finally { rmSync(at, { recursive: true, force: true }); }
  };
  clone('model', at => rmSync(join(at,'skeleton.model.json')), m.SpineRuntimeError, ['no skeleton.model.json']);
  clone('digest', at => writeFileSync(join(at,'skeleton.json'), readFileSync(join(at,'skeleton.json'),'utf8') + '\n'), m.SpineRuntimeError, ['sha256', 'document records']);
  clone('atlas', at => {
    const path = join(at,'skeleton.atlas'), text = readFileSync(path,'utf8');
    const moved = text.replace(/size:\s*(\d+)\s*,\s*(\d+)/, (_,w,h) => 'size: ' + (Number(w)+1) + ',' + h);
    check(moved !== text, 'atlas plant changed no size'); writeFileSync(path,moved);
  }, m.SpineRuntimeError, ['pages[0].width', 'atlas']);
  clone('roster', at => {
    const path = join(at,'skeleton.json'), s = JSON.parse(readFileSync(path,'utf8')); s.bones[0].name += '_different';
    const text = JSON.stringify(s); writeFileSync(path,text);
    const modelPath = join(at,'skeleton.model.json'), model = JSON.parse(readFileSync(modelPath,'utf8'));
    model.spine.sha256 = createHash('sha256').update(text).digest('hex'); writeFileSync(modelPath,JSON.stringify(model));
  }, m.SpineRuntimeError, ['bones', 'differ']);
  clone('page', at => rmSync(join(at, 'skeleton.png')), m.CandidatePairError, ['skeleton.png', 'page']);
  clone('missing-atlas', at => { rmSync(join(at,'skeleton.model.json')); rmSync(join(at,'skeleton.atlas')); }, m.CandidateAtlasError, ['skeleton.atlas']);
  // A callback refusal must not become silent fallback in the runtime-free entry.
  refusal(() => m.throughPoser(candidate.choice, () => { throw new m.CoreInputError('probe_core_refusal'); }), m.SpineRuntimeError, ['fallback']);
  refusal(() => m.throughPoser(load(dir,'core').choice, () => { throw new m.CoreInputError('probe_core_refusal'); }), m.PoserChoiceError, ['probe_core_refusal']);
  if (phase === 'runtime-present') {
    const eager = await import(plan.name + '/render');
    for (const name of ['loadCandidate','throughPoser','sampleAnimation','sampleSetupPose','pageFor','projector','rasterisePiece','renderFrame']) check(m[name] === eager[name], 'runtime-present identity differs: ' + name);
    const spine = load(dir,'spine');
    const actual = m.throughPoser(spine.choice, p => ({ setup: m.sampleSetupPose(p,{bones:true,geometry:true})[0], frames: m.sampleAnimation(p,'wave',4,{bones:true,geometry:true}) }));
    check(actual.poser === 'spine', 'forced Spine path did not report Spine');
    // ArrayLike UV stores may have different constructors; compare every key and
    // numeric element exactly, independent of insertion order or storage class.
    const canonical = value => {
      if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value, canonical);
      if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
      return value;
    };
    check(JSON.stringify(canonical(actual.value)) === JSON.stringify(canonical(read.value)), 'runtime-present core/Spine setup or animation geometry differs');
    const other = m.renderFrame(actual.value.setup,spine.pages,viewport,[0,0,0,0]);
    check(Buffer.from(other.data).equals(Buffer.from(pixels.data)), 'runtime-present core/Spine raster pixels differ');
  }
  console.log('RENDER_SHARED_OK ' + JSON.stringify({ phase, checks, pieces: read.value.setup.pieces.length, frames: read.value.frames.length, samples, pixelSha256: createHash('sha256').update(pixels.data).digest('hex') }));
} catch (e) {
  console.log('RENDER_SHARED_BAD ' + spec + ': ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
}
`;
