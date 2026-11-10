"""Loopback dashboard with same-origin session checks; no token in browser URLs."""
import hmac
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
from pathlib import Path
import secrets
from urllib.parse import urlparse, parse_qs
import json


def make_dashboard(base, port=2286):
    session = secrets.token_urlsafe(32)
    allowed = {f'127.0.0.1:{port}', f'localhost:{port}'}
    assets = Path(__file__).parent / 'dashboard'

    class Dashboard(base):
        source = 'dashboard'

        def trusted(self):
            host = self.headers.get('Host', '')
            origin = self.headers.get('Origin')
            if host not in allowed or (origin is not None and origin != 'http://' + host) or self.headers.get('Sec-Fetch-Site') == 'cross-site':
                self.reply(403, {'error': 'Open the dashboard directly on this laptop'})
                return False
            return True

        def authorized(self):
            if not self.trusted():
                return False
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get('Cookie', ''))
                received = cookie['vdcoach_session'].value if 'vdcoach_session' in cookie else ''
            except Exception:
                received = ''
            if not hmac.compare_digest(received, session) or self.headers.get('X-vDcoach-UI') != '1':
                self.reply(401, {'error': 'Reopen the dashboard to connect'})
                return False
            return True

        def do_GET(self):
            if not self.trusted():
                return
            parsed = urlparse(self.path)
            if parsed.path in ('/document-original', '/recovery-key'):
                # Direct download is session-bound, without requiring a JS-only header.
                cookie = SimpleCookie()
                try:
                    cookie.load(self.headers.get('Cookie', ''))
                    valid = hmac.compare_digest(cookie['vdcoach_session'].value, session)
                except (KeyError, ValueError):
                    valid = False
                if not valid:
                    return self.reply(401, {'error': 'Reopen dashboard'})
                try:
                    if parsed.path == '/recovery-key':
                        data = (self.data_root / 'backup-recovery.key').read_bytes()
                        name = 'vdcoach-herstelwachtwoord.txt'
                    else:
                        path, meta = self.library.original(parse_qs(parsed.query).get('id', [''])[0])
                        data, name = path.read_bytes(), path.name
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/octet-stream')
                    self.send_header('Content-Disposition', 'attachment; filename="'+name+'"')
                    self.send_header('Content-Length', str(len(data)))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(data)
                    return
                except (ValueError, FileNotFoundError):
                    return self.reply(404, {'error': 'File not available'})
            pages = {'/': ('index.html', 'text/html'), '/dashboard.js': ('dashboard.js', 'text/javascript'), '/dashboard.css': ('dashboard.css', 'text/css'), '/icon.svg': ('icon.svg', 'image/svg+xml')}
            if self.path not in pages:
                return super().do_GET()
            name, content_type = pages[self.path]
            data = (assets / name).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type + '; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'")
            self.send_header('Referrer-Policy', 'no-referrer')
            if self.path == '/':
                self.send_header('Set-Cookie', f'vdcoach_session={session}; HttpOnly; SameSite=Strict; Path=/')
            self.end_headers()
            self.wfile.write(data)

    httpd = ThreadingHTTPServer(('127.0.0.1', port), Dashboard)
    allowed.update({f'127.0.0.1:{httpd.server_port}', f'localhost:{httpd.server_port}'})
    return httpd
