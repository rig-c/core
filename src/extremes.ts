/** render --extremes: observations on one already-sampled set, never a quality gate. */
import { Plate } from '../tools/plate.ts';
import { hypot2 } from './numeric.ts';
import { attachmentSource } from './render_channels.ts';
import { renderFrame, TRANSPARENT_BACKGROUND, type Frame, type PoseOptions, type Viewport } from './render_shared.ts';

export class ExtremesError extends Error {}
export interface ExtremeFrame { index: number; time: number }
export interface ChannelExtreme {
  path: string[];
  min: ExtremeFrame & { value: number; reason: string };
  max: ExtremeFrame & { value: number; reason: string };
}
export interface ExtremesReading {
  spec: 'rigc-extremes/1';
  animation: string | null;
  fps: number;
  grid: ExtremeFrame[];
  method: {
    channels: string;
    geometry: string;
    ties: string;
    geometryScope: string;
    panels: string;
    diff: string;
  };
  channels: ChannelExtreme[];
  channelStatus: 'READ' | 'PARTIAL' | 'SKIP';
  channelRefusals: Array<{ path: string[] | null; reason: string }>;
  status: 'READ' | 'SKIP';
  reason: string;
  geometryPair: { frames: [ExtremeFrame, ExtremeFrame]; maxVertexDistance: number; witness: { slot: string; attachment: string; vertex: number } } | null;
}

const stamp = (f: Frame): ExtremeFrame => ({ index: f.index, time: f.time });

/** Channel validity is independent of geometry and of an image. A bad series cannot erase another series. */
function channelExtrema(frames: readonly Frame[]): Pick<ExtremesReading, 'channels' | 'channelStatus' | 'channelRefusals'> {
  const channels = new Map<string, ChannelExtreme>();
  const refusals = new Map<string, { path: string[] | null; reason: string }>();
  const sources = new Map<string, object>();
  const refuse = (path: string[] | null, why: string): void => {
    const key = JSON.stringify(path);
    channels.delete(key);
    refusals.set(key, { path, reason: `EXTREMES_CHANNEL_REFUSED: ${why}` });
  };
  for (const f of frames) {
    if (f.channelError !== undefined || f.channels === undefined) {
      // A failed whole-frame read leaves every series' extrema unknown on this grid.
      return { channels: [], channelStatus: 'SKIP', channelRefusals: [{ path: null, reason: `EXTREMES_CHANNEL_REFUSED: frame ${f.index}: ${f.channelError ?? 'local channels were not sampled'}` }] };
    }
    for (const sample of f.channels) {
      const { path, value } = sample;
      const key = JSON.stringify(path);
      if (refusals.has(key)) continue;
      if (!Number.isFinite(value)) { refuse(path, `frame ${f.index}, channel ${key}: found ${value}, required finite`); continue; }
      if (path[0] === 'deform') {
        const source = attachmentSource(sample);
        if (source === undefined) { refuse(path, `frame ${f.index}, deform channel ${key}: original source identity unavailable`); continue; }
        const before = sources.get(key);
        if (before !== undefined && before !== source) {
          refuse(path, `frame ${f.index}, deform channel ${key}: one slot/display-name/coordinate names different original attachment sources; separate extrema under that name are unavailable`);
          continue;
        }
        sources.set(key, source);
      }
      const read = channels.get(key);
      if (read === undefined) {
        channels.set(key, { path,
          min: { ...stamp(f), value, reason: 'minimum supplied local channel value on this grid; earliest tie; deform/slider samples only where applicable' },
          max: { ...stamp(f), value, reason: 'maximum supplied local channel value on this grid; earliest tie; deform/slider samples only where applicable' },
        });
      } else {
        if (value < read.min.value) read.min = { ...read.min, ...stamp(f), value };
        if (value > read.max.value) read.max = { ...read.max, ...stamp(f), value };
      }
    }
  }
  const byKey = <T>(rows: Map<string, T>): T[] => [...rows].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, row]) => row);
  return { channels: byKey(channels), channelStatus: refusals.size === 0 ? 'READ' : channels.size === 0 ? 'SKIP' : 'PARTIAL', channelRefusals: byKey(refusals) };
}

