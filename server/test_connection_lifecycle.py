import sqlite3
import tempfile
import unittest
from pathlib import Path
from progress_store import ProgressStore

class ConnectionLifecycleTests(unittest.TestCase):
    def test_context_closes_retained_connections(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(Path(tmp) / 'state.sqlite3')
            connections = []
            for _ in range(100):
                with store.connect() as db:
                    connections.append(db)
                    db.execute('SELECT 1')
            for db in connections:
                with self.assertRaises(sqlite3.ProgrammingError):
                    db.execute('SELECT 1')

    def test_exception_rolls_back_and_closes(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = ProgressStore(Path(tmp) / 'state.sqlite3')
            with self.assertRaises(RuntimeError):
                with store.connect() as db:
                    db.execute("INSERT INTO audit(created,source,action,revision) VALUES(0,'test','test',0)")
                    raise RuntimeError('rollback')
            with self.assertRaises(sqlite3.ProgrammingError):
                db.execute('SELECT 1')
            with store.connect() as check:
                self.assertEqual(check.execute('SELECT COUNT(*) FROM audit').fetchone()[0], 0)
