/** End-to-end synthetic contact controls. Builds remain gated; no fixture repairs. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { Plate, readPlate } from '../tools/plate.ts';
import { parseRigSpec } from '../src/rig.ts';
import { parseMotionSpec } from '../src/motion.ts';
import { premultipliedDiff } from '../src/extremes.ts';
import { frameSetDir } from '../src/render_shared.ts';
import { type SeamFile } from '../src/seam.ts';
import { contactSources } from './seam_contact_controls.ts';

export function prepareContactFixture(dir: string, defect: boolean): { rig: string; motion: string; images: string } {
  const images = join(dir, 'parts'); mkdirSync(images, { recursive: true });
  // Both fixtures have the same one-texel transparent PNG margin required of
  // overlays by the build gate; it leaves the chosen material bounds unchanged.
  for (const [name, p] of contactSources(defect).pages) {
    const padded = new Plate(p.width + 2, p.height + 2);
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) padded.set(x + 1, y + 1, p.get(x, y));
    padded.writePng(join(images, `${name}.png`));
  }
  const rig = {
    spec: 'rigc-rig/1', name: 'material_contact_probe', images: 'parts',
    skeleton: { x: -8, y: -14, width: 24, height: 24 },
    bones: [{ name: 'root' }, { name: 'limb', parent: 'root' }],
    slots: [{ name: 'parent', bone: 'root', attachment: 'parent' }, { name: 'limb', bone: 'limb', attachment: 'limb' }],
    skins: { default: { parent: { parent: { image: 'parent.png', x: -3, y: 2 } }, limb: { limb: { image: 'limb.png', y: -4 } } } },
  };
  const motion = {
    spec: 'rigc-motion/1', archetype: 'material_contact_probe', cut: 'material_contact_probe', easings: {},
    animations: { swing: { duration: 1, loop: false, tracks: [{ bone: 'limb', property: 'rotate', keys: [{ t: 0, v: [0] }, { t: 1, v: [90] }] }] } },
  };
  // Actual input readers run before any command is submitted.
  parseRigSpec(rig, 'synthetic contact rig'); parseMotionSpec(motion, 'synthetic contact motion');
  const rigPath = join(dir, 'probe.rig.json'), motionPath = join(dir, 'probe.motion.json');
  writeFileSync(rigPath, `${JSON.stringify(rig, null, 2)}\n`); writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  return { rig: rigPath, motion: motionPath, images };
}

export function seamContactRenderControls(work: string): { name: string; faults: string[]; detail: string }[] {
  const rows: { name: string; faults: string[]; detail: string }[] = [];
  const commands: { args: string[]; status: number | null; stdout: string; stderr: string }[] = [];
  const command = (args: string[], faults: string[]): boolean => {
    const ran = spawnSync(process.execPath, ['cli.ts', ...args], { cwd: resolve(import.meta.dir, '..'), encoding: 'utf8' });
    commands.push({ args, status: ran.status, stdout: ran.stdout, stderr: ran.stderr });
    if (ran.status !== 0) faults.push(`cli ${args[0]} exit ${ran.status}: ${(ran.stdout + ran.stderr).slice(-1200)}`);
    return ran.status === 0;
  };
  for (const defect of [false, true]) {
    const label = defect ? 'removed' : 'intact';
    const dir = join(work, label), built = join(dir, 'built');
    const fixture = prepareContactFixture(dir, defect);
    const faults: string[] = [];
    const pairs: SeamFile[] = [];
    if (command(['build', '--rig', fixture.rig, '--motion', fixture.motion, '--images', fixture.images, '--out', built], faults)) {
      for (const poser of ['core', 'spine']) {
        const out = join(dir, poser);
        if (!command(['render', '--candidate', built, '--animation', 'swing', '--seam', 'parent:limb', '--poser', poser,
          '--viewport', '-8,-14,24,24', '--max', '24', '--fps', '2', '--geometry', '--extremes', '--out', out], faults)) continue;
        const frames = join(out, frameSetDir('swing', 2));
        const seam = JSON.parse(readFileSync(join(frames, 'seam.json'), 'utf8')) as SeamFile;
        pairs.push(seam);
        const contact = seam.pairs[0].jointContact;
        if (contact?.frames[0]?.status !== 'joined' || contact?.frames.at(-1)?.status !== (defect ? 'separated' : 'joined')) faults.push(`${poser}: expected initially joined and finally ${defect ? 'separated' : 'joined'} material`);
        if (!(seam.pairs[0].gap.worst !== null && seam.pairs[0].gap.frames.some(f => f.index === 2))) faults.push(`${poser}: expected raw swept gap at +90`);
        // The oracle uses analytic rectangular sets at endpoints, not seam's
        // inverse maps, hulls, connected-component traversal or texel sampler.
        for (const index of [0, 2]) {
          const image = readPlate(join(frames, `f000${index}.png`));
          if (image.width !== 24 || image.height !== 24) { faults.push(`${poser}: not native 24x24`); continue; }
          let mismatch = 0;
          for (let py = 0; py < 24; py++) for (let px = 0; px < 24; px++) {
            const x = -8 + px + 0.5, y = 10 - py - 0.5;
            const parent = x > -6 && x < 0 && y > -4 && y < 8;
            const limb = index === 0 ? x > -2 && x < 2 && y > -12 && y < (defect ? -2 : 4)
              : x > (defect ? 2 : -4) && x < 12 && y > -2 && y < 2;
            const want = limb ? [240, 120, 40, 255] : parent ? [40, 140, 220, 255] : [232, 232, 232, 255];
            if (image.get(px, py).some((v, c) => v !== want[c])) mismatch++;
          }
          if (mismatch) faults.push(`${poser} frame ${index}: ${mismatch} pixels differ from independent rectangle oracle`);
        }
        const min = readPlate(join(frames, 'f0000.png')), max = readPlate(join(frames, 'f0002.png'));
        premultipliedDiff(min, max).writePng(join(frames, 'native-diff.png'));
        // Native joint crop and 4x nearest-neighbour preview, solely an observation.
        const crop = new Plate(12, 12), zoom = new Plate(48, 48);
        for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
          const colour = max.get(x + 2, y + 4); crop.set(x, y, colour);
          for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) zoom.set(4 * x + dx, 4 * y + dy, colour);
        }
        crop.writePng(join(frames, 'joint-native.png')); zoom.writePng(join(frames, 'joint-4x.png'));
        const extremes = JSON.parse(readFileSync(join(frames, 'extremes.json'), 'utf8')) as { status: string };
        if (extremes.status !== 'READ') faults.push(`${poser}: extremes not READ`);
      }
    }
    if (pairs.length !== 2 || JSON.stringify(pairs[0]) !== JSON.stringify(pairs[1])) faults.push('both poser seam files must be identical');
    rows.push({ name: defect ? 'SE51_RENDERED_MATERIAL_REMOVAL_SEPARATES_THE_JOINT' : 'SE50_RENDERED_WIDE_SWING_RETAINS_MATERIAL_CONTACT', faults,
      detail: `${label}: gated build; core/spine native 24x24 endpoint RGB oracle; setup/min/max/diff and joint crops; raw gaps ${pairs.map(p => p.pairs[0].gap.frames.map(f => `${f.index}:${f.px}`).join(',')).join(' / ')}; contact ${pairs[0]?.pairs[0]?.jointContact?.frames.map(f => f.status).join(',') ?? 'missing'}` });
  }
  writeFileSync(join(work, 'commands.json'), `${JSON.stringify(commands, null, 2)}\n`);
  return rows;
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) throw new Error('supply a private output directory');
  if (process.argv[3] === '--prepare-only') {
    for (const defect of [false, true]) console.log(prepareContactFixture(join(out, defect ? 'removed' : 'intact'), defect));
  } else {
    const rows = seamContactRenderControls(out);
    for (const r of rows) console.log(`${r.faults.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.detail}${r.faults.length ? ` — ${r.faults.join('; ')}` : ''}`);
    console.log(`SEAM_CONTACT_RENDER cases=${rows.length} pass=${rows.filter(r => !r.faults.length).length} fail=${rows.filter(r => r.faults.length).length}`);
    writeFileSync(join(out, 'controls.json'), `${JSON.stringify(rows, null, 2)}\n`);
    process.exitCode = rows.some(r => r.faults.length) ? 1 : 0;
  }
}
