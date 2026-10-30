"""Shared validation and atomic publication for daily plans (no external writes)."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
from zoneinfo import ZoneInfo

ZONE=ZoneInfo('Europe/Amsterdam')
def validate(p):
    if not isinstance(p,dict) or p.get('version')!=1 or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',p.get('date','')): raise ValueError('Invalid plan date/version')
    date=dt.date.fromisoformat(p['date'])
    stamp=dt.datetime.fromisoformat(p.get('generatedAt','').replace('Z','+00:00'))
    if stamp.tzinfo is None or stamp.astimezone(ZONE).date()!=date: raise ValueError('generatedAt must match the Amsterdam plan date')
    if not isinstance(p.get('tasks'),list) or len(p['tasks'])>100: raise ValueError('Invalid tasks')
    ids=set()
    for t in p['tasks']:
        if not isinstance(t,dict) or not isinstance(t.get('id'),str) or not t['id'] or t['id'] in ids: raise ValueError('Task IDs must be unique')
        ids.add(t['id'])
        if not isinstance(t.get('title'),str) or not t['title'].strip() or t.get('category') not in ('Task','Habit','Appointment'): raise ValueError('Invalid task')
        if t.get('done') is not False or type(t.get('priority')) is not bool: raise ValueError('Morning plans cannot complete tasks')
        if any(type(t.get(k)) is not int or t[k]<0 for k in ('minutes','rollovers')): raise ValueError('Invalid task duration/rollover')
        if 'shortTitle' in t and (not isinstance(t['shortTitle'],str) or not t['shortTitle'].strip() or len(t['shortTitle'])>80):raise ValueError('Invalid short task title')
        if 'dueDate' in t:
            if not isinstance(t['dueDate'],str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',t['dueDate']):raise ValueError('Invalid task deadline')
            dt.date.fromisoformat(t['dueDate'])
        if 'firstPlannedDate' in t:
            if not isinstance(t['firstPlannedDate'],str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',t['firstPlannedDate']):raise ValueError('Invalid original task date')
            origin=dt.date.fromisoformat(t['firstPlannedDate'])
            if t['category']!='Task' or origin>date:raise ValueError('Invalid original task date')
    if sum(t['priority'] for t in p['tasks'])>3 or p.get('startId') is not None and p['startId'] not in ids: raise ValueError('Invalid priorities/start')
    if not isinstance(p.get('appointments'),list): raise ValueError('Missing appointments')
    for a in p['appointments']:
        if not all(isinstance(a.get(k),str) for k in ('id','title','start','end')): raise ValueError('Invalid appointment')
        start=dt.datetime.fromisoformat(a['start'].replace('Z','+00:00'));end=dt.datetime.fromisoformat(a['end'].replace('Z','+00:00'))
        if start.tzinfo is None or end.tzinfo is None or end<start: raise ValueError('Invalid appointment times')
        if 'note' in a and not isinstance(a['note'],str):raise ValueError('Invalid appointment note')
    if not isinstance(p.get('weather'),str) or not isinstance(p.get('sourceChecks'),list) or not isinstance(p.get('warnings'),list): raise ValueError('Missing source status/weather')
    for c in p['sourceChecks']:
        if not isinstance(c.get('name'),str) or type(c.get('ok')) is not bool or ('note' in c and not isinstance(c['note'],str)): raise ValueError('Invalid source check')
    if any(not isinstance(w,str) for w in p['warnings']): raise ValueError('Invalid warning')
    return p

def publish(plan,root):
    validate(plan)
    plan=copy.deepcopy(plan)
    root=Path(root)
    # Read only the immediately preceding plan: gaps are not evidence of continuity.
    prior_path=root/((dt.date.fromisoformat(plan['date'])-dt.timedelta(days=1)).isoformat()+'.json')
    prior={}
    if prior_path.exists():
        prior_plan=validate(json.loads(prior_path.read_text()))
        prior={t['id']:t for t in prior_plan['tasks'] if t['category']=='Task'}
    for task in plan['tasks']:
        if task['category']!='Task':continue
        old=prior.get(task['id'])
        origin=task.get('firstPlannedDate')
        if not origin and old:
            origin=old.get('firstPlannedDate') or (dt.date.fromisoformat(prior_plan['date'])-dt.timedelta(days=old['rollovers'])).isoformat()
        if origin:
            task['firstPlannedDate']=origin
            task['rollovers']=(dt.date.fromisoformat(plan['date'])-dt.date.fromisoformat(origin)).days
    validate(plan)
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    target=root/(plan['date']+'.json')
    if target.exists():
        previous=json.loads(target.read_text())
        if dt.datetime.fromisoformat(previous['generatedAt'].replace('Z','+00:00'))>=dt.datetime.fromisoformat(plan['generatedAt'].replace('Z','+00:00')):raise ValueError('Refusing an older or duplicate plan')
    fd,name=tempfile.mkstemp(dir=root,prefix='.pending-')
    try:
        with os.fdopen(fd,'w') as f:json.dump(plan,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
        os.replace(name,target)
    finally:
        if os.path.exists(name):os.unlink(name)
    return target
