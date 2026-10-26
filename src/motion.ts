/**
 * Reading a motion spec — the parse the motion spec did not have.
 *
 * The rig spec has had `parseRigSpec` since it stopped being three hard-coded
 * tables; the motion spec reached `compile` as `readJson<MotionSpec>(path)`, a
 * CAST, so its declared type said what a correct file holds and not what the one
 * on disk does. Issue #307. The compiler's own comment named the consequence out
 * loud, at the one field that had since grown a guard of its own (#293/#303):
 * `setup: { "lid_l": "plate" }` — the attachment name written where its wrapper
 * belongs — compiled **green** and hid the slot, which is the opposite of what
 * was asked and is stated nowhere. That guard is now here, and it now covers
 * every key in the table rather than the ones the emit loop happened to reach.
 *
 * ## What lives here, and what stays in `compile`
 *
 * The split is **shape versus meaning**, and it is a split about what each layer
 * can see rather than a ranking of the checks:
 *
 *   - **here** — is this a number, a string, an array, an object; is a required
 *     field present; is a structure the structure the format describes. Answerable
 *     from the motion file ALONE, which is why it can run at load and why the
 *     rest of the compiler is allowed to assume its inputs from then on.
 *   - **in `compile`** — does this name resolve against the rig spec, is this bone
 *     in that group, does this key's value have the right number of channels for
 *     its property, does this `derive` have a projection onto this axis, is the
 *     last key allowed to carry an easing. Every one of those needs something the
 *     motion file does not contain: the rig, the property table, or the key's
 *     position in its own track.
 *
 * 🚨 **The failure this split is drawn to avoid is two layers refusing one thing
 * under two names**, which makes the error output contradict itself. So a guard
 * the parser makes unreachable was DELETED from `compile` rather than left as a
 * second opinion — the version tag, the `setup` entry shape, the three
 * `non-finite time` guards, the `ik`/`transform`/`deform` array-and-name guards.
 * Where a compile guard is still reachable it stays: `checkKeyTime` still catches
 * a key genuinely past its duration, `rgbaHex` still counts the channels of an
 * `rgba` track key, and the group `v`-map / `derive` refusals (#320,
 * `src/trackgen.ts`) are untouched — every one of them reads the group's member
 * list or the property's projection table, neither of which is in this file.
 *
 * ## Unknown keys ARE refused — issue #545
 *
 * ⚠️ This section said the opposite from 2026-09-03 (#321) until #545: *"a
 * misspelled optional field is therefore still silent — `easing` for `ease`
 * plays linear and says nothing"*, declined because `parseRigSpec` did not refuse one
 * either and one format shrugging while the other refuses is a worse surprise
 * than the stray key. That argument was sound and its premise is now false —
 * `parseRigSpec` refuses by name, so the consistent behaviour is this one. The
 * note's own parenthesis is what made it cheap: the motion specs in this
 * repository carried no undeclared key at any level then and carry none now, so
 * the migration cost, measured over all 39, is zero.
 *
 * `MOTION_KEYS` below is the key set, and the refusal itself is one helper in
 * [`keys.ts`](keys.ts) shared with the rig parser.
 */
import { CompileError } from './errors.ts';
import { dottedPath, refuseNumbersTheFileCannotCarry, refuseUnknownKeys, refuseValuesOfTheWrongType, refuseValuesOutsideTheirSet } from './keys.ts';
import type { ShapeVisit, SpecEnumTable, SpecValueType } from './keys.ts';
import { SEQUENCE_MODES } from './timelines.ts';
import type { MotionSpec } from './types.ts';

export const MOTION_SPEC_VERSION = 'rigc-motion/1';

/**
 * A track's `physics` target for the timeline that names NO constraint (issue
 * #726) — the one the runtime applies to every physics constraint whose own data
 * declares the keyed property global (`"strengthGlobal": true` for `strength`,
 * and so on; `reset` resets every physics constraint and asks no flag).
 * `compile` emits it under the empty name, which is the skeleton file's own
 * spelling of it (`SkeletonJson.js:1048-1054`).
 *
 * 🔑 Not the empty string itself, and that is the choice rather than a detail:
 * `""` is the likeliest shape of a value somebody forgot to fill in, and a
 * forgotten target that silently became "every global constraint" is the exact
 * silence this format exists to name. So `"physics": ""` is refused by name and
 * points here, and `"*"` is reserved the other way round: `compile` refuses a
 * physics constraint that is CALLED `"*"`, because a track naming it could not
 * say which of the two it meant.
 */
export const EVERY_GLOBAL_PHYSICS = '*';

/**
 * The six fields that pick a track's target family. Listed here as well as in
 * `compile`'s `resolveTargets` because the two ask different questions of it:
 * this one asks whether each is a string, that one asks whether exactly one is
 * present and what it resolves to.
 */
const TARGET_FIELDS = ['slot', 'group', 'bone', 'physics', 'path', 'slider'] as const;

/** Every numeric field of a `physics` table entry — `bone` and `note` are not numbers. */
const PHYSICS_NUMBERS = [
  'x',
  'y',
  'rotate',
  'scaleX',
  'shearX',
  'inertia',
  'strength',
  'damping',
  'mass',
  'wind',
  'gravity',
  'mix',
  'fps',
  'limit',
] as const;

/** The two animation-level constraint families, which share one entry shape. */
const CONSTRAINT_GROUPS = ['ik', 'transform'] as const;

