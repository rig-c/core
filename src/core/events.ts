/**
 * Construct 4 of the core, its remainder (issue #955, step 2f of issue #380):
 * the events an animation's event timeline fires between two samples — the
 * oracle's per-sample `events` block, `[name, time, int, float, string]`.
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13) and reading the block back;
 * nothing here was written from the runtime's source. The core suite's `CD`
 * controls hold the same skeletons against the core.
 *
 * - **A sample lists the keys whose time is in `(previous sample's t, t]`**,
 *   the first sample's interval opening at −1: an event keyed at 0.25 fired
 *   at the sample at 0.25 and not at the one after; one keyed at 0 fired at
 *   the first sample; on an animation of duration 0 every sample sits at 0,
 *   and the keys at 0 fired at the first sample alone.
 * - **Key times are float32**: an event keyed at 0.1 (float32
 *   0.10000000149) did not fire at a sample at 0.1 but at the next.
 * - **In key order**: two events keyed at one time fired in the order the
 *   keys are listed.
 * - **The row's time is the key's (float32), and each of `int`, `float`,
 *   `string` is the key's where it states one, else the event
 *   definition's, else the parser's `0`, `0`, `""`** — an event declared with
 *   no string read `""`, not `null` (so `tools/pose_oracle.ts`' header, which
 *   said `null`, was wrong about the runtime and says so now). `volume` and
 *   `balance` are the audio's, and the block does not carry them.
 * - **`float` is the double the document states**, the definition's and the
 *   key's alike: `0.1000065`, which rounds to `0.100007` as a double and to
 *   `0.100006` through `Math.fround`, read `0.100007` from each.
 * - A slider fires no event into the block: the oracle lists the events of
 *   the sample's own animation.
 */
import { gridRound } from './index.ts';

/** An event definition, as the model states it (`ModelEvent`): the payload a key falls back to. */
export interface CoreEventDef {
  /** Audio metadata retained additively; the five-column oracle row is unchanged. */
  audio?: string;
  volume?: number;
  balance?: number;
  name: string;
  int: number;
  float: number;
  string: string;
}

/** One event key, as read: its time (float32) and the payload it fires with, each field resolved. */
export interface CoreEventKey {
  /** Audio delivery values, as observed from the public EventTimeline API. */
  volume?: number;
  balance?: number;
  time: number;
  name: string;
  int: number;
  float: number;
  string: string;
}

/** One row of a sample's `events` block: `[name, time, int, float, string]`, the oracle's row. */
export type CoreEventRow = [string, number | null, number, number | null, string | null];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const EVENT_DEF_FIELDS = ['name', 'int', 'float', 'string', 'audio', 'volume', 'balance'] as const;
const EVENT_KEY_FIELDS = ['time', 'name', 'int', 'float', 'string', 'volume', 'balance'] as const;

function payload(raw: Record<string, unknown>, at: string, problems: string[]): { int?: number; float?: number; string?: string; volume?: number; balance?: number } {
  const out: { int?: number; float?: number; string?: string; volume?: number; balance?: number } = {};
  if (raw.int !== undefined) {
    if (typeof raw.int !== 'number' || !Number.isInteger(raw.int)) problems.push(`${at}: int is ${JSON.stringify(raw.int)}, not a whole number`);
    else out.int = raw.int;
  }
  if (raw.float !== undefined) {
    if (typeof raw.float !== 'number' || !Number.isFinite(raw.float)) problems.push(`${at}: float is ${JSON.stringify(raw.float)}, not a finite number`);
    else out.float = raw.float;
  }
  if (raw.string !== undefined) {
    if (typeof raw.string !== 'string') problems.push(`${at}: string is ${JSON.stringify(raw.string)}, not a string`);
    else out.string = raw.string;
  }
  for (const key of ['volume', 'balance'] as const) if (raw[key] !== undefined) {
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) problems.push(`${at}: ${key} is ${JSON.stringify(raw[key])}, not a finite number`);
    else out[key] = raw[key];
  }
  return out;
}

