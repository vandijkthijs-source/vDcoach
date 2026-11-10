#!/usr/bin/env python3
"""Encrypted, append-only Drive backups; verify uploaded bytes before success."""
import datetime as dt
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import tarfile
import tempfile
from backup_data import backup
from connect_drive import client_environment

BASE = Path(__file__).resolve().parent
ROOT = BASE / 'data'
CONFIG = ROOT / 'drive-backup.conf'
KEY = ROOT / 'backup-recovery.key'
STATUS = ROOT / 'cloud-backup-status.json'
RCLONE = BASE / 'bin' / 'rclone'


def status(**value):
    old = {}
    if STATUS.exists():
        old = json.loads(STATUS.read_text())
    path = STATUS.with_suffix('.tmp')
    path.write_text(json.dumps({**old, **value}, indent=2))
    os.chmod(path, 0o600)
    os.replace(path, STATUS)


def recovery_key():
    if not KEY.exists():
        fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(secrets.token_urlsafe(48)+'\n')
    return KEY.read_bytes()


def crypt(source, destination, key, decrypt=False):
    home = ROOT / 'gpg'
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    command = ['gpg', '--homedir', str(home), '--no-options', '--no-symkey-cache', '--batch', '--yes', '--pinentry-mode', 'loopback', '--passphrase-fd', '0',
               '--output', str(destination)]
    command += ['--decrypt'] if decrypt else ['--symmetric', '--cipher-algo', 'AES256']
    subprocess.run(command+[str(source)], input=key, stdout=subprocess.DEVNULL,
                   stderr=subprocess.PIPE, check=True)


def verify_archive(archive, directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700)
    with tarfile.open(archive) as source:
        source.extractall(directory, filter='data')
    with closing(sqlite3.connect(directory / 'backups.sqlite3')) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Restored database failed integrity check')
    count = 0
    for metadata in (directory / 'library').glob('*/metadata.json'):
        item = json.loads(metadata.read_text())
        original = metadata.parent / item['localFile']
        if not original.is_file() or not (metadata.parent / 'content.txt').is_file():
            raise ValueError('Restored document is incomplete')
        if item.get('sha256') and hashlib.sha256(original.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Restored document checksum mismatch')
        count += 1
    return count


def run():
    key = recovery_key()
    archive = backup(ROOT, BASE / 'backups')
    if not CONFIG.exists():
        status(state='needs_connection', message='Google Drive nog koppelen')
        return False
    with tempfile.TemporaryDirectory(dir=BASE / 'backups') as temporary:
        temporary = Path(temporary)
        encrypted = temporary / (archive.name+'.gpg')
        crypt(archive, encrypted, key)
        folder_file = ROOT / 'drive-backup-folder.json'
        folder = json.loads(folder_file.read_text()) if folder_file.exists() else None
        period = dt.datetime.now(dt.timezone.utc).strftime('%Y/%m')
        remote = ('backup:Herstelpunten/'+period+'/' if folder else 'backup:vDcoach Server Backups/')+encrypted.name
        args = [str(RCLONE), '--config', str(CONFIG), '--password-command',
                '/usr/bin/python3 '+str(BASE / 'rclone_password.py'),
                '--retries', '3', '--low-level-retries', '3']
        if folder:
            args += ['--drive-root-folder-id', folder['id']]
        environment = client_environment()
        subprocess.run(args+['copyto', str(encrypted), remote, '--immutable'], env=environment, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        downloaded = temporary / 'downloaded.gpg'
        subprocess.run(args+['copyto', remote, str(downloaded)], env=environment, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if hashlib.sha256(encrypted.read_bytes()).digest() != hashlib.sha256(downloaded.read_bytes()).digest():
            raise ValueError('Drive backup verification failed')
        restored = temporary / 'restored.tar.gz'
        crypt(downloaded, restored, key, decrypt=True)
        documents = verify_archive(restored, temporary / 'restore-test')
        status(state='verified', message='Drive-back-up teruggelezen en herstel getest',
               lastSuccess=dt.datetime.now(dt.timezone.utc).isoformat(), file=encrypted.name,
               sha256=hashlib.sha256(encrypted.read_bytes()).hexdigest(), documents=documents)
    return True


if __name__ == '__main__':
    try:
        run()
    except Exception:
        status(state='failed', message='Drive-back-up mislukt; lokale back-up behouden')
        raise SystemExit('Drive backup failed; inspect connection. Private details suppressed.')