/**
 * Every key each shape of this format owns, keyed by the interface that declares
 * it — the runtime shadow of types TypeScript erases, and the other half of
 * `RIG_KEYS` in [`rig.ts`](rig.ts).
 *
 * 🔒 Held to those interfaces by `CUR17` in `selftest.ts`, which reads the
 * declaring source and compares. The interfaces are spread over three modules —
 * `types.ts` for the format, [`trackgen.ts`](trackgen.ts) for a track's `derive`
 * and [`deformgen.ts`](deformgen.ts) for a deform key's `transform` — and the
 * table is one table anyway, because what it describes is one file.
 *
 * ⚠️ `MotionKey.v` is deliberately not a shape here. On a group track it is a
 * `MotionMemberValues` map keyed by **member name**, so every key of it is a
 * name from the rig rather than a field of this format; `resolveMemberTrack`
 * refuses a member the group does not have, which is the check that fits.
 */
export const MOTION_KEYS = {
  MotionSpec: ['spec', 'archetype', 'cut', 'note', 'easings', 'groups', 'setup', 'physics', 'animations', 'mix'],
  MotionMix: ['default', 'pairs'],
  MotionSetupSlot: ['attachment', 'color'],
  MotionPhysics: [
    'bone', 'x', 'y', 'rotate', 'scaleX', 'shearX', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity',
    'mix', 'fps', 'limit', 'note',
  ],
  MotionAnimation: ['duration', 'loop', 'note', 'tracks', 'ik', 'transform', 'deform', 'sequence', 'drawOrder', 'events'],
  MotionTrack: ['slot', 'group', 'bone', 'physics', 'path', 'slider', 'property', 'lag', 'stagger', 'keys'],
  MotionKey: ['t', 'v', 'derive', 'ease', 'curve'],
  MotionIkTrack: ['constraint', 'keys'],
  MotionIkKey: ['t', 'mix', 'softness', 'bendPositive', 'compress', 'stretch', 'ease', 'curve'],
  MotionTransformTrack: ['constraint', 'keys'],
  MotionTransformKey: ['t', 'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY', 'ease', 'curve'],
  MotionDeformTrack: ['skin', 'slot', 'attachment', 'keys'],
  MotionDeformKey: ['t', 'offset', 'fromVertex', 'vertices', 'transform', 'ease', 'curve'],
  MotionSequenceTrack: ['skin', 'slot', 'attachment', 'keys'],
  MotionSequenceKey: ['t', 'mode', 'index', 'delay'],
  MotionDrawOrderKey: ['t', 'offsets'],
  MotionDrawOrderOffset: ['slot', 'offset'],
  MotionEventKey: ['t', 'name', 'int', 'float', 'string', 'volume', 'balance'],
  TrackDeriveTurn: ['kind', 'degrees', 'depth', 'carried', 'about', 'narrowing'],
  DeformTurn: ['kind', 'radius', 'depth', 'degrees', 'about', 'narrowing', 'envelope'],
  DeformAffine: ['kind', 'scale', 'about', 'envelope'],
  DeformWave: ['kind', 'amplitude', 'wavelength', 'phase', 'along', 'axis', 'envelope'],
  DeformBend: ['kind', 'amount', 'from', 'to', 'power', 'along', 'axis', 'envelope'],
  DeformEnvelope: ['axis', 'from', 'to', 'shape', 'mask'],
} as const satisfies Record<string, readonly string[]>;

/**
 * The type every key of `MOTION_KEYS` holds, shape by shape — what
 * `refuseValuesOfTheWrongType` refuses a value against (issue #890), held to
 * the key table by `satisfies MotionTypeTable` and by the selftest, exactly as
 * `RIG_TYPES` is.
 *
 * ⚠️ The walk runs LAST in `parseMotionSpec`, after every field check above,
 * so a field this file already checks keeps its own sentence (a physics tuning
 * number, a key's `t`, an easing's handles) and the walk is what covers the
 * fields nothing here reads — an ik key's `mix`, a deform key's `offset`, an
 * event key's `float`, a derive's `degrees`.
 *
 * Where an unchecked type is refused: an `enum` row — the entry `MOTION_ENUMS`
 * has for it, below, which is a table a control reads rather than a list here;
 * `MotionKey.v`, a key's `curve`, a derive's `depth` and `mix.pairs` (`mixed`)
 * — the track compiler by property, the curve reader, the derive evaluator and
 * `parseMix`. A sequence key's `mode` is a closed set too, but its interface
 * declares it `string` and so does this row: `parseSequence` refuses a name
 * outside `SEQUENCE_MODES` before the walk runs, and a non-string with it.
 */
type MotionTypeTable = {
  readonly [S in keyof typeof MOTION_KEYS]: { readonly [K in (typeof MOTION_KEYS)[S][number]]: SpecValueType };
};

