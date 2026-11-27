#!/usr/bin/env python3
"""Standalone static hosting for SNP Studio. Standard library only; no model training."""
import argparse
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'dist'
RUNTIME = ROOT / '.runtime'
STATE = RUNTIME / 'server.json'
INSTANCE = hashlib.sha256(str(ROOT).encode()).hexdigest()[:16]


def health(port):
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open('http://127.0.0.1:%s/_snp/health' % port, timeout=0.6) as response:
            data = json.loads(response.read(4096).decode('utf-8'))
            return data if data.get('app') == 'snp-studio-linux' and data.get('instance') == INSTANCE else None
    except Exception:
        return None


def previous():
    try:
        return json.loads(STATE.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map,
                          **{'.js': 'application/javascript; charset=utf-8',
                             '.css': 'text/css; charset=utf-8',
                             '.html': 'text/html; charset=utf-8',
                             '.svg': 'image/svg+xml', '.json': 'application/json'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        if self.path.split('?', 1)[0] == '/_snp/health':
            body = json.dumps({'app': 'snp-studio-linux', 'instance': INSTANCE,
                               'pid': os.getpid(), 'port': self.server.server_port}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing is disabled')
        return None


def serve(host, port):
    factory = functools.partial(Handler, directory=str(WEB))
    with http.server.ThreadingHTTPServer((host, port), factory) as server:
        RUNTIME.mkdir(exist_ok=True)
        STATE.write_text(json.dumps({'port': server.server_port, 'pid': os.getpid(),
                                     'instance': INSTANCE, 'host': host}), encoding='utf-8')
        server.serve_forever()


def start(host, port):
    if not (WEB / 'index.html').is_file():
        raise RuntimeError('Missing dist/index.html; upload the complete release folder.')
    RUNTIME.mkdir(exist_ok=True)
    old_port = previous().get('port')
    ports = list(dict.fromkeys(([old_port] if isinstance(old_port, int) else []) + list(range(port, port + 20))))
    for candidate in ports:
        existing = health(candidate)
        if existing:
            print(json.dumps(existing))
            return
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', candidate)) == 0:
                continue
        with (RUNTIME / 'server.log').open('ab') as log:
            kwargs = {'start_new_session': True} if os.name != 'nt' else {'creationflags': subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
            process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--serve', '--host', host, '--port', str(candidate)],
                                       cwd=str(ROOT), stdin=subprocess.DEVNULL, stdout=log, stderr=log, **kwargs)
        for _ in range(50):
            time.sleep(0.1)
            ready = health(candidate)
            if ready:
                print(json.dumps(ready))
                print('Ready: http://SERVER_ADDRESS:%s/ (or your existing reverse proxy)' % ready['port'])
                return
            if process.poll() is not None:
                break
    raise RuntimeError('No free service port; inspect .runtime/server.log.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serve', action='store_true', help='run the HTTP process in the foreground')
    parser.add_argument('--status', action='store_true', help='check this release only')
    parser.add_argument('--host', default=os.environ.get('SNP_HOST', '0.0.0.0'))
    parser.add_argument('--port', type=int, default=int(os.environ.get('SNP_PORT', '8080')))
    options = parser.parse_args()
    try:
        if not 1 <= options.port <= 65515:
            raise ValueError('Port must be in 1..65515.')
        if options.status:
            info = health(previous().get('port', options.port))
            print(json.dumps(info) if info else 'This release is not running.')
            sys.exit(0 if info else 1)
        elif options.serve:
            serve(options.host, options.port)
        else:
            start(options.host, options.port)
    except Exception as error:
        print('Startup failed: %s' % error, file=sys.stderr)
        sys.exit(1)
