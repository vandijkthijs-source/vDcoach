#!/usr/bin/env python3
"""Run the private tunnel using a systemd-decrypted, memory-backed credential."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    credentials = Path(os.environ['CREDENTIALS_DIRECTORY'])
    os.environ['CONTROL_PLANE_API_KEY'] = (credentials / 'control-plane-api-key').read_text().strip()
    client = str(ROOT / 'bin' / 'tunnel-client')
    os.execv(client, [client, 'run', '--profile', 'vdcoach', '--profile-dir', str(ROOT / 'data' / 'tunnel')])


if __name__ == '__main__':
    main()
