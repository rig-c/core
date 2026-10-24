/**
 * Measure a `rigc render --sheet` pack through the real `pixi.js@8.22.0`
 * (`PIXI.Assets.load` / `PIXI.Spritesheet`) and `phaser@3.90.0`
 * (`Phaser.Textures.Parsers.JSONHash` / `addAtlasJSONHash`) loaders inside
 * headless Playwright Chromium (issue #1560, Bar 3).
 *
 * `src/sheet.ts` proves the internal contract (`verifySheetPack`, `SH01`–`SH21`):
 * trimming, 2-px clamped edge extrusion, non-overlapping padded cells, deterministic
 * emission, and 0-byte reconstruction onto an untrimmed canvas. That still leaves
 * the consumer side of the claim: whether PixiJS and Phaser 3 agree on what our
 * `sheet*.json` (`json-hash`) means when their own parsers and renderers read it.
 *
 * This tool runs outside `bun run selftest` for the same reason
 * `tools/editor_roundtrip.ts` does: it launches an external headless browser.
 * Its refusals (missing browser executable, unpinned or mismatched `phaser` /
 * `pixi.js` versions, bad flags, missing `sheet-manifest.json`) run before any
 * browser is spawned and are held by selftest stub controls (`SH22`–`SH25`).
 *
 * Usage:
 *   bun tools/sheet_readers.ts --sheet <dir> [--browser <path>] [--package-root <dir>] [--timeout <s>]
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  SHEET_MANIFEST_FILE,
  reconstructSheetFrame,
  sheetPackFaults,
  type SheetJsonHashDocument,
  type SheetManifest,
} from '../src/sheet.ts';
import { Plate, readPlate } from './plate.ts';

export const REQUIRED_READER_PINS = {
  'pixi.js': '8.22.0',
  phaser: '3.90.0',
} as const;

const LIGHT_BG: readonly [number, number, number, number] = [232, 232, 232, 255];
const DARK_BG: readonly [number, number, number, number] = [28, 28, 32, 255];
const MAX_CHANNEL_TOLERANCE = 1;

interface CliOptions {
  sheetDir: string;
  browserPath: string;
  browserExplicit: boolean;
  packageRoot: string;
  timeoutSec: number;
}

function usage(): string {
  return [
    'Usage: bun tools/sheet_readers.ts --sheet <dir> [--browser <path>] [--package-root <dir>] [--timeout <s>]',
    '',
    '  --sheet <dir>         REQUIRED. A render --sheet set directory (containing sheet-manifest.json)',
    '                        or a render --sheet output root (containing frames.json).',
    '  --browser <path>      Headless Playwright Chromium executable (default: auto-detected under',
    '                        $PLAYWRIGHT_BROWSERS_PATH or platform ms-playwright cache; never system Chrome).',
    `  --package-root <dir>  Directory holding package.json, bun.lock, and node_modules (default: repo root).`,
    '  --timeout <s>         Bound in seconds on the headless browser run (default: 120).',
  ].join('\n');
}

function failUsage(message: string): never {
  console.error(`sheet_readers usage error: ${message}\n\n${usage()}`);
  process.exit(2);
}

function failRefusal(message: string): never {
  console.error(`sheet_readers error: ${message}`);
  process.exit(1);
}

/**
 * Locate the Playwright Chromium binary in the Playwright cache without falling
 * back to a system-installed Chrome. When no cached binary exists, returns the
 * canonical default path under the cache root so the refusal names the exact
 * path it looked at.
 */
