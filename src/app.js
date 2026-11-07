import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { getSession, onAuth, signIn, signUp, signOut, myFarm, joinFarm, createInvite, listMembers, removeMember,
  fetchFarm, pushFarm, subscribeFarm, makeSample } from './backend.js'

// Новая версия приложения ставится сама; проверяем при открытии и при возвращении в приложение.
const updateSW = registerSW({ immediate: true })
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateSW && navigator.serviceWorker?.getRegistration().then(r => r && r.update()).catch(() => {}) })

/* ---------- Справочник кормов (на 1 кг корма) ----------
   kued — кормовые единицы, pp — переваримый протеин, г (для жвачных и лошадей)
   dm — доля сухого вещества, ca — кальций, г
   kcal — обменная энергия для птицы, ккал; cp — сырой протеин, г (для кур) */
const FEEDS = [
  {id:'seno_lug', name:'Сено луговое', g:'rough', kued:.45, pp:48, dm:.85, ca:6, for:['goat','buck','horse','cow']},
  {id:'seno_bob', name:'Сено бобовое (клевер, люцерна)', g:'rough', kued:.50, pp:105, dm:.85, ca:14, for:['goat','buck','horse','cow']},
  {id:'soloma', name:'Солома яровая', g:'rough', kued:.31, pp:14, dm:.85, ca:3.5, for:['goat','buck','horse','cow']},
  {id:'oves', name:'Овёс', g:'conc', kued:1.0, pp:79, dm:.87, ca:1.5, kcal:2600, cp:105, henMax:.25, for:['goat','buck','horse','cow','hens']},
  {id:'yachmen', name:'Ячмень', g:'conc', kued:1.15, pp:81, dm:.87, ca:2, kcal:2700, cp:110, henMax:.3, for:['goat','buck','horse','cow','hens']},
  {id:'pshenica', name:'Пшеница', g:'conc', kued:1.28, pp:100, dm:.87, ca:.6, kcal:3050, cp:125, henMax:.6, for:['goat','buck','cow','hens']},
  {id:'kukuruza', name:'Кукуруза', g:'conc', kued:1.33, pp:69, dm:.87, ca:.5, kcal:3300, cp:90, henMax:.4, for:['goat','buck','horse','cow','hens']},
  {id:'dert_oves', name:'Дерть (мука) овсяная', g:'conc', kued:1.0, pp:79, dm:.87, ca:1.5, for:['goat','buck','cow']},
  {id:'dert_pshen', name:'Дерть (мука) пшеничная', g:'conc', kued:1.28, pp:100, dm:.87, ca:.6, for:['goat','buck','cow']},
  {id:'otrubi', name:'Отруби пшеничные', g:'conc', kued:.75, pp:126, dm:.87, ca:2, kcal:1600, cp:150, henMax:.1, for:['goat','buck','horse','cow','hens']},
  {id:'zhmyh', name:'Жмых подсолнечный', g:'conc', kued:1.08, pp:330, dm:.9, ca:4, kcal:2200, cp:380, henMax:.08, for:['goat','buck','horse','cow','hens']},
  {id:'kombi_koz', name:'Комбикорм для коз/КРС', g:'conc', kued:1.0, pp:120, dm:.87, ca:8, for:['goat','buck','cow']},
  {id:'kombi_kury', name:'Комбикорм для несушек', g:'conc', kued:1.0, pp:120, dm:.87, ca:35, kcal:2700, cp:165, henMax:1, for:['hens']},
  {id:'yabloki', name:'Яблоки', g:'juicy', kued:.13, pp:4, dm:.15, ca:.1, cap:{goat:1,buck:1,horse:2,cow:5}, for:['goat','buck','horse','cow']},
  {id:'morkov', name:'Морковь', g:'juicy', kued:.14, pp:8, dm:.12, ca:.9, cap:{goat:1.5,buck:1.5,horse:3,cow:10}, for:['goat','buck','horse','cow']},
  {id:'svekla', name:'Свёкла кормовая', g:'juicy', kued:.12, pp:9, dm:.12, ca:.4, cap:{goat:1.5,buck:1,horse:3,cow:20}, for:['goat','buck','horse','cow']},
  {id:'tykva', name:'Тыква, кабачки', g:'juicy', kued:.10, pp:6, dm:.10, ca:.3, cap:{goat:1.5,buck:1.5,horse:2,cow:10}, for:['goat','buck','horse','cow']},
  {id:'kartofel', name:'Картофель (для кур — только варёный)', g:'juicy', kued:.30, pp:10, dm:.22, ca:.2, kcal:800, cp:20, hen:.06, cap:{goat:1,buck:1,cow:10}, for:['goat','buck','cow','hens']},
  {id:'cherv', name:'Мучной червь сушёный', g:'conc', kued:0, pp:0, dm:.95, ca:.5, kcal:3800, cp:480, henMax:.07, for:['hens']},
  {id:'belok', name:'Белковая добавка (концентрат)', g:'conc', kued:0, pp:0, dm:.9, ca:15, kcal:2500, cp:400, henMax:.1, for:['hens']},
  {id:'mel', name:'Мел кормовой', g:'mineral', kued:0, pp:0, dm:1, ca:370, cap:{goat:.015,buck:.015,horse:.05,cow:.1}, for:['goat','buck','horse','cow']},
  {id:'rakushka', name:'Ракушка', g:'mineral', kued:0, pp:0, dm:1, ca:350, kcal:0, cp:0, for:['hens']},
];
// фосфор (г/кг) и каротин (мг/кг) — средние справочные
const PCAR={seno_lug:[2.2,15],seno_bob:[2.2,25],soloma:[1,3],oves:[3.4,1],yachmen:[3.9,1],pshenica:[3.6,1],kukuruza:[2.9,5],dert_oves:[3.4,1],dert_pshen:[3.6,1],
  otrubi:[9.6,2.5],zhmyh:[10,2],kombi_koz:[6,5],kombi_kury:[6,0],yabloki:[.1,.5],morkov:[.4,80],svekla:[.4,.5],tykva:[.3,40],kartofel:[.5,0],cherv:[7,0],belok:[8,0],mel:[.2,0],rakushka:[.7,0]};
FEEDS.forEach(f=>{ const e=PCAR[f.id]; f.p=e?e[0]:0; f.car=e?e[1]:0; });
const F = Object.fromEntries(FEEDS.map(f=>[f.id,f]));
const BASE = FEEDS.map(f=>({...f}));
function applyFeedData(){
  FEEDS.length=0;
  for(const b of BASE){ const o=S&&S.feedOverrides&&S.feedOverrides[b.id]; FEEDS.push(o?{...b,...o,overridden:true}:{...b}); }
  for(const c of (S&&S.customFeeds)||[]) FEEDS.push({...c,custom:true});
  for(const k in F) delete F[k]; FEEDS.forEach(f=>F[f.id]=f);
}
const PACK = {rough:{name:'тюк',kg:20}, conc:{name:'мешок',kg:40}, juicy:{name:'кг',kg:1}, mineral:{name:'кг',kg:1}};

const SPECIES = {
  goat:{label:'Коза', states:{milk:'Дойная', dry:'Запуск / без дойки', preg:'Котная (последние 2 мес.)'}, w:50, feeds:['seno_lug','oves','yachmen','yabloki']},
  buck:{label:'Козёл', states:{rest:'Вне случки', season:'Случной сезон'}, w:70, feeds:['seno_lug','oves','yachmen','yabloki']},
  horse:{label:'Лошадь', states:{rest:'Без работы', light:'Лёгкая работа', medium:'Средняя работа', heavy:'Тяжёлая работа', preg:'Жерёбая (последние 3 мес.)', lact:'Подсосная'}, w:500, feeds:['seno_lug']},
  cow:{label:'Корова', states:{milk:'Дойная', dry:'Сухостойная'}, w:500, feeds:['seno_lug','dert_oves','dert_pshen']},
  hens:{label:'Куры', states:{lay:'Несушки', rest:'Линька / отдых'}, w:0, feeds:['pshenica','oves','kombi_kury','rakushka']},
};

/* ---------- Нормы потребности ---------- */
function needs(a){
  const r=needsBase(a), W=+a.w||0, m=+a.milk||0;
  if(a.sp==='goat'){ const milk=a.state==='milk'?m:0; r.p=.06*W+1.5*milk+(a.state==='preg'?1:0); r.car=r.kued*(milk?30:25); }
  else if(a.sp==='buck'){ r.p=.07*W; r.car=r.kued*25; }
  else if(a.sp==='horse'){ r.p=.028*W*(a.state==='lact'?1.6:a.state==='preg'?1.3:1); r.car=r.kued*20; }
  else if(a.sp==='cow'){ if(a.state==='dry'){ r.p=.03*W+5; r.car=r.kued*45; } else { r.p=.035*W+1.8*m; r.car=r.kued*40; } }
  else if(a.sp==='hens'){ r.p=a.state==='rest'?.45:.6; }
  return r;
}
function needsBase(a){
  const W=+a.w||0, m=+a.milk||0;
  if(a.sp==='goat'){
    const milk=a.state==='milk'?m:0, preg=a.state==='preg';
    return {kued:.015*W+.4*milk+(preg?.3:0), pp:1.1*W+55*milk+(preg?40:0), ca:.12*W+3*milk+(preg?2:0),
      dmMax:.045*W, rough:(milk?.04:.035)*W, juicy:.015*W, concMax:milk?.3+.3*milk:(preg?.5:.3),
      water:[4+2*milk,6+3*milk], salt:'10–15 г'};
  }
  if(a.sp==='buck'){
    const s=a.state==='season';
    return {kued:.019*W*(s?1.25:1), pp:1.6*W*(s?1.3:1), ca:.12*W, dmMax:.045*W, rough:.035*W, juicy:.012*W,
      concMax:s?1:.5, water:[5,8], salt:'10–15 г'};
  }
  if(a.sp==='horse'){
    const f={rest:1,light:1.25,medium:1.5,heavy:1.8,preg:1.15,lact:1.5}[a.state]||1;
    const kued=.011*W*f, rep=a.state==='lact'||a.state==='preg';
    const k=W/500, work=['light','medium','heavy'].includes(a.state)||a.state==='lact';
    return {kued, pp:kued*(rep?100:85), ca:.04*W*(a.state==='lact'?1.8:a.state==='preg'?1.4:1), dmMax:.025*W, rough:.02*W,
      juicy:.002*W, concMax:(a.state==='rest'?.003:.006)*W, water:work?[40*k,60*k]:[25*k,40*k],
      salt:`${Math.round(.05*W)}–${Math.round(.08*W)} г`};
  }
  if(a.sp==='cow'){
    const fat=+a.fat||3.8;
    if(a.state==='dry') return {kued:.01*W+2.5, pp:.8*W+350, ca:.05*W+15, dmMax:.025*W, rough:.02*W, juicy:.01*W, concMax:1.5,
      water:[.08*W,.08*W+20], salt:`${Math.round(.05*W+10)} г`};
    return {kued:.01*W+(.31+.04*fat)*m, pp:.8*W+(55+3*(fat-3.8))*m, ca:.05*W+2.5*m, dmMax:.03*W+.1*m, rough:.02*W,
      juicy:Math.min(m*.8,.03*W), concMax:.4*m+1, water:[.08*W+4*m,.08*W+4*m+20], salt:`${Math.round(.05*W+4*m)} г`};
  }
  if(a.sp==='hens'){
    const lay=a.state!=='rest';
    return {kcal:lay?300:265, cp:lay?17:14, ca:lay?3.6:1.8, water:[.25,.3]};
  }
  return {};
}

/* ---------- Авторасчёт рациона ---------- */
const rnd = (kg)=> kg<=0?0: kg<1? Math.round(kg/.05)*.05 : kg<10? Math.round(kg*10)/10 : Math.round(kg*2)/2;
function selFeeds(a){ return (a.feeds||[]).map(id=>F[id]).filter(f=>f&&f.for.includes(a.sp)); }

function totals(a, amounts){
  const t={kued:0,pp:0,dm:0,ca:0,kcal:0,cp:0,conc:0,concDm:0,p:0,car:0};
  for(const [id,kg] of Object.entries(amounts)){
    const f=F[id]; if(!f||!kg) continue;
    t.p+=kg*(f.p||0); t.car+=kg*(f.car||0);
    t.kued+=kg*f.kued; t.pp+=kg*f.pp; t.dm+=kg*f.dm; t.ca+=kg*f.ca; t.kcal+=kg*(f.kcal||0); t.cp+=kg*(f.cp||0);
    if(f.g==='conc'){t.conc+=kg; t.concDm+=kg*f.dm;}
  }
  return t;
}

function henRation(a, nd){
  const sel=selFeeds(a), grains=sel.filter(f=>f.g!=='mineral'&&f.g!=='juicy'), out={};
  // сочные (варёный картофель) — фиксированная порция, зерно добирает остальное
  sel.filter(f=>f.g==='juicy'&&f.hen).forEach(f=>out[f.id]=f.hen);
  const tj=totals(a,out); nd={...nd, kcal:Math.max(60,nd.kcal-tj.kcal), cp:Math.max(5,nd.cp-tj.cp)};
  if(grains.length){
    const kombi=grains.find(f=>f.id==='kombi_kury'), others=grains.filter(f=>f.id!=='kombi_kury');
    const sharesFor=(sK)=>{
      const sh={}; if(kombi) sh.kombi_kury=sK;
      let rest=kombi?1-sK:1, pool=[...others];
      while(pool.length&&rest>1e-6){
        const each=rest/pool.length, capped=pool.filter(f=>f.henMax<each);
        if(!capped.length){pool.forEach(f=>sh[f.id]=(sh[f.id]||0)+each); rest=0; break;}
        capped.forEach(f=>{sh[f.id]=f.henMax; rest-=f.henMax;}); pool=pool.filter(f=>!capped.includes(f));
      }
      if(rest>1e-6&&kombi) sh.kombi_kury+=rest;
      return sh;
    };
    let sh=sharesFor(kombi?(others.length?.4:1):0);
    if(kombi&&others.length){
      const need=nd.cp/nd.kcal;
      for(let s=.4;s<=1.001;s+=.05){ sh=sharesFor(Math.min(s,1)); const t=totals(a,sh); if(t.cp/t.kcal>=need) break; }
    }
    const t=totals(a,sh); const totalKg=Math.min(.15,Math.max(tj.kcal?.05:.09,nd.kcal/(t.kcal||2700)));
    for(const id in sh) out[id]=Math.round(totalKg*sh[id]/.005)*.005;
  }
  if(sel.find(f=>f.id==='rakushka')){
    const caDef=needs(a).ca-totals(a,out).ca;
    out.rakushka=Math.round(Math.min(.008,Math.max(.003,caDef/350))*1000)/1000;
  }
  return out;
}

function autoRation(a){
  const nd=needs(a);
  if(a.sp==='hens') return henRation(a,nd);
  const sel=selFeeds(a), am={};
  const rough=sel.filter(f=>f.g==='rough'), juicy=sel.filter(f=>f.g==='juicy'), conc=sel.filter(f=>f.g==='conc'), mel=sel.find(f=>f.id==='mel');
  const rw={seno_lug:1,seno_bob:1,soloma:.35}; const rsum=rough.reduce((s,f)=>s+rw[f.id],0);
  const addRough=(kg)=>rough.forEach(f=>am[f.id]=(am[f.id]||0)+kg*rw[f.id]/rsum);
  if(rough.length) addRough(nd.rough);
  if(juicy.length){ const each=nd.juicy/juicy.length; juicy.forEach(f=>am[f.id]=Math.min(each,(f.cap&&f.cap[a.sp])||1)); }
  const order=a.sp==='horse'?['rough','conc']:['conc','rough'];
  for(const step of order){
    const t=totals(a,am), D=nd.kued-t.kued; if(D<=.02) break;
    if(step==='conc'&&conc.length){
      const avg=conc.reduce((s,f)=>s+f.kued,0)/conc.length, add=Math.min(D/avg,Math.max(0,nd.concMax-t.conc));
      conc.forEach(f=>am[f.id]=(am[f.id]||0)+add/conc.length);
    }
    if(step==='rough'&&rough.length){
      const k=rough.reduce((s,f)=>s+f.kued*rw[f.id],0)/rsum, dm=rough.reduce((s,f)=>s+f.dm*rw[f.id],0)/rsum;
      addRough(Math.max(0,Math.min(D/k,(nd.dmMax-t.dm)/dm)));
    }
  }
  if(mel){ const def=nd.ca-totals(a,am).ca; if(def>0) am.mel=Math.round(Math.min(def/370,mel.cap[a.sp])*1000)/1000; }
  for(const id in am) if(F[id].g!=='mineral') am[id]=rnd(am[id]);
  return am;
}

function calc(a){
  const auto=autoRation(a);
  let amounts=auto;
  if(a.manual){ amounts={}; selFeeds(a).forEach(f=>amounts[f.id]=+a.manual[f.id]||0); }
  return {amounts, auto, t:totals(a,amounts), nd:needs(a)};
}

/* ---------- Состояние и хранение ---------- */
let S=null, loaded=false, store=null, ref=null, note=null, readOnly=false;
let saving=false, again=false, dirty=false, saveT=null, lastSaved=null, syncMsg='Загрузка…', syncCls='local', deferRemote=null;
const ui={tab:'ration', edit:{}, open:{}, confirmDel:null, period:null, opt:{}, jAnimal:null, jKind:null, confirmDelFeed:null};
const LS='podvorye-rations-v1';

function blank(){ return {v:1, animals:[], feeds:{}, settings:{feedings:2, period:'season', customDays:90, seasonEnd:'2027-05-01', includePlanned:false}, customFeeds:[], feedOverrides:{}, log:[]}; }
function normalize(d){
  const b=blank(); d=d&&typeof d==='object'?d:{};
  const obj=(x)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  return {v:1, animals:Array.isArray(d.animals)?d.animals:[], feeds:obj(d.feeds), settings:Object.assign(b.settings,d.settings||{}),
    customFeeds:Array.isArray(d.customFeeds)?d.customFeeds:[], feedOverrides:obj(d.feedOverrides), log:Array.isArray(d.log)?d.log:[]};
}
const markRation=(a)=>{ if(a) a.rationChanged=todayISO(); };
const stable=(o)=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((r,k2)=>(r[k2]=v[k2],r),{}):v);
const clone=(o)=>JSON.parse(JSON.stringify(o));
function setSync(cls,msg){ syncCls=cls; syncMsg=msg; const el=document.getElementById('sync'); el.className='sync '+cls; el.querySelector('span').textContent=msg; }