export const MOTION_TYPES = {
  MotionSpec: {
    spec: 'enum', archetype: 'string', cut: 'string', note: 'string', easings: 'map of number[]', groups: 'map of string[]',
    setup: 'map of object', physics: 'map of object', animations: 'map of object', mix: 'object',
  },
  MotionMix: { default: 'number', pairs: 'mixed' },
  MotionSetupSlot: { attachment: 'string | null', color: 'number[]' },
  MotionPhysics: {
    bone: 'string', x: 'number', y: 'number', rotate: 'number', scaleX: 'number', shearX: 'number', inertia: 'number',
    strength: 'number', damping: 'number', mass: 'number', wind: 'number', gravity: 'number', mix: 'number',
    fps: 'number', limit: 'number', note: 'string',
  },
  MotionAnimation: {
    duration: 'number', loop: 'boolean', note: 'string', tracks: 'object[]', ik: 'object[]', transform: 'object[]',
    deform: 'object[]', sequence: 'object[]', drawOrder: 'object[]', events: 'object[]',
  },
  MotionTrack: {
    slot: 'string', group: 'string', bone: 'string', physics: 'string', path: 'string', slider: 'string',
    property: 'enum', lag: 'number', stagger: 'number', keys: 'object[]',
  },
  MotionKey: { t: 'number', v: 'mixed', derive: 'object', ease: 'string', curve: 'mixed' },
  MotionIkTrack: { constraint: 'string', keys: 'object[]' },
  MotionIkKey: {
    t: 'number', mix: 'number', softness: 'number', bendPositive: 'boolean', compress: 'boolean', stretch: 'boolean',
    ease: 'string', curve: 'mixed',
  },
  MotionTransformTrack: { constraint: 'string', keys: 'object[]' },
  MotionTransformKey: {
    t: 'number', mixRotate: 'number', mixX: 'number', mixY: 'number', mixScaleX: 'number', mixScaleY: 'number',
    mixShearY: 'number', ease: 'string', curve: 'mixed',
  },
  MotionDeformTrack: { skin: 'string', slot: 'string', attachment: 'string', keys: 'object[]' },
  MotionDeformKey: {
    t: 'number', offset: 'number', fromVertex: 'number', vertices: 'number[] | null', transform: 'object', ease: 'string', curve: 'mixed',
  },
  MotionSequenceTrack: { skin: 'string', slot: 'string', attachment: 'string', keys: 'object[]' },
  MotionSequenceKey: { t: 'number', mode: 'string', index: 'number', delay: 'number' },
  MotionDrawOrderKey: { t: 'number', offsets: 'object[]' },
  MotionDrawOrderOffset: { slot: 'string', offset: 'number' },
  MotionEventKey: {
    t: 'number', name: 'string', int: 'number', float: 'number', string: 'string', volume: 'number', balance: 'number',
  },
  TrackDeriveTurn: { kind: 'enum', degrees: 'number', depth: 'mixed', carried: 'number', about: 'number', narrowing: 'boolean' },
  DeformTurn: { kind: 'enum', radius: 'number', depth: 'boolean', degrees: 'number', about: 'number', narrowing: 'boolean', envelope: 'object' },
  DeformAffine: { kind: 'enum', scale: 'number[]', about: 'number[]', envelope: 'object' },
  DeformWave: {
    kind: 'enum', amplitude: 'number', wavelength: 'number', phase: 'number', along: 'enum', axis: 'enum', envelope: 'object',
  },
  DeformBend: {
    kind: 'enum', amount: 'number', from: 'number', to: 'number', power: 'number', along: 'enum', axis: 'enum',
    envelope: 'object',
  },
  DeformEnvelope: { axis: 'number[]', from: 'number', to: 'number', shape: 'enum', mask: 'string' },
} as const satisfies MotionTypeTable;

/**
 * Who refuses each `enum` row of `MOTION_TYPES` outside its set (issue #900);
 * `SpecEnumTable` in [`keys.ts`](keys.ts) says what an entry means. Every one
 * is an owner: measured when this table was written, a planted `5` and `"foo"`
 * on each row was refused by name by the reader named here, listing the names
 * that exist, so none of them states a set. A deform transform's and a derive's
 * `kind` choose the row they are checked against, as a generator's does.
 */
export const MOTION_ENUMS = {
  MotionSpec: { spec: { owner: 'parseMotionSpecInto' } },
  MotionTrack: { property: { owner: 'compileTrack' } },
  TrackDeriveTurn: { kind: { owner: 'evaluateTrackDerive' } },
  DeformTurn: { kind: { owner: 'evaluateDeformTransform' } },
  DeformAffine: { kind: { owner: 'evaluateDeformTransform' } },
  DeformWave: { kind: { owner: 'evaluateDeformTransform' }, along: { owner: 'evaluateDeformTransform' }, axis: { owner: 'evaluateDeformTransform' } },
  DeformBend: { kind: { owner: 'evaluateDeformTransform' }, along: { owner: 'evaluateDeformTransform' }, axis: { owner: 'evaluateDeformTransform' } },
  DeformEnvelope: { shape: { owner: 'evaluateDeformEnvelope' } },
} as const satisfies SpecEnumTable<typeof MOTION_TYPES>;

