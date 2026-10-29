/** Local scalar readings shared by the two posers; no stepping or inferred world decomposition. */
import type { ModelBone } from './model.ts';
import type { ChannelValue } from './render_shared.ts';

const FIELDS = {
  rotation: ['rotate', 0], x: ['translate.x', 0], y: ['translate.y', 0],
  scaleX: ['scale.x', 1], scaleY: ['scale.y', 1], shearX: ['shear.x', 0], shearY: ['shear.y', 0],
} as const;

export function localChannels(bones: readonly ModelBone[], sliders: readonly { name: string; time: number }[]): ChannelValue[] {
  const out: ChannelValue[] = [];
  for (const bone of bones) {
    for (const field of Object.keys(FIELDS) as Array<keyof typeof FIELDS>) {
      const [name, setup] = FIELDS[field];
      out.push({ path: ['bone', bone.name, name], value: bone[field] ?? setup });
    }
  }
  for (const slider of sliders) out.push({ path: ['slider', slider.name, 'mapped-time'], value: slider.time });
  return out;
}

/** Offsets from setup, x/y per influence for weighted meshes, x/y per vertex otherwise. */
export function deformChannels(slot: string, attachment: string, deform: readonly number[], setup: readonly number[], source?: object): ChannelValue[] {
  return setup.map((v, i) => {
    const read = { path: ['deform', slot, attachment, String(i)], value: deform.length === 0 ? 0 : deform[i] - v };
    return source === undefined ? read : identifyAttachment(read, source);
  });
}

// The display name can be overridden by an export. Keep actual source identity out of serialized geometry.
const attachmentSources = new WeakMap<object, object>();
export function identifyAttachment<T extends object>(pose: T, source: object): T {
  attachmentSources.set(pose, source);
  return pose;
}
export function attachmentSource(pose: object): object | undefined { return attachmentSources.get(pose); }
