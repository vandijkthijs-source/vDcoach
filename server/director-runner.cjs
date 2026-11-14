const fs=require('fs');
const {focusPlan}=require('./director/focus-planner.cjs');
const {decisionInbox,dayFacts,lifeSignals}=require('./director/director.cjs');
try{const {state,date,now}=JSON.parse(fs.readFileSync(0,'utf8'));const at=new Date(now||Date.now());if(!Number.isFinite(at.getTime()))throw Error('Invalid time');const d=state.days[date];console.log(JSON.stringify({date,engineVersion:'2.0.0',source:'saved-server-data',sourceChecksFresh:!!d?.plan,plan:focusPlan(state,date,at),decisions:decisionInbox(state,date),facts:dayFacts(state,date),signals:lifeSignals(state,date),warning:d?.plan?null:'Geen nieuw ochtendplan; externe bronnen zijn niet opnieuw gecontroleerd.'}));}catch(e){console.error('Director input invalid');process.exitCode=1;}
