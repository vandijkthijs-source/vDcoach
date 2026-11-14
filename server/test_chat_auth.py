import concurrent.futures,json,os,tempfile,time,types,unittest
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from chat_auth import ChatAuth,ChatError,AUTH,RESOURCE,PLAN_SCOPE

class AuthTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.calls=[]
  self.tokens={'id_token':'id-token','access_token':'oauth-access','refresh_token':'oauth-refresh','scope':'openid email '+PLAN_SCOPE,'expires_in':3600}
  def request(url,body=None,form=False,token=None):
   self.calls.append((url,body,token))
   if url.endswith('/models'):return {'models':[{'slug':'test-model','display_name':'Test','visibility':'list'},{'slug':'hidden','visibility':'hide'}]}
   if 'openid-configuration' in url:return {'revocation_endpoint':AUTH+'/oauth/revoke'}
   if url.endswith('/revoke'):return {}
   return dict(self.tokens)
  self.auth=ChatAuth(self.tmp.name,request=request,verifier=lambda token,client,nonce=None:{'sub':'user-1','email':'user@example.test','name':'Thijs'})
 def tearDown(self):self.tmp.cleanup()
 def login(self):
  attempt=self.auth.start('http://127.0.0.1:1455/auth/callback')
  status=self.auth.finish({'attemptId':attempt['attemptId'],'state':attempt['state'],'clientId':'oaiapp_unit_test','code':'one-time-code'})
  return status,attempt
 def test_loopback_only_fresh_pkce_state_nonce_and_stable_host(self):
  for uri in ['https://127.0.0.1:1455/auth/callback','http://localhost:1455/auth/callback','http://100.1.1.1:1455/auth/callback','http://127.0.0.1:1455/callback','http://x@127.0.0.1:1455/auth/callback','http://127.0.0.1:1455/auth/callback?x=y']:
   with self.assertRaises(ChatError):self.auth.start(uri)
  a=self.auth.start('http://127.0.0.1:1455/auth/callback');b=self.auth.start('http://127.0.0.1:1888/auth/callback')
  x=parse_qs(urlparse(a['url']).query);y=parse_qs(urlparse(b['url']).query)
  self.assertEqual(x['ext_agent_host_id'],y['ext_agent_host_id']);self.assertNotEqual(x['state'],y['state']);self.assertNotEqual(x['code_challenge'],y['code_challenge']);self.assertNotEqual(x['nonce'],y['nonce']);self.assertNotIn('verifier',a)
 def test_invalid_expired_replayed_and_changed_client_callbacks_never_redeem_code(self):
  a=self.auth.start('http://127.0.0.1:1455/auth/callback')
  with self.assertRaises(ChatError):self.auth.finish({'attemptId':a['attemptId'],'state':'bad','clientId':'oaiapp_unit_test','code':'c'})
  self.assertEqual(self.calls,[])
  with self.assertRaises(ChatError):self.auth.finish({'attemptId':a['attemptId'],'state':a['state'],'clientId':'oaiapp_unit_test','code':'c'})
  self.login();a=self.auth.start('http://127.0.0.1:1455/auth/callback');count=len(self.calls)
  with self.assertRaises(ChatError):self.auth.finish({'attemptId':a['attemptId'],'state':a['state'],'clientId':'oaiapp_wrong_client','code':'c'})
  self.assertEqual(len(self.calls),count)
  a=self.auth.start('http://127.0.0.1:1455/auth/callback');self.auth.pending[a['attemptId']]['expires']=0
  with self.assertRaises(ChatError):self.auth.finish({'attemptId':a['attemptId'],'state':a['state'],'code':'c'})
 def test_valid_login_stores_private_credentials_but_never_returns_them_and_reuses_registration(self):
  status,a=self.login();self.assertTrue(status['connected']);self.assertFalse(status['includedOnlyConfirmed']);self.assertFalse(status['apiKeyFallback'])
  encoded=json.dumps(status);self.assertNotIn('oauth-access',encoded);self.assertNotIn('oauth-refresh',encoded);self.assertNotIn('id-token',encoded)
  profile=Path(self.tmp.name)/'chatgpt/account.json';self.assertEqual(profile.stat().st_mode&0o777,0o600)
  q=parse_qs(urlparse(self.auth.start('http://127.0.0.1:1999/auth/callback')['url']).query);self.assertEqual(q['client_id'],['oaiapp_unit_test']);self.assertNotIn('agent_name_hint',q);self.assertEqual(q['id_token_hint'],['id-token'])
  body=self.calls[0][1];self.assertEqual(body['client_id'],'oaiapp_unit_test');self.assertEqual(body['redirect_uri'],'http://127.0.0.1:1455/auth/callback');self.assertIn('code_verifier',body)
 def test_identity_alone_and_unconfirmed_credit_setting_cannot_make_inference_requests(self):
  self.tokens['scope']='openid email';status,_=self.login();self.assertTrue(status['linked']);self.assertFalse(status['connected'])
  with self.assertRaises(ChatError):self.auth.access_token()
  self.tokens['scope']=PLAN_SCOPE;self.login();before=len(self.calls)
  with self.assertRaises(ChatError):self.auth.models()
  self.assertEqual(len(self.calls),before);self.auth.confirm_included_only();self.assertEqual(self.auth.models(),[{'id':'test-model','name':'Test'}])
 def test_refreshes_are_serialized_and_no_api_key_fallback_is_used(self):
  self.login();self.auth.confirm_included_only();p=self.auth.read('account.json');p['expires_at']=0;self.auth.write('account.json',p)
  self.tokens.update(access_token='renewed',refresh_token='rotated');self.calls=[]
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(lambda _:self.auth.access_token(),range(4)))
  self.assertEqual(results,['renewed']*4);self.assertEqual(len(self.calls),1);self.assertEqual(self.auth.read('account.json')['refresh_token'],'rotated');self.assertEqual(self.calls[0][1]['grant_type'],'refresh_token')
 def test_failed_reauthorization_preserves_the_active_account(self):
  self.login();before=self.auth.read('account.json');self.auth.verify=lambda *args:(_ for _ in ()).throw(ChatError('identity','Invalid'))
  a=self.auth.start('http://127.0.0.1:1455/auth/callback',True)
  with self.assertRaises(ChatError):self.auth.finish({'attemptId':a['attemptId'],'state':a['state'],'clientId':'oaiapp_other_account','code':'c'})
  self.assertEqual(self.auth.read('account.json'),before)
 def test_disconnect_revokes_then_clears_tokens_but_keeps_mapping_and_host(self):
  self.login();host=self.auth.read('host.json');status=self.auth.disconnect();p=self.auth.read('account.json')
  self.assertTrue(status['remoteRevocationConfirmed']);self.assertFalse(status['connected']);self.assertNotIn('access_token',p);self.assertNotIn('refresh_token',p);self.assertEqual(p['client_id'],'oaiapp_unit_test');self.assertEqual(host,self.auth.read('host.json'))
 def test_id_token_signature_issuer_audience_expiry_and_nonce_are_really_checked(self):
  key=rsa.generate_private_key(public_exponent=65537,key_size=2048);self.auth.jwks=types.SimpleNamespace(get_signing_key_from_jwt=lambda _:types.SimpleNamespace(key=key.public_key()))
  claims={'iss':AUTH,'aud':'oaiapp_test','sub':'user','iat':time.time(),'exp':time.time()+600,'nonce':'correct'}
  token=lambda c:jwt.encode(c,key,algorithm='RS256')
  self.assertEqual(self.auth.verify_identity(token(claims),'oaiapp_test','correct')['sub'],'user')
  for changes in [{'iss':'https://evil.test'},{'aud':'wrong'},{'exp':time.time()-60},{'nonce':'wrong'},{'sub':''}]:
   with self.assertRaises(ChatError):self.auth.verify_identity(token({**claims,**changes}),'oaiapp_test','correct')
  other=rsa.generate_private_key(public_exponent=65537,key_size=2048)
  with self.assertRaises(ChatError):self.auth.verify_identity(jwt.encode(claims,other,algorithm='RS256'),'oaiapp_test','correct')

 def test_account_switching_keeps_verified_registrations_separate(self):
  self.login();self.auth.confirm_included_only();first=self.auth.read('account.json');self.auth.verify=lambda *args:{'sub':'other-user','email':'other@example.test','name':'Andere account'}
  a=self.auth.start('http://127.0.0.1:1455/auth/callback',True);self.auth.finish({'attemptId':a['attemptId'],'state':a['state'],'clientId':'oaiapp_second_account','code':'c'})
  accounts=self.auth.accounts()['accounts'];self.assertEqual(len(accounts),2);self.assertNotIn('oauth-access',json.dumps(accounts));self.auth.select_account(first['client_id']);self.assertEqual(self.auth.read('account.json')['subject'],'user-1');self.assertTrue(self.auth.status()['includedOnlyConfirmed'])
 def test_cancelled_attempts_do_not_block_further_login_or_change_credentials(self):
  for i in range(8):
   a=self.auth.start('http://127.0.0.1:1455/auth/callback');self.auth.cancel(a['attemptId'])
  self.assertEqual(self.auth.pending,{});self.assertFalse(self.auth.status()['connected'])
