import copy
import tempfile
import unittest
from pathlib import Path
from progress_store import ProgressStore,validate_state
from day_review import fingerprint

class LifePlanningTests(unittest.TestCase):
 def test_projects_backlog_and_deferrals_roundtrip_without_touching_history(self):
  task={'id':'t','title':'Bel pap','category':'Task','done':False,'priority':False,'minutes':10,'rollovers':4}
  state={'version':1,'coachUrl':'','projects':[{'id':'p','title':'Klussen','nextStep':'Maak een plan','archived':False}], 'backlogTasks':[task], 'days':{'2026-11-12':{'date':'2026-11-12','tasks':[],'notes':'Fijne dag','closed':True,'startId':None,'deferredTasks':[{'id':'t','title':'Bel pap','target':'backlog'}],'foodEntries':[{'id':'old','text':'oude invoer'}]}}}
  validate_state(state)
  with tempfile.TemporaryDirectory() as tmp:
   store=ProgressStore(Path(tmp)/'db.sqlite3');store.save(state,0)
   self.assertEqual(store.read()['state'],state)
  changed=copy.deepcopy(state);changed['days']['2026-11-12']['deferredTasks'][0]['target']='2026-11-16'
  self.assertNotEqual(fingerprint(state,'2026-11-12'),fingerprint(changed,'2026-11-12'))
 def test_invalid_project_or_backlog_is_rejected(self):
  for addition in [{'projects':[{'id':'p','title':'','nextStep':'','archived':False}]},{'backlogTasks':[{'id':'x','title':'Incomplete','category':'Task'}]}]:
   with self.assertRaises((ValueError,KeyError)):validate_state({'version':1,'coachUrl':'','days':{},**addition})