/** A deform key's `transform` kinds, and the shape each one's keys come from. */
const DEFORM_TRANSFORM_SHAPE: Record<string, keyof typeof MOTION_KEYS> = {
  yaw: 'DeformTurn',
  pitch: 'DeformTurn',
  affine: 'DeformAffine',
  wave: 'DeformWave',
  bend: 'DeformBend',
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * What a value actually IS, for a refusal to name.
 *
 * The generalisation of `describeSetupEntry`, whose wording it keeps verbatim for
 * the three shapes that one covered — those exact strings are what issue #293's
 * refusal reads like and what the selftest pins.
 */
function describe(v: unknown): string {
  if (v === undefined) return 'absent';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `an array of ${v.length}`;
  if (typeof v === 'string') return `the string ${JSON.stringify(v)}`;
  if (typeof v === 'number' || typeof v === 'boolean') return `${String(v)}`;
  // "a object" is what `describeSetupEntry` printed; the article is worth a line
  // because these messages are read far more often than they are written.
  return `${typeof v === 'object' ? 'an' : 'a'} ${typeof v}`;
}

/**
 * The one refusal shape in this file: **file, key, what it actually is, and the
 * spelling that works.** Every message below is built from it, so a reader who
 * has seen one has seen the format.
 */
function refuse(where: string, key: string, is: unknown, hint: string): never {
  throw new CompileError(`${where}: \`${key}\` is ${describe(is)}; ${hint}`, 'CE_MOTION_FIELD_SHAPE');
}

/**
 * The second refusal shape: **a key this format does not have**, from the one
 * implementation of it. `at` is the path the messages above already print, so a
 * reader meets `setup."lid_l"` whether the entry was the wrong type or carried
 * the wrong field.
 */
function known(node: unknown, shape: keyof typeof MOTION_KEYS, where: string, at: string): void {
  if (!isObj(node)) return;
  refuseUnknownKeys(node, MOTION_KEYS[shape], where, `\`${at}\``);
  // The root is named by its keys alone — `archetype`, not `this motion spec.archetype`.
  const prefix = shape === 'MotionSpec' ? '' : at;
  visiting?.push({
    node,
    shape,
    name: (tail) => `\`${prefix}${tail.map((step, i) => (typeof step === 'number' ? `[${step}]` : prefix === '' && i === 0 ? step : `.${step}`)).join('')}\``,
  });
}

/**
 * The nodes `known` admitted during the parse in progress, in the order it
 * admitted them — what `refuseValuesOfTheWrongType` walks at the end of
 * `parseMotionSpec`. Module state rather than a parameter because `known` is
 * called from a dozen readers that would otherwise each carry it; it is set and
 * cleared by `parseMotionSpec` alone, around a parse that is synchronous and
 * does not re-enter, so no two parses ever share it.
 */
let visiting: ShapeVisit[] | null = null;

// --- the leaf checks, each returning the value it just proved ---------------

function needObj(v: unknown, where: string, key: string, hint: string): Record<string, unknown> {
  if (!isObj(v)) refuse(where, key, v, hint);
  return v;
}

function needArray(v: unknown, where: string, key: string, hint: string): unknown[] {
  if (!Array.isArray(v)) refuse(where, key, v, hint);
  return v;
}

function needString(v: unknown, where: string, key: string, hint: string): string {
  if (typeof v !== 'string' || v.length === 0) refuse(where, key, v, hint);
  return v;
}

function optString(v: unknown, where: string, key: string, hint: string): void {
  if (v !== undefined && typeof v !== 'string') refuse(where, key, v, hint);
}

function needFinite(v: unknown, where: string, key: string, hint: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) refuse(where, key, v, hint);
  return v;
}

function optFinite(v: unknown, where: string, key: string, hint: string): void {
  if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) refuse(where, key, v, hint);
}

/**
 * A named easing's handles: four finite numbers, and nothing else.
 *
 * ⭐ The most silent field in the format before this parse existed. `easings` is
 * read only through `bezierForChannel`, which destructures four values with no
 * guard at all — so `[0.42, 0, 0.58]` emitted `"curve": [0.42, 0, 0.58, null]`
 * into the artifact, and a `"x"` in one slot emitted a `NaN` the round trip
 * turns into `null` too. Neither is a curve, both loaded, and nothing said so.
 */
function parseEasings(raw: unknown, where: string): void {
  const easings = needObj(raw, where, 'easings', 'it is a table of named handles, `{ "<name>": [hx1, hy1, hx2, hy2] }` (write `{}` if this spec names none)');
  for (const [name, handles] of Object.entries(easings)) {
    const key = `easings."${name}"`;
    const hint =
      'a named easing is FOUR finite numbers — the graph-view handles [hx1, hy1, hx2, hy2]. ' +
      'Nothing downstream counts them, so a short or non-numeric array reaches the artifact as a curve with a `null` in it';
    const arr = needArray(handles, where, key, hint);
    if (arr.length !== 4) refuse(where, key, arr, hint);
    for (const [i, n] of arr.entries()) needFinite(n, where, `${key}[${i}]`, hint);
  }
}

/**
 * `setup` — the entry-shape guard of #293/#303, moved here and widened.
 *
 * 🚨 The guard used to live in the emit loop, which walks the RIG's slots and
 * `continue`s past a slot with no attachments before it ever reads `setup`. So
 * two corners of the very shape it was written for stayed green: a `setup` entry
 * for a slot the rig declares without attachments, and one for a slot the rig
 * does not declare at all. Both are the reader's most likely spelling of the
 * mistake — you write the entry, and the slot it names is exactly the one you
 * have not finished wiring up. Parsing the table on its own terms has no such
 * blind spot: every key is checked, and whether the rig knows the slot is a
 * separate question `compile` still asks.
 */
function parseSetup(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const setup = needObj(raw, where, 'setup', 'it is a table keyed by slot name, `{ "<slot>": { "attachment": … } }`');
  for (const [slot, entry] of Object.entries(setup)) {
    const key = `setup."${slot}"`;
    if (!isObj(entry)) {
      refuse(
        where,
        key,
        entry,
        'a setup entry is an object of `{ attachment?: string | null, color?: [r, g, b, a] }` — to show nothing ' +
          `there write \`"${slot}": { "attachment": null }\`, and to show an attachment write ` +
          `\`"${slot}": { "attachment": "<name>" }\``,
      );
    }
    if (entry.attachment !== undefined && entry.attachment !== null && typeof entry.attachment !== 'string') {
      refuse(where, `${key}.attachment`, entry.attachment, 'it is an attachment name, or null for "show nothing"');
    }
    known(entry, 'MotionSetupSlot', where, key);
    if (entry.color !== undefined) {
      const hint = 'a setup colour is [r, g, b, a], four finite numbers in 0..1 — a channel that is not one is clamped to `NaN` and written into the slot as the text "NaN"';
      const color = needArray(entry.color, where, `${key}.color`, hint);
      if (color.length !== 4) refuse(where, `${key}.color`, color, hint);
      for (const [i, n] of color.entries()) {
        const at = `${key}.color[${i}]`;
        needFinite(n, where, at, hint);
        if ((n as number) < 0 || (n as number) > 1) refuse(where, at, n, hint);
      }
    }
  }
}

