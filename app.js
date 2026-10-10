'use strict';
/* ---------- Data ---------- */
const KEY='budsjett-v1';
const CATS={ // t: inc=inntekt, ign=ignoreres, fix=fast, var=variabel
  'Inntekt':'inc','Overføring':'ign',
  'Bolig':'fix','Strøm':'fix','Abonnement':'fix','Forsikring':'fix','Lån':'fix','Telefon/internett':'fix',
  'Mat':'var','Restaurant':'var','Transport':'var','Helse':'var','Shopping':'var','Fritid':'var','Annet':'var'};
const VARS=Object.keys(CATS).filter(c=>CATS[c]==='var');
const FIXC=Object.keys(CATS).filter(c=>CATS[c]==='fix');
const KEYWORDS=[
 ['Overføring',/trumf visa|betaling kort|innbetaling kort|overføring mellom|egen konto|til konto|fra konto|kortbetaling fra/i],
 ['Inntekt',/l[øo]nn|salary|trygd|nav |barnetrygd|utbytte|skatteoppgj/i],
 ['Mat',/rema|kiwi|coop|extra|obs|meny|spar |bunnpris|joker|nærbutikk|matkroken|trumf|oda\.com|foodora market/i],
 ['Restaurant',/restaurant|kafe|kafé|café|cafe|starbucks|espresso|pizza|burger|sushi|wolt|foodora|just eat|mcdonald|peppes|bakeri|7-eleven|pub|bar /i],
 ['Transport',/circle k|esso|shell|yx|uno-x|ruter|atb|skyss|kolumbus|vy |flytoget|bompeng|autopass|easypark|parkering|taxi|uber|bolt|sas |norwegian|widerøe/i],
 ['Strøm',/tibber|fjordkraft|hafslund|fortum|ishavskraft|strøm|elvia|bkk|lyse/i],
 ['Telefon/internett',/telenor|telia|ice |talkmore|fastsetter|get as|altibox|canal digital|homenet/i],
 ['Abonnement',/netflix|spotify|hbo|max |disney|viaplay|youtube|apple\.com|icloud|google|storytel|amazon prime|nrk|vg\+|aftenposten|dropbox|chatgpt|openai|anthropic/i],
 ['Forsikring',/gjensidige|tryg|\bif skade|fremtind|storebrand|sparebank 1 forsikring|forsikring/i],
 ['Bolig',/husleie|felleskostnad|sameie|borettslag|kommunale|renovasjon|boligkreditt/i],
 ['Lån',/lån|renter|rente |avdrag|termin|kreditt/i],
 ['Helse',/apotek|vitus|boots|lege|tannlege|fysio|helse|optiker|specsavers/i],
 ['Shopping',/h&m|zara|ikea|elkjøp|power|xxl|clas ohlson|jula|komplett|amazon|zalando|kappahl|lindex|jysk|biltema|norli/i],
 ['Fritid',/kino|sats|evo |trening|steam|playstation|nintendo|ticketmaster|billett|hotell|booking|airbnb|spill/i]];

function load(){try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.tx)return s}catch(e){}return fresh()}
function fresh(){return{people:['Meg','Partner'],me:0,income:0,saving:0,tx:[],fixed:[],loans:[],limits:{},rules:{},accounts:[],apiKey:'',chat:[],lastNotify:''}}
let S=load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){note('Kunne ikke lagre. Lagringsplassen i nettleseren kan være full.')}}

