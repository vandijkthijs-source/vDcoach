"""Private server-owned dossier, with original imports and versioned edits."""
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time

LOCK = threading.RLock()


class LibraryStore:
    def __init__(self, root):
        self.data_root = Path(root)
        self.root = Path(root) / 'library'
        self.root.mkdir(exist_ok=True, mode=0o700)

    def folders(self):
        paths = {''}
        inventory = self.data_root / 'migration.json'
        if inventory.is_file():
            for entry in json.loads(inventory.read_text()).get('inventory', []):
                if entry.get('file_or_folder') == 'folder':
                    paths.add('/'.join(filter(None, [entry.get('folder',''), entry['title']])))
        for item in self.list():
            folder = item.get('folder', '')
            while folder:
                paths.add(folder)
                folder = folder.rpartition('/')[0]
        return {'name':'Thijs Richting & werk', 'folders':sorted(paths)}

    def folder(self, path=''):
        if path not in self.folders()['folders']:
            raise FileNotFoundError('Folder not found')
        prefix = path+'/' if path else ''
        return {'root':'Thijs Richting & werk', 'path':path,
                'folders':[v for v in self.folders()['folders'] if v != path and v.startswith(prefix) and '/' not in v[len(prefix):]],
                'documents':[v for v in self.list() if v.get('folder','') == path]}

    def materialize_folders(self):
        """A readable Drive-shaped view; links retain one canonical content copy."""
        view = self.data_root / 'dossiers' / 'Thijs Richting & werk'
        def safe(value):
            return value.replace('/', '_').replace('\\', '_') if value not in ('','.','..') else '_'
        def directory(folder):
            target = view.joinpath(*(safe(v) for v in folder.split('/') if v))
            target.mkdir(parents=True, exist_ok=True, mode=0o700)
            return target
        for folder in self.folders()['folders']:
            directory(folder)
        for doc in self.list():
            target = directory(doc.get('folder',''))
            original, _ = self.original(doc['id'])
            for source, suffix in ((original, original.suffix), (self.directory(doc['id'])/'content.txt', '.txt')):
                link = target / (safe(doc['title'])+suffix)
                if link.is_symlink():
                    if link.resolve() == source.resolve():
                        continue
                    link = target / (safe(doc['title'])+' ['+doc['id']+']'+suffix)
                if not link.exists() and not link.is_symlink():
                    link.symlink_to(os.path.relpath(source, target))
        return view

    def directory(self, identifier):
        if not isinstance(identifier, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', identifier):
            raise ValueError('Invalid document ID')
        path = self.root / identifier
        if not (path / 'metadata.json').is_file():
            raise FileNotFoundError('Document not found')
        return path

    def list(self, query=''):
        items = []
        for path in self.root.glob('*/metadata.json'):
            meta = json.loads(path.read_text())
            text = (path.parent / 'content.txt').read_text() if (path.parent / 'content.txt').exists() else ''
            if query and query.casefold() not in (meta['title']+' '+meta.get('folder','')+' '+text).casefold():
                continue
            items.append({**meta, 'revision': hashlib.sha256(text.encode()).hexdigest(), 'characters': len(text)})
        return sorted(items, key=lambda item: (item.get('folder',''), item['title']))

    def read(self, identifier):
        path = self.directory(identifier)
        with LOCK:
            meta = json.loads((path / 'metadata.json').read_text())
            text = (path / 'content.txt').read_text()
            return {**meta, 'text': text, 'revision': hashlib.sha256(text.encode()).hexdigest()}

    def save(self, identifier, text, revision):
        if not isinstance(text, str) or len(text.encode()) > 2 * 1024 * 1024:
            raise ValueError('Document text is too large')
        path = self.directory(identifier)
        with LOCK:
            current = self.read(identifier)
            if current['revision'] != revision:
                raise ValueError('Document changed; reopen before saving')
            if current['text'] == text:
                return current
            history = path / 'versions'
            history.mkdir(exist_ok=True, mode=0o700)
            (history / (current['revision'] + '.txt')).write_text(current['text'])
            temporary = path / 'content.tmp'
            temporary.write_text(text)
            os.chmod(temporary, 0o600)
            os.replace(temporary, path / 'content.txt')
            metadata = json.loads((path / 'metadata.json').read_text())
            metadata.update(updatedAt=time.time(), canonical='server')
            temporary = path / 'metadata.tmp'
            temporary.write_text(json.dumps(metadata, ensure_ascii=False, indent=2))
            os.replace(temporary, path / 'metadata.json')
            return self.read(identifier)

    def original(self, identifier):
        path = self.directory(identifier)
        meta = json.loads((path / 'metadata.json').read_text())
        name = meta['localFile']
        if Path(name).name != name:
            raise ValueError('Invalid stored filename')
        return path / name, meta