/**
 * `physics` — the tuning table.
 *
 * Every field but `bone` and `note` goes straight into `r6`, which is NaN in and
 * NaN out, and the emitter writes that NaN as `null`: `"mass": "heavy"` shipped
 * `"mass": null` in the constraint, which the runtime reads as zero mass. A
 * constraint with zero mass is assertion A23's own example of one that never
 * settles, and it arrived without a word from either layer.
 */
function parsePhysics(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const table = needObj(raw, where, 'physics', 'it is a table keyed by constraint name, `{ "<name>": { "bone": … } }`');
  for (const [name, entry] of Object.entries(table)) {
    const key = `physics."${name}"`;
    if (name === EVERY_GLOBAL_PHYSICS) {
      throw new CompileError(
        `${where}: \`${key}\` names a physics constraint "${EVERY_GLOBAL_PHYSICS}", and that name is reserved: a ` +
          `track's \`"physics": "${EVERY_GLOBAL_PHYSICS}"\` is the timeline that names no constraint and drives ` +
          'every one declaring the keyed property global, so a constraint called ' +
          `"${EVERY_GLOBAL_PHYSICS}" could not be keyed by name. Give it another name`, 'CE_MOTION_PHYSICS_NAME_RESERVED',
      );
    }
    const spec = needObj(entry, where, key,'a physics constraint is an object naming the bone it drives and the components it drives it in');
    known(spec, 'MotionPhysics', where, key);
    needString(spec.bone, where, `${key}.bone`, 'a physics constraint drives one bone, named here');
    for (const field of PHYSICS_NUMBERS) {
      optFinite(spec[field], where, `${key}.${field}`, 'every tuning field of a physics constraint is a finite number — a non-number is rounded to `NaN` and emitted as `null`, which the runtime reads as zero');
    }
    optString(spec.note, where, `${key}.note`, 'it is prose for a reader');
  }
}

/**
 * `mix` — the player-side `AnimationStateData` config.
 *
 * Not emitted into skeleton JSON, which is why nothing had ever looked at it:
 * `{ "default": "fast" }` passed the compiler, the gate and the round trip, and
 * became a `NaN` mix duration in whatever player read the spec.
 */
function parseMix(raw: unknown, where: string): void {
  if (raw === undefined) return;
  const mix = needObj(raw, where, 'mix', 'it is `{ "default": <seconds>, "pairs"?: [["<from>", "<to>", <seconds>], …] }`');
  known(mix, 'MotionMix', where, 'mix');
  needFinite(mix.default, where, 'mix.default', 'the default mix duration is a finite number of seconds');
  if (mix.pairs === undefined) return;
  const pairs = needArray(mix.pairs, where, 'mix.pairs', 'it is an array of `["<from>", "<to>", <seconds>]` triples');
  for (const [i, pair] of pairs.entries()) {
    const key = `mix.pairs[${i}]`;
    const hint = 'a mix pair is `["<from animation>", "<to animation>", <seconds>]` — three entries, two names and a duration';
    const triple = needArray(pair, where, key, hint);
    if (triple.length !== 3) refuse(where, key, triple, hint);
    needString(triple[0], where, `${key}[0]`, hint);
    needString(triple[1], where, `${key}[1]`, hint);
    needFinite(triple[2], where, `${key}[2]`, hint);
  }
}

/**
 * A key's `t`, for every key family there is.
 *
 * ⭐ One owner for one question. `events`, `ik`/`transform` and `deform` each
 * grew their own `has a non-finite time` guard as they were added and the three
 * families that came first — value tracks, slot tracks, `drawOrder` — never got
 * one, so `{ "t": "0" }` on a `rotate` track reached the emitted JSON as a `NaN`
 * time. The three guards in `compile` are gone: they can no longer fire.
 */
function parseKeyTime(key: Record<string, unknown>, where: string, at: string): void {
  needFinite(key.t, where, `${at}.t`, 'a key states its time in seconds, as a finite number');
}

function parseKeyEasing(key: Record<string, unknown>, where: string, at: string): void {
  optString(key.ease, where, `${at}.ease`, 'it names an entry of this spec\'s `easings` table, or is "stepped"');
}

/**
 * One `{ t, … }` key of any family: an object, with a finite time and a string
 * `ease`.
 *
 * `shape` is per caller because the five families' key shapes are five
 * different sets — an `rgba` key's `v` is not a thing an ik key may carry, and
 * an ik key's `softness` is not a thing a value track may. One shared shape here
 * would accept every field of every family on all of them, which is a key set
 * nothing in the format actually has.
 */
function parseKey(
  raw: unknown,
  where: string,
  at: string,
  hint: string,
  shape: keyof typeof MOTION_KEYS,
): Record<string, unknown> {
  const key = needObj(raw, where, at, hint);
  known(key, shape, where, at);
  parseKeyTime(key, where, at);
  parseKeyEasing(key, where, at);
  return key;
}

