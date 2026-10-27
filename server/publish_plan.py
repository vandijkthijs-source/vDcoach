#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
from plan_store import publish
parser=argparse.ArgumentParser(description='Validate and publish a local vDcoach morning plan.')
parser.add_argument('file',type=Path)
args=parser.parse_args()
root=Path(os.environ.get('VDCOACH_DATA',Path(__file__).parent/'data'))/'plans'
print(publish(json.loads(args.file.read_text()),root))
