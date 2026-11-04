/** Visible boundary displacement on the recorded pixel grid, without registration or thresholds. */
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate, type Plate, type RGBA } from '../tools/plate.ts';
import { FRAMES_SPEC, type FramesSidecar } from './render_shared.ts';

type DistanceReading = { status: 'READ'; maxPixels: number } | { status: 'SKIP'; reason: string };

/** Background-coloured pixels carry no observable foreground coverage. */
export function visibleBoundary(plate: Plate, background: RGBA): number[] {
  const { width, height, data } = plate;
  const foreground = new Uint8Array(width * height);
  for (let pixel = 0; pixel < foreground.length; pixel++) {
    foreground[pixel] = background.some((value, channel) => data[pixel * 4 + channel] !== value) ? 1 : 0;
  }
  const boundary: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (foreground[pixel] && (
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        !foreground[pixel - 1] || !foreground[pixel + 1] ||
        !foreground[pixel - width] || !foreground[pixel + width]
      )) boundary.push(pixel);
    }
  }
  return boundary;
}

/** Exact eight-neighbour nearest-boundary distance in L-infinity pixels. Linear in canvas area. */
function distances(width: number, height: number, boundary: readonly number[]): Int32Array {
  const distance = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(distance.length);
  let end = 0;
  for (const pixel of boundary) {
    distance[pixel] = 0;
    queue[end++] = pixel;
  }
  for (let head = 0; head < end; head++) {
    const pixel = queue[head];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nextX = x + dx, nextY = y + dy;
        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (distance[next] !== -1) continue;
        distance[next] = distance[pixel] + 1;
        queue[end++] = next;
      }
    }
  }
  return distance;
}

export function boundaryDistance(a: Plate, b: Plate, background: RGBA): DistanceReading {
  if (a.width !== b.width || a.height !== b.height) return { status: 'SKIP', reason: 'pixel dimensions differ' };
  const left = visibleBoundary(a, background), right = visibleBoundary(b, background);
  if (left.length === 0 || right.length === 0) {
    return { status: 'SKIP', reason: 'one or both frames have no visible foreground boundary' };
  }
  const toLeft = distances(a.width, a.height, left), toRight = distances(a.width, a.height, right);
  let maxPixels = 0;
  for (const pixel of left) maxPixels = Math.max(maxPixels, toRight[pixel]);
  for (const pixel of right) maxPixels = Math.max(maxPixels, toLeft[pixel]);
  return { status: 'READ', maxPixels };
}

const SCHEDULE_FIELDS = ['animation', 'fps', 'sampled', 'written', 'stride', 'duration'] as const;

/** A failed observation remains a named SKIP and never becomes a zero distance. */
export function boundaryComparison(reference: string, current: string, sidecar: FramesSidecar) {
  const spec = 'rigc-boundary-difference/1';
  const skip = (reason: string) => ({ spec, status: 'SKIP' as const, reason });
  try {
    if (realpathSync(reference) === realpathSync(current)) return skip('reference and output directories are the same');
    const before = JSON.parse(readFileSync(join(reference, 'frames.json'), 'utf8')) as FramesSidecar;
    if (before.spec !== FRAMES_SPEC || !Array.isArray(before.sets)) return skip('reference requires a render frames.json');
    const coordinates = Object.keys(sidecar.viewport) as Array<keyof typeof sidecar.viewport>;
    if (!before.viewport || coordinates.some((key) => !Number.isFinite(before.viewport[key]) || before.viewport[key] !== sidecar.viewport[key])) {
      return skip('world viewport or pixel grid differs, use --viewport-from');
    }
    if (JSON.stringify(before.background) !== JSON.stringify(sidecar.background)) return skip('recorded backgrounds differ');
    if (before.skin !== sidecar.skin || JSON.stringify(before.slots) !== JSON.stringify(sidecar.slots) || JSON.stringify(before.hidden) !== JSON.stringify(sidecar.hidden)) {
      return skip(`skin or drawn slot selection differs: reference ${JSON.stringify({ skin: before.skin ?? null, slots: before.slots ?? null, hidden: before.hidden ?? null })}, current ${JSON.stringify({ skin: sidecar.skin ?? null, slots: sidecar.slots ?? null, hidden: sidecar.hidden ?? null })}. Required equal recorded selections`);
    }
    const frames: Array<{ set: string; file: string } & DistanceReading> = [];
    for (const set of sidecar.sets) {
      const match = before.sets.find((other) => other.dir === set.dir);
      if (!match || SCHEDULE_FIELDS.some((key) => match[key] !== set[key])) {
        return skip(`set ${JSON.stringify(set.dir)} has a different frame schedule`);
      }
      if (!set.dir || set.dir === '..' || set.dir === '.' || set.dir.includes('/') || set.dir.includes('\\')) {
        return skip('set directory must be one relative directory name');
      }
      const names = (root: string): string[] => readdirSync(join(root, set.dir)).filter((name) => /^f\d+\.png$/.test(name)).sort();
      const left = names(reference), right = names(current);
      if (left.length === 0 || left.length !== set.written || JSON.stringify(left) !== JSON.stringify(right)) {
        return skip(`set ${JSON.stringify(set.dir)} has missing or different frame files`);
      }
      for (const file of left) {
        const a = readPlate(join(reference, set.dir, file)), b = readPlate(join(current, set.dir, file));
        if ([a, b].some((plate) => plate.width !== sidecar.viewport.pixelWidth || plate.height !== sidecar.viewport.pixelHeight)) {
          return skip(`set ${JSON.stringify(set.dir)} frame ${file} pixel dimensions disagree with frames.json`);
        }
        frames.push({ set: set.dir, file, ...boundaryDistance(a, b, sidecar.background) });
      }
    }
    if (before.sets.length !== sidecar.sets.length || frames.length === 0) return skip('set roster differs or no frames were compared');
    const readings = frames.filter((frame) => frame.status === 'READ');
    let maxPixels = 0;
    for (const frame of readings) if (frame.status === 'READ') maxPixels = Math.max(maxPixels, frame.maxPixels);
    return {
      spec,
      status: readings.length === frames.length ? 'READ' : readings.length ? 'PARTIAL' : 'SKIP',
      metric: 'symmetric Hausdorff L-infinity pixels',
      coverage: 'visible pixels differing from the recorded background. Four-neighbour boundary including holes, clipped to viewport',
      referencePhysics: before.physicsMode ?? 'on',
      physics: sidecar.physicsMode ?? 'on',
      scope: { slots: sidecar.slots ?? null, hidden: sidecar.hidden ?? null },
      viewport: sidecar.viewport,
      maxPixels: readings.length ? maxPixels : null,
      frames,
    };
  } catch (error) {
    return skip(`boundary unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}
