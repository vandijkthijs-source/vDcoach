import copy
import json
from pathlib import Path
import tempfile
import unittest
from progress_store import ProgressStore, Conflict
from library_store import LibraryStore
from coaching_store import CoachingStore
from test_plans import plan


class CoachingTests(unittest.TestCase):
    def test_plan_publication_preserves_progress_and_rejects_stale_sources(self):
        with tempfile.TemporaryDirectory() as temp:
            progress = ProgressStore(Path(temp)/'test.sqlite3')
            library = LibraryStore(temp)
            doc = library.root/'profile'; doc.mkdir()
            (doc/'metadata.json').write_text(json.dumps({'id':'profile','title':'Profile','localFile':'original.txt'}))
            (doc/'content.txt').write_text('Confirmed coaching preferences')
            coach = CoachingStore(progress,library)
            sources = [{'id':'profile','revision':library.read('profile')['revision']}]
            p = plan()
            first = coach.publish_plan({'revision':0,'sources':sources,'plan':p})
            self.assertEqual(first['state']['days'][p['date']]['plan'],p)
            progress.change({'revision':1,'date':p['date'],'id':'habit-0','action':'set_task_done','done':True})
            progress.change({'revision':2,'date':p['date'],'id':'activity','action':'add_diary','text':'Went for a walk','done':True})
            p['generatedAt']='2026-10-27T09:00:00+01:00'
            second = coach.publish_plan({'revision':3,'sources':sources,'plan':p})
            day=second['state']['days'][p['date']]
            self.assertTrue(day['tasks'][0]['done'])
            self.assertEqual(day['diaryEntries'][0]['text'],'Went for a walk')
            self.assertFalse(day['plan']['tasks'][0]['done'])
            library.save('profile','Updated preferences',sources[0]['revision'])
            with self.assertRaises(Conflict):coach.publish_plan({'revision':4,'sources':sources,'plan':p})
            current=progress.read();current['state']['days'][p['date']]['closed']=True
            progress.save(current['state'],current['revision'])
            sources[0]['revision']=library.read('profile')['revision']
            with self.assertRaises(ValueError):coach.publish_plan({'revision':5,'sources':sources,'plan':p})

    def test_applications_revision_evidence_and_older_status_protection(self):
        with tempfile.TemporaryDirectory() as temp:
            coach=CoachingStore(ProgressStore(Path(temp)/'test.sqlite3'),LibraryStore(temp))
            application={'id':'company-role-1','company':'Company','role':'Role','status':'Waiting','asOfDate':'2026-11-10','evidence':'User confirmed submission on this date','sources':[]}
            result=coach.save_application({'revision':0,'application':application})
            self.assertEqual(result['revision'],1)
            self.assertEqual(coach.save_application({'revision':1,'application':application})['revision'],1)
            with self.assertRaises(Conflict):coach.save_application({'revision':0,'application':application})
            old=copy.deepcopy(application);old['asOfDate']='2026-11-01'
            with self.assertRaises(Conflict):coach.save_application({'revision':1,'application':old})
            old=copy.deepcopy(application);del old['evidence']
            with self.assertRaises(ValueError):coach.save_application({'revision':1,'application':old})
