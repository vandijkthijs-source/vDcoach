#!/usr/bin/env python3
"""Restore to a NEW destination only; never overwrite a running server."""
import argparse
import getpass
from pathlib import Path
import tempfile
from cloud_backup import crypt, verify_archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    if args.destination.exists():
        parser.error('Destination must not exist; restore separately and inspect before switching')
    password = getpass.getpass('Herstelwachtwoord: ').encode()+b'\n'
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / 'recovery.tar.gz'
        crypt(args.archive, archive, password, decrypt=True)
        count = verify_archive(archive, args.destination)
    print(f'Restored database and {count} documents to {args.destination}. Live data was not changed.')
