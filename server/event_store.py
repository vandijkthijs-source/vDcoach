"""Durable idempotent native outbox delivery; shares the phone reducers, never replaces a day."""
import json,subprocess
from pathlib import Path
class EventStore:
 def __init__(self,progress):
  self.progress=progress
  with progress.connect() as db:db.execute('CREATE TABLE IF NOT EXISTS event_receipts (kind TEXT NOT NULL,id TEXT NOT NULL,PRIMARY KEY(kind,id))')
 def apply(self,body):
  if not isinstance(body,dict):raise ValueError('Invalid events')
  actions,timers=body.get('actions',[]),body.get('timers',[])
  if not isinstance(actions,list) or not isinstance(timers,list) or len(actions)>1000 or len(timers)>1000:raise ValueError('Invalid event count')
  for row in actions+timers:
   if not isinstance(row,dict) or not isinstance(row.get('id'),str) or not 0<len(row['id'])<=200:raise ValueError('Invalid event ID')
  with self.progress.connect() as db:
   db.execute('BEGIN IMMEDIATE');current=self.progress.read(db)
   fresh=lambda rows,kind:[a for a in rows if not db.execute('SELECT 1 FROM event_receipts WHERE kind=? AND id=?',(kind,a['id'])).fetchone()]
   aa,tt=fresh(actions,'action'),fresh(timers,'timer')
   if aa or tt:
    try:
     result=subprocess.run(['/usr/bin/node',str(Path(__file__).with_name('events-runner.cjs'))],input=json.dumps({'state':current['state'],'actions':aa,'timers':tt}),text=True,capture_output=True,timeout=15,check=True)
     state=json.loads(result.stdout)
    except (subprocess.SubprocessError,ValueError):raise ValueError('Event invalid; original state retained')
    current=self.progress.write(db,state,current,'widget','outbox_delivery')
    db.executemany('INSERT OR IGNORE INTO event_receipts VALUES (?,?)',[('action',a['id']) for a in aa]+[('timer',a['id']) for a in tt])
   return {'revision':current['revision'],'actions':[a['id'] for a in actions],'timers':[a['id'] for a in timers]}
