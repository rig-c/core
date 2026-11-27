import { createHash } from 'node:crypto';
import type { Plate } from '../tools/plate.ts';

export const LOOP_SEAM_FILE = 'loop-seam.json';
export const LOOP_WRAP_FILE = 'loop-wrap.rgba';

export interface LoopSeamBar {
  channelDelta: number;
  pixelsAbove: number;
}

export function loopSeamPixels(first: Plate, wrap: Plate, bar?: LoopSeamBar) {
  if (first.width !== wrap.width || first.height !== wrap.height) {
    throw new Error('LOOP_SEAM_UNAVAILABLE: first and wrap images have different dimensions');
  }
  let differingPixels = 0;
  let maxChannelDelta = 0;
  let pixelsAbove = 0;
  for (let i = 0; i < first.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(first.data[i] - wrap.data[i]),
      Math.abs(first.data[i + 1] - wrap.data[i + 1]),
      Math.abs(first.data[i + 2] - wrap.data[i + 2]),
      Math.abs(first.data[i + 3] - wrap.data[i + 3]),
    );
    if (delta > 0) differingPixels++;
    if (bar !== undefined && delta > bar.channelDelta) pixelsAbove++;
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return { differingPixels, maxChannelDelta, ...(bar === undefined ? {} : { pixelsAbove }) };
}

export function loopSampleFile(path: string, bytes: Uint8Array) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { path, sha256 };
}
