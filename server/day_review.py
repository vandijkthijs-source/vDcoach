"""Local day closure and revision-safe AI review queue. No AI/network calls."""
import copy
import datetime as dt
import hashlib
import json
import math
import time
from zoneinfo import ZoneInfo
from progress_store import Conflict, text, valid_date


def fingerprint(state, date):
    day = {k:v for k,v in state['days'][date].items() if k not in ('plan', 'planSources')}
    updates = [u for u in state.get('applicationJournal', []) if u.get('date') == date]
    body = json.dumps({'day':day,'applicationUpdates':updates},sort_keys=True,ensure_ascii=False,separators=(',', ':'))
    return hashlib.sha256(body.encode()).hexdigest()


class DayReviews:
    def __init__(self, progress):
        self.progress = progress
        with progress.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS day_reviews (date TEXT NOT NULL, input_hash TEXT NOT NULL, reviewed REAL NOT NULL, body TEXT NOT NULL, PRIMARY KEY(date,input_hash))')

    def close_past_days(self, now=None):
        today = (now or dt.datetime.now(dt.timezone.utc)).astimezone(ZoneInfo('Europe/Amsterdam')).date().isoformat()
        with self.progress.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.progress.read(db)
            state = copy.deepcopy(current['state'])
            for date, day in state['days'].items():
                if date < today:
                    day['closed'] = True
            return self.progress.write(db,state,current,'server','midnight_close')

    def queue(self):
        with self.progress.connect() as db:
            state = self.progress.read(db)['state']
            pending, completed = [], []
            for date, day in sorted(state['days'].items()):
                if not day['closed']:
                    continue
                stamp = fingerprint(state,date)
                row = db.execute('SELECT reviewed,body FROM day_reviews WHERE date=? AND input_hash=?',(date,stamp)).fetchone()
                if row:
                    completed.append({'date':date,'inputHash':stamp,'reviewedAt':row[0],**json.loads(row[1])})
                else:
                    pending.append({'date':date,'inputHash':stamp,'day':day,'applicationUpdates':[u for u in state.get('applicationJournal',[]) if u.get('date')==date]})
            return {'pending':pending,'completed':completed}

    def finish(self, args):
        date = valid_date(args.get('date'))
        stamp = args.get('inputHash')
        if not isinstance(stamp,str) or len(stamp)!=64:
            raise ValueError('Read the current pending day first')
        text(args.get('summary'),20000)
        body = {'summary':args['summary']}
        nutrition = args.get('nutrition')
        if nutrition is not None:
            if not isinstance(nutrition,dict) or set(nutrition)-{'kcal','protein','carbs','fat'} or any(type(v) not in (int,float) or not math.isfinite(v) or v<0 for v in nutrition.values()):
                raise ValueError('Invalid nutrition estimate')
            body['nutrition'] = nutrition
        with self.progress.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            state = self.progress.read(db)['state']
            day = state['days'].get(date)
            if not day or not day['closed'] or fingerprint(state,date)!=stamp:
                raise Conflict('Day changed or reopened; read the pending day again')
            row = db.execute('SELECT reviewed,body FROM day_reviews WHERE date=? AND input_hash=?',(date,stamp)).fetchone()
            if row:
                return {'date':date,'inputHash':stamp,'reviewedAt':row[0],**json.loads(row[1])}
            reviewed = time.time()
            db.execute('INSERT INTO day_reviews VALUES (?,?,?,?)',(date,stamp,reviewed,json.dumps(body,ensure_ascii=False)))
            return {'date':date,'inputHash':stamp,'reviewedAt':reviewed,**body}
