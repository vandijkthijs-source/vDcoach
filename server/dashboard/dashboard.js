'use strict';
let snapshot, pendingImport, loading=false;
const $=id=>document.getElementById(id);
const stamp=n=>n?new Date(n*1000).toLocaleString('nl-NL'):'Nog niet';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
$('date').value=today();
function notify(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'';$('notice').hidden=false;}
async function api(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:{'X-vDcoach-UI':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error(result.error||'Server niet bereikbaar');return result;}
function empty(target,message){target.replaceChildren();const e=document.createElement('div');e.className='empty';e.textContent=message;target.append(e);}
function line(target,title,detail,done,onToggle){const row=document.createElement('div');row.className='row';if(onToggle){const check=document.createElement('input');check.type='checkbox';check.checked=done;check.setAttribute('aria-label',title);check.addEventListener('change',()=>onToggle(check));row.append(check);}const body=document.createElement('div');body.className='text';const text=document.createElement('span');text.textContent=title;if(done)text.className='completed';body.append(text);if(detail){const small=document.createElement('small');small.textContent=detail;body.append(small);}row.append(body);target.append(row);}
function render(){const expanded=new Set(Array.from(document.querySelectorAll('#tasks details[open]')).map(e=>e.querySelector('summary')?.textContent));const date=$('date').value,day=snapshot.state.days[date];$('day-heading').textContent=new Date(date+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'long',day:'numeric',month:'long'});$('revision').textContent='Revisie '+snapshot.revision;const tasks=day?.tasks.filter(t=>t.category!=='Appointment')||[];$('task-count').textContent=`${tasks.filter(t=>t.done).length} / ${tasks.length} klaar`;
for(const id of ['tasks','diary-items','food-items'])$(id).replaceChildren();
if(!tasks.length)empty($('tasks'),'Nog even ruimte voor een nieuw plan. Zodra je coach het opslaat, verschijnt het hier.');
for(const [label,group] of [['Taken',tasks.filter(t=>!t.done&&t.category!=='Habit')],['Gewoontes',tasks.filter(t=>!t.done&&t.category==='Habit')],['Afgerond',tasks.filter(t=>t.done)]]){
 if(!group.length)continue;
 let target=$('tasks');const heading=document.createElement(label==='Afgerond'?'summary':'h4');heading.className='task-section-title';heading.textContent=label+' · '+group.length;
 if(label==='Afgerond'){const details=document.createElement('details');details.className='completed-group';details.append(heading);target.append(details);target=details;}else target.append(heading);
 for(const task of group){
 const row=document.createElement('div');row.className='row';
 const check=document.createElement('input');check.type='checkbox';check.checked=task.done;check.disabled=!!day.closed;check.setAttribute('aria-label',task.shortTitle||task.title);
 check.onchange=async()=>{check.disabled=true;try{await change({action:'set_task_done',id:task.id,done:check.checked});}catch(e){notify(e.message,true);await load();}finally{check.disabled=!!day.closed;}};
 const body=document.createElement('div');body.className='text';
 const detail=task.comment||((task.shortTitle&&task.title!==task.shortTitle)?task.title:'');
 if(detail){const disclosure=document.createElement('details');const summary=document.createElement('summary');summary.textContent=task.shortTitle||task.title;const more=document.createElement('p');more.className='task-detail';more.textContent=detail;disclosure.append(summary,more);body.append(disclosure);}else body.textContent=task.shortTitle||task.title;
 if(task.done)body.classList.add('completed');row.append(check,body);target.append(row);
 }
}

for(const detail of document.querySelectorAll('#tasks details'))if(expanded.has(detail.querySelector('summary')?.textContent))detail.open=true;
const diary=[...(day?.diaryEntries||(day?.notes?.trim()?[{id:'legacy-notes',text:day.notes,done:false}]:[]))];const removed=new Set(day?.removedDiaryIds||[]);for(const a of day?.plan?.appointments||[]){if(removed.has('agenda-'+a.id)||diary.some(e=>e.id==='agenda-'+a.id||e.appointmentId===a.id))continue;diary.push({text:a.title,time:new Date(a.start).toLocaleTimeString('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit'}),done:false});}
if(!diary.length)empty($('diary-items'),'Een lege dag, klaar voor jouw verhaal.');else for(const entry of diary.filter(e=>!removed.has(e.id)))line($('diary-items'),entry.text,[entry.time,entry.done?'Uitgevoerd':'Gepland / niet afgevinkt'].filter(Boolean).join(' · '),entry.done);
const food=day?.foodEntries??(day?.foodNotes?day.foodNotes.split('\n').filter(Boolean).map(text=>({text})):(day?.meals||[]));if(!food.length)empty($('food-items'),'Nog geen voeding geregistreerd.');else for(const entry of food)line($('food-items'),entry.text,'Door jou ingevoerd',false);
for(const id of ['diary-form','food-form'])for(const el of $(id).elements)el.disabled=!!day?.closed;
}
async function load(){if(loading)return;loading=true;try{const [data,status,register]=await Promise.all([api('/state'),api('/status'),api('/applications')]);snapshot=data;renderApplications(register);$('library-count').textContent=status.documents;renderBackup(status.driveBackup);$('health').textContent='Online';$('health').className='';$('uptime').textContent=`${Math.floor(status.uptime/60)} minuten actief`;$('day-count').textContent=status.days;$('last-sync').textContent=status.updatedAt?'Bijgewerkt '+stamp(status.updatedAt):'Nog geen voortgang ontvangen';$('backup-count').textContent=status.backups;$('last-backup').textContent='Laatste: '+stamp(status.lastBackup);$('server-url').value=status.serverUrl;const tunnel=status.tunnel||{};const labels={not_configured:['Voorbereid','Tunnel-ID nog nodig'],needs_key:['Sleutel nodig','Open vDcoach Connect ChatGPT'],pending:['Wachten','Tunnel nog niet gereed'],ready:['Tunnel gereed','Test de plugin in ChatGPT']};const label=tunnel.state==='ready'&&status.chatgpt==='verified'?['Verbonden','Privétunnel actief']:labels[tunnel.state]||labels.not_configured;$('plugin-status').textContent=label[0];$('plugin-note').textContent=label[1];$('tunnel-detail').textContent=(tunnel.id?'Tunnel: '+tunnel.id+'. ':'')+label[1]+'. Er zijn geen publieke poorten geopend.';$('audit').replaceChildren();if(!status.audit.length)empty($('audit'),'De server is klaar. Nieuwe wijzigingen verschijnen hier.');for(const event of status.audit){const row=document.createElement('div');row.className='log';const action=document.createElement('b');action.textContent=({publish_plan:'Nieuw dagplan opgeslagen',sync:'Voortgang gesynchroniseerd',add_diary:'Dagboek bijgewerkt',add_food:'Voeding toegevoegd',set_task_done:'Taak bijgewerkt'})[event.action]||event.action;const meta=document.createElement('span');meta.textContent=`${event.source} · ${stamp(event.at)} · r${event.revision}`;row.append(action,meta);$('audit').append(row);}render();}catch(e){$('health').textContent='Niet bereikbaar';notify(e.message,true);}finally{loading=false;}}
async function change(args){snapshot=await api('/progress',{...args,date:$('date').value,revision:snapshot.revision});render();await load();}
function showTab(tab){if(['diary','food','applications'].includes(tab))tab='overview';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.panel').forEach(panel=>panel.hidden=panel.id!==tab);const titles={overview:['Overzicht','Je dag en je gegevens, op één plek.'],diary:['Een dag om te bewaren.','Plannen, beleven en vastleggen. In je eigen volgorde.'],food:['Goed voor jezelf.','Je voeding, zoals je het zelf hebt bijgehouden.'],applications:['Jouw volgende hoofdstuk.','Overzicht in de kansen die bij je passen.'],library:['Bestanden','Je documenten, geordend per map.'],connection:['Alles blijft verbonden.','Je telefoon, je coach en je eigen plek voor gegevens.']};$('server-stats').hidden=tab!=='overview';$('heading').textContent=titles[tab][0];$('page-subtitle').textContent=titles[tab][1];document.querySelector('.datebar').hidden=tab!=='overview';}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.open)));
$('date').addEventListener('change',()=>{if($('date').value&&snapshot)render();});$('refresh').addEventListener('click',load);
for(const kind of ['diary','food'])$(kind+'-form').addEventListener('submit',async event=>{event.preventDefault();if(!snapshot)return;const form=event.target,data=new FormData(form),button=form.querySelector('button');button.disabled=true;try{await change({action:'add_'+kind,id:crypto.randomUUID(),text:data.get('text'),...(kind==='diary'?{startTime:data.get('startTime')||'',endTime:data.get('endTime')||'',done:data.has('done')}:{})});form.reset();notify('Opgeslagen op je server.');}catch(e){notify(e.message,true);await load();}finally{button.disabled=!!snapshot?.state.days[$('date').value]?.closed;}});
$('import').addEventListener('change',async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('Het bestand is groter dan 5 MB.');const data=JSON.parse(await file.text());if(data.version!==1||!data.days||typeof data.days!=='object'||Array.isArray(data.days)||typeof data.coachUrl!=='string')throw Error('Dit is geen vDcoach-export.');pendingImport=data;const box=$('import-preview');box.replaceChildren();box.hidden=false;const text=document.createElement('p');text.textContent=`${Object.keys(data.days).length} dagen gevonden. Importeer deze naar de server?`;const button=document.createElement('button');button.textContent='Bevestig import';button.addEventListener('click',async()=>{button.disabled=true;try{const latest=await api('/state');const overlap=Object.keys(pendingImport.days).filter(date=>date in latest.state.days&&JSON.stringify(pendingImport.days[date])!==JSON.stringify(latest.state.days[date]));if(overlap.length)throw Error('Import gestopt: bestaande dagen verschillen: '+overlap.join(', ')+'. Beide versies zijn bewaard.');snapshot=await api('/state',{revision:latest.revision,state:{...latest.state,days:{...latest.state.days,...pendingImport.days}}});box.hidden=true;notify('Back-up geïmporteerd.');await load();}catch(e){notify(e.message,true);button.disabled=false;}});box.append(text,button);}catch(e){notify(e.message,true);}event.target.value='';});
load();setInterval(()=>{if(!document.hidden)load();},15000);