/** Original attachment identity, independent of draw order and of a clipper's triangles. */
function geometryPair(frames: readonly Frame[], subset?: Pick<PoseOptions, 'slots' | 'hidden'>): ExtremesReading['geometryPair'] {
  const selected = (slot: string): boolean => (subset?.slots === undefined || subset.slots.includes(slot)) && !subset?.hidden?.includes(slot);
  const geometry = frames.map((f) => {
    if (f.attachments === undefined) throw new ExtremesError(`frame ${f.index}: original attachment geometry was not sampled`);
    const attachments = f.attachments.filter((a) => selected(a.slot));
    for (const a of attachments) if (attachmentSource(a) === undefined) {
      throw new ExtremesError(`frame ${f.index}, slot ${JSON.stringify(a.slot)}, attachment ${JSON.stringify(a.attachment)}: original source identity unavailable; required stable original-vertex correspondence`);
    }
    const byId = new Map(attachments.map((a) => [JSON.stringify([a.slot, a.attachment]), a]));
    return [...byId].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  });
  const first = geometry[0] ?? [];
  for (let i = 0; i < geometry.length; i++) {
    const row = geometry[i];
    if (row.length !== first.length || row.some(([key, a], k) => key !== first[k]?.[0] || a.vertices.length !== first[k]?.[1].vertices.length || attachmentSource(a) !== attachmentSource(first[k][1]))) {
      throw new ExtremesError(`frame ${frames[i].index}: attachment identity or vertex count changed (including actual source identity); cannot compare corresponding original vertices (expected ${first.map(([k, a]) => `${k}:${a.vertices.length / 2}`).join(', ')}, found ${row.map(([k, a]) => `${k}:${a.vertices.length / 2}`).join(', ')})`);
    }
    for (const [, a] of row) {
      if (a.vertices.length % 2 || a.vertices.some((v) => !Number.isFinite(v))) throw new ExtremesError(`frame ${frames[i].index}, slot ${JSON.stringify(a.slot)}, attachment ${JSON.stringify(a.attachment)}: expected finite x/y vertex pairs`);
    }
  }
  let best = 0;
  let pair: ExtremesReading['geometryPair'] = null;
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    for (let k = 0; k < first.length; k++) {
      const a = geometry[i][k][1];
      const b = geometry[j][k][1];
      for (let v = 0; v < a.vertices.length; v += 2) {
        const distance = hypot2(a.vertices[v] - b.vertices[v], a.vertices[v + 1] - b.vertices[v + 1]);
        if (!Number.isFinite(distance)) throw new ExtremesError(`frames ${frames[i].index}/${frames[j].index}, slot ${JSON.stringify(a.slot)} vertex ${v / 2}: world distance is not finite`);
        if (distance > best) {
          best = distance;
          pair = { frames: [stamp(frames[i]), stamp(frames[j])], maxVertexDistance: distance, witness: { slot: a.slot, attachment: a.attachment, vertex: v / 2 } };
        }
      }
    }
  }
  return pair;
}

export function extremesOf(animation: string | null, fps: number, frames: readonly Frame[], subset?: Pick<PoseOptions, 'slots' | 'hidden'>): ExtremesReading {
  const observedChannels = channelExtrema(frames);
  let pair: ExtremesReading['geometryPair'] = null;
  let geometryFailure: string | undefined;
  try { pair = geometryPair(frames, subset); }
  catch (err) { geometryFailure = `EXTREMES_OBSERVATION_REFUSED: geometry: ${err instanceof Error ? err.message : String(err)}`; }
  return {
    spec: 'rigc-extremes/1', animation, fps, grid: frames.map(stamp),
    method: {
      channels: 'Sampled posed local bone rotate, translate.x/y, scale.x/y, shear.x/y (including held components), deform offsets per coordinate, and actually applied slider mapped-time; channelStatus/channelRefusals describe independent failures. Deform series with one display-name path but different original sources are refused individually; independent of geometry pair. No key-time interpolation outside this grid.',
      geometry: 'Exhaustive frame pairs i<j; distance=max over corresponding original attachment vertices of hypot2(dx,dy)=sqrt(dx*dx+dy*dy), dx/dy in world units (the shared deterministic length helper).',
      ties: 'First in frame-grid order; geometry ties keep earliest (i,j), then attachment identity in UTF-16 code-unit order, then vertex index. Timestamps are copied from sampled frames.',
      geometryScope: 'Original region/mesh vertices, before clipping, occlusion and tint alpha; filtered explicitly by --slot/--hide. Changing attachment source identity/count is refused, including different sources with equal display names and vertex counts.',
      panels: 'setup | min | max | abs(max-min) | abs(min-setup) | abs(max-setup). min/max label earlier/later frame of the geometry pair, not joint channel minima/maxima. Native viewport size and scale, legend appended below.',
      diff: 'L=round(max(abs(Ra*Aa/255-Rb*Ab/255),abs(Ga*Aa/255-Gb*Ab/255),abs(Ba*Aa/255-Bb*Ab/255),abs(Aa-Ab))); opaque (L,L,L,255) on black. No amplification or scaling.',
    },
    ...observedChannels,
    status: pair === null ? 'SKIP' : 'READ',
    reason: geometryFailure ?? (pair === null ? 'no motion in corresponding selected original vertices on this frame grid' : 'farthest geometry pair on this frame grid; see method and witness'),
    geometryPair: pair,
  };
}

