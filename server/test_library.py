import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from library_store import LibraryStore


class LibraryTests(unittest.TestCase):
    def test_version_conflict_search_original_and_traversal(self):
        with tempfile.TemporaryDirectory() as temp:
            store = LibraryStore(temp)
            path = Path(temp) / 'library' / 'doc1'
            path.mkdir()
            (path / 'metadata.json').write_text(json.dumps({'id':'doc1','title':'Profiel','folder':'Werk','localFile':'original.docx'}))
            (path / 'original.docx').write_bytes(b'original')
            (path / 'content.txt').write_text('oude tekst')
            before = store.read('doc1')
            self.assertEqual(len(store.list('OUDE')), 1)
            after = store.save('doc1', 'nieuwe tekst', before['revision'])
            self.assertNotEqual(before['revision'], after['revision'])
            self.assertEqual((path / 'versions' / (before['revision']+'.txt')).read_text(), 'oude tekst')
            with self.assertRaises(ValueError):
                store.save('doc1', 'overwrite', before['revision'])
            with self.assertRaises(ValueError):
                store.read('../token')
            self.assertEqual(store.original('doc1')[0].read_bytes(), b'original')
            self.assertEqual(store.read('doc1')['text'], 'nieuwe tekst')
            self.assertIn('Werk',store.folders()['folders'])
            self.assertEqual(store.folder('Werk')['documents'][0]['id'],'doc1')
            with self.assertRaises(FileNotFoundError):store.folder('../outside')
            view=store.materialize_folders()
            self.assertEqual((view/'Werk'/'Profiel.txt').read_text(),'nieuwe tekst')
            self.assertEqual((view/'Werk'/'Profiel.docx').read_bytes(),b'original')
            store.materialize_folders()  # Idempotent; no duplicate links.
            self.assertEqual(len(list((view/'Werk').iterdir())),2)
