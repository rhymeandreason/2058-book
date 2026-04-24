#!/usr/bin/env python3
"""
Local dev server for 2058 journal.
Serves static files + accepts POST /api/save to write content from the loader.

Usage: python3 server.py [port]   (default port: 8080)
"""

import base64
import io
import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

ROOT     = Path(__file__).parent.resolve()
PORT     = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
MAX_SIZE = 1800  # longest side in pixels


def resize_image(raw: bytes, suffix: str) -> bytes:
    """Resize image so its longest side is at most MAX_SIZE. Returns bytes."""
    img = Image.open(io.BytesIO(raw))
    img = img.convert('RGB') if suffix in ('.jpg', '.jpeg') else img
    img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)
    out = io.BytesIO()
    fmt = 'JPEG' if suffix in ('.jpg', '.jpeg') else 'PNG'
    kw  = {'quality': 85, 'optimize': True} if fmt == 'JPEG' else {'optimize': True}
    img.save(out, format=fmt, **kw)
    return out.getvalue()


class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/api/save':
            self.send_error(404)
            return

        length = int(self.headers.get('Content-Length', 0))
        body   = self.rfile.read(length)

        try:
            payload = json.loads(body)
            rel_path = payload['path']           # e.g. "content/days/02-28.json"
            dest = (ROOT / rel_path).resolve()

            # Prevent path traversal
            dest.relative_to(ROOT)
            dest.parent.mkdir(parents=True, exist_ok=True)

            if 'text' in payload:
                dest.write_text(payload['text'], encoding='utf-8')
            elif 'data' in payload:
                raw = base64.b64decode(payload['data'])
                if HAS_PILLOW and dest.suffix.lower() in ('.jpg', '.jpeg', '.png'):
                    raw = resize_image(raw, dest.suffix.lower())
                dest.write_bytes(raw)
            else:
                self.send_error(400, 'Need "text" or "data" field')
                return

        except (KeyError, ValueError) as e:
            self.send_error(400, str(e))
            return
        except Exception as e:
            self.send_error(500, str(e))
            return

        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, fmt, *args):
        # Suppress noisy GET logs; show POST and errors only
        if args and (str(args[1]) != '200' or self.command == 'POST'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(ROOT)
    print(f'  2058 journal  →  http://localhost:{PORT}')
    print(f'  Loader tool   →  http://localhost:{PORT}/loader.html')
    if HAS_PILLOW:
        print(f'  Images        →  resized to {MAX_SIZE}px max, JPEG q85')
    else:
        print('  Images        →  saved as-is (pip install Pillow to enable resizing)')
    print('  Ctrl-C to stop\n')
    HTTPServer(('', PORT), Handler).serve_forever()