/* Синхронизация: всё сразу пишется в телефон (работает без интернета),
   а при связи отправляется в Supabase. Конфликт двух телефонов — слияние, журнал не теряется. */
const LS_META='podvorye-meta-v1';
let meta={farmId:null, syncedAt:null, dirty:false};
try{ meta=Object.assign(meta, JSON.parse(localStorage.getItem(LS_META)||'{}')); }catch(e){}
let session=null, farm=null, aiEnabled=false, authView=false, authBusy=false, authErr='', unsub=null;
const saveMeta=()=>{ try{ localStorage.setItem(LS_META, JSON.stringify(meta)); }catch(e){} };
const saveLocal=()=>{ try{ if(S) localStorage.setItem(LS, JSON.stringify(S)); }catch(e){} };

function save(){
  if(readOnly) return;
  dirty=true; meta.dirty=true; saveLocal(); saveMeta();
  clearTimeout(saveT); saveT=setTimeout(flush,800);
  setSync('saving', navigator.onLine&&session?'Сохраняю…':'Сохранено в телефоне');
}
function mergeData(local, remote){
  const m=clone(local), ids=new Set((m.log||[]).map(e=>e.id));
  for(const e of (remote.log||[])) if(!ids.has(e.id)) m.log.push(e);
  return m;
}
async function flush(){
  if(!S) return;
  if(saving){ again=true; return; }
  if(!session||!meta.farmId||!navigator.onLine){ setSync('local','Сохранено в телефоне — отправлю, когда будет связь'); return; }
  saving=true; again=false;
  let retry=false;
  try{
    let rep=''; try{ rep=reportText(); }catch(e){}
    let r=await pushFarm(meta.farmId, S, meta.syncedAt, rep, S.settings.email);
    if(r.conflict){
      const remote=await fetchFarm(meta.farmId);
      S=normalize(mergeData(S, normalize(remote.data))); meta.syncedAt=remote.updated_at;
      r=await pushFarm(meta.farmId, S, meta.syncedAt, rep, S.settings.email);
      if(r.conflict) throw new Error('conflict');
      render();
    }
    meta.syncedAt=r.updated_at; lastSaved=stable(S);
    if(!again){ dirty=false; meta.dirty=false; }
    saveLocal(); saveMeta(); setSync('','Сохранено');
  }catch(e){ setSync('err','Не отправилось — повторю'); retry=true; }
  saving=false;
  if(again) flush(); else if(retry) setTimeout(flush, 10000);
}
function applyRemote(row){
  if(!row||row.updated_at===meta.syncedAt||dirty||saving) return;
  const go=()=>{ S=normalize(clone(row.data)); meta.syncedAt=row.updated_at; saveLocal(); saveMeta(); setSync('','Сохранено'); render(); };
  const ae=document.activeElement;
  if(ae&&/INPUT|SELECT|TEXTAREA/.test(ae.tagName)){ deferRemote=go; return; }
  go();
}
function useFarm(f){
  farm=f; aiEnabled=!!f.ai_enabled;
  if(unsub) unsub();
  unsub=subscribeFarm(f.id, ()=>{ if(!dirty&&!saving) fetchFarm(f.id).then(applyRemote).catch(()=>{}); });
}
async function connect(){
  if(!session) return;
  if(!navigator.onLine){ setSync('local','Нет связи — работаю на телефоне'); return; }
  try{
    const f=await myFarm();
    const remoteHas=!!(f.data&&Array.isArray(f.data.animals)&&f.data.animals.length);
    if(meta.farmId!==f.id){
      meta.farmId=f.id;
      if(S&&S.animals.length&&!remoteHas){ meta.syncedAt=f.updated_at; dirty=true; meta.dirty=true; saveMeta(); useFarm(f); await flush(); }
      else { if(remoteHas) S=normalize(f.data); meta.syncedAt=f.updated_at; dirty=false; meta.dirty=false; saveLocal(); saveMeta(); useFarm(f); }
    } else {
      useFarm(f);
      if(dirty) await flush();
      else if(f.updated_at!==meta.syncedAt){ S=remoteHas||f.data&&f.data.v?normalize(f.data):S; meta.syncedAt=f.updated_at; saveLocal(); saveMeta(); }
    }
    authView=false; ui.members=undefined;
    if(!dirty) setSync('','Сохранено');
    render();
  }catch(e){ setSync('err','Нет связи с сервером — работаю на телефоне'); }
}
async function initStore(){
  let d=null; try{ d=JSON.parse(localStorage.getItem(LS)||'null'); }catch(e){}
  S=d?normalize(d):null; dirty=!!meta.dirty; loaded=true;
  session=await getSession();
  if(!session) authView=true;
  render();
  if(session) connect();
  onAuth(s=>{ const was=!!session; session=s; if(s&&!was) connect(); });
  window.addEventListener('online',()=>{ if(session&&!farm) connect(); else if(dirty) flush(); });
  window.addEventListener('offline',()=>setSync('local','Нет связи — сохраняю в телефоне'));
}
async function doSignOut(){
  try{ await signOut(); }catch(e){}
  if(unsub) unsub(); unsub=null; session=null; farm=null; aiEnabled=false;
  S=null; dirty=false; meta={farmId:null,syncedAt:null,dirty:false};
  try{ localStorage.removeItem(LS); localStorage.removeItem(LS_META); }catch(e){}
  authView=true; ui.tab='ration'; render();
}
document.addEventListener('focusout',()=>{ setTimeout(()=>{ if(deferRemote&&!/INPUT|SELECT/.test((document.activeElement||{}).tagName||'')){ const f=deferRemote; deferRemote=null; f(); } },50); });

/* ---------- Утилиты ---------- */
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=1)=>(+n||0).toLocaleString('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:0});
const num=(v)=>{ const x=parseFloat(String(v).replace(',','.').replace(/\s/g,'')); return isFinite(x)?x:0; };
const todayISO=()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const dayDiff=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const addDays=(n)=>{ const d=new Date(); d.setDate(d.getDate()+Math.floor(n)); return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}); };
const cur=()=>'€';
const money=(r)=>{ const v=+r||0; return v.toLocaleString('ru-RU',{maximumFractionDigits:Math.abs(v)<100?2:0,minimumFractionDigits:0})+' '+cur(); };
const uid=()=>Math.random().toString(36).slice(2,9);
const mult=(a)=>a.sp==='hens'?Math.max(0,+a.count||0):1;
const animalById=(id)=>S.animals.find(a=>a.id===id);
function kgOrG(kg,perHen){ return perHen? fmt(kg*1000,0)+' г' : (kg<1? fmt(kg*1000,0)+' г' : fmt(kg,1)+' кг'); }
function stateText(a){
  const st=SPECIES[a.sp].states[a.state]||'';
  if(a.sp==='goat'&&a.state==='milk') return `Дойная, ${fmt(a.milk)} л молока`;
  if(a.sp==='cow'&&a.state==='milk') return `Дойная, ${fmt(a.milk)} л молока (${fmt(a.fat)}%)`;
  return st;
}
function status(r, kind){
  if(kind==='max') return r>1.05?'bad':r>.95?'warn':'ok';
  if(r<.8) return 'bad'; if(r<.92) return 'warn';
  if(kind==='energy'&&r>1.2) return 'warn';
  return 'ok';
}
const stTxt={ok:'в норме',warn:'маловато',bad:'не хватает'};
function packWord(name,n){
  const forms=name==='тюк'?['тюк','тюка','тюков']:['мешок','мешка','мешков'];
  if(Math.abs(n-Math.round(n))>.05) return forms[1];
  const k=Math.round(n)%100, k1=k%10;
  return (k>10&&k<20)?forms[2]:k1===1?forms[0]:(k1>=2&&k1<=4)?forms[1]:forms[2];
}
function feedPack(id){ const f=F[id], st=S.feeds[id]||{}; const p=PACK[f.g]; return {name:p.name, kg:+st.packKg||p.kg}; }
function pricePerKg(id){ const st=S.feeds[id]||{}; const p=feedPack(id); return (+st.price||0)/(p.kg||1); }

function herdDaily(includePlanned){
  const tot={};
  for(const a of S.animals){
    if(a.planned&&!includePlanned) continue;
    const {amounts}=calc(a), m=mult(a);
    for(const [id,kg] of Object.entries(amounts)) if(kg>0) tot[id]=(tot[id]||0)+kg*m;
  }
  return tot;
}
function animalCost(a){
  const {amounts}=calc(a), m=mult(a); let c=0;
  for(const [id,kg] of Object.entries(amounts)) c+=kg*m*pricePerKg(id);
  return c;
}
function lowStock(){
  const daily=herdDaily(S.settings.includePlanned), out=[];
  for(const [id,st] of Object.entries(S.feeds)){
    const d=daily[id]||0; if(!F[id]||d<=0||st.stock===undefined||st.stock==='') continue;
    const since=st.stockDate?Math.max(0,dayDiff(st.stockDate,todayISO())):0;
    const left=Math.max(0,(+st.stock||0)-d*since), dl=left/d;
    if(dl<14) out.push({name:F[id].name,days:dl});
  }
  return out.sort((x,y)=>x.days-y.days);
}