export function defaultPlaywrightBrowserPath(): string {
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const cacheRoots: string[] = [];
  if (envPath !== undefined && envPath.length > 0 && envPath !== '0') {
    cacheRoots.push(resolve(envPath));
  }
  const home = homedir();
  if (process.platform === 'darwin') {
    cacheRoots.push(join(home, 'Library', 'Caches', 'ms-playwright'));
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    cacheRoots.push(join(localAppData, 'ms-playwright'));
  } else {
    cacheRoots.push(join(home, '.cache', 'ms-playwright'));
  }

  const relCandidates =
    process.platform === 'darwin'
      ? [
          join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          join('chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
          join('chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
          join('chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
          join('chrome-headless-shell-mac-x64', 'chrome-headless-shell'),
        ]
      : process.platform === 'win32'
        ? [
            join('chrome-win64', 'chrome.exe'),
            join('chrome-win', 'chrome.exe'),
            join('chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
          ]
        : [
            join('chrome-linux64', 'chrome'),
            join('chrome-linux', 'chrome'),
            join('chrome-headless-shell-linux64', 'chrome-headless-shell'),
          ];

  for (const root of cacheRoots) {
    if (!existsSync(root)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    const chromiumDirs = entries
      .filter((e) => e.startsWith('chromium-') || e.startsWith('chromium_headless_shell-'))
      .sort((a, b) => {
        const revA = Number(a.split('-').pop() ?? 0);
        const revB = Number(b.split('-').pop() ?? 0);
        if (revA !== revB) return revB - revA;
        // Prefer full chromium-* before chromium_headless_shell-* at the same revision
        return a.startsWith('chromium-') ? -1 : 1;
      });
    for (const dir of chromiumDirs) {
      for (const rel of relCandidates) {
        const candidate = join(root, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  const fallbackRoot = cacheRoots[0] ?? join(home, '.cache', 'ms-playwright');
  return join(fallbackRoot, 'chromium', relCandidates[0]!);
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let sheetDir: string | undefined;
  let browserPath: string | undefined;
  let packageRoot = resolve(import.meta.dir, '..');
  let timeoutSec = 120;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      failUsage(`unexpected positional argument ${JSON.stringify(arg)}`);
    }
    const val = argv[i + 1];
    if (arg === '--sheet') {
      if (val === undefined || val.startsWith('--')) failUsage('--sheet requires a directory path');
      sheetDir = resolve(val);
      i++;
    } else if (arg === '--browser') {
      if (val === undefined || val.startsWith('--')) failUsage('--browser requires an executable path');
      browserPath = resolve(val);
      i++;
    } else if (arg === '--package-root') {
      if (val === undefined || val.startsWith('--')) failUsage('--package-root requires a directory path');
      packageRoot = resolve(val);
      i++;
    } else if (arg === '--timeout') {
      if (val === undefined || val.startsWith('--')) failUsage('--timeout requires a number of seconds');
      const parsed = Number(val);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        failUsage(`--timeout must be a positive finite number of seconds (got ${JSON.stringify(val)})`);
      }
      timeoutSec = parsed;
      i++;
    } else {
      failUsage(`unknown flag ${JSON.stringify(arg)}`);
    }
  }

  if (sheetDir === undefined) {
    failUsage('missing required --sheet <dir>');
  }

  return {
    sheetDir,
    browserPath: browserPath ?? defaultPlaywrightBrowserPath(),
    browserExplicit: browserPath !== undefined,
    packageRoot,
    timeoutSec,
  };
}

/**
 * Verify that `package.json`, `bun.lock`, and `node_modules` under `packageRoot`
 * pin `pixi.js` to `"8.22.0"` and `phaser` to `"3.90.0"` with exact versions
 * (no caret/tilde ranges, no drift between manifest, lockfile, and installed package).
 */
export function verifyPinnedReaderPackages(packageRoot: string): {
  pixiBundlePath: string;
  phaserBundlePath: string;
} {
  const pkgJsonPath = join(packageRoot, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    failRefusal(`package.json not found at ${pkgJsonPath}`);
  }
  let pkgJson: {
    dependencies?: Record<string, unknown>;
    devDependencies?: Record<string, unknown>;
  };
  try {
    pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
    };
  } catch (err) {
    failRefusal(`failed to parse ${pkgJsonPath}: ${(err as Error).message}`);
  }

  const lockPath = join(packageRoot, 'bun.lock');
  if (!existsSync(lockPath)) {
    failRefusal(`bun.lock not found at ${lockPath}`);
  }
  const lockText = readFileSync(lockPath, 'utf8');

  const entries = Object.entries(REQUIRED_READER_PINS) as Array<[keyof typeof REQUIRED_READER_PINS, string]>;
  for (const [pkg, requiredVersion] of entries) {
    if (pkgJson.dependencies !== undefined && pkg in pkgJson.dependencies) {
      failRefusal(
        `${pkgJsonPath} lists ${JSON.stringify(pkg)} under dependencies (${JSON.stringify(pkgJson.dependencies[pkg])}); reader packages must stay in devDependencies so the published package links zero runtime dependencies`,
      );
    }
    const foundSpec = pkgJson.devDependencies?.[pkg];
    if (foundSpec === undefined) {
      failRefusal(
        `${pkgJsonPath} devDependencies[${JSON.stringify(pkg)}] is missing (required exact pin ${JSON.stringify(requiredVersion)})`,
      );
    }
    if (typeof foundSpec !== 'string' || foundSpec !== requiredVersion) {
      failRefusal(
        `${pkgJsonPath} devDependencies[${JSON.stringify(pkg)}] is ${JSON.stringify(foundSpec)}, required exact pin ${JSON.stringify(requiredVersion)} (no range prefix or version drift)`,
      );
    }

    // Verify bun.lock records both the workspace devDependency spec and the resolved package version.
    const specRe = new RegExp(`"${pkg.replace('.', '\\.')}"\\s*:\\s*"([^"]+)"`);
    const specMatch = specRe.exec(lockText);
    if (specMatch === null || specMatch[1] !== requiredVersion) {
      failRefusal(
        `${lockPath} records ${JSON.stringify(pkg)} spec as ${JSON.stringify(specMatch?.[1] ?? null)}, required exact pin ${JSON.stringify(requiredVersion)}`,
      );
    }
    const resolvedRe = new RegExp(`"${pkg.replace('.', '\\.')}@([^"]+)"`);
    const resolvedMatch = resolvedRe.exec(lockText);
    if (resolvedMatch === null || resolvedMatch[1] !== requiredVersion) {
      failRefusal(
        `${lockPath} resolves ${JSON.stringify(pkg)} to ${JSON.stringify(resolvedMatch?.[1] ?? null)}, required ${JSON.stringify(requiredVersion)}`,
      );
    }

    // Verify installed node_modules/<pkg>/package.json version.
    const installedPkgPath = join(packageRoot, 'node_modules', pkg, 'package.json');
    if (!existsSync(installedPkgPath)) {
      failRefusal(`installed package metadata not found at ${installedPkgPath} (expected ${pkg}@${requiredVersion})`);
    }
    let installedVersion: unknown;
    try {
      installedVersion = (JSON.parse(readFileSync(installedPkgPath, 'utf8')) as { version?: unknown }).version;
    } catch (err) {
      failRefusal(`failed to parse ${installedPkgPath}: ${(err as Error).message}`);
    }
    if (installedVersion !== requiredVersion) {
      failRefusal(
        `${installedPkgPath} has version ${JSON.stringify(installedVersion)}, required exact pin ${JSON.stringify(requiredVersion)}`,
      );
    }
  }

  const pixiBundlePath = join(packageRoot, 'node_modules', 'pixi.js', 'dist', 'pixi.min.js');
  if (!existsSync(pixiBundlePath)) {
    failRefusal(`pixi.js browser bundle not found at ${pixiBundlePath}`);
  }
  const phaserBundlePath = join(packageRoot, 'node_modules', 'phaser', 'dist', 'phaser.js');
  if (!existsSync(phaserBundlePath)) {
    failRefusal(`phaser browser bundle not found at ${phaserBundlePath}`);
  }

  return { pixiBundlePath, phaserBundlePath };
}

interface LoadedSetPack {
  setLabel: string;
  setDir: string;
  manifest: SheetManifest;
  pages: Array<{ image: string; table: string; plate: Plate; json: SheetJsonHashDocument }>;
  untrimmed: Plate[];
  lightRef: Uint8Array;
  darkRef: Uint8Array;
  diagnosticLightMaxDelta: number | null;
}

function compositeStraightAlphaOver(
  src: Uint8Array,
  bg: readonly [number, number, number, number],
): Uint8Array {
  const out = new Uint8Array(src.length);
  const bgR = bg[0];
  const bgG = bg[1];
  const bgB = bg[2];
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3]!;
    if (a === 0) {
      out[i] = bgR;
      out[i + 1] = bgG;
      out[i + 2] = bgB;
      out[i + 3] = 255;
    } else if (a === 255) {
      out[i] = src[i]!;
      out[i + 1] = src[i + 1]!;
      out[i + 2] = src[i + 2]!;
      out[i + 3] = 255;
    } else {
      out[i] = Math.round((src[i]! * a + bgR * (255 - a)) / 255);
      out[i + 1] = Math.round((src[i + 1]! * a + bgG * (255 - a)) / 255);
      out[i + 2] = Math.round((src[i + 2]! * a + bgB * (255 - a)) / 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

function resolveSheetSetDirs(sheetDir: string): string[] {
  if (!existsSync(sheetDir)) {
    failRefusal(`--sheet directory not found at ${sheetDir}`);
  }
  let st;
  try {
    st = statSync(sheetDir);
  } catch (err) {
    failRefusal(`cannot stat --sheet path ${sheetDir}: ${(err as Error).message}`);
  }
  if (!st.isDirectory()) {
    failRefusal(`--sheet path ${sheetDir} is not a directory`);
  }

  const directManifest = join(sheetDir, SHEET_MANIFEST_FILE);
  if (existsSync(directManifest)) {
    return [sheetDir];
  }

  const framesJsonPath = join(sheetDir, 'frames.json');
  if (existsSync(framesJsonPath)) {
    let parsed: { sets?: Array<{ dir?: string; animation?: string; sheet?: unknown }> };
    try {
      parsed = JSON.parse(readFileSync(framesJsonPath, 'utf8')) as {
        sets?: Array<{ dir?: string; animation?: string; sheet?: unknown }>;
      };
    } catch (err) {
      failRefusal(`failed to parse ${framesJsonPath}: ${(err as Error).message}`);
    }
    const sets = Array.isArray(parsed.sets) ? parsed.sets : [];
    const dirs: string[] = [];
    for (const s of sets) {
      const sub = typeof s.dir === 'string' && s.dir.length > 0 ? s.dir : s.animation;
      if (typeof sub !== 'string' || sub.length === 0) continue;
      const candidate = join(sheetDir, sub);
      if (existsSync(join(candidate, SHEET_MANIFEST_FILE))) {
        dirs.push(candidate);
      }
    }
    if (dirs.length === 0) {
      failRefusal(
        `${framesJsonPath} contains no animation set with ${SHEET_MANIFEST_FILE} (re-run "rigc render --sheet" first)`,
      );
    }
    return dirs;
  }

  failRefusal(
    `neither ${SHEET_MANIFEST_FILE} nor frames.json found in ${sheetDir} (pass a "rigc render --sheet" output directory or set directory)`,
  );
}

function loadAndVerifySetOnHost(setDir: string): LoadedSetPack {
  const manifestPath = join(setDir, SHEET_MANIFEST_FILE);
  let manifest: SheetManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as SheetManifest;
  } catch (err) {
    failRefusal(`failed to parse ${manifestPath}: ${(err as Error).message}`);
  }

  if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    failRefusal(`${manifestPath} has no pages[] entries`);
  }
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
    failRefusal(`${manifestPath} has no frames[] entries`);
  }

  const pages: Array<{ image: string; table: string; plate: Plate; json: SheetJsonHashDocument }> = [];
  for (const p of manifest.pages) {
    const imgPath = join(setDir, p.image);
    const tblPath = join(setDir, p.table);
    if (!existsSync(imgPath)) {
      failRefusal(`${manifestPath} references missing page image ${imgPath}`);
    }
    if (!existsSync(tblPath)) {
      failRefusal(`${manifestPath} references missing page descriptor ${tblPath}`);
    }
    const plate = readPlate(imgPath);
    let json: SheetJsonHashDocument;
    try {
      json = JSON.parse(readFileSync(tblPath, 'utf8')) as SheetJsonHashDocument;
    } catch (err) {
      failRefusal(`failed to parse ${tblPath}: ${(err as Error).message}`);
    }
    pages.push({ image: p.image, table: p.table, plate, json });
  }

  const untrimmed: Plate[] = [];
  for (const mf of manifest.frames) {
    const page = pages[mf.page];
    if (page === undefined) {
      failRefusal(`${manifestPath} frame ${JSON.stringify(mf.key)} references missing page index ${mf.page}`);
    }
    const entry = page.json.frames[mf.key];
    if (entry === undefined) {
      failRefusal(`${manifestPath} frame ${JSON.stringify(mf.key)} is missing from ${page.table}`);
    }
    untrimmed.push(reconstructSheetFrame(page.plate, entry));
  }

  const hostFaults = sheetPackFaults(pages, manifest, untrimmed);
  if (hostFaults.length > 0) {
    failRefusal(`host pre-check failed on ${setDir}: ${hostFaults[0]}`);
  }

  const frameBytes = manifest.sourceSize.w * manifest.sourceSize.h * 4;
  const lightRef = new Uint8Array(frameBytes * untrimmed.length);
  const darkRef = new Uint8Array(frameBytes * untrimmed.length);
  let diagnosticLightMaxDelta: number | null = null;

  for (let i = 0; i < untrimmed.length; i++) {
    const u = untrimmed[i]!;
    const lComp = compositeStraightAlphaOver(u.data, LIGHT_BG);
    const dComp = compositeStraightAlphaOver(u.data, DARK_BG);
    lightRef.set(lComp, i * frameBytes);
    darkRef.set(dComp, i * frameBytes);

    // If diagnostic f####.png exists on disk, measure max channel delta against lightRef.
    const diagName = `f${String(i).padStart(4, '0')}.png`;
    const diagPath = join(setDir, diagName);
    if (existsSync(diagPath)) {
      const diagPlate = readPlate(diagPath);
      if (diagPlate.width === manifest.sourceSize.w && diagPlate.height === manifest.sourceSize.h) {
        let maxD: number = diagnosticLightMaxDelta ?? 0;
        for (let b = 0; b < frameBytes; b++) {
          const d = Math.abs(diagPlate.data[b]! - lComp[b]!);
          if (d > maxD) maxD = d;
        }
        diagnosticLightMaxDelta = maxD;
      }
    }
  }

  return {
    setLabel: `${manifest.namespace} (${basename(setDir)})`,
    setDir,
    manifest,
    pages,
    untrimmed,
    lightRef,
    darkRef,
    diagnosticLightMaxDelta,
  };
}

function verifyBrowserExecutable(browserPath: string): string {
  if (!existsSync(browserPath)) {
    failRefusal(
      `Playwright Chromium browser not found at ${browserPath}\n` +
        `  Install Playwright Chromium or pass --browser /path/to/chrome`,
    );
  }
  const probe = Bun.spawnSync([browserPath, '--version'], {
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15_000,
  });
  const out = Buffer.from(probe.stdout).toString('utf8').trim();
  const err = Buffer.from(probe.stderr).toString('utf8').trim();
  if (probe.exitCode !== 0 || out.length === 0) {
    const detail = [out, err].filter((s) => s.length > 0).join(' | ') || '(no output)';
    failRefusal(
      `browser executable ${browserPath} --version failed (exit ${String(probe.exitCode)}): ${detail}`,
    );
  }
  return out.split('\n')[0]!.trim();
}

interface ReaderSetReport {
  setIndex: number;
  namespace: string;
  pagesCount: number;
  framesCount: number;
  pixi: {
    version: string;
    alphaMode: string;
    linkedSheetsCount: number;
    relatedMultiPacks: string[];
    totalTexturesLoaded: number;
    trimmedFramesCount: number;
    emptyFramesCount: number;
    maxPivotDriftPx: number;
    chronologicalOrderHeld: boolean;
    multipageMembershipHeld: boolean;
    lightBgMaxChannelDelta: number;
    lightBgDiffPixels: number;
    darkBgMaxChannelDelta: number;
    darkBgDiffPixels: number;
    faults: string[];
  };
  phaser: {
    version: string;
    textureSourcesCount: number;
    totalFramesLoaded: number;
    trimmedFramesCount: number;
    emptyFramesCount: number;
    maxPivotDriftPx: number;
    chronologicalOrderHeld: boolean;
    multipageMembershipHeld: boolean;
    lightBgMaxChannelDelta: number;
    lightBgDiffPixels: number;
    darkBgMaxChannelDelta: number;
    darkBgDiffPixels: number;
    faults: string[];
  };
}

interface BrowserHarnessPayload {
  ok: boolean;
  error?: string;
  pixiVersion?: string;
  phaserVersion?: string;
  sets?: ReaderSetReport[];
}

function buildHarnessHtml(setCount: number): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>rigc sheet_readers</title></head>
<body>
<script src="/lib/pixi.min.js"></script>
<script src="/lib/phaser.js"></script>
<script>
(async () => {
  const SET_COUNT = ${setCount};
  const MAX_TOL = ${MAX_CHANNEL_TOLERANCE};
  try {
    const pixiVersion = typeof PIXI !== "undefined" && PIXI.VERSION ? String(PIXI.VERSION) : "missing";
    const phaserVersion = typeof Phaser !== "undefined" && Phaser.VERSION ? String(Phaser.VERSION) : "missing";
    const setReports = [];

    for (let s = 0; s < SET_COUNT; s++) {
      const base = "/sets/" + s;
      const manifest = await (await fetch(base + "/sheet-manifest.json")).json();
      const refLight = new Uint8Array(await (await fetch(base + "/ref-light.bin")).arrayBuffer());
      const refDark = new Uint8Array(await (await fetch(base + "/ref-dark.bin")).arrayBuffer());
      const W = manifest.sourceSize.w;
      const H = manifest.sourceSize.h;
      const frameBytes = W * H * 4;

      function compareRgba(got, refSlice) {
        let maxD = 0;
        let diffPx = 0;
        for (let i = 0; i < frameBytes; i += 4) {
          const d0 = Math.abs(got[i] - refSlice[i]);
          const d1 = Math.abs(got[i + 1] - refSlice[i + 1]);
          const d2 = Math.abs(got[i + 2] - refSlice[i + 2]);
          const d3 = Math.abs(got[i + 3] - refSlice[i + 3]);
          const dm = Math.max(d0, d1, d2, d3);
          if (dm > 0) diffPx++;
          if (dm > maxD) maxD = dm;
        }
        return { maxD, diffPx };
      }

      // =====================================================================
      // 1. PixiJS 8.22.0 reader check (PIXI.Assets.load -> PIXI.Spritesheet)
      // =====================================================================
      const pixiFaults = [];
      if (pixiVersion !== "${REQUIRED_READER_PINS['pixi.js']}") {
        pixiFaults.push("PIXI.VERSION is " + JSON.stringify(pixiVersion) + ", required \\"${REQUIRED_READER_PINS['pixi.js']}\\"");
      }
      const rootSheet = await PIXI.Assets.load(base + "/" + manifest.pages[0].table);
      const linkedSheets = Array.isArray(rootSheet.linkedSheets) ? rootSheet.linkedSheets : [];
      const allSheets = [rootSheet, ...linkedSheets];
      const relatedMultiPacks = (rootSheet.data && rootSheet.data.meta && Array.isArray(rootSheet.data.meta.related_multi_packs))
        ? rootSheet.data.meta.related_multi_packs
        : [];

      let pixiMultipageHeld = true;
      if (allSheets.length !== manifest.pages.length) {
        pixiMultipageHeld = false;
        pixiFaults.push("PixiJS loaded " + allSheets.length + " sheet page(s), expected " + manifest.pages.length);
      }
      if (manifest.pages.length > 1) {
        const expectedRelated = manifest.pages.slice(1).map((p) => p.table);
        if (JSON.stringify(relatedMultiPacks) !== JSON.stringify(expectedRelated)) {
          pixiMultipageHeld = false;
          pixiFaults.push("PixiJS root meta.related_multi_packs is " + JSON.stringify(relatedMultiPacks) + ", expected " + JSON.stringify(expectedRelated));
        }
      } else if (relatedMultiPacks.length !== 0) {
        pixiMultipageHeld = false;
        pixiFaults.push("PixiJS single-page sheet unexpectedly has related_multi_packs " + JSON.stringify(relatedMultiPacks));
      }

      // Check per-page texture counts and animations[manifest.namespace] chronological order
      let pixiTotalTextures = 0;
      let pixiChronoHeld = true;
      const pixiTexByKey = new Map();
      const pixiPageByKey = new Map();
      let pixiAlphaMode = "unknown";

      for (let p = 0; p < allSheets.length; p++) {
        const sh = allSheets[p];
        const mp = manifest.pages[p];
        const keys = Object.keys(sh.textures || {});
        pixiTotalTextures += keys.length;
        if (mp && JSON.stringify(keys) !== JSON.stringify(mp.frames)) {
          pixiMultipageHeld = false;
          pixiFaults.push("PixiJS page " + p + " (" + mp.table + ") has keys " + JSON.stringify(keys) + ", expected " + JSON.stringify(mp.frames));
        }
        const expectedPageKeys = manifest.frames.filter((f) => f.page === p).map((f) => f.key);
        const animSeq = (sh.animations && sh.animations[manifest.namespace]) || [];
        if (animSeq.length !== expectedPageKeys.length) {
          pixiChronoHeld = false;
          pixiFaults.push("PixiJS page " + p + " animations[" + JSON.stringify(manifest.namespace) + "] has length " + animSeq.length + ", expected " + expectedPageKeys.length);
        } else {
          for (let k = 0; k < expectedPageKeys.length; k++) {
            const wantKey = expectedPageKeys[k];
            if (animSeq[k] !== sh.textures[wantKey]) {
              pixiChronoHeld = false;
              pixiFaults.push("PixiJS page " + p + " animations[" + JSON.stringify(manifest.namespace) + "][" + k + "] does not match texture " + JSON.stringify(wantKey));
              break;
            }
          }
        }
        for (const k of keys) {
          if (pixiTexByKey.has(k)) {
            pixiMultipageHeld = false;
            pixiFaults.push("PixiJS duplicate frame key " + JSON.stringify(k) + " across pages " + pixiPageByKey.get(k) + " and " + p);
          }
          const t = sh.textures[k];
          if (t && t.source && t.source.alphaMode) {
            pixiAlphaMode = String(t.source.alphaMode);
          }
          pixiTexByKey.set(k, t);
          pixiPageByKey.set(k, p);
        }
      }

      if (pixiTotalTextures !== manifest.frames.length) {
        pixiMultipageHeld = false;
        pixiFaults.push("PixiJS total textures across pages is " + pixiTotalTextures + ", expected " + manifest.frames.length);
      }

      // Render setup in PixiJS
      const pixiRenderer = await PIXI.autoDetectRenderer({
        width: W,
        height: H,
        backgroundColor: 0xe8e8e8,
        backgroundAlpha: 1,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      const pixiStage = new PIXI.Container();
      const fullFrameRect = new PIXI.Rectangle(0, 0, W, H);

      function renderPixiSprite(sprite, bgColor) {
        pixiStage.removeChildren();
        pixiStage.addChild(sprite);
        const extracted = pixiRenderer.extract.pixels({
          target: pixiStage,
          frame: fullFrameRect,
          clearColor: bgColor,
        });
        return extracted.pixels;
      }

      let pixiTrimmedCount = 0;
      let pixiEmptyCount = 0;
      let pixiMaxPivotDrift = 0;
      let pixiLightMaxDelta = 0;
      let pixiLightDiffPixels = 0;
      let pixiDarkMaxDelta = 0;
      let pixiDarkDiffPixels = 0;
      let prevTime = -Infinity;

      for (let i = 0; i < manifest.frames.length; i++) {
        const mf = manifest.frames[i];
        if (mf.index !== i || mf.time < prevTime) {
          pixiChronoHeld = false;
          pixiFaults.push("manifest.frames[" + i + "] (" + mf.key + ") out of chronological order (index=" + mf.index + ", time=" + mf.time + ")");
        }
        prevTime = mf.time;

        const tex = pixiTexByKey.get(mf.key);
        const gotPage = pixiPageByKey.get(mf.key);
        if (!tex) {
          pixiMultipageHeld = false;
          pixiFaults.push("PixiJS missing texture for frame " + JSON.stringify(mf.key));
          continue;
        }
        if (gotPage !== mf.page) {
          pixiMultipageHeld = false;
          pixiFaults.push("PixiJS frame " + JSON.stringify(mf.key) + " loaded from page " + gotPage + ", expected " + mf.page);
        }

        // Check cut frame
        if (
          tex.frame.x !== mf.frame.x ||
          tex.frame.y !== mf.frame.y ||
          tex.frame.width !== mf.frame.w ||
          tex.frame.height !== mf.frame.h
        ) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " cut rect is {" +
            tex.frame.x + "," + tex.frame.y + "," + tex.frame.width + "," + tex.frame.height +
            "}, expected " + JSON.stringify(mf.frame)
          );
        }

        // Check sourceSize (tex.orig)
        if (tex.orig.width !== mf.sourceSize.w || tex.orig.height !== mf.sourceSize.h) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " orig size is " +
            tex.orig.width + "x" + tex.orig.height + ", expected " + mf.sourceSize.w + "x" + mf.sourceSize.h
          );
        }

        // Check trim / spriteSourceSize
        const isTrimmed =
          mf.empty ||
          mf.spriteSourceSize.x !== 0 ||
          mf.spriteSourceSize.y !== 0 ||
          mf.spriteSourceSize.w !== mf.sourceSize.w ||
          mf.spriteSourceSize.h !== mf.sourceSize.h;
        if (mf.empty) pixiEmptyCount++;
        if (isTrimmed) {
          pixiTrimmedCount++;
          if (
            !tex.trim ||
            tex.trim.x !== mf.spriteSourceSize.x ||
            tex.trim.y !== mf.spriteSourceSize.y ||
            tex.trim.width !== mf.spriteSourceSize.w ||
            tex.trim.height !== mf.spriteSourceSize.h
          ) {
            pixiFaults.push(
              "PixiJS trimmed frame " + JSON.stringify(mf.key) + " tex.trim is " +
              JSON.stringify(tex.trim) + ", expected " + JSON.stringify(mf.spriteSourceSize)
            );
          }
        } else if (tex.trim !== null && tex.trim !== undefined) {
          pixiFaults.push(
            "PixiJS untrimmed frame " + JSON.stringify(mf.key) + " unexpectedly set tex.trim=" + JSON.stringify(tex.trim)
          );
        }

        // Check defaultAnchor and PIXI.Sprite world (0, 0) alignment
        if (
          !tex.defaultAnchor ||
          Math.abs(tex.defaultAnchor.x - mf.anchor.x) > 1e-12 ||
          Math.abs(tex.defaultAnchor.y - mf.anchor.y) > 1e-12
        ) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " defaultAnchor is " +
            JSON.stringify(tex.defaultAnchor) + ", expected " + JSON.stringify(mf.anchor)
          );
        }
        const sp = new PIXI.Sprite(tex);
        sp.position.set(manifest.pivot.canvasPx.x, manifest.pivot.canvasPx.y);
        const vb = sp.visualBounds;
        const driftX = Math.abs((sp.position.x + vb.minX) - mf.spriteSourceSize.x);
        const driftY = Math.abs((sp.position.y + vb.minY) - mf.spriteSourceSize.y);
        const driftW = Math.abs((vb.maxX - vb.minX) - mf.spriteSourceSize.w);
        const driftH = Math.abs((vb.maxY - vb.minY) - mf.spriteSourceSize.h);
        const frameDrift = Math.max(driftX, driftY, driftW, driftH);
        if (frameDrift > pixiMaxPivotDrift) pixiMaxPivotDrift = frameDrift;
        if (frameDrift > 1e-6) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " world visualBounds drift is " + frameDrift + " px"
          );
        }

        // Check straight-alpha rendering over light [232,232,232,255] and dark [28,28,32,255]
        const refL = refLight.subarray(i * frameBytes, (i + 1) * frameBytes);
        const refD = refDark.subarray(i * frameBytes, (i + 1) * frameBytes);
        const cmpL = compareRgba(renderPixiSprite(sp, 0xe8e8e8), refL);
        const cmpD = compareRgba(renderPixiSprite(sp, 0x1c1c20), refD);
        if (cmpL.maxD > pixiLightMaxDelta) pixiLightMaxDelta = cmpL.maxD;
        pixiLightDiffPixels += cmpL.diffPx;
        if (cmpD.maxD > pixiDarkMaxDelta) pixiDarkMaxDelta = cmpD.maxD;
        pixiDarkDiffPixels += cmpD.diffPx;
        if (cmpL.maxD > MAX_TOL) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " light-bg maxChannelDelta is " + cmpL.maxD + " (> " + MAX_TOL + ")"
          );
        }
        if (cmpD.maxD > MAX_TOL) {
          pixiFaults.push(
            "PixiJS frame " + JSON.stringify(mf.key) + " dark-bg maxChannelDelta is " + cmpD.maxD + " (> " + MAX_TOL + ")"
          );
        }
        sp.destroy();
      }
      pixiRenderer.destroy();

      // =====================================================================
      // 2. Phaser 3.90.0 reader check (JSONHash / addAtlasJSONHash + Canvas)
      // =====================================================================
      const phaserReport = await new Promise((resolvePhaser) => {
        const phaserFaults = [];
        if (phaserVersion !== "${REQUIRED_READER_PINS.phaser}") {
          phaserFaults.push("Phaser.VERSION is " + JSON.stringify(phaserVersion) + ", required \\"${REQUIRED_READER_PINS.phaser}\\"");
        }
        const packKey = "pack_" + s;
        let gameInstance = null;
        gameInstance = new Phaser.Game({
          type: Phaser.CANVAS,
          width: W,
          height: H,
          backgroundColor: "#e8e8e8",
          banner: false,
          audio: { noAudio: true },
          render: { roundPixels: false, antialias: false },
          scene: {
            preload() {
              if (manifest.pages.length === 1) {
                this.load.atlas(
                  packKey,
                  base + "/" + manifest.pages[0].image,
                  base + "/" + manifest.pages[0].table
                );
              } else {
                // Load root descriptor and each page JSON + image so addAtlasJSONHash
                // exercises Phaser's multi-source JSONHash array path via related_multi_packs.
                for (let p = 0; p < manifest.pages.length; p++) {
                  this.load.json(packKey + "_json_" + p, base + "/" + manifest.pages[p].table);
                  this.load.image(packKey + "_img_" + p, base + "/" + manifest.pages[p].image);
                }
              }
            },
            create() {
              try {
                let phMultipageHeld = true;
                if (manifest.pages.length > 1) {
                  const rootJson = this.cache.json.get(packKey + "_json_0");
                  const relPacks = (rootJson && rootJson.meta && Array.isArray(rootJson.meta.related_multi_packs))
                    ? rootJson.meta.related_multi_packs
                    : [];
                  const expectedRel = manifest.pages.slice(1).map((p) => p.table);
                  if (JSON.stringify(relPacks) !== JSON.stringify(expectedRel)) {
                    phMultipageHeld = false;
                    phaserFaults.push(
                      "Phaser root JSON meta.related_multi_packs is " + JSON.stringify(relPacks) + ", expected " + JSON.stringify(expectedRel)
                    );
                  }
                  const sources = [];
                  const datas = [];
                  for (let p = 0; p < manifest.pages.length; p++) {
                    const imgTex = this.textures.get(packKey + "_img_" + p);
                    sources.push(imgTex.getSourceImage());
                    datas.push(this.cache.json.get(packKey + "_json_" + p));
                  }
                  this.textures.addAtlasJSONHash(packKey, sources, datas);
                }

                const phTex = this.textures.get(packKey);
                if (!phTex || phTex.key === "__MISSING") {
                  phaserFaults.push("Phaser failed to register atlas texture " + JSON.stringify(packKey));
                }
                const sourcesCount = phTex && Array.isArray(phTex.source) ? phTex.source.length : 0;
                if (sourcesCount !== manifest.pages.length) {
                  phMultipageHeld = false;
                  phaserFaults.push("Phaser texture has " + sourcesCount + " source page(s), expected " + manifest.pages.length);
                }
                for (let p = 0; p < sourcesCount; p++) {
                  const src = phTex.source[p];
                  const mp = manifest.pages[p];
                  if (mp && (src.width !== mp.width || src.height !== mp.height)) {
                    phMultipageHeld = false;
                    phaserFaults.push(
                      "Phaser source[" + p + "] size is " + src.width + "x" + src.height + ", expected " + mp.width + "x" + mp.height
                    );
                  }
                }

                const frameNames = phTex.getFrameNames(false);
                if (frameNames.length !== manifest.frames.length) {
                  phMultipageHeld = false;
                  phaserFaults.push(
                    "Phaser texture has " + frameNames.length + " frame(s), expected " + manifest.frames.length
                  );
                }

                let phTrimmedCount = 0;
                let phEmptyCount = 0;
                let phMaxPivotDrift = 0;
                let phChronoHeld = true;
                let phLightMaxDelta = 0;
                let phLightDiffPixels = 0;
                let phDarkMaxDelta = 0;
                let phDarkDiffPixels = 0;

                const phSprite = this.add.sprite(
                  manifest.pivot.canvasPx.x,
                  manifest.pivot.canvasPx.y,
                  packKey,
                  manifest.frames[0].key
                );
                this.cameras.main.setRoundPixels(false);
                this.cameras.main.renderRoundPixels = false;
                const sysRenderer = this.sys.game.renderer;
                const ctx = this.sys.game.canvas.getContext("2d");
                let prevPhTime = -Infinity;

                for (let i = 0; i < manifest.frames.length; i++) {
                  const mf = manifest.frames[i];
                  if (mf.index !== i || mf.time < prevPhTime) {
                    phChronoHeld = false;
                    phaserFaults.push("Phaser playback step " + i + " (" + mf.key + ") out of chronological order");
                  }
                  prevPhTime = mf.time;

                  const phFrame = phTex.get(mf.key);
                  if (!phFrame || phFrame.name !== mf.key) {
                    phMultipageHeld = false;
                    phaserFaults.push("Phaser missing frame " + JSON.stringify(mf.key));
                    continue;
                  }
                  if (phFrame.sourceIndex !== mf.page) {
                    phMultipageHeld = false;
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " has sourceIndex=" + phFrame.sourceIndex + ", expected " + mf.page
                    );
                  }

                  // Check cut rectangle
                  if (
                    phFrame.cutX !== mf.frame.x ||
                    phFrame.cutY !== mf.frame.y ||
                    phFrame.cutWidth !== mf.frame.w ||
                    phFrame.cutHeight !== mf.frame.h
                  ) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " cut rect is {" +
                      phFrame.cutX + "," + phFrame.cutY + "," + phFrame.cutWidth + "," + phFrame.cutHeight +
                      "}, expected " + JSON.stringify(mf.frame)
                    );
                  }

                  // Check sourceSize (realWidth, realHeight)
                  if (phFrame.realWidth !== mf.sourceSize.w || phFrame.realHeight !== mf.sourceSize.h) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " realSize is " +
                      phFrame.realWidth + "x" + phFrame.realHeight + ", expected " + mf.sourceSize.w + "x" + mf.sourceSize.h
                    );
                  }

                  // Check trim & spriteSourceSize
                  const isTrimmed =
                    mf.empty ||
                    mf.spriteSourceSize.x !== 0 ||
                    mf.spriteSourceSize.y !== 0 ||
                    mf.spriteSourceSize.w !== mf.sourceSize.w ||
                    mf.spriteSourceSize.h !== mf.sourceSize.h;
                  if (mf.empty) phEmptyCount++;
                  if (isTrimmed) phTrimmedCount++;
                  if (Boolean(phFrame.trimmed) !== isTrimmed) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " trimmed=" + phFrame.trimmed + ", expected " + isTrimmed
                    );
                  }
                  if (
                    phFrame.x !== mf.spriteSourceSize.x ||
                    phFrame.y !== mf.spriteSourceSize.y ||
                    phFrame.width !== mf.spriteSourceSize.w ||
                    phFrame.height !== mf.spriteSourceSize.h
                  ) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " trim box is {" +
                      phFrame.x + "," + phFrame.y + "," + phFrame.width + "," + phFrame.height +
                      "}, expected " + JSON.stringify(mf.spriteSourceSize)
                    );
                  }

                  // Step sprite to frame (with updateSize=true, updateOrigin=true)
                  phSprite.setFrame(mf.key, true, true);
                  if (
                    !phFrame.customPivot ||
                    Math.abs(phFrame.pivotX - mf.anchor.x) > 1e-12 ||
                    Math.abs(phFrame.pivotY - mf.anchor.y) > 1e-12 ||
                    Math.abs(phSprite.originX - mf.anchor.x) > 1e-12 ||
                    Math.abs(phSprite.originY - mf.anchor.y) > 1e-12
                  ) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " pivot/origin is (" +
                      phSprite.originX + "," + phSprite.originY + "), expected (" + mf.anchor.x + "," + mf.anchor.y + ")"
                    );
                  }

                  const drawLeft = phSprite.x - phSprite.displayOriginX + phFrame.x;
                  const drawTop = phSprite.y - phSprite.displayOriginY + phFrame.y;
                  const driftX = Math.abs(drawLeft - mf.spriteSourceSize.x);
                  const driftY = Math.abs(drawTop - mf.spriteSourceSize.y);
                  const frameDrift = Math.max(driftX, driftY);
                  if (frameDrift > phMaxPivotDrift) phMaxPivotDrift = frameDrift;
                  if (frameDrift > 1e-6) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " origin placement drift is " + frameDrift + " px"
                    );
                  }

                  // Render over light [232,232,232,255] and dark [28,28,32,255]
                  const refL = refLight.subarray(i * frameBytes, (i + 1) * frameBytes);
                  const refD = refDark.subarray(i * frameBytes, (i + 1) * frameBytes);

                  this.cameras.main.setBackgroundColor(0xe8e8e8);
                  sysRenderer.preRender();
                  this.sys.displayList.depthSort();
                  this.cameras.main.matrix.loadIdentity();
                  sysRenderer.render(this, this.sys.displayList.list, this.cameras.main);
                  sysRenderer.postRender();
                  const gotL = ctx.getImageData(0, 0, W, H).data;
                  const cmpL = compareRgba(gotL, refL);
                  if (cmpL.maxD > phLightMaxDelta) phLightMaxDelta = cmpL.maxD;
                  phLightDiffPixels += cmpL.diffPx;
                  if (cmpL.maxD > MAX_TOL) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " light-bg maxChannelDelta is " + cmpL.maxD + " (> " + MAX_TOL + ")"
                    );
                  }

                  this.cameras.main.setBackgroundColor(0x1c1c20);
                  sysRenderer.preRender();
                  sysRenderer.render(this, this.sys.displayList.list, this.cameras.main);
                  sysRenderer.postRender();
                  const gotD = ctx.getImageData(0, 0, W, H).data;
                  const cmpD = compareRgba(gotD, refD);
                  if (cmpD.maxD > phDarkMaxDelta) phDarkMaxDelta = cmpD.maxD;
                  phDarkDiffPixels += cmpD.diffPx;
                  if (cmpD.maxD > MAX_TOL) {
                    phaserFaults.push(
                      "Phaser frame " + JSON.stringify(mf.key) + " dark-bg maxChannelDelta is " + cmpD.maxD + " (> " + MAX_TOL + ")"
                    );
                  }
                }

                const result = {
                  version: phaserVersion,
                  textureSourcesCount: sourcesCount,
                  totalFramesLoaded: frameNames.length,
                  trimmedFramesCount: phTrimmedCount,
                  emptyFramesCount: phEmptyCount,
                  maxPivotDriftPx: phMaxPivotDrift,
                  chronologicalOrderHeld: phChronoHeld,
                  multipageMembershipHeld: phMultipageHeld,
                  lightBgMaxChannelDelta: phLightMaxDelta,
                  lightBgDiffPixels: phLightDiffPixels,
                  darkBgMaxChannelDelta: phDarkMaxDelta,
                  darkBgDiffPixels: phDarkDiffPixels,
                  faults: phaserFaults,
                };
                setTimeout(() => {
                  try { gameInstance.destroy(true); } catch {}
                  resolvePhaser(result);
                }, 0);
              } catch (innerErr) {
                phaserFaults.push(String(innerErr && innerErr.stack || innerErr));
                resolvePhaser({
                  version: phaserVersion,
                  textureSourcesCount: 0,
                  totalFramesLoaded: 0,
                  trimmedFramesCount: 0,
                  emptyFramesCount: 0,
                  maxPivotDriftPx: Infinity,
                  chronologicalOrderHeld: false,
                  multipageMembershipHeld: false,
                  lightBgMaxChannelDelta: 255,
                  lightBgDiffPixels: -1,
                  darkBgMaxChannelDelta: 255,
                  darkBgDiffPixels: -1,
                  faults: phaserFaults,
                });
              }
            }
          }
        });
      });

      setReports.push({
        setIndex: s,
        namespace: manifest.namespace,
        pagesCount: manifest.pages.length,
        framesCount: manifest.frames.length,
        pixi: {
          version: pixiVersion,
          alphaMode: pixiAlphaMode,
          linkedSheetsCount: linkedSheets.length,
          relatedMultiPacks,
          totalTexturesLoaded: pixiTotalTextures,
          trimmedFramesCount: pixiTrimmedCount,
          emptyFramesCount: pixiEmptyCount,
          maxPivotDriftPx: pixiMaxPivotDrift,
          chronologicalOrderHeld: pixiChronoHeld,
          multipageMembershipHeld: pixiMultipageHeld,
          lightBgMaxChannelDelta: pixiLightMaxDelta,
          lightBgDiffPixels: pixiLightDiffPixels,
          darkBgMaxChannelDelta: pixiDarkMaxDelta,
          darkBgDiffPixels: pixiDarkDiffPixels,
          faults: pixiFaults,
        },
        phaser: phaserReport,
      });
    }

    const anyFaults = setReports.some((r) => r.pixi.faults.length > 0 || r.phaser.faults.length > 0);
    await fetch("/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: !anyFaults,
        pixiVersion,
        phaserVersion,
        sets: setReports,
      }),
    });
  } catch (err) {
    await fetch("/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: String(err && err.stack || err),
      }),
    });
  }
})();
</script>
</body>
</html>`;
}

async function main(): Promise<void> {
  const opts = parseCliArgs(process.argv.slice(2));

  // Step 0a: Verify pinned devDependencies, bun.lock, and node_modules before touching the browser.
  const { pixiBundlePath, phaserBundlePath } = verifyPinnedReaderPackages(opts.packageRoot);

  // Step 0b: Verify --sheet directory and reconstruct reference frames on the host.
  const setDirs = resolveSheetSetDirs(opts.sheetDir);
  const loadedSets = setDirs.map((dir) => loadAndVerifySetOnHost(dir));

  // Step 0c: Verify the Playwright Chromium executable exists and reports its version.
  const browserVersion = verifyBrowserExecutable(opts.browserPath);

  let resolveReport!: (payload: BrowserHarnessPayload) => void;
  const reportPromise = new Promise<BrowserHarnessPayload>((r) => {
    resolveReport = r;
  });

  const harnessHtml = buildHarnessHtml(loadedSets.length);

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      if (url.pathname === '/harness.html' || url.pathname === '/') {
        return new Response(harnessHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (url.pathname === '/lib/pixi.min.js') {
        return new Response(Bun.file(pixiBundlePath), {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
      if (url.pathname === '/lib/phaser.js') {
        return new Response(Bun.file(phaserBundlePath), {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
      if (url.pathname === '/report' && req.method === 'POST') {
        const payload = (await req.json()) as BrowserHarnessPayload;
        resolveReport(payload);
        return new Response('ok');
      }
      const setMatch = /^\/sets\/(\d+)\/(.+)$/.exec(url.pathname);
      if (setMatch !== null) {
        const idx = Number(setMatch[1]);
        const rel = setMatch[2]!;
        const setPack = loadedSets[idx];
        if (setPack === undefined) return new Response('not found', { status: 404 });
        if (rel === 'ref-light.bin') {
          return new Response(setPack.lightRef, {
            headers: { 'content-type': 'application/octet-stream' },
          });
        }
        if (rel === 'ref-dark.bin') {
          return new Response(setPack.darkRef, {
            headers: { 'content-type': 'application/octet-stream' },
          });
        }
        if (rel.includes('..') || rel.includes('/')) {
          return new Response('forbidden', { status: 403 });
        }
        const filePath = join(setPack.setDir, rel);
        if (!existsSync(filePath)) return new Response('not found', { status: 404 });
        const contentType = rel.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : rel.endsWith('.png')
            ? 'image/png'
            : 'application/octet-stream';
        return new Response(Bun.file(filePath), { headers: { 'content-type': contentType } });
      }
      return new Response('not found', { status: 404 });
    },
  });

  const userDataDir = mkdtempSync(join(tmpdir(), 'rigc-sheet-readers-profile-'));
  const proc = Bun.spawn(
    [
      opts.browserPath,
      '--headless',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      `http://127.0.0.1:${server.port}/harness.html`,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<BrowserHarnessPayload>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`headless browser timed out after ${opts.timeoutSec}s`));
    }, opts.timeoutSec * 1000);
  });

  let payload: BrowserHarnessPayload;
  try {
    payload = await Promise.race([reportPromise, timeoutPromise]);
  } catch (err) {
    try {
      proc.kill(9);
    } catch {}
    server.stop(true);
    rmSync(userDataDir, { recursive: true, force: true });
    failRefusal((err as Error).message);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  try {
    proc.kill(9);
  } catch {}
  await proc.exited.catch(() => {});
  server.stop(true);
  rmSync(userDataDir, { recursive: true, force: true });

  if (payload.error !== undefined) {
    failRefusal(`browser harness threw: ${payload.error}`);
  }
  const reports = payload.sets ?? [];
  if (reports.length !== loadedSets.length) {
    failRefusal(`browser harness reported ${reports.length} set(s), expected ${loadedSets.length}`);
  }

  console.log(`browser: ${browserVersion} (${opts.browserPath})`);
  console.log(
    `readers: pixi.js@${payload.pixiVersion ?? 'unknown'} (pinned ${REQUIRED_READER_PINS['pixi.js']}), ` +
      `phaser@${payload.phaserVersion ?? 'unknown'} (pinned ${REQUIRED_READER_PINS.phaser})`,
  );

  const allFaults: string[] = [];
  for (let i = 0; i < reports.length; i++) {
    const rep = reports[i]!;
    const hostPack = loadedSets[i]!;
    const diagNote =
      hostPack.diagnosticLightMaxDelta !== null
        ? `, host diagnostic f####.png vs lightRef maxDelta=${hostPack.diagnosticLightMaxDelta}`
        : '';
    console.log(
      `\nset ${rep.namespace} (${rep.pagesCount} page(s), ${rep.framesCount} frame(s)${diagNote}):`,
    );
    console.log(
      `  pixi.js@${rep.pixi.version}: textures=${rep.pixi.totalTexturesLoaded}/${rep.framesCount}, ` +
        `linkedSheets=${rep.pixi.linkedSheetsCount}, related_multi_packs=${JSON.stringify(rep.pixi.relatedMultiPacks)}, ` +
        `trimmed=${rep.pixi.trimmedFramesCount}, empty=${rep.pixi.emptyFramesCount}, ` +
        `maxPivotDriftPx=${rep.pixi.maxPivotDriftPx}, chrono=${rep.pixi.chronologicalOrderHeld}, ` +
        `multipage=${rep.pixi.multipageMembershipHeld}, alphaMode=${rep.pixi.alphaMode}, ` +
        `lightBg(maxDelta=${rep.pixi.lightBgMaxChannelDelta}, diffPx=${rep.pixi.lightBgDiffPixels}), ` +
        `darkBg(maxDelta=${rep.pixi.darkBgMaxChannelDelta}, diffPx=${rep.pixi.darkBgDiffPixels}) — ` +
        `${rep.pixi.faults.length === 0 ? 'PASS' : `FAIL (${rep.pixi.faults.length})`}`,
    );
    for (const f of rep.pixi.faults) {
      console.error(`    pixi fault: ${f}`);
      allFaults.push(`${rep.namespace} [pixi.js]: ${f}`);
    }

    console.log(
      `  phaser@${rep.phaser.version}: frames=${rep.phaser.totalFramesLoaded}/${rep.framesCount}, ` +
        `sources=${rep.phaser.textureSourcesCount}/${rep.pagesCount}, ` +
        `trimmed=${rep.phaser.trimmedFramesCount}, empty=${rep.phaser.emptyFramesCount}, ` +
        `maxPivotDriftPx=${rep.phaser.maxPivotDriftPx}, chrono=${rep.phaser.chronologicalOrderHeld}, ` +
        `multipage=${rep.phaser.multipageMembershipHeld}, ` +
        `lightBg(maxDelta=${rep.phaser.lightBgMaxChannelDelta}, diffPx=${rep.phaser.lightBgDiffPixels}), ` +
        `darkBg(maxDelta=${rep.phaser.darkBgMaxChannelDelta}, diffPx=${rep.phaser.darkBgDiffPixels}) — ` +
        `${rep.phaser.faults.length === 0 ? 'PASS' : `FAIL (${rep.phaser.faults.length})`}`,
    );
    for (const f of rep.phaser.faults) {
      console.error(`    phaser fault: ${f}`);
      allFaults.push(`${rep.namespace} [phaser]: ${f}`);
    }
  }

  if (allFaults.length > 0) {
    failRefusal(`${allFaults.length} reader check(s) failed; first: ${allFaults[0]}`);
  }
  console.log(`\nPASS: ${reports.length} set(s) verified in pixi.js@${REQUIRED_READER_PINS['pixi.js']} and phaser@${REQUIRED_READER_PINS.phaser}`);
}

if (import.meta.main) {
  await main();
}