/** A refused observation is a named SKIP, never a failed render. */
export function extremesRefusal(animation: string | null, fps: number, frames: readonly Frame[], reason: string, prior?: ExtremesReading): ExtremesReading {
  const reading = prior ?? { ...extremesOf(animation, fps, []), ...channelExtrema(frames) };
  return { ...reading, grid: frames.map(stamp), status: 'SKIP', reason: `EXTREMES_OBSERVATION_REFUSED: image: ${reason}` };
}

export function extremesText(reading: ExtremesReading): string { return JSON.stringify(reading, null, 2) + '\n'; }
export function extremesLine(reading: ExtremesReading): string {
  const name = JSON.stringify(reading.animation ?? 'setup-pose');
  const p = reading.geometryPair;
  const channels = `; channels ${reading.channelStatus} (${reading.channels.length} valid, ${reading.channelRefusals.length} refused)`;
  return reading.status === 'SKIP' || p === null ? `EXTREMES ${name} SKIP: ${reading.reason}${channels}` : `EXTREMES ${name} geometry pair f${p.frames[0].index} @ ${p.frames[0].time}s / f${p.frames[1].index} @ ${p.frames[1].time}s; max vertex distance ${p.maxVertexDistance} world units${channels}`;
}

/** Alpha participates as a fourth premultiplied channel; RGB at alpha zero contributes zero. */
export function premultipliedDiff(a: Plate, b: Plate): Plate {
  if (a.width !== b.width || a.height !== b.height) throw new ExtremesError('diff dimensions differ; required identical native pixel grids');
  const out = new Plate(a.width, a.height);
  for (let i = 0; i < out.data.length; i += 4) {
    let d = Math.abs(a.data[i + 3] - b.data[i + 3]);
    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a.data[i + c] * a.data[i + 3] / 255 - b.data[i + c] * b.data[i + 3] / 255));
    out.data[i] = out.data[i + 1] = out.data[i + 2] = Math.round(d);
    out.data[i + 3] = 255;
  }
  return out;
}

export function extremesPlate(reading: ExtremesReading, setup: Frame, frames: readonly Frame[], pages: Map<string, Plate>, viewport: Viewport): Plate | null {
  const pair = reading.geometryPair;
  if (reading.status === 'SKIP' || pair === null) return null;
  const find = (index: number): Frame => {
    const f = frames.find((f) => f.index === index);
    if (f === undefined) throw new ExtremesError(`chosen frame ${index} is absent`);
    return f;
  };
  const base = renderFrame(setup, pages, viewport, TRANSPARENT_BACKGROUND);
  const min = renderFrame(find(pair.frames[0].index), pages, viewport, TRANSPARENT_BACKGROUND);
  const max = renderFrame(find(pair.frames[1].index), pages, viewport, TRANSPARENT_BACKGROUND);
  const panels = [base, min, max, premultipliedDiff(max, min), premultipliedDiff(min, base), premultipliedDiff(max, base)];
  const width = viewport.width * 6;
  const legend = `1 setup | 2 min=f${pair.frames[0].index} (${pair.frames[0].time}s) | 3 max=f${pair.frames[1].index} (${pair.frames[1].time}s) | 4 abs(max-min) | 5 abs(min-setup) | 6 abs(max-setup). Geometry pair ordered by frame; channels listed separately in JSON. Diff: max premultiplied RGBA incl alpha, luminance on black, no amplification. Scale ${viewport.scale} px/world-unit.`;
  const columns = Math.max(1, Math.floor(width / 6));
  const rows = Math.ceil(legend.length / columns);
  const out = new Plate(width, viewport.height + rows * 9 + 4);
  // Legend black, all pixels opaque there; pictures retain their native alpha.
  for (let i = viewport.height * width * 4 + 3; i < out.data.length; i += 4) out.data[i] = 255;
  panels.forEach((panel, k) => {
    for (let y = 0; y < viewport.height; y++) out.data.set(panel.data.subarray(y * panel.width * 4, (y + 1) * panel.width * 4), (y * width + k * panel.width) * 4);
  });
  for (let row = 0; row < rows; row++) out.text(legend.slice(row * columns, (row + 1) * columns), 0, viewport.height + 2 + row * 9, 1, [255, 255, 255, 255]);
  return out;
}