function parseTracks(raw: unknown, where: string, at: string): void {
  const tracks = needArray(raw, where, `${at}.tracks`, 'it is an array of `{ <target>, property, keys }` tracks (write `[]` for an animation whose timelines are all in the families beside it)');
  for (const [i, entry] of tracks.entries()) {
    const key = `${at}.tracks[${i}]`;
    const track = needObj(entry, where, key, 'a track is an object naming one target, one property and its keys');
    known(track, 'MotionTrack', where, key);
    needString(track.property, where, `${key}.property`, 'a track states the property it keys — the table is AUTHORING §4.4');
    for (const field of TARGET_FIELDS) {
      optString(track[field], where, `${key}.${field}`, `a track's "${field}" is the name of the ${field === 'slot' || field === 'bone' ? field : `${field} it targets`}`);
    }
    if (track.physics === '') {
      refuse(
        where,
        `${key}.physics`,
        track.physics,
        'the empty name is how a skeleton file spells a physics timeline that names no constraint, and a motion ' +
          `spec spells that "${EVERY_GLOBAL_PHYSICS}" — it drives every physics constraint that declares the keyed ` +
          'property global (`"strengthGlobal": true` for `strength`). Name one constraint, or write ' +
          `"${EVERY_GLOBAL_PHYSICS}"`,
      );
    }
    optFinite(track.lag, where, `${key}.lag`, '"lag" is seconds added to every key time of this track, so a finite number — a string is CONCATENATED onto each time and a boolean adds 1');
    optFinite(track.stagger, where, `${key}.stagger`, '"stagger" is the extra per-member delay inside a group, in seconds, so a finite number');
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of `{ t, v }` keys');
    for (const [j, k] of keys.entries()) {
      const at = `${key}.keys[${j}]`;
      const parsed = parseKey(k, where, at, 'a key is an object of `{ t, v, … }`', 'MotionKey');
      // `derive` states a generator's parameters rather than a value, and its
      // shape lives with the evaluator (`src/trackgen.ts`). `yaw` and `pitch`
      // are one interface — they differ in which coordinate they read, not in
      // what they carry — so there is no dispatch to do here, and whether the
      // kind is one of the two stays `evaluateTrackDerive`'s refusal.
      known(parsed.derive, 'TrackDeriveTurn', where, `${at}.derive`);
    }
  }
}

function parseConstraintTracks(raw: unknown, where: string, at: string, group: (typeof CONSTRAINT_GROUPS)[number]): void {
  if (raw === undefined) return;
  const entries = needArray(raw, where, `${at}.${group}`, `it is an array of \`{ "constraint": "<name>", "keys": [...] }\` entries — one per ${group} constraint`);
  for (const [i, entry] of entries.entries()) {
    const key = `${at}.${group}[${i}]`;
    const track = needObj(entry, where, key, `${group === 'ik' ? 'an ik' : 'a transform'} timeline is an object of \`{ constraint, keys }\``);
    known(track, group === 'ik' ? 'MotionIkTrack' : 'MotionTransformTrack', where, key);
    needString(track.constraint, where, `${key}.constraint`, `4.3 writes this group as \`${group}.<constraint>\`, so the constraint name is the only target there is`);
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of keys, each naming the same set of mix fields');
    for (const [j, k] of keys.entries()) {
      parseKey(
        k,
        where,
        `${key}.keys[${j}]`,
        `a ${group} key is an object of \`{ t, … }\``,
        group === 'ik' ? 'MotionIkKey' : 'MotionTransformKey',
      );
    }
  }
}

function parseDeform(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const entries = needArray(raw, where, `${at}.deform`, 'it is an array of `{ slot, attachment, keys }` entries — one per skin/slot/attachment triple');
  for (const [i, entry] of entries.entries()) {
    const key = `${at}.deform[${i}]`;
    const track = needObj(entry, where, key, 'a deform timeline is an object of `{ skin?, slot, attachment, keys }`');
    known(track, 'MotionDeformTrack', where, key);
    optString(track.skin, where, `${key}.skin`, 'it names the skin the attachment lives in; absent means "default"');
    needString(track.slot, where, `${key}.slot`, 'a deform timeline keys one attachment of one slot, named here');
    needString(track.attachment, where, `${key}.attachment`, "it is the attachment's placeholder name inside that skin and slot");
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of keys, each a sparse edit of the setup geometry');
    for (const [j, k] of keys.entries()) {
      const at = `${key}.keys[${j}]`;
      const parsed = parseKey(k, where, at, 'a deform key is an object of `{ t, vertices? | transform? }`', 'MotionDeformKey');
      // `transform` is five kinds sharing one field name, and they share almost
      // nothing else: `wave` carries `wavelength` and `bend` carries `power`, so
      // checking either against the union's flattened keys would accept both on
      // both. An unrecognised `kind` is `evaluateDeformTransform`'s refusal,
      // which names the five.
      if (isObj(parsed.transform)) {
        const shape = DEFORM_TRANSFORM_SHAPE[String(parsed.transform.kind)];
        if (shape !== undefined) known(parsed.transform, shape, where, `${at}.transform`);
        // The envelope is one shape under all five kinds (issue #1413); which
        // of its two forms it states, and whether the fields agree, is
        // `evaluateDeformEnvelope`'s to say.
        known(parsed.transform.envelope, 'DeformEnvelope', where, `${at}.transform.envelope`);
      }
    }
  }
}

/**
 * `sequence` — which frame of an attachment's numbered series shows.
 *
 * Everything decidable from the key alone is decided here; what needs the rig
 * (does the attachment carry a `sequence` block, is `index` inside its `count`)
 * is `compile`'s. Each refusal is a key the parser loads without a word and
 * plays as something else — measured on spine-core 4.3.13 (issue #729):
 *
 *   - a `mode` outside the seven — `SequenceMode[name]` is `undefined`, the mode
 *     bits store 0, and the key plays as `hold`;
 *   - an `index` that is not a whole number of at least 0 — it is stored as
 *     `index << 4`, so `1.5` shows frame 1 and a negative one indexes before the
 *     series;
 *   - a `delay` that is not a number of at least 0 — and, under a mode that
 *     advances, an EFFECTIVE delay of 0: the parser carries a key's delay from
 *     the key before (`lastDelay`, 0 on the first), `(time - keyTime) / 0` is
 *     `Infinity` and `Infinity | 0` is 0, so a `loop` at delay 0 shows its
 *     first frame for the whole key.
 */
