/**
 * The run viewer's dev server. `bun run viewer` from the repository root.
 *
 * 🚫 **There is no build.** The viewer reads `bench/runs/`, `bench/reference/`
 * and `examples/` straight off disk, and `examples/` is the Spine example
 * corpus: Esoteric Software's art, fetched rather than redistributed, licensed
 * for non-commercial use only when it travels with its own `license.txt` (see
 * NOTICE.md). A bundle would copy those pixels into a distributable artifact,
 * which is exactly what this repository is careful never to produce. So the
 * only mode is `vite dev`, serving the working tree to localhost, and the
 * `refuseBuild` plugin below makes that structural rather than a comment —
 * a `vite build` here fails on purpose.
 *
 * The two middlewares are the whole server:
 *
 *   GET /api/inventory   what is under bench/runs, rescanned per request
 *   GET /repo/<path>     one file from the repository, bench/ and examples/ only
 */
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { isServedRepoPath, REPO_MOUNT, scanInventory } from './inventory.ts';

const viewerDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(viewerDir, '..');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.atlas': 'text/plain; charset=utf-8',
};

function runViewer(): Plugin {
  return {
    name: 'rigc-run-viewer',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (url === '/api/inventory' || url.startsWith('/api/inventory?')) {
          // Rescanned per request: a run finished in another terminal shows up
          // on reload, with no server restart and no cache to be stale.
          const body = JSON.stringify(scanInventory(repoRoot));
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(body);
          return;
        }
        if (!url.startsWith(`${REPO_MOUNT}/`)) return next();

        const requested = decodeURIComponent(url.slice(REPO_MOUNT.length + 1).split('?')[0]);
        const file = path.resolve(repoRoot, requested);
        const rel = path.relative(repoRoot, file);
        // Refuse anything that climbs out of the repository or out of the two
        // trees the viewer is allowed to read. `path.resolve` has already
        // normalised the `..` segments a run's atlas legitimately contains.
        if (!isServedRepoPath(rel)) {
          response.statusCode = 403;
          response.end('forbidden');
          return;
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          response.statusCode = 404;
          response.end(`not found: ${rel}`);
          return;
        }
        response.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-cache');
        createReadStream(file).pipe(response);
      });
    },
  };
}

function refuseBuild(): Plugin {
  return {
    name: 'rigc-run-viewer-no-build',
    apply: 'build',
    buildStart() {
      this.error(
        'the run viewer has no build: it serves the example corpus off disk, and that art is ' +
          'not redistributable (NOTICE.md). Run `bun run viewer` instead.',
      );
    },
  };
}

export default defineConfig({
  root: viewerDir,
  // The viewer's own module graph lives in viewer/; the files it *reads* live
  // in the repository, and they arrive through /repo, not through Vite's
  // transform pipeline.
  server: { fs: { allow: [viewerDir, path.join(repoRoot, 'node_modules')] } },
  plugins: [runViewer(), refuseBuild()],
});
