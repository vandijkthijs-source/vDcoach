#!/usr/bin/env python3
"""Private, authenticated vDcoach snapshots. No AI, Google or external services."""
import hmac
import json
import os
import secrets
import sqlite3
import time
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import re
from plan_store import validate
from progress_store import ProgressStore, Conflict
from tunnel_status import tunnel_status
from library_store import LibraryStore
from coaching_store import CoachingStore

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
STORE = ProgressStore(DB)
LIBRARY = LibraryStore(ROOT)
COACH = CoachingStore(STORE, LIBRARY)
LIBRARY.materialize_folders()
STARTED = time.time()
MAX_BYTES = 5 * 1024 * 1024

class Handler(BaseHTTPRequestHandler):
    library = LIBRARY
    data_root = ROOT
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
        if parsed.path == '/folders':
            return self.reply(200, LIBRARY.folders())
        if parsed.path == '/folder':
            try:
                return self.reply(200, LIBRARY.folder(parse_qs(parsed.query).get('path',[''])[0]))
            except FileNotFoundError as error:
                return self.reply(404, {'error':str(error)})
        if parsed.path == '/applications':
            return self.reply(200, COACH.applications())
        if parsed.path == '/coach-context':
            try:
                return self.reply(200, COACH.context(parse_qs(parsed.query).get('date',[''])[0]))
            except ValueError as error:
                return self.reply(400, {'error':str(error)})
        if parsed.path == '/library':
            return self.reply(200, {'documents': LIBRARY.list(parse_qs(parsed.query).get('q', [''])[0])})
        if parsed.path == '/document':
            try:
                return self.reply(200, LIBRARY.read(parse_qs(parsed.query).get('id', [''])[0]))
            except (ValueError, FileNotFoundError) as error:
                return self.reply(404, {'error': str(error)})
        if parsed.path == '/state':
            return self.reply(200, STORE.read())
        if parsed.path == '/status':
            current = STORE.read()
            connection = {}
            try:
                connection = json.loads((ROOT / 'chatgpt-connection.json').read_text())
            except (OSError, ValueError):
                pass
            tunnel = tunnel_status(ROOT)
            verified = bool(connection.get('verifiedAt') and connection.get('tunnelId') == tunnel.get('id'))
            backups = sorted((Path(__file__).parent / 'backups').glob('vdcoach-*.tar.gz'))
            return self.reply(200, {'status': 'ok', 'uptime': int(time.time()-STARTED),
                'revision': current['revision'], 'updatedAt': current['updatedAt'],
                'days': len(current['state']['days']), 'audit': STORE.audit(),
                'documents': len(LIBRARY.list()), 'driveBackup': self.cloud_status(),
                'backups': len(backups), 'lastBackup': backups[-1].stat().st_mtime if backups else None,
                'serverUrl': f"http://{os.environ.get('VDCOACH_HOST', '127.0.0.1')}:{os.environ.get('VDCOACH_PORT', '2285')}",
                'mcp': 'prepared', 'chatgpt': 'verified' if verified else 'not_verified', 'chatgptVerifiedAt': connection.get('verifiedAt') if verified else None, 'tunnel': tunnel,
                'plans': sorted(p.stem for p in (ROOT / 'plans').glob('????-??-??.json'))})
        if parsed.path == '/health':
            try:
                with sqlite3.connect(DB) as db:
                    db.execute('SELECT 1 FROM snapshots LIMIT 1').fetchone()
                return self.reply(200, {'status': 'ok', 'service': 'vdcoach', 'apiVersion': 1})
            except sqlite3.Error:
                return self.reply(503, {'status': 'unavailable'})
        if parsed.path == '/plan':
            date = parse_qs(parsed.query).get('date', [''])[0]
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date): return self.reply(400, {'error': 'Invalid date'})
            saved = STORE.read()['state']['days'].get(date, {}).get('plan')
            if saved:
                return self.reply(200, saved)
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
        if self.path in ('/coach-plan','/applications'):
            try:
                length = int(self.headers.get('Content-Length','0'))
                if not 0 < length <= MAX_BYTES:
                    return self.reply(413, {'error':'Request too large or empty'})
                self.connection.settimeout(15)
                args = json.loads(self.rfile.read(length))
                result = COACH.publish_plan(args) if self.path == '/coach-plan' else COACH.save_application(args)
                return self.reply(200, result)
            except Conflict as error:
                return self.reply(409, {'error':str(error)})
            except (ValueError, TypeError, KeyError, FileNotFoundError) as error:
                return self.reply(400, {'error':str(error)})
        if self.path == '/document':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BYTES:
                    return self.reply(413, {'error': 'Document too large or empty'})
                self.connection.settimeout(15)
                body = json.loads(self.rfile.read(length))
                return self.reply(200, LIBRARY.save(body['id'], body['text'], body['revision']))
            except (ValueError, KeyError, TypeError, FileNotFoundError) as error:
                return self.reply(409, {'error': str(error)})
        if self.path in ('/state', '/progress'):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= MAX_BYTES:
                    return self.reply(413, {'error': 'Request too large or empty'})
                self.connection.settimeout(15)
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError('Expected a JSON object')
                source = getattr(self, 'source', 'mcp' if self.headers.get('X-vDcoach-Source') == 'mcp' else 'phone')
                result = STORE.save(payload.get('state'), payload.get('revision'), source) if self.path == '/state' else STORE.change(payload, source)
                return self.reply(200, result)
            except Conflict as error:
                return self.reply(409, {'error': str(error)})
            except (ValueError, TypeError, KeyError, AttributeError) as error:
                return self.reply(400, {'error': str(error)})
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

    def cloud_status(self):
        try:
            return json.loads((ROOT / 'cloud-backup-status.json').read_text())
        except (OSError, ValueError):
            return {'state': 'needs_connection', 'message': 'Google Drive nog koppelen'}

if __name__ == '__main__':
    host = os.environ.get('VDCOACH_HOST', '127.0.0.1')
    port = int(os.environ.get('VDCOACH_PORT', '2285'))
    print(f'vDcoach backup service: {host}:{port}. Token stored at {TOKEN_FILE}.', flush=True)
    from dashboard import make_dashboard
    dashboard = make_dashboard(Handler)
    threading.Thread(target=dashboard.serve_forever, daemon=True).start()
    ThreadingHTTPServer((host, port), Handler).serve_forever()
