import copy,datetime as dt,json,tempfile,time,unittest
from pathlib import Path
from zoneinfo import ZoneInfo
from progress_store import ProgressStore,Conflict
from chat_auth import ChatError
from chat_store import ChatStore,proposal_state

DATE=dt.datetime.now(ZoneInfo('Europe/Amsterdam')).date().isoformat()
class Auth:
 def access_token(self):return 'oauth-not-api-key'
 def models(self):return [{'id':'available-model','name':'Available'}]
def state():return {'version':1,'coachUrl':'','days':{DATE:{'date':DATE,'tasks':[{'id':'work','title':'Gesprek voorbereiden','category':'Task','priority':True,'done':False,'minutes':120,'rollovers':0},{'id':'done','title':'Bevestigd klaar','category':'Task','priority':False,'done':True,'minutes':10,'rollovers':0}],'notes':'Bewaar mijn notitie','closed':False,'startId':None,'foodEntries':[{'id':'food','text':'4 eieren'}]}}}
def events(text):return [{'type':'response.output_text.delta','delta':text},{'type':'response.completed','response':{}}]
class ChatTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.progress=ProgressStore(Path(self.tmp.name)/'db');self.progress.save(state(),0);self.calls=[]
  self.response=events('Wat is er veranderd aan je dag?')
  def stream(token,payload):self.calls.append((token,payload));yield from self.response
  self.chat=ChatStore(self.progress,Auth(),events=stream)
 def tearDown(self):self.tmp.cleanup()
 def send(self,request_id='message1',text='Heroverleg mijn dag'):
  self.chat.send({'id':request_id,'date':DATE,'text':text,'model':'available-model'})
  end=time.time()+8
  while self.chat.busy.locked() and time.time()<end:time.sleep(.01)
  self.assertFalse(self.chat.busy.locked());return self.chat.history(DATE)['messages'][-1]
 def test_conversation_streams_persists_and_does_not_mutate_progress(self):
  before=self.progress.read();reply=self.send();self.assertEqual(reply['status'],'complete');self.assertEqual(reply['text'],'Wat is er veranderd aan je dag?');self.assertEqual(self.progress.read(),before)
  self.assertEqual(self.calls[0][0],'oauth-not-api-key');body=self.calls[0][1];self.assertFalse(body['store']);self.assertTrue(body['stream']);self.assertNotIn('tools',body);self.assertNotIn('previous_response_id',body);self.assertEqual(body['input'][0]['role'],'developer')
  restored=ChatStore(self.progress,Auth(),events=lambda *_:[]);self.assertEqual(restored.history(DATE),self.chat.history(DATE))
 def test_message_retry_is_idempotent_and_never_calls_model_twice(self):
  self.send();before=self.chat.history(DATE);self.chat.send({'id':'message1','date':DATE,'text':'Heroverleg mijn dag','model':'available-model'});self.assertEqual(self.chat.history(DATE),before);self.assertEqual(len(self.calls),1)
  with self.assertRaises(Conflict):self.chat.send({'id':'message1','date':DATE,'text':'Ander bericht','model':'available-model'})
 def test_proposal_requires_confirmation_preserves_data_and_repeated_confirmation_is_safe(self):
  proposal={'summary':'Maak de start klein','changes':[{'kind':'first_step','taskId':'work','text':'Schrijf één voorbeeld op.'}]}
  self.response=events('Begin met één voorbeeld.\n```json\n'+json.dumps({'vdcoachProposal':proposal})+'\n```');before=self.progress.read();reply=self.send()
  self.assertEqual(self.progress.read(),before);self.assertEqual(reply['proposal']['preview'],['Gesprek voorbereiden: Schrijf één voorbeeld op.'])
  result=self.chat.accept({'messageId':reply['id']});saved=self.progress.read();self.assertFalse(saved['state']['days'][DATE]['tasks'][0]['done']);self.assertEqual(saved['state']['days'][DATE]['tasks'][0]['minutes'],120);self.assertEqual(saved['state']['days'][DATE]['foodEntries'],state()['days'][DATE]['foodEntries']);self.assertEqual(saved['state']['days'][DATE]['notes'],'Bewaar mijn notitie')
  self.assertTrue(self.chat.accept({'messageId':reply['id']})['alreadyApplied']);self.assertEqual(self.progress.read(),saved)
 def test_new_progress_blocks_stale_confirmation_instead_of_overwriting_input(self):
  self.response=events('```json\n'+json.dumps({'vdcoachProposal':{'summary':'Parkeren','changes':[{'kind':'park','taskId':'work'}]}})+'\n```');reply=self.send();changed=self.progress.read();changed['state']['days'][DATE]['notes']='Nieuwe offline notitie';self.progress.save(changed['state'],changed['revision'])
  with self.assertRaises(Conflict):self.chat.accept({'messageId':reply['id']})
  self.assertEqual(self.progress.read()['state']['days'][DATE]['notes'],'Nieuwe offline notitie');self.assertEqual(len(self.progress.read()['state']['days'][DATE]['tasks']),2)
 def test_completion_deletion_external_actions_and_bad_proposals_cannot_execute(self):
  for change in [{'kind':'done','taskId':'work','done':True},{'kind':'delete','taskId':'work'},{'kind':'send_mail','to':'x'},{'kind':'park','taskId':'done'}]:
   s=state();before=copy.deepcopy(s)
   with self.assertRaises((ChatError,ValueError)):proposal_state(s,DATE,{'summary':'Test','changes':[change]},'reply')
   self.assertEqual(s,before)
 def test_invalid_suggestions_have_no_apply_button_and_no_progress_mutation(self):
  before=self.progress.read();self.response=events('Klaar.\n```json\n'+json.dumps({'vdcoachProposal':{'summary':'Niet toegestaan','changes':[{'kind':'done','taskId':'work'}]}})+'\n```');reply=self.send();self.assertIsNone(reply['proposal']);self.assertEqual(self.progress.read(),before)
 def test_limits_and_interrupted_stream_never_fall_back_or_publish_partial_proposals(self):
  self.response=[{'type':'response.output_text.delta','delta':'Voorlopig antwoord'},{'type':'response.failed','response':{'error':{'code':'subscription_sharing_usage_limit_exceeded'}}}]
  before=self.progress.read();reply=self.send();self.assertEqual(reply['status'],'error');self.assertIn('gebruikslimiet',reply['error']);self.assertIsNone(reply['proposal']);self.assertEqual(len(self.calls),1);self.assertEqual(self.progress.read(),before)
  self.response=[{'type':'response.output_text.delta','delta':'Onderbroken'}];reply=self.send('message2');self.assertEqual(reply['status'],'error');self.assertIn('onderbroken',reply['error'])
 def test_restart_marks_inflight_reply_as_interrupted_without_erasing_text(self):
  now=time.time()
  with self.progress.connect() as db:db.execute('INSERT INTO coach_messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',('inflight',DATE,'assistant','Al ontvangen','streaming',now,now,None,1,None,None,'model'))
  recovered=ChatStore(self.progress,Auth());reply=recovered.history(DATE)['messages'][-1];self.assertEqual(reply['text'],'Al ontvangen');self.assertEqual(reply['status'],'error')
 def test_move_is_explicitly_deferred_and_does_not_mark_task_done(self):
  tomorrow=(dt.date.fromisoformat(DATE)+dt.timedelta(days=1)).isoformat();original=state();changed,preview=proposal_state(original,DATE,{'summary':'Morgen','changes':[{'kind':'move','taskId':'work','date':tomorrow}]},'reply')
  self.assertEqual(len(original['days'][DATE]['tasks']),2);self.assertFalse(changed['days'][tomorrow]['tasks'][0]['done']);self.assertEqual(changed['days'][DATE]['deferredTasks'][0]['target'],tomorrow);self.assertTrue(changed['days'][DATE]['tasks'][0]['done'])

 def test_user_reported_completion_and_diary_require_quote_and_separate_approval(self):
  change={'summary':'Jouw melding bewaren','changes':[{'kind':'task_done','taskId':'work','done':True,'evidence':'Ik heb de voorbereiding af'}]}
  with self.assertRaises(ChatError):proposal_state(state(),DATE,change,'reply','Alleen plannen vandaag')
  self.response=events('Ik zet je melding klaar.\n```json\n'+json.dumps({'vdcoachProposal':change})+'\n```');reply=self.send(text='Ik heb de voorbereiding af')
  self.assertFalse(self.progress.read()['state']['days'][DATE]['tasks'][0]['done']);self.chat.accept({'messageId':reply['id']});self.assertTrue(self.progress.read()['state']['days'][DATE]['tasks'][0]['done'])
 def test_confirmed_food_and_diary_preserve_legacy_fields_and_never_guess_amounts(self):
  s=state();del s['days'][DATE]['foodEntries'];s['days'][DATE]['foodNotes']='oude kwark';s['days'][DATE]['notes']='Oude notitie'
  proposal={'summary':'Registratie','changes':[{'kind':'food','text':'4 eieren','evidence':'4 eieren'},{'kind':'diary','text':'Gewandeld','evidence':'Ik heb gewandeld'}]}
  out,_=proposal_state(s,DATE,proposal,'reply','Ik heb gewandeld en 4 eieren gegeten')
  self.assertEqual([e['text'] for e in out['days'][DATE]['foodEntries']],['oude kwark','4 eieren']);self.assertEqual([e['text'] for e in out['days'][DATE]['diaryEntries']],['Oude notitie','Gewandeld']);self.assertEqual(out['days'][DATE]['notes'],'Oude notitie');self.assertNotIn('foodEntries',s['days'][DATE])
  proposal['changes'][0]['text']='8 eieren'
  with self.assertRaises(ChatError):proposal_state(s,DATE,proposal,'reply','Ik heb gewandeld en 4 eieren gegeten')
 def test_planned_activity_is_only_stored_after_explicit_confirmation(self):
  proposal={'summary':'Ruimte voor wandelen','changes':[{'kind':'activity','text':'Wandelen','start':'14:00','end':'14:30'}]}
  self.response=events('Voorstel\n```json\n'+json.dumps({'vdcoachProposal':proposal})+'\n```');before=self.progress.read();reply=self.send()
  self.assertEqual(self.progress.read(),before)
  self.chat.accept({'messageId':reply['id']});entries=self.progress.read()['state']['days'][DATE]['diaryEntries']
  self.assertEqual(entries[0]['text'],'Bewaar mijn notitie');self.assertFalse(entries[-1]['done']);self.assertEqual(entries[-1]['startTime'],'14:00')
 def test_rescheduling_own_block_preserves_identity_and_rejects_external_or_completed(self):
  s=state();day=s['days'][DATE];day['diaryEntries']=[{'id':'own','text':'Lezen','startTime':'12:00','endTime':'12:30','done':False,'note':'Bewaren'}]
  proposal={'summary':'Later lezen','changes':[{'kind':'reschedule','entryId':'own','start':'15:00','end':'15:30'}]}
  out,_=proposal_state(s,DATE,proposal,'reply');entry=out['days'][DATE]['diaryEntries'][0]
  self.assertEqual(entry['id'],'own');self.assertEqual(entry['note'],'Bewaren');self.assertEqual(day['diaryEntries'][0]['startTime'],'12:00');self.assertFalse(entry['done'])
  for field,value in [('done',True),('appointmentId','google-123')]:
   changed=copy.deepcopy(s);changed['days'][DATE]['diaryEntries'][0][field]=value
   with self.assertRaises(ChatError):proposal_state(changed,DATE,proposal,'reply')
 def test_agenda_conflicts_reject_the_entire_proposal(self):
  proposal={'summary':'Twee blokken','changes':[{'kind':'activity','text':'Lezen','start':'14:00','end':'14:30'},{'kind':'schedule','taskId':'work','start':'14:15','end':'14:45'}]}
  original=state();before=copy.deepcopy(original)
  with self.assertRaises(ChatError):proposal_state(original,DATE,proposal,'reply')
  self.assertEqual(original,before)
  proposal['changes'][1]['start']='14:30';proposal_state(original,DATE,proposal,'reply')
 def test_context_has_explicit_amsterdam_clock_and_no_infrastructure_privileges(self):
  context=self.chat.context(state(),DATE,1)
  self.assertEqual(context['timezone'],'Europe/Amsterdam');self.assertIsNotNone(dt.datetime.fromisoformat(context['serverNow']).tzinfo)
  self.assertNotIn('access_token',json.dumps(context));self.assertNotIn('shell',context)
