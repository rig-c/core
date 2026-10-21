/** Live, per-instance parameter patches (issue #1541). No model writes or history resets. */
import { CoreInputError, type CompiledDocument } from './index.ts';
import type { CorePhysicsRecord } from './constraints_physics.ts';

/** The six scalar responses a consumer can override; no units or range conversion. */
export interface PhysicsParameters {
  readonly strength: number;
  readonly damping: number;
  readonly inertia: number;
  readonly wind: number;
  readonly gravity: number;
  readonly mix: number;
}
/** Omitted fields keep their existing override, if any. */
export type PhysicsParameterPatch = Partial<PhysicsParameters>;
/** Detached snapshots. `effective` is null until this constraint has been evaluated. */
export interface PhysicsParameterRead {
  readonly override: PhysicsParameterPatch | null;
  readonly effective: PhysicsParameters | null;
}

const FIELDS = ['strength', 'damping', 'inertia', 'wind', 'gravity', 'mix'] as const;
const values = (r: CorePhysicsRecord): PhysicsParameters => ({ strength: r.strength, damping: r.damping, inertia: r.inertia, wind: r.wind, gravity: r.gravity, mix: r.mix });

/** Owned by one live track, including all entries of a composed track. */
export class LivePhysicsParameters {
  private readonly overrides = new Map<string, PhysicsParameterPatch>();
  private readonly evaluated = new Map<string, PhysicsParameters>();

  constructor(private readonly doc: CompiledDocument) {}

  private named(name: string): void {
    const constraint = this.doc.constraints.find((c) => c.name === name);
    if (constraint === undefined) throw new CoreInputError(`physics parameters: no constraint "${String(name)}"; this document declares [${this.doc.constraints.map((c) => c.name).join(', ')}]`);
    if (constraint.kind !== 'physics') throw new CoreInputError(`physics parameters: constraint "${name}" is ${constraint.kind}, not physics`);
  }

  set(name: string, patch: PhysicsParameterPatch): void {
    this.named(name);
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new CoreInputError(`physics parameters: constraint "${name}" patch is ${String(patch)}, not an object of finite fields [${FIELDS.join(', ')}]`);
    const checked: Partial<Record<(typeof FIELDS)[number], number>> = {};
    // Validate the complete patch before publishing it, including unknown symbol keys.
    for (const key of Reflect.ownKeys(patch)) {
      if (typeof key !== 'string' || !(FIELDS as readonly string[]).includes(key)) throw new CoreInputError(`physics parameters: constraint "${name}" field "${String(key)}" is unknown; expected [${FIELDS.join(', ')}]`);
      const field = key as (typeof FIELDS)[number];
      const value = patch[field];
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new CoreInputError(`physics parameters: constraint "${name}" field "${field}" is ${String(value)}, not a finite number`);
      checked[field] = value;
    }
    if (Reflect.ownKeys(checked).length > 0) this.overrides.set(name, { ...this.overrides.get(name), ...checked });
  }

  read(name: string): PhysicsParameterRead {
    this.named(name);
    const patch = this.overrides.get(name);
    const effective = this.evaluated.get(name);
    return { override: patch === undefined ? null : { ...patch }, effective: effective === undefined ? null : { ...effective } };
  }

  clear(name: string): void {
    this.named(name);
    this.overrides.delete(name);
  }

  /** Called only for an active constraint, after the sliders and immediately before its step. */
  apply(record: CorePhysicsRecord): CorePhysicsRecord {
    const patch = this.overrides.get(record.name);
    const posed = patch === undefined ? record : { ...record, ...patch };
    this.evaluated.set(record.name, values(posed));
    return posed;
  }
}