/* ---------- Dialog og meldinger i siden (alert/confirm fungerer ikke overalt) ---------- */
function note(msg){
  const el=document.createElement('div');el.className='toast';el.textContent=msg;document.body.appendChild(el);
  setTimeout(()=>el.remove(),5000);
}
function yes(msg){
  return new Promise(res=>{
    const o=document.createElement('div');o.className='overlay';
    o.innerHTML='<div class="dlg" role="dialog" aria-modal="true"><p></p><div class="row" style="justify-content:flex-end"><button class="btn" id="dn">Avbryt</button><button class="btn p" id="dy">OK</button></div></div>';
    o.querySelector('p').textContent=msg;document.body.appendChild(o);
    const done=v=>{o.remove();res(v)};
    o.querySelector('#dy').onclick=()=>done(true);o.querySelector('#dn').onclick=()=>done(false);o.querySelector('#dy').focus();
  });
}
/* ---------- Hjelpere ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kr=n=>Math.round(n).toLocaleString('nb-NO')+' kr';
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr=()=>ymd(new Date());
const ymOf=s=>s.slice(0,7);
const daysIn=ym=>new Date(+ym.slice(0,4),+ym.slice(5,7),0).getDate();
const monthName=ym=>new Date(+ym.slice(0,4),+ym.slice(5,7)-1,1).toLocaleDateString('nb-NO',{month:'long',year:'numeric'});
const uid=()=>Math.random().toString(36).slice(2,9);
const hash=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)};
const num=v=>{const n=parseFloat(String(v).replace(/\s/g,'').replace(',','.'));return isNaN(n)?0:n};
let view='home',month=ymOf(todayStr()),search='';

function merchantKey(desc){return desc.toUpperCase().replace(/[0-9*#.,\/\\_-]+/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,2).join(' ')}
function categorize(desc,amount){
  const mk=merchantKey(desc);if(S.rules[mk])return S.rules[mk];
  for(const [c,re] of KEYWORDS)if(re.test(desc)){if(c==='Inntekt'&&amount<0)continue;return c}
  return amount>0?'Inntekt':'Annet';
}

/* ---------- Beregninger ---------- */
function stats(ym){
  const t=S.tx.filter(x=>ymOf(x.date)===ym);
  let income=0,varSpent=0,fixSpent=0;const byCat={};const byDay={};
  for(const x of t){const type=CATS[x.cat];
    if(type==='ign')continue;
    if(type==='inc'){income+=x.amount;continue}
    const e=-x.amount;byCat[x.cat]=(byCat[x.cat]||0)+e;
    if(type==='var'){varSpent+=e;byDay[x.date]=(byDay[x.date]||0)+e}else fixSpent+=e;
  }
  return{income,varSpent,fixSpent,byCat,byDay};
}
const fixedTotal=()=>S.fixed.reduce((s,f)=>s+f.amount,0);
const loanTotal=()=>S.loans.reduce((s,l)=>s+l.monthly,0);
function estIncome(){
  if(S.income>0)return S.income;
  const cur=ymOf(todayStr());const ms=[...new Set(S.tx.filter(x=>CATS[x.cat]==='inc'&&ymOf(x.date)<cur).map(x=>ymOf(x.date)))].sort().slice(-3);
  return ms.length?ms.reduce((s,m)=>s+stats(m).income,0)/ms.length:0;
}
function varBudget(){return estIncome()-fixedTotal()-loanTotal()-S.saving}
function today(){
  const ym=ymOf(todayStr()),dom=+todayStr().slice(8),dim=daysIn(ym),left=dim-dom+1;
  const st=stats(ym),spentToday=st.byDay[todayStr()]||0,before=st.varSpent-spentToday;
  const vb=varBudget(),remainingStart=vb-before,allowance=Math.max(remainingStart/left,0);
  const remaining=vb-st.varSpent;
  const avg=dom>1?before/(dom-1):0; // snitt per dag før i dag
  const runDays=avg>0?Math.floor(remaining/avg):Infinity;
  return{ym,dom,dim,left,st,spentToday,vb,allowance,remaining,avg,runDays,
    leftToday:allowance-spentToday,pace:vb>0?(st.varSpent/vb)/(dom/dim):0};
}
function alerts(){
  const T=today(),a=[];
  if(S.tx.length===0)return[{c:'',t:'Ingen transaksjoner ennå. Importer en CSV-fil fra nettbanken under «Mer», eller last inn eksempeldata.'}];
  if(T.vb<=0)a.push({c:'bad',t:'Budsjettet går ikke opp: faste utgifter, lån og sparing er høyere enn inntekten. Se «Budsjett».'});
  else{
    if(T.remaining<0)a.push({c:'bad',t:`Variabelt budsjett er brukt opp med ${kr(-T.remaining)}. Prøv å holde forbruket nær null resten av måneden.`});
    else if(T.runDays<T.left-1)a.push({c:'bad',t:`Med dagens tempo (${kr(T.avg)}/dag) tar pengene slutt om ca. ${T.runDays} dager, ${T.left-1-T.runDays} dager før månedsslutt. Reduser til ${kr(T.allowance)}/dag.`});
    else if(T.pace>1.1)a.push({c:'',t:`Du ligger ${Math.round((T.pace-1)*100)} % over tempo denne måneden. Hold deg til ${kr(T.allowance)} i dag.`});
    else a.push({c:'ok',t:`Du ligger godt an. Du kan bruke ${kr(Math.max(T.leftToday,0))} resten av i dag.`});
  }
  for(const c of VARS){const lim=S.limits[c];if(lim>0){const s=T.st.byCat[c]||0;if(s>=lim)a.push({c:'bad',t:`${c}: over taket (${kr(s)} av ${kr(lim)}).`});else if(s>=lim*.8)a.push({c:'',t:`${c}: ${Math.round(s/lim*100)} % av taket brukt.`})}}
  const un=S.tx.filter(x=>ymOf(x.date)===T.ym&&x.cat==='Annet').length;
  if(un>5)a.push({c:'',t:`${un} transaksjoner ligger i «Annet». Kategoriser dem under «Transaksjoner», så lærer appen merkenavnene.`});
  return a;
}
function loanInfo(l){const r=l.rate/100/12;let months=null;
  if(l.monthly>0){if(r===0)months=Math.ceil(l.balance/l.monthly);else if(l.monthly>l.balance*r)months=Math.ceil(-Math.log(1-r*l.balance/l.monthly)/Math.log(1+r))}
  return{interest:l.balance*r,months};}

