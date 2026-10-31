import { hypot2 } from './numeric.ts';
import { attachmentSource } from './render_channels.ts';
/** Named-dial sampling through the core poser, independent reset poses, no timeline playback. */
import { corePoser } from './render_core.ts';
import { readModel, CoreInputError, underSkin, underNoSkin } from './core/index.ts';
import { sliderRecordOf, DIAL_BONE_FIELDS, type DialBoneField } from './core/hooks.ts';
import { parallaxOf, type ParallaxMesh, type ParallaxReading } from './parallax.ts';
import { renderFrame, TRANSPARENT_BACKGROUND, viewportFor, type Frame, type Posed } from './render_shared.ts';
import { Plate } from '../tools/plate.ts';
import { premultipliedDiff } from './extremes.ts';

export function sampleParallax(modelText: string, atlasText: string, dial: string, skin?: string) {
  const doc = readModel(modelText);
  const view = skin === undefined ? underNoSkin(doc) : underSkin(doc, skin);
  const record = sliderRecordOf(view, dial); // Names the missing dial before any output is made.
  const raw = JSON.parse(modelText) as { constraints: Array<{ kind: string; name: string; max?: number }> };
  const declared = raw.constraints.find((c) => c.kind === 'slider' && c.name === dial);
  const duration = record.timelines.duration;
  const start = record.bone === null ? 0 : record.from;
  const finish = record.bone === null ? duration : declared?.max ?? (record.scale === 0 ? NaN : record.from + (duration - record.to) / record.scale);
  if (![start, finish].every(Number.isFinite) || start === finish) throw new CoreInputError(`--parallax dial ${JSON.stringify(dial)}: no finite nonzero range (from ${start}, max ${finish}); declare a range or a nonzero mapping`);
  const poser = corePoser(modelText, atlasText);
  const frame = (posed: Posed, index: number): Frame => ({ index, time: 0, pieces: posed.pieces({ subset: undefined, unclipped: false, texture: false }), attachments: posed.attachments(true) });
  const setup = frame(poser.setup(skin), -1);
  const geometry = (f: Frame): ParallaxMesh[] => (f.attachments ?? []).map((a) => ({
    slot: a.slot, attachment: a.attachment, vertices: [...a.vertices], identity: attachmentSource(a),
    kind: (attachmentSource(a) as { kind?: string } | undefined)?.kind === 'region' ? 'region' : 'mesh',
  }));
  const bone = view.bones.find((b) => b.name === record.bone);
  const base = (field: DialBoneField): number => bone?.[field] ?? (field === 'scaleX' || field === 'scaleY' ? 1 : 0);
  const ask = (field: DialBoneField | null, value: number) => poser.dial(dial, field === null || record.bone === null ? { slider: dial, time: value } : { bone: record.bone, field, value }, skin);
  const fields = record.bone === null ? [] : record.local ? [record.property === 'rotate' ? 'rotation' as const : record.property] : [...DIAL_BONE_FIELDS];
  let field: DialBoneField | null = fields[0] ?? null;
  let u0 = field === null ? record.time : base(field), v0 = record.time, gain = 1;
  if (record.bone !== null) {
    let best = 0;
    for (const candidate of fields) {
      const u = base(candidate), a = ask(candidate, u).read, b = ask(candidate, u + 1).read;
      if (a !== null && b !== null && Math.abs(b - a) > best) { best = Math.abs(b - a); field = candidate; u0 = u; v0 = a; gain = b - a; }
    }
    if (best < 1e-10) throw new CoreInputError(`--parallax dial ${JSON.stringify(dial)}: no driving bone field moves its property; inspect constraints on ${JSON.stringify(record.bone)}`);
  }
  const setupValue = record.bone === null ? record.time : v0;
  const samples: Array<{ value: number; meshes: ParallaxMesh[]; appliedTime: number | null; reason: string | null }> = [];
  const frames: Frame[] = [];
  const values = Array.from({ length: 9 }, (_, i) => Math.min(start, finish) + Math.abs(finish - start) * i / 8);
  for (const [index, value] of values.entries()) {
    let drive = u0 + (value - v0) / gain;
    let previous = u0, previousRead = v0;
    let result: ReturnType<typeof ask> | undefined;
    let reason: string | null = null;
    for (let iteration = 0; iteration < 16; iteration++) {
      if (!Number.isFinite(drive) || Math.abs(drive) > 2 ** 24) { reason = 'dial drive is outside finite ±2^24'; break; }
      result = ask(field, drive);
      const read = result.read ?? drive;
      if (Math.abs(read - value) <= 1e-9 * (1 + Math.abs(value))) break;
      if (read === previousRead) { reason = 'dial reader did not respond to the drive'; break; }
      const next = drive + (value - read) * (drive - previous) / (read - previousRead);
      previous = drive; previousRead = read; drive = next;
    }
    const actual = result?.read ?? drive;
    if (Math.abs(actual - value) > 1e-9 * (1 + Math.abs(value))) reason ??= 'dial reader did not reach requested value (world rotation may wrap)';
    const wantedTime = record.bone === null ? value : record.to + (value - record.from) * record.scale;
    const appliedTime = record.bone === null ? wantedTime : record.loop ? duration + wantedTime % duration : Math.max(0, wantedTime);
    if (result === undefined || !Number.isFinite(result.applied) || Math.abs(result.applied - appliedTime) > 1e-7 * (1 + Math.abs(appliedTime))) reason ??= 'slider did not apply the time its mapping requested (inactive or overwritten)';
    if (reason !== null || result === undefined) { samples.push({ value, meshes: [], appliedTime: result?.applied ?? null, reason }); continue; }
    const f = frame(result.posed, index); frames.push(f);
    samples.push({ value, meshes: geometry(f), appliedTime: result.applied, reason: null });
  }
  const reading = { ...parallaxOf(dial, geometry(setup), samples, setupValue),
    sampling: { poser: 'core', skin: skin ?? null, range: [start, finish], values, setupValue, driveField: field, reset: 'independent Physics.reset per value; other inputs stay at setup; all constraints are applied and other sliders may respond to the driven bone; no animation track is played', depth: 'unavailable: adapter supplies no per-vertex depth or world turn axis; compiled model retains depth summaries only; no inference from motion', samples: samples.map(({ meshes: _meshes, ...s }) => s) },
    picture: { status: 'SKIP' as 'READ' | 'SKIP', reason: 'no drawable comparable extremes', file: null as string | null },
  };
  return { reading, setup, frames, values, rest: geometry(setup) };
}

