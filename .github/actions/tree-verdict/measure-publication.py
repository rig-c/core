#!/usr/bin/env python3
"""Measure npm lifecycle against an ephemeral loopback-only registry.

Uses only Python's standard library, a local Node and local npm CLI sources.
Never downloads npm, installs dependencies, or reads the caller's npm config.
The output directory must be new and outside this repository.
"""
import argparse
import base64
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
import time


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--node', default=shutil.which('node'), type=Path)
    parser.add_argument('--npm-cli', action='append', type=Path,
                        help='Local npm CLI source. Repeat for multiple versions.')
    parser.add_argument('--only', choices=['all', 'pack'], default='all',
                        help='pack is a short harness preflight with no publication.')
    args = parser.parse_args()
    repository = Path(__file__).resolve().parents[3]
    output = args.out.resolve()
    if not args.out.is_absolute() or output.is_relative_to(repository):
        parser.error('--out must be absolute and outside the repository')
    if args.node is None or not args.node.is_file():
        parser.error('a local Node executable is required')
    npm_sources = args.npm_cli
    if not npm_sources:
        executable = shutil.which('npm')
        if executable is None:
            parser.error('a local npm CLI is required')
        npm_sources = [Path(executable).resolve()]
    if any(not source.is_absolute() or not source.is_file() for source in npm_sources):
        parser.error('--npm-cli must name an existing absolute local CLI source')
    output.mkdir(parents=True, exist_ok=False)
    for directory in ['home', 'tmp', 'cache', 'config']:
        (output / directory).mkdir()
    user_config = output / 'config/user.npmrc'
    global_config = output / 'config/global.npmrc'
    global_config.write_text('')
    # Construct an environment, rather than deleting a subset of inherited secrets.
    env = {
        'PATH': str(args.node.parent) + os.pathsep + os.defpath,
        'HOME': str(output / 'home'), 'TMPDIR': str(output / 'tmp'),
        'NPM_CONFIG_USERCONFIG': str(user_config),
        'NPM_CONFIG_GLOBALCONFIG': str(global_config),
        'NPM_CONFIG_CACHE': str(output / 'cache'),
        'NPM_CONFIG_UPDATE_NOTIFIER': 'false', 'NPM_CONFIG_AUDIT': 'false',
        'NPM_CONFIG_FUND': 'false', 'NPM_CONFIG_PROVENANCE': 'false',
        'NPM_CONFIG_FETCH_RETRIES': '0', 'NPM_CONFIG_LOGLEVEL': 'error',
    }
    node_version = subprocess.check_output([str(args.node), '--version'], env=env, text=True).strip()
    puts = []
    receipts = []

    def save():
        (output / 'receipts.json').write_text(json.dumps(receipts, indent=2) + '\n')
        (output / 'http-put-receipts.json').write_text(json.dumps(puts, indent=2) + '\n')

    class Registry(http.server.BaseHTTPRequestHandler):
        def log_message(self, *unused):
            pass

        def do_PUT(self):
            if self.client_address[0] != '127.0.0.1' or self.headers.get('Authorization') != 'Bearer LOCAL_FIXTURE_ONLY':
                self.send_error(403)
                return
            body = self.rfile.read(int(self.headers['Content-Length']))
            payload = json.loads(body)
            artifacts = []
            for name, item in payload.get('_attachments', {}).items():
                if Path(name).name != name:
                    self.send_error(400)
                    return
                data = base64.b64decode(item['data'])
                artifact = output / f'put-{len(puts) + 1}-{name}'
                artifact.write_bytes(data)
                artifacts.append({'path': str(artifact), 'sha256': sha256(data)})
            puts.append({'method': 'PUT', 'path': self.path, 'status': 201,
                         'bytes': len(body), 'sha256': sha256(body), 'artifacts': artifacts})
            save()
            self.send_response(201)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Registry)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    registry = f'http://127.0.0.1:{port}'
    user_config.write_text(f'registry={registry}\n//127.0.0.1:{port}/:_authToken=LOCAL_FIXTURE_ONLY\n')
    env['NPM_CONFIG_REGISTRY'] = registry

    def invoke(label, cli, arguments, cwd, marker):
        marker.write_text('')
        before = len(puts)
        argv = cli + arguments + ['--registry', registry, '--userconfig', str(user_config),
                                  '--globalconfig', str(global_config), '--cache', str(output / 'cache'),
                                  '--update-notifier=false']
        started = time.monotonic()
        result = subprocess.run(argv, cwd=cwd, env=dict(env, HOOK_MARKERS=str(marker)),
                                capture_output=True, text=True, timeout=45)
        (output / (label + '.stdout')).write_text(result.stdout)
        (output / (label + '.stderr')).write_text(result.stderr)
        receipts.append({'label': label, 'argv': argv, 'cwd': str(cwd),
                         'exit': result.returncode, 'seconds': round(time.monotonic() - started, 3),
                         'markers': marker.read_text().splitlines(), 'puts': puts[before:]})
        save()
        return result

    versions = []
    try:
        for index, source in enumerate(npm_sources):
            cli = [str(args.node), str(source)]
            version = subprocess.check_output(cli + ['--version'], env=env, text=True, timeout=15).strip()
            versions.append({'npm': version, 'node': node_version, 'cli': cli,
                             'cliSha256': sha256(source.read_bytes())})
            label = f'npm-{index}'
            folder = output / label
            folder.mkdir()
            destination = folder / 'packed'
            destination.mkdir()
            marker = folder / 'markers.txt'
            hooks = ['prepublishOnly', 'prepack', 'prepare', 'postpack', 'publish', 'postpublish']
            scripts = {hook: 'node -e ' + json.dumps(
                "require('node:fs').appendFileSync(process.env.HOOK_MARKERS," + json.dumps(hook + '\n') + ')'
            ) for hook in hooks}
            package = {'name': 'core-1707-lifecycle-fixture-' + str(index), 'version': '1.0.0',
                       'files': ['index.js'], 'scripts': scripts}
            manifest = folder / 'package.json'
            manifest.write_text(json.dumps(package, indent=2) + '\n')
            (folder / 'index.js').write_text('module.exports = 1707;\n')
            if args.only == 'all':
                invoke(label + '-folder-publish', cli, ['publish', '--access', 'public'], folder, marker)
            packed = invoke(label + '-pack', cli, ['pack', '.', '--pack-destination', str(destination)], folder, marker)
            tarballs = list(destination.glob('*.tgz'))
            if packed.returncode != 0 or len(tarballs) != 1:
                raise RuntimeError('pack did not produce exactly one tarball; retained RED receipts')
            tarball = tarballs[0]
            initial_hash = sha256(tarball.read_bytes())
            if args.only == 'pack':
                continue
            invoke(label + '-tarball-publish', cli, ['publish', str(tarball), '--access', 'public'], folder, marker)
            invoke(label + '-pack-ignore', cli, ['pack', '.', '--ignore-scripts', '--pack-destination', str(destination)], folder, marker)
            shell = folder / 'skip-lifecycle'
            shell.write_text('#!/bin/sh\nexit 0\n')
            shell.chmod(0o700)
            invoke(label + '-pack-consumer-ignore-shell', cli,
                   ['pack', '.', '--ignore-scripts', '--dry-run=false', '--script-shell', str(shell),
                    '--pack-destination', str(destination), '--loglevel=error'], folder, marker)
            package['scripts']['prepublishOnly'] = 'node -e "process.exit(23)"'
            manifest.write_text(json.dumps(package, indent=2) + '\n')
            invoke(label + '-folder-failing-prepublish', cli, ['publish', '--access', 'public'], folder, marker)
            invoke(label + '-existing-tarball-failing-folder-prepublish', cli,
                   ['publish', str(tarball), '--access', 'public'], folder, marker)
            (folder / 'artifact.json').write_text(json.dumps({'tarball': str(tarball),
                'initialSha256': initial_hash, 'finalSha256': sha256(tarball.read_bytes())}, indent=2) + '\n')
            for case in ['parts-absolute-ignore', 'failing-prepack', 'failing-prepare']:
                control = output / (label + '-' + case)
                control.mkdir()
                control_out = control / 'out'
                control_out.mkdir()
                control_scripts = {hook: scripts[hook] for hook in ['prepack', 'prepare']}
                if case.startswith('failing-'):
                    hook = case.removeprefix('failing-')
                    control_scripts[hook] = 'node -e ' + json.dumps(
                        "require('node:fs').appendFileSync(process.env.HOOK_MARKERS," + json.dumps(hook + '\n') + ');process.exit(24)'
                    )
                (control / 'package.json').write_text(json.dumps({
                    'name': 'pack-controls-fixture', 'version': '1.0.0',
                    'files': ['index.js'], 'scripts': control_scripts,
                }, indent=2) + '\n')
                (control / 'index.js').write_text('module.exports = 1707;\n')
                if case == 'parts-absolute-ignore':
                    arguments = ['pack', str(control), '--ignore-scripts', '--pack-destination', str(control_out), '--loglevel=error']
                    cwd = control_out
                else:
                    arguments = ['pack', '.', '--pack-destination', str(control_out), '--loglevel=error']
                    cwd = control
                invoke(label + '-' + case, cli, arguments, cwd, control / 'markers.txt')

    finally:
        server.shutdown()
        server.server_close()
        thread.join()
        save()
        (output / 'runtime.json').write_text(json.dumps({'versions': versions, 'registry': registry,
            'registryClosed': True, 'scope': args.only}, indent=2) + '\n')
    print(json.dumps({'out': str(output), 'commands': len(receipts), 'puts': len(puts), 'versions': versions}))


if __name__ == '__main__':
    main()
