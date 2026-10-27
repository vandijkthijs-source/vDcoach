#!/usr/bin/env python3
"""Private, authenticated vDcoach snapshots. No AI, Google or external services."""
import hmac
import json
import os
import secrets
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import re
from plan_store import validate

ROOT = Path(os.environ.get('VDCOACH_DATA', Path(__file__).parent / 'data'))
ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
TOKEN_FILE = ROOT / 'token'
if not TOKEN_FILE.exists():
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(secrets.token_urlsafe(32))
TOKEN = TOKEN_FILE.read_text().strip()
if len(TOKEN) < 32:
    raise RuntimeError('Backup token must contain at least 32 characters')
DB = ROOT / 'backups.sqlite3'
with sqlite3.connect(DB) as db:
    db.execute('CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, created REAL NOT NULL, body TEXT NOT NULL)')
os.chmod(DB, 0o600)
MAX_BYTES = 5 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log private content or credentials.

    def reply(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + TOKEN):
            self.reply(401, {'error': 'Invalid backup token'})
            return False
        return True

    def do_GET(self):
        if not self.authorized(): return
        parsed = urlparse(self.path)
        if parsed.path == '/plan':
            date = parse_qs(parsed.query).get('date', [''])[0]
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date): return self.reply(400, {'error': 'Invalid date'})
            path = ROOT / 'plans' / (date + '.json')
            if not path.is_file(): return self.reply(404, {'error': 'Morning plan not ready'})
            try:
                plan = validate(json.loads(path.read_text()))
                if plan['date'] != date: raise ValueError('Date mismatch')
                return self.reply(200, plan)
            except (ValueError, TypeError, KeyError, AttributeError):
                return self.reply(503, {'error': 'Morning plan unavailable'})
        if self.path != '/backup':
            return self.reply(404, {'error': 'Not found'})
        with sqlite3.connect(DB) as db:
            row = db.execute('SELECT created, body FROM snapshots ORDER BY id DESC LIMIT 1').fetchone()
        if not row: return self.reply(404, {'error': 'No laptop backup yet'})
        self.reply(200, {'savedAt': row[0], 'state': json.loads(row[1])})

    def do_POST(self):
        if not self.authorized(): return
        if self.path != '/backup': return self.reply(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BYTES: return self.reply(413, {'error': 'Backup too large or empty'})
            self.connection.settimeout(15)
            body = self.rfile.read(length)
            state = json.loads(body)
            if state.get('version') != 1 or not isinstance(state.get('days'), dict) or not isinstance(state.get('coachUrl'), str):
                return self.reply(400, {'error': 'Invalid vDcoach backup'})
            now = time.time()
            with sqlite3.connect(DB) as db:
                db.execute('INSERT INTO snapshots(created, body) VALUES (?, ?)', (now, json.dumps(state)))
                db.execute('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 30)')
            self.reply(201, {'savedAt': now})
        except (ValueError, TypeError, AttributeError):
            self.reply(400, {'error': 'Invalid JSON backup'})

if __name__ == '__main__':
    host = os.environ.get('VDCOACH_HOST', '127.0.0.1')
    port = int(os.environ.get('VDCOACH_PORT', '2285'))
    print(f'vDcoach backup service: {host}:{port}. Token stored at {TOKEN_FILE}.', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