/* ---------- Отрисовка ---------- */
const main=document.getElementById('main');
function render(){
  applyFeedData();
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===ui.tab?'page':'false'));
  if(!loaded){ main.innerHTML=`<div class="card empty"><p class="hint">Загружаю данные хозяйства…</p>${note?`<div class="notice">${esc(note)}</div>`:''}</div>`; return; }
  const top=note?`<div class="notice" style="margin-bottom:12px">${esc(note)}</div>`:'';
  document.querySelector('nav.tabs').style.display=authView?'none':'';
  if(authView){ main.innerHTML=top+viewAuth(); return; }
  if(!S||!S.animals.length){ main.innerHTML=top+(ui.tab==='herd'?viewHerd():viewEmpty()); return; }
  main.innerHTML=top+({ration:viewRation,stock:viewStock,tips:viewTips,journal:viewJournal,herd:viewHerd}[ui.tab])()+(ui.feed&&F[ui.feed]?feedSheet(ui.feed):'')+(ui.photo?photoSheet():'')+(ui.chat&&ui.chat.open?chatSheet():'')+fabs();
}
function viewAuth(){
  const up=ui.authMode==='up';
  return `<div class="card" style="max-width:460px;margin:8px auto">
    <div class="row" style="justify-content:center">${['horse','cow','goat','hens'].map(k=>aniIcon(k,'lg')).join('')}</div>
    <h2 style="text-align:center">${up?'Создать аккаунт':'Вход в хозяйство'}</h2>
    <label class="f">Почта<input type="email" id="au-email" inputmode="email" autocomplete="email" value="${esc(ui.auEmail||'')}" placeholder="name@example.com"></label>
    <label class="f">Пароль${up?' (не короче 6 символов)':''}<input type="password" id="au-pw" autocomplete="${up?'new-password':'current-password'}"></label>
    ${authErr?`<div class="notice">${esc(authErr)}</div>`:''}
    <button class="primary" data-act="auth-go" ${authBusy?'disabled':''}>${authBusy?'Минутку…':up?'Создать аккаунт':'Войти'}</button>
    <button class="ghost" data-act="auth-switch">${up?'Уже есть аккаунт — войти':'Первый раз? Создать аккаунт'}</button>
    <p class="hint" style="margin:0">Для первого входа нужен интернет. Дальше приложение работает и без связи — записи отправятся сами, когда она появится.</p>
  </div>`;
}
async function authGo(){
  const em=(document.getElementById('au-email').value||'').trim(), pw=document.getElementById('au-pw').value||'';
  ui.auEmail=em; if(!em||!pw){ authErr='Впишите почту и пароль.'; render(); return; }
  authBusy=true; authErr=''; render();
  try{ if(ui.authMode==='up') await signUp(em,pw); else await signIn(em,pw); session=await getSession(); await connect(); }
  catch(e){ authErr=e.message||String(e); }
  authBusy=false; render();
}
function viewTeam(){
  if(!session) return '';
  if(farm&&ui.members===undefined&&navigator.onLine){ ui.members=null; listMembers(farm.id).then(m=>{ ui.members=m; render(); }).catch(()=>{ ui.members=[]; render(); }); }
  const me=session.user, mem=ui.members||[], owner=mem.some(m=>m.user_id===me.id&&m.role==='owner');
  return `<section class="section"><div class="section-head"><h2>Кто ведёт хозяйство</h2><span class="hint">общие данные на всех телефонах</span></div>
    <div class="card">
      ${farm?(mem.length?`<div class="tbl-wrap"><table><tbody>${mem.map(m=>`<tr><td>${esc(m.email||'—')}${m.user_id===me.id?' <span class="chip">это вы</span>':''}<span class="small">${m.role==='owner'?'владелец':'участник'}</span></td>
        <td class="n">${owner&&m.user_id!==me.id?(ui.confirmRm===m.user_id?`<button class="danger" data-act="rm-member-yes" data-u="${m.user_id}">Убрать</button> <button data-act="rm-member-no">Отмена</button>`:`<button class="ghost" data-act="rm-member" data-u="${m.user_id}">Убрать</button>`):''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="hint" style="margin:0">Загружаю…</p>'):'<p class="hint" style="margin:0">Нет связи с сервером — список появится, когда будет интернет.</p>'}
      ${farm&&owner?`<div class="row"><button class="primary" data-act="make-invite">Пригласить человека</button></div>
        ${ui.invite?`<div class="notice"><div>Код приглашения: <strong style="font-size:20px;letter-spacing:.12em">${esc(ui.invite)}</strong></div>
          <div style="margin-top:6px">Передайте его лично или в мессенджере. Человек ставит приложение, создаёт аккаунт и вводит код во вкладке «Хозяйство». Код одноразовый, действует 7 дней.</div></div>`:''}`:''}
      <details ${ui.open.join?'open':''} data-det="join"><summary>У меня есть код приглашения</summary>
        <div class="row" style="margin-top:8px"><input id="join-code" placeholder="КОД" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.12em;width:150px"><button data-act="join-farm">Присоединиться</button></div>
        <p class="hint" style="margin:6px 0 0">Данные на этом телефоне заменятся данными хозяйства, к которому вы присоединяетесь.</p>
      </details>
      ${farm&&!aiEnabled?'<p class="hint" style="margin:0">Помощник Claude и фото для этого хозяйства пока не включены — их включает владелец приложения.</p>':''}
      <div class="row"><span class="hint">Вы вошли как ${esc(me.email||'')}</span>
        ${ui.confirmOut?`<span class="hint">${dirty?'Есть не отправленные изменения — они пропадут. ':''}Выйти?</span><button class="danger" data-act="sign-out-yes">Выйти</button><button data-act="sign-out-no">Отмена</button>`:'<button class="ghost" data-act="sign-out">Выйти из аккаунта</button>'}</div>
    </div></section>`;
}
function fabs(){
  if(!SAMPLE||(farm&&!aiEnabled)||ui.photo||(ui.chat&&ui.chat.open)||ui.feed) return '';
  return `<div class="fabs">
    ${SAMPLE_IMG?`<button class="fab alt" data-act="photo-open" aria-label="Фото: весы, кувшин, склад"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></button>`:''}
    <button class="fab" data-act="chat-open" aria-label="Спросить помощника"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg></button>
  </div>`;
}
const feedLink=(id)=>`<button class="link" data-act="feed" data-feed="${id}">${esc(F[id].name)}</button>`;
const GROUP={rough:'Грубый корм',conc:'Концентрат (зерно, комбикорм)',juicy:'Сочный корм',mineral:'Минеральная подкормка'};
const FEED_NOTES={
  seno_lug:'Основа рациона всех травоядных. Хорошее сено — зелёное, душистое, без пыли и плесени. Перед покупкой понюхайте и встряхните тюк.',
  seno_bob:'Клевер и люцерна — в 2 раза больше белка и кальция, чем в луговом. Лучшее сено для дойных коз и коровы. Влажное бобовое может вызвать вздутие.',
  soloma:'Мало питательна, годится как добавка к сену для сытости и подстилка. Основой рациона быть не может.',
  oves:'Самое безопасное зерно для лошадей. Козам и корове — дроблёным. Курам — не больше четверти зерновой смеси: много плёнок.',
  yachmen:'Энергичнее овса. Козам и корове давать дроблёным или плющеным, лошадям — понемногу, лучше запаренным.',
  pshenica:'Самое энергичное из привычных зёрен для кур. Жвачным — только дроблёной и немного: быстро бродит в рубце. Лошадям не давать.',
  kukuruza:'Много энергии, мало белка. Хороша зимой вечером курам. Жвачным — дроблёной и понемногу.',
  dert_oves:'Мука (дерть) усваивается лучше целого зерна. Давать смоченной, после сена.',
  dert_pshen:'Очень энергичная, быстро вызывает ацидоз — увеличивать по чуть-чуть, не больше трети всего зерна.',
  otrubi:'Много белка и фосфора, лёгкое послабляющее действие. Хороши в мешанку курам и дойным.',
  zhmyh:'Самый дешёвый источник белка. Давать понемногу: козе 100–200 г, корове до 1–1,5 кг, курам до 8% смеси.',
  kombi_koz:'Сбалансирован по белку и минералам. Козлам много не давать — риск мочекаменной болезни.',
  kombi_kury:'Основа рациона несушек: в нём белок, витамины, кальций. Чистое зерно без комбикорма — частая причина плохого пера и мелких яиц.',
  yabloki:'Лакомство и витамины. Давать нарезанными, приучать постепенно. Много яблок сразу — брожение и вздутие у коз и коровы.',
  morkov:'Каротин (витамин А) зимой — для молока, воспроизводства и здоровья. Давать нарезанной.',
  svekla:'Поднимает надой. Корове много можно, козам — до 1,5 кг, вводить постепенно.',
  tykva:'Витамины и сочность зимой, курам — тёртой в мешанку.',
  kartofel:'Дешёвая энергия. Курам — только варёный, отвар сливать, зелёные и проросшие клубни выбрасывать. Белка в нём мало — сочетать с добавкой или червём. Коровам можно сырой, мытый и нарезанный.',
  cherv:'Почти половина — белок. Хорош при плохом пере и в линьку: 5–10 г на курицу в день.',
  belok:'Состав у добавок разный — сверьте с этикеткой. Обычно 5–10% от смеси для кур.',
  mel:'Кальций для молочных и при сене без бобовых. Давать по норме, не вволю.',
  rakushka:'Кальций для скорлупы. Держать в отдельной кормушке вволю, молодкам до начала кладки не давать.',
};
const SP_KEYS=['goat','buck','horse','cow','hens'];
function feedSheet(id){
  const f=F[id], st=S.feeds[id]||{}, inc=S.settings.includePlanned, feedings=+S.settings.feedings||2;
  const users=S.animals.filter(a=>!a.planned||inc).map(a=>({a,kg:calc(a).amounts[id]||0})).filter(x=>x.kg>0);
  const daily=users.reduce((s,x)=>s+x.kg*mult(x.a),0), ppk=pricePerKg(id), p=feedPack(id);
  const since=st.stockDate?Math.max(0,dayDiff(st.stockDate,todayISO())):0, known=st.stock!==undefined&&st.stock!=='';
  const left=Math.max(0,(+st.stock||0)-daily*since), daysLeft=daily>0?left/daily:Infinity;
  const hensOnly=f.for.length===1&&f.for[0]==='hens';
  const nutr=[
    ...(hensOnly?[]:[['Корм. единиц',fmt(f.kued,2)],['Перевар. протеин',fmt(f.pp,0)+' г']]),
    ...(f.kcal?[['Энергия (куры)',fmt(f.kcal,0)+' ккал'],['Сырой протеин',fmt(f.cp,0)+' г']]:[]),
    ['Кальций',fmt(f.ca,1)+' г'],['Сухое в-во',fmt(f.dm*100,0)+'%']];
  const caps=f.cap?Object.entries(f.cap).map(([k,v])=>`${SPECIES[k].label.toLowerCase()} — до ${f.g==='mineral'?fmt(v*1000,0)+' г':fmt(v,1)+' кг'}`).join(', '):'';
  const henCap=f.henMax&&f.henMax<1?`курам — не больше ${fmt(f.henMax*100,0)}% зерновой смеси`:f.hen?`курам — около ${fmt(f.hen*1000,0)} г на голову`:'';
  const notUsed=SP_KEYS.filter(k=>f.for.includes(k)&&!S.animals.some(a=>a.sp===k&&(a.feeds||[]).includes(id))).map(k=>SPECIES[k].label);
  return `<div class="sheet-bg" data-act="feed-close"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(f.name)}" data-stop="1">
    <div class="card-head"><h2><svg class="wheat" aria-hidden="true"><use href="#ear"/></svg>${esc(f.name)}</h2><button class="ghost" data-act="feed-close" aria-label="Закрыть">✕ Закрыть</button></div>
    <div class="hint" style="margin-top:-8px">${GROUP[f.g]} · питательность 1 кг</div>
    <div class="facts">${nutr.map(([k,v])=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
    ${FEED_NOTES[id]?`<div class="tip idea"><div><span class="who">Как давать</span><p>${esc(FEED_NOTES[id])}</p></div></div>`:''}
    ${caps||henCap?`<div class="tip bad"><div><span class="who">Безопасный максимум в день</span><p>${[caps,henCap].filter(Boolean).join('; ')}.</p></div></div>`:''}
    <div><h3 style="margin-bottom:6px">Кто ест и сколько</h3>
    ${users.length?`<div class="tbl-wrap"><table><thead><tr><th>Животное</th><th class="n">в день</th><th class="n">за раз</th></tr></thead><tbody>
      ${users.map(({a,kg})=>{const h=a.sp==='hens';return `<tr><td>${esc(a.name)}${h?`<span class="small">${fmt(a.count,0)} голов, на 1 курицу ${kgOrG(kg,true)}</span>`:''}${a.planned?'<span class="small">в планах</span>':''}</td><td class="n big">${kgOrG(kg*mult(a),false)}</td><td class="n">${f.g==='mineral'?'вволю':kgOrG(kg*mult(a)/feedings,false)}</td></tr>`;}).join('')}
      <tr><td><strong>Всего</strong></td><td class="n big">${kgOrG(daily,false)}</td><td class="n">${fmt(daily*30,0)} кг/мес.</td></tr>
    </tbody></table></div>`:'<p class="hint" style="margin:0">Сейчас никому не даётся.</p>'}
    ${notUsed.length?`<p class="hint" style="margin:6px 0 0">Можно добавить в рацион: ${notUsed.join(', ')} — через «Составить рацион» в карточке животного.</p>`:''}</div>
    <div class="facts">
      <div><div class="k">На складе ≈</div><div class="v">${known?fmt(left,0)+' кг':'—'}</div></div>
      <div><div class="k">Хватит на</div><div class="v">${known&&daily>0?fmt(daysLeft,0)+' дн.':'—'}</div></div>
      <div><div class="k">Цена за кг</div><div class="v">${ppk?money(ppk):'—'}</div></div>
      <div><div class="k">В день</div><div class="v">${ppk&&daily?money(daily*ppk):'—'}</div></div>
      <div><div class="k">В месяц</div><div class="v">${ppk&&daily?money(daily*ppk*30):'—'}</div></div>
      ${p.kg>1&&daily>0?`<div><div class="k">${p.name==='тюк'?'Тюков':'Мешков'} в месяц</div><div class="v">${fmt(daily*30/p.kg,1)}</div></div>`:''}
    </div>
    <div class="form-grid">
      <label class="f">Цена ${p.kg>1?`за ${p.name}`:'за кг'}, ${cur()}<input id="sp-${id}" inputmode="decimal" data-price="${id}" value="${st.price?fmt(st.price,2):''}" placeholder="0"></label>
      ${p.kg>1?`<label class="f">Вес ${p.name==='тюк'?'тюка':'мешка'}, кг<input id="spk-${id}" inputmode="decimal" data-pack="${id}" value="${fmt(p.kg,1)}"></label>`:''}
    </div>
    <details ${ui.open['ovr-'+id]?'open':''} data-det="ovr-${id}"><summary>${f.custom?'Питательность своего корма':'Своя питательность — по анализу корма'}${f.overridden?' (изменено)':''}</summary>
      <div class="form-grid">${[['kued','Корм. единиц'],['pp','Перевар. протеин, г'],['ca','Кальций, г'],['p','Фосфор, г'],['dm','Сухое в-во, %'],['car','Каротин, мг'],...(f.for.includes('hens')?[['kcal','Энергия (куры), ккал'],['cp','Сырой протеин, г']]:[])]
        .filter(([k])=>!(hensOnly&&['kued','pp','car'].includes(k)))
        .map(([k,l])=>`<label class="f">${l}<input id="ov-${id}-${k}" inputmode="decimal" data-ovr="${id}" data-k="${k}" value="${k==='dm'?fmt((f.dm||0)*100,0):fmt(f[k]||0,2)}"></label>`).join('')}</div>
      <p class="hint" style="margin:8px 0 0">Значения на 1 кг корма — из лабораторного анализа (сено очень разное по качеству) или с этикетки мешка. Все рационы сразу пересчитаются.</p>
      ${f.overridden?`<button class="ghost" data-act="ovr-reset" data-feed="${id}">Вернуть справочные значения</button>`:''}
    </details>
    <button class="primary" data-act="feed-stock" data-feed="${id}">Остаток — во «Запасах»</button>
  </div></div>`;
}

function viewEmpty(){
  return `<div class="card empty">
    <div class="row" style="justify-content:center">${['horse','cow','goat','buck','hens'].map(k=>aniIcon(k,'lg')).join('')}</div>
    <h2>Хозяйство пока пустое</h2>
    <p class="hint">Добавьте животных — приложение посчитает, сколько сена, зерна и других кормов давать каждому в день.</p>
    ${addButtons()}
  </div>
  ${session?`<div class="card" style="margin-top:12px"><strong>Вас пригласили в хозяйство?</strong>
    <div class="row"><input id="join-code" placeholder="КОД" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.12em;width:150px"><button class="primary" data-act="join-farm">Присоединиться</button></div>
    <p class="hint" style="margin:0">Код из 8 букв и цифр даёт владелец хозяйства.</p></div>`:''}`;
}
function addButtons(){
  return `<div class="row" style="justify-content:center">${Object.entries(SPECIES).map(([k,s])=>`<button class="add" data-act="add" data-sp="${k}">${aniIcon(k,'sm')}+ ${s.label}</button>`).join('')}</div>`;
}
function aniIcon(sp,size=''){ return `<svg class="ani ${size}" viewBox="0 0 64 64" aria-hidden="true"><use href="#ic-${sp}"/></svg>`; }

function balRow(label, val, norm, unit, kind, dec=0){
  const r=norm>0?val/norm:0, st=status(r,kind);
  const w=Math.min(r,1.4)/1.4*100, mark=1/1.4*100;
  const txt=kind==='max'?`${fmt(val,dec)} из макс. ${fmt(norm,dec)} ${unit}`:`${fmt(val,dec)} / ${fmt(norm,dec)} ${unit}`;
  return `<div class="bal-row"><span class="lbl">${label}</span><span class="val">${txt} <span class="pill ${st}">${kind==='max'?(st==='bad'?'много':'ок'):(r>1.2&&kind==='energy'?'избыток':stTxt[st])}</span></span><div class="bar"><b class="${st}" style="width:${w}%"></b><s style="left:${mark}%"></s></div></div>`;
}

function ratioRow(t,a){
  if(!t.p) return '';
  const r=t.ca/t.p, hi=a.sp==='horse'?4:3, st=r<1?'bad':(r<1.2||r>hi)?'warn':'ok';
  return `<div class="bal-row"><span class="lbl">Кальций : фосфор (норма 1,2–${hi} : 1)</span><span class="val">${fmt(r,1)} : 1 <span class="pill ${st}">${st==='ok'?'в норме':r<1.2?'мало кальция':'мало фосфора'}</span></span></div>`;
}
function animalCard(a){
  const {amounts,t,nd}=calc(a), hens=a.sp==='hens', feedings=+S.settings.feedings||2, editing=ui.edit[a.id];
  const ids=selFeeds(a).map(f=>f.id);
  const rows=ids.map(id=>{
    const kg=amounts[id]||0, f=F[id];
    const perFeed=f.g==='mineral'?'вволю':kgOrG(kg/feedings,hens);
    const val=editing?`<input class="num" inputmode="decimal" id="m-${a.id}-${id}" data-man="${id}" data-id="${a.id}" value="${hens?fmt(kg*1000,0):fmt(kg,2)}" aria-label="${esc(f.name)}, ${hens?'г на курицу':'кг в день'}">`:`<span class="big">${kgOrG(kg,hens)}</span>`;
    return `<tr><td>${feedLink(id)}${hens&&!editing?`<span class="small">на всё стадо: ${kgOrG(kg*mult(a),false)}</span>`:''}</td><td class="n">${val}</td><td class="n">${editing?`<button class="ghost" data-act="rm-feed" data-feed="${id}" data-id="${a.id}" aria-label="Убрать ${esc(f.name)}">✕</button>`:perFeed}</td></tr>`;
  }).join('');
  const addable=FEEDS.filter(f=>f.for.includes(a.sp)&&!ids.includes(f.id));
  const builder=editing?`<div class="builder">
      <label class="f">Добавить корм в рацион<select id="addf-${a.id}" data-add-feed="${a.id}"><option value="">— выберите корм —</option>${addable.map(f=>`<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label>
      <p class="hint" style="margin:0">Впишите количество ${hens?'в граммах на одну курицу':'в кг в день'} — полоски ниже сразу покажут, хватает ли энергии, белка и кальция.</p>
    </div>`:'';
  const bal=hens?
    balRow('Энергия',t.kcal,nd.kcal,'ккал','energy')+balRow('Сырой протеин',t.cp,nd.cp,'г','')+balRow('Кальций',t.ca,nd.ca,'г','',1)+balRow('Фосфор',t.p,nd.p,'г','',2):
    balRow('Энергия, корм. ед.',t.kued,nd.kued,'','energy',2)+balRow('Переваримый протеин',t.pp,nd.pp,'г','')+balRow('Кальций',t.ca,nd.ca,'г','')+balRow('Фосфор',t.p,nd.p,'г','',1)+ratioRow(t,a)+balRow('Каротин (витамин А)',t.car,nd.car,'мг','')+balRow('Сухое вещество',t.dm,nd.dmMax,'кг','max',1);
  const water=hens?`${fmt(nd.water[0]*mult(a),1)}–${fmt(nd.water[1]*mult(a),1)} л на стадо`:`${fmt(nd.water[0],0)}–${fmt(nd.water[1],0)} л`;
  return `<article class="card" id="card-${a.id}">
    <div class="card-head">
      <div class="who-row">${aniIcon(a.sp)}<div><h3>${esc(a.name)}</h3><div class="meta">${hens?`${fmt(a.count,0)} голов`:`${fmt(a.w,0)} кг`} · ${esc(stateText(a))}</div></div></div>
      <div class="chips">${a.planned?'<span class="chip plan">в планах</span>':''}${a.manual?'<span class="chip">свой рацион</span>':'<span class="chip">авторасчёт</span>'}</div>
    </div>
    ${ids.length?`<div class="tbl-wrap"><table><thead><tr><th>Корм</th><th class="n">${hens?'на 1 курицу':'в день'}</th><th class="n">${editing?'':`за раз (${feedings}×)`}</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p class="hint">Кормов пока нет. ${editing?'Выберите первый корм ниже.':'Нажмите «Составить рацион».'}</p>`}
    ${builder}
    ${optPanel(a)}
    <div class="bal">${bal}</div>
    <div class="extra"><span>Вода: <strong>${water}</strong></span>${hens?'':`<span>Соль: <strong>${nd.salt}</strong> (лизунец)</span>`}${(()=>{const c=animalCost(a); return c>0?`<span>Корм: <strong>${money(c)}/день</strong> · ${money(c*30)}/мес.</span>`:'';})()}</div>
    <div class="row">
      <button class="${editing?'primary':'ghost'}" data-act="toggle-edit" data-id="${a.id}">${editing?'Готово':'Составить рацион'}</button>
      ${editing?`<button class="ghost" data-act="clear-manual" data-id="${a.id}">Начать с нуля</button>`:''}
      ${ui.opt[a.id]?'':`<button class="ghost" data-act="optimize" data-id="${a.id}">Подобрать дешевле</button>`}
      ${a.manual?`<button class="ghost" data-act="reset-manual" data-id="${a.id}">Вернуть авторасчёт</button>`:''}
    </div>
  </article>`;
}

function viewRation(){
  const inc=S.settings.includePlanned, tot=herdDaily(inc), feedings=+S.settings.feedings||2;
  const planned=S.animals.filter(a=>a.planned);
  const rows=Object.entries(tot).sort((x,y)=>FEEDS.indexOf(F[x[0]])-FEEDS.indexOf(F[y[0]])).map(([id,kg])=>{
    const p=feedPack(id), packs=p.kg>1&&kg/p.kg>=.1?`<span class="small">≈ ${fmt(kg/p.kg,1)} ${packWord(p.name,kg/p.kg)} в день</span>`:'';
    return `<tr><td>${feedLink(id)}${packs}</td><td class="n big">${fmt(kg,kg<1?2:1)} кг</td><td class="n">${fmt(kg/feedings,kg<1?2:1)} кг</td></tr>`;
  }).join('');
  const cards=S.animals.filter(a=>!a.planned).map(animalCard).join('');
  const pcards=planned.map(animalCard).join('');
  const low=lowStock(), bad=S.animals.filter(a=>!a.planned).flatMap(adviceFor).filter(x=>x.lv==='bad');
  const alerts=(low.length||bad.length)?`<section class="section"><div class="advice">
    ${low.length?`<div class="tip ${low[0].days<7?'bad':'warn'}" data-tab="stock" style="cursor:pointer"><div><span class="who">Пора докупать</span><p>${low.map(x=>`${esc(x.name)} — ${x.days<1?'закончился':`на ${fmt(x.days,0)} дн.`}`).join(' · ')}</p></div></div>`:''}
    ${bad.length?`<div class="tip bad" data-tab="tips" style="cursor:pointer"><div><span class="who">Опасно для здоровья: ${bad.length}</span><p>${bad.map(x=>esc(x.who)).filter((v,i,arr)=>arr.indexOf(v)===i).join(', ')} — откройте «Советы».</p></div></div>`:''}
  </div></section>`:'';
  return `${alerts}
  <section class="section">
    <div class="section-head"><h2>Всего на день</h2>
      <div class="row"><span class="hint">Кормлений в день</span>
        <div class="seg">${[1,2,3].map(n=>`<button data-act="feedings" data-n="${n}" aria-pressed="${feedings===n}">${n}</button>`).join('')}</div></div></div>
    <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Корм</th><th class="n">в день</th><th class="n">за раз</th></tr></thead><tbody>${rows||'<tr><td colspan="3" class="hint">Нет кормов</td></tr>'}</tbody></table></div>
    ${planned.length?`<label class="row" style="font-size:14px"><input type="checkbox" id="inc-planned" data-act="inc-planned" ${inc?'checked':''}> Учитывать животных «в планах» (${planned.map(a=>esc(a.name)).join(', ')})</label>`:''}
    </div>
  </section>
  <section class="section"><div class="section-head"><h2>По животным</h2><span class="hint">норма рассчитана по весу и состоянию</span></div>${cards}</section>
  ${pcards?`<section class="section"><div class="section-head"><h2>В планах</h2><span class="hint">рацион заранее — чтобы запасти корм</span></div>${pcards}</section>`:''}`;
}

/* ---------- Запасы ---------- */
function periodDays(){
  const s=S.settings;
  if(s.period==='month') return 30;
  if(s.period==='custom') return Math.max(1,+s.customDays||1);
  let d=dayDiff(todayISO(), s.seasonEnd||'2027-05-01'); return d>0?d:1;
}
function viewStock(){
  const s=S.settings, inc=s.includePlanned, daily=herdDaily(inc), days=periodDays();
  const used=FEEDS.filter(f=>daily[f.id]>0||(S.feeds[f.id]&&+S.feeds[f.id].stock>0));
  let costDay=0, buyCost=0, firstOut=null, noPrice=0;
  const items=used.map(f=>{
    const st=S.feeds[f.id]||{}, d=daily[f.id]||0, ppk=pricePerKg(f.id);
    const base=+st.stock||0, since=st.stockDate?Math.max(0,dayDiff(st.stockDate,todayISO())):0;
    const left=Math.max(0,base-d*since), daysLeft=d>0?left/d:Infinity, need=d*days, buy=Math.max(0,need-left);
    const known=st.stock!==undefined&&st.stock!=='';
    costDay+=d*ppk; buyCost+=(known?buy:need)*ppk; if(d>0&&!ppk) noPrice++;
    if(known&&d>0&&(!firstOut||daysLeft<firstOut.days)) firstOut={name:f.name,days:daysLeft};
    return {f,st,d,ppk,left,daysLeft,need,buy,known};
  });
  const periodLbl=s.period==='month'?'на месяц':s.period==='custom'?`на ${days} дн.`:`до ${new Date((s.seasonEnd||'2027-05-01')+'T00:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}`;
  const cards=items.map(({f,st,d,ppk,left,daysLeft,need,buy,known})=>{
    const p=feedPack(f.id), packTxt=(kg)=>p.kg>1&&kg>0?` · ≈ ${fmt(kg/p.kg,1)} ${packWord(p.name,kg/p.kg)}`:'';
    const dl=!known?'<span class="pill warn">остаток не указан</span>':d<=0?'<span class="chip">не расходуется</span>':
      `<span class="pill ${daysLeft<7?'bad':daysLeft<30?'warn':'ok'}">хватит на ${fmt(daysLeft,0)} дн. · до ${addDays(daysLeft)}</span>`;
    return `<article class="card">
      <div class="card-head"><h3 id="stk-${f.id}">${feedLink(f.id)}</h3>${dl}</div>
      <div class="stock-grid">
        <div><div class="k">Расход в день</div><div class="v">${fmt(d,d<1?2:1)} кг</div></div>
        <div><div class="k">Остаток сейчас ≈</div><div class="v">${known?fmt(left,0)+' кг':'—'}</div></div>
        <div><div class="k">Нужно ${periodLbl}</div><div class="v">${fmt(need,0)} кг</div><div class="k">${packTxt(need).replace(' · ','')}</div></div>
        <div><div class="k">Докупить</div><div class="v">${known?fmt(buy,0)+' кг':'—'}</div><div class="k">${known&&ppk?money(buy*ppk):''}</div></div>
        <div><div class="k">В день, ${cur()}</div><div class="v">${ppk?money(d*ppk):'—'}</div></div>
      </div>
      <details ${ui.open[f.id]?'open':''} data-det="${f.id}"><summary>Остаток и цена</summary>
        <div class="form-grid">
          <label class="f">На складе сейчас, кг<input id="st-${f.id}" inputmode="decimal" data-stock="${f.id}" value="${known?Math.round(left):''}" placeholder="взвесить"></label>
          <label class="f">Привезли, кг<span class="row"><input id="add-${f.id}" inputmode="decimal" class="num" placeholder="0"><button data-act="add-stock" data-feed="${f.id}">+</button></span></label>
          ${p.name!=='кг'||f.g==='rough'||f.g==='conc'?`<label class="f">Вес ${p.name==='тюк'?'тюка':'мешка'}, кг<input id="pk-${f.id}" inputmode="decimal" data-pack="${f.id}" value="${fmt(p.kg,1)}"></label>`:''}
          <label class="f">Цена ${p.kg>1?`за ${p.name}`:'за кг'}, ${cur()}<input id="pr-${f.id}" inputmode="decimal" data-price="${f.id}" value="${st.price?fmt(st.price,2):''}" placeholder="0"></label>
        </div>
        ${known&&st.stockDate?`<p class="hint" style="margin:8px 0 0">Остаток записан ${new Date(st.stockDate+'T00:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}: ${fmt(st.stock,0)} кг. Дальше считается по дневному расходу — время от времени взвешивайте и поправляйте.</p>`:''}
      </details>
    </article>`;
  }).join('');
  return `
  <section class="section">
    <div class="section-head"><h2>Сводка</h2></div>
    <div class="summary">
      <div class="stat"><span class="k">Корма в день</span><span class="v">${costDay?money(costDay):'—'}</span><span class="s">${noPrice?`без цены: ${noPrice} корм.`:'по ценам ниже'}</span></div>
      <div class="stat"><span class="k">В месяц</span><span class="v">${costDay?money(costDay*30):'—'}</span><span class="s">30 дней</span></div>
      <div class="stat"><span class="k">Докупить ${periodLbl}</span><span class="v">${buyCost?money(buyCost):'—'}</span><span class="s">${days} дн.</span></div>
      <div class="stat"><span class="k">Раньше всех кончится</span><span class="v" style="font-size:16px">${firstOut?esc(firstOut.name):'—'}</span><span class="s">${firstOut?`через ${fmt(firstOut.days,0)} дн. · ${addDays(firstOut.days)}`:'укажите остатки'}</span></div>
    </div>
    <div class="card">
      <div class="row"><span class="hint">Считать запас</span>
        <div class="seg">${[['month','На месяц'],['season','До конца зимы'],['custom','Свой срок']].map(([k,l])=>`<button data-act="period" data-p="${k}" aria-pressed="${s.period===k}">${l}</button>`).join('')}</div></div>
      ${s.period==='season'?`<label class="f">Стойловый период до<input type="date" id="season-end" data-set="seasonEnd" value="${esc(s.seasonEnd)}"></label>`:''}
      ${s.period==='custom'?`<label class="f">Дней<input id="custom-days" inputmode="numeric" data-set="customDays" value="${esc(s.customDays)}"></label>`:''}
      ${S.animals.some(a=>a.planned)?`<label class="row" style="font-size:14px"><input type="checkbox" id="inc-planned2" data-act="inc-planned" ${inc?'checked':''}> Учитывать животных «в планах»</label>`:''}
    </div>
  </section>
  ${(()=>{
    const list=S.animals.filter(a=>!a.planned||inc).map(a=>({a,c:animalCost(a)})), tot=list.reduce((s,x)=>s+x.c,0);
    if(!tot) return '';
    return `<section class="section"><div class="section-head"><h2>Расходы по животным</h2><span class="hint">по указанным ценам</span></div>
    <div class="card"><div class="tbl-wrap"><table><thead><tr><th>Животное</th><th class="n">в день</th><th class="n">в месяц</th><th class="n">доля</th></tr></thead><tbody>
    ${list.map(({a,c})=>`<tr><td>${esc(a.name)}${a.sp==='hens'?`<span class="small">${fmt(a.count,0)} голов · ${money(c/Math.max(1,+a.count||1)*30)} на курицу в мес.</span>`:''}${a.planned?'<span class="small">в планах</span>':''}</td><td class="n">${money(c)}</td><td class="n">${money(c*30)}</td><td class="n">${fmt(c/tot*100,0)}%</td></tr>`).join('')}
    </tbody></table></div></div></section>`;
  })()}
  <section class="section"><div class="section-head"><h2>Корма на складе</h2><span class="hint">остаток уменьшается сам по дневному расходу</span></div>${cards||'<p class="hint">Нет кормов в рационах.</p>'}</section>`;
}

/* ---------- Советы ---------- */
function proteinOptions(a, def){
  const sel=new Set(a.feeds), out=[];
  if(a.sp!=='hens'){
    if(sel.has('seno_lug')) out.push(`заменить ${fmt(def/57,1)} кг лугового сена на бобовое (клевер, люцерна)`);
    out.push(`добавить ${fmt(def/126,2)} кг пшеничных отрубей`);
    out.push(`или ${fmt(def/330*1000,0)} г подсолнечного жмыха`);
  }
  return out.join(', ');
}
function adviceFor(a){
  const {amounts,t,nd}=calc(a), out=[], n=a.name;
  if(a.sp==='hens'){
    if(t.cp<nd.cp*.92){
      out.push({lv:'warn',who:n,txt:`Не хватает белка: ${fmt(t.cp,1)} г вместо ${nd.cp} г на курицу. Отсюда плохое перо и падение яйценоскости. Добавьте мучного червя (5–10 г), белковую добавку, отруби/жмых (до 10%), рыбную муку или творог, либо поднимите долю комбикорма для несушек до 70–80% зерновой части.`});
      if(!a.feeds.includes('kombi_kury')) out.push({lv:'idea',who:n,txt:'Без комбикорма для несушек сложно набрать белок, витамины и минералы — включите его как основу (50–80%).'});
    }
    if(t.ca<nd.ca*.9) out.push({lv:'warn',who:n,txt:'Мало кальция — тонкая скорлупа. Ракушку и мел держите в отдельной кормушке вволю.'});
    if(t.kcal<nd.kcal*.9) out.push({lv:'warn',who:n,txt:`Мало энергии: ${fmt(t.kcal,0)} ккал вместо ${nd.kcal}. Зимой добавьте 10–15 г кукурузы или пшеницы на вечернее кормление.`});
    if((amounts.oves||0)/Math.max(.001,Object.values(amounts).reduce((s,v)=>s+v,0))>.27) out.push({lv:'warn',who:n,txt:'Овса больше 25% — много оболочек. Лучше пророщенный или плющеный овёс.'});
    if(t.p<nd.p*.85) out.push({lv:'warn',who:n,txt:`Мало фосфора: ${fmt(t.p,2)} г вместо ${fmt(nd.p,2)} г. Он нужен для скорлупы и костей — добавьте комбикорм для несушек или отруби (до 10% смеси).`});
    return out;
  }
  if(t.kued<nd.kued*.92){
    const best=selFeeds(a).filter(f=>f.g==='conc').sort((x,y)=>y.kued-x.kued)[0]||F.oves;
    out.push({lv:t.kued<nd.kued*.8?'bad':'warn',who:n,txt:`Не хватает энергии: ${fmt(t.kued,2)} из ${fmt(nd.kued,2)} корм. ед. Добавьте ≈ ${fmt((nd.kued-t.kued)/best.kued,2)} кг ${best.name.toLowerCase()}${a.sp==='horse'?' или больше сена':''}.`});
  }
  if(t.kued>nd.kued*1.2) out.push({lv:'warn',who:n,txt:`Энергии больше нормы на ${fmt((t.kued/nd.kued-1)*100,0)}% — животное будет жиреть. Уменьшите зерно.`});
  if(t.pp<nd.pp*.92) out.push({lv:t.pp<nd.pp*.8?'bad':'warn',who:n,txt:`Не хватает белка (переваримого протеина) ≈ ${fmt(nd.pp-t.pp,0)} г. Варианты: ${proteinOptions(a,nd.pp-t.pp)}.${a.sp==='goat'||a.sp==='cow'?' Именно белок чаще всего ограничивает надой.':''}`});
  if(t.ca<nd.ca*.9) out.push({lv:'warn',who:n,txt:`Мало кальция ≈ ${fmt(nd.ca-t.ca,0)} г. Добавьте ${fmt((nd.ca-t.ca)/370*1000,0)} г мела кормового или бобовое сено.`});
  if(t.dm>nd.dmMax*1.05) out.push({lv:'bad',who:n,txt:`Рацион слишком объёмный: ${fmt(t.dm,1)} кг сухого вещества при максимуме ${fmt(nd.dmMax,1)} — животное не съест всё, корм уйдёт в подстилку.`});
  if(t.dm>0&&t.concDm/t.dm>.5) out.push({lv:'bad',who:n,txt:'Зерна больше половины рациона — риск ацидоза и колик. Добавьте сена, зерно делите на 2–3 раза.'});
  for(const f of selFeeds(a)) if(f.cap&&f.cap[a.sp]&&(amounts[f.id]||0)>f.cap[a.sp]*1.01) out.push({lv:'warn',who:n,txt:`${f.name}: ${fmt(amounts[f.id],2)} кг — больше безопасного (${fmt(f.cap[a.sp]*(f.g==='mineral'?1000:1),f.g==='mineral'?0:1)} ${f.g==='mineral'?'г':'кг'} в день).`});
  if(t.p<nd.p*.9) out.push({lv:'warn',who:n,txt:`Мало фосфора ≈ ${fmt(nd.p-t.p,1)} г. Добавьте ≈ ${fmt((nd.p-t.p)/9.6,2)} кг пшеничных отрубей или немного зерна. Нехватка фосфора — плохой аппетит, грызут доски и землю, падает надой.`});
  else if(t.p>0){ const r=t.ca/t.p, hi=a.sp==='horse'?4:3;
    if(r<1.2) out.push({lv:'warn',who:n,txt:`Кальция мало по сравнению с фосфором (${fmt(r,1)} : 1, нужно не меньше 1,2 : 1). Добавьте ≈ ${fmt(Math.max(0,(1.5*t.p-t.ca))/370*1000,0)} г мела кормового или бобовое сено.`});
    if(r>hi) out.push({lv:'warn',who:n,txt:`Кальция в ${fmt(r,1)} раза больше фосфора — фосфор плохо усваивается. Добавьте немного отрубей или зерна.`}); }
  if(nd.car&&t.car<nd.car*.85) out.push({lv:'warn',who:n,txt:`Мало каротина (витамина А): ${fmt(t.car,0)} из ${fmt(nd.car,0)} мг. Добавьте ≈ ${fmt((nd.car-t.car)/80,1)} кг моркови или тыкву; лучше всего — зелёное, хорошо высушенное сено. Зимой давайте премикс с витаминами A, D, E.`});
  if(a.sp==='horse'&&a.state==='rest'&&t.conc>.003*a.w) out.push({lv:'warn',who:n,txt:'Лошади без работы много зерна не нужно: избыток — риск ламинита и колик.'});
  return out;
}
const TIPS={
  goat:[
    'Дойной козе нужно 6–10 л воды в день. Зимой подогревайте до +10…+15 °C — коза пьёт больше и держит надой.',
    'Зерно давайте дроблёным, во время дойки, деля на 2–3 раза. Примерно 250–300 г зерна на каждый литр молока сверх первого.',
    'Лучшее для молока — мелкостебельное сено с клевером и люцерной и веточный корм (берёзовые, ивовые веники): больше белка и минералов.',
    'Сочные корма (морковь, свёкла, тыква) зимой поднимают надой. Яблоки — не больше 1 кг, нарезанные, приучать постепенно.',
    'Соль-лизунец и премикс для коз в свободном доступе. Дойка строго в одно время — каждый сбой режима снижает надой.',
    'Зимой без солнца и травы не хватает витаминов D и E: давайте премикс или витаминный лизунец, особенно дойным и за 1–2 месяца до окота.',
  ],
  buck:[
    'Вне случки козла не перекармливайте зерном: ожирение снижает активность, а избыток зерна — риск мочекаменной болезни.',
    'За 1–1,5 месяца до случки добавьте 0,5–0,8 кг зерна, морковь и витамины (А, Е).',
  ],
  horse:[
    'Основа рациона — сено, 1,5–2,5 кг на 100 кг веса. Лучше раздавать 3–4 раза или через сетку: лошадь не должна оставаться без корма дольше 4–5 часов.',
    'Вода вволю, 30–50 л. Зимой подогретая вода снижает риск колик.',
    'Без работы зерно не обязательно. При работе — овёс, не больше 2–2,5 кг за одно кормление, через час после работы.',
    'Соль-лизунец постоянно. Яблоки и морковь — лакомство до 1–2 кг. Зубы проверять раз в год.',
  ],
  cow:[
    'Новый корм вводите постепенно, 7–10 дней — иначе расстройство рубца и падение надоя.',
    'На 1 л молока — 300–400 г дерти. Дерть давайте после сена, смоченной водой, 2–3 раза в день.',
    'Сено и дерть из овса и пшеницы дают мало белка. Для надоя нужны бобовое сено, жмых или шрот подсолнечный.',
    'Сочные корма — около 1 кг свёклы или моркови на 1 л молока. Сухостой 45–60 дней до отёла.',
    'Соль и вода: дойной корове 60–100 л воды в сутки, поилка без перебоев.',
    'Кальций и фосфор держите в соотношении около 1,5–2 : 1. Зимой — премикс с витаминами A, D, E, особенно в сухостой и первые месяцы после отёла.',
  ],
  hens:[
    'Свет 14–16 часов в сутки — главный фактор зимней яйценоскости. Досвечивайте утром лампой с таймером.',
    'Утром — тёплая влажная мешанка (отруби, варёный картофель, тыква, комбикорм), вечером — целое зерно: ночью курам теплее.',
    'Ракушка и мел — в отдельной кормушке вволю, не в общем корме.',
    'Зимой давайте пророщенную пшеницу, сенную муку, тыкву — это витамины. Белок в корме не ниже 16%.',
    'В курятнике не ниже +10 °C. Вода не должна замерзать.',
    'Плохое перо и выдёргивание перьев — чаще всего нехватка белка и серосодержащих аминокислот (метионина). На выгуле куры добирают это червями и жуками; в загоне помогут мучной червь (5–10 г на курицу в день), белковая добавка, рыбная мука, творог или обрат.',
    'Облезлое перо бывает и от паразитов: осмотрите кур под крыльями и у клоаки на пухопероеда и красного клеща (особенно ночью на насестах). Поставьте ящик с золой и песком для купания.',
    'Сентябрь–ноябрь — естественная линька: перо выпадает само, яйценоскость падает. В это время белок поднимают до 18–20% — новое перо почти целиком из белка.',
    'Картофель — только варёный, без зелёных и проросших клубней, отвар слить. До 50–80 г на курицу в день во влажной мешанке с комбикормом или белковой добавкой. Он экономит зерно, но белка в нём мало — без добавки перо лучше не станет.',
    'Выгул даже на 2–3 часа (или дёрн, трава, ботва в загон) даёт белок, витамины и снижает расклёв перьев от скуки.',
  ],
};
const DANGER={
  all:[
    'Любой новый корм или другую партию сена вводите постепенно, за 7–10 дней: начинайте с 10–20% от новой порции.',
    'Зерно прибавляйте понемногу: козе — не больше 100–200 г, корове и лошади — не больше 0,5 кг за 2–3 дня.',
    'Не давайте заплесневелое, затхлое, пыльное, мокрое или промёрзшее сено и зерно — отравления, колики, у коз и коров листериоз.',
    'Храните зерно и яблоки закрытыми: если животное доберётся до мешка, обжорство зерном опасно для жизни.',
  ],
  goat:[
    'Яблоки — не больше 0,5–1 кг в день, нарезанными, приучать постепенно. Много яблок или зерна сразу — ацидоз и вздутие (тимпания).',
    'Зерно — дроблёным и порциями, не больше 0,3–0,5 кг за раз.',
    'Ядовито для коз: вялые листья абрикоса, вишни, сливы, тис, рододендрон, олеандр, картофельная ботва, зелёный и проросший картофель.',
  ],
  buck:[
    'Козлу не давайте много зерна и комбикорма для дойных коз: избыток зерна вызывает мочекаменную болезнь. Основа — сено и вода.',
  ],
  horse:[
    'Не больше 2–2,5 кг зерна за одно кормление на лошадь 500 кг — иначе колики и ламинит.',
    'Не кормите зерном прямо перед работой и сразу после неё. Разгорячённую лошадь не поите холодной водой — подождите 30–60 минут.',
    'Комбикорм для КРС и птицы с монензином (ионофорами) смертельно опасен для лошадей. Не давайте кучу свежескошенной травы и плесневелое сено.',
    'Яблоки и морковь — нарезанными, до 1–2 кг в день: целые могут застрять в пищеводе.',
  ],
  cow:[
    'Дерть увеличивайте на 0,5 кг каждые 2–3 дня — резкий переход на много зерна или свёклы вызывает ацидоз рубца.',
    'Вздутие (тимпанию) вызывают мокрый клевер и люцерна, капуста, забродившие яблоки и свёкла. Сочное давайте после сена.',
    'Целые яблоки, картофель и свёклу режьте — могут застрять в пищеводе.',
  ],
  hens:[
    'Нельзя: солёное, сладкое, заплесневелый хлеб, зелёный и проросший картофель и его сырая кожура, авокадо.',
    'Ракушку не давайте молодкам до начала кладки — избыток кальция вредит почкам.',
    'Зимой вода не должна замерзать: без воды несушки перестают нестись через 1–2 дня.',
  ],
};
function viewTips(){
  const all=[]; for(const a of S.animals) adviceFor(a).forEach(x=>all.push({...x,planned:a.planned}));
  const now=all.filter(x=>!x.planned), later=all.filter(x=>x.planned);
  const tip=(x)=>`<div class="tip ${x.lv}"><div><span class="who">${esc(x.who)}</span><p>${esc(x.txt)}</p></div></div>`;
  // экономика
  const daily=herdDaily(false); let costs=Object.entries(daily).map(([id,kg])=>({id,c:kg*pricePerKg(id)})).filter(x=>x.c>0).sort((a,b)=>b.c-a.c);
  const sum=costs.reduce((s,x)=>s+x.c,0), econ=[];
  if(costs.length&&sum>0){ econ.push({lv:'idea',who:'Экономика',txt:`Больше всего денег уходит на «${F[costs[0].id].name}» — ${fmt(costs[0].c/sum*100,0)}% затрат на корм (${money(costs[0].c*30)} в месяц). Сравните цены у разных поставщиков или купите оптом осенью.`}); }
  for(const a of S.animals.filter(x=>!x.planned)){ const o=optimize(a), c=curCost(a);
    if(!o.fail&&c.known&&c.cost>0&&o.cost<c.cost*.92) econ.push({lv:'idea',who:a.name,txt:`Можно кормить на ${fmt((1-o.cost/c.cost)*100,0)}% дешевле, не нарушая норм — экономия ≈ ${money((c.cost-o.cost)*30)} в месяц. Нажмите «Подобрать дешевле» в карточке на вкладке «Рацион».`}); }
  if(!sum) econ.push({lv:'idea',who:'Экономика',txt:'Укажите цены кормов во вкладке «Запасы» — здесь появятся советы, где можно сэкономить.'});
  const sp=[...new Set(S.animals.map(a=>a.sp))];
  return `
  <section class="section"><div class="section-head"><h2>Что поправить в рационе</h2><span class="hint">по расчёту на сегодня</span></div>
    <div class="advice">${now.length?now.map(tip).join(''):'<div class="tip ok"><div><span class="who">Все животные</span><p>Рационы сбалансированы по энергии, белку и кальцию.</p></div></div>'}</div></section>
  ${later.length?`<section class="section"><div class="section-head"><h2>К приходу новых животных</h2></div><div class="advice">${later.map(tip).join('')}</div></section>`:''}
  <section class="section"><div class="section-head"><h2>Чего нельзя делать</h2><span class="hint">частые причины болезней</span></div>
    <div class="advice">${DANGER.all.map(t=>tip({lv:'bad',who:'Всем животным',txt:t})).join('')}${sp.map(k=>DANGER[k].map(t=>tip({lv:'bad',who:SPECIES[k].label,txt:t})).join('')).join('')}</div></section>
  <section class="section"><div class="section-head"><h2>Как поднять продуктивность</h2></div>
    <div class="advice">${sp.map(k=>TIPS[k].map(t=>tip({lv:'idea',who:SPECIES[k].label,txt:t})).join('')).join('')}</div></section>
  <section class="section"><div class="section-head"><h2>Экономика</h2></div><div class="advice">${econ.map(tip).join('')}</div></section>
  ${growthSection()}
  <p class="hint">Нормы ориентировочные, по зоотехническим справочникам. Если животное худеет, набирает лишнее или падает надой — меняйте рацион понемногу и советуйтесь с ветеринаром.</p>`;
}

/* ---------- Подбор самого дешёвого рациона (симплекс-метод) ---------- */
function lpMin(c, cons){
  const n=c.length;
  cons=cons.map(k=>k.b<0?{a:k.a.map(v=>-v),op:k.op==='<='?'>=':'<=',b:-k.b}:k);
  const m=cons.length; let nS=0,nA=0; cons.forEach(k=>{ nS++; if(k.op==='>=') nA++; });
  const N=n+nS+nA, T=[], basis=[]; let si=n, ai=n+nS;
  cons.forEach(k=>{ const row=new Array(N+1).fill(0); k.a.forEach((v,j)=>row[j]=v); row[N]=k.b;
    if(k.op==='<='){ row[si++]=1; basis.push(si-1); } else { row[si++]=-1; row[ai]=1; basis.push(ai++); }
    T.push(row); });
  const isArt=j=>j>=n+nS;
  const pivot=(r,col)=>{ const pv=T[r][col]; for(let j=0;j<=N;j++) T[r][j]/=pv;
    for(let i=0;i<m;i++) if(i!==r){ const f=T[i][col]; if(Math.abs(f)>1e-12) for(let j=0;j<=N;j++) T[i][j]-=f*T[r][j]; } basis[r]=col; };
  const run=(cost,allowed)=>{
    for(let it=0;it<800;it++){
      let enter=-1;
      for(let j=0;j<N;j++){ if(!allowed(j)||basis.includes(j)) continue; let rc=cost[j]; for(let i=0;i<m;i++) rc-=cost[basis[i]]*T[i][j]; if(rc<-1e-9){enter=j;break;} }
      if(enter<0) return true;
      let r=-1,best=Infinity; for(let i=0;i<m;i++) if(T[i][enter]>1e-9){ const q=T[i][N]/T[i][enter]; if(q<best-1e-12){best=q;r=i;} }
      if(r<0) return false; pivot(r,enter);
    } return false;
  };
  if(nA){ const c1=new Array(N).fill(0); for(let j=n+nS;j<N;j++) c1[j]=1; run(c1,()=>true);
    let s=0; for(let i=0;i<m;i++) if(isArt(basis[i])) s+=T[i][N]; if(s>1e-6) return null;
    for(let i=0;i<m;i++) if(isArt(basis[i])){ for(let j=0;j<n+nS;j++) if(Math.abs(T[i][j])>1e-9){ pivot(i,j); break; } } }
  const c2=new Array(N).fill(0); c.forEach((v,j)=>c2[j]=v);
  if(!run(c2,j=>!isArt(j))) return null;
  const x=new Array(n).fill(0); for(let i=0;i<m;i++) if(basis[i]<n) x[basis[i]]=T[i][N];
  return x;
}
const OPT_CAP={zhmyh:{goat:.25,buck:.15,horse:.5,cow:1.5},otrubi:{goat:.4,buck:.3,horse:1.5,cow:2.5},kombi_koz:{buck:.3}};
function curCost(a){
  const {amounts}=calc(a); let c=0, known=true;
  for(const [id,kg] of Object.entries(amounts)){ if(!kg) continue; const p=pricePerKg(id); if(!p) known=false; c+=kg*p; }
  return {cost:c*mult(a), known};
}
function optimize(a){
  const nd=needs(a), hens=a.sp==='hens', W=+a.w||0;
  const allowed=FEEDS.filter(f=>f.for.includes(a.sp));
  const cand=allowed.filter(f=>pricePerKg(f.id)>0);
  const missing=allowed.filter(f=>!(pricePerKg(f.id)>0)).map(f=>f.name);
  if(!cand.length) return {fail:true,missing};
  const col=(fn)=>cand.map(fn), unit=(i)=>cand.map((_,j)=>j===i?1:0);
  const levels=hens?[{},{soft:true}]:[{car:true},{},{soft:true}];
  for(const L of levels){
    const k=L.soft?.9:1, cons=[], ge=(v,b)=>cons.push({a:v,op:'>=',b}), le=(v,b)=>cons.push({a:v,op:'<=',b});
    if(hens){
      ge(col(f=>f.kcal||0),nd.kcal*k); le(col(f=>f.kcal||0),nd.kcal*1.1);
      ge(col(f=>f.cp||0),nd.cp*k); ge(col(f=>f.ca||0),nd.ca*.95*k); ge(col(f=>f.p||0),nd.p*k);
      le(col(()=>1),.17);
      cand.forEach((f,i)=>{
        if(f.g==='conc'&&(f.henMax||.3)<1) le(cand.map((g,j)=>(j===i?1:0)-(g.g==='conc'?(f.henMax||.3):0)),0);
        if(f.g==='juicy') le(unit(i),f.hen||.03);
        if(f.g==='mineral') le(unit(i),.01);
      });
    } else {
      ge(col(f=>f.kued),nd.kued*k); le(col(f=>f.kued),nd.kued*1.1);
      ge(col(f=>f.pp),nd.pp*k); ge(col(f=>f.ca),nd.ca*k); ge(col(f=>f.p||0),nd.p*.95*k);
      if(L.car) ge(col(f=>f.car||0),nd.car*.85);
      le(col(f=>f.dm),nd.dmMax);
      ge(col(f=>f.g==='rough'?1:0),a.sp==='horse'?.015*W:nd.rough*.85);
      le(col(f=>f.g==='conc'?1:0),nd.concMax);
      le(col(f=>f.dm*((f.g==='conc'?1:0)-.5)),0);
      cand.forEach((f,i)=>{
        const c=(f.cap&&f.cap[a.sp])||(OPT_CAP[f.id]&&OPT_CAP[f.id][a.sp]); if(c) le(unit(i),c);
        if(f.id==='pshenica'||f.id==='dert_pshen') le(cand.map((g,j)=>(j===i?1:0)-(g.g==='conc'?.34:0)),0);
      });
    }
    const x=lpMin(cand.map(f=>pricePerKg(f.id)+1e-4),cons);
    if(x){
      const am={};
      cand.forEach((f,i)=>{ let v=x[i]; if(v<(hens?.002:.02)) return;
        v=hens?Math.round(v/.005)*.005:f.g==='mineral'?Math.round(v*1000)/1000:rnd(v); if(v>0) am[f.id]=v; });
      const cost=Object.entries(am).reduce((s,[id,kg])=>s+kg*pricePerKg(id),0)*mult(a);
      return {amounts:am,cost,relaxed:L.soft?'soft':(!hens&&!L.car?'car':''),missing};
    }
  }
  return {fail:true,missing};
}
function optPanel(a){
  const o=ui.opt[a.id]; if(!o) return '';
  const close=`<button class="ghost" data-act="opt-close" data-id="${a.id}">Закрыть</button>`;
  if(o.fail) return `<div class="builder"><strong>Не получилось подобрать рацион</strong>
    <p class="hint" style="margin:0">Из кормов с указанной ценой норму не собрать. Нажмите на корм и впишите цену${o.missing.length?` — например: ${esc(o.missing.slice(0,6).join(', '))}`:''}. Чем больше кормов с ценой, тем дешевле получится.</p><div class="row">${close}</div></div>`;
  const hens=a.sp==='hens', cur=curCost(a), ids=Object.keys(o.amounts), isNew=ids.filter(id=>!(a.feeds||[]).includes(id));
  const diff=cur.known&&cur.cost>0?(o.cost-cur.cost)/cur.cost:null;
  const rows=ids.map(id=>`<tr><td>${feedLink(id)}${isNew.includes(id)?'<span class="small">новый корм</span>':''}</td><td class="n big">${kgOrG(o.amounts[id],hens)}</td><td class="n">${money(o.amounts[id]*pricePerKg(id)*mult(a))}</td></tr>`).join('');
  const verdict=diff===null?'У части нынешних кормов нет цены — сравнить с текущим рационом нельзя.':
    diff<-.01?`На <strong>${fmt(-diff*100,0)}% дешевле</strong> текущего: экономия ≈ ${money((cur.cost-o.cost)*30)} в месяц.`:'Текущий рацион уже почти самый дешёвый.';
  return `<div class="builder">
    <strong>Самый дешёвый рацион по нормам: ${money(o.cost)} в день · ${money(o.cost*30)} в месяц</strong>
    <p style="margin:0">${verdict}</p>
    <div class="tbl-wrap"><table><thead><tr><th>Корм</th><th class="n">${hens?'на 1 курицу':'в день'}</th><th class="n">стоимость в день</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${o.relaxed==='car'?'<p class="hint" style="margin:0">Каротин (витамин А) из этих кормов не добрать — добавьте цену на морковь или тыкву, либо давайте премикс.</p>':''}
    ${o.relaxed==='soft'?'<p class="hint" style="margin:0">Нормы выполнены только примерно на 90% — впишите цены других кормов, тогда расчёт будет точнее.</p>':''}
    ${isNew.length?`<p class="hint" style="margin:0">Новые корма вводите постепенно, за 7–10 дней.</p>`:''}
    <div class="row"><button class="primary" data-act="opt-apply" data-id="${a.id}">Применить этот рацион</button>${close}</div>
  </div>`;
}

/* ---------- Журнал продуктивности ---------- */
const KIND={milk:{l:'Надой',u:'л',sp:['goat','cow'],agg:'sum'},eggs:{l:'Яйца',u:'шт',sp:['hens'],agg:'sum'},weight:{l:'Вес',u:'кг',sp:['goat','buck','horse','cow'],agg:'avg'}};
const kindsFor=(a)=>Object.keys(KIND).filter(k=>KIND[k].sp.includes(a.sp));
const shortDate=(iso)=>new Date(iso+'T00:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});
function series(anId,kind){
  const by={}; for(const e of S.log) if(e.an===anId&&e.kind===kind){ (by[e.date]=by[e.date]||[]).push(+e.v||0); }
  return Object.keys(by).sort().map(d=>{ const v=by[d]; return {d, v:KIND[kind].agg==='sum'?v.reduce((s,x)=>s+x,0):v.reduce((s,x)=>s+x,0)/v.length}; });
}
const avg=(pts)=>pts.length?pts.reduce((s,p)=>s+p.v,0)/pts.length:null;
function spark(pts, change, unit){
  const W=320,H=96,pl=6,pr=6,pt=14,pb=18, last=pts.slice(-60);
  const d0=last[0].d, span=Math.max(1,dayDiff(d0,last[last.length-1].d));
  let lo=Math.min(...last.map(p=>p.v)), hi=Math.max(...last.map(p=>p.v)); if(hi-lo<1e-9){ lo-=1; hi+=1; } const padv=(hi-lo)*.12; lo-=padv; hi+=padv;
  const X=d=>pl+(W-pl-pr)*dayDiff(d0,d)/span, Y=v=>pt+(H-pt-pb)*(1-(v-lo)/(hi-lo));
  const path=last.map((p,i)=>(i?'L':'M')+X(p.d).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
  const ch=change&&change>d0&&change<=last[last.length-1].d?`<line x1="${X(change)}" x2="${X(change)}" y1="${pt-6}" y2="${H-pb}" stroke="var(--muted)" stroke-dasharray="3 3"/><text x="${Math.min(X(change)+4,W-90)}" y="${pt-4}" font-size="10" fill="var(--muted)">смена рациона</text>`:'';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="График за ${last.length} дн.">
    <line x1="${pl}" x2="${W-pr}" y1="${H-pb}" y2="${H-pb}" stroke="var(--line)"/>
    ${ch}<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${last.map(p=>`<g><circle cx="${X(p.d)}" cy="${Y(p.v)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(p.d)}" cy="${Y(p.v)}" r="11" fill="transparent"><title>${shortDate(p.d)}: ${fmt(p.v,1)} ${unit}</title></circle></g>`).join('')}
    <text x="${pl}" y="${H-4}" font-size="10" fill="var(--muted)">${shortDate(d0)}</text>
    <text x="${W-pr}" y="${H-4}" font-size="10" fill="var(--muted)" text-anchor="end">${shortDate(last[last.length-1].d)}</text>
  </svg>`;
}
function viewJournal(){
  const an=S.animals.filter(a=>!a.planned&&kindsFor(a).length);
  if(!an.length) return '<div class="card empty"><p class="hint">Добавьте животных во вкладке «Хозяйство».</p></div>';
  if(!an.find(a=>a.id===ui.jAnimal)) ui.jAnimal=an[0].id;
  const sel=animalById(ui.jAnimal), kinds=kindsFor(sel); if(!kinds.includes(ui.jKind)) ui.jKind=kinds[0];
  const K=KIND[ui.jKind];
  const form=`<div class="card">
    <div class="form-grid">
      <label class="f">Дата<input type="date" id="j-date" value="${todayISO()}"></label>
      <label class="f">Кто<select id="j-an" data-jset="jAnimal">${an.map(a=>`<option value="${a.id}" ${a.id===ui.jAnimal?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="f">Что записать<select id="j-kind" data-jset="jKind">${kinds.map(k=>`<option value="${k}" ${k===ui.jKind?'selected':''}>${KIND[k].l}, ${KIND[k].u}</option>`).join('')}</select></label>
      <label class="f">${K.l}, ${K.u}${ui.jKind==='eggs'?' (за день со всех кур)':ui.jKind==='milk'?' (можно утро и вечер отдельно)':''}<input id="j-val" inputmode="decimal" placeholder="0"></label>
    </div>
    <div class="row"><button class="primary" data-act="add-log">Записать</button><span class="hint">Записи за один день складываются (вес — усредняется).</span></div>
  </div>`;
  const cards=[];
  for(const a of an) for(const k of kindsFor(a)){
    const pts=series(a.id,k); if(!pts.length) continue; const U=KIND[k].u, ch=a.rationChanged;
    const last7=pts.filter(p=>dayDiff(p.d,todayISO())<7), before=ch?pts.filter(p=>p.d<ch&&dayDiff(p.d,ch)<=14):[], after=ch?pts.filter(p=>p.d>=ch):[];
    let cmp='';
    if(ch&&before.length>=2&&after.length>=2){ const b=avg(before), f=avg(after), d=b?(f-b)/b*100:0;
      cmp=`<p style="margin:0">После смены рациона (${shortDate(ch)}): в среднем <strong>${fmt(f,1)} ${U}</strong>, до — ${fmt(b,1)} ${U} <span class="pill ${k==='weight'?'ok':d>=2?'ok':d<=-2?'bad':'warn'}">${d>0?'+':''}${fmt(d,0)}%</span></p>`; }
    else if(ch) cmp=`<p class="hint" style="margin:0">Рацион меняли ${shortDate(ch)}. Записывайте ${KIND[k].l.toLowerCase()} несколько дней до и после — здесь появится сравнение.</p>`;
    cards.push(`<article class="card"><div class="card-head"><div class="who-row">${aniIcon(a.sp)}<div><h3>${esc(a.name)} · ${KIND[k].l}</h3><div class="meta">${pts.length} ${pts.length===1?'запись':'дн. с записями'}</div></div></div></div>
      <div class="facts"><div><div class="k">Последнее (${shortDate(pts[pts.length-1].d)})</div><div class="v">${fmt(pts[pts.length-1].v,1)} ${U}</div></div>
      <div><div class="k">Среднее за 7 дней</div><div class="v">${last7.length?fmt(avg(last7),1)+' '+U:'—'}</div></div></div>
      ${pts.length>1?spark(pts,ch,U):''}${cmp}</article>`);
  }
  const recent=[...S.log].sort((x,y)=>y.date.localeCompare(x.date)).slice(0,20);
  return `<section class="section"><div class="section-head"><h2>Записать</h2><span class="hint">надои, яйца, вес</span></div>${form}</section>
  <section class="section"><div class="section-head"><h2>Продуктивность</h2><span class="hint">растёт ли после смены рациона</span></div>${cards.join('')||'<p class="hint">Записей пока нет.</p>'}</section>
  ${recent.length?`<section class="section"><div class="section-head"><h2>Последние записи</h2></div><div class="card"><div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Кто</th><th class="n">Значение</th><th></th></tr></thead><tbody>
    ${recent.map(e=>{const a=animalById(e.an);return `<tr><td>${shortDate(e.date)}</td><td>${esc(a?a.name:'—')}</td><td class="n">${KIND[e.kind]?KIND[e.kind].l.toLowerCase()+' ':''}${fmt(e.v,1)} ${KIND[e.kind]?KIND[e.kind].u:''}</td><td class="n"><button class="ghost" data-act="del-log" data-log="${e.id}" aria-label="Удалить запись">✕</button></td></tr>`;}).join('')}
  </tbody></table></div></div></section>`:''}`;
}

/* ---------- Claude: фото, советы, план развития ---------- */
let SAMPLE=null, SAMPLE_IMG=false, IMG_MAX=1, DL=null;
async function initCaps(){
  // Claude — через свою Edge Function ask-farm (ключ на сервере). Файлы сохраняем обычной загрузкой.
  SAMPLE=makeSample(); SAMPLE_IMG=true; IMG_MAX=4; DL=null;
  render();
}
function errText(e){
  const c=e&&e.code;
  return c==='offline'?'Нет интернета — помощник и фото работают только со связью. Расчёты, запасы и журнал работают и без неё.':
    c==='not_granted'?'Помощник для этого хозяйства пока не включён.':
    c==='refused'||c==='empty_completion'?(e.serverText||'Claude не смог ответить — попробуйте спросить иначе.'):
    c==='rate_limited'?(e.serverText||'Слишком много запросов подряд — попробуйте чуть позже.'):
    c==='image_rejected'?'Фото не подошло — сделайте другое, поближе и при хорошем свете.':
    c==='invalid_json'?'Не удалось прочитать показание — сфотографируйте экран весов ближе и ровнее.':
    c==='images_unavailable'?'Здесь нельзя отправить фото Claude.':
    c==='sampling_disabled'?(e.serverText||'Помощник сейчас не настроен.'):
    c==='session_expired'?'Нужно заново войти в аккаунт.':
    'Нет связи с Claude — проверьте интернет и попробуйте ещё раз.';
}
function farmSummary(){
  const daily=herdDaily(false), lines=[];
  lines.push('Животные: '+S.animals.filter(a=>!a.planned).map(a=>`${a.name} (${SPECIES[a.sp].label.toLowerCase()}${a.sp==='hens'?', '+a.count+' голов':', '+a.w+' кг'}, ${stateText(a)})`).join('; '));
  const pl=S.animals.filter(a=>a.planned); if(pl.length) lines.push('В планах: '+pl.map(a=>a.name).join(', '));
  lines.push('Корма (расход в день / остаток / цена за кг):');
  for(const [id,kg] of Object.entries(daily)){ const st=S.feeds[id]||{}, since=st.stockDate?Math.max(0,dayDiff(st.stockDate,todayISO())):0;
    const left=st.stock!==undefined&&st.stock!==''?Math.max(0,(+st.stock||0)-kg*since):null;
    lines.push(`— ${F[id].name}: ${fmt(kg,2)} кг/день; остаток ${left===null?'не указан':fmt(left,0)+' кг (на '+fmt(left/kg,0)+' дн.)'}; цена ${pricePerKg(id)?money(pricePerKg(id)):'не указана'}`); }
  const tot=S.animals.filter(a=>!a.planned).reduce((s,a)=>s+curCost(a).cost,0); if(tot) lines.push(`Корм стоит ≈ ${money(tot)} в день, ${money(tot*30)} в месяц.`);
  const e=econ(); if(e.milkL) lines.push(`Молоко: ≈ ${fmt(e.milkL,1)} л в день, корм на литр ≈ ${e.milkCostL?money(e.milkCostL):'—'}${S.settings.milkPrice?', продаём по '+money(+S.settings.milkPrice)+'/л':''}.`);
  if(e.eggs) lines.push(`Яйца: ≈ ${fmt(e.eggs,1)} шт в день, корм на яйцо ≈ ${e.eggCost?money(e.eggCost):'—'}${S.settings.eggPrice?', продаём по '+money(+S.settings.eggPrice)+'/шт':''}.`);
  lines.push('Страна: Латвия. Цены в евро. Сегодня '+todayISO()+'.');
  return lines.join('\n');
}
function econ(){
  const recent=(an,kind)=>{ const pts=series(an,kind).filter(p=>dayDiff(p.d,todayISO())<7); return pts.length?avg(pts):null; };
  const milkers=S.animals.filter(a=>!a.planned&&(a.sp==='goat'||a.sp==='cow')&&a.state==='milk');
  let milkL=0, milkCost=0; for(const a of milkers){ const r=recent(a.id,'milk'); milkL+=r!==null?r:(+a.milk||0); milkCost+=curCost(a).cost; }
  const hens=S.animals.filter(a=>!a.planned&&a.sp==='hens'); let eggs=0, eggC=0, eggKnown=false;
  for(const a of hens){ const r=recent(a.id,'eggs'); if(r!==null){ eggs+=r; eggKnown=true; } eggC+=curCost(a).cost; }
  return {milkL, milkCostL:milkL&&milkCost?milkCost/milkL:0, eggs:eggKnown?eggs:0, eggCost:eggKnown&&eggs&&eggC?eggC/eggs:0, hens:hens.length};
}
const feedList=()=>FEEDS.map(f=>`${f.id} — ${f.name}`).join('\n');
const animalList=()=>S.animals.filter(a=>!a.planned).map(a=>`${a.id} — ${a.name}, ${SPECIES[a.sp].label.toLowerCase()}`).join('\n');
function photoPrompt(mode){
  if(mode==='weigh') return `Это фото с небольшой фермы: весы (кухонные, напольные, безмен, крановые) или мерная ёмкость с кормом для животных. Прочитай показание.
Ответь только JSON-объектом: {"value": число или null, "unit": "g" или "kg", "feed": id корма из списка ниже или null, "animal": id животного из списка ниже или null, "confidence": "high" | "medium" | "low", "note": "одно короткое предложение по-русски: что видно и как прочитано"}.
Если на весах видна тара и неясно, обнулены ли они, — напиши об этом в note. Если показание не видно — value null.
Корма (id — название):
${feedList()}
Животные (id — кличка, вид):
${animalList()}`;
  if(mode==='milk') return `На фото кувшин, банка, ведро или мерная ёмкость с молоком на ферме. Оцени объём молока по делениям или меткам на ёмкости (или по объёму тары, если он виден). Ответь только JSON: {"value": число литров или null, "confidence": "high" | "medium" | "low", "note": "одно короткое предложение по-русски, как оценено"}. Если делений нет — оцени примерно и поставь confidence "low".`;
  return `Ты — опытный зоотехник и специалист по хранению кормов и организации небольшой фермы. На фото — место хранения кормов (склад, сарай, кладовая, курятник или хлев).
Дай практичные советы по-русски, по тому, что действительно видно на фото:
1) Хранение: сырость, вентиляция, поддоны, расстояние от стен и пола, грызуны и птицы, плесень, закрытые бочки или ящики для зерна, защита сена от дождя и солнца.
2) Эргономика: что берут каждый день — ближе к выходу и на уровне пояса, тяжёлые мешки — внизу и у входа, широкий проход для тачки, порядок «первым привезли — первым скормили», подписи и мерные совки.
3) Логистика и закупки с учётом данных ниже: когда и сколько докупать, что выгодно брать оптом, как сократить ходьбу при раздаче корма.
Тон — тёплый и бережный, как у заботливой мамы, с уважением: сначала одной фразой отметь, что уже сделано хорошо, замечания — мягко, без упрёков.
Начни с трёх самых важных изменений. Если видишь опасное (плесень, проводка рядом с сеном, яд от грызунов рядом с кормом, протечка) — скажи об этом самым первым.
Пиши коротко, пунктами через «—», без заголовков с # и без звёздочек.

Данные хозяйства:
${farmSummary()}`;
}
async function photoRun(){
  const p=ui.photo; if(!SAMPLE||!p||!p.files.length||p.busy) return;
  p.busy=true; p.err=''; p.res=null; p.text=''; p.ctl=new AbortController(); render();
  try{
    if(p.mode==='store'){
      await SAMPLE(photoPrompt('store'),{images:p.files, signal:p.ctl.signal, onText:({text})=>{ p.text=text; const el=document.getElementById('ph-text'); if(el) el.textContent=text; }});
    } else {
      const r=await SAMPLE.json(photoPrompt(p.mode),{images:p.files, signal:p.ctl.signal});
      p.res=r&&typeof r==='object'?r:{};
      if(p.mode==='weigh'){ const v=+p.res.value; p.kg=isFinite(v)&&v>0?(p.res.unit==='g'?v/1000:v):0;
        p.feed=F[p.res.feed]?p.res.feed:''; p.an=animalById(p.res.animal)?p.res.animal:''; }
      else { const v=+p.res.value; p.l=isFinite(v)&&v>0?v:0; }
    }
  }catch(e){ if(!e||e.code!=='cancelled') p.err=errText(e); if(e&&e.text&&p.mode==='store') p.text=e.text; }
  p.busy=false; render();
}
function photoSheet(){
  const p=ui.photo, an=S.animals.filter(a=>!a.planned);
  const modes=[['weigh','Весы: сколько даю'],['milk','Надой: кувшин'],['store','Склад: совет']];
  const hint={weigh:'Сфотографируйте экран весов с кормом — Claude прочитает вес и предложит записать его в рацион.',
    milk:'Сфотографируйте кувшин или банку с делениями — Claude оценит, сколько литров надоили, и запишет в журнал.',
    store:`Сфотографируйте склад или сарай с кормами (до ${IMG_MAX} фото) — Claude подскажет, как удобнее и безопаснее хранить и раскладывать корма.`}[p.mode];
  let res='';
  if(p.busy||p.text) res=`<div class="builder"><div id="ph-text" style="white-space:pre-wrap">${esc(p.text)||'Claude смотрит на фото…'}</div>${p.busy?`<div class="row"><button class="ghost" data-act="photo-stop">Остановить</button></div>`:''}</div>`;
  if(p.err) res+=`<div class="notice">${esc(p.err)}</div>`;
  if(p.res&&p.mode==='weigh'){
    const a=animalById(p.an), hens=a&&a.sp==='hens', feeds=a?FEEDS.filter(f=>f.for.includes(a.sp)):FEEDS;
    res+=`<div class="builder">
      <strong>${p.kg?`На весах: ${kgOrG(p.kg,false)}`:'Показание не прочитано — впишите вес сами'}</strong>
      ${p.res.note?`<p class="hint" style="margin:0">${esc(p.res.note)}${p.res.confidence==='low'?' — Claude не уверен, проверьте.':''}</p>`:''}
      <div class="form-grid">
        <label class="f">Вес, кг<input id="ph-kg" inputmode="decimal" data-ph="kg" value="${p.kg?fmt(p.kg,3):''}"></label>
        <label class="f">Кому<select id="ph-an" data-ph="an"><option value="">— выберите —</option>${an.map(x=>`<option value="${x.id}" ${x.id===p.an?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="f">Какой корм<select id="ph-feed" data-ph="feed"><option value="">— выберите —</option>${feeds.map(f=>`<option value="${f.id}" ${f.id===p.feed?'selected':''}>${esc(f.name)}</option>`).join('')}</select></label>
      </div>
      ${hens?`<p class="hint" style="margin:0">Это на всё стадо (${fmt(a.count,0)} голов) — в рацион запишется ${kgOrG((p.kg||0)/Math.max(1,+a.count||1),true)} на курицу.</p>`:''}
      <p class="hint" style="margin:0">Это одна раздача? Тогда в день — × ${S.settings.feedings||2} кормления. Приложение так и посчитает.</p>
      <div class="row"><button class="primary" data-act="photo-apply" ${p.kg&&p.an&&p.feed?'':'disabled'}>Записать в рацион</button></div>
    </div>`;
  }
  if(p.res&&p.mode==='milk'){
    const milkers=an.filter(x=>x.sp==='goat'||x.sp==='cow'); if(!p.an&&milkers.length) p.an=milkers[0].id;
    res+=`<div class="builder">
      <strong>${p.l?`Молока ≈ ${fmt(p.l,2)} л`:'Объём не определён — впишите сами'}</strong>
      ${p.res.note?`<p class="hint" style="margin:0">${esc(p.res.note)}${p.res.confidence==='low'?' — оценка примерная, проверьте.':''}</p>`:''}
      <div class="form-grid">
        <label class="f">Литров<input id="ph-l" inputmode="decimal" data-ph="l" value="${p.l?fmt(p.l,2):''}"></label>
        <label class="f">Чьё молоко<select id="ph-an" data-ph="an">${milkers.map(x=>`<option value="${x.id}" ${x.id===p.an?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>
      </div>
      <div class="row"><button class="primary" data-act="photo-milk" ${p.l&&p.an?'':'disabled'}>Записать надой за сегодня</button></div>
    </div>`;
  }
  return `<div class="sheet-bg" data-act="photo-close"><div class="sheet" role="dialog" aria-modal="true" aria-label="Фото" data-stop="1">
    <div class="card-head"><h2><svg class="wheat" aria-hidden="true"><use href="#ear"/></svg>Фото вместо записи от руки</h2><button class="ghost" data-act="photo-close">✕ Закрыть</button></div>
    <div class="seg">${modes.map(([k,l])=>`<button data-act="photo-mode" data-m="${k}" aria-pressed="${p.mode===k}">${l}</button>`).join('')}</div>
    <p class="hint" style="margin:0">${hint}</p>
    <label class="btn primary-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>${p.files.length?'Переснять':'Сфотографировать'}<input type="file" id="ph-file" accept="image/*" capture="environment" ${p.mode==='store'&&IMG_MAX>1?'multiple':''} data-photo="1" style="display:none"></label>
    ${p.urls.length?`<div class="row">${p.urls.map(u=>`<img src="${u}" alt="Фото" style="width:88px;height:88px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">`).join('')}</div>`:''}
    ${p.files.length&&!p.busy?`<button class="primary" data-act="photo-run">${p.mode==='store'?'Получить советы':'Распознать'}</button>`:''}
    ${res}
    <p class="hint" style="margin:0">Фото уходит только в Claude и только когда вы нажмёте кнопку; данные о месте съёмки из него удаляются. В приложении фото не сохраняется.</p>
  </div></div>`;
}
async function growthRun(){
  if(!SAMPLE||(ui.growth&&ui.growth.busy)) return;
  const g=ui.growth={busy:true,text:'',err:'',ctl:new AbortController()}; render();
  const prompt=`Ты — опытный агроном-экономист и консультант небольших ферм. Ниже данные подворья. Составь по-русски понятный план, как постепенно вырасти от подворья к прибыльному фермерскому хозяйству, опираясь на эти цифры.
Структура:
— Сейчас: 3 главных вывода по цифрам (себестоимость, где теряются деньги, что уже хорошо).
— Ближайший месяц: 3–5 дешёвых или бесплатных шагов (рацион, учёт, хранение, продуктивность).
— 3–6 месяцев: что докупить или построить, сколько это стоит примерно и как окупится.
— 1–3 года: поголовье (в т.ч. корова), что производить и продавать (молоко, сыр, творог, яйца, молодняк, навоз/компост), каналы сбыта (рынки, прямые продажи, местные магазины), оформление деятельности в Латвии (регистрация животных и хозяйства в PVD — Pārtikas un veterinārais dienests, регистрация производителя для продажи молока и яиц, налоговые варианты в VID) и поддержка Lauku atbalsta dienests (LAD) для малых и начинающих хозяйств — в общих чертах, с советом уточнить актуальные правила и сроки в PVD, LAD и VID.
— Что записывать в журнал, чтобы видеть рост.
Считай деньги по данным, где можно. Тон — тёплый, поддерживающий и уважительный, как у заботливой мамы, которая верит в неё: без давления и упрёков, с верой, что всё получится шаг за шагом. Пиши коротко, пунктами через «—», без заголовков с # и без звёздочек.

Данные хозяйства:
${farmSummary()}`;
  try{ await SAMPLE(prompt,{signal:g.ctl.signal, onText:({text})=>{ g.text=text; const el=document.getElementById('gr-text'); if(el) el.textContent=text; }}); }
  catch(e){ if(!e||e.code!=='cancelled') g.err=errText(e); if(e&&e.text) g.text=e.text; }
  g.busy=false; render();
}
function reportText(){
  const inc=S.settings.includePlanned, daily=herdDaily(inc), L=[];
  L.push(`Отчёт подворья — ${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`,'');
  L.push('РАЦИОН НА ДЕНЬ (всего):'); for(const [id,kg] of Object.entries(daily)) L.push(`— ${F[id].name}: ${fmt(kg,2)} кг`);
  const tot=S.animals.filter(a=>!a.planned).reduce((s,a)=>s+curCost(a).cost,0);
  if(tot) L.push('',`КОРМ СТОИТ: ${money(tot)} в день, ${money(tot*30)} в месяц`);
  const low=lowStock(); if(low.length){ L.push('','ПОРА ДОКУПАТЬ:'); low.forEach(x=>L.push(`— ${x.name}: хватит на ${fmt(x.days,0)} дн.`)); }
  const prod=[]; for(const a of S.animals) for(const k of kindsFor(a)){ const pts=series(a.id,k).filter(p=>dayDiff(p.d,todayISO())<7); if(pts.length) prod.push(`— ${a.name}, ${KIND[k].l.toLowerCase()}: в среднем ${fmt(avg(pts),1)} ${KIND[k].u} в день`); }
  if(prod.length){ L.push('','ПРОДУКТИВНОСТЬ ЗА 7 ДНЕЙ:',...prod); }
  const e=econ(); if(e.milkCostL||e.eggCost){ L.push('','СЕБЕСТОИМОСТЬ (только корм):'); if(e.milkCostL) L.push(`— литр молока: ${money(e.milkCostL)}`); if(e.eggCost) L.push(`— одно яйцо: ${money(e.eggCost)}`); }
  const adv=S.animals.filter(a=>!a.planned).flatMap(adviceFor).filter(x=>x.lv!=='idea').slice(0,6);
  if(adv.length){ L.push('','ЧТО ПОПРАВИТЬ:'); adv.forEach(x=>L.push(`— ${x.who}: ${x.txt}`)); }
  return L.join('\n');
}
async function saveFile(name, data){
  if(DL){ try{ await DL.save({filename:name, data}); }catch(e){ if(e&&e.code!=='declined'){ note='Файл не сохранился. Попробуйте ещё раз.'; render(); } } return; }
  try{ const u=URL.createObjectURL(new Blob([data])); const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),5000); }catch(e){}
}
function offlineHTML(){
  const seed=`<script>window.__SEED=${JSON.stringify(S).replace(/</g,'\\u003c')};<\/script>`;
  return '<!doctype html>'+document.documentElement.outerHTML.replace(/<body([^>]*)>/,(m)=>m+seed).replace(/<div class="sheet-bg"[\s\S]*?<\/main>/,'</main>');
}

function growthSection(){
  const e=econ(), s=S.settings, mp=+s.milkPrice||0, ep=+s.eggPrice||0, g=ui.growth;
  const tot=S.animals.filter(a=>!a.planned).reduce((x,a)=>x+curCost(a).cost,0);
  const facts=[['Корм в месяц',tot?money(tot*30):'—']];
  if(e.milkL) facts.push(['Литр молока (корм)',e.milkCostL?money(e.milkCostL):'нет цен']);
  if(mp&&e.milkL&&e.milkCostL) facts.push(['Прибыль с молока в месяц',money((mp-e.milkCostL)*e.milkL*30)]);
  if(e.hens) facts.push(['Одно яйцо (корм)',e.eggCost?money(e.eggCost):'запишите яйца в журнал']);
  if(ep&&e.eggs&&e.eggCost) facts.push(['Прибыль с яиц в месяц',money((ep-e.eggCost)*e.eggs*30)]);
  return `<section class="section"><div class="section-head"><h2>Развитие хозяйства</h2><span class="hint">от подворья к ферме</span></div>
    <div class="card">
      <div class="facts">${facts.map(([k,v])=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`).join('')}</div>
      <div class="form-grid">
        <label class="f">Продаю молоко, € за литр<input id="set-mp" inputmode="decimal" data-set="milkPrice" value="${esc(s.milkPrice||'')}" placeholder="0"></label>
        <label class="f">Продаю яйца, € за штуку<input id="set-ep" inputmode="decimal" data-set="eggPrice" value="${esc(s.eggPrice||'')}" placeholder="0"></label>
      </div>
      <p class="hint" style="margin:0">Себестоимость считается только по корму — по ценам из «Запасов» и надоям или яйцам из «Журнала».</p>
      ${SAMPLE?`<div class="row">${g&&g.busy?'<button data-act="growth-stop">Остановить</button>':`<button class="primary" data-act="growth">${g&&g.text?'Обновить план развития':'План развития от Claude'}</button>`}</div>
        ${g&&(g.busy||g.text)?`<div class="builder"><div id="gr-text" class="ai-text">${esc(g.text)||'Claude считает и составляет план… Это может занять минуту.'}</div></div>`:''}
        ${g&&g.err?`<div class="notice">${esc(g.err)}</div>`:''}`:''}
    </div></section>`;
}

/* ---------- ИИ-помощник (чат) ---------- */
function chatInstr(){
  return `Ты — дружелюбный помощник по подворью в приложении «Рационы подворья». Хозяйство находится в Латвии, цены в евро. Помогаешь хозяйке с кормлением, рационами, уходом, хранением кормов, здоровьем животных, учётом и развитием хозяйства.
Тон: говори с ней тепло, по-дружески и с уважением — как заботливая, мудрая мама: бережно, спокойно, без поучений, упрёков и страшилок. Она добрый, тёплый и ранимый человек: сначала замечай, что у неё уже хорошо получается, ошибки называй мягко («давай попробуем вот так»), поддерживай и подбадривай, но не сюсюкай и не льсти. Обращайся на «ты» мягко и по-доброму. Если она переживает — сначала успокой, потом помоги по делу.
Правила: отвечай по-русски, коротко и практично, конкретными цифрами там, где можно; опирайся на данные хозяйства ниже. Если по описанию есть признаки болезни или опасности (не ест, вздутие, колики, хромота, кровь, высокая температура) — прямо советуй срочно вызвать ветеринара. Про законы и субсидии Латвии (PVD, LAD, VID) отвечай в общих чертах и советуй уточнить на их сайтах. Если чего-то не знаешь — так и скажи. Без заголовков с # и без звёздочек; списки через «—».
Подсказки по приложению: «Рацион» — нормы и «Составить рацион»/«Подобрать дешевле»; «Запасы» — склад и цены; «Советы» — что поправить и план развития; «Журнал» — надои, яйца, вес; «Хозяйство» — животные, свои корма, отчёт. Кнопка с фотоаппаратом распознаёт весы, кувшин и склад.

Данные хозяйства:
${farmSummary()}`;
}
async function chatSend(){
  const c=ui.chat, inp=document.getElementById('chat-in'), q=(inp&&inp.value||'').trim();
  if(!SAMPLE||!c||c.busy||!q) return;
  c.turns.push({role:'user',content:q}); if(c.turns.length>14) c.turns=c.turns.slice(-14);
  while(c.turns.length&&c.turns[0].role!=='user') c.turns.shift();
  c.busy=true; c.err=''; c.live=''; c.ctl=new AbortController(); c.draft=''; render();
  try{
    const {text}=await SAMPLE([{role:'user',content:chatInstr()},...c.turns],{cache:false, signal:c.ctl.signal,
      onText:({text})=>{ c.live=text; const el=document.getElementById('chat-live'); if(el) el.textContent=text; scrollChat(); }});
    c.turns.push({role:'assistant',content:text});
  }catch(e){ if(e&&e.text) c.turns.push({role:'assistant',content:e.text+' …'}); if(!e||e.code!=='cancelled') c.err=errText(e); }
  c.busy=false; c.live=''; render(); scrollChat();
  setTimeout(()=>{ const el=document.getElementById('chat-in'); if(el) el.focus(); },30);
}
function scrollChat(){ const b=document.getElementById('chat-box'); if(b) b.scrollTop=b.scrollHeight; }
const QUICK=['Чем кормить козу, чтобы было больше молока?','Почему у кур плохое перо?','Сколько сена нужно на зиму?','Как подготовиться к покупке коровы?'];
function chatSheet(){
  const c=ui.chat;
  const msgs=c.turns.map(t=>`<div class="msg ${t.role}">${esc(t.content)}</div>`).join('')+(c.busy?`<div class="msg assistant" id="chat-live">${esc(c.live)||'Думаю…'}</div>`:'');
  return `<div class="sheet-bg" data-act="chat-close"><div class="sheet chat" role="dialog" aria-modal="true" aria-label="Помощник" data-stop="1">
    <div class="card-head"><h2><svg class="wheat" aria-hidden="true"><use href="#ear"/></svg>Помощник</h2><div class="row">${c.turns.length?'<button class="ghost" data-act="chat-clear">Новый разговор</button>':''}<button class="ghost" data-act="chat-close">✕</button></div></div>
    <div class="chat-box" id="chat-box">${msgs||`<div class="msg assistant">Привет! Я рядом, если что-то непонятно или тревожит. Спрашивай про животных, корма, хозяйство — я вижу твои рационы, запасы и журнал, так что подскажу по делу.</div><div class="row">${QUICK.map(q=>`<button class="chip-btn" data-act="chat-quick" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}</div>
    ${c.err?`<div class="notice">${esc(c.err)}</div>`:''}
    <div class="chat-in"><textarea id="chat-in" rows="2" placeholder="Ваш вопрос…" aria-label="Ваш вопрос">${esc(c.draft||'')}</textarea>
      ${c.busy?'<button data-act="chat-stop">Стоп</button>':'<button class="primary" data-act="chat-send">Спросить</button>'}</div>
    <p class="hint" style="margin:0">Ответы — от Claude, это не замена ветеринару. Нужен интернет.</p>
  </div></div>`;
}

/* ---------- Хозяйство ---------- */
function animalForm(a){
  const sp=SPECIES[a.sp], hens=a.sp==='hens';
  const feeds=FEEDS.filter(f=>f.for.includes(a.sp));
  return `<article class="card">
    <div class="card-head"><div class="who-row">${aniIcon(a.sp)}<div><h3>${esc(a.name)}</h3><div class="meta">${sp.label}${a.planned?' · в планах':''}</div></div></div>
      <button class="ghost" data-act="open" data-id="${a.id}" aria-expanded="${!!ui.open[a.id]}">${ui.open[a.id]?'Свернуть':'Изменить'}</button></div>
    ${ui.open[a.id]?`
    <div class="form-grid">
      <label class="f">Кличка<input id="n-${a.id}" data-f="name" data-id="${a.id}" value="${esc(a.name)}"></label>
      ${hens?`<label class="f">Сколько голов<input id="c-${a.id}" inputmode="numeric" data-f="count" data-id="${a.id}" value="${esc(a.count)}"></label>`:
      `<label class="f">Живой вес, кг<input id="w-${a.id}" inputmode="decimal" data-f="w" data-id="${a.id}" value="${esc(a.w)}"></label>`}
      <label class="f">Состояние<select id="s-${a.id}" data-f="state" data-id="${a.id}">${Object.entries(sp.states).map(([k,l])=>`<option value="${k}" ${a.state===k?'selected':''}>${l}</option>`).join('')}</select></label>
      ${(a.sp==='goat'||a.sp==='cow')&&a.state==='milk'?`<label class="f">Надой, л в день<input id="mk-${a.id}" inputmode="decimal" data-f="milk" data-id="${a.id}" value="${esc(a.milk)}"></label>`:''}
      ${a.sp==='cow'&&a.state==='milk'?`<label class="f">Жирность, %<input id="ft-${a.id}" inputmode="decimal" data-f="fat" data-id="${a.id}" value="${esc(a.fat)}"></label>`:''}
    </div>
    <label class="row" style="font-size:14px"><input type="checkbox" id="pl-${a.id}" data-f="planned" data-id="${a.id}" ${a.planned?'checked':''}> Пока в планах (не считать в сегодняшнем расходе)</label>
    <div><div class="hint" style="margin-bottom:6px">Чем кормим</div>
      <div class="checks">${feeds.map(f=>`<label><input type="checkbox" id="fd-${a.id}-${f.id}" data-feed-toggle="${f.id}" data-id="${a.id}" ${a.feeds.includes(f.id)?'checked':''}> ${esc(f.name)}</label>`).join('')}</div></div>
    <div class="row">${ui.confirmDel===a.id?`<span class="hint">Удалить «${esc(a.name)}»?</span><button class="danger" data-act="del-yes" data-id="${a.id}">Удалить</button><button data-act="del-no">Отмена</button>`:`<button class="danger" data-act="del" data-id="${a.id}">Удалить животное</button>`}</div>`:''}
  </article>`;
}
function viewHerd(){
  const list=S&&S.animals.length?S.animals.map(animalForm).join(''):'<p class="hint">Животных пока нет.</p>';
  return `
  ${S?`<section class="section"><div class="section-head"><h2>Отчёт на почту</h2><span class="hint">рацион, запасы, деньги, продуктивность</span></div>
    <div class="card">
      <label class="f">Ваша почта<input type="email" id="set-email" data-set="email" value="${esc(S.settings.email||'')}" placeholder="name@example.com" autocomplete="email"></label>
      <div class="row">
        ${S.settings.email?`<a class="btn primary-link" href="mailto:${encodeURIComponent(S.settings.email)}?subject=${encodeURIComponent('Отчёт подворья '+todayISO())}&body=${encodeURIComponent(reportText().slice(0,1800))}" target="_blank" rel="noopener">Открыть письмо с отчётом</a>`:'<span class="hint">Впишите почту — появится кнопка письма.</span>'}
        <button data-act="report-dl">Скачать отчёт (.txt)</button>
      </div>
      <p class="hint" style="margin:0">Каждый понедельник утром отчёт сам придёт на эту почту. Кнопка выше — чтобы отправить его прямо сейчас из почты телефона.</p>
    </div></section>
  ${viewTeam()}
  <section class="section"><div class="section-head"><h2>Без интернета и резервная копия</h2></div>
    <div class="card">
      <p style="margin:0">Приложение работает без интернета: всё сохраняется в телефоне и само отправляется, когда появится связь. Помощник и фото — только со связью. Для надёжности можно скачать копию данных.</p>
      <div class="row"><button data-act="data-dl">Скачать данные (.json)</button>
        <label class="btn">Загрузить данные из файла<input type="file" id="imp-file" accept="application/json,.json" data-import="1" style="display:none"></label></div>
      ${ui.importData?`<div class="notice">Заменить все данные в приложении данными из файла (${ui.importData.animals.length} животных, ${(ui.importData.log||[]).length} записей журнала)?
        <div class="row" style="margin-top:8px"><button class="danger" data-act="import-yes">Заменить</button><button data-act="import-no">Отмена</button></div></div>`:''}
      <p class="hint" style="margin:0">Переезд из первой версии (на claude.ai): там во вкладке «Хозяйство» нажмите «Скачать данные (.json)», а здесь — «Загрузить данные из файла».</p>
    </div></section>
  <section class="section"><details><summary>Где хранятся данные</summary><div class="card"><p style="margin:0">Данные хозяйства хранятся в телефоне и в защищённой базе Supabase (сервер в ЕС, Стокгольм). Их видят только участники хозяйства — те, кого владелец пригласил кодом. Фото и вопросы помощнику уходят в Claude только когда вы нажимаете кнопку; перед отправкой фото уменьшается и из него удаляются данные о месте съёмки, сами фото нигде не сохраняются. Ключ Claude хранится только на сервере.</p></div></details></section>`:viewTeam()}
  <section class="section"><div class="section-head"><h2>Животные</h2><span class="hint">вес, состояние и корма</span></div>${list}
    <div class="card"><div class="hint">Добавить</div>${addButtons()}</div></section>
  <section class="section"><div class="section-head"><h2>Свои корма</h2><span class="hint">которых нет в справочнике</span></div>
    ${S&&S.customFeeds.length?S.customFeeds.map(c=>`<div class="card"><div class="card-head"><div>${feedLink(c.id)}<div class="meta">${GROUP[c.g]} · ${c.for.map(k=>SPECIES[k].label).join(', ')}</div></div>
      ${ui.confirmDelFeed===c.id?`<div class="row"><button class="danger" data-act="del-custom-yes" data-feed="${c.id}">Удалить</button><button data-act="del-custom-no">Отмена</button></div>`:`<button class="ghost" data-act="del-custom" data-feed="${c.id}">Удалить</button>`}</div></div>`).join(''):''}
    <details ${ui.open.customForm?'open':''} data-det="customForm"><summary>+ Добавить свой корм</summary>
      <div class="card">
        <div class="form-grid">
          <label class="f">Название<input id="nf-name" placeholder="например, сено с покоса 2026"></label>
          <label class="f">Вид корма<select id="nf-g">${Object.entries(GROUP).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="f">Корм. единиц в 1 кг<input id="nf-kued" inputmode="decimal" placeholder="0,45"></label>
          <label class="f">Перевар. протеин, г<input id="nf-pp" inputmode="decimal" placeholder="50"></label>
          <label class="f">Кальций, г<input id="nf-ca" inputmode="decimal" placeholder="6"></label>
          <label class="f">Фосфор, г<input id="nf-p" inputmode="decimal" placeholder="2"></label>
          <label class="f">Сухое в-во, %<input id="nf-dm" inputmode="decimal" value="87"></label>
          <label class="f">Каротин, мг<input id="nf-car" inputmode="decimal" placeholder="0"></label>
          <label class="f">Для кур: ккал<input id="nf-kcal" inputmode="decimal" placeholder="2700"></label>
          <label class="f">Для кур: сырой протеин, г<input id="nf-cp" inputmode="decimal" placeholder="120"></label>
        </div>
        <div><div class="hint" style="margin-bottom:6px">Кому можно давать</div><div class="checks">${SP_KEYS.map(k=>`<label><input type="checkbox" id="nf-sp-${k}" checked> ${SPECIES[k].label}</label>`).join('')}</div></div>
        <p class="hint" style="margin:0">Цифры — на 1 кг корма, с этикетки мешка или из анализа. Похожий корм можно посмотреть в справочнике ниже.</p>
        <div class="row"><button class="primary" data-act="add-custom">Добавить корм</button></div>
      </div>
    </details></section>
  <section class="section"><details><summary>Справочник кормов (питательность 1 кг)</summary>
    <div class="card"><div class="tbl-wrap"><table class="refs"><thead><tr><th>Корм</th><th class="n">корм. ед.</th><th class="n">протеин, г</th><th class="n">Ca, г</th><th class="n">P, г</th><th class="n">каротин, мг</th><th class="n">сух. в-во</th></tr></thead><tbody>
    ${FEEDS.map(f=>`<tr><td>${feedLink(f.id)}${f.custom?'<span class="small">свой корм</span>':f.overridden?'<span class="small">по анализу</span>':''}</td><td class="n">${fmt(f.kued,2)}</td><td class="n">${fmt(f.pp,0)}</td><td class="n">${fmt(f.ca,1)}</td><td class="n">${fmt(f.p,1)}</td><td class="n">${fmt(f.car,0)}</td><td class="n">${fmt(f.dm*100,0)}%</td></tr>`).join('')}
    </tbody></table></div><p class="hint" style="margin:0">Средние значения из зоотехнических справочников. Для кур расчёт ведётся в ккал обменной энергии и сыром протеине.</p></div></details></section>`;
}

/* ---------- События ---------- */
function newAnimal(sp){
  const s=SPECIES[sp], n=S.animals.filter(a=>a.sp===sp).length+1;
  const a={id:uid(), sp, name:s.label+(n>1?' '+n:''), w:s.w, state:Object.keys(s.states)[0], milk:sp==='goat'?2:sp==='cow'?15:0, fat:3.8, count:sp==='hens'?10:1, planned:false, feeds:[...s.feeds], manual:null};
  return a;
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab],[data-act]'); if(!t) return;
  if(t.dataset.tab){ ui.tab=t.dataset.tab; render(); window.scrollTo(0,0); return; }
  const act=t.dataset.act, id=t.dataset.id, a=id&&S?animalById(id):null;
  if(act==='inc-planned') return; // handled on change
  if(act==='feed-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return; // клик внутри листа
  if(act==='feed'){ ui.feed=t.dataset.feed; render(); return; }
  if(act==='feed-close'){ ui.feed=null; render(); return; }
  if(act==='feed-stock'){ const fid=t.dataset.feed; ui.feed=null; ui.tab='stock'; ui.open[fid]=true; render(); setTimeout(()=>{const el=document.getElementById('stk-'+fid); if(el) el.scrollIntoView({block:'center'});},30); return; }
  if(act==='auth-go'){ authGo(); return; }
  if(act==='auth-switch'){ const el=document.getElementById('au-email'); if(el) ui.auEmail=el.value; ui.authMode=ui.authMode==='up'?'in':'up'; authErr=''; render(); return; }
  if(act==='sign-out'){ ui.confirmOut=true; render(); return; }
  if(act==='sign-out-no'){ ui.confirmOut=false; render(); return; }
  if(act==='sign-out-yes'){ ui.confirmOut=false; doSignOut(); return; }
  if(act==='make-invite'){ if(!farm) return; t.disabled=true; createInvite(farm.id).then(c=>{ ui.invite=c; render(); }).catch(()=>{ note='Не получилось создать код — проверьте интернет.'; render(); }); return; }
  if(act==='join-farm'){ const c=(document.getElementById('join-code').value||'').trim(); if(c.length<6) return; t.disabled=true;
    joinFarm(c).then(f=>{ meta.farmId=f.id; meta.syncedAt=f.updated_at; meta.dirty=false; dirty=false; S=normalize(f.data); saveLocal(); saveMeta(); useFarm(f); ui.members=undefined; ui.open.join=false; note=null; ui.tab='ration'; render(); })
      .catch(err=>{ note=err.message||'Не получилось присоединиться.'; render(); }); return; }
  if(act==='rm-member'){ ui.confirmRm=t.dataset.u; render(); return; }
  if(act==='rm-member-no'){ ui.confirmRm=null; render(); return; }
  if(act==='rm-member-yes'){ removeMember(farm.id, t.dataset.u).then(()=>{ ui.confirmRm=null; ui.members=undefined; render(); }).catch(()=>{ note='Не получилось — проверьте интернет.'; render(); }); return; }
  if(act==='chat-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return;
  if(act==='photo-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return;
  if(act==='chat-open'){ ui.chat=ui.chat||{turns:[]}; ui.chat.open=true; render(); scrollChat(); setTimeout(()=>{const el=document.getElementById('chat-in'); if(el) el.focus();},50); return; }
  if(act==='chat-close'){ if(ui.chat){ const el=document.getElementById('chat-in'); if(el) ui.chat.draft=el.value; ui.chat.open=false; } render(); return; }
  if(act==='chat-send'){ chatSend(); return; }
  if(act==='chat-stop'){ ui.chat&&ui.chat.ctl&&ui.chat.ctl.abort(); return; }
  if(act==='chat-clear'){ if(ui.chat&&!ui.chat.busy){ ui.chat.turns=[]; ui.chat.err=''; } render(); return; }
  if(act==='chat-quick'){ const el=document.getElementById('chat-in'); if(el){ el.value=t.dataset.q; chatSend(); } return; }
  if(act==='photo-open'){ ui.photo={mode:'weigh',files:[],urls:[]}; render(); return; }
  if(act==='photo-close'){ if(ui.photo){ ui.photo.ctl&&ui.photo.ctl.abort(); ui.photo.urls.forEach(u=>URL.revokeObjectURL(u)); } ui.photo=null; render(); return; }
  if(act==='photo-mode'){ const p=ui.photo; if(p&&!p.busy){ p.mode=t.dataset.m; p.res=null; p.text=''; p.err=''; if(p.mode!=='store'&&p.files.length>1){ p.files=p.files.slice(0,1); p.urls.slice(1).forEach(u=>URL.revokeObjectURL(u)); p.urls=p.urls.slice(0,1); } } render(); return; }
  if(act==='photo-run'){ photoRun(); return; }
  if(act==='photo-stop'){ ui.photo&&ui.photo.ctl&&ui.photo.ctl.abort(); return; }
  if(act==='growth'){ growthRun(); return; }
  if(act==='growth-stop'){ ui.growth&&ui.growth.ctl&&ui.growth.ctl.abort(); return; }
  if(act==='report-dl'){ saveFile(`Отчёт подворья ${todayISO()}.txt`, reportText()); return; }
  if(act==='data-dl'){ saveFile(`Данные подворья ${todayISO()}.json`, JSON.stringify(S,null,1)); return; }
  if(act==='offline-dl'){ saveFile('Рационы подворья (офлайн).html', offlineHTML()); return; }
  if(act==='optimize'&&a){ ui.opt[id]=optimize(a); render(); return; }
  if(act==='opt-close'){ delete ui.opt[id]; render(); return; }
  if(readOnly&&!['toggle-edit','open','del-no'].includes(act)) return;
  switch(act){
    case 'photo-apply': { const p=ui.photo, x=p&&animalById(p.an); if(!x||!p.kg||!F[p.feed]) return;
      const per=(x.sp==='hens'?p.kg/Math.max(1,+x.count||1):p.kg)*(+S.settings.feedings||2);
      if(!x.manual) x.manual=clone(calc(x).auto); x.feeds=[...new Set([...(x.feeds||[]),p.feed])]; x.manual[p.feed]=Math.round(per*1000)/1000; markRation(x);
      ui.photo.urls.forEach(u=>URL.revokeObjectURL(u)); ui.photo=null; ui.tab='ration'; save(); render();
      setTimeout(()=>{ const el=document.getElementById('card-'+x.id); if(el) el.scrollIntoView({block:'start'}); },40); break; }
    case 'photo-milk': { const p=ui.photo; if(!p||!p.l||!p.an) return; S.log.push({id:uid(),date:todayISO(),an:p.an,kind:'milk',v:Math.round(p.l*100)/100});
      ui.photo.urls.forEach(u=>URL.revokeObjectURL(u)); ui.photo=null; ui.jAnimal=p.an; ui.jKind='milk'; ui.tab='journal'; save(); render(); break; }
    case 'import-yes': { if(ui.importData){ S=normalize(ui.importData); ui.importData=null; save(); render(); } break; }
    case 'import-no': ui.importData=null; render(); break;
    case 'opt-apply': { const o=ui.opt[id]; if(a&&o&&!o.fail){ a.feeds=Object.keys(o.amounts); a.manual={...o.amounts}; markRation(a); ui.edit[id]=false; delete ui.opt[id]; save(); render(); } break; }
    case 'add-log': {
      const d=document.getElementById('j-date').value||todayISO(), v=num(document.getElementById('j-val').value); if(!(v>0)) return;
      S.log.push({id:uid(), date:d, an:ui.jAnimal, kind:ui.jKind, v}); if(S.log.length>3000) S.log=S.log.slice(-3000); save(); render(); break; }
    case 'del-log': S.log=S.log.filter(e=>e.id!==t.dataset.log); save(); render(); break;
    case 'ovr-reset': delete S.feedOverrides[t.dataset.feed]; save(); render(); break;
    case 'add-custom': {
      if(!S) S=blank();
      const g=(k)=>document.getElementById('nf-'+k), name=g('name').value.trim(); if(!name){ g('name').focus(); return; }
      const fr=SP_KEYS.filter(k=>g('sp-'+k).checked); if(!fr.length) return;
      const grp=g('g').value, cf={id:'c_'+uid(), name, g:grp, kued:num(g('kued').value), pp:num(g('pp').value), ca:num(g('ca').value), p:num(g('p').value),
        dm:Math.min(1,(num(g('dm').value)||87)/100), car:num(g('car').value), kcal:num(g('kcal').value), cp:num(g('cp').value), for:fr};
      if(grp==='conc') cf.henMax=.3; if(grp==='juicy'&&fr.includes('hens')) cf.hen=.03;
      S.customFeeds.push(cf); ui.open.customForm=false; ui.feed=cf.id; save(); render(); break; }
    case 'del-custom': ui.confirmDelFeed=t.dataset.feed; render(); break;
    case 'del-custom-no': ui.confirmDelFeed=null; render(); break;
    case 'del-custom-yes': { const fid=t.dataset.feed; S.customFeeds=S.customFeeds.filter(c=>c.id!==fid);
      S.animals.forEach(x=>{ x.feeds=(x.feeds||[]).filter(i=>i!==fid); if(x.manual) delete x.manual[fid]; }); delete S.feeds[fid]; ui.confirmDelFeed=null; save(); render(); break; }
    case 'add': { if(!S) S=blank(); const na=newAnimal(t.dataset.sp); S.animals.push(na); ui.open[na.id]=true; ui.tab='herd'; save(); render(); setTimeout(()=>{const el=document.getElementById('n-'+na.id); if(el) el.scrollIntoView({block:'center'});},30); break; }
    case 'toggle-edit': ui.edit[id]=!ui.edit[id]; render(); break;
    case 'rm-feed': if(a){ const fid=t.dataset.feed; if(!a.manual) a.manual=clone(calc(a).auto); a.feeds=a.feeds.filter(x=>x!==fid); delete a.manual[fid]; markRation(a); save(); render(); } break;
    case 'clear-manual': if(a){ a.feeds=[]; a.manual={}; markRation(a); save(); render(); } break;
    case 'reset-manual': if(a){a.manual=null; markRation(a); if(!a.feeds.length) a.feeds=[...SPECIES[a.sp].feeds]; ui.edit[id]=false; save(); render();} break;
    case 'feedings': S.settings.feedings=+t.dataset.n; save(); render(); break;
    case 'period': S.settings.period=t.dataset.p; save(); render(); break;
    case 'open': ui.open[id]=!ui.open[id]; ui.confirmDel=null; render(); break;
    case 'del': ui.confirmDel=id; render(); break;
    case 'del-no': ui.confirmDel=null; render(); break;
    case 'del-yes': S.animals=S.animals.filter(x=>x.id!==id); ui.confirmDel=null; save(); render(); break;
    case 'add-stock': {
      const fid=t.dataset.feed, inp=document.getElementById('add-'+fid), v=num(inp.value); if(v<=0) return;
      const st=S.feeds[fid]=S.feeds[fid]||{}; const daily=herdDaily(S.settings.includePlanned)[fid]||0;
      const since=st.stockDate?Math.max(0,dayDiff(st.stockDate,todayISO())):0; const left=Math.max(0,(+st.stock||0)-daily*since);
      st.stock=Math.round(left+v); st.stockDate=todayISO(); ui.open[fid]=true; save(); render(); break;
    }
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&e.target&&e.target.id==='chat-in'){ e.preventDefault(); chatSend(); return; }
  if(e.key==='Enter'&&e.target&&(e.target.id==='au-pw'||e.target.id==='au-email')){ e.preventDefault(); authGo(); return; }
  if(e.key==='Escape'){ if(ui.feed) ui.feed=null; else if(ui.photo){ ui.photo.ctl&&ui.photo.ctl.abort(); ui.photo=null; } else if(ui.chat&&ui.chat.open){ ui.chat.open=false; } else return; render(); }
});
document.addEventListener('toggle',e=>{ const d=e.target; if(d.dataset&&d.dataset.det) ui.open[d.dataset.det]=d.open; },true);
document.addEventListener('change',e=>{
  const t=e.target; if(!S) return;
  if(t.dataset.jset){ ui[t.dataset.jset]=t.value; render(); return; }
  if(t.dataset.photo&&ui.photo){ const p=ui.photo; p.urls.forEach(u=>URL.revokeObjectURL(u));
    p.files=[...(t.files||[])].slice(0,p.mode==='store'?IMG_MAX:1); p.urls=p.files.map(f=>URL.createObjectURL(f)); p.res=null; p.text=''; p.err=''; render(); return; }
  if(t.dataset.ph&&ui.photo){ const p=ui.photo, k=t.dataset.ph; if(k==='kg') p.kg=Math.max(0,num(t.value)); else if(k==='l') p.l=Math.max(0,num(t.value)); else p[k]=t.value;
    if(k==='an'){ const x=animalById(p.an); if(x&&p.feed&&!F[p.feed].for.includes(x.sp)) p.feed=''; } render(); return; }
  if(t.dataset.import){ const file=t.files&&t.files[0]; if(!file) return;
    file.text().then(txt=>{ try{ const d=JSON.parse(txt); if(!d||!Array.isArray(d.animals)) throw 0; ui.importData=d; }catch(err){ note='Этот файл не похож на данные подворья.'; } render(); }); return; }
  if(readOnly) return;
  if(t.dataset.act==='inc-planned'){ S.settings.includePlanned=t.checked; save(); render(); return; }
  if(t.dataset.man){
    const a=animalById(t.dataset.id); if(!a) return;
    if(!a.manual) a.manual=clone(calc(a).auto);
    let v=Math.max(0,num(t.value)); if(a.sp==='hens') v=v/1000;
    a.manual[t.dataset.man]=v; markRation(a); save(); render();
    const el=document.getElementById('card-'+a.id); return;
  }
  if(t.dataset.f){
    const a=animalById(t.dataset.id); if(!a) return; const f=t.dataset.f;
    if(f==='name') a.name=t.value.trim()||SPECIES[a.sp].label;
    else if(f==='state') a.state=t.value;
    else if(f==='planned') a.planned=t.checked;
    else a[f]=Math.max(0,num(t.value));
    save(); render(); return;
  }
  if(t.dataset.addFeed){
    const a=animalById(t.dataset.addFeed), fid=t.value; if(!a||!fid) return;
    if(!a.manual) a.manual=clone(calc(a).auto);
    a.feeds=[...new Set([...a.feeds,fid])]; a.manual[fid]=0; markRation(a); save(); render();
    setTimeout(()=>{ const el=document.getElementById(`m-${a.id}-${fid}`); if(el){ el.focus(); el.select(); } },30); return;
  }
  if(t.dataset.feedToggle){
    const a=animalById(t.dataset.id); if(!a) return; const fid=t.dataset.feedToggle;
    a.feeds=t.checked?[...new Set([...a.feeds,fid])]:a.feeds.filter(x=>x!==fid);
    if(a.manual){ if(t.checked) a.manual[fid]=0; else delete a.manual[fid]; }
    markRation(a); save(); render(); return;
  }
  if(t.dataset.ovr){
    const fid=t.dataset.ovr, k=t.dataset.k; let v=Math.max(0,num(t.value)); if(k==='dm') v=Math.min(1,v/100);
    const c=S.customFeeds.find(x=>x.id===fid);
    if(c) c[k]=v; else { S.feedOverrides[fid]=S.feedOverrides[fid]||{}; S.feedOverrides[fid][k]=v; }
    ui.open['ovr-'+fid]=true; save(); render(); return;
  }
  if(t.dataset.stock){ const st=S.feeds[t.dataset.stock]=S.feeds[t.dataset.stock]||{}; if(t.value.trim()===''){ delete st.stock; delete st.stockDate; } else { st.stock=Math.max(0,num(t.value)); st.stockDate=todayISO(); } ui.open[t.dataset.stock]=true; save(); render(); return; }
  if(t.dataset.price){ const st=S.feeds[t.dataset.price]=S.feeds[t.dataset.price]||{}; st.price=Math.max(0,num(t.value)); ui.open[t.dataset.price]=true; save(); render(); return; }
  if(t.dataset.pack){ const st=S.feeds[t.dataset.pack]=S.feeds[t.dataset.pack]||{}; st.packKg=Math.max(1,num(t.value)||1); ui.open[t.dataset.pack]=true; save(); render(); return; }
  if(t.dataset.set){ S.settings[t.dataset.set]=t.dataset.set==='customDays'?Math.max(1,Math.round(num(t.value))):t.value; save(); render(); return; }
});

document.getElementById('today').textContent=new Date().toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
render();
initStore();
initCaps();
