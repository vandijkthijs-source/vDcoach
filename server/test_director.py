import copy,json,subprocess,unittest
from director_store import get_director
from progress_store import validate_state
from day_review import day_facts
from test_progress import state
class DirectorTests(unittest.TestCase):
 def test_same_engine_has_offline_fallback_and_does_not_mutate(self):
  s=state();before=copy.deepcopy(s);d=get_director(s,'2026-11-10','2026-11-10T10:00:00+01:00')
  self.assertEqual(s,before);self.assertEqual(d['engineVersion'],'2.0.0');self.assertFalse(d['sourceChecksFresh']);self.assertIsNotNone(d['warning'])
 def test_metadata_and_factual_review_do_not_complete_work(self):
  s=state();t=s['days']['2026-11-10']['tasks'][0];t.update(status='waiting',waitingUntil='2026-11-12',firstStep='Open het document',area='Werk');validate_state(s)
  f=day_facts(s['days']['2026-11-10']);self.assertEqual(f['done'],0);self.assertEqual(f['waiting'],1)
  t['status']='invented'
  with self.assertRaises(ValueError):validate_state(s)
 def test_multiple_saved_priorities_preserved_without_weakening_incoming_plan_limit(self):
  s=state();task=s['days']['2026-11-10']['tasks'][0];s['days']['2026-11-10']['tasks']=[{**task,'id':str(i),'priority':True} for i in range(4)];validate_state(s)
