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
if __name__=='__main__':unittest.main()