let documents=[], openDocument=null;
function renderBackup(status){$('backup-summary-text').textContent=status?.state==='verified'?'Versleuteld op Drive. Teruggelezen en succesvol hersteld.':status?.message||'Drive wordt gecontroleerd.';$('drive-backup-status').textContent=(status?.message||'Google Drive nog koppelen')+(status?.lastSuccess?' · Laatste geslaagde hersteltest: '+new Date(status.lastSuccess).toLocaleString('nl-NL'):'');}
async function loadDocuments(){try{documents=(await api('/library?q='+encodeURIComponent($('document-search').value))).documents;renderDocuments();}catch(e){notify(e.message,true);}}
let folderPaths=[];
function folderParts(path){return (path||'').split('/').filter(Boolean);}
function renderDocuments(){
 const selected=$('document-folder').value, searching=!!$('document-search').value.trim();
 const current=selected==='*'?'':selected;
 const list=$('document-list'),grid=$('folder-grid'),crumb=$('folder-breadcrumb');
 list.replaceChildren();grid.replaceChildren();crumb.replaceChildren();
 function navigate(path){if(!Array.from($('document-folder').options).some(o=>o.value===path)){const o=new Option(path,path);$('document-folder').add(o);}$('document-folder').value=path;renderDocuments();}
 function breadcrumb(label,path){const b=document.createElement('button');b.className='crumb';b.textContent=label;b.onclick=()=>navigate(path);crumb.append(b);}
 breadcrumb('Alle bestanden','*');
 const parts=folderParts(current);parts.forEach((name,i)=>{const sep=document.createElement('span');sep.textContent='/';crumb.append(sep);breadcrumb(name,parts.slice(0,i+1).join('/'));});
 const paths=new Set([...folderPaths,...documents.map(d=>d.folder||'')]);
 const children=new Map();
 if(!searching){for(const path of paths){const p=folderParts(path);if(p.length<=parts.length||!parts.every((v,i)=>p[i]===v))continue;const child=p.slice(0,parts.length+1).join('/');children.set(child,p[parts.length]);}}
 for(const [path,name] of [...children].sort((a,b)=>a[1].localeCompare(b[1],'nl'))){
 const b=document.createElement('button');b.className='folder-card';
 const icon=document.createElement('span');icon.className='folder-icon';icon.setAttribute('aria-hidden','true');
 const title=document.createElement('strong');title.textContent=name;
 const count=documents.filter(d=>d.folder===path||(d.folder||'').startsWith(path+'/')).length;
 const detail=document.createElement('small');detail.textContent=count+' bestanden';
 b.append(icon,title,detail);b.onclick=()=>navigate(path);grid.append(b);
 }
 const filtered=documents.filter(d=>searching?(selected==='*'||d.folder===current||(d.folder||'').startsWith(current+'/')):(d.folder||'')===current);
 $('document-count').textContent=documents.length+' bestanden';$('visible-count').textContent=filtered.length;
 $('files-label').textContent=searching?'Zoekresultaten':(children.size?'Bestanden in deze map':'Bestanden');
 for(const doc of filtered){const button=document.createElement('button');button.className='document-button';
 const icon=document.createElement('span');icon.className='file-icon';icon.textContent=/sheet|spreadsheet|excel/i.test(doc.mimeType||doc.title)?'▦':/pdf/i.test(doc.mimeType||doc.title)?'PDF':'≡';
 const body=document.createElement('span');body.className='file-body';const title=document.createElement('strong');title.textContent=doc.title;
 const detail=document.createElement('small');detail.textContent=(searching?(doc.folder||'Hoofdmap')+' · ':'')+new Intl.NumberFormat('nl-NL').format(doc.characters||0)+' tekens';body.append(title,detail);
 const arrow=document.createElement('span');arrow.className='file-arrow';arrow.textContent='↗';button.append(icon,body,arrow);button.onclick=()=>openDoc(doc.id);list.append(button);}
 if(!filtered.length&&!children.size)empty(list,searching?'Geen bestanden gevonden.':'Deze map bevat nog geen bestanden.');
}
async function openDoc(id){if(openDocument&&$('document-text').value!==openDocument.text&&!confirm('Niet-opgeslagen wijzigingen verlaten?'))return;try{openDocument=await api('/document?id='+encodeURIComponent(id));$('document-editor').hidden=false;$('document-title').textContent=openDocument.title;$('document-source').textContent='Geïmporteerd: '+new Date(openDocument.importedAt).toLocaleString('nl-NL')+' · '+(openDocument.folder||'Hoofdmap');$('document-text').value=openDocument.text;$('document-download').href='/document-original?id='+encodeURIComponent(id);$('document-editor').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){notify(e.message,true);}}
let documentSearchTimer;$('document-search').addEventListener('input',()=>{clearTimeout(documentSearchTimer);documentSearchTimer=setTimeout(loadDocuments,250);});
$('document-save').addEventListener('click',async()=>{if(!openDocument)return;const button=$('document-save');button.disabled=true;try{openDocument=await api('/document',{id:openDocument.id,text:$('document-text').value,revision:openDocument.revision});notify('Dossier op de server opgeslagen. Vorige tekstversie bewaard.');await loadDocuments();}catch(e){notify(e.message,true);}finally{button.disabled=false;}});
loadDocuments();

