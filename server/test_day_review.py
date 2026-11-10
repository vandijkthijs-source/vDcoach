import copy
import datetime as dt
from pathlib import Path
import tempfile
import unittest
from day_review import DayReviews
from progress_store import ProgressStore, Conflict
from test_progress import state

class DayReviewTests(unittest.TestCase):
    def test_midnight_and_review_idempotence_preserve_unfinished_input(self):
        with tempfile.TemporaryDirectory() as root:
            progress=ProgressStore(Path(root)/'test.db');reviews=DayReviews(progress)
            initial=state();initial['days']['2026-11-10']['foodEntries']=[{'id':'meal','text':'4 eieren'}]
            progress.save(initial,0)
            reviews.close_past_days(dt.datetime.fromisoformat('2026-11-10T22:59:59+00:00'))
            self.assertFalse(progress.read()['state']['days']['2026-11-10']['closed'])
            result=reviews.close_past_days(dt.datetime.fromisoformat('2026-11-10T23:00:00+00:00'))
            self.assertTrue(result['state']['days']['2026-11-10']['closed'])
            self.assertFalse(result['state']['days']['2026-11-10']['tasks'][0]['done'])
            self.assertEqual(reviews.close_past_days(dt.datetime.fromisoformat('2026-11-11T06:00:00+00:00'))['revision'],2)
            pending=reviews.queue()['pending'][0]
            args={'date':pending['date'],'inputHash':pending['inputHash'],'summary':'Test review','nutrition':{'kcal':300}}
            first=reviews.finish(args);self.assertEqual(reviews.finish(args),first)
            self.assertEqual(reviews.queue()['pending'],[])
            self.assertEqual(progress.read()['state'],result['state'])
            late=copy.deepcopy(result['state']);late['days']['2026-11-10']['foodEntries'].append({'id':'late','text':'Kwark'})
            progress.save(late,2)
            self.assertEqual(len(reviews.queue()['pending']),1)
            self.assertEqual(reviews.queue()['completed'],[])
            with self.assertRaises(Conflict):reviews.finish(args)
            new=reviews.queue()['pending'][0]
            reviews.finish({**args,'inputHash':new['inputHash']})
            self.assertEqual(len(reviews.queue()['completed']),1)
            # Source food and completion flags remain untouched.
            self.assertEqual(progress.read()['state'],late)

    def test_reopening_hides_review_and_future_day_remains_open(self):
        with tempfile.TemporaryDirectory() as root:
            progress=ProgressStore(Path(root)/'test.db');reviews=DayReviews(progress)
            s=state();s['days']['2026-11-10']['closed']=True;progress.save(s,0)
            pending=reviews.queue()['pending'][0]
            args={'date':pending['date'],'inputHash':pending['inputHash'],'summary':'Test'}
            s['days']['2026-11-10']['closed']=False;progress.save(s,1)
            with self.assertRaises(Conflict):reviews.finish(args)
            self.assertEqual(reviews.queue(),{'pending':[],'completed':[]})
