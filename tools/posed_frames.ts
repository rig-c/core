/**
 * posed_frames — every pose a consumer of `rig-c/core` is handed, written out
 * exactly, so that two cores can be held equal over the same documents
 * (issue #1530).
 *
 *   bun tools/posed_frames.ts dump --out <frames.txt> [--core <dir>] [--frames <n>] [--full] <skeleton.model.json>…
 *   bun tools/posed_frames.ts compare <a.txt> <b.txt>
 *
 * `--core` is a directory holding the core's `entry.ts` (default: this
 * checkout's `src/core`), which is how a copy of another commit's `src/` is
 * dumped beside this one's: the same documents, the same calls, two cores.
 *
 * Per document, per skin view (the no-skin view, then each skin the document
 * declares), the setup pose (`poseRawSetup`), then per animation `--frames`
 * steps of 1/60 three ways: the batch walk (`poseRawAnimation`), a held live
 * track and a looping one (`openTrack`). A refusal is written as its message,
 * so a core that refuses where the other poses is a difference too.
 *
 * ⭐ Every pose of a walk is kept until the walk ends and only then written.
 * A consumer holds frame N while N+1 is posed (a player keeps its last frame
 * to draw), so a core that writes into an array a previous pose handed out is
 * a difference here, not only in the selftest's retained-frame control.
 *
 * Each pose is serialized exactly — numbers as their shortest round-trip
 * text, `-0` as `-0`, `NaN` and the infinities by name, every field in the
 * order the core built it — and written as that text's SHA-256, one line per
 * pose (`--full` writes the text itself: 1.4 GB over the tree's nineteen rows
 * at 120 steps). `compare` compares the two files line by line, prints the
 * pose counts and the first line that differs, and exits 1 when they differ.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Entry = typeof import('../src/core/entry.ts');

/** A value written exactly and deterministically: numbers by their shortest round-trip text, `-0` kept. */
function exact(value: unknown): string {
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(exact).join(',')}]`;
  if (typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}:${exact(v)}`).join(',')}}`;
  return JSON.stringify(String(value));
}

function refusal(e: unknown): string {
  return `REFUSED ${e instanceof Error ? e.message : String(e)}`;
}

async function dump(args: string[]): Promise<number> {
  let out: string | undefined;
  let coreDir = resolve(import.meta.dir, '..', 'src', 'core');
  let frames = 120;
  let full = false;
  const models: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--out') out = args[++i];
    else if (a === '--core') coreDir = resolve(args[++i]);
    else if (a === '--frames') frames = Number(args[++i]);
    else if (a === '--full') full = true;
    else models.push(a);
  }
  if (out === undefined || models.length === 0 || !Number.isInteger(frames) || frames < 1) {
    console.error('usage: bun tools/posed_frames.ts dump --out <frames.txt> [--core <dir>] [--frames <n>] [--full] <skeleton.model.json>…');
    return 2;
  }
  const core = (await import(resolve(coreDir, 'entry.ts'))) as Entry;
  const written = (pose: unknown): string => (full ? exact(pose) : createHash('sha256').update(exact(pose)).digest('hex'));
  const lines: string[] = [];
  let poses = 0;
  const steps = new Array<number>(frames).fill(1 / 60);
  for (const path of models) {
    lines.push(`# ${path}`);
    let doc: ReturnType<Entry['readModel']>;
    try {
      doc = core.readModel(readFileSync(path, 'utf8'), path);
    } catch (e) {
      lines.push(refusal(e));
      continue;
    }
    const views: Array<[string, ReturnType<Entry['readModel']>]> = [['(no skin)', core.underNoSkin(doc)], ...doc.skins.map((k): [string, ReturnType<Entry['readModel']>] => [k.name, core.underSkin(doc, k.name)])];
    for (const [skin, view] of views) {
      lines.push(`## skin ${skin}`);
      try {
        lines.push(`setup ${written(core.poseRawSetup(view))}`);
        poses++;
      } catch (e) {
        lines.push(`setup ${refusal(e)}`);
      }
      for (const anim of view.animations) {
        const name = anim.name;
        try {
          const walk = core.poseRawAnimation(view, name, steps);
          walk.forEach((p, i) => lines.push(`walk ${JSON.stringify(name)} ${i} ${written(p)}`));
          poses += walk.length;
        } catch (e) {
          lines.push(`walk ${JSON.stringify(name)} ${refusal(e)}`);
        }
        for (const loop of [false, true]) {
          const kept: unknown[] = [];
          try {
            const track = core.openTrack(view, name, { loop, reset: 'animation' });
            kept.push(track.first);
            for (const dt of steps) kept.push(track.step(dt));
            kept.forEach((p, i) => lines.push(`track ${loop ? 'loop' : 'held'} ${JSON.stringify(name)} ${i} ${written(p)}`));
            poses += kept.length;
          } catch (e) {
            lines.push(`track ${loop ? 'loop' : 'held'} ${JSON.stringify(name)} ${refusal(e)}`);
          }
        }
      }
    }
  }
  lines.push(`# poses ${poses}`);
  writeFileSync(out, `${lines.join('\n')}\n`);
  console.log(`posed_frames: ${models.length} document(s), ${poses} pose(s) at ${frames} step(s) per walk → ${out}`);
  return 0;
}

function compare(args: string[]): number {
  if (args.length !== 2) {
    console.error('usage: bun tools/posed_frames.ts compare <a.txt> <b.txt>');
    return 2;
  }
  const [a, b] = args.map((p) => readFileSync(p, 'utf8'));
  const count = (t: string): string => /# poses (\d+)\n$/.exec(t)?.[1] ?? '?';
  if (a === b) {
    console.log(`IDENTICAL: ${a.length} byte(s), ${count(a)} pose(s)`);
    return 0;
  }
  const la = a.split('\n');
  const lb = b.split('\n');
  const at = la.findIndex((l, i) => l !== lb[i]);
  console.log(`DIFF at line ${at + 1}: ${count(a)} vs ${count(b)} pose(s)`);
  console.log(`  a: ${(la[at] ?? '(end)').slice(0, 300)}`);
  console.log(`  b: ${(lb[at] ?? '(end)').slice(0, 300)}`);
  return 1;
}

const [command, ...rest] = process.argv.slice(2);
const code = command === 'dump' ? await dump(rest) : command === 'compare' ? compare(rest) : (console.error('usage: bun tools/posed_frames.ts dump|compare …'), 2);
process.exit(code);