$('document-folder').addEventListener('change',renderDocuments);
api('/folders').then(result=>{folderPaths=result.folders;for(const path of result.folders){const option=document.createElement('option');option.value=path;option.textContent=result.name+(path?' / '+path:'');$('document-folder').append(option);}renderDocuments();}).catch(error=>notify(error.message,true));

function renderApplications(register){const jobs=register.applications||[];$('applications-count').textContent=jobs.length;$('applications-note').textContent=jobs.length?'Met bron en peildatum':'Dossiers beschikbaar voor je coach';$('application-items').replaceChildren();if(!jobs.length){empty($('application-items'),'Je sollicitatiedossiers staan klaar. De coach neemt de bevestigde statussen over naar dit overzicht.');return;}for(const job of [...jobs].sort((a,b)=>(a.nextActionDate||'9999').localeCompare(b.nextActionDate||'9999'))){const card=document.createElement('article');card.className='application-card';const title=document.createElement('h4');title.textContent=job.company+' · '+job.role;const status=document.createElement('span');status.className='pill';status.textContent=job.status;const action=document.createElement('p');action.textContent=[job.nextActionDate,job.nextAction].filter(Boolean).join(' · ');const evidence=document.createElement('small');evidence.textContent='Stand per '+job.asOfDate+' · '+job.evidence;card.append(title,status,action,evidence);$('application-items').append(card);}}

$('document-close').onclick=()=>{if(openDocument&&$('document-text').value!==openDocument.text&&!confirm('Niet-opgeslagen wijzigingen verlaten?'))return;$('document-editor').hidden=true;openDocument=null;};
for(const [id,offset] of [['previous-day',-1],['next-day',1]])$(id).onclick=()=>{const d=new Date($('date').value+'T12:00:00');d.setDate(d.getDate()+offset);$('date').value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(snapshot)render();};
$('today-button').onclick=()=>{$('date').value=today();if(snapshot)render();};

showTab('library');
