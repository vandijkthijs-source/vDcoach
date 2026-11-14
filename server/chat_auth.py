"""Official Sign in with ChatGPT, personal self-hosted runtime. No API keys/fallback."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import threading
import time
from urllib.parse import urlencode, urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
import uuid
import jwt

AUTH='https://auth.openai.com'
RESOURCE='https://api.openai.com/v1'
PLAN_SCOPE='chatgpt.tokens.use.direct'

class ChatError(ValueError):
    def __init__(self,code,message,status=400):
        super().__init__(message); self.code,self.status=code,status

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def public_error(code,status=503):
    errors={
      'subscription_sharing_usage_limit_exceeded':('Je ChatGPT-gebruikslimiet is bereikt. Bekijk Gebruik in ChatGPT; er wordt geen betaalde terugval gestart.',429),
      'subscription_sharing_user_not_eligible':('Deze ChatGPT-account of werkruimte ondersteunt dit gebruik niet. Je gegevens blijven bewaard.',403),
      'subscription_sharing_usage_unavailable':('ChatGPT kan je abonnementsruimte nu niet controleren. Probeer later opnieuw.',503),
      'subscription_sharing_user_unavailable':('Je ChatGPT-account is tijdelijk niet bereikbaar. Probeer later opnieuw.',503),
      'subscription_sharing_unsupported_capability':('Deze aanvraag wordt niet ondersteund door je ChatGPT-abonnement.',400),
      'subscription_sharing_route_not_supported':('De abonnementsroute is voor deze verbinding niet beschikbaar.',403),
      'chatpass_v2_scope_not_authorized':('Geef toestemming om je ChatGPT-abonnement te gebruiken.',403),
      'subscription_sharing_invalid_user':('Meld je opnieuw aan bij ChatGPT.',401),
      'invalid_grant':('Je ChatGPT-aanmelding is verlopen. Meld je opnieuw aan.',401),
      'invalid_client':('De ChatGPT-aanmelding kon niet worden geverifieerd. Meld je opnieuw aan.',401),
    }
    message,http=errors.get(code,('ChatGPT is tijdelijk niet beschikbaar. Je gesprek blijft bewaard.',status))
    return ChatError(code,message,http)

def network_json(url,body=None,form=False,token=None):
    # Only fixed official destinations; no credential-bearing redirects.
    if not (url.startswith(AUTH+'/') or url.startswith(RESOURCE+'/')): raise ChatError('invalid_destination','Ongeldige aanmeldbestemming.')
    headers={'Accept':'application/json'}
    data=None
    if body is not None:
        headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
        data=(urlencode(body) if form else json.dumps(body)).encode()
    if token:headers['Authorization']='Bearer '+token
    try:
        with build_opener(NoRedirect()).open(Request(url,data=data,headers=headers),timeout=25) as response:
            raw=response.read(2*1024*1024+1)
            if len(raw)>2*1024*1024:raise ChatError('response_large','Ongeldig antwoord van ChatGPT.')
            return json.loads(raw) if raw else {}
    except HTTPError as error:
        try:
            body=json.loads(error.read(65536));detail=body.get('error',{});code=detail.get('code',detail.get('type','request_failed')) if isinstance(detail,dict) else str(detail)
        except Exception:code='request_failed'
        finally:error.close()
        raise public_error(code,error.code if error.code in (400,401,403,429,503) else 503) from None
    except (URLError,TimeoutError,OSError,json.JSONDecodeError):
        raise ChatError('network','ChatGPT is niet bereikbaar. Probeer later opnieuw.',503) from None

class ChatAuth:
    def __init__(self,root,request=network_json,verifier=None):
        self.root=Path(root)/'chatgpt';self.root.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(self.root,0o700)
        self.request=request;self.lock=threading.RLock();self.pending={};self.verify=verifier or self.verify_identity
        self.jwks=jwt.PyJWKClient(AUTH+'/.well-known/jwks.json',cache_keys=True,lifespan=3600,timeout=15)
        if not (self.root/'host.json').exists():self.write('host.json',{'id':'urn:uuid:'+str(uuid.uuid4())})
    def read(self,name):
        try:return json.loads((self.root/name).read_text())
        except FileNotFoundError:return {}
    def write(self,name,body):
        fd,path=tempfile.mkstemp(prefix='.auth-',dir=self.root)
        try:
            os.fchmod(fd,0o600)
            with os.fdopen(fd,'w') as f:json.dump(body,f);f.flush();os.fsync(f.fileno())
            os.replace(path,self.root/name)
        finally:
            if os.path.exists(path):os.unlink(path)
    def save_account(self,profile):
        previous=self.read('account.json')
        for p in (previous,profile):
            if p.get('subject') and p.get('client_id'):
                name='saved-'+hashlib.sha256(p['client_id'].encode()).hexdigest()+'.json'
                self.write(name,p)
        self.write('account.json',profile)
    def accounts(self):
        with self.lock:
            active=self.read('account.json').get('client_id');rows=[]
            for f in self.root.glob('saved-*.json'):
                p=self.read(f.name)
                if p.get('subject') and p.get('client_id'):rows.append({'id':p['client_id'],'name':p.get('name',''),'email':p.get('email',''),'active':p['client_id']==active})
            return {'accounts':rows}
    def select_account(self,client_id):
        if not isinstance(client_id,str) or not 0<len(client_id)<=200:raise ChatError('account','Ongeldige account.')
        with self.lock:
            profile=self.read('saved-'+hashlib.sha256(client_id.encode()).hexdigest()+'.json')
            if profile.get('client_id')!=client_id or not profile.get('subject'):raise ChatError('account','Deze account is niet opgeslagen.')
            self.save_account(profile);return self.status()
    def status(self):
        with self.lock:
            p=self.read('account.json');linked=bool(p.get('subject'));connected=bool(p.get('access_token') and PLAN_SCOPE in p.get('scopes',[]))
            return {'linked':linked,'connected':connected,'account':{'email':p.get('email',''),'name':p.get('name','')} if linked else None,'includedOnlyConfirmed':bool(p.get('includedOnlyConfirmed')),'usageUrl':'https://chatgpt.com/settings/usage','billing':'chatgpt_plan_only','apiKeyFallback':False}
    def start(self,redirect_uri,new_account=False):
        u=urlparse(redirect_uri)
        try:port=u.port
        except ValueError:port=None
        if u.scheme!='http' or u.hostname!='127.0.0.1' or not port or u.path!='/auth/callback' or u.query or u.fragment or u.username or u.password:raise ChatError('callback','Gebruik de beveiligde aanmeldknop in de Android-app.')
        with self.lock:
            self.pending={k:v for k,v in self.pending.items() if v['expires']>time.time()}
            if len(self.pending)>=5:raise ChatError('auth_busy','Rond de vorige aanmelding eerst af.',409)
            p={} if new_account else self.read('account.json') or self.read('registration.json')
            state,nonce,verifier=secrets.token_urlsafe(32),secrets.token_urlsafe(32),secrets.token_urlsafe(64)
            attempt=secrets.token_urlsafe(32);client=p.get('client_id','dynamic_agent_client')
            query={'client_id':client,'ext_agent_host_id':self.read('host.json')['id'],'response_type':'code','redirect_uri':redirect_uri,'scope':'openid profile email offline_access resource.invoke '+PLAN_SCOPE,'resource':RESOURCE,'state':state,'nonce':nonce,'code_challenge_method':'S256','code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')}
            if client=='dynamic_agent_client':query['agent_name_hint']='vDcoach'
            else:
                if p.get('id_token'):query['id_token_hint']=p['id_token']
                if p.get('email'):query['login_hint']=p['email']
            self.pending[attempt]={'expires':time.time()+600,'state':state,'nonce':nonce,'verifier':verifier,'redirect':redirect_uri,'client_id':client,'subject':p.get('subject')}
            return {'attemptId':attempt,'state':state,'url':AUTH+'/api/accounts/authorize?'+urlencode(query),'expiresIn':600}
    def verify_identity(self,token,client_id,nonce=None):
        try:
            key=self.jwks.get_signing_key_from_jwt(token).key
            claims=jwt.decode(token,key,algorithms=['RS256','ES256','EdDSA'],audience=client_id,issuer=AUTH,leeway=5,options={'require':['sub','exp','iat']})
            if not isinstance(claims.get('sub'),str) or not claims['sub']:raise ValueError()
            if nonce is not None and (not isinstance(claims.get('nonce'),str) or not hmac.compare_digest(claims['nonce'],nonce)):raise ValueError()
            return claims
        except Exception:raise ChatError('identity','De ChatGPT-identiteit kon niet worden geverifieerd. Meld je opnieuw aan.',401) from None
    def cancel(self,attempt_id):
        with self.lock:self.pending.pop(attempt_id,None)
        return {'cancelled':True}
    def finish(self,args):
        with self.lock:
            attempt=self.pending.pop(args.get('attemptId',''),None)
            if not attempt or attempt['expires']<time.time() or not isinstance(args.get('state'),str) or not hmac.compare_digest(args['state'],attempt['state']):raise ChatError('state','Deze aanmelding is verlopen of ongeldig. Probeer opnieuw.',401)
            if args.get('error'):raise ChatError('access_denied','De ChatGPT-aanmelding is geannuleerd. Je bestaande gegevens zijn behouden.',403)
            client=args.get('clientId') or (attempt['client_id'] if attempt['client_id']!='dynamic_agent_client' else '')
            if not isinstance(client,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,200}',client) or client=='dynamic_agent_client' or (attempt['client_id']!='dynamic_agent_client' and client!=attempt['client_id']):raise ChatError('client','De ChatGPT-registratie kon niet worden gecontroleerd.',401)
            code=args.get('code')
            if not isinstance(code,str) or not 0<len(code)<=8192:raise ChatError('code','De aanmelding bevat geen geldige code.')
            # Retain an issued registration even if the one-time code expires.
            self.write('registration.json',{'client_id':client})
            tokens=self.request(AUTH+'/api/accounts/oauth/token',{'grant_type':'authorization_code','client_id':client,'code':code,'code_verifier':attempt['verifier'],'redirect_uri':attempt['redirect'],'resource':RESOURCE},form=True)
            claims=self.verify(tokens.get('id_token',''),client,attempt['nonce'])
            if attempt.get('subject') and claims['sub']!=attempt['subject']:raise ChatError('account_changed','Dit is een andere ChatGPT-account. Kies eerst Andere account.',401)
            scopes=tokens.get('scope','').split();active=PLAN_SCOPE in scopes and isinstance(tokens.get('access_token'),str)
            profile={'client_id':client,'subject':claims['sub'],'email':claims.get('email',''),'name':claims.get('name',''),'scopes':scopes,'id_token':tokens.get('id_token',''),'expires_at':time.time()+min(604800,max(1,int(tokens.get('expires_in',3600)))),'includedOnlyConfirmed':False}
            if active:profile.update({k:tokens[k] for k in ('access_token','refresh_token') if isinstance(tokens.get(k),str)})
            self.save_account(profile)
            return self.status()
    def confirm_included_only(self):
        with self.lock:
            p=self.read('account.json')
            if not self.status()['connected']:raise ChatError('sign_in_required','Meld je eerst aan met ChatGPT.',401)
            p['includedOnlyConfirmed']=True;self.save_account(p);return self.status()
    def access_token(self):
        with self.lock:
            p=self.read('account.json')
            if not p.get('access_token') or PLAN_SCOPE not in p.get('scopes',[]):raise ChatError('sign_in_required','Verbind eerst je ChatGPT-account.',401)
            if not p.get('includedOnlyConfirmed'):raise ChatError('usage_settings','Controleer eerst dat extra credits uitstaan in ChatGPT.',409)
            if p.get('expires_at',0)<=time.time()+60:
                if not p.get('refresh_token'):raise ChatError('sign_in_required','Meld je opnieuw aan bij ChatGPT.',401)
                try:t=self.request(AUTH+'/api/accounts/oauth/token',{'grant_type':'refresh_token','client_id':p['client_id'],'refresh_token':p['refresh_token'],'resource':RESOURCE},form=True)
                except ChatError as error:
                    if error.code in ('invalid_grant','invalid_refresh_token','token_expired','refresh_token_expired','refresh_token_invalidated','refresh_token_reused'):
                        for k in ('access_token','refresh_token','id_token'):p.pop(k,None)
                        self.save_account(p)
                    raise
                if not isinstance(t.get('access_token'),str):raise ChatError('refresh','Je ChatGPT-aanmelding kon niet worden vernieuwd.',401)
                if t.get('id_token'):
                    claims=self.verify(t['id_token'],p['client_id'])
                    if claims['sub']!=p['subject']:raise ChatError('account_changed','De ChatGPT-account is gewijzigd.',401)
                scopes=t.get('scope',' '.join(p['scopes'])).split()
                if PLAN_SCOPE not in scopes:raise ChatError('permission','Toestemming voor ChatGPT-gebruik ontbreekt.',403)
                p.update({k:t[k] for k in ('access_token','refresh_token','id_token') if isinstance(t.get(k),str)})
                p.update(scopes=scopes,expires_at=time.time()+min(604800,max(1,int(t.get('expires_in',3600)))));self.save_account(p)
            return p['access_token']
    def models(self):
        data=self.request(RESOURCE+'/models',token=self.access_token())
        models=data.get('models',[])
        if not isinstance(models,list):raise ChatError('models','Geen modellen voor deze ChatGPT-verbinding beschikbaar.',503)
        result=[{'id':m['slug'],'name':m.get('display_name',m['slug'])} for m in models if isinstance(m,dict) and m.get('visibility')=='list' and isinstance(m.get('slug'),str)]
        return result
    def disconnect(self):
        with self.lock:
            p=self.read('account.json');revoked=True
            if p.get('refresh_token'):
                try:
                    discovery=self.request(AUTH+'/.well-known/openid-configuration');endpoint=discovery.get('revocation_endpoint','')
                    if not endpoint.startswith(AUTH+'/'):raise ValueError()
                    self.request(endpoint,{'token':p['refresh_token'],'token_type_hint':'refresh_token','client_id':p['client_id']},form=True)
                except Exception:revoked=False
            for k in ('access_token','refresh_token','id_token'):p.pop(k,None)
            p['includedOnlyConfirmed']=False;self.save_account(p);self.pending.clear()
            return {**self.status(),'remoteRevocationConfirmed':revoked}
