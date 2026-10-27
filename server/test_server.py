import importlib.util
import json
import os
import tempfile
import sys
sys.path.insert(0, os.path.dirname(__file__))
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer

class BackupTests(unittest.TestCase):
    def test_authentication_snapshot_and_restore(self):
        with tempfile.TemporaryDirectory() as root:
            os.environ['VDCOACH_DATA'] = root
            spec = importlib.util.spec_from_file_location('backup_server', os.path.join(os.path.dirname(__file__), 'server.py'))
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            server = ThreadingHTTPServer(('127.0.0.1', 0), mod.Handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = f'http://127.0.0.1:{server.server_port}/backup'
            try:
                with self.assertRaises(HTTPError) as err: urlopen(url)
                self.assertEqual(err.exception.code, 401)
                headers = {'Authorization': 'Bearer ' + mod.TOKEN, 'Content-Type': 'application/json'}
                body = {'version': 1, 'coachUrl': 'https://chatgpt.com/', 'days': {}}
                with urlopen(Request(url, data=json.dumps(body).encode(), headers=headers)) as r:
                    self.assertEqual(r.status, 201)
                with urlopen(Request(url, headers=headers)) as r:
                    self.assertEqual(json.load(r)['state'], body)
                plan_url = url.replace('/backup', '/plan?date=2026-10-27')
                with self.assertRaises(HTTPError) as missing:
                    urlopen(Request(plan_url, headers=headers))
                self.assertEqual(missing.exception.code, 404)
                from test_plans import plan
                from plan_store import publish
                expected = plan()
                publish(expected, mod.ROOT / 'plans')
                with urlopen(Request(plan_url, headers=headers)) as response:
                    self.assertEqual(json.load(response), expected)
                with self.assertRaises(HTTPError) as invalid:
                    urlopen(Request(url.replace('/backup', '/plan?date=../token'), headers=headers))
                self.assertEqual(invalid.exception.code, 400)
                with self.assertRaises(HTTPError) as err:
                    urlopen(Request(url, data=b'{}', headers=headers))
                self.assertEqual(err.exception.code, 400)
            finally:
                server.shutdown()
                server.server_close()
                thread.join()
                del os.environ['VDCOACH_DATA']

if __name__ == '__main__': unittest.main()
