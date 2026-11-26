/**
 * What the build declared, read off the document (issue #1054): the rig info
 * the archetype and declaration rules read, and each animation's declared
 * duration, which A09 holds the keys against.
 *
 * ⭐ **The document is the one source, on every spec it is read at.** A
 * `rigc-compiled/3`, `/2` and `/1` document all carry the `rig` section
 * (`CompileResult.rig` as `modelDocument` writes it) and every animation's
 * `duration` (the motion spec's, which `readModel` reads as
 * `CoreAnimationTimelines.declared` and refuses when it is not a finite
 * number). Until this module the model side took both from its caller, as
 * `validate()` does, and its verdict moved with what the caller handed it:
 * measured over the 19 recipes with the document's own values left out, A09
 * read SKIP on 38 of 38 cells, ten rules read their bare-directory SKIP, and
 * A20 read FAIL on 7 cells where it reads PASS — without the rig every mesh is
 * judged a generated ring (`meshKindOf`), so an authored mesh fails the
 * generator policy. A value the document states is read from the document,
 * and the same value given beside it is refused by name
 * (`refuseDeclaredBeside`), as issue #1026 made the stage and `pma`
 * (`./given.ts`).
 *
 * 🔒 **The rig section is read field by field, never cast.** A body reads a
 * declaration only through `modelRigInfo`, which refuses by its path a field
 * that is missing, of the wrong type or not one the writer writes — the
 * model side's parse runs it (`./parse.ts`, `A00_MODEL_READ`), so a document
 * whose declarations are malformed is refused where the reader refuses, and
 * never judged against a guess.
 *
 * Links nothing from the runtime.
 */
import type { MeshKind } from '../../mesh.ts';
import { deformSliderCombinationProblem } from '../../rig.ts';
import type { RigInfo } from '../../types.ts';
import { isObj } from '../values.ts';
import type { ReadDocument } from './parse.ts';

/** A rig section the model side cannot read as rig info: every problem, each by its path, in one sentence. */
export class DeclaredInputError extends Error {}

/** The mesh kinds a rig's `meshKinds` may name: the generators' and `authored`. */
const MESH_KINDS = ['ring', 'ribbon', 'contour', 'grid', 'segments', 'authored'] as const satisfies ReadonlyArray<MeshKind | 'authored'>;
// Every kind the type names is in the list, or this line does not type-check.
const MESH_KINDS_COMPLETE: Exclude<MeshKind | 'authored', (typeof MESH_KINDS)[number]> extends never ? true : false = true;
void MESH_KINDS_COMPLETE;

type Check = (value: unknown, at: string, problems: string[]) => void;
const say = (problems: string[], at: string, value: unknown, what: string): void => void problems.push(`${at} is ${JSON.stringify(value) ?? 'absent'}, not ${what}`);
const str: Check = (v, at, p) => (typeof v === 'string' ? undefined : say(p, at, v, 'a string'));
const num: Check = (v, at, p) => (typeof v === 'number' && Number.isFinite(v) ? undefined : say(p, at, v, 'a finite number'));
const nullable = (inner: Check): Check => (v, at, p) => (v === null ? undefined : inner(v, at, p));
const list = (inner: Check, length?: number): Check => (v, at, p) => {
  if (!Array.isArray(v) || (length !== undefined && v.length !== length)) return say(p, at, v, length === undefined ? 'a list' : `a list of ${length}`);
  v.forEach((x, i) => inner(x, `${at}[${i}]`, p));
};
const record = (inner: Check): Check => (v, at, p) => {
  if (!isObj(v)) return say(p, at, v, 'an object');
  for (const [k, x] of Object.entries(v)) inner(x, `${at}.${k}`, p);
};
const oneOf = (words: readonly string[]): Check => (v, at, p) => (typeof v === 'string' && words.includes(v) ? undefined : say(p, at, v, `one of ${words.join(', ')}`));
const shape = (fields: Readonly<Record<string, Check>>): Check => (v, at, p) => {
  if (!isObj(v)) return say(p, at, v, 'an object');
  for (const [k, check] of Object.entries(fields)) check(v[k], `${at}.${k}`, p);
  for (const k of Object.keys(v)) if (!(k in fields)) p.push(`${at}.${k} is not a field the rig section has`);
};