function parseSequence(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const entries = needArray(raw, where, `${at}.sequence`, 'it is an array of `{ slot, attachment, keys }` entries — one per skin/slot/attachment triple');
  for (const [i, entry] of entries.entries()) {
    const key = `${at}.sequence[${i}]`;
    const track = needObj(entry, where, key, 'a sequence timeline is an object of `{ skin?, slot, attachment, keys }`');
    known(track, 'MotionSequenceTrack', where, key);
    optString(track.skin, where, `${key}.skin`, 'it names the skin the attachment lives in; absent means "default"');
    needString(track.slot, where, `${key}.slot`, 'a sequence timeline steps one attachment of one slot, named here');
    needString(track.attachment, where, `${key}.attachment`, "it is the attachment's placeholder name inside that skin and slot");
    const keys = needArray(track.keys, where, `${key}.keys`, 'it is an array of `{ t, mode?, index?, delay? }` keys');
    // The delay the PARSER will read at each key: the stated one, else the
    // previous key's, else 0 (`lastDelay` in `readAnimation`).
    let carried = 0;
    for (const [j, k] of keys.entries()) {
      const kat = `${key}.keys[${j}]`;
      const parsed = parseKey(k, where, kat, 'a sequence key is an object of `{ t, mode?, index?, delay? }`', 'MotionSequenceKey');
      if (parsed.mode !== undefined && !(SEQUENCE_MODES as readonly unknown[]).includes(parsed.mode)) {
        refuse(
          where,
          `${kat}.mode`,
          parsed.mode,
          `a sequence mode is one of the ${SEQUENCE_MODES.length} the format has — ${SEQUENCE_MODES.join(', ')} ` +
            '(absent means "hold"). The parser reads `SequenceMode[mode]`, which is undefined for anything else, and ' +
            'stores mode bits 0: the key would load without a word and play as "hold"',
        );
      }
      const index = parsed.index;
      if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0)) {
        refuse(
          where,
          `${kat}.index`,
          index,
          'it is the 0-based frame this key starts on, so a whole number of at least 0 — the runtime stores it as ' +
            '`index << 4`, which truncates a fraction (1.5 showed frame 1) and puts a negative one before the series',
        );
      }
      const delay = parsed.delay;
      if (delay !== undefined && (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0)) {
        refuse(where, `${kat}.delay`, delay, 'it is the seconds each frame shows for, so a finite number of at least 0');
      }
      if (typeof delay === 'number') carried = delay;
      const mode = typeof parsed.mode === 'string' ? parsed.mode : 'hold';
      if (mode !== 'hold' && carried === 0) {
        throw new CompileError(
          `${where}: \`${kat}\` plays "${mode}" at a delay of 0` +
            (delay === undefined
              ? ` — it states none, and the parser carries the previous key's (${j === 0 ? 'there is none, so 0' : '0'})`
              : '') +
            '. The runtime advances the frame by `(time - keyTime) / delay`, which is Infinity at 0, and ' +
            '`Infinity | 0` is 0 — so the key shows its first frame for as long as it lasts, which is "hold" spelt ' +
            `as "${mode}". State the seconds per frame, or write "hold"`, 'CE_MOTION_SEQUENCE_ADVANCE_ZERO_DELAY',
        );
      }
    }
  }
}

function parseEvents(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const keys = needArray(raw, where, `${at}.events`, 'it is an array of `{ t, name }` firings — one timeline per animation, naming no target');
  for (const [i, k] of keys.entries()) {
    parseKey(k, where, `${at}.events[${i}]`, 'an event key is an object of `{ t, name, … }`', 'MotionEventKey');
  }
}

/**
 * `drawOrder`.
 *
 * ⚠️ The quiet one is `offsets`: `readDrawOrder` treats a key with no offsets as
 * "restore the setup order", and `compile` tested that with `!key.offsets?.length`
 * — which is true for `{}` and for a string, so a malformed `offsets` silently
 * became a restore key. That is a complete statement of the draw order made by
 * accident.
 */
function parseDrawOrder(raw: unknown, where: string, at: string): void {
  if (raw === undefined) return;
  const keys = needArray(raw, where, `${at}.drawOrder`, 'it is an array of `{ t, offsets? }` keys — one timeline per animation, naming no target');
  for (const [i, entry] of keys.entries()) {
    const key = `${at}.drawOrder[${i}]`;
    const dk = parseKey(entry, where, key, 'a draw-order key is an object of `{ t, offsets? }`', 'MotionDrawOrderKey');
    if (dk.offsets === undefined) continue;
    const offsets = needArray(
      dk.offsets,
      where,
      `${key}.offsets`,
      'it is an array of `{ slot, offset }` moves. Omit the field entirely to restore the setup draw order — a malformed one used to BE that restore key, silently',
    );
    for (const [j, o] of offsets.entries()) {
      const oat = `${key}.offsets[${j}]`;
      const off = needObj(o, where, oat, 'one moved slot is `{ "slot": "<name>", "offset": <places later> }`');
      known(off, 'MotionDrawOrderOffset', where, oat);
      needString(off.slot, where, `${oat}.slot`, 'it names the slot this key moves');
      // The TYPE only. Whether it is a whole number, and whether it lands inside
      // the emitted slots array, are `compile`'s — both need the slot table.
      needFinite(off.offset, where, `${oat}.offset`, 'it is how many places later the slot is drawn, so a number (negative moves it earlier)');
    }
  }
}