/** The document's `events` section, read: a list of named definitions, each name once, each field of its type. */
export function readEventDefs(value: unknown, problems: string[]): Map<string, CoreEventDef> {
  const out = new Map<string, CoreEventDef>();
  if (!Array.isArray(value)) {
    problems.push('events is not a list');
    return out;
  }
  value.forEach((raw, i) => {
    const at = `events[${i}]`;
    if (!isRecord(raw) || typeof raw.name !== 'string' || raw.name === '') {
      problems.push(`${at} names no event`);
      return;
    }
    for (const key of Object.keys(raw)) if (!(EVENT_DEF_FIELDS as readonly string[]).includes(key)) problems.push(`${at} "${raw.name}": field "${key}" is not one this reader knows; it reads [${EVENT_DEF_FIELDS.join(', ')}]`);
    if (raw.audio !== undefined && typeof raw.audio !== 'string') problems.push(`${at} "${raw.name}": audio is ${JSON.stringify(raw.audio)}, not a string`);
    if (out.has(raw.name)) problems.push(`${at}: event "${raw.name}" is declared twice`);
    const p = payload(raw, `${at} "${raw.name}"`, problems);
    out.set(raw.name, { audio: typeof raw.audio === 'string' ? raw.audio : '', volume: p.volume ?? 0, balance: p.balance ?? 0, name: raw.name, int: p.int ?? 0, float: p.float ?? 0, string: p.string ?? '' });
  });
  return out;
}

/** An animation record's `events` keys, read: each names a declared event, times do not go backwards (equal times are two firings), each field of its type. */
export function readEventKeys(value: unknown, label: string, defs: ReadonlyMap<string, CoreEventDef>, problems: string[]): CoreEventKey[] {
  const where = `${label}.events`;
  if (!Array.isArray(value)) {
    problems.push(`${where} is not a list`);
    return [];
  }
  const out: CoreEventKey[] = [];
  let last = -Infinity;
  value.forEach((raw, i) => {
    const at = `${where}[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${at} is not an object`);
      return;
    }
    for (const key of Object.keys(raw)) if (!(EVENT_KEY_FIELDS as readonly string[]).includes(key)) problems.push(`${at}: field "${key}" is not one an event key carries; it carries [${EVENT_KEY_FIELDS.join(', ')}]`);
    const t = raw.time;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) problems.push(`${at}: time is ${JSON.stringify(t)}, not a finite time at or after 0`);
    else if (t < last) problems.push(`${at}: time ${t} is before the key before it — the writer refuses event times that go backwards`);
    if (typeof t === 'number' && Number.isFinite(t)) last = Math.max(last, t);
    const def = typeof raw.name === 'string' ? defs.get(raw.name) : undefined;
    if (def === undefined) {
      problems.push(`${at}: event ${JSON.stringify(raw.name)} is not declared in the document's events`);
      return;
    }
    const p = payload(raw, at, problems);
    // Observed oracle behavior: a voiced key's omitted balance falls back to
    // the definition's volume, not its balance. A silent event keeps both at 0.
    out.push({ volume: def.audio ? p.volume ?? def.volume ?? 0 : 0, balance: def.audio ? p.balance ?? def.volume ?? 0 : 0, time: Math.fround(typeof t === 'number' && Number.isFinite(t) ? t : 0), name: def.name, int: p.int ?? def.int, float: p.float ?? def.float, string: p.string ?? def.string });
  });
  return out;
}

/** What lists the events fired over `(last, t]` — or across the wrap when `wrapped` — : `eventsFired` unless a plant passes another. */
export type EventsFired = (keys: readonly CoreEventKey[], last: number, t: number, round?: (v: number) => number | null, wrapped?: boolean) => CoreEventRow[];

/**
 * The rows of the keys fired over `(last, t]`, in key order — the header's
 * rules, rounded as the oracle rounds. `wrapped` is a looping track's step
 * whose animation time went down (`t < last`, the wrap): the keys after
 * `last`, in key order, then the keys at or before `t`, in key order — the
 * header's *Across the wrap*. Nothing but a looping track passes it.
 */
export function eventsFired(keys: readonly CoreEventKey[], last: number, t: number, round: (v: number) => number | null = gridRound, wrapped = false): CoreEventRow[] {
  const row = (k: CoreEventKey): CoreEventRow => [k.name, round(k.time), k.int, round(k.float), k.string];
  if (wrapped) return [...keys.filter((k) => k.time > last), ...keys.filter((k) => k.time <= t)].map(row);
  return keys.filter((k) => k.time > last && k.time <= t).map(row);
}