/* ---------- Navigasjon ---------- */
const TABS=[['home','🏠','Oversikt'],['tx','🧾','Transaksjoner'],['budget','📊','Budsjett'],['chat','💬','Rådgiver'],['more','⚙️','Mer']];
function go(v){view=v;render();scrollTo(0,0)}
function render(){
  $('#nav').innerHTML=TABS.map(([k,i,l])=>`<button class="${k===view?'on':''}" onclick="go('${k}')"><span>${i}</span>${l}</button>`).join('');
  $('#who').textContent=S.people[S.me];
  ({home:rHome,tx:rTx,budget:rBudget,chat:rChat,more:rMore})[view]();
}

/* ---------- Oversikt ---------- */
function rHome(){
  const T=today(),al=alerts();
  const pct=T.vb>0?Math.min(T.st.varSpent/T.vb*100,100):100;
  const top=Object.entries(T.st.byCat).filter(([c])=>CATS[c]==='var').sort((a,b)=>b[1]-a[1]).slice(0,5);
  $('#app').innerHTML=`
  <div class="card"><h2>Dagens ramme</h2>
   <div class="big ${T.leftToday<0?'bad':''}">${kr(T.leftToday)}</div>
   <div class="mut">igjen i dag · ramme ${kr(T.allowance)} · brukt ${kr(T.spentToday)}</div>
   <div class="bar ${T.remaining<0?'over':''}"><i style="width:${pct}%"></i></div>
   <div class="mut">${kr(T.st.varSpent)} av ${kr(T.vb)} variabelt budsjett · ${T.left} dager igjen i ${monthName(T.ym)}</div></div>
  <div class="card"><h2>Varsler</h2>${al.map(a=>`<div class="alert ${a.c}">${esc(a.t)}</div>`).join('')}</div>
  <div class="card"><h2>Denne måneden</h2>
   ${top.length?top.map(([c,v])=>{const lim=S.limits[c];return`<div class="row" style="justify-content:space-between;margin:4px 0"><span>${c}</span><span class="${lim&&v>lim?'bad':''}">${kr(v)}${lim?` / ${kr(lim)}`:''}</span></div>`}).join(''):'<span class="mut">Ingen variable utgifter ennå.</span>'}
   <div class="row" style="justify-content:space-between;margin-top:10px"><span class="mut">Faste utgifter (budsjettert)</span><span>${kr(fixedTotal()+loanTotal())}</span></div>
   <div class="row" style="justify-content:space-between"><span class="mut">Inntekt (${S.income>0?'satt':'estimert'})</span><span>${kr(estIncome())}</span></div></div>`;
  maybeNotify(T);
}
async function maybeNotify(T){
  if(!('Notification' in window)||Notification.permission!=='granted'||S.lastNotify===todayStr()||S.tx.length===0)return;
  S.lastNotify=todayStr();save();
  const body=T.vb<=0?'Budsjettet går ikke opp. Sjekk budsjettet.':`Dagens ramme: ${kr(T.allowance)}. ${T.remaining<0?'Budsjettet er brukt opp.':''}`;
  try{const reg=await navigator.serviceWorker?.getRegistration();if(reg)reg.showNotification('Budsjett',{body,icon:'icon.svg'});else new Notification('Budsjett',{body})}catch(e){}
}

