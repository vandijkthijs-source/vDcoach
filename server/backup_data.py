#!/usr/bin/env python3
"""Create a private, consistent recovery archive of progress and dossiers."""
import datetime as dt
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile


def backup(root, destination):
    root, destination = Path(root), Path(destination)
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(destination, 0o700)
    with tempfile.TemporaryDirectory(dir=destination) as temporary:
        temporary = Path(temporary)
        with closing(sqlite3.connect(root / 'backups.sqlite3')) as source:
            with closing(sqlite3.connect(temporary / 'backups.sqlite3')) as target:
                source.backup(target)
        archive = temporary / 'recovery.tar.gz'
        with tarfile.open(archive, 'w:gz') as output:
            output.add(temporary / 'backups.sqlite3', arcname='backups.sqlite3')
            output.add(root / 'token', arcname='token')
            plans = root / 'plans'
            if plans.is_dir():
                output.add(plans, arcname='plans')
            library = root / 'library'
            if library.is_dir():
                output.add(library, arcname='library')
            if (root / 'dossiers').is_dir():
                output.add(root / 'dossiers', arcname='dossiers')
            for name in ('migration.json', 'server-policy.json', 'drive-backup-folder.json'):
                if (root / name).is_file():
                    output.add(root / name, arcname=name)
            # The current server changes may not yet exist on GitHub. Include
            # application source so a replacement laptop can run this data.
            project = Path(__file__).resolve().parent.parent
            extensions = {'.py', '.mjs', '.js', '.cjs', '.ts', '.tsx', '.json', '.md',
                          '.service', '.timer', '.desktop', '.html', '.css', '.svg'}
            excluded = {'data', 'backups', 'node_modules', 'bin', '__pycache__', '.git', 'fix-backups', 'dashboard-backups'}
            for folder in ('server', 'app', 'lib', 'components', 'constants', 'automation', 'scripts', 'tests'):
                for path in (project / folder).rglob('*'):
                    relative = path.relative_to(project)
                    if path.is_file() and not excluded.intersection(relative.parts) and path.suffix in extensions:
                        output.add(path, arcname='application/' + str(relative))
            for name in ('package.json', 'package-lock.json', 'app.json', 'tsconfig.json', 'README.md'):
                if (project / name).is_file():
                    output.add(project / name, arcname='application/' + name)
        os.chmod(archive, 0o600)
        stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        result = destination / f'vdcoach-{stamp}.tar.gz'
        os.replace(archive, result)
    for old in sorted(destination.glob('vdcoach-*.tar.gz'), reverse=True)[14:]:
        old.unlink()
    return result


if __name__ == '__main__':
    base = Path(__file__).resolve().parent
    print(backup(base / 'data', base / 'backups'))
