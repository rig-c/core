/** Stage-one runtime event/skin controls, using the public oracle API. */
import { readModel, underSkin, underNoSkin } from '../src/core/index.ts';
import { openTrack } from '../src/core/track.ts';
import { compileRuntime, RuntimePose, RuntimeInputError, WORLDS, type RuntimePlant } from '../src/runtime/index.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { allocationPerFrame, probeModel } from './runtime_poser_cases.ts';
import { runtimeOfTexts } from './core_gate.ts';
import { EventTimeline, MixFrom, Skeleton, type Event } from '@esotericsoftware/spine-core';
import { eventsFired, readEventDefs, readEventKeys } from '../src/core/events.ts';
import { loadOracleData } from './pose_oracle.ts';

export function observeRuntimeEventPayloads(): unknown[] {
  const data = loadOracleData(JSON.stringify({ skeleton: { spine: '4.3.13' }, bones: [{ name: 'root' }], events: {
    silent: {}, voiced: { audio: 'voice.ogg', volume: 0.8, balance: -0.3 }, plain: { audio: 'plain.ogg' },
  }, animations: { a: { events: [{ time: 0, name: 'silent', volume: 0.7, balance: 0.2 }, { time: 0.2, name: 'voiced' }, { time: 0.2, name: 'voiced', volume: 0.4, balance: 0.6 }, { time: 1, name: 'plain' }] } } }), '', 'runtime stage-one event observation');
  const fired: Event[] = [];
  for (const timeline of data.animations[0].timelines) if (timeline instanceof EventTimeline) timeline.apply(new Skeleton(data), -1, 1, fired, 1, MixFrom.setup, false, false, false);
  return fired.map(e => [e.data.name, e.time, e.intValue, e.floatValue, e.stringValue, e.volume, e.balance]);
}
export function observeCoreEventRows(): unknown {
  const problems: string[] = [];
  const defs = readEventDefs([{ name: 'silent' }, { name: 'voiced', audio: 'voice.ogg', volume: 0.8, balance: -0.3 }], problems);
  const keys = readEventKeys([{ time: 0, name: 'silent' }, { time: 0.2, name: 'voiced', int: 2 }, { time: 1, name: 'voiced' }], 'observation', defs, problems);
  if (problems.length) throw Error(problems.join('; '));
  return [eventsFired(keys, -1, 0.5), eventsFired(keys, 0.5, 0.25, undefined, true)];
}
type Say = (name: string, problems: string[], detail: string) => void;

function eventControl(plant: RuntimePlant = {}): string[] {
  const problems: string[] = [];
  const defs = [{ name: 'zero', int: 7, float: 0.1000065, string: 'base' }, { name: 'voice', audio: 'voice.ogg', volume: 0.8, balance: -0.3 }];
  const keys = [{ time: 0, name: 'zero' }, { time: 0.2, name: 'voice' }, { time: 0.2, name: 'voice', int: 8, float: -0.25, string: 'key', volume: 0.4, balance: 0.6 }, { time: 0.75, name: 'zero' }, { time: 1, name: 'voice' }];
  const text = probeModel({ bones: [{ name: 'root' }], events: defs, animations: [{ name: 'a', duration: 1, events: keys }] });
  const doc = underNoSkin(readModel(text));
  const runtime = new RuntimePose(compileRuntime(doc, {}, plant));
  runtime.setAnimation('a');
  const track = openTrack(doc, 'a', { loop: true, reset: 'animation' });
  const data = loadOracleData(JSON.stringify({ skeleton: { spine: '4.3.13' }, bones: [{ name: 'root' }], events: Object.fromEntries(defs.map(({ name, ...value }) => [name, value])), animations: { a: { events: keys } } }), '', 'stage-one event control');
  const skeleton = new Skeleton(data);
  let last = -1;
  const fields = ['name', 'time', 'int', 'float', 'string', 'volume', 'balance'] as const;
  for (const [index, dt] of [0, 0.125, 0.125, 0.5, 0.5, 1.25, 0.75].entries()) {
    runtime.step(dt);
    const raw = index === 0 ? track.first : track.step(dt);
    const fired: Event[] = [];
    for (const timeline of data.animations[0].timelines) if (timeline instanceof EventTimeline) timeline.apply(skeleton, last, runtime.time, fired, 1, MixFrom.setup, false, false, false);
    const expected = fired.map(e => [e.data.name, e.time, e.intValue, e.floatValue, e.stringValue, e.volume, e.balance]);
    const actual = runtime.events.map(e => fields.map(field => e[field]));
    if (actual.length !== expected.length) problems.push(`step ${index}: event count ${actual.length}, oracle ${expected.length}`);
    for (let i = 0; i < Math.min(actual.length, expected.length); i++) for (let j = 0; j < fields.length; j++) if (!Object.is(actual[i][j], expected[i][j])) problems.push(`step ${index} event ${i} ${fields[j]}: ${String(actual[i][j])}, oracle ${String(expected[i][j])}`);
    if (JSON.stringify(actual.map(row => row.slice(0, 5))) !== JSON.stringify(raw.events)) problems.push(`step ${index}: five-field delivery differs from openTrack`);
    last = runtime.time;
  }
  return problems;
}