/* ---------- Transaksjoner ---------- */
function shiftMonth(d){const y=+month.slice(0,4),m=+month.slice(5,7)-1+d;month=ymOf(ymd(new Date(y,m,1)));render()}
function rTx(){
  let t=S.tx.filter(x=>ymOf(x.date)===month);
  if(search)t=t.filter(x=>(x.desc+x.cat+x.account).toLowerCase().includes(search.toLowerCase()));
  t.sort((a,b)=>b.date.localeCompare(a.date));
  let html='',last='';
  for(const x of t){
    if(x.date!==last){last=x.date;html+=`<div class="day">${new Date(x.date).toLocaleDateString('nb-NO',{weekday:'long',day:'numeric',month:'long'})}</div>`}
    html+=`<div class="tx"><div class="d"><b>${esc(x.desc)}</b><span class="mut" style="font-size:12px">${esc(x.account||'')} · ${esc(S.people[x.person]??'')}</span></div>
     <select onchange="setCat('${x.id}',this.value)">${Object.keys(CATS).map(c=>`<option ${c===x.cat?'selected':''}>${c}</option>`).join('')}</select>
     <div class="r ${x.amount>0?'ok':''}" style="min-width:84px">${kr(x.amount)}</div></div>`;
  }
  $('#app').innerHTML=`<div class="row" style="justify-content:space-between"><button class="btn" onclick="shiftMonth(-1)">‹</button><b style="text-transform:capitalize">${monthName(month)}</b><button class="btn" onclick="shiftMonth(1)">›</button></div>
   <div class="row"><input style="flex:1" type="search" placeholder="Søk…" value="${esc(search)}" oninput="search=this.value;rTxList(this)"></div>
   <div class="card" id="txl">${html||'<span class="mut">Ingen transaksjoner denne måneden.</span>'}</div>`;
}
function rTxList(el){const pos=el.selectionStart;rTx();const i=$('input[type=search]');i.focus();i.setSelectionRange(pos,pos)}
function setCat(id,cat){
  const x=S.tx.find(t=>t.id===id);if(!x)return;
  const mk=merchantKey(x.desc);
  if(mk.length>2){S.rules[mk]=cat;S.tx.forEach(t=>{if(merchantKey(t.desc)===mk)t.cat=cat})}else x.cat=cat;
  save();render();
}

/* ---------- Budsjett ---------- */
function rBudget(){
  const vb=varBudget();
  $('#app').innerHTML=`
  <div class="card"><h2>Månedsbudsjett</h2>
   <div class="row" style="justify-content:space-between"><span>Inntekt per måned (netto, dere begge)</span><input class="n" inputmode="decimal" value="${S.income||''}" placeholder="${Math.round(estIncome())}" onchange="S.income=num(this.value);save();render()"></div>
   <div class="row" style="justify-content:space-between"><span>Fast sparing per måned</span><input class="n" inputmode="decimal" value="${S.saving||''}" placeholder="0" onchange="S.saving=num(this.value);save();render()"></div>
   <table><tr><td>Inntekt</td><td class="r">${kr(estIncome())}</td></tr><tr><td>− Faste utgifter</td><td class="r">${kr(fixedTotal())}</td></tr><tr><td>− Lånebetaling</td><td class="r">${kr(loanTotal())}</td></tr><tr><td>− Sparing</td><td class="r">${kr(S.saving)}</td></tr>
   <tr><td><b>= Variabelt budsjett</b></td><td class="r ${vb<0?'bad':''}"><b>${kr(vb)}</b></td></tr></table>
   <div class="mut" style="margin-top:6px">${vb>0?`Det gir ca. ${kr(vb/30)} per dag til mat, transport, fritid osv.`:''}</div></div>

  <div class="card"><h2>Faste utgifter</h2>
   <table>${S.fixed.map(f=>`<tr><td>${esc(f.name)}<div class="mut" style="font-size:12px">${f.cat}</div></td><td class="r">${kr(f.amount)}</td><td><button class="x" onclick="del('fixed','${f.id}')">✕</button></td></tr>`).join('')||'<tr><td class="mut">Ingen lagt inn.</td></tr>'}</table>
   <div class="row"><input id="fn" placeholder="Navn (f.eks. Husleie)" style="flex:1;min-width:120px"><input id="fa" class="n" inputmode="decimal" placeholder="Beløp"><select id="fc">${FIXC.map(c=>`<option>${c}</option>`).join('')}</select><button class="btn p" onclick="addFixed()">Legg til</button></div>
   <button class="btn" onclick="suggestFixed()">Foreslå fra transaksjoner</button></div>

  <div class="card"><h2>Lån</h2>
   ${S.loans.map(l=>{const i=loanInfo(l);return`<div class="row" style="justify-content:space-between;margin:6px 0"><div>${esc(l.name)}<div class="mut" style="font-size:12px">${kr(l.balance)} · ${l.rate} % · ~${kr(i.interest)} rente/mnd · ${i.months?Math.floor(i.months/12)+' år '+i.months%12+' mnd igjen':'nedbetales ikke'}</div></div><div>${kr(l.monthly)}/mnd <button class="x" onclick="del('loans','${l.id}')">✕</button></div></div>`}).join('')||'<div class="mut">Ingen lån lagt inn.</div>'}
   <div class="row"><input id="ln" placeholder="Navn" style="flex:1;min-width:100px"><input id="lb" class="n" inputmode="decimal" placeholder="Restgjeld"><input id="lr" class="n" style="width:80px" inputmode="decimal" placeholder="Rente %"><input id="lm" class="n" inputmode="decimal" placeholder="Per mnd"><button class="btn p" onclick="addLoan()">Legg til</button></div></div>

  <div class="card"><h2>Tak per kategori (valgfritt)</h2>
   ${VARS.map(c=>`<div class="row" style="justify-content:space-between;margin:4px 0"><span>${c} <span class="mut">(${kr(stats(ymOf(todayStr())).byCat[c]||0)} brukt)</span></span><input class="n" inputmode="decimal" value="${S.limits[c]||''}" onchange="S.limits['${c}']=num(this.value);save();render()"></div>`).join('')}</div>`;
}
function del(list,id){S[list]=S[list].filter(x=>x.id!==id);save();render()}
function addFixed(){const n=$('#fn').value.trim(),a=num($('#fa').value);if(!n||a<=0)return note('Fyll inn navn og beløp');S.fixed.push({id:uid(),name:n,amount:a,cat:$('#fc').value});save();render()}
function addLoan(){const n=$('#ln').value.trim();if(!n)return note('Fyll inn navn');S.loans.push({id:uid(),name:n,balance:num($('#lb').value),rate:num($('#lr').value),monthly:num($('#lm').value)});save();render()}
async function suggestFixed(){
  // Finn utgifter i faste kategorier som går igjen i minst 2 måneder med lignende beløp
  const groups={};
  for(const x of S.tx){if(CATS[x.cat]!=='fix'||x.amount>=0)continue;const k=merchantKey(x.desc);(groups[k]=groups[k]||[]).push(x)}
  const found=[];
  for(const [k,xs] of Object.entries(groups)){const ms=new Set(xs.map(x=>ymOf(x.date)));if(ms.size<2)continue;
    const last=xs.sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(S.fixed.some(f=>merchantKey(f.name)===k))continue;found.push({id:uid(),name:last.desc.slice(0,40),amount:Math.round(-last.amount),cat:last.cat})}
  if(!found.length)return note('Fant ingen gjentakende faste utgifter. Importer flere måneder med transaksjoner for bedre forslag.');
  if(await yes('Legge til disse faste utgiftene?\n\n'+found.map(f=>`${f.name}: ${kr(f.amount)}`).join('\n'))){S.fixed.push(...found);save();render()}
}

