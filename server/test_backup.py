import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest
from backup_data import backup


class RecoveryTests(unittest.TestCase):
    def test_archive_restores_database_plans_token_and_rotates(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'data'
            root.mkdir()
            (root / 'token').write_text('test-token')
            (root / 'plans').mkdir()
            (root / 'plans' / '2026-11-10.json').write_text(json.dumps({'test': True}))
            (root / 'library' / 'document' / 'versions').mkdir(parents=True)
            (root / 'library' / 'document' / 'original.pdf').write_bytes(b'original document')
            (root / 'library' / 'document' / 'versions' / 'old.txt').write_text('previous text')
            (root / 'backup-recovery.key').write_text('must-not-be-in-archive')
            with sqlite3.connect(root / 'backups.sqlite3') as db:
                db.execute('CREATE TABLE snapshots (body TEXT)')
                db.execute('INSERT INTO snapshots VALUES (?)', ('saved progress',))
            destination = Path(temporary) / 'backups'
            for _ in range(15):
                archive = backup(root, destination)
            self.assertEqual(len(list(destination.glob('*.tar.gz'))), 14)
            self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
            restored = Path(temporary) / 'restored'
            with tarfile.open(archive) as source:
                source.extractall(restored, filter='data')
            self.assertEqual((restored / 'token').read_text(), 'test-token')
            self.assertEqual((restored / 'library' / 'document' / 'original.pdf').read_bytes(), b'original document')
            self.assertEqual((restored / 'library' / 'document' / 'versions' / 'old.txt').read_text(), 'previous text')
            self.assertFalse((restored / 'backup-recovery.key').exists())
            self.assertTrue((restored / 'application' / 'server' / 'restore_backup.py').is_file())
            self.assertFalse((restored / 'application' / 'server' / 'data').exists())
            self.assertTrue(json.loads((restored / 'plans' / '2026-11-10.json').read_text())['test'])
            with sqlite3.connect(restored / 'backups.sqlite3') as db:
                self.assertEqual(db.execute('SELECT body FROM snapshots').fetchone()[0], 'saved progress')
