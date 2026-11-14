"""Shared progress with atomic revisions, snapshots and an audit trail."""
import copy
import datetime as dt
import json
import math
import re
import sqlite3
import time


class Conflict(ValueError):
    pass


def valid_date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('Use a date in YYYY-MM-DD format')
    dt.date.fromisoformat(value)
    return value


def text(value, maximum=4000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('Text is empty or too long')
    return value


def validate_state(state):
    if not isinstance(state, dict) or type(state.get('version')) is not int or state.get('version') != 1 or not isinstance(state.get('days'), dict) or not isinstance(state.get('coachUrl'), str):
        raise ValueError('Invalid vDcoach state')
    if 'planningEnd' in state and (not isinstance(state['planningEnd'],str) or not re.fullmatch(r'(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)',state['planningEnd'])): raise ValueError('Invalid planning end')
    if 'projects' in state:
        projects=state['projects']
        if not isinstance(projects,list) or len(projects)>200: raise ValueError('Invalid projects')
        seen=set()
        for project in projects:
            if not isinstance(project,dict) or not isinstance(project.get('id'),str) or project['id'] in seen or type(project.get('archived')) is not bool or not isinstance(project.get('nextStep'),str): raise ValueError('Invalid project')
            text(project.get('title')); seen.add(project['id'])
            if project.get('deadline'): valid_date(project['deadline'])
    if 'backlogTasks' in state:
        if not isinstance(state['backlogTasks'],list) or len(state['backlogTasks'])>1000: raise ValueError('Invalid backlog')
        for task in state['backlogTasks']:
            if not isinstance(task,dict) or task.get('category')!='Task': raise ValueError('Invalid backlog task')
            text(task.get('id'),200); text(task.get('title'))
            validate_state({'version':1,'coachUrl':'','days':{'9999-12-31':{'date':'9999-12-31','tasks':[task],'notes':'','startId':None,'closed':False}}})
    if 'darkMode' in state and type(state['darkMode']) is not bool:
        raise ValueError('Invalid display preference')
    if 'hiddenFoodHistory' in state and (not isinstance(state['hiddenFoodHistory'], list) or any(not isinstance(v, str) for v in state['hiddenFoodHistory'])):
        raise ValueError('Invalid food history')
    if len(state['days']) > 10000:
        raise ValueError('Too many days')
    for date, day in state['days'].items():
        valid_date(date)
        if not isinstance(day, dict) or day.get('date') != date or type(day.get('closed')) is not bool or not isinstance(day.get('notes'), str) or not isinstance(day.get('tasks'), list) or not (day.get('startId') is None or isinstance(day['startId'], str)):
            raise ValueError('Invalid day')
        ids = set()
        for task in day['tasks']:
            if not isinstance(task, dict):
                raise ValueError('Invalid task')
            text(task.get('id'), 200)
            text(task.get('title'))
            if task['id'] in ids or task.get('category') not in ('Task', 'Habit', 'Appointment') or any(type(task.get(k)) is not bool for k in ('done', 'priority')) or any(type(task.get(k)) is not int or task[k] < 0 for k in ('minutes', 'rollovers')):
                raise ValueError('Invalid task')
            if task.get('status','todo') not in ('todo','waiting','parked'): raise ValueError('Invalid task status')
            for field in ('area','firstStep','waitingUntil'):
                if field in task and (not isinstance(task[field],str) or len(task[field])>4000): raise ValueError('Invalid coach metadata')
            if task.get('waitingUntil'): valid_date(task['waitingUntil'])
            ids.add(task['id'])
            for field in ('shortTitle', 'comment'):
                if field in task and (not isinstance(task[field], str) or len(task[field]) > (80 if field == 'shortTitle' else 4000)):
                    raise ValueError('Invalid task text')
            if 'shortTitle' in task and not task['shortTitle'].strip():
                raise ValueError('Empty short title')
            for field in ('dueDate', 'firstPlannedDate'):
                if field in task:
                    valid_date(task[field])
            if 'firstPlannedDate' in task and (task['firstPlannedDate'] > date or task['category'] != 'Task'):
                raise ValueError('Invalid task origin')
        # Incoming morning plans enforce max three; historical user choices are preserved.
        for field in ('diaryEntries', 'foodEntries'):
            entries = day.get(field, [])
            if not isinstance(entries, list) or len(entries) > 10000:
                raise ValueError('Invalid entries')
            seen = set()
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValueError('Invalid entry')
                text(entry.get('id'), 200)
                text(entry.get('text'))
                if entry['id'] in seen or (field == 'diaryEntries' and type(entry.get('done')) is not bool):
                    raise ValueError('Invalid or duplicate entry')
                seen.add(entry['id'])
                if field == 'diaryEntries':
                    for key in ('appointmentId', 'time', 'note', 'startTime', 'endTime', 'location'):
                        if key in entry and not isinstance(entry[key], str):
                            raise ValueError('Invalid diary text')
                    for key in ('edited', 'allDay'):
                        if key in entry and type(entry[key]) is not bool:
                            raise ValueError('Invalid diary flag')
                    times(entry.get('startTime', ''), entry.get('endTime', ''), entry.get('allDay', False))
        if 'energy' in day and day['energy'] not in ('low','normal','high'): raise ValueError('Invalid day preference')
        if 'focusChoices' in day:
            if not isinstance(day['focusChoices'],list) or len(day['focusChoices'])>1000: raise ValueError('Invalid focus choices')
            for choice in day['focusChoices']:
                if not isinstance(choice,dict) or not isinstance(choice.get('id'),str) or type(choice.get('until')) not in (int,float) or not math.isfinite(choice['until']): raise ValueError('Invalid focus choice')
        for entry in day.get('diaryEntries',[]):
            if 'taskId' in entry and not isinstance(entry['taskId'],str): raise ValueError('Invalid task reference')
            if 'focusSeconds' in entry and (type(entry['focusSeconds']) not in (int,float) or not math.isfinite(entry['focusSeconds']) or entry['focusSeconds']<0): raise ValueError('Invalid focus duration')
        for field in ('removedTaskIds', 'taskOverrides', 'removedDiaryIds'):
            if field in day and (not isinstance(day[field], list) or any(not isinstance(v, str) for v in day[field])):
                raise ValueError('Invalid removed IDs')
        if 'foodNotes' in day and not isinstance(day['foodNotes'], str):
            raise ValueError('Invalid food notes')
        if 'meals' in day:
            if not isinstance(day['meals'], list):
                raise ValueError('Invalid meals')
            for meal in day['meals']:
                if not isinstance(meal, dict) or any(not isinstance(meal.get(k), str) for k in ('id', 'text', 'time')) or type(meal.get('estimated')) is not bool:
                    raise ValueError('Invalid meal')
                if any(type(meal[k]) not in (int, float) or not math.isfinite(meal[k]) or meal[k] < 0 for k in ('kcal', 'protein', 'carbs', 'fat') if k in meal):
                    raise ValueError('Invalid nutrition values')
        if 'deletedTasks' in day:
            if not isinstance(day['deletedTasks'], list) or len(day['deletedTasks']) > 1000:
                raise ValueError('Invalid removed tasks')
            for task in day['deletedTasks']:
                validate_state({'version': 1, 'coachUrl': '', 'days': {date: {'date': date, 'tasks': [task], 'notes': '', 'closed': False, 'startId': None}}})
            if len({t['id'] for t in day['deletedTasks']}) != len(day['deletedTasks']):
                raise ValueError('Duplicate removed tasks')
        if 'plan' in day:
            from plan_store import validate
            validate(day['plan'])
    return state


def times(start, end, all_day=False):
    if type(all_day) is not bool:
        raise ValueError('Invalid all-day flag')
    if all_day or (not start and not end):
        return
    if not isinstance(start, str) or not isinstance(end, str) or not re.fullmatch(r'(?:[01]\d|2[0-3]):[0-5]\d', start) or not re.fullmatch(r'(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)', end) or end <= start:
        raise ValueError('Use valid start/end times; end must follow start')


class ClosingConnection(sqlite3.Connection):
    """Commit/rollback normally, then release SQLite's file handles immediately."""
    def __exit__(self, *args):
        try:
            return super().__exit__(*args)
        finally:
            self.close()


class ProgressStore:
    def __init__(self, path):
        self.path = path
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS progress (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, updated REAL NOT NULL, body TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, created REAL NOT NULL, source TEXT NOT NULL, action TEXT NOT NULL, revision INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, created REAL NOT NULL, body TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.path, timeout=15, factory=ClosingConnection)

    def read(self, db=None):
        if db is None:
            with self.connect() as connection:
                return self.read(connection)
        row = db.execute('SELECT revision, updated, body FROM progress WHERE id=1').fetchone()
        if row:
            return {'revision': row[0], 'updatedAt': row[1], 'state': json.loads(row[2])}
        return {'revision': 0, 'updatedAt': None, 'state': {'version': 1, 'coachUrl': 'https://chatgpt.com/', 'days': {}}}

    def save(self, state, revision, source='phone', action='sync'):
        validate_state(state)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.read(db)
            if type(revision) is not int or revision != current['revision']:
                raise Conflict('Newer progress exists. Refresh and merge before saving.')
            return self.write(db, state, current, source, action)

    def write(self, db, state, current, source, action):
        if state == current['state']:
            return current
        validate_state(state)
        revision, now = current['revision'] + 1, time.time()
        body = json.dumps(state, ensure_ascii=False)
        if len(body.encode()) > 5 * 1024 * 1024:
            raise ValueError('Progress exceeds 5 MB')
        db.execute('INSERT INTO snapshots(created, body) VALUES (?, ?)', (now, body))
        db.execute('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 30)')
        db.execute('INSERT OR REPLACE INTO progress VALUES (1, ?, ?, ?)', (revision, now, body))
        db.execute('INSERT INTO audit(created,source,action,revision) VALUES (?,?,?,?)', (now, source, action, revision))
        db.execute('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 1000)')
        return {'revision': revision, 'updatedAt': now, 'state': state}

    def change(self, args, source='dashboard'):
        if not isinstance(args, dict):
            raise ValueError('Expected an object')
        date = valid_date(args.get('date'))
        action = args.get('action')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.read(db)
            if type(args.get('revision')) is not int or args['revision'] != current['revision']:
                raise Conflict('Progress changed. Refresh before trying again.')
            state = copy.deepcopy(current['state'])
            day = state['days'].setdefault(date, {'date': date, 'tasks': [], 'notes': '', 'closed': False, 'startId': None})
            if day['closed']:
                raise ValueError('This day is closed. Reopen it in the phone app first.')
            entry_id = text(args.get('id'), 200)
            if action in ('add_diary', 'add_food'):
                field = 'diaryEntries' if action == 'add_diary' else 'foodEntries'
                entry = {'id': entry_id, 'text': text(args.get('text')).strip()}
                if field == 'diaryEntries':
                    if type(args.get('done', False)) is not bool:
                        raise ValueError('done must be boolean')
                    entry.update(done=args.get('done', False), edited=True)
                    start, end = args.get('startTime', ''), args.get('endTime', '')
                    times(start, end)
                    if start:
                        entry.update(startTime=start, endTime=end, time=f'{start}–{end}')
                    if field not in day and day['notes'].strip():
                        day[field] = [{'id': 'legacy-notes', 'text': day['notes'], 'done': False}]
                elif field not in day:
                    legacy = day.get('foodNotes')
                    if legacy is None:
                        legacy = '\n'.join(f"{m.get('time', '')} {m['text']}".strip() for m in day.get('meals', []))
                    day[field] = [{'id': f'legacy-food-{i}', 'text': line.strip()} for i, line in enumerate(filter(str.strip, legacy.splitlines()))]
                entries = day.setdefault(field, [])
                previous = next((e for e in entries if e['id'] == entry_id), None)
                if previous is not None:
                    if previous != entry:
                        raise ValueError('This ID already belongs to another entry')
                else:
                    entries.append(entry)
            elif action == 'set_task_done':
                if type(args.get('done')) is not bool:
                    raise ValueError('done must be boolean')
                task = next((t for t in day['tasks'] if t['id'] == entry_id), None)
                if task is None:
                    raise ValueError('Task not found')
                task['done'] = args['done']
            else:
                raise ValueError('Unknown action')
            return self.write(db, state, current, source, action)

    def audit(self):
        with self.connect() as db:
            return [{'at': row[0], 'source': row[1], 'action': row[2], 'revision': row[3]} for row in db.execute('SELECT created,source,action,revision FROM audit ORDER BY id DESC LIMIT 20')]
