import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
/** Closed controls for the warning-only reading (#1663); no rasterisation. */
import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';
import { spinePoser } from './src/render.ts';
import { Plate } from './tools/plate.ts';
import { smallestSingularValue, textureScaleReading, textureScaleLines, textureScaleTimes } from './src/texture_scale.ts';

type Say = (name: string, ok: boolean, detail: string, why: string) => number;
const atlas = 'page.png\nsize: 730,400\nfilter: Linear,Linear\nplate\n  bounds: 0,0,730,400\n';
export function scaleProbe(scale = 1, extra: Record<string, unknown> = {}) {
  return {
    skeleton: { spine: '4.3.00' }, bones: [{ name: 'root', scaleX: scale, scaleY: scale }],
    slots: [{ name: 'part', bone: 'root', attachment: 'part' }],
    skins: [{ name: 'default', attachments: { part: { part: { path: 'plate', width: 730, height: 400 } } } }],
    animations: {}, ...extra,
  };
}
export function scaleProbeReading(spec: Record<string, unknown>, atlasText = atlas) {
  const parsed = new TextureAtlas(atlasText);
  const data = new SkeletonJson(new AtlasAttachmentLoader(parsed)).readSkeletonData(spec);
  const page = new Plate(parsed.pages[0].width, parsed.pages[0].height); page.data.fill(255);
  return textureScaleReading(spinePoser(data), new Map([['page.png', page]]), JSON.stringify(spec));
}
export function runTextureScaleSuite(report?: Say): number {
  console.log('\n── texture-scale: actual region transforms and bounded animation samples (issue #1663) ──');
  let bad = 0;
  const say = (name: string, ok: boolean, detail: string): void => {
    bad += report ? report(name, ok, detail, 'A warning must read the drawn texture-to-world map without becoming a gate') :
      (console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`), ok ? 0 : 1);
  };
  const near = (a: number | undefined, b: number, eps = 1e-6): boolean => a !== undefined && Math.abs(a - b) < eps;
  const low = scaleProbeReading(scaleProbe(.167));
  say('TX01_PLANTED_0167_NAMES_REGION_SIZE_AND_VALUE', low.report.warnings.length === 1 && near(low.report.warnings[0]?.smallestSampledScale, .167) && low.report.warnings[0].texture.width === 730 && low.report.warnings[0].texture.height === 400 && textureScaleLines(low.report).some(s => s.includes('REGION_TEXTURE_MINIFIED') && s.includes('"plate"') && s.includes('0.167000')), JSON.stringify(low.report.warnings));
  const one = scaleProbeReading(scaleProbe(1));
  const half = scaleProbeReading(scaleProbe(.500001));
  say('TX02_ONE_AND_ABOVE_THRESHOLD_STAY_SILENT', one.report.warnings.length === 0 && half.report.warnings.length === 0 && one.report.drawnRegions === 1 && smallestSingularValue(.5, 0, 0, .5) === .5, '1.0 and .500001: no warning; exact diagonal sigma-min .5 stays at the strict threshold');
  const anisotropic = scaleProbeReading(scaleProbe(1, { bones: [{ name: 'root', scaleX: 2, scaleY: .2, rotation: 43 }] }));
  say('TX03_ANISOTROPY_ROTATION_REFLECTION', near(anisotropic.regions[0]?.smallestSampledScale, .2) && near(scaleProbeReading(scaleProbe(-.167)).regions[0]?.smallestSampledScale, .167), 'min singular value .2, reflected .167');
  const shear = scaleProbeReading(scaleProbe(1, { bones: [{ name: 'root', shearY: 80 }] }));
  // Unit columns with angle 10 degrees: lambda-min = 1 - cos(10 degrees).
  say('TX04_SHEAR_IS_NOT_COLUMN_LENGTH', near(shear.regions[0]?.smallestSampledScale, Math.sqrt(1 - Math.cos(10 * Math.PI / 180))), JSON.stringify(shear.regions));
  const parent = scaleProbeReading(scaleProbe(1, {
    bones: [{ name: 'root', scaleX: .5, scaleY: 2 }, { name: 'child', parent: 'root', rotation: 90 }],
    slots: [{ name: 'part', bone: 'child', attachment: 'part' }],
    skins: [{ name: 'default', attachments: { part: { part: { path: 'plate', width: 365, height: 200, scaleX: .5, scaleY: 1 } } } }],
  }));
  say('TX05_PARENT_ATTACHMENT_SIZE_AND_LOCAL_SCALE', near(parent.regions[0]?.smallestSampledScale, .25), JSON.stringify(parent.regions));
  const hidden = scaleProbeReading(scaleProbe(.167, { slots: [{ name: 'part', bone: 'root', attachment: 'part', color: 'ffffff00' }] }));
  const absent = scaleProbeReading(scaleProbe(.167, { slots: [{ name: 'part', bone: 'root' }] }));
  say('TX06_HIDDEN_UNATTACHED_REGIONS_ARE_NOT_DRAWN', hidden.report.drawnRegions === 0 && absent.report.drawnRegions === 0, 'zero alpha and no attachment: zero observations');
  const animatedSpec = scaleProbe(1, { animations: { shrink: { bones: { root: { scale: [{ x: 1, y: 1 }, { time: .123, x: .167, y: .167 }, { time: 1, x: 1, y: 1 }] } } } } });
  const animated = scaleProbeReading(animatedSpec);
  say('TX07_OFF_GRID_KEY_TIME_AND_ANIMATION_NAMED', animated.report.warnings[0]?.animation === 'shrink' && near(animated.report.warnings[0]?.time, Math.fround(.123), 1e-12) && near(animated.report.warnings[0]?.smallestSampledScale, .167), JSON.stringify(animated.report.warnings));
  const between = scaleProbeReading(scaleProbe(1, { animations: { mirror: { bones: { root: { scalex: [{ value: 1 }, { time: 1, value: -1 }] } } } } }));
  say('TX08_INTERPOLATED_COLLAPSE_BETWEEN_FULL_SIZE_KEYS', between.report.warnings.length === 1 && between.report.warnings[0].smallestSampledScale < .04 && between.report.sampling.includes('between samples'), JSON.stringify(between.report.warnings));
  const again = scaleProbeReading(animatedSpec);
  say('TX09_DETERMINISTIC_TEXT_AND_JSON', JSON.stringify(animated.report) === JSON.stringify(again.report) && textureScaleLines(animated.report).join('\n') === textureScaleLines(again.report).join('\n'), 'two independent parses and walks, byte equal');
  say('TX10_SVD_EDGE_CONTROLS', near(smallestSingularValue(1, 1, 0, 1), (Math.sqrt(5) - 1) / 2) && smallestSingularValue(0, 0, 0, 0) === 0 && near(smallestSingularValue(1e10, 0, 0, 1e-10), 1e-10, 1e-20), 'sheared golden ratio inverse, zero, ill-conditioned diagonal');
  const times = textureScaleTimes(JSON.stringify(animatedSpec), 'shrink', 1, 60);
  say('TX11_SCHEDULE_HAS_KEYS_MIDPOINTS_AND_ENDPOINT', times.includes(Math.fround(.123)) && times.includes(Math.fround(.123) / 2) && times.at(-1) === 1 && times.every((t, i) => i === 0 || t > times[i - 1]), `${times.length} strictly increasing times, including non-grid key and midpoint`);
  const swapped = scaleProbeReading(scaleProbe(1, { animations: { reveal: { slots: { part: { alpha: [{ value: 0 }, { time: .123, value: 1 }] } }, bones: { root: { scale: [{ x: .167, y: .167 }] } } } } }));
  say('TX12_ALPHA_ANIMATION_IS_READ_AT_DRAWN_TIME', swapped.report.warnings.length === 1 && swapped.report.warnings[0].time > 0, JSON.stringify(swapped.report.warnings));
  const rotated = 'page.png\nsize: 400,730\nfilter: Linear,Linear\nplate\n  bounds: 0,0,730,400\n  rotate: 90\n';
  say('TX13_ROTATED_ATLAS_TEXEL_MAP', near(scaleProbeReading(scaleProbe(.167), rotated).regions[0]?.smallestSampledScale, .167), '90-degree atlas placement keeps .167');
  const clipped = scaleProbeReading(scaleProbe(.167, {
    slots: [{ name: 'mask', bone: 'root', attachment: 'clip' }, { name: 'part', bone: 'root', attachment: 'part' }],
    skins: [{ name: 'default', attachments: { mask: { clip: { type: 'clipping', end: 'part', vertexCount: 4, vertices: [2000, 2000, 2010, 2000, 2010, 2010, 2000, 2010] } }, part: { part: { path: 'plate', width: 730, height: 400 } } } }],
  }));
  say('TX14_FULLY_CLIPPED_IS_NOT_DRAWN', clipped.report.drawnRegions === 0, 'clip entirely outside source rectangle');
  const inactive = scaleProbeReading(scaleProbe(.167, { bones: [{ name: 'root' }, { name: 'child', parent: 'root', skin: true, scaleX: .167, scaleY: .167 }], slots: [{ name: 'part', bone: 'child', attachment: 'part' }] }));
  say('TX15_INACTIVE_BONE_IS_NOT_DRAWN', inactive.report.drawnRegions === 0, 'skin-required bone under no skin: no observation');
  const named = scaleProbe(.167, { skins: [{ name: 'other', attachments: { part: { part: { path: 'plate', width: 730, height: 400 } } } }] });
  const namedData = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlas))).readSkeletonData(named);
  const namedPage = new Plate(730, 400); namedPage.data.fill(255);
  const namedPages = new Map([['page.png', namedPage]]);
  const namedReading = textureScaleReading(spinePoser(namedData), namedPages, JSON.stringify(named), 60, 'other');
  const noSkin = textureScaleReading(spinePoser(namedData), namedPages, JSON.stringify(named));
  say('TX16_NAMED_SKIN_SELECTION', namedReading.report.warnings.length === 1 && noSkin.report.drawnRegions === 0, 'other skin chosen: one warning; no skin: no observation');
  namedPage.data.fill(0);
  say('TX17_TRANSPARENT_SOURCE_IS_NOT_DRAWN', textureScaleReading(spinePoser(namedData), namedPages, JSON.stringify(named), 60, 'other').report.drawnRegions === 0, 'source rectangle contains no alpha');
  const resized = scaleProbeReading(scaleProbe(1, { skins: [{ name: 'default', attachments: { part: { part: { path: 'plate', width: 730 * .167, height: 400 * .167 } } } }] }),
    'page.png\nsize: 122,67\nfilter: Linear,Linear\nplate\n  bounds: 0,0,122,67\n');
  say('TX18_AREA_DOWNSAMPLE_SAME_WORLD_SIZE_REMOVES_WARNING', resized.report.warnings.length === 0 && near(resized.regions[0]?.smallestSampledScale, Math.min(730 * .167 / 122, 400 * .167 / 67)), JSON.stringify(resized.regions));
  const trimmed = scaleProbeReading(scaleProbe(.167), 'page.png\nsize: 500,200\nfilter: Linear,Linear\nplate\n  bounds: 0,0,500,200\n  offsets: 100,50,730,400\n');
  say('TX19_TRIMMED_REGION_USES_STORED_TEXEL_SIZE', near(trimmed.regions[0]?.smallestSampledScale, .167) && trimmed.regions[0].texture.width === 500 && trimmed.regions[0].texture.height === 200, JSON.stringify(trimmed.regions));
  const work = mkdtempSync(join(tmpdir(), 'rigc-texture-scale-'));
  try {
    const candidate = join(work, 'build'); mkdirSync(candidate);
    const skeleton = JSON.stringify(scaleProbe(.167));
    writeFileSync(join(candidate, 'skeleton.json'), skeleton);
    writeFileSync(join(candidate, 'skeleton.atlas'), atlas);
    const page = new Plate(730, 400); page.data.fill(255); page.writePng(join(candidate, 'page.png'));
    const invoke = (target: string) => spawnSync(process.execPath, [join(import.meta.dir, 'cli.ts'), 'texture-scale', '--candidate', candidate, '--json', target], { encoding: 'utf8' });
    const inside = invoke(join(candidate, 'skeleton.json'));
    const external = join(work, 'unrelated.json'); writeFileSync(external, 'preserve me');
    const existing = invoke(external);
    const dotdotName = join(candidate, '..still-inside'); mkdirSync(dotdotName);
    const deceptive = invoke(join(dotdotName, 'reading.json'));
    say('TX20_REPORT_CANNOT_REPLACE_BUILD_OR_EXISTING_NONREPORT', inside.status === 2 && deceptive.status === 2 && inside.stderr.includes('outside the candidate directory') && readFileSync(join(candidate, 'skeleton.json'), 'utf8') === skeleton && existing.status === 2 && readFileSync(external, 'utf8') === 'preserve me', 'candidate artifact and unrelated existing file remain byte-identical');
    const target = join(work, 'reading.json');
    const a = invoke(target), bytes = readFileSync(target, 'utf8'), b = invoke(target);
    say('TX21_CLI_REPORT_REPEATABLE_AND_WARNING_EXIT_ZERO', a.status === 0 && b.status === 0 && a.stdout === b.stdout && bytes === readFileSync(target, 'utf8') && a.stdout.includes('REGION_TEXTURE_MINIFIED'), `two CLI runs exit ${a.status}/${b.status}, identical report and text`);
  } finally { rmSync(work, { recursive: true, force: true }); }
  return bad;
}
if (import.meta.main) process.exit(runTextureScaleSuite() === 0 ? 0 : 1);
