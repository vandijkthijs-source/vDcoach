#!/usr/bin/env python3
"""User-operated, non-echoed key entry. Never put credentials in argv or logs."""
import getpass
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError, HTTPError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'server/bin/tunnel-client'
PROFILE = ROOT / 'server/data/tunnel'
CREDENTIAL = ROOT / 'server/data/tunnel-key.cred'


def main():
    if not sys.stdin.isatty():
        raise RuntimeError('Open this from the vDcoach Connect ChatGPT desktop shortcut so key entry stays hidden.')
    print('Connect vDcoach to your private ChatGPT tunnel\n')
    print('Create a runtime API key in the same OpenAI Platform organization as your tunnel.')
    print('The key principal needs Tunnels Read + Use permission.')
    print('https://platform.openai.com/settings/organization/api-keys\n')
    print('Your key will not be shown. It is encrypted for this Linux user and laptop.')
    key = getpass.getpass('Paste runtime API key (hidden): ').strip()
    if not key or any(char.isspace() for char in key):
        raise ValueError('No valid key entered. Nothing was changed.')
    environment = {**os.environ, 'CONTROL_PLANE_API_KEY': key}
    print('\nChecking access and the local MCP adapter…')
    check = subprocess.run([str(CLIENT), 'doctor', '--profile', 'vdcoach', '--profile-dir', str(PROFILE), '--explain'], env=environment, capture_output=True, text=True, timeout=120)
    print((check.stdout + check.stderr).replace(key, '[redacted]'))
    if check.returncode:
        raise ValueError('Connection check failed. The new key was not saved; review the check above.')
    temporary = CREDENTIAL.with_suffix('.pending')
    try:
        result = subprocess.run(['systemd-creds', 'encrypt', '--user', '--name=control-plane-api-key', '-', str(temporary)], input=key.encode(), capture_output=True)
        if result.returncode:
            raise RuntimeError('Could not encrypt the key: ' + result.stderr.decode().replace(key, '[redacted]'))
        temporary.chmod(0o600)
        os.replace(temporary, CREDENTIAL)
    finally:
        temporary.unlink(missing_ok=True)
    environment.pop('CONTROL_PLANE_API_KEY', None)
    key = None
    subprocess.run(['systemctl', '--user', 'enable', 'vdcoach-tunnel.service'], check=True)
    subprocess.run(['systemctl', '--user', 'restart', 'vdcoach-tunnel.service'], check=True)
    opener = build_opener(ProxyHandler({}))
    for _ in range(30):
        try:
            with opener.open('http://127.0.0.1:2287/readyz', timeout=2) as response:
                if response.status == 200:
                    print('\nTunnel reports ready. Open http://127.0.0.1:2287/ui to inspect it.')
                    print('Now add this tunnel in ChatGPT Plugins and test list_days.')
                    print('Setup is complete only after a tool call succeeds in ChatGPT.')
                    return
        except (URLError, HTTPError, TimeoutError):
            time.sleep(1)
    print('\nKey saved and service started; tunnel readiness is still pending.')
    print('Inspect: systemctl --user status vdcoach-tunnel.service')
    print('Local diagnostics: http://127.0.0.1:2287/ui')


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled.')
    except Exception as error:
        print('\n' + str(error))
    finally:
        try:
            input('\nPress Enter to close this window…')
        except (KeyboardInterrupt, EOFError):
            pass
