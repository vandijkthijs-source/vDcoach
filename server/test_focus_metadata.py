import copy
import tempfile
import unittest
from pathlib import Path
from progress_store import ProgressStore,validate_state
from day_review import fingerprint

class FocusMetadataTests(unittest.TestCase):
 def state(self):
  return {'version':1,'coachUrl':'','planningEnd':'22:00','days':{'2026-11-12':{'date':'2026-11-12','tasks':[{'id':'work','title':'Voorbereiden','category':'Task','done':False,'priority':True,'minutes':120,'rollovers':0}],'notes':'','startId':None,'closed':False,'energy':'low','focusChoices':[{'id':'other','until':1900000000000}],'diaryEntries':[{'id':'segment','taskId':'work','text':'Voorbereiden','startTime':'14:00','endTime':'14:45','done':True,'focusSeconds':2700}]}}}
 def test_actual_focus_and_preference_roundtrip_without_completing_task(self):
  state=self.state();validate_state(state)
  with tempfile.TemporaryDirectory() as tmp:
   store=ProgressStore(Path(tmp)/'db');store.save(state,0);saved=store.read()['state'];self.assertEqual(saved,state);self.assertFalse(saved['days']['2026-11-12']['tasks'][0]['done'])
  changed=copy.deepcopy(state);changed['days']['2026-11-12']['diaryEntries'][0]['focusSeconds']=3000
  self.assertNotEqual(fingerprint(state,'2026-11-12'),fingerprint(changed,'2026-11-12'))
 def test_invalid_focus_metadata_is_rejected(self):
  for value in (-1,float('nan'),float('inf'),'2700'):
   state=self.state();state['days']['2026-11-12']['diaryEntries'][0]['focusSeconds']=value
   with self.assertRaises(ValueError):validate_state(state)
  state=self.state();state['planningEnd']='29:00'
  with self.assertRaises(ValueError):validate_state(state)
