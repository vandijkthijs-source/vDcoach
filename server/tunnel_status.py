"""Report local tunnel readiness without reading or exposing any credentials."""
import re
from urllib.request import build_opener, ProxyHandler


def tunnel_status(root):
    profile = root / 'tunnel' / 'vdcoach.yaml'
    if not profile.is_file():
        return {'state': 'not_configured', 'id': None}
    match = re.search(r'tunnel_id:\s*[\"\']?(tunnel_[a-f0-9]+)', profile.read_text())
    result = {'state': 'needs_key', 'id': match.group(1) if match else None}
    if not (root / 'tunnel-key.cred').is_file():
        return result
    result['state'] = 'pending'
    try:
        opener = build_opener(ProxyHandler({}))
        with opener.open('http://127.0.0.1:2287/readyz', timeout=0.5) as response:
            if response.status == 200:
                result['state'] = 'ready'
    except (OSError, ValueError):
        pass
    return result