function parseAnimation(raw: unknown, where: string, name: string): void {
  const at = `animations."${name}"`;
  const anim = needObj(raw, where, at, 'an animation is an object of `{ duration, tracks, … }`');
  known(anim, 'MotionAnimation', where, at);
  const duration = needFinite(anim.duration, where, `${at}.duration`, 'an animation declares its duration in seconds, as a finite number — it is checked against the compiled last key (rule R7), and a comparison against a non-number is silently false');
  if (duration < 0) {
    refuse(where, `${at}.duration`, duration, 'a duration is a length of time, so it is not negative');
  }
  // ⚠️ Optional, and the type used to say otherwise: 20 of the 37 motion specs
  // in this repository declare no `loop` at all. It is a player hint that is not
  // expressible in skeleton JSON, so an absent one costs the artifact nothing —
  // requiring it here would have refused most of the benchmark corpus.
  if (anim.loop !== undefined && typeof anim.loop !== 'boolean') {
    refuse(where, `${at}.loop`, anim.loop, 'it is a player hint, so true or false (absent means the player decides)');
  }
  optString(anim.note, where, `${at}.note`, 'it is prose for a reader');
  parseTracks(anim.tracks, where, at);
  for (const group of CONSTRAINT_GROUPS) parseConstraintTracks(anim[group], where, at, group);
  parseDeform(anim.deform, where, at);
  parseSequence(anim.sequence, where, at);
  parseDrawOrder(anim.drawOrder, where, at);
  parseEvents(anim.events, where, at);
}

/**
 * Parse and check a motion spec, then hand back a typed one.
 *
 * `where` is the file's own path and every message begins with it, for the reason
 * `parseRigSpec` does the same: a reader with two input files and one error has
 * otherwise no way to tell which of them is at fault (issue #227).
 */
export function parseMotionSpec(raw: unknown, where: string): MotionSpec {
  const visits: ShapeVisit[] = [];
  visiting = visits;
  try {
    return parseMotionSpecInto(raw, where, visits);
  } finally {
    visiting = null;
  }
}

function parseMotionSpecInto(raw: unknown, where: string, visits: readonly ShapeVisit[]): MotionSpec {
  if (!isObj(raw)) {
    throw new CompileError(`${where}: a motion spec must be a JSON object, and this file holds ${describe(raw)}`, 'CE_MOTION_SPEC_OBJECT');
  }
  if (raw.spec !== MOTION_SPEC_VERSION) {
    throw new CompileError(`${where}: unknown motion spec version: ${String(raw.spec)}, expected "${MOTION_SPEC_VERSION}"`, 'CE_MOTION_SPEC_VERSION');
  }
  // Before the field checks, for the reason `parseRigSpec` puts its own first: a
  // key nothing reads is often the CAUSE of the field that is missing, and
  // `"animation"` for `"animations"` should be named as the typo it is rather
  // than as an absent table.
  known(raw, 'MotionSpec', where, 'this motion spec');
  needString(raw.archetype, where, 'archetype', "it names the rig this spec was authored against, and must equal that rig spec's own `name`");
  needString(raw.cut, where, 'cut', 'it names the cut these keys were authored for');
  optString(raw.note, where, 'note', 'it is prose for a reader');

  parseEasings(raw.easings, where);
  // `groups` — the parser proves the TABLE is a table; `checkMotionGroups` owns
  // each entry's member list, because what it refuses (an empty group, a repeated
  // member) is about what a track naming it would compile, not about JSON shape.
  if (raw.groups !== undefined) {
    needObj(raw.groups, where, 'groups', 'it is a table keyed by group name, `{ "<group>": ["<member>", …] }`');
  }
  parseSetup(raw.setup, where);
  parsePhysics(raw.physics, where);
  parseMix(raw.mix, where);

  const animations = needObj(raw.animations, where, 'animations', 'it is a table keyed by animation name, `{ "<name>": { "duration": …, "tracks": [...] } }` (write `{}` for a static rig)');
  for (const [name, anim] of Object.entries(animations)) {
    if (name.length === 0) throw new CompileError(`${where}: an animation has an empty name`, 'CE_MOTION_ANIMATION_NAME_EMPTY');
    parseAnimation(anim, where, name);
  }

  // After every field check above, so a field this file checks keeps its own
  // sentence, and before the finite walk, so a value that is not a number is
  // named as that rather than skipped (issue #890). What reaches this line is a
  // field nothing above reads. Measured before the walk, every one of 303
  // wrong-typed plants over 18 motion shapes was refused somewhere — but later,
  // by the timeline compiler, and 7 of those sentences named the wrong fault:
  // an event key's `"float": "1"` as *float 1 is not finite*, a `"volume": "1"`
  // as an event with no audio, a yaw transform's `"depth": "true"` as a radius
  // that is undefined.
  refuseValuesOfTheWrongType(visits, MOTION_TYPES, where);
  // Every `enum` row here names an owner, so this refuses nothing today; it is
  // called so that a row given a set is refused from the day it is given one.
  refuseValuesOutsideTheirSet(visits, MOTION_TYPES, MOTION_ENUMS, where);

  // Last, so every field check above keeps its own sentence for a number that
  // is not finite; what reaches this line is a finite double the float32 file
  // cannot carry — a key at 1e308 built green with a `null` in it before issue
  // #881 — and any number in a field no check above reads.
  refuseNumbersTheFileCannotCarry(raw, where, (path) => `\`${dottedPath(path)}\``);

  return raw as unknown as MotionSpec;
}