/* ---------- Rådgiver (AI) ---------- */
function context(){
  const T=today(),prev=ymOf(ymd(new Date(new Date().getFullYear(),new Date().getMonth()-1,1))),ps=stats(prev);
  const cats=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([c,v])=>`${c}: ${Math.round(v)}`).join(', ');
  return `Dato: ${todayStr()}. Valuta NOK.
Husholdning: ${S.people.join(' og ')}.
Månedsinntekt: ${Math.round(estIncome())}. Faste utgifter: ${Math.round(fixedTotal())} (${S.fixed.map(f=>f.name+' '+f.amount).join(', ')||'ingen'}). Lånebetaling: ${Math.round(loanTotal())}. Sparing: ${S.saving}.
Lån: ${S.loans.map(l=>`${l.name} restgjeld ${l.balance}, rente ${l.rate}%, ${l.monthly}/mnd`).join('; ')||'ingen'}.
Variabelt budsjett denne måneden: ${Math.round(T.vb)}. Brukt hittil: ${Math.round(T.st.varSpent)}. Dager igjen inkl. i dag: ${T.left}. Dagens ramme: ${Math.round(T.allowance)}. Brukt i dag: ${Math.round(T.spentToday)}. Snitt per dag hittil: ${Math.round(T.avg)}.
Forbruk per kategori denne måneden: ${cats(T.st.byCat)||'ingen'}.
Forbruk per kategori forrige måned: ${cats(ps.byCat)||'ingen'}.
Kategoritak: ${Object.entries(S.limits).filter(([,v])=>v).map(([c,v])=>c+' '+v).join(', ')||'ingen'}.
Siste 25 transaksjoner: ${S.tx.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,25).map(x=>`${x.date} ${x.desc} ${Math.round(x.amount)} [${x.cat}]`).join(' | ')}`;
}
const SYSTEM=`Du er en vennlig, kunnskapsrik og aktiv økonomirådgiver for et norsk par. Svar på norsk, kort og konkret, med tall fra dataene du får. Vær ærlig når noe ikke går opp. Gi praktiske råd om budsjett, sparing og lånenedbetaling (f.eks. buffer på 3 måneders utgifter, å prioritere dyr gjeld). Ikke gi personlige investeringsråd om enkeltaksjoner eller fond; si at du ikke er lisensiert rådgiver hvis du blir spurt. Hvis dataene mangler, si hva som mangler. Ikke finn på tall.`;
const SUGG=['Hvordan ligger vi an denne måneden?','Hvor kan vi kutte mest?','Lag en spareplan for oss','Bør vi nedbetale lån eller spare?'];
function rChat(){
  $('#app').innerHTML=`
  ${S.apiKey?'':`<div class="alert">Legg inn Claude API-nøkkel under «Mer» for å bruke rådgiveren.</div>`}
  <div class="chat" id="msgs">${S.chat.length?S.chat.map(m=>`<div class="msg ${m.r==='user'?'u':'a'}">${esc(m.c)}</div>`).join(''):'<div class="msg a">Hei! Jeg ser budsjettet og forbruket deres. Spør meg om hva som helst, eller trykk på et forslag.</div>'}</div>
  <div class="chips">${SUGG.map(s=>`<span class="chip" onclick="ask(this.textContent)">${s}</span>`).join('')}</div>
  <div class="row"><input id="q" style="flex:1" placeholder="Skriv til rådgiveren…" onkeydown="if(event.key==='Enter')ask()"><button class="btn p" onclick="ask()">Send</button></div>
  ${S.chat.length?'<button class="btn" onclick="S.chat=[];save();render()">Tøm samtale</button>':''}`;
  scrollTo(0,document.body.scrollHeight);
}
let busy=false;
async function ask(text){
  const q=(text||$('#q').value).trim();if(!q||busy)return;
  if(!S.apiKey){note('Legg inn API-nøkkel under «Mer» først.');return}
  busy=true;S.chat.push({r:'user',c:q});S.chat.push({r:'assistant',c:'…'});save();rChat();
  try{
    const msgs=S.chat.slice(0,-1).slice(-12).map(m=>({role:m.r,content:m.c}));
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':S.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-5-5',max_tokens:900,system:SYSTEM+'\n\nDATA:\n'+context(),messages:msgs})});
    const j=await res.json();
    if(!res.ok)throw new Error(j.error?.message||res.status);
    S.chat[S.chat.length-1].c=j.content.map(b=>b.text||'').join('');
  }catch(e){S.chat[S.chat.length-1].c='Beklager, rådgiveren kunne ikke svare: '+e.message+(location.protocol==='file:'||/Failed to fetch|NetworkError/i.test(e.message)?'\n\nHvis meldingen handler om nettverk, blokkerer denne siden kall til Claude. Åpne appen fra serve.ps1 eller en egen server for å bruke rådgiveren.':'')}
  busy=false;save();if(view==='chat')rChat();
}

