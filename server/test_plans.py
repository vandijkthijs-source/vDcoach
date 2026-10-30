import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from plan_store import validate,publish

def plan():
 return {'version':1,'date':'2026-10-27','generatedAt':'2026-10-27T07:00:00+01:00','tasks':[{'id':'habit-0','title':'Vitamine','category':'Habit','done':False,'priority':False,'minutes':1,'rollovers':0}],'startId':'habit-0','appointments':[],'weather':'Niet beschikbaar','sourceChecks':[{'name':'Calendar','ok':False}],'warnings':['Calendar niet bereikbaar']}
class Plans(unittest.TestCase):
 def test_atomic_validated_publication(self):
  with tempfile.TemporaryDirectory() as d:
   p=plan();path=publish(p,d);self.assertEqual(json.loads(path.read_text()),p)
   with self.assertRaises(ValueError):publish(p,d)
   p['generatedAt']='2026-10-27T08:00:00+01:00';p['tasks'][0]['done']=True
   with self.assertRaises(ValueError):publish(p,d)
   self.assertFalse(json.loads(path.read_text())['tasks'][0]['done'])
 def test_utc_timestamp_uses_amsterdam_day(self):
  p=plan();p['generatedAt']='2026-10-26T23:30:00Z';validate(p)
  p['date']='2026-10-26'
  with self.assertRaises(ValueError):validate(p)
 def test_carry_days_are_idempotent_and_continue_by_stable_id(self):
  with tempfile.TemporaryDirectory() as d:
   p=plan();p['startId']='cpc';p['tasks']=[{'id':'cpc','title':'CPC','category':'Task','done':False,'priority':True,'minutes':15,'rollovers':0,'firstPlannedDate':'2026-10-24'}]
   result=json.loads(publish(p,d).read_text());self.assertEqual(result['tasks'][0]['rollovers'],3)
   p['generatedAt']='2026-10-27T08:00:00+01:00'
   self.assertEqual(json.loads(publish(p,d).read_text())['tasks'][0]['rollovers'],3)
   p['date']='2026-10-28';p['generatedAt']='2026-10-28T07:00:00+01:00';del p['tasks'][0]['firstPlannedDate']
   self.assertEqual(json.loads(publish(p,d).read_text())['tasks'][0]['rollovers'],4)
 def test_origin_cannot_be_future_or_a_habit(self):
  p=plan();p['tasks'][0]['firstPlannedDate']='2026-10-25'
  with self.assertRaises(ValueError):validate(p)
  p['tasks'][0]['category']='Task';p['tasks'][0]['firstPlannedDate']='2026-10-28'
  with self.assertRaises(ValueError):validate(p)
 def test_compact_task_metadata_is_optional_and_validated(self):
  p=plan();p['tasks'][0]['shortTitle']='Vitamine';p['tasks'][0]['dueDate']='2026-11-01';validate(p)
  p['tasks'][0]['shortTitle']=''
  with self.assertRaises(ValueError):validate(p)
  p['tasks'][0]['shortTitle']='Vitamine';p['tasks'][0]['dueDate']='2026-02-30'
  with self.assertRaises(ValueError):validate(p)
if __name__=='__main__':unittest.main()