/** The rig section's fields, as `RigInfo` declares them and the writer writes them. Each is required except explicitly optional declarations. */
const RIG_FIELDS: Readonly<Record<Exclude<keyof RigInfo, 'deformSliderCombinations'>, Check>> = {
  archetype: str,
  axisBone: nullable(str),
  axisSubtree: list(str),
  detached: list(list(str, 2)),
  slotOrder: nullable(list(str)),
  meshKinds: record(oneOf(MESH_KINDS)),
  meshDeclaredBones: record(list(str)),
  meshSoftBones: record(str),
  deformMayFold: list(str),
  consumerDrivenMix: list(shape({ type: oneOf(['ik', 'transform']), constraint: str, why: str })),
  idleDrivesMeshes: nullable(str),
  axes: list(shape({ name: str, through: list(str, 2), bones: list(str), tolerance: num })),
  basePlates: list(str),
  meshSlotBudget: nullable(num),
  meshTriangleBudget: nullable(num),
  contactDepth: nullable(num),
  capContainmentCeiling: nullable(num),
  massBone: nullable(str),
  inwardUnit: nullable(list(num, 2)),
};

/** Every problem with the document's `rig` section, each by its path — empty when it reads as rig info. */
export function rigSectionProblems(json: Readonly<Record<string, unknown>>): string[] {
  const problems: string[] = [];
  shape({
    ...RIG_FIELDS,
    deformSliderCombinations: (value, at, p) => {
      if (value === undefined) return;
      const kinds = new Map<string, string[]>();
      const constraints: unknown[] = Array.isArray(json.constraints) ? json.constraints : [];
      for (const entry of constraints) {
        if (isObj(entry) && typeof entry.name === 'string' && typeof entry.kind === 'string') {
          kinds.set(entry.name, [...(kinds.get(entry.name) ?? []), entry.kind]);
        }
      }
      const problem = deformSliderCombinationProblem(value, at, (name) => kinds.get(name) ?? []);
      if (problem !== undefined) p.push(problem);
    },
  })(json.rig, 'rig', problems);
  return problems;
}

/** The rig info the document declares — its `rig` section, read field by field; a section that does not read is refused by its paths. */
export function modelRigInfo(read: ReadDocument): RigInfo {
  const problems = rigSectionProblems(read.json);
  if (problems.length > 0) throw new DeclaredInputError(`the document's rig section does not read as rig info: ${problems.length} problem(s): ${problems.join('; ')}`);
  return read.json.rig as RigInfo;
}

/**
 * Each animation's declared duration, as the document states it and the core
 * reads it (`CoreAnimationTimelines.declared`), keyed in the document's order —
 * the motion spec's, the order `CompileResult.declaredDurations` is filled in.
 */
export function modelDeclaredDurations(read: ReadDocument): Record<string, number> {
  const out: Record<string, number> = {};
  for (const anim of read.doc.animations) out[anim.name] = anim.timelines.declared;
  return out;
}

/** What a caller may not give beside a document, because every document states it. */
export type DeclaredValue = 'rig' | 'declaredDurations';

/** The sentence a value given beside the document is refused with. */
export function declaredBesideRefusal(spec: string, what: DeclaredValue): string {
  const given = what === 'rig' ? 'the rig info' : 'the declared durations';
  const stated = what === 'rig' ? 'states it itself in its rig section' : "states each animation's duration itself";
  return `the caller gave ${given} beside a ${spec} document, which ${stated} (issue #1054); a second source for one fact is refused rather than one of them silently read`;
}

/** A caller's value beside a document that states it, refused by name. */
export function refuseDeclaredBeside(read: ReadDocument, input: { rig?: unknown; declaredDurations?: unknown }, what: DeclaredValue): void {
  if (input[what] !== undefined) throw new Error(declaredBesideRefusal(read.doc.spec, what));
}
