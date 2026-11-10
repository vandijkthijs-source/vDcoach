#!/usr/bin/env python3
"""Reconnect server backup with the dedicated OAuth client, no secrets in argv."""
import json
import os
from pathlib import Path
import subprocess

BASE = Path(__file__).resolve().parent
ROOT = BASE / 'data'


def client_environment():
    result = subprocess.run(['systemd-creds', '--user', '--name=google-client', 'decrypt',
                             str(ROOT / 'google-client.cred'), '-'], capture_output=True, check=True)
    client = json.loads(result.stdout)
    environment = dict(os.environ)
    environment['RCLONE_DRIVE_CLIENT_ID'] = client['id']
    environment['RCLONE_DRIVE_CLIENT_SECRET'] = client['secret']
    return environment


if __name__ == '__main__':
    environment = client_environment()
    # The dedicated config is encrypted from its first write. Refresh tokens are
    # never printed: rclone's --no-output suppresses its configuration summary.
    password = subprocess.run(['/usr/bin/python3', str(BASE / 'rclone_password.py')], capture_output=True, check=True).stdout.decode().strip()
    environment['RCLONE_CONFIG_PASS'] = password
    subprocess.run([str(BASE / 'bin/rclone'), '--config', str(ROOT / 'drive-backup.conf'),
                    'config', 'create', 'backup', 'drive', 'scope', 'drive.file',
                    'config_is_local', 'true', 'config_auto_confirm', 'true',
                    'config_auth_no_browser', 'true', '--no-output'], env=environment, check=True)