/** Setup, dial min/max, native diffs and affine-residual heat maps; one shared fitted world box. */
export function parallaxPlate(sampled: ReturnType<typeof sampleParallax>, pages: Map<string, Plate>, maxSide: number): Plate | null {
  const { reading, setup, frames } = sampled;
  const left = frames.find((f) => f.index === 0), right = frames.find((f) => f.index === 8);
  if (left === undefined || right === undefined) return null;
  const all = [setup, ...frames].flatMap((f) => (f.attachments ?? []).flatMap((a) => a.vertices));
  if (!all.length) return null;
  const xs = all.filter((_, i) => i % 2 === 0), ys = all.filter((_, i) => i % 2 === 1);
  const viewport = viewportFor(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), maxSide);
  if (![viewport.scale, viewport.width, viewport.height].every(Number.isFinite)) return null;
  const image = (f: Frame): Plate => renderFrame(f, pages, viewport, TRANSPARENT_BACKGROUND);
  const base = image(setup), min = image(left), max = image(right);
  const heatMax = Math.max(0, ...[0, 8].flatMap((i) => reading.samples[i].meshes.flatMap((m) => m.affine.residuals.flatMap((_, k, a) => k % 2 ? [] : [hypot2(a[k], a[k + 1])]))));
  const heat = (f: Frame, index: number): Plate => {
    const out = new Plate(viewport.width, viewport.height);
    out.rect(0, 0, out.width, out.height, [20, 20, 20, 255]);
    for (const mesh of reading.samples[index].meshes) {
      const a = f.attachments?.find((a) => a.slot === mesh.slot && a.attachment === mesh.attachment);
      if (a === undefined || mesh.affine.status !== 'READ') continue;
      for (let k = 0; k < a.vertices.length; k += 2) {
        const residual = hypot2(mesh.affine.residuals[k], mesh.affine.residuals[k + 1]);
        const v = heatMax > 0 ? residual / heatMax : 0;
        out.rect(Math.round((a.vertices[k] - viewport.minX) * viewport.scale) - 1, Math.round((viewport.maxY - a.vertices[k + 1]) * viewport.scale) - 1, 3, 3, [Math.round(255 * v), Math.round(160 * (1 - v)), Math.round(255 * (1 - v)), 255]);
      }
    }
    return out;
  };
  const panels = [base, min, max, premultipliedDiff(max, min), heat(left, 0), heat(right, 8)];
  const legend = `setup | dial min ${sampled.values[0]} | dial max ${sampled.values[8]} | abs(max-min) | affine residual min | affine residual max. Blue=0 red=${heatMax.toPrecision(5)} world px; dark=unavailable. Geometry only, original mesh vertices; no visibility claim. Scale ${viewport.scale.toPrecision(5)} px/world unit.`;
  const width = viewport.width * panels.length, columns = Math.max(1, Math.floor(width / 6)), lines = Math.ceil(legend.length / columns);
  const out = new Plate(width, viewport.height + 9 * lines + 4);
  panels.forEach((panel, k) => { for (let y = 0; y < panel.height; y++) out.data.set(panel.data.subarray(y * panel.width * 4, (y + 1) * panel.width * 4), (y * width + k * panel.width) * 4); });
  out.rect(0, viewport.height, width, out.height - viewport.height, [0, 0, 0, 255]);
  for (let i = 0; i < lines; i++) out.text(legend.slice(i * columns, (i + 1) * columns), 0, viewport.height + 2 + i * 9, 1, [255, 255, 255, 255]);
  return out;
}
