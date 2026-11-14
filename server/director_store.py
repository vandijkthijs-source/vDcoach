"""Same deterministic planner as the phone. No network, AI calls or state mutation."""
import json
import subprocess
from pathlib import Path
from progress_store import valid_date

def get_director(state,date,now=None):
    valid_date(date)
    args={'state':state,'date':date}
    if now is not None: args['now']=now
    result=subprocess.run(['/usr/bin/node',str(Path(__file__).with_name('director-runner.cjs'))],input=json.dumps(args),text=True,capture_output=True,timeout=10,check=True)
    return json.loads(result.stdout)
