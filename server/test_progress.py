import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.error import HTTPError
from http.cookiejar import CookieJar
from progress_store import ProgressStore, Conflict
from dashboard import make_dashboard


def state():
    return {'version': 1, 'coachUrl': 'https://chatgpt.com/', 'days': {'2026-11-10': {
        'date': '2026-11-10', 'tasks': [{'id': 'task-1', 'title': 'Walk', 'done': False, 'priority': False, 'category': 'Task', 'minutes': 10, 'rollovers': 0}], 'notes': 'Keep this note', 'closed': False, 'startId': None}}}


class ProgressTests(unittest.TestCase):
    def test_conflict_retry_audit_and_closed_day(self):
        with tempfile.TemporaryDirectory() as root:
            store = ProgressStore(Path(root) / 'progress.sqlite3')
            original = state()
            self.assertEqual(store.save(original, 0)['revision'], 1)
            with self.assertRaises(Conflict):
                store.save({'version': 1, 'coachUrl': '', 'days': {}}, 0)
            args = {'date': '2026-11-10', 'revision': 1, 'id': 'entry-1', 'action': 'add_diary', 'text': 'Walked', 'done': True, 'startTime': '09:00', 'endTime': '09:30'}
            result = store.change(args)
            self.assertEqual(result['revision'], 2)
            self.assertEqual(result['state']['days']['2026-11-10']['diaryEntries'][0]['text'], 'Keep this note')
            args['revision'] = 2
            self.assertEqual(store.change(args)['revision'], 2)
            with self.assertRaises(Conflict):
                store.change({**args, 'revision': 1})
            result['state']['days']['2026-11-10']['closed'] = True
            store.save(result['state'], 2)
            with self.assertRaises(ValueError):
                store.change({**args, 'revision': 3})
            self.assertEqual(len(store.audit()), 3)

    def test_concurrent_writers_cannot_overwrite_each_other(self):
        with tempfile.TemporaryDirectory() as root:
            store = ProgressStore(Path(root) / 'progress.sqlite3')
            store.save(state(), 0)
            outcomes = []
            def write(i):
                value = state()
                value['days']['2026-11-10']['notes'] = str(i)
                try:
                    store.save(value, 1)
                    outcomes.append('saved')
                except Conflict:
                    outcomes.append('conflict')
            threads = [threading.Thread(target=write, args=(i,)) for i in range(2)]
            for thread in threads: thread.start()
            for thread in threads: thread.join()
            self.assertCountEqual(outcomes, ['saved', 'conflict'])

    def test_invalid_input_does_not_change_database(self):
        with tempfile.TemporaryDirectory() as root:
            store = ProgressStore(Path(root) / 'progress.sqlite3')
            store.save(state(), 0)
            for value in [[], {'version': 1, 'coachUrl': '', 'days': {'2026-02-30': {}}}]:
                with self.assertRaises(ValueError): store.save(value, 1)
            with self.assertRaises(ValueError):
                store.change({'date': '2026-11-10', 'revision': 1, 'action': 'add_diary', 'id': 'bad', 'text': 'Activity', 'startTime': '10:00', 'endTime': '09:00'})
            self.assertEqual(store.read()['revision'], 1)

    def test_dashboard_session_origin_and_live_progress(self):
        with tempfile.TemporaryDirectory() as root:
            os.environ['VDCOACH_DATA'] = root
            spec = importlib.util.spec_from_file_location('dashboard_test_server', Path(__file__).with_name('server.py'))
            mod = importlib.util.module_from_spec(spec)
            try:
                spec.loader.exec_module(mod)
                server = make_dashboard(mod.Handler, 0)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                base = f'http://127.0.0.1:{server.server_port}'
                opener = build_opener(HTTPCookieProcessor(CookieJar()))
                with self.assertRaises(HTTPError) as denied:
                    opener.open(Request(base+'/state', headers={'X-vDcoach-UI': '1'}))
                self.assertEqual(denied.exception.code, 401)
                denied.exception.close()
                with opener.open(base+'/') as response:
                    self.assertIn(b'Jouw coachomgeving', response.read())
                headers = {'X-vDcoach-UI': '1', 'Content-Type': 'application/json'}
                with self.assertRaises(HTTPError) as forbidden:
                    opener.open(Request(base+'/state', headers={**headers, 'Origin': 'https://evil.example'}))
                self.assertEqual(forbidden.exception.code, 403)
                forbidden.exception.close()
                with opener.open(Request(base+'/state', data=json.dumps({'revision': 0, 'state': state()}).encode(), headers=headers)) as response:
                    self.assertEqual(json.load(response)['revision'], 1)
                with opener.open(Request(base+'/state', data=json.dumps({'revision': 0, 'state': state()}).encode(), headers=headers)):
                    self.fail('Stale writes must fail')
            except HTTPError as error:
                self.assertEqual(error.code, 409)
                error.close()
            finally:
                if 'server' in locals():
                    server.shutdown(); server.server_close(); thread.join()
                del os.environ['VDCOACH_DATA']
