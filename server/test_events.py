import copy,tempfile,unittest
from pathlib import Path
from progress_store import ProgressStore
from event_store import EventStore
from test_progress import state
class EventTests(unittest.TestCase):
 def setup_store(self,root):
  p=ProgressStore(Path(root)/'db');s=state();p.save(s,0);return p,EventStore(p),s
 def test_offline_action_and_stopped_timer_are_atomic_replay_safe_and_never_complete_task_implicitly(self):
  with tempfile.TemporaryDirectory() as root:
   p,e,s=self.setup_store(root);tid=s['days']['2026-11-10']['tasks'][0]['id']
   body={'actions':[{'id':'add','kind':'task-add','date':'2026-11-10','text':'Offline taak'}], 'timers':[{'id':'timer-1','taskId':tid,'title':'Werk','startedAt':1794301200000,'stoppedAt':1794301500000}]}
   first=e.apply(body);saved=p.read();self.assertEqual(e.apply(body)['revision'],first['revision']);self.assertEqual(p.read(),saved)
   all_tasks=[t for d in saved['state']['days'].values() for t in d['tasks']];self.assertEqual(sum(t['id']=='widget-add' for t in all_tasks),1);self.assertFalse(saved['state']['days']['2026-11-10']['tasks'][0]['done'])
   entries=[entry for d in saved['state']['days'].values() for entry in d.get('diaryEntries',[])];self.assertEqual(sum(entry['id'].startswith('timer-timer-1-') for entry in entries),1);self.assertTrue(any(entry['text']=='Keep this note' for entry in entries))
 def test_explicit_done_is_separate_and_late_closed_day_input_preserved(self):
  with tempfile.TemporaryDirectory() as root:
   p,e,s=self.setup_store(root);s['days']['2026-11-10']['closed']=True;p.save(s,1);tid=s['days']['2026-11-10']['tasks'][0]['id']
   e.apply({'actions':[{'id':'done','kind':'task','date':'2026-11-10','taskId':tid,'done':True}]})
   self.assertTrue(p.read()['state']['days']['2026-11-10']['closed']);self.assertTrue(p.read()['state']['days']['2026-11-10']['tasks'][0]['done'])
 def test_invalid_batch_never_partially_writes_or_acknowledges_input(self):
  with tempfile.TemporaryDirectory() as root:
   p,e,s=self.setup_store(root);before=p.read()
   with self.assertRaises(ValueError):e.apply({'actions':[{'id':'valid','kind':'task-add','date':'2026-11-10','text':'bewaren'},{'id':'invalid','kind':'unknown','date':'2026-11-10'}]})
   self.assertEqual(p.read(),before)
   e.apply({'actions':[{'id':'valid','kind':'task-add','date':'2026-11-10','text':'bewaren'}]})
   self.assertEqual(len(p.read()['state']['days']['2026-11-10']['tasks']),len(s['days']['2026-11-10']['tasks'])+1)