/* ---------- Mer: import, innstillinger ---------- */
let imp=null;
function rMore(){
  const pn=S.people;
  $('#app').innerHTML=`
  <div class="card"><h2>Importer transaksjoner (CSV)</h2>
   <div class="row"><input id="acct" placeholder="Kontonavn (f.eks. Brukskonto, Trumf Visa)" style="flex:1;min-width:180px" value="${esc(imp?.account||'')}" onchange="if(imp){imp.account=this.value;rMore()}">
    <select id="who2" onchange="if(imp){imp.person=+this.value;rMore()}">${pn.map((p,i)=>`<option value="${i}" ${i===(imp?.person??S.me)?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
   <label class="row"><input type="checkbox" id="rev" ${imp?.rev?'checked':''} onchange="if(imp){imp.rev=this.checked;rMore()}"> Kredittkort: kjøp står som positive beløp (snu fortegn)</label>
   <input type="file" accept=".csv,.txt" onchange="pickFile(this.files[0])">
   ${imp?impPreview():'<p class="mut">Last ned kontoutskrift som CSV fra nettbanken (Sparebanken Norge og Trumf Visa), og velg filen her. Dato, tekst og beløp gjenkjennes automatisk.</p>'}</div>
  <div class="card"><h2>Personer</h2><div class="row">${pn.map((p,i)=>`<input value="${esc(p)}" onchange="S.people[${i}]=this.value||'Person';save();render()">`).join('')}</div>
   <div class="row"><span>Jeg er:</span><select onchange="S.me=+this.value;save();render()">${pn.map((p,i)=>`<option value="${i}" ${i===S.me?'selected':''}>${esc(p)}</option>`).join('')}</select></div></div>
  <div class="card"><h2>Rådgiver (AI)</h2>
   <input type="password" style="width:100%" placeholder="Claude API-nøkkel (sk-ant-…)" value="${esc(S.apiKey)}" onchange="S.apiKey=this.value.trim();save()">
   <p class="mut">Nøkkelen lagres bare på denne enheten. Når du spør, sendes et sammendrag av budsjettet og de siste transaksjonene til Claude. Bruk en nøkkel med lav forbruksgrense.</p></div>
  <div class="card"><h2>Varsler</h2>
   <button class="btn" onclick="askNotify()">Slå på daglig varsel</button>
   <p class="mut">Varselet vises første gang du åpner appen hver dag. Varsler mens appen er lukket krever en server (kommer i en senere fase). På iPhone: Del → «Legg til på Hjem-skjerm» først.</p></div>
  <div class="card"><h2>Deling og sikkerhetskopi</h2>
   <p class="mut">Data ligger lokalt på denne enheten. Del med partneren din ved å eksportere og importere filen. Ved import slås transaksjonene sammen uten duplikater.</p>
   <div class="row"><button class="btn" onclick="backup()">Eksporter</button><label class="btn">Importer fil<input type="file" accept=".json" hidden onchange="restore(this.files[0])"></label></div></div>
  <div class="card"><h2>Annet</h2><div class="row"><button class="btn" onclick="demo()">Last inn eksempeldata</button><button class="btn d" onclick="wipe()">Slett alle data</button></div></div>`;
}
function parseCSV(text){
  const first=text.split(/\r?\n/).find(l=>l.trim())||'';
  const d=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}
    else if(c==='"')q=true;
    else if(c===d){row.push(cur);cur=''}
    else if(c==='\n'){row.push(cur.replace(/\r$/,''));rows.push(row);row=[];cur=''}
    else cur+=c}
  if(cur||row.length){row.push(cur.replace(/\r$/,''));rows.push(row)}
  return rows.filter(r=>r.some(c=>c.trim()));
}
function parseDate(s){s=String(s).trim();let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);if(m)return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2})$/);if(m)return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;return null}
function parseAmt(s){s=String(s).trim().replace(/[\s\u00a0]/g,'');if(!s)return 0;
  if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');
  const n=parseFloat(s.replace(/[^\d.\-+]/g,''));return isNaN(n)?0:n}
function pickFile(f){
  if(!f)return;const r=new FileReader();
  r.onload=()=>{let text;const buf=r.result;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch(e){text=new TextDecoder('windows-1252').decode(buf)}
    text=text.replace(/^\uFEFF/,'');
    const rows=parseCSV(text);
    const hi=rows.findIndex(r=>r.some(c=>/dato|date/i.test(c))&&r.length>=3);
    if(hi<0)return note('Fant ikke kolonneoverskrifter (Dato, Tekst, Beløp) i filen.');
    const h=rows[hi].map(c=>c.trim().toLowerCase());
    const find=re=>h.findIndex(c=>re.test(c));
    let di=find(/^(bokf|dato|date|transaksjonsdato)/);if(di<0)di=find(/dato|date/);
    const ti=(i=>i<0?find(/beskr|tekst|forklaring|description|mottaker|merchant/):i)(find(/^(beskrivelse|tekst|forklaring)/));
    const ai=find(/^(beløp|belop|amount)/),ui=find(/^ut\b|ut fra|uttak|debet|belastet/),ii=find(/^inn\b|inn på|innskudd|kredit(?!tkort)/);
    if(di<0||ti<0||(ai<0&&ui<0&&ii<0))return note('Kunne ikke gjenkjenne kolonnene. Kolonner funnet: '+rows[hi].join(' | '));
    imp={rows:rows.slice(hi+1),di,ti,ai,ui,ii,account:$('#acct')?.value||f.name.replace(/\.\w+$/,''),person:+$('#who2')?.value,rev:$('#rev')?.checked};
    rMore();
  };
  r.readAsArrayBuffer(f);
}
function buildImport(){
  const acct=($('#acct')?.value||imp.account).trim(),person=+$('#who2').value,rev=$('#rev').checked,seen={},out=[];
  for(const r of imp.rows){
    const date=parseDate(r[imp.di]);if(!date)continue;
    let amt;if(imp.ai>=0)amt=parseAmt(r[imp.ai]);else amt=parseAmt(r[imp.ii]||0)-Math.abs(parseAmt(r[imp.ui]||0));
    if(!amt)continue;if(rev)amt=-amt;
    const desc=(r[imp.ti]||'').trim();const k=`${date}|${desc}|${amt}|${acct}`;seen[k]=(seen[k]||0)+1;
    out.push({id:hash(k)+'-'+seen[k],date,desc,amount:amt,account:acct,person,cat:categorize(desc,amt)});
  }
  return out;
}
function impPreview(){
  const all=buildImport(),have=new Set(S.tx.map(x=>x.id)),nw=all.filter(x=>!have.has(x.id));
  const sum=nw.slice(0,5).map(x=>`<tr><td>${x.date}</td><td>${esc(x.desc.slice(0,30))}</td><td class="r">${kr(x.amount)}</td><td>${x.cat}</td></tr>`).join('');
  return `<p><b>${all.length}</b> rader funnet, <b>${nw.length}</b> nye.</p><table>${sum}</table>
   <div class="row"><button class="btn p" onclick="doImport()">Importer ${nw.length}</button><button class="btn" onclick="imp=null;rMore()">Avbryt</button></div>
   <p class="mut">Ser fortegn feil ut (utgifter som positive)? Kryss av for kredittkort og last filen på nytt.</p>`;
}
function doImport(){
  const all=buildImport(),have=new Set(S.tx.map(x=>x.id)),nw=all.filter(x=>!have.has(x.id));
  S.tx.push(...nw);const a=nw[0]?.account;if(a&&!S.accounts.includes(a))S.accounts.push(a);
  imp=null;save();note(nw.length+' transaksjoner importert.');month=nw.length?ymOf(nw.map(x=>x.date).sort().pop()):month;go('home');
}
function askNotify(){if(!('Notification' in window))return note('Denne nettleseren støtter ikke varsler. På iPhone må appen først legges til på Hjem-skjermen.');
  Notification.requestPermission().then(p=>note(p==='granted'?'Varsler er slått på.':'Varsler ble ikke tillatt.'))}
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click()}
function backup(){const c={...S,apiKey:'',chat:[]};dl(`budsjett-${todayStr()}.json`,JSON.stringify(c),'application/json')}
function restore(f){if(!f)return;const r=new FileReader();r.onload=async()=>{try{
  const d=JSON.parse(r.result);if(!Array.isArray(d.tx))throw 0;
  const have=new Set(S.tx.map(x=>x.id));let n=0;for(const x of d.tx)if(!have.has(x.id)){S.tx.push(x);n++}
  Object.assign(S.rules,d.rules||{});
  if(await yes(`${n} nye transaksjoner lagt til.\nOverta også budsjett, faste utgifter og lån fra filen? (Erstatter dine)`)){for(const k of ['income','saving','fixed','loans','limits','people'])if(d[k]!==undefined)S[k]=d[k]}
  save();render()}catch(e){note('Ugyldig fil')}};r.readAsText(f)}
async function wipe(){if(await yes('Slette ALLE data på denne enheten?')&&await yes('Er du helt sikker?')){const k=S.apiKey;S=fresh();S.apiKey=k;save();render()}}
async function demo(){
  if(S.tx.length&&!(await yes('Eksempeldata legges til sammen med dine egne data. Fortsette?')))return;
  const now=new Date(),items=[['REMA 1000 Storgata',-340,'Mat'],['KIWI Sentrum',-520,'Mat'],['Circle K Bensin',-690,'Transport'],['Starbucks',-85,'Restaurant'],['COOP EXTRA',-760,'Mat'],['Apotek 1',-210,'Helse'],['Kino Colosseum',-340,'Fritid'],['H&M',-499,'Shopping'],['Wolt',-320,'Restaurant']];
  for(let mo=2;mo>=0;mo--){const base=new Date(now.getFullYear(),now.getMonth()-mo,1),ym=ymOf(ymd(base));
    const push=(d,desc,amt,acct)=>{const date=`${ym}-${pad(d)}`;if(date>todayStr())return;const k=date+desc+amt+acct;S.tx.push({id:'demo-'+hash(k),date,desc,amount:amt,account:acct,person:d%2,cat:categorize(desc,amt)})};
    push(1,'Lønn Aider',32000,'Brukskonto');push(2,'Husleie',-11500,'Brukskonto');push(3,'Fjordkraft strøm',-1400,'Brukskonto');push(4,'Netflix',-179,'Trumf Visa');push(4,'Spotify',-129,'Trumf Visa');push(5,'Telenor mobil',-599,'Brukskonto');push(6,'Gjensidige forsikring',-1150,'Brukskonto');
    let s=mo*7+3;for(let d=2;d<=28;d++){s=(s*37+d*11)%97;if(s%3===0){const it=items[s%items.length];push(d,it[0],it[1]-(s%5)*20,'Trumf Visa')}}}
  if(!S.fixed.length){S.fixed=[{id:uid(),name:'Husleie',amount:11500,cat:'Bolig'},{id:uid(),name:'Strøm',amount:1400,cat:'Strøm'},{id:uid(),name:'Abonnementer',amount:308,cat:'Abonnement'},{id:uid(),name:'Mobil',amount:599,cat:'Telefon/internett'},{id:uid(),name:'Forsikring',amount:1150,cat:'Forsikring'}];S.income=32000;S.saving=2000}
  save();go('home');
}
render();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
