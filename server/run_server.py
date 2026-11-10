#!/usr/bin/env python3
"""Bind only to this laptop's Tailscale IPv4 address, including after reboot."""
import ipaddress
import os
from pathlib import Path
import subprocess
import sys


def main():
    if not os.environ.get('VDCOACH_HOST'):
        result = subprocess.run(['/usr/bin/tailscale', 'ip', '-4'],
                                capture_output=True, text=True, timeout=15, check=True)
        host = str(ipaddress.IPv4Address(result.stdout.strip()))
        if ipaddress.IPv4Address(host) not in ipaddress.ip_network('100.64.0.0/10'):
            raise RuntimeError('Expected a Tailscale address; refusing to bind')
        os.environ['VDCOACH_HOST'] = host
    os.execv(sys.executable, [sys.executable, str(Path(__file__).with_name('server.py'))])


if __name__ == '__main__':
    main()
