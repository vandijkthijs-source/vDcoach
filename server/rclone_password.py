#!/usr/bin/env python3
"""Password-command for rclone. Only stdout goes into rclone's private pipe."""
from pathlib import Path
import subprocess
import sys

credential = Path(__file__).parent / 'data' / 'drive-password.cred'
result = subprocess.run(['systemd-creds', '--user', '--name=drive-password', 'decrypt', str(credential), '-'],
                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
sys.stdout.buffer.write(result.stdout)