export function runtimeStage1Cases(say: Say): void {
  const cleanEvents = eventControl();
  const redEvents = eventControl({ eventWrapOffByOne: true });
  if (redEvents.length === 0) cleanEvents.push('wrap off-by-one plant produced no difference');
  say('RP13_EVENTS_MATCH_THE_ORACLE_SEVEN_FIELDS_ACROSS_WRAP_AND_MULTIPLE_KEYS', cleanEvents, `7 steps, duplicate-time keys, zero/end boundaries, payload overrides; wrap plant: ${redEvents[0] ?? 'not detected'}`);
  const region = (name: string, x: number) => ({ kind: 'region', name, x, width: 10, height: 10, atlas: { width: 10, height: 10, originalWidth: 10, originalHeight: 10, offsetX: 0, offsetY: 0 } });
  const text = probeModel({ bones: [{ name: 'root' }, { name: 'required', parent: 'root', skinRequired: true, x: 5 }], slots: [{ name: 's', bone: 'root', setup: 'p' }, { name: 'r', bone: 'required', setup: 'p' }], attachments: { s: { p: region('default-draw', 0) }, r: { p: region('required-draw', 0) } }, skins: [{ name: 'alt', bones: ['required'], constraints: {}, attachments: { s: { p: region('alternate-draw', 7) } } }], animations: [{ name: 'hold', duration: 1, bones: [{ name: 'root', timelines: [{ name: 'translatex', keys: [{ time: 0, value: 0 }, { time: 1, value: 3 }] }] }] }] });
  const problems: string[] = [];
  for (const skin of ['default', 'alt']) {
    const row = runtimeOfTexts(`skin ${skin}`, text, '', {}, skin);
    if (row.verdict !== 'IDENTICAL') problems.push(`${skin}: ${row.verdict} ${row.why}`);
  }
  const wrong = runtimeOfTexts('wrong attachment skin', text, '', { attachmentSkin: 'default' }, 'alt');
  if (wrong.verdict !== 'DIFF' || !(wrong.why ?? '').includes('draw')) problems.push(`wrong-skin plant: ${wrong.verdict} ${wrong.why}`);
  const doc = readModel(text);
  // Skin switch is a load-time view change, as underSkin/openTrack are immutable views.
  for (const skin of ['default', 'alt', 'default']) {
    const pose = new RuntimePose(compileRuntime(underSkin(doc, skin)));
    pose.restore('hold', 1.375, 0.375);
    const raw = openTrack(underSkin(doc, skin), 'hold', { loop: true, reset: 'animation' }).step(1.375);
    for (let i = 0; i < raw.bones.length; i++) {
      const bone = raw.bones[i];
      const expected = [bone.a, bone.b, bone.c, bone.d, bone.worldX, bone.worldY];
      for (let field = 0; field < WORLDS; field++) if (!Object.is(pose.world[i * WORLDS + field], expected[field])) problems.push(`${skin}: bone ${bone.name} world field ${field} differs after switching at track time 1.375`);
    }
    const required = pose.model.boneNames.indexOf('required');
    if (pose.model.active[required] !== (skin === 'alt' ? 1 : 0)) problems.push(`${skin}: skin-required bone activity is wrong`);
  }
  say('RP14_NAMED_SKINS_SWITCH_VIEWS_AND_WRONG_ATTACHMENT_IS_CAUGHT_BY_NAME', problems, `default and alt, skin-required bone inactive/active, track time 1.375 and wrapped animation time 0.375 restored on an animated root; wrong-skin plant: ${wrong.verdict} ${wrong.why}`);
  const restoreControl = (plant: RuntimePlant): string[] => {
    const faults: string[] = [];
    const text = probeModel({ bones: [{ name: 'root' }], skins: [{ name: 'alt', bones: [], constraints: {}, attachments: {} }], events: [{ name: 'before' }, { name: 'after' }], animations: [{ name: 'a', duration: 1, events: [{ time: 0.25, name: 'before' }, { time: 0.75, name: 'after' }] }] });
    const doc = readModel(text);
    const old = new RuntimePose(compileRuntime(underSkin(doc, 'default')));
    old.setAnimation('a'); old.step(0.5);
    if (old.events.map(e => e.name).join(',') !== 'before') faults.push('the original pose did not deliver before');
    const fresh = new RuntimePose(compileRuntime(underSkin(doc, 'alt'), {}, plant));
    fresh.restore('a', old.trackTime, old.time);
    for (const event of fresh.events) faults.push(`restore re-fired event "${event.name}" at ${event.time}`);
    fresh.step(0.25);
    if (fresh.events.map(e => e.name).join(',') !== 'after') faults.push('the key after restoration was lost or repeated');
    fresh.step(0.5);
    if (fresh.events.map(e => e.name).join(',') !== 'before') faults.push('the next loop did not deliver before exactly once');
    const heldTime = fresh.trackTime;
    for (const [name, trackTime, animationTime, expected] of [
      ['a', Number.NaN, 0.5, 'restore: track time'],
      ['a', 0.5, Number.POSITIVE_INFINITY, 'restore: animation time'],
      ['missing', 0.5, 0.5, '"missing" is not one of'],
    ] as const) {
      try { fresh.restore(name, trackTime, animationTime); faults.push(`${expected}: no refusal`); }
      catch (error) { if (!(error instanceof RuntimeInputError) || !error.message.includes(expected)) faults.push(`${expected}: wrong refusal ${String(error)}`); }
      if (fresh.trackTime !== heldTime) faults.push(`${expected}: failed restore changed the running track time`);
    }

    return faults;
  };
  const restored = restoreControl({});
  const repeated = restoreControl({ restoreEventsFromStart: true });
  if (!repeated.some(message => message.includes('re-fired event "before"'))) restored.push(`old restore plant did not name the repeated event: ${repeated.join('; ')}`);
  say('RP16_RESTORE_CARRIES_EVENT_CURSOR_WITHOUT_REPLAYING_PASSED_CUES', restored, `default→alt at track/animation time 0.5; after at 0.75 then before once next loop; old behavior plant: ${repeated[0] ?? 'not detected'}`);
  const work = mkdtempSync(join(tmpdir(), 'runtime-stage1-'));
  try {
    const model = join(work, 'events.model.json');
    writeFileSync(model, probeModel({ bones: [{ name: 'root' }], events: [{ name: 'e', int: 2 }], animations: [{ name: 'a', duration: 1, events: [{ time: 0, name: 'e' }, { time: 0.2, name: 'e' }, { time: 1, name: 'e' }] }] }));
    const root = resolve(import.meta.dir, '..');
    const clean = allocationPerFrame(root, model, 'a', 'none');
    const planted = allocationPerFrame(root, model, 'a', 'object');
    const allocationProblems: string[] = [];
    if (clean.bytes === null || clean.bytes >= 1) allocationProblems.push(`event-delivery allocation: ${clean.said}`);
    if (planted.bytes === null || planted.bytes < 16) allocationProblems.push(`allocation plant was not detected: ${planted.said}`);
    say('RP15_EVENT_DELIVERY_KEEPS_ZERO_ALLOCATION_AND_DETECTS_THE_OBJECT_PLANT', allocationProblems, `${clean.said}; object plant: ${planted.said}`);
  } finally { rmSync(work, { recursive: true, force: true }); }

}
if (import.meta.main && process.argv.includes('--controls')) {
  let bad = 0;
  runtimeStage1Cases((name, problems, detail) => { console.log(JSON.stringify({ name, problems, detail })); bad += problems.length; });
  process.exit(bad ? 1 : 0);
}
if (import.meta.main && process.argv.includes('--observe')) console.log(JSON.stringify({ oracle: observeRuntimeEventPayloads(), core: observeCoreEventRows() }));
