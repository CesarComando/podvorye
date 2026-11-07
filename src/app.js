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
const ui={tab:'tasks', edit:{}, open:{}, confirmDel:null, period:null, opt:{}, jAnimal:null, jKind:null, confirmDelFeed:null, day:null, sec:'all', task:null};
const LS='podvorye-rations-v1';

function blank(){ return {v:1, animals:[], feeds:{}, settings:{feedings:2, period:'season', customDays:90, seasonEnd:'2027-05-01', includePlanned:false}, customFeeds:[], feedOverrides:{}, log:[], tasks:[], money:[], days:{}, bills:[], cars:[], fuel:[], shopItems:[], shopPrices:[], stores:[], requests:[]}; }
function normalize(d){
  const b=blank(); d=d&&typeof d==='object'?d:{};
  const obj=(x)=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  const arr=(x)=>Array.isArray(x)?x:[];
  // Незнакомые поля (отопление, счета, машины, покупки и будущие разделы) сохраняем как есть.
  const out=Object.assign({}, d, {v:1, animals:arr(d.animals), feeds:obj(d.feeds), settings:Object.assign(b.settings,d.settings||{}),
    customFeeds:arr(d.customFeeds), feedOverrides:obj(d.feedOverrides), log:arr(d.log), tasks:arr(d.tasks), money:arr(d.money), days:obj(d.days)});
  for(const k of SYNC_LISTS) out[k]=arr(d[k]);
  // раздел «Ферма» объединён с «Хозяйством»
  for(const k of ['tasks','money','bills','fuel']) for(const x of out[k]) if(x&&x.sec==='ferma') x.sec='farm';
  // свой список магазинов, созданный раньше, дополняем сетью Beta
  if(out.stores.length&&!out.stores.some(s=>s.name==='Beta')) out.stores.push({id:'st_beta', name:'Beta', address:'', updatedAt:1});
  return out;
}
// Списки, которые сливаются между телефонами по id и updatedAt (удаление — пометка deleted).
const SYNC_LISTS=['tasks','money','bills','cars','fuel','shopItems','shopPrices','stores','requests'];
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
  // дела и учёт: по id, побеждает более свежая правка (updatedAt); удаление — пометка deleted
  for(const k of SYNC_LISTS){
    const by=new Map((m[k]||[]).map(x=>[x.id,x]));
    for(const r of (remote[k]||[])){ const l=by.get(r.id); if(!l||(r.updatedAt||0)>(l.updatedAt||0)) by.set(r.id,r); }
    m[k]=[...by.values()];
  }
  m.days=Object.assign({}, remote.days||{}, m.days||{});
  return m;
}
async function flush(){
  if(!S) return;
  if(saving){ again=true; return; }
  if(!session||!meta.farmId||!navigator.onLine){ setSync('local','В телефоне · отправлю при связи'); return; }
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
  if(!session){ authView=true; setSync('local','Вход не выполнен'); }
  // Только локальная разработка (npm run dev): #demo — посмотреть экраны без входа, на примерных данных.
  if(import.meta.env.DEV&&location.hash.startsWith('#demo')){ authView=false; const [,dt,ds]=location.hash.split(':'); setTimeout(()=>{ if(dt){ ui.tab=dt; if(dt==='home') ui.homeView=ds; if(dt==='stock') ui.stockView=ds; render(); } },0); if(!S){ S=blank(); seedOurFarm();
    const td=todayISO(); [['Купить комбикорм',td,'10:00','farm','high'],['Позвонить ветеринару про прививки',addDaysISO(td,-1),null,'farm'],['Оплатить свет',addDaysISO(td,1),null,'home'],['Отвезти яйца деду',addDaysISO(td,3),'15:00','me'],['Убрать в курятнике',null,null,'farm']]
      .forEach(([title,due,time,sec,prio])=>newTask({title,due,time,sec,prio:prio||'normal',rep:title.startsWith('Оплатить')?'month':'none',remind:time?'1h':'none'})); S.tasks[0].done=false;
    S.bills.push(touch({id:uid(),to:'Latvenergo',what:'свет',amount:'',varies:true,due:addDaysISO(td,2),rep:'month',sec:'home',iban:'LV00HABA0000000000000',ref:'Līgums 123',paid:false}),touch({id:uid(),to:'Tele2',what:'связь',amount:14.99,due:addDaysISO(td,9),rep:'month',sec:'me',paid:false}));
    S.cars.push(touch({id:'car1',name:'Škoda',plate:'AB1234',fuel:'95',inspection:addDaysISO(td,20),octa:addDaysISO(td,60),serviceKm:15000,lastServiceKm:120000,serviceMonths:12,lastServiceDate:'2026-03-01'}));
    [[addDaysISO(td,-40),40,62.4,120200,true,'Neste'],[addDaysISO(td,-20),35,53.9,120700,true,'Virši'],[addDaysISO(td,-3),38,57.8,121210,true,'Circle K']].forEach(([date,liters,sum,odo,full,station])=>S.fuel.push(touch({id:uid(),car:'car1',date,liters,sum,price:sum/liters,odo,full,station})));
    addShopItems('молоко, хлеб, 10 яиц, сыр','Домой'); addShopItems('кефир, гречка, лекарства','Деду');
    [['молоко','Lidl',0.89],['молоко','Maxima',1.05],['хлеб','Lidl',1.19],['хлеб','Maxima',0.99],['сыр','Lidl',2.49],['сыр','Maxima',3.6]].forEach(([name,store,price])=>S.shopPrices.push(touch({id:uid(),name,store,price,date:td})));
    S.heat=Object.assign(heatDefaults(),{bagPrice:2.5,stockL:40*30,stockDate:td,area:90});
    addMoney({type:'in',amount:45,cat:'Продажа яиц',sec:'farm'}); addMoney({type:'out',amount:62.4,cat:'Корм',sec:'farm'});
    ui.tab='tasks'; } }
  // Открыли через «Поделиться» (Gmail, WhatsApp, браузер) — сразу форма нового дела.
  try{
    const q=new URLSearchParams(location.search), st=q.get('title'), sx=q.get('text'), su=q.get('url');
    if(st||sx||su){
      const first=((st||sx||su||'').split('\n')[0]||'').trim().slice(0,120);
      ui.tab='tasks'; ui.task='new'; ui.taskDraft={title:first, note:[st&&st!==first?st:'', sx&&sx!==first?sx:'', su||''].filter(Boolean).join('\n'), due:null};
      history.replaceState(null,'',location.pathname);
    }
  }catch(e){}
  render(); checkReminders();
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
  const area=FARM_TABS.includes(ui.tab)?'farm':ui.tab; if(area==='farm') ui.lastFarm=ui.tab;
  document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===area?'page':'false'));
  if(!loaded){ main.innerHTML=`<div class="card empty"><p class="hint">Загружаю данные хозяйства…</p>${note?`<div class="notice">${esc(note)}</div>`:''}</div>`; return; }
  const top=note?`<div class="notice" style="margin-bottom:12px">${esc(note)}</div>`:'';
  document.querySelector('nav.tabs').style.display=authView?'none':'';
  if(authView){ main.innerHTML=top+viewAuth(); return; }
  if(FARM_TABS.includes(ui.tab)&&(!S||!S.animals.length)){ main.innerHTML=top+farmSeg()+(ui.tab==='herd'?viewHerd():viewEmpty()); return; }
  if(!S&&ui.tab==='home') S=blank();
  const fv={ration:viewRation,stock:viewStock,tips:viewTips,journal:viewJournal,herd:viewHerd};
  main.innerHTML=top+(fv[ui.tab]?farmSeg()+fv[ui.tab]():({tasks:viewTasks,home:viewHome}[ui.tab]||viewTasks)())+(ui.task?taskSheet():'')+(ui.bill?billSheet():'')+(ui.feed&&F[ui.feed]?feedSheet(ui.feed):'')+(ui.photo?photoSheet():'')+(ui.chat&&ui.chat.open?chatSheet():'')+fabs();
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
    <button class="primary" data-act="seed-ours">Наше хозяйство: Шалфей, Тоша, Сметанка, Карамелька, Толик, куры</button>
    <p class="hint" style="margin:0">или по одному:</p>
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
function viewStock(){ return viewFeedStock(); }
function viewFeedStock(){
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
      <div class="card-head"><h3 id="stk-${f.id}">${feedLink(f.id)}</h3><div class="row">${dl}${known&&d>0&&daysLeft<14?`<button class="ghost" data-act="todo-buy" data-feed="${f.id}">В дела</button>`:''}</div></div>
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
  const ts=tasksSummary(); if(ts) lines.push(ts);
  const hs=heatSummary(); if(hs) lines.push(hs);
  const ob=live('bills').filter(b=>!b.paid).sort((a,b)=>a.due<b.due?-1:1).slice(0,10);
  if(ob.length) lines.push('Счета к оплате: '+ob.map(b=>`${b.to}${b.what?' ('+b.what+')':''} до ${b.due}${b.amount?' '+money(+b.amount):''}`).join('; '));
  const paidBy={}; for(const m of live('money').filter(m=>m.bill)) { (paidBy[m.bill]=paidBy[m.bill]||[]).push(+m.amount||0); }
  const pb=Object.entries(paidBy).map(([k,v])=>`${k}: в среднем ${money(v.reduce((s,x)=>s+x,0)/v.length)} (${v.length} оплат, последняя ${money(v[v.length-1])})`); if(pb.length) lines.push('История оплат: '+pb.join('; '));
  for(const c of live('cars')){ const s=carStats(c); if(s.fills.length) lines.push(`Машина ${c.name}: расход сейчас ${s.cur?fmt(s.cur,1):'—'} л/100 км, средний ${s.avg?fmt(s.avg,1):'—'}; по месяцам: ${Object.entries(s.byMonth).slice(-6).map(([k,v])=>k+' '+money(v.sum)).join(', ')}; техосмотр до ${c.inspection||'—'}, OCTA до ${c.octa||'—'}.`); }
  const ym=todayISO().slice(0,7), mm=live('money').filter(m=>m.date&&m.date.startsWith(ym));
  if(mm.length) lines.push(`Учёт за этот месяц: доходы ${money(mm.filter(m=>m.type==='in').reduce((s,m)=>s+(+m.amount||0),0))}, расходы ${money(mm.filter(m=>m.type==='out').reduce((s,m)=>s+(+m.amount||0),0))}.`);
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
  if(mode==='bill') return `На фото счёт к оплате (Латвия: Latvenergo, вода, связь, кредит и т.п.). Достань данные для оплаты.
Ответь только JSON: {"to": "получатель", "what": "за что, 1–3 слова по-русски", "amount": число евро или null, "due": "YYYY-MM-DD" или null, "iban": "IBAN получателя без пробелов" или null, "ref": "назначение платежа / номер договора или клиента" или null, "note": "одно предложение по-русски, если что-то неясно"}.
Не выдумывай: если поле не видно — null. Номера карт и личные коды не переписывай.`;
  if(mode==='fuel') return `На фото чек с заправки или табло колонки. Достань данные заправки.
Ответь только JSON: {"liters": число или null, "sum": число евро или null, "price": цена за литр или null, "station": "сеть заправки (Circle K, Neste, Viada, Virši…)" или null, "date": "YYYY-MM-DD" или null}. Не выдумывай — чего не видно, то null.`;
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
      const s=(v)=>v===null||v===undefined?'':String(v), n2=(v)=>isFinite(+v)&&+v>0?+v:'';
      if(p.mode==='bill'){ const x=p.res; ui.bill='new'; ui.billDraft={to:s(x.to), what:s(x.what), amount:n2(x.amount), due:/^\d{4}-\d\d-\d\d$/.test(s(x.due))?x.due:todayISO(), iban:s(x.iban).replace(/\s+/g,''), ref:s(x.ref), note:s(x.note), rep:'month', sec:'home', varies:!n2(x.amount)};
        p.urls.forEach(u=>URL.revokeObjectURL(u)); ui.photo=null; ui.tab='home'; ui.homeView='bills'; render(); return; }
      if(p.mode==='fuel'){ const x=p.res; ui.fuelDraft={liters:n2(x.liters), sum:n2(x.sum), price:n2(x.price), station:s(x.station), date:/^\d{4}-\d\d-\d\d$/.test(s(x.date))?x.date:todayISO()};
        p.urls.forEach(u=>URL.revokeObjectURL(u)); ui.photo=null; ui.tab='home'; ui.homeView='car'; render(); flash('Проверьте цифры с чека, впишите пробег и нажмите «Записать заправку».'); return; }
      if(p.mode==='weigh'){ const v=+p.res.value; p.kg=isFinite(v)&&v>0?(p.res.unit==='g'?v/1000:v):0;
        p.feed=F[p.res.feed]?p.res.feed:''; p.an=animalById(p.res.animal)?p.res.animal:''; }
      else { const v=+p.res.value; p.l=isFinite(v)&&v>0?v:0; }
    }
  }catch(e){ if(!e||e.code!=='cancelled') p.err=errText(e); if(e&&e.text&&p.mode==='store') p.text=e.text; }
  p.busy=false; render();
}
function photoSheet(){
  const p=ui.photo, an=S.animals.filter(a=>!a.planned);
  const modes=[['weigh','Весы'],['milk','Кувшин'],['bill','Счёт'],['fuel','Чек заправки'],['store','Склад']];
  const hint={bill:'Сфотографируйте счёт — Claude достанет получателя, сумму, срок и IBAN. Вы проверите и сохраните.',
    fuel:'Сфотографируйте чек или табло колонки — Claude достанет литры, сумму и цену.',
    weigh:'Сфотографируйте экран весов с кормом — Claude прочитает вес и предложит записать его в рацион.',
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
  L.push(`Отчёт MIGLANI — ${new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`,'');
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
  return `Ты — дружелюбный помощник по подворью в приложении MIGLANI. Хозяйство находится в Латвии, цены в евро. Помогаешь хозяйке с кормлением, рационами, уходом, хранением кормов, здоровьем животных, учётом и развитием хозяйства.
Тон: говори с ней тепло, по-дружески и с уважением — как заботливая, мудрая мама: бережно, спокойно, без поучений, упрёков и страшилок. Она добрый, тёплый и ранимый человек: сначала замечай, что у неё уже хорошо получается, ошибки называй мягко («давай попробуем вот так»), поддерживай и подбадривай, но не сюсюкай и не льсти. Обращайся на «ты» мягко и по-доброму. Если она переживает — сначала успокой, потом помоги по делу.
Правила: отвечай по-русски, коротко и практично, конкретными цифрами там, где можно; опирайся на данные хозяйства ниже. Если по описанию есть признаки болезни или опасности (не ест, вздутие, колики, хромота, кровь, высокая температура) — прямо советуй срочно вызвать ветеринара. Про законы и субсидии Латвии (PVD, LAD, VID) отвечай в общих чертах и советуй уточнить на их сайтах. Если чего-то не знаешь — так и скажи. Без заголовков с # и без звёздочек; списки через «—».
Подсказки по приложению (вкладки внизу): «Дела» — ежедневник, сводка «Что требует внимания», напоминания, «В Google Календарь»; «Дом» — Счета (напоминания, «Скопировать реквизиты», «Оплачено»), Учёт (доходы и расходы, выгрузка для Excel), Машина (заправки, расход, техосмотр, OCTA), Покупки (списки «Домой» и «Деду», режим «В магазине», где дешевле, маршрут); «Рацион» — нормы, «Составить рацион», «Подобрать дешевле», и рядом «Советы» с планом развития; «Запасы» — корма на складе и «Дрова и тепло» (сколько уходит на отопление и как сэкономить); «Журнал» — надои, яйца, вес; «Хозяйство» — животные, свои корма, отчёт на почту, участники. Кнопка с фотоаппаратом распознаёт весы, кувшин, счёт, чек заправки и склад. Если она просит то, что уже есть, — подскажи, где это. Если чего-то нет — предложи нажать «Предложить улучшение» внизу окна помощника.

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
    ${c.req?`<div class="builder"><strong>Что неудобно или чего не хватает?</strong><textarea id="req-text" class="note" rows="3" placeholder="Например: хочу видеть дела деда отдельно…">${esc(c.reqDraft||'')}</textarea>
      <div class="row"><button class="primary" data-act="req-send">Отправить пожелание</button><button data-act="req-close">Отмена</button></div>
      <p class="hint" style="margin:0">Пожелание увидит владелец хозяйства. Статус — во вкладке «Хозяйство».</p></div>`
      :'<button class="ghost" data-act="req-open" style="align-self:flex-start">💡 Предложить улучшение приложения</button>'}
    <p class="hint" style="margin:0">Ответы — от Claude, это не замена ветеринару. Нужен интернет.</p>
  </div></div>`;
}

/* ---------- Дрова и тепло ---------- */
// Плотность древесины при ~20% влажности, кг/м³ плотной древесины; теплота сгорания, кВт·ч/кг по влажности; КПД топки.
const WOOD={birch:['Берёза',650],alder:['Ольха',500],aspen:['Осина',480],pine:['Сосна, ель',500],oak:['Дуб, ясень',720],mixed:['Смешанные',570]};
const MOIST={dry:['сухие, до 20% — сохли 1–2 года под крышей',4.0],seasoned:['подсохшие, 20–30%',3.6],wet:['сырые, свежепиленые 35% и больше',2.8]};
const STOVE={pyro:['Пиролизный или современный котёл',0.82],boiler:['Обычный твердотопливный котёл',0.65],stove:['Кирпичная печь',0.7],metal:['Металлическая печь («буржуйка»)',0.55],fireplace:['Открытый камин',0.25]};
const HOUSE={old:['Старый дом без утепления',230],avg:['Частично утеплён',160],good:['Хорошо утеплён',100]};
// Доля плотной древесины: насыпью (мешок, насыпной м³) ≈0,45; складом (складочный м³) ≈0,7; в топке ≈0,5.
const SOLID={loose:0.45, stacked:0.7, firebox:0.5};
function heatDefaults(){ return {wood:'birch', moist:'seasoned', stove:'boiler', boilerL:60, fill:80, loads:2, bagL:40, bagPrice:'', m3Price:'', stockL:null, stockDate:null, area:'', house:'avg', season:200, elec:0.20, buys:[]}; }
function heatCalc(){
  const h=Object.assign(heatDefaults(), S.heat||{});
  const dens=WOOD[h.wood][1], cv=MOIST[h.moist][1], eff=STOVE[h.stove][1];
  const loadLooseL=(+h.boilerL||0)*(+h.fill||0)/100*SOLID.firebox/SOLID.loose;      // одна закладка в литрах «насыпью»
  const kWhPerLooseL=SOLID.loose/1000*dens*cv;                                     // тепло в литре дров насыпью (в дровах)
  const dayLooseL=loadLooseL*(+h.loads||0), dayKWh=dayLooseL*kWhPerLooseL*eff;      // полезное тепло в день
  const pL=+h.bagPrice&&+h.bagL?(+h.bagPrice)/(+h.bagL):(+h.m3Price?(+h.m3Price)/1000:0);
  const costDay=dayLooseL*pL, costKWh=dayKWh?costDay/dayKWh:0;
  const since=h.stockDate?Math.max(0,dayDiff(h.stockDate,todayISO())):0;
  const left=h.stockL!==null&&h.stockL!==''?Math.max(0,(+h.stockL)-dayLooseL*since):null;
  const need=+h.area?(+h.area)*HOUSE[h.house][1]:0;                               // кВт·ч тепла дому за сезон
  const needLooseL=need&&kWhPerLooseL*eff?need/(kWhPerLooseL*eff):0;
  return {h,dens,cv,eff,loadLooseL,kWhPerLooseL,dayLooseL,dayKWh,pL,costDay,costKWh,left,daysLeft:left!==null&&dayLooseL?left/dayLooseL:null,need,needLooseL};
}
const m3=(L)=>fmt(L/1000,1)+' м³';
function heatTips(c){
  const h=c.h, out=[];
  if(h.moist!=='dry'){ const gain=(MOIST.dry[1]/c.cv-1)*100;
    out.push({lv:'warn',who:'Сухость дров',txt:`Сухие дрова дают на ${fmt(gain,0)}% больше тепла${c.costDay?` — это ≈ ${money(c.costDay*30*(1-c.cv/MOIST.dry[1]))} в месяц`:''}. Покупайте дрова весной на следующую зиму и сушите год-два под навесом, поленницей с продувом, накрытой только сверху. Влагомер стоит около 10–15 € — сухие дрова показывают меньше 20%.`}); }
  if(h.stove==='fireplace'||h.stove==='metal') out.push({lv:'warn',who:'Печь',txt:`${STOVE[h.stove][0]} отдаёт в дом только около ${fmt(c.eff*100,0)}% тепла дров. Кирпичный экран вокруг металлической печи или закрытая топка с дверцей заметно поднимают КПД.`});
  if(h.stove==='boiler') out.push({lv:'idea',who:'Котёл',txt:'Обычный котёл теряет много тепла, когда его душат воздухом ночью: дрова тлеют, в трубе оседает дёготь. Лучше топить в полную силу и копить тепло в баке-аккумуляторе (буферной ёмкости) — экономия дров до 20–30%. Чистите теплообменник и дымоход раз в месяц в сезон: 1 мм сажи — минус несколько процентов тепла.'});
  if(+h.fill<70) out.push({lv:'idea',who:'Закладка',txt:`Топка заполняется на ${fmt(+h.fill,0)}%. Полная закладка горит ровнее и с большим КПД, чем частые маленькие подкладки.`});
  out.push({lv:'idea',who:'Розжиг сверху',txt:'Кладите крупные поленья вниз, мелкие — наверх и разжигайте сверху: дрова горят дольше, меньше дыма и сажи, больше тепла от той же закладки.'});
  if(h.house!=='good'){ const save=h.house==='old'?0.3:0.15;
    out.push({lv:'idea',who:'Утепление',txt:`Больше всего тепла уходит через потолок и окна. Утепление чердака (20–30 см минваты) и уплотнители на окнах и дверях в ${h.house==='old'?'неутеплённом':'частично утеплённом'} доме экономят около ${fmt(save*100,0)}% дров${c.costDay?` — примерно ${money(c.costDay*(+h.season||200)*save)} за сезон`:''}. Отражающий экран за радиаторами и шторы на ночь — копеечные, но тоже помогают.`}); }
  if(c.costKWh&&+h.elec) out.push({lv:c.costKWh<(+h.elec)?'ok':'warn',who:'Сравнение',txt:`1 кВт·ч тепла из ваших дров стоит ${money(c.costKWh)}, электричество — ${money(+h.elec)}, тепловой насос (воздух–воздух) — примерно ${money((+h.elec)/3)}. ${c.costKWh<(+h.elec)/3?'Дрова сейчас самые выгодные.':c.costKWh<(+h.elec)?'Дрова выгоднее прямого электроотопления; для межсезонья можно присмотреться к тепловому насосу.':'Дрова сейчас дороже электричества — проверьте цену и сухость дров.'}`});
  out.push({lv:'idea',who:'Порода',txt:`Сравнивайте не цену за куб, а цену за тепло: в кубе берёзы ≈ ${fmt(WOOD.birch[1]*SOLID.loose*c.cv/1000,1)} МВт·ч, ольхи ≈ ${fmt(WOOD.alder[1]*SOLID.loose*c.cv/1000,1)}, осины ≈ ${fmt(WOOD.aspen[1]*SOLID.loose*c.cv/1000,1)} (насыпью). Ольха дешевле, но тепла даёт на ~23% меньше берёзы.`});
  return out;
}
function viewHeat(){
  const c=heatCalc(), h=c.h, sd=+h.season||200;
  const opt=(o,v)=>Object.entries(o).map(([k,[l]])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('');
  const bags=(L)=>+h.bagL?fmt(L/(+h.bagL),1)+' меш.':'—';
  const tip=(x)=>`<div class="tip ${x.lv}"><div><span class="who">${esc(x.who)}</span><p>${esc(x.txt)}</p></div></div>`;
  const buys=(h.buys||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  return `
  <section class="section"><div class="section-head"><h2>Сколько уходит на тепло</h2><span class="hint">по вашим цифрам ниже</span></div>
    <div class="summary">
      <div class="stat"><span class="k">В день</span><span class="v">${bags(c.dayLooseL)}</span><span class="s">${c.costDay?money(c.costDay):'укажите цену'} · ${fmt(c.dayKWh,0)} кВт·ч тепла</span></div>
      <div class="stat"><span class="k">В месяц</span><span class="v">${c.costDay?money(c.costDay*30):bags(c.dayLooseL*30)}</span><span class="s">${bags(c.dayLooseL*30)} · ${m3(c.dayLooseL*30)} насыпью</span></div>
      <div class="stat"><span class="k">За сезон (${sd} дн.)</span><span class="v">${c.costDay?money(c.costDay*sd):m3(c.dayLooseL*sd)}</span><span class="s">${m3(c.dayLooseL*sd)} насыпью · ${m3(c.dayLooseL*sd*SOLID.loose/SOLID.stacked)} складом</span></div>
      <div class="stat"><span class="k">Запаса хватит</span><span class="v">${c.daysLeft!==null?fmt(c.daysLeft,0)+' дн.':'—'}</span><span class="s">${c.daysLeft!==null?'до '+addDays(c.daysLeft)+' · осталось '+bags(c.left):'впишите остаток или покупку'}</span></div>
    </div>
    ${c.need?`<div class="notice">Дому ${+h.area} м² (${HOUSE[h.house][0].toLowerCase()}) нужно примерно ${fmt(c.need/1000,1)} МВт·ч тепла за сезон — это ≈ ${m3(c.needLooseL)} таких дров насыпью${c.pL?` (${money(c.needLooseL*c.pL)})`:''}. При вашей топке выходит ${m3(c.dayLooseL*sd)}: ${c.dayLooseL*sd<c.needLooseL*0.85?'похоже, топите меньше, чем нужно дому, — в доме может быть прохладно.':c.dayLooseL*sd>c.needLooseL*1.2?'это больше расчётной потребности — проверьте сухость дров, тягу и утепление.':'в пределах нормы.'}</div>`:''}
  </section>
  <section class="section"><div class="section-head"><h2>Котёл или печь</h2></div>
    <div class="card"><div class="form-grid">
      <label class="f">Что топим<select id="ht-stove" data-heat="stove">${opt(STOVE,h.stove)}</select></label>
      <label class="f">Объём топки, литров<input id="ht-bl" inputmode="decimal" data-heat="boilerL" value="${esc(h.boilerL)}"></label>
      <label class="f">Заполняю топку, %<input id="ht-fill" inputmode="decimal" data-heat="fill" value="${esc(h.fill)}"></label>
      <label class="f">Закладок в день<input id="ht-loads" inputmode="decimal" data-heat="loads" value="${esc(h.loads)}"></label>
    </div>
    <details ${ui.open.dims?'open':''} data-det="dims"><summary>Не знаю объём — посчитать по размерам топки</summary>
      <div class="form-grid" style="margin-top:8px">
        <label class="f">Ширина, см<input id="ht-w" inputmode="decimal" value="${esc(ui.dimW||'')}"></label>
        <label class="f">Глубина, см<input id="ht-d" inputmode="decimal" value="${esc(ui.dimD||'')}"></label>
        <label class="f">Высота до дверцы, см<input id="ht-h" inputmode="decimal" value="${esc(ui.dimH||'')}"></label>
      </div><button style="margin-top:8px" data-act="heat-dims">Посчитать объём</button></details>
    <p class="hint" style="margin:0">Одна закладка ≈ ${bags(c.loadLooseL)} (${fmt(c.loadLooseL,0)} л дров насыпью), даёт ≈ ${fmt(c.loadLooseL*c.kWhPerLooseL*c.eff,0)} кВт·ч тепла в дом (КПД ≈ ${fmt(c.eff*100,0)}%).</p></div>
  </section>
  <section class="section"><div class="section-head"><h2>Дрова</h2></div>
    <div class="card"><div class="form-grid">
      <label class="f">Порода<select id="ht-wood" data-heat="wood">${opt(WOOD,h.wood)}</select></label>
      <label class="f">Влажность<select id="ht-moist" data-heat="moist">${opt(MOIST,h.moist)}</select></label>
      <label class="f">Объём мешка, л<input id="ht-bag" inputmode="decimal" data-heat="bagL" value="${esc(h.bagL)}"></label>
      <label class="f">Цена мешка, €<input id="ht-bp" inputmode="decimal" data-heat="bagPrice" value="${esc(h.bagPrice)}" placeholder="0"></label>
      <label class="f">или цена насыпного м³, €<input id="ht-mp" inputmode="decimal" data-heat="m3Price" value="${esc(h.m3Price)}" placeholder="0"></label>
      <label class="f">Сейчас есть, мешков<input id="ht-stock" inputmode="decimal" data-heat="stockBags" value="${c.left!==null&&+h.bagL?fmt(c.left/(+h.bagL),0):''}" placeholder="посчитать"></label>
    </div><p class="hint" style="margin:0">Насыпной м³ — дрова навалом в кузове; складочный — ровно сложенные в поленницу (в нём дров примерно в 1,5 раза больше).</p></div>
  </section>
  <section class="section"><div class="section-head"><h2>Купили дрова</h2><span class="hint">запишется в бюджет дома</span></div>
    <div class="card"><div class="form-grid">
      <label class="f">Дата<input type="date" id="hb-date" value="${todayISO()}"></label>
      <label class="f">Сколько<input id="hb-qty" inputmode="decimal" placeholder="0"></label>
      <label class="f">Чего<select id="hb-unit"><option value="bag">мешков</option><option value="m3l">м³ насыпью</option><option value="m3s">м³ складом</option></select></label>
      <label class="f">Заплатили всего, €<input id="hb-sum" inputmode="decimal" placeholder="0"></label>
    </div><div class="row"><button class="primary" data-act="heat-buy">Записать покупку</button></div>
    ${buys.length?`<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Сколько</th><th class="n">€</th><th class="n">€ за кВт·ч</th></tr></thead><tbody>${buys.map(b=>{ const L=b.unit==='bag'?b.qty*(+h.bagL||40):b.unit==='m3l'?b.qty*1000:b.qty*1000*SOLID.stacked/SOLID.loose;
      return `<tr><td>${shortDate(b.date)}</td><td>${fmt(b.qty,1)} ${b.unit==='bag'?'меш.':b.unit==='m3l'?'м³ насыпью':'м³ складом'}</td><td class="n">${money(b.sum)}</td><td class="n">${L&&c.kWhPerLooseL?money(b.sum/(L*c.kWhPerLooseL*c.eff)):'—'}</td></tr>`; }).join('')}</tbody></table></div>`:''}</div>
  </section>
  <section class="section"><div class="section-head"><h2>Дом</h2><span class="hint">чтобы проверить, хватает ли тепла</span></div>
    <div class="card"><div class="form-grid">
      <label class="f">Площадь, м²<input id="ht-area" inputmode="decimal" data-heat="area" value="${esc(h.area)}" placeholder="например, 90"></label>
      <label class="f">Дом<select id="ht-house" data-heat="house">${opt(HOUSE,h.house)}</select></label>
      <label class="f">Отопительный сезон, дней<input id="ht-season" inputmode="numeric" data-heat="season" value="${esc(h.season)}"></label>
      <label class="f">Электричество, € за кВт·ч<input id="ht-el" inputmode="decimal" data-heat="elec" value="${esc(h.elec)}"></label>
    </div></div>
  </section>
  <section class="section"><div class="section-head"><h2>Как сделать теплее и выгоднее</h2></div>
    <div class="advice">${heatTips(c).map(tip).join('')}</div>
    ${SAMPLE&&(!farm||aiEnabled)?'<button data-act="heat-ask">Спросить помощника про отопление</button>':''}
    <p class="hint">Расчёт примерный: по средней плотности и теплоте сгорания породы, влажности и КПД топки. Точнее всего — сравнить с тем, сколько мешков реально уходит за неделю, и поправить «закладок в день».</p>
  </section>`;
}
function heatSummary(){
  if(!S||!S.heat) return '';
  const c=heatCalc(), h=c.h;
  return `Отопление: ${STOVE[h.stove][0]}, топка ${h.boilerL} л, ${h.loads} закладок в день, дрова — ${WOOD[h.wood][0].toLowerCase()}, ${MOIST[h.moist][0]}; уходит ≈ ${fmt(c.dayLooseL/1000,2)} м³ насыпью в день${c.costDay?', '+money(c.costDay)+' в день, '+money(c.costDay*30)+' в месяц, 1 кВт·ч тепла '+money(c.costKWh):''}${h.area?'; дом '+h.area+' м², '+HOUSE[h.house][0].toLowerCase():''}${c.daysLeft!==null?'; запаса на '+fmt(c.daysLeft,0)+' дн.':''}.`;
}

/* ---------- Дом: счета, учёт, машина, покупки ---------- */
const live=(k)=>((S&&S[k])||[]).filter(x=>!x.deleted);
const touch=(x)=>{ x.updatedAt=Date.now(); return x; };
const monthName=(ym)=>{ const s=new Date(ym+'-15T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'}); return s[0].toUpperCase()+s.slice(1); };
const addMonthsISO=(iso,n)=>{ const d=new Date(iso+'T12:00:00'), day=d.getDate(); d.setDate(1); d.setMonth(d.getMonth()+n); d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate())); return isoOf(d); };
async function copyText(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch(e){ try{ const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); const ok=document.execCommand('copy'); ta.remove(); return ok; }catch(e2){ return false; } }
}
function flash(msg){ note=msg; render(); clearTimeout(flash.t); flash.t=setTimeout(()=>{ note=null; render(); },3500); }
function addMoney(p){ if(!S) S=blank(); const m=touch(Object.assign({id:uid(), date:todayISO(), type:'out', amount:0, sec:'home', cat:'Прочее', note:''},p)); S.money.push(m); return m; }

// ---- Счета ----
const BREPS={month:'каждый месяц', quarter:'каждый квартал', year:'каждый год', once:'разово'};
const billNext=(iso,rep)=>rep==='month'?addMonthsISO(iso,1):rep==='quarter'?addMonthsISO(iso,3):rep==='year'?addMonthsISO(iso,12):null;
const billReq=(b,amt)=>[`Получатель: ${b.to||''}`, b.iban?`IBAN: ${b.iban.replace(/\s+/g,'')}`:'', b.ref?`Назначение: ${b.ref}`:'', (amt||b.amount)?`Сумма: ${fmt(amt||b.amount,2)} EUR`:''].filter(Boolean).join('\n');
function viewBills(){
  const today=todayISO(), wk=addDaysISO(today,7), ym=today.slice(0,7);
  const open=live('bills').filter(b=>!b.paid).sort((a,b)=>a.due<b.due?-1:1);
  const monthSum=open.filter(b=>b.due<=ym+'-31').reduce((s,b)=>s+(+b.amount||0),0);
  const varies=open.filter(b=>b.due<=ym+'-31'&&b.varies&&!(+b.amount)).length;
  const row=(b)=>{ const over=b.due<today, soon=!over&&b.due<=addDaysISO(today,3);
    return `<div class="task ${over?'over':''}"><button class="tick pay" data-act="bill-pay" data-b="${b.id}" aria-label="Оплачено: ${esc(b.to)}">€</button>
      <button class="task-body" data-act="bill-open" data-b="${b.id}"><span class="task-title">${esc(b.to||'Счёт')}${b.what?' — '+esc(b.what):''}</span>
      <span class="task-meta">${over?'просрочен · ':soon?'скоро · ':''}до ${shortDate(b.due)} · ${b.amount?money(+b.amount):b.varies?'сумма разная':'—'} · ${BREPS[b.rep]} · ${SECS[b.sec]||''}</span></button></div>`; };
  const groups=[['Просрочено',open.filter(b=>b.due<today),'over'],['На этой неделе',open.filter(b=>b.due>=today&&b.due<=wk)],['В этом месяце',open.filter(b=>b.due>wk&&b.due<=ym+'-31')],['Позже',open.filter(b=>b.due>ym+'-31')]];
  const paid=live('bills').filter(b=>b.paid).sort((a,b)=>(b.paidAt||0)-(a.paidAt||0)).slice(0,10);
  return `<section class="section"><div class="summary"><div class="stat"><span class="k">К оплате в ${new Date().toLocaleDateString('ru-RU',{month:'long'})}</span><span class="v">${money(monthSum)}</span><span class="s">${varies?`и ещё ${varies} с разной суммой`:open.filter(b=>b.due<today).length?'есть просроченные':'всё по плану'}</span></div></div>
    <div class="row"><button class="primary" data-act="bill-new">+ Счёт</button>${SAMPLE_IMG&&(!farm||aiEnabled)?'<button data-act="photo-open" data-m="bill">📷 Счёт по фото</button>':''}</div></section>
  ${groups.filter(g=>g[1].length).map(([h,l,k])=>`<section class="section tgroup ${k||''}"><div class="section-head"><h2>${h}</h2><span class="hint">${money(l.reduce((s,b)=>s+(+b.amount||0),0))}</span></div><div class="card tlist">${l.map(row).join('')}</div></section>`).join('')||'<div class="card empty"><p class="hint">Счетов пока нет. Добавьте свет, воду, связь, кредит, страховку — приложение напомнит за 3 дня и в день срока.</p></div>'}
  ${paid.length?`<section class="section"><details><summary>Оплачено недавно</summary><div class="card tlist">${paid.map(b=>`<div class="task done"><span class="tick">✓</span><span class="task-body"><span class="task-title">${esc(b.to)}${b.what?' — '+esc(b.what):''}</span><span class="task-meta">${money(+b.paidAmount||+b.amount||0)} · оплачено ${shortDate(isoOf(new Date(b.paidAt)))}</span></span></div>`).join('')}</div></details></section>`:''}
  <p class="hint">Платить приложение не умеет и не хранит карты, PIN и пароли банка: «Скопировать реквизиты» — и вставить в интернет-банк. Свой счёт, если нужно, — только последние 4 цифры в заметке.</p>`;
}
function billSheet(){
  const isNew=ui.bill==='new', b=isNew?Object.assign({to:'',what:'',sec:'home',amount:'',varies:false,due:todayISO(),rep:'month',iban:'',ref:'',note:''},ui.billDraft||{}):live('bills').find(x=>x.id===ui.bill);
  if(!b){ ui.bill=null; return ''; }
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('');
  const paying=ui.billPay===b.id;
  return `<div class="sheet-bg" data-act="bill-close"><div class="sheet" role="dialog" aria-modal="true" aria-label="Счёт" data-stop="1">
    <div class="card-head"><h2>${isNew?'Новый счёт':esc(b.to||'Счёт')}</h2><button class="ghost" data-act="bill-close">✕</button></div>
    ${paying?`<div class="builder"><strong>Сколько заплатили?</strong><div class="row"><input id="bl-paid" inputmode="decimal" value="${b.amount?fmt(b.amount,2):''}" style="width:140px" placeholder="€"><button class="primary" data-act="bill-pay-ok" data-b="${b.id}">Оплачено</button><button data-act="bill-pay-no">Отмена</button></div><p class="hint" style="margin:0">Расход запишется в «Учёт», следующий счёт поставится по графику.</p></div>`:''}
    <div class="form-grid">
      <label class="f">Кому (получатель)<input id="bl-to" value="${esc(b.to)}" placeholder="Latvenergo, Daugavpils ūdens…" list="bl-payees"></label>
      <label class="f">За что<input id="bl-what" value="${esc(b.what)}" placeholder="свет, вода, связь…"></label>
      <label class="f">Сумма, €<input id="bl-amt" inputmode="decimal" value="${b.amount===''||b.amount==null?'':fmt(b.amount,2)}" placeholder="если разная — пусто"></label>
      <label class="f">Оплатить до<input type="date" id="bl-due" value="${esc(b.due||'')}"></label>
      <label class="f">Повтор<select id="bl-rep">${opt(BREPS,b.rep)}</select></label>
      <label class="f">Раздел<select id="bl-sec">${opt(SECS,b.sec)}</select></label>
      <label class="f">IBAN получателя<input id="bl-iban" value="${esc(b.iban)}" placeholder="LV.." autocapitalize="characters"></label>
      <label class="f">Назначение / № договора<input id="bl-ref" value="${esc(b.ref)}"></label>
    </div>
    <datalist id="bl-payees">${[...new Set(live('bills').map(x=>x.to).filter(Boolean))].map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <label class="row" style="font-size:14px"><input type="checkbox" id="bl-varies" ${b.varies?'checked':''}> Сумма каждый раз разная (свет, вода) — спросить при оплате</label>
    <label class="f">Заметка<textarea id="bl-note" class="note" rows="2">${esc(b.note||'')}</textarea></label>
    <div class="row"><button class="primary" data-act="bill-save">Сохранить</button>
      ${isNew?'':`<button data-act="bill-copy" data-b="${b.id}">Скопировать реквизиты</button><button data-act="bill-pay" data-b="${b.id}">Оплачено</button><a class="btn" href="${esc(gcalUrl({title:'Оплатить: '+(b.to||'счёт'),due:b.due,time:null,note:billReq(b),sec:b.sec,rep:'none'}))}" target="_blank" rel="noopener">В Google Календарь</a>`}</div>
    ${isNew?'':(ui.confirmBill?`<div class="row"><span class="hint">Удалить счёт?</span><button class="danger" data-act="bill-del-yes">Удалить</button><button data-act="bill-del-no">Отмена</button></div>`:'<button class="ghost" data-act="bill-del" style="align-self:flex-start;color:var(--bad)">Удалить счёт</button>')}
  </div></div>`;
}
function billSave(){
  const g=(k)=>document.getElementById('bl-'+k), to=g('to').value.trim(); if(!to){ g('to').focus(); return; }
  const amt=g('amt').value.trim();
  const p={to, what:g('what').value.trim(), amount:amt===''?'':Math.max(0,num(amt)), due:g('due').value||todayISO(), rep:g('rep').value, sec:g('sec').value,
    iban:g('iban').value.replace(/\s+/g,'').toUpperCase(), ref:g('ref').value.trim(), varies:g('varies').checked, note:g('note').value.trim()};
  if(!S) S=blank();
  if(ui.bill==='new') S.bills.push(touch(Object.assign({id:uid(), paid:false},p))); else touch(Object.assign(live('bills').find(x=>x.id===ui.bill)||{},p));
  ui.bill=null; ui.billDraft=null; save(); render();
}
function billPaid(id, amt){
  const b=live('bills').find(x=>x.id===id); if(!b) return;
  const sum=amt>0?amt:+b.amount||0;
  b.paid=true; b.paidAt=Date.now(); b.paidAmount=sum; touch(b);
  if(sum>0) addMoney({type:'out', amount:sum, sec:b.sec, cat:b.what?b.what[0].toUpperCase()+b.what.slice(1):'Коммуналка', note:'Счёт: '+b.to, bill:b.to});
  const nd=billNext(b.due,b.rep);
  if(nd) S.bills.push(touch({id:uid(), to:b.to, what:b.what, sec:b.sec, amount:b.varies?'':b.amount, varies:b.varies, due:nd, rep:b.rep, iban:b.iban, ref:b.ref, note:b.note, paid:false}));
  ui.billPay=null; ui.bill=null; save(); flash(`Оплачено: ${b.to}${sum?' — '+money(sum)+' записано в «Учёт»':''}${nd?'. Следующий счёт — до '+shortDate(nd):''}.`);
}

// ---- Учёт ----
const CATS_OUT=['Корм','Ветеринар','Дрова','Коммуналка','Топливо','Ремонт','Продукты','Связь','Кредит','Налоги','Одежда','Прочее'];
const CATS_IN=['Продажа молока','Продажа яиц','Продажа молодняка','Зарплата','Подарок','Прочее'];
const catsFor=(type)=>[...new Set([...(type==='in'?CATS_IN:CATS_OUT), ...((S&&S.settings.moneyCats&&S.settings.moneyCats[type])||[]), ...live('money').filter(m=>m.type===type).map(m=>m.cat)])].filter(Boolean);
function viewMoney(){
  const ym=ui.ym||todayISO().slice(0,7), list=live('money').filter(m=>m.date&&m.date.startsWith(ym)).sort((a,b)=>b.date.localeCompare(a.date));
  const inc=list.filter(m=>m.type==='in').reduce((s,m)=>s+(+m.amount||0),0), out=list.filter(m=>m.type==='out').reduce((s,m)=>s+(+m.amount||0),0);
  const bySec={}, byCat={}; for(const m of list.filter(m=>m.type==='out')){ bySec[m.sec]=(bySec[m.sec]||0)+(+m.amount||0); byCat[m.cat]=(byCat[m.cat]||0)+(+m.amount||0); }
  const bars=(o)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bal-row"><span class="lbl">${esc(SECS[k]||k)}</span><span class="val">${money(v)} · ${fmt(out?v/out*100:0,0)}%</span><div class="bar"><b style="width:${out?v/out*100:0}%"></b></div></div>`).join('');
  const mt=ui.mType||'out';
  return `<section class="section"><div class="day-nav"><button class="ghost big-btn" data-act="ym" data-n="-1" aria-label="Прошлый месяц">‹</button><span class="day-title" style="text-transform:none">${monthName(ym)}</span><button class="ghost big-btn" data-act="ym" data-n="1" aria-label="Следующий месяц">›</button></div>
    <div class="summary"><div class="stat"><span class="k">Доходы</span><span class="v" style="color:var(--ok)">${money(inc)}</span></div>
      <div class="stat"><span class="k">Расходы</span><span class="v">${money(out)}</span></div>
      <div class="stat"><span class="k">Разница</span><span class="v" style="color:${inc-out>=0?'var(--ok)':'var(--bad)'}">${inc-out>=0?'+':''}${money(inc-out)}</span></div></div></section>
  <section class="section"><div class="section-head"><h2>Записать</h2></div><div class="card">
    <div class="seg"><button data-act="m-type" data-t="out" aria-pressed="${mt==='out'}">Расход</button><button data-act="m-type" data-t="in" aria-pressed="${mt==='in'}">Доход</button></div>
    <div class="form-grid">
      <label class="f">Сумма, €<input id="mn-amt" inputmode="decimal" placeholder="0"></label>
      <label class="f">Категория<input id="mn-cat" list="mn-cats" placeholder="${mt==='in'?'Продажа яиц':'Корм'}"></label>
      <label class="f">Раздел<select id="mn-sec">${Object.entries(SECS).map(([k,l])=>`<option value="${k}" ${k==='home'?'selected':''}>${l}</option>`).join('')}</select></label>
      <label class="f">Дата<input type="date" id="mn-date" value="${ym===todayISO().slice(0,7)?todayISO():ym+'-01'}"></label>
    </div><datalist id="mn-cats">${catsFor(mt).map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    <label class="f">Заметка<input id="mn-note" placeholder="необязательно"></label>
    <div class="row"><button class="primary" data-act="m-add">Записать</button></div></div></section>
  ${out?`<section class="section"><div class="section-head"><h2>Куда ушли деньги</h2></div><div class="card"><div class="bal">${bars(bySec)}</div><div class="bal" style="margin-top:8px">${bars(byCat)}</div></div></section>`:''}
  <section class="section"><div class="section-head"><h2>Записи за месяц</h2><button class="ghost" data-act="m-csv">Скачать для Excel (.csv)</button></div>
    ${list.length?`<div class="card"><div class="tbl-wrap"><table><tbody>${list.map(m=>`<tr><td>${shortDate(m.date)}<span class="small">${esc(SECS[m.sec]||'')}</span></td><td>${esc(m.cat)}${m.note?`<span class="small">${esc(m.note)}</span>`:''}</td><td class="n" style="color:${m.type==='in'?'var(--ok)':'inherit'}">${m.type==='in'?'+':'−'}${money(+m.amount||0)}</td><td class="n">${ui.confirmMoney===m.id?`<button class="danger" data-act="m-del-yes" data-m="${m.id}">Удалить</button>`:`<button class="ghost" data-act="m-del" data-m="${m.id}" aria-label="Удалить запись">✕</button>`}</td></tr>`).join('')}</tbody></table></div></div>`:'<p class="hint">Записей за этот месяц нет. Покупка дров, оплата счетов, заправки и покупки в магазине записываются сюда сами.</p>'}</section>`;
}
function moneyCSV(){
  const rows=[['Дата','Тип','Сумма EUR','Раздел','Категория','Заметка']];
  for(const m of live('money').sort((a,b)=>a.date.localeCompare(b.date))) rows.push([m.date, m.type==='in'?'доход':'расход', String((+m.amount||0).toFixed(2)).replace('.',','), SECS[m.sec]||m.sec, m.cat, m.note||'']);
  return '﻿'+rows.map(r=>r.map(v=>/[;"\n]/.test(String(v))?'"'+String(v).replace(/"/g,'""')+'"':v).join(';')).join('\r\n');
}

// ---- Машина ----
const FUELS={'95':'Бензин 95','98':'Бензин 98',diesel:'Дизель',lpg:'Газ (LPG)'};
const r2=(x)=>Math.round((+x||0)*100)/100;                 // деньги — ровно до цента
function carStats(car){
  const fills=live('fuel').filter(f=>f.car===car.id).sort((a,b)=>(+a.odo||0)-(+b.odo||0)||a.date.localeCompare(b.date));
  const segs=[]; let lastFull=null, acc=0;
  for(const f of fills){ if(lastFull){ acc+=+f.liters||0; if(f.full&&+f.odo>+lastFull.odo){ segs.push({l:acc, km:+f.odo-+lastFull.odo, to:f}); acc=0; lastFull=f; } } else if(f.full){ lastFull=f; acc=0; } }
  const segL=segs.reduce((s,x)=>s+x.l,0), segKm=segs.reduce((s,x)=>s+x.km,0);
  const odoMin=fills.length?+fills[0].odo||0:0, odoMax=fills.length?+fills[fills.length-1].odo||0:0, km=odoMax-odoMin;
  const sumAfterFirst=fills.slice(1).reduce((s,f)=>s+(+f.sum||0),0);
  const byMonth={}; for(const f of fills){ const ym=f.date.slice(0,7); byMonth[ym]=byMonth[ym]||{sum:0,l:0}; byMonth[ym].sum+=+f.sum||0; byMonth[ym].l+=+f.liters||0; }
  const st={}; for(const f of fills) if(f.station&&+f.price){ (st[f.station]=st[f.station]||[]).push(+f.price); }
  const stations=Object.entries(st).map(([n,p])=>({n,avg:p.reduce((s,x)=>s+x,0)/p.length,cnt:p.length})).sort((a,b)=>a.avg-b.avg);
  return {fills, cur:segs.length?segs[segs.length-1].l/segs[segs.length-1].km*100:null, avg:segKm?segL/segKm*100:null, perKm:km>0?sumAfterFirst/km:null, byMonth, stations, odo:odoMax};
}
function carAlerts(){
  const R=[], at9=(iso)=>new Date(iso+'T09:00:00').getTime();
  for(const c of live('cars')){
    const add=(due,days,what)=>{ if(!due) return; for(const d of days) R.push({key:'c|'+c.id+'|'+what+'|'+due+'|'+d, at:at9(addDaysISO(due,-d)), title:`${c.name}: ${what}`, body:d?`через ${d} дн. — ${shortDate(due)}`:'сегодня срок', tag:c.id+what, due, what, car:c}); };
    add(c.inspection,[30,7,0],'техосмотр'); add(c.octa,[14,0],'OCTA'); if(c.kasko) add(c.kasko,[14,0],'КАСКО');
    if(+c.serviceMonths&&c.lastServiceDate) add(addMonthsISO(c.lastServiceDate,+c.serviceMonths),[14,0],'ТО / масло');
  }
  return R;
}
function serviceByKm(c){ if(!+c.serviceKm||!(+c.lastServiceKm)) return null; const s=carStats(c); const left=(+c.lastServiceKm+ +c.serviceKm)-s.odo; return left; }
function viewCar(){
  const cars=live('cars');
  if(!cars.length||ui.carEdit) return carForm(ui.carEdit&&ui.carEdit!=='new'?cars.find(c=>c.id===ui.carEdit):null);
  const c=cars.find(x=>x.id===ui.car)||cars[0]; ui.car=c.id; const s=carStats(c), ym=todayISO().slice(0,7), m=s.byMonth[ym]||{sum:0,l:0};
  const yr=Object.entries(s.byMonth).filter(([k])=>k.startsWith(ym.slice(0,4))).reduce((a,[,v])=>a+v.sum,0);
  const kmLeft=serviceByKm(c), last=s.fills[s.fills.length-1];
  const alerts=carAlerts().filter(a=>a.car.id===c.id&&a.at<=Date.now()+0&&dayDiff(todayISO(),a.due)>=0).filter((a,i,arr)=>arr.findIndex(b=>b.what===a.what)===i);
  return `${cars.length>1?`<div class="chips">${cars.map(x=>`<button class="chip-btn ${x.id===c.id?'on':''}" data-act="car-pick" data-c="${x.id}">${esc(x.name)}</button>`).join('')}</div>`:''}
  ${alerts.map(a=>`<div class="tip ${dayDiff(todayISO(),a.due)<=7?'bad':'warn'}"><div><span class="who">${esc(a.what)}</span><p>Срок ${shortDate(a.due)} — ${dayDiff(todayISO(),a.due)?'через '+dayDiff(todayISO(),a.due)+' дн':'сегодня'}. После прохождения впишите новую дату в настройках машины.</p></div></div>`).join('')}
  ${kmLeft!==null&&kmLeft<1000?`<div class="tip ${kmLeft<0?'bad':'warn'}"><div><span class="who">ТО / масло</span><p>${kmLeft<0?'Пробег для замены масла уже пройден на '+fmt(-kmLeft,0)+' км.':'До замены масла ≈ '+fmt(kmLeft,0)+' км.'}</p></div></div>`:''}
  <section class="section"><div class="summary">
    <div class="stat"><span class="k">Расход сейчас</span><span class="v">${s.cur?fmt(s.cur,1)+' л':'—'}</span><span class="s">на 100 км${s.avg?' · средний '+fmt(s.avg,1):''}</span></div>
    <div class="stat"><span class="k">Этот месяц</span><span class="v">${money(m.sum)}</span><span class="s">${fmt(m.l,1)} л · за год ${money(yr)}</span></div>
    <div class="stat"><span class="k">Километр стоит</span><span class="v">${s.perKm?money(s.perKm):'—'}</span><span class="s">${s.odo?'пробег '+fmt(s.odo,0)+' км':'внесите заправки'}</span></div>
  </div><p class="hint" style="margin:0">Расход считается от полного бака до полного бака — отмечайте «полный бак», когда заливаете до щелчка.</p></section>
  <section class="section"><div class="section-head"><h2>Заправка</h2>${SAMPLE_IMG&&(!farm||aiEnabled)?'<button class="ghost" data-act="photo-open" data-m="fuel">📷 по фото чека</button>':''}</div><div class="card">
    <div class="form-grid">
      <label class="f">Литров<input id="fu-l" inputmode="decimal" value="${esc(ui.fuelDraft&&ui.fuelDraft.liters||'')}"></label>
      <label class="f">Сумма, €<input id="fu-s" inputmode="decimal" value="${esc(ui.fuelDraft&&ui.fuelDraft.sum||'')}"></label>
      <label class="f">Цена за литр, €<input id="fu-p" inputmode="decimal" value="${esc(ui.fuelDraft&&ui.fuelDraft.price||'')}"></label>
      <label class="f">Пробег, км<input id="fu-o" inputmode="numeric" placeholder="${last?'было '+fmt(+last.odo,0):'по одометру'}"></label>
      <label class="f">Заправка<input id="fu-st" list="fu-sts" value="${esc(ui.fuelDraft&&ui.fuelDraft.station||last&&last.station||'')}" placeholder="Circle K, Neste, Viada, Virši…"></label>
      <label class="f">Дата<input type="date" id="fu-d" value="${esc(ui.fuelDraft&&ui.fuelDraft.date||todayISO())}"></label>
    </div><datalist id="fu-sts">${[...new Set(['Circle K','Neste','Viada','Virši',...live('fuel').map(f=>f.station).filter(Boolean)])].map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
    <label class="row" style="font-size:15px"><input type="checkbox" id="fu-full" checked> Полный бак</label>
    <p class="hint" style="margin:0">Достаточно двух из трёх: литры, сумма, цена — третье посчитается.</p>
    <div class="row"><button class="primary" data-act="fuel-add">Записать заправку</button></div></div></section>
  ${s.stations.length>1?`<section class="section"><div class="section-head"><h2>Где дешевле</h2><span class="hint">по вашим заправкам</span></div><div class="card"><div class="tbl-wrap"><table><tbody>${s.stations.map(x=>`<tr><td>${esc(x.n)}</td><td class="n">${money(x.avg)}/л</td><td class="n">${x.cnt} раз</td></tr>`).join('')}</tbody></table></div></div></section>`:''}
  ${Object.keys(s.byMonth).length?`<section class="section"><div class="section-head"><h2>По месяцам</h2></div><div class="card"><div class="tbl-wrap"><table><tbody>${Object.entries(s.byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(([k,v])=>`<tr><td>${monthName(k)}</td><td class="n">${fmt(v.l,1)} л</td><td class="n">${money(v.sum)}</td></tr>`).join('')}</tbody></table></div></div></section>`:''}
  <div class="row"><button class="ghost" data-act="car-edit" data-c="${c.id}">Сроки и данные машины</button><button class="ghost" data-act="car-edit" data-c="new">+ ещё машина</button></div>`;
}
function carForm(c){
  c=c||{name:'',plate:'',fuel:'95',inspection:'',octa:'',kasko:'',serviceKm:15000,serviceMonths:12,lastServiceKm:'',lastServiceDate:''};
  const opt=Object.entries(FUELS).map(([k,l])=>`<option value="${k}" ${c.fuel===k?'selected':''}>${l}</option>`).join('');
  return `<section class="section"><div class="section-head"><h2>${c.id?'Машина':'Добавить машину'}</h2></div><div class="card"><div class="form-grid">
    <label class="f">Название<input id="cr-name" value="${esc(c.name)}" placeholder="например, Škoda"></label>
    <label class="f">Номер<input id="cr-plate" value="${esc(c.plate)}" autocapitalize="characters"></label>
    <label class="f">Топливо<select id="cr-fuel">${opt}</select></label>
    <label class="f">Техосмотр до<input type="date" id="cr-insp" value="${esc(c.inspection)}"></label>
    <label class="f">OCTA до<input type="date" id="cr-octa" value="${esc(c.octa)}"></label>
    <label class="f">КАСКО до (если есть)<input type="date" id="cr-kasko" value="${esc(c.kasko)}"></label>
    <label class="f">Масло/ТО каждые, км<input id="cr-skm" inputmode="numeric" value="${esc(c.serviceKm)}"></label>
    <label class="f">или каждые, мес.<input id="cr-smo" inputmode="numeric" value="${esc(c.serviceMonths)}"></label>
    <label class="f">Последнее ТО — пробег<input id="cr-lkm" inputmode="numeric" value="${esc(c.lastServiceKm)}"></label>
    <label class="f">Последнее ТО — дата<input type="date" id="cr-ldt" value="${esc(c.lastServiceDate)}"></label>
  </div><p class="hint" style="margin:0">Напомню: техосмотр — за 30 и 7 дней и в день срока, OCTA — за 14 дней и в день, масло — по пробегу или по дате, что раньше.</p>
  <div class="row"><button class="primary" data-act="car-save" data-c="${c.id||'new'}">Сохранить</button>${live('cars').length?'<button data-act="car-cancel">Отмена</button>':''}${c.id?`<button class="ghost" data-act="car-del" data-c="${c.id}" style="color:var(--bad)">Удалить машину</button>`:''}</div></div></section>`;
}

// ---- Покупки ----
const STORES_DEFAULT=['Maxima','Lidl','Rimi','Mego','Elvi','top!','Beta'];
const shopLists=()=>(S&&S.settings.shopLists)||['Домой','Деду'];
const storeList=()=>{ const own=live('stores'); return own.length?own:STORES_DEFAULT.map(n=>({id:'d_'+n,name:n,address:''})); };
const normName=(s)=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
function lastPrice(name, store){ const n=normName(name); const p=live('shopPrices').filter(x=>x.name===n&&(!store||x.store===store)).sort((a,b)=>b.date.localeCompare(a.date))[0]; return p||null; }
function shopPlan(items){
  const stores=[...new Set(live('shopPrices').map(p=>p.store))], known=items.filter(i=>stores.some(s=>lastPrice(i.name,s)));
  if(!known.length) return null;
  // лучший один магазин: где известна цена большинства, затем дешевле
  const single=stores.map(s=>({s, items:known.filter(i=>lastPrice(i.name,s)), sum:known.reduce((a,i)=>{ const p=lastPrice(i.name,s); return a+(p?p.price*(+i.qty||1):0); },0)}))
    .sort((a,b)=>b.items.length-a.items.length||a.sum-b.sum)[0];
  const split={}; let splitSum=0;
  for(const i of known){ const best=stores.map(s=>({s,p:lastPrice(i.name,s)})).filter(x=>x.p).sort((a,b)=>a.p.price-b.p.price)[0]; (split[best.s]=split[best.s]||{items:[],sum:0}); split[best.s].items.push(i); split[best.s].sum+=best.p.price*(+i.qty||1); splitSum+=best.p.price*(+i.qty||1); }
  // сравниваем на тех товарах, что есть в «одном магазине»
  const comp=single.items.reduce((a,i)=>{ const best=Math.min(...stores.map(s=>lastPrice(i.name,s)).filter(Boolean).map(p=>p.price)); return a+best*(+i.qty||1); },0);
  const saving=single.sum-comp, extraStops=Object.keys(split).length-1;
  const car=live('cars')[0], perKm=car?carStats(car).perKm:null, stopCost=extraStops*(+S.settings.stopKm||6)*(perKm||0.12);
  const worth=extraStops>0&&saving-stopCost>(+S.settings.splitMin||3);
  return {single, split, saving, stopCost, worth, unknown:items.filter(i=>!known.includes(i))};
}
function viewShop(){
  const lists=shopLists(), L=lists.includes(ui.shopList)?ui.shopList:lists[0]; ui.shopList=L;
  const items=live('shopItems').filter(i=>i.list===L), open=items.filter(i=>!i.done);
  const freq={}; for(const i of live('shopItems').filter(i=>i.list===L)) freq[normName(i.name)]=(freq[normName(i.name)]||0)+1;
  const openN=new Set(open.map(i=>normName(i.name)));
  const sugg=Object.entries(freq).filter(([n])=>!openN.has(n)).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([n])=>n);
  const mode=ui.shopStore;
  const head=`<div class="chips">${lists.map(n=>`<button class="chip-btn ${n===L?'on':''}" data-act="shop-list" data-l="${esc(n)}">${esc(n)} ${live('shopItems').filter(i=>i.list===n&&!i.done).length||''}</button>`).join('')}<button class="chip-btn" data-act="shop-newlist">+ список</button></div>`;
  if(mode){
    const bought=items.filter(i=>i.done&&i.sessionStore===mode&&i.session===ui.shopSession);
    const total=bought.reduce((s,i)=>s+(+i.price||0)*(+i.qty||1),0);
    return `${head}<section class="section"><div class="section-head"><h2>В магазине: ${esc(mode)}</h2><span class="hint">${bought.length} куплено · ${money(total)}</span></div>
      <div class="card tlist">${[...open,...bought].map(i=>`<div class="task shop ${i.done?'done':''}"><button class="tick big" data-act="shop-tick" data-i="${i.id}" aria-label="${i.done?'Вернуть':'Купила'}: ${esc(i.name)}">${i.done?'✓':''}</button>
        <span class="task-body"><span class="task-title">${esc(i.name)}${+i.qty>1||i.unit?` · ${fmt(+i.qty||1,1)} ${esc(i.unit||'')}`:''}</span>${i.note?`<span class="task-meta">${esc(i.note)}</span>`:''}</span>
        ${i.done?`<input class="num" inputmode="decimal" data-shopprice="${i.id}" value="${i.price?fmt(i.price,2):''}" placeholder="€ на полке" aria-label="Цена на полке: ${esc(i.name)}">`:(lastPrice(i.name,mode)?`<span class="hint">${money(lastPrice(i.name,mode).price)}</span>`:'')}</div>`).join('')||'<p class="hint" style="margin:8px">Список пуст.</p>'}</div>
      <div class="row"><button class="primary" data-act="shop-finish">Итог: ${money(total)} — записать в «Учёт»</button><button data-act="shop-exit">Выйти без записи</button></div>
      <p class="hint">Отмеченное «куплено» уходит вниз. Цену на полке писать не обязательно, но так приложение запомнит настоящие цены в ${esc(mode)}.</p></section>`;
  }
  const plan=open.length?shopPlan(open):null, home=S.settings.homeAddr||'';
  const routeUrl=(names)=>{ const addr=names.map(n=>{ const s=storeList().find(x=>x.name===n); return s&&s.address?s.address:n+', Daugavpils'; });
    const p=new URLSearchParams({api:'1', travelmode:'driving', destination:addr[addr.length-1]}); if(home) p.set('origin',home); if(addr.length>1) p.set('waypoints',addr.slice(0,-1).join('|')); return 'https://www.google.com/maps/dir/?'+p.toString(); };
  return `${head}
  <section class="section"><div class="quick"><input id="sh-add" placeholder="Молоко, хлеб, 10 яиц…" enterkeyhint="done" autocomplete="off"><button class="primary" data-act="shop-add" aria-label="Добавить">+</button></div>
    ${sugg.length?`<div class="chips">${sugg.map(n=>`<button class="chip-btn" data-act="shop-sugg" data-n="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>`:''}
    ${L==='Деду'&&sugg.length?'<p class="hint" style="margin:0">Это то, что раньше брали деду, — нажмите, чтобы добавить в корзину.</p>':''}</section>
  <section class="section"><div class="card tlist">${open.map(i=>`<div class="task"><button class="tick" data-act="shop-done" data-i="${i.id}" aria-label="Куплено: ${esc(i.name)}"></button>
    <span class="task-body"><span class="task-title">${esc(i.name)}${+i.qty>1?' · '+fmt(+i.qty,1)+' '+esc(i.unit||''):''}</span><span class="task-meta">${(()=>{ const p=live('shopPrices').filter(x=>x.name===normName(i.name)).sort((a,b)=>a.price-b.price)[0]; return p?'дешевле всего: '+esc(p.store)+' '+money(p.price):'цены ещё нет'; })()}</span></span>
    <button class="ghost" data-act="shop-rm" data-i="${i.id}" aria-label="Убрать ${esc(i.name)}">✕</button></div>`).join('')||'<p class="hint" style="margin:8px">Список пуст — впишите товары строкой выше, через запятую.</p>'}</div></section>
  ${open.length?`<section class="section"><div class="section-head"><h2>Иду в магазин</h2></div><div class="chips">${storeList().map(s=>`<button class="chip-btn" data-act="shop-go" data-s="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div></section>`:''}
  ${plan?`<section class="section"><div class="section-head"><h2>Где что купить</h2><span class="hint">по ценам, которые вы записали</span></div><div class="card">
    ${plan.worth?Object.entries(plan.split).map(([s,v])=>`<p style="margin:0"><strong>${esc(s)}:</strong> ${v.items.map(i=>esc(i.name)).join(', ')} — ${money(v.sum)}</p>`).join('')+`<p style="margin:0">Экономия ≈ ${money(plan.saving)} против одного магазина (лишняя остановка ≈ ${money(plan.stopCost)}).</p>`
      :`<p style="margin:0">Выгоднее всё взять в <strong>${esc(plan.single.s)}</strong> — ≈ ${money(plan.single.sum)}.${plan.saving>0.5?` Разделить по магазинам — экономия всего ${money(plan.saving)}, не стоит лишней поездки.`:''}</p>`}
    ${plan.unknown.length?`<p class="hint" style="margin:0">Цены нет: ${plan.unknown.map(i=>esc(i.name)).join(', ')} — запишите её в магазине.</p>`:''}
    <a class="btn" href="${esc(routeUrl(plan.worth?Object.keys(plan.split):[plan.single.s]))}" target="_blank" rel="noopener">Открыть маршрут в Google Картах</a></div></section>`:''}
  <section class="section"><details ${ui.open.shopset?'open':''} data-det="shopset"><summary>Магазины и адрес дома</summary><div class="card">
    <label class="f">Адрес дома (откуда ехать)<input id="sh-home" data-set="homeAddr" value="${esc(home)}" placeholder="улица, посёлок"></label>
    ${storeList().map(s=>`<div class="row"><span style="min-width:70px">${esc(s.name)}</span><input data-storeaddr="${esc(s.name)}" value="${esc(s.address||'')}" placeholder="адрес филиала" style="flex:1"></div>`).join('')}
    <div class="row"><input id="sh-newstore" placeholder="ещё магазин"><button data-act="store-add">Добавить</button></div>
    <label class="f">Делить покупки по магазинам, если экономия больше, €<input id="sh-min" inputmode="decimal" data-set="splitMin" value="${esc(S.settings.splitMin||3)}"></label>
  </div></details></section>`;
}
function addShopItems(text, list){
  if(!S) S=blank();
  for(let part of String(text).split(/[,;\n]+/)){ part=part.trim(); if(!part) continue;
    let qty=1, unit=''; const m=part.match(/^(\d+[.,]?\d*)\s*(кг|г|л|шт|уп|пач|бут)?\.?\s+(.+)$/i)||part.match(/^(.+?)\s+(\d+[.,]?\d*)\s*(кг|г|л|шт|уп|пач|бут)\.?$/i);
    // количество отделяем, только если есть единица («2 кг картошки», «молоко 2 л»); «10 яиц» оставляем как написано
    let name=part; if(m&&(/^\d/.test(m[1])?m[2]:m[3])){ if(/^\d/.test(m[1])){ qty=num(m[1]); unit=m[2]; name=m[3]; } else { name=m[1]; qty=num(m[2]); unit=m[3]; } }
    S.shopItems.push(touch({id:uid(), list, name:name[0].toUpperCase()+name.slice(1), qty, unit, note:'', done:false}));
  }
}

// ---- Пожелания к приложению («Сделай мне удобнее») ----
const RST={new:['новое','warn'],accepted:['принято','ok'],done:['сделано','ok'],declined:['отклонено','bad']};
function viewRequests(){
  const R=live('requests').sort((a,b)=>b.createdAt-a.createdAt); if(!R.length) return '';
  const owner=(ui.members||[]).some(m=>session&&m.user_id===session.user.id&&m.role==='owner')||!farm;
  const open=R.filter(r=>r.status==='new'||r.status==='accepted');
  return `<section class="section"><div class="section-head"><h2>Пожелания к приложению</h2>${owner&&open.length?'<button class="ghost" data-act="req-copy">Скопировать как задание для Claude Code</button>':''}</div>
    <div class="card tlist">${R.slice(0,20).map(r=>`<div class="task"><span class="task-body"><span class="task-title">${esc(r.text)}</span><span class="task-meta">${shortDate(isoOf(new Date(r.createdAt)))}${r.by?' · '+esc(r.by):''} · <span class="pill ${RST[r.status][1]}">${RST[r.status][0]}</span></span></span>
      ${owner?`<select data-reqstatus="${r.id}" aria-label="Статус пожелания">${Object.entries(RST).map(([k,[l]])=>`<option value="${k}" ${r.status===k?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>`).join('')}</div></section>`;
}
const reqTask=()=>'Пожелания Насти к приложению MIGLANI (папка Desktop\\Cloud AI\\podvorye). Для каждого: обсуди со мной, надо ли, и если да — сделай просто и удобно, ничего не ломая; после — npm run build и npm run deploy.\n\n'+
  live('requests').filter(r=>r.status==='new'||r.status==='accepted').map((r,i)=>`${i+1}. ${r.text} (от ${shortDate(isoOf(new Date(r.createdAt)))}, статус: ${RST[r.status][0]})`).join('\n');

// ---- Что требует внимания (сводка на первой вкладке) ----
function attention(){
  if(!S) return [];
  const A=[], today=todayISO();
  const bills=live('bills').filter(b=>!b.paid&&b.due<=addDaysISO(today,3));
  if(bills.length) A.push({lv:bills.some(b=>b.due<today)?'bad':'warn', who:'Счета', txt:bills.map(b=>`${b.to}${b.amount?' '+money(+b.amount):''} — ${b.due<today?'просрочен':b.due===today?'сегодня':'до '+shortDate(b.due)}`).join(' · '), go:'home:bills'});
  const low=S.animals.length?lowStock():[]; if(low.length) A.push({lv:low[0].days<7?'bad':'warn', who:'Корма', txt:low.map(x=>`${x.name} — на ${fmt(x.days,0)} дн.`).join(' · '), go:'stock'});
  const heat=S.heat?heatCalc():null; if(heat&&heat.daysLeft!==null&&heat.daysLeft<14) A.push({lv:heat.daysLeft<5?'bad':'warn', who:'Дрова', txt:`хватит на ${fmt(heat.daysLeft,0)} дн.`, go:'home:heat'});
  const car=carAlerts().filter(a=>a.at<=Date.now()&&dayDiff(today,a.due)>=0).filter((a,i,arr)=>arr.findIndex(b=>b.car.id===a.car.id&&b.what===a.what)===i);
  if(car.length) A.push({lv:'warn', who:'Машина', txt:car.map(a=>`${a.what} — ${shortDate(a.due)}`).join(' · '), go:'home:car'});
  return A;
}

function viewHome(){
  const v=ui.homeView||'bills', tabs=[['bills','Счета'],['money','Учёт'],['car','Машина'],['shop','Покупки'],['heat','Тепло']];
  return `<div class="subnav">${tabs.map(([k,l])=>`<button data-act="home-view" data-v="${k}" aria-pressed="${v===k}">${l}</button>`).join('')}</div>`+
    ({bills:viewBills, money:viewMoney, car:viewCar, shop:viewShop, heat:viewHeat}[v]||viewBills)();
}
// Хозяйство: всё про животных в одном месте
const FARM_TABS=['ration','tips','stock','journal','herd'];
const farmSeg=()=>`<div class="subnav">${[['ration','Рацион'],['tips','Советы'],['stock','Запасы'],['journal','Журнал'],['herd','Животные']].map(([k,l])=>`<button data-tab="${k}" aria-pressed="${ui.tab===k}">${l}</button>`).join('')}</div>`;

// ---- Общие напоминания: дела, счета, машина ----
function allReminders(){
  const R=[], at9=(iso)=>new Date(iso+'T09:00:00').getTime();
  for(const t of liveTasks()){ const a=remindAt(t); if(a!==null) R.push({key:'t|'+t.id+'|'+t.due+'|'+t.time+'|'+t.remind, at:a, title:t.title, body:(t.time?t.time+' · ':'')+SECS[t.sec]+(t.note?' · '+t.note.slice(0,80):''), tag:t.id}); }
  for(const b of live('bills').filter(b=>!b.paid&&b.due)){ for(const [d,w] of [[-3,'через 3 дня'],[0,'сегодня']]) R.push({key:'b|'+b.id+'|'+b.due+'|'+d, at:at9(addDaysISO(b.due,d)), title:'Оплатить: '+b.to, body:`Срок ${w}${b.amount?' · '+money(+b.amount):''}`, tag:b.id}); }
  for(const c of carAlerts()) R.push(c);
  return R;
}

/* ---------- Дела (ежедневник) ---------- */
const SECS={farm:'Хозяйство', home:'Дом', me:'Личное'};
const REPS={none:'не повторять', day:'каждый день', week:'каждую неделю', month:'каждый месяц', year:'каждый год'};
const REMS={none:'без напоминания', at:'в момент срока', '1h':'за 1 час', '1d':'за 1 день'};
const pad2=(n)=>String(n).padStart(2,'0');
const isoOf=(d)=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const addDaysISO=(iso,n)=>{ const d=new Date(iso+'T12:00:00'); d.setDate(d.getDate()+n); return isoOf(d); };
const dayLabel=(iso)=>{ const t=todayISO(); if(iso===t) return 'Сегодня'; if(iso===addDaysISO(t,1)) return 'Завтра'; if(iso===addDaysISO(t,-1)) return 'Вчера';
  return new Date(iso+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'}); };
const liveTasks=()=>((S&&S.tasks)||[]).filter(t=>!t.deleted);
function nextDue(iso,rep){
  const d=new Date(iso+'T12:00:00'), day=d.getDate();
  if(rep==='day') d.setDate(day+1); else if(rep==='week') d.setDate(day+7);
  else if(rep==='month'){ d.setDate(1); d.setMonth(d.getMonth()+1); d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate())); }
  else if(rep==='year'){ d.setFullYear(d.getFullYear()+1); }
  return isoOf(d);
}
// «купить комбикорм завтра 10:00», «позвонить ветеринару в пятницу», «оплатить свет 12.11»
const WDAYS={'понедельник':1,'пн':1,'вторник':2,'вт':2,'среду':3,'среда':3,'ср':3,'четверг':4,'чт':4,'пятницу':5,'пятница':5,'пт':5,'субботу':6,'суббота':6,'сб':6,'воскресенье':0,'вс':0};
function parseQuick(s){
  let t=' '+String(s).replace(/\s+/g,' ')+' ', due=null, time=null; const today=todayISO();
  const take=(re,fn)=>{ const m=t.match(re); if(m&&fn(m)!==false) t=t.replace(m[0],' '); };
  take(/\s(?:в\s)?(\d{1,2}):(\d{2})(?=[\s,.!?])/i,m=>{ if(+m[1]>23||+m[2]>59) return false; time=pad2(m[1])+':'+m[2]; });
  take(/\s(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?=[\s,!?])/,m=>{ const dd=+m[1], mm=+m[2]; if(!dd||dd>31||!mm||mm>12) return false;
    let y=m[3]?+(m[3].length===2?'20'+m[3]:m[3]):new Date().getFullYear(); let iso=y+'-'+pad2(mm)+'-'+pad2(dd); if(!m[3]&&iso<today) iso=(y+1)+'-'+pad2(mm)+'-'+pad2(dd); due=iso; });
  take(/\sпослезавтра(?=[\s,.!?])/i,()=>{ due=addDaysISO(today,2); });
  take(/\sзавтра(?=[\s,.!?])/i,()=>{ due=addDaysISO(today,1); });
  take(/\sсегодня(?=[\s,.!?])/i,()=>{ due=today; });
  take(/\s(?:в|во)?\s?(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)(?=[\s,.!?])/i,m=>{
    const w=WDAYS[m[1].toLowerCase()]; const d=new Date(today+'T12:00:00'); let k=(w-d.getDay()+7)%7; if(k===0) k=7; due=addDaysISO(today,k); });
  take(/\s(?:в|к)\s(\d{1,2})(?:\s?(?:час(?:а|ов)?|ч))?(?=[\s,.!?])/i,m=>{ if(time||+m[1]>23) return false; time=pad2(m[1])+':00'; });
  if(time&&!due) due=today;
  let title=t.replace(/\s+/g,' ').replace(/\s+([,.!?])/g,'$1').trim().replace(/^[,.\-–\s]+|[,.\-–\s]+$/g,'');
  title=title?title[0].toUpperCase()+title.slice(1):'';
  return {title, due, time};
}
function newTask(p){
  if(!S) S=blank();
  const t=Object.assign({id:uid(), title:'', sec:ui.sec!=='all'?ui.sec:'farm', due:null, time:null, prio:'normal', rep:'none', remind:'none', note:'', done:false, updatedAt:Date.now()}, p);
  S.tasks.push(t); return t;
}
function toggleDone(id){
  const t=liveTasks().find(x=>x.id===id); if(!t) return;
  t.done=!t.done; t.doneAt=t.done?Date.now():null; t.updatedAt=Date.now();
  if(t.done&&t.rep!=='none'&&t.due&&!t.spawned){ t.spawned=true; newTask({title:t.title, sec:t.sec, due:nextDue(t.due,t.rep), time:t.time, prio:t.prio, rep:t.rep, remind:t.remind, note:t.note}); }
  save(); render();
}
// ---- календарь телефона: Google Календарь и .ics ----
const icsEsc=(s)=>String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r?\n/g,'\\n');
const compact=(iso)=>iso.replace(/-/g,'');
const RRULE={day:'DAILY',week:'WEEKLY',month:'MONTHLY',year:'YEARLY'};
function gcalUrl(t){
  let dates;
  if(t.time){ const s=compact(t.due)+'T'+t.time.replace(':','')+'00'; const e=new Date(t.due+'T'+t.time+':00'); e.setHours(e.getHours()+1);
    dates=s+'/'+compact(isoOf(e))+'T'+pad2(e.getHours())+pad2(e.getMinutes())+'00'; }
  else dates=compact(t.due)+'/'+compact(addDaysISO(t.due,1));
  const p=new URLSearchParams({action:'TEMPLATE', text:t.title, dates, details:(t.note?t.note+'\n\n':'')+'Из приложения MIGLANI · '+SECS[t.sec], ctz:'Europe/Riga'});
  if(t.rep!=='none') p.set('recur','RRULE:FREQ='+RRULE[t.rep]);
  return 'https://calendar.google.com/calendar/render?'+p.toString();
}
function icsEvent(t){
  const L=['BEGIN:VEVENT','UID:'+t.id+'@podvorye','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'')];
  if(t.time){ const s=compact(t.due)+'T'+t.time.replace(':','')+'00'; const e=new Date(t.due+'T'+t.time+':00'); e.setHours(e.getHours()+1);
    L.push('DTSTART;TZID=Europe/Riga:'+s, 'DTEND;TZID=Europe/Riga:'+compact(isoOf(e))+'T'+pad2(e.getHours())+pad2(e.getMinutes())+'00'); }
  else L.push('DTSTART;VALUE=DATE:'+compact(t.due), 'DTEND;VALUE=DATE:'+compact(addDaysISO(t.due,1)));
  L.push('SUMMARY:'+icsEsc(t.title), 'DESCRIPTION:'+icsEsc((t.note?t.note+'\n':'')+SECS[t.sec]));
  if(t.rep!=='none') L.push('RRULE:FREQ='+RRULE[t.rep]);
  if(t.remind!=='none'){ const trig=t.time?{at:'-PT0M','1h':'-PT1H','1d':'-P1D'}[t.remind]:{at:'PT9H','1h':'PT8H','1d':'-PT15H'}[t.remind];
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(t.title),'TRIGGER:'+trig,'END:VALARM'); }
  L.push('END:VEVENT'); return L;
}
const icsFile=(list)=>['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Podvorye//RU','CALSCALE:GREGORIAN',...list.flatMap(icsEvent),'END:VCALENDAR'].join('\r\n');
// ---- уведомления на телефоне (пока приложение открыто или свёрнуто) ----
const LS_NOTI='podvorye-notified-v1';
function remindAt(t){
  if(!t.due||t.remind==='none'||t.done||t.deleted) return null;
  const base=new Date(t.due+'T'+(t.time||'09:00')+':00').getTime();
  return base-({at:0,'1h':36e5,'1d':864e5}[t.remind]||0);
}
async function checkReminders(){
  if(!S||!('Notification' in window)||Notification.permission!=='granted') return;
  let seen={}; try{ seen=JSON.parse(localStorage.getItem(LS_NOTI)||'{}'); }catch(e){}
  const now=Date.now(); let changed=false;
  for(const r of allReminders()){
    if(seen[r.key]) continue;
    if(now>=r.at&&now-r.at<6*36e5){
      seen[r.key]=now; changed=true;
      try{ const reg=await navigator.serviceWorker.ready;
        await reg.showNotification(r.title,{body:r.body, icon:'./pwa-192x192.png', badge:'./favicon.png', tag:r.tag}); }
      catch(e){ try{ new Notification(r.title,{body:r.body}); }catch(e2){} }
    }
  }
  if(changed) try{ localStorage.setItem(LS_NOTI, JSON.stringify(seen)); }catch(e){}
}
setInterval(checkReminders, 60000);
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') checkReminders(); });
// ---- экран «Дела» ----
function taskRow(t){
  const over=!t.done&&t.due&&(t.due<todayISO()||(t.due===todayISO()&&t.time&&t.time<new Date().toTimeString().slice(0,5)));
  return `<div class="task ${t.done?'done':''} ${over?'over':''}">
    <button class="tick" data-act="task-done" data-t="${t.id}" aria-pressed="${!!t.done}" aria-label="${t.done?'Не сделано':'Сделано'}: ${esc(t.title)}">${t.done?'✓':''}</button>
    <button class="task-body" data-act="task-open" data-t="${t.id}">
      <span class="task-title">${t.prio==='high'?'<b class="imp">!</b> ':''}${esc(t.title)}</span>
      <span class="task-meta">${t.due&&ui.tab==='tasks'&&ui.groupDates?esc(dayLabel(t.due))+' · ':''}${t.time?esc(t.time)+' · ':''}${SECS[t.sec]||''}${t.rep!=='none'?' · ↻ '+REPS[t.rep]:''}${t.remind!=='none'?' · 🔔':''}</span>
    </button></div>`;
}
function monthGrid(){
  const base=ui.day||todayISO(), d0=new Date(base.slice(0,7)+'-01T12:00:00'), first=(d0.getDay()+6)%7, days=new Date(d0.getFullYear(),d0.getMonth()+1,0).getDate();
  const has=new Set(liveTasks().filter(t=>!t.done&&t.due).map(t=>t.due)), cells=[];
  for(let i=0;i<first;i++) cells.push('<span></span>');
  for(let k=1;k<=days;k++){ const iso=base.slice(0,7)+'-'+pad2(k);
    cells.push(`<button class="cal-d ${iso===todayISO()?'today':''} ${iso===ui.day?'sel':''}" data-act="day-go" data-d="${iso}">${k}${has.has(iso)?'<i></i>':''}</button>`); }
  return `<div class="cal"><div class="cal-h"><button class="ghost" data-act="month" data-n="-1" aria-label="Прошлый месяц">‹</button><strong>${d0.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</strong><button class="ghost" data-act="month" data-n="1" aria-label="Следующий месяц">›</button></div>
    <div class="cal-g">${['пн','вт','ср','чт','пт','сб','вс'].map(w=>`<span class="cal-w">${w}</span>`).join('')}${cells.join('')}</div></div>`;
}
function viewTasks(){
  const today=todayISO(), day=ui.day||today, isToday=day===today, sec=ui.sec;
  const all=liveTasks().filter(t=>sec==='all'||t.sec===sec);
  const sortT=(a,b)=>(a.due||'9')+(a.time||'99')<(b.due||'9')+(b.time||'99')?-1:1;
  const open=all.filter(t=>!t.done).sort(sortT);
  let groups;
  if(isToday){
    const wk=addDaysISO(today,7);
    groups=[['Просрочено',open.filter(t=>t.due&&t.due<today),'over'],['Сегодня',open.filter(t=>t.due===today)],['Завтра',open.filter(t=>t.due===addDaysISO(today,1))],
      ['На неделе',open.filter(t=>t.due>addDaysISO(today,1)&&t.due<=wk),'dates'],['Без срока',open.filter(t=>!t.due)],
      ['Сделано сегодня',all.filter(t=>t.done&&t.doneAt&&isoOf(new Date(t.doneAt))===today),'done']];
  } else groups=[[dayLabel(day),all.filter(t=>t.due===day).sort(sortT)]];
  const body=groups.filter(g=>g[1].length).map(([h,list,k])=>{ ui.groupDates=k==='dates'||k==='over'; const rows=list.map(taskRow).join(''); ui.groupDates=false;
    return `<section class="section tgroup ${k||''}"><div class="section-head"><h2>${h}</h2><span class="hint">${list.length}</span></div><div class="card tlist">${rows}</div></section>`; }).join('');
  const notif='Notification' in window&&Notification.permission!=='granted'&&Notification.permission!=='denied';
  const att=isToday?attention():[];
  return `
  ${att.length?`<section class="section"><div class="section-head"><h2>Что требует внимания</h2></div><div class="advice">${att.map(a=>`<button class="tip ${a.lv} tip-btn" data-act="go" data-go="${a.go}"><div><span class="who">${esc(a.who)}</span><p>${esc(a.txt)}</p></div></button>`).join('')}</div></section>`:''}
  <section class="section">
    <div class="day-nav"><button class="ghost big-btn" data-act="day-step" data-n="-1" aria-label="Предыдущий день">‹</button>
      <button class="day-title" data-act="cal-toggle">${esc(dayLabel(day))}${isToday?'':` <span class="hint">· ${new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span>`}</button>
      <button class="ghost big-btn" data-act="day-step" data-n="1" aria-label="Следующий день">›</button></div>
    ${ui.cal?monthGrid():''}${isToday?'':'<div class="row" style="justify-content:center"><button class="ghost" data-act="day-go" data-d="'+today+'">← к сегодняшнему дню</button></div>'}
    <div class="quick"><input id="qa" placeholder="Новое дело: «купить комбикорм завтра 10:00»" enterkeyhint="done" autocomplete="off"><button class="primary" data-act="qa-add" aria-label="Добавить дело">+</button></div>
    <div class="chips sec-chips">${[['all','Все'],...Object.entries(SECS)].map(([k,l])=>`<button class="chip-btn ${sec===k?'on':''}" data-act="sec" data-s="${k}">${l}</button>`).join('')}</div>
  </section>
  ${body||`<div class="card empty"><p class="hint">${isToday?'На сегодня дел нет. Впишите первое дело в строку выше — дату и время можно писать словами.':'На этот день дел нет.'}</p></div>`}
  <section class="section"><div class="section-head"><h2>Заметка дня</h2><span class="hint">${esc(dayLabel(day))}</span></div>
    <textarea id="day-note" class="note" rows="3" data-daynote="${day}" placeholder="Что важно помнить в этот день…">${esc((S&&S.days&&S.days[day])||'')}</textarea></section>
  <section class="section"><div class="row">
    ${notif?'<button data-act="notif-on">🔔 Включить уведомления</button>':''}
    ${liveTasks().some(t=>!t.done&&t.due)?'<button data-act="ics-all">Все дела в календарь телефона (.ics)</button>':''}</div>
    <p class="hint" style="margin:6px 0 0">Уведомления приходят, пока приложение открыто или свёрнуто. Чтобы напоминание сработало точно, даже когда телефон спит, — у дела нажмите «В Google Календарь».</p></section>`;
}
function taskSheet(){
  const isNew=ui.task==='new', t=isNew?Object.assign({title:'',sec:ui.sec!=='all'?ui.sec:'farm',due:ui.day||null,time:null,prio:'normal',rep:'none',remind:'none',note:''},ui.taskDraft||{}):liveTasks().find(x=>x.id===ui.task);
  if(!t){ ui.task=null; return ''; }
  const opt=(o,v)=>Object.entries(o).map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${l}</option>`).join('');
  return `<div class="sheet-bg" data-act="task-close"><div class="sheet" role="dialog" aria-modal="true" aria-label="Дело" data-stop="1">
    <div class="card-head"><h2>${isNew?'Новое дело':'Дело'}</h2><button class="ghost" data-act="task-close">✕</button></div>
    <label class="f">Что сделать<input id="tk-title" value="${esc(t.title)}" placeholder="Например: позвонить ветеринару"></label>
    <div class="form-grid">
      <label class="f">Раздел<select id="tk-sec">${opt(SECS,t.sec)}</select></label>
      <label class="f">Дата<input type="date" id="tk-due" value="${esc(t.due||'')}"></label>
      <label class="f">Время<input type="time" id="tk-time" value="${esc(t.time||'')}"></label>
      <label class="f">Важность<select id="tk-prio">${opt({normal:'обычное',high:'важное'},t.prio)}</select></label>
      <label class="f">Повтор<select id="tk-rep">${opt(REPS,t.rep)}</select></label>
      <label class="f">Напомнить<select id="tk-rem">${opt(REMS,t.remind)}</select></label>
    </div>
    <label class="f">Заметка<textarea id="tk-note" class="note" rows="3">${esc(t.note||'')}</textarea></label>
    <div class="row"><button class="primary" data-act="task-save">Сохранить</button>
      ${!isNew&&t.due?`<a class="btn" href="${esc(gcalUrl(t))}" target="_blank" rel="noopener">В Google Календарь</a><button data-act="task-ics">Скачать .ics</button>`:''}</div>
    ${isNew?'':(ui.confirmTask?`<div class="row"><span class="hint">Удалить дело?</span><button class="danger" data-act="task-del-yes">Удалить</button><button data-act="task-del-no">Отмена</button></div>`:'<button class="ghost" data-act="task-del" style="align-self:flex-start;color:var(--bad)">Удалить дело</button>')}
  </div></div>`;
}
function taskSave(){
  const g=(k)=>document.getElementById('tk-'+k), title=(g('title').value||'').trim(); if(!title){ g('title').focus(); return; }
  const p={title, sec:g('sec').value, due:g('due').value||null, time:g('time').value||null, prio:g('prio').value, rep:g('rep').value, remind:g('rem').value, note:g('note').value.trim(), updatedAt:Date.now()};
  if(p.time&&!p.due) p.due=todayISO();
  if(ui.task==='new') newTask(p); else Object.assign(liveTasks().find(x=>x.id===ui.task)||{}, p);
  if(p.remind!=='none'&&'Notification' in window&&Notification.permission==='default') Notification.requestPermission().catch(()=>{});
  ui.task=null; ui.taskDraft=null; save(); render();
}
function quickAdd(){
  const el=document.getElementById('qa'), v=(el&&el.value||'').trim(); if(!v) return;
  const p=parseQuick(v); if(!p.title) return;
  if(!p.due&&ui.day&&ui.day!==todayISO()) p.due=ui.day;
  newTask(p); save(); render();
  setTimeout(()=>{ const q=document.getElementById('qa'); if(q) q.focus(); },30);
}
// Животные Насти — одной кнопкой (вес и надои примерные, их поправляют во вкладке «Хозяйство»).
function seedOurFarm(){
  if(!S) S=blank();
  if(S.animals.length) return;
  const mk=(sp,name,o)=>{ const a=Object.assign(newAnimal(sp),{name},o||{}); S.animals.push(a); return a; };
  mk('horse','Шалфей',{state:'rest'});
  mk('horse','Тоша',{state:'rest'});                       // мерин
  mk('goat','Сметанка',{state:'milk',milk:2});              // белая коза
  mk('goat','Карамелька',{state:'milk',milk:2});            // наполовину альпийская
  mk('buck','Анатолий (Толик)',{state:'rest'});
  mk('hens','Куры',{count:10,state:'lay'});
  mk('cow','Корова джерси',{planned:true,w:400,milk:15,fat:5.2,state:'milk'}); // в планах, из Игналинского района (Литва)
  ui.tab='herd'; save(); render();
}
function tasksSummary(){
  const today=todayISO(), wk=addDaysISO(today,7), open=liveTasks().filter(t=>!t.done);
  const fmtT=(t)=>`— ${t.title}${t.due?' ('+(t.due===today?'сегодня':t.due)+(t.time?' '+t.time:'')+')':''} [${SECS[t.sec]}]`;
  const over=open.filter(t=>t.due&&t.due<today), now=open.filter(t=>t.due&&t.due>=today&&t.due<=wk);
  if(!over.length&&!now.length) return '';
  return 'Дела:\n'+(over.length?'Просрочено:\n'+over.slice(0,15).map(fmtT).join('\n')+'\n':'')+(now.length?'На неделю:\n'+now.slice(0,25).map(fmtT).join('\n'):'');
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
  // настройки — внизу, главное (животные) — сверху
  const settings=`
  ${S?`<section class="section"><div class="section-head"><h2>Отчёт на почту</h2><span class="hint">рацион, запасы, деньги, продуктивность</span></div>
    <div class="card">
      <label class="f">Ваша почта<input type="email" id="set-email" data-set="email" value="${esc(S.settings.email||'')}" placeholder="name@example.com" autocomplete="email"></label>
      <div class="row">
        ${S.settings.email?`<a class="btn primary-link" href="mailto:${encodeURIComponent(S.settings.email)}?subject=${encodeURIComponent('Отчёт MIGLANI '+todayISO())}&body=${encodeURIComponent(reportText().slice(0,1800))}" target="_blank" rel="noopener">Открыть письмо с отчётом</a>`:'<span class="hint">Впишите почту — появится кнопка письма.</span>'}
        <button data-act="report-dl">Скачать отчёт (.txt)</button>
      </div>
      <label class="row" style="font-size:14px"><input type="checkbox" id="set-daily" data-flag="dailyMail" ${S.settings.dailyMail?'checked':''}> Каждое утро письмо: дела на сегодня и просроченные</label>
      <p class="hint" style="margin:0">Каждый понедельник утром отчёт сам придёт на эту почту. Кнопка выше — чтобы отправить его прямо сейчас из почты телефона.</p>
    </div></section>
  ${viewTeam()}
  ${viewRequests()}
  <section class="section"><div class="section-head"><h2>Без интернета и резервная копия</h2></div>
    <div class="card">
      <p style="margin:0">Приложение работает без интернета: всё сохраняется в телефоне и само отправляется, когда появится связь. Помощник и фото — только со связью. Для надёжности можно скачать копию данных.</p>
      <div class="row"><button data-act="data-dl">Скачать данные (.json)</button>
        <label class="btn">Загрузить данные из файла<input type="file" id="imp-file" accept="application/json,.json" data-import="1" style="display:none"></label></div>
      ${ui.importData?`<div class="notice">Заменить все данные в приложении данными из файла (${ui.importData.animals.length} животных, ${(ui.importData.log||[]).length} записей журнала)?
        <div class="row" style="margin-top:8px"><button class="danger" data-act="import-yes">Заменить</button><button data-act="import-no">Отмена</button></div></div>`:''}
      <p class="hint" style="margin:0">Переезд из первой версии (на claude.ai): там во вкладке «Хозяйство» нажмите «Скачать данные (.json)», а здесь — «Загрузить данные из файла».</p>
    </div></section>
  <section class="section"><details><summary>Где хранятся данные</summary><div class="card"><p style="margin:0">Данные хозяйства хранятся в телефоне и в защищённой базе Supabase (сервер в ЕС, Стокгольм). Их видят только участники хозяйства — те, кого владелец пригласил кодом. Фото и вопросы помощнику уходят в Claude только когда вы нажимаете кнопку; перед отправкой фото уменьшается и из него удаляются данные о месте съёмки, сами фото нигде не сохраняются. Ключ Claude хранится только на сервере.</p></div></details></section>`:viewTeam()}`;
  return `
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
    </tbody></table></div><p class="hint" style="margin:0">Средние значения из зоотехнических справочников. Для кур расчёт ведётся в ккал обменной энергии и сыром протеине.</p></div></details></section>
  ${settings}`;
}

/* ---------- События ---------- */
function newAnimal(sp){
  const s=SPECIES[sp], n=S.animals.filter(a=>a.sp===sp).length+1;
  const a={id:uid(), sp, name:s.label+(n>1?' '+n:''), w:s.w, state:Object.keys(s.states)[0], milk:sp==='goat'?2:sp==='cow'?15:0, fat:3.8, count:sp==='hens'?10:1, planned:false, feeds:[...s.feeds], manual:null};
  return a;
}
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab],[data-act]'); if(!t) return;
  if(t.dataset.tab){ ui.tab=t.dataset.tab==='farm'?(ui.lastFarm||'ration'):t.dataset.tab; render(); window.scrollTo(0,0); return; }
  const act=t.dataset.act, id=t.dataset.id, a=id&&S?animalById(id):null;
  if(act==='inc-planned') return; // handled on change
  if(act==='feed-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return; // клик внутри листа
  if(act==='feed'){ ui.feed=t.dataset.feed; render(); return; }
  if(act==='feed-close'){ ui.feed=null; render(); return; }
  if(act==='feed-stock'){ const fid=t.dataset.feed; ui.feed=null; ui.tab='stock'; ui.open[fid]=true; render(); setTimeout(()=>{const el=document.getElementById('stk-'+fid); if(el) el.scrollIntoView({block:'center'});},30); return; }
  if(act==='task-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return;
  if(act==='task-done'){ toggleDone(t.dataset.t); return; }
  if(act==='task-open'){ ui.task=t.dataset.t; ui.confirmTask=false; render(); return; }
  if(act==='task-new'){ ui.task='new'; ui.taskDraft=t.dataset.title?{title:t.dataset.title,sec:t.dataset.sec||'farm',due:todayISO()}:null; render(); return; }
  if(act==='task-close'){ ui.task=null; ui.taskDraft=null; render(); return; }
  if(act==='task-save'){ taskSave(); return; }
  if(act==='task-del'){ ui.confirmTask=true; render(); return; }
  if(act==='task-del-no'){ ui.confirmTask=false; render(); return; }
  if(act==='task-del-yes'){ const x=liveTasks().find(y=>y.id===ui.task); if(x){ x.deleted=true; x.updatedAt=Date.now(); } ui.task=null; ui.confirmTask=false; save(); render(); return; }
  if(act==='task-ics'){ const x=liveTasks().find(y=>y.id===ui.task); if(x) saveFile((x.title.slice(0,40)||'дело')+'.ics', icsFile([x])); return; }
  if(act==='ics-all'){ saveFile('Дела MIGLANI.ics', icsFile(liveTasks().filter(x=>!x.done&&x.due))); return; }
  if(act==='qa-add'){ quickAdd(); return; }
  if(act==='sec'){ ui.sec=t.dataset.s; render(); return; }
  if(act==='day-step'){ ui.day=addDaysISO(ui.day||todayISO(), +t.dataset.n); render(); return; }
  if(act==='day-go'){ ui.day=t.dataset.d; render(); return; }
  if(act==='cal-toggle'){ ui.cal=!ui.cal; render(); return; }
  if(act==='month'){ const d=new Date((ui.day||todayISO()).slice(0,7)+'-01T12:00:00'); d.setMonth(d.getMonth()+ +t.dataset.n); ui.day=isoOf(d); ui.cal=true; render(); return; }
  if(act==='notif-on'){ Notification.requestPermission().then(()=>{ render(); checkReminders(); }).catch(()=>{}); return; }
  if(act==='todo-buy'){ const f=F[t.dataset.feed]; if(f){ newTask({title:'Купить: '+f.name.toLowerCase(), sec:'farm', due:todayISO()}); save(); note='Дело «Купить: '+f.name.toLowerCase()+'» добавлено на сегодня во вкладку «Дела».'; render(); setTimeout(()=>{ note=null; render(); },4000); } return; }
  if(act==='seed-ours'){ seedOurFarm(); return; }
  if(act==='stock-view'){ ui.stockView=t.dataset.v; render(); return; }
  if(act==='req-open'){ ui.chat.req=true; render(); setTimeout(()=>{ const el=document.getElementById('req-text'); if(el) el.focus(); },40); return; }
  if(act==='req-close'){ ui.chat.req=false; render(); return; }
  if(act==='req-send'){ const v=(document.getElementById('req-text').value||'').trim(); if(!v) return; if(!S) S=blank();
    S.requests.push(touch({id:uid(), text:v, by:session&&session.user.email||'', status:'new', createdAt:Date.now()})); ui.chat.req=false; save();
    ui.chat.turns.push({role:'assistant',content:'Спасибо, пожелание записала и передала владельцу хозяйства 💛 Статус будет виден во вкладке «Хозяйство».'}); render(); return; }
  if(act==='req-copy'){ copyText(reqTask()).then(ok=>flash(ok?'Скопировано. Вставьте в чат Claude Code в VS Code.':'Не получилось скопировать.')); return; }
  if(act==='go'){ const [tab,sub]=t.dataset.go.split(':'); ui.tab=tab; if(tab==='home') ui.homeView=sub; if(tab==='stock') ui.stockView=sub||'feed'; render(); window.scrollTo(0,0); return; }
  if(act==='home-view'){ ui.homeView=t.dataset.v; ui.carEdit=null; ui.shopStore=null; render(); return; }
  // счета
  if(act==='bill-close'&&t.classList.contains('sheet-bg')&&e.target.closest('[data-stop]')) return;
  if(act==='bill-new'){ ui.bill='new'; ui.billDraft=null; ui.confirmBill=false; render(); return; }
  if(act==='bill-open'){ ui.bill=t.dataset.b; ui.confirmBill=false; ui.billPay=null; render(); return; }
  if(act==='bill-close'){ ui.bill=null; ui.billDraft=null; ui.billPay=null; render(); return; }
  if(act==='bill-save'){ billSave(); return; }
  if(act==='bill-pay'){ const b=live('bills').find(x=>x.id===t.dataset.b); if(!b) return; if(b.varies||!(+b.amount)){ ui.bill=b.id; ui.billPay=b.id; render(); setTimeout(()=>{ const el=document.getElementById('bl-paid'); if(el) el.focus(); },40); } else billPaid(b.id); return; }
  if(act==='bill-pay-ok'){ const v=num(document.getElementById('bl-paid').value); if(!(v>0)) return; billPaid(t.dataset.b, v); return; }
  if(act==='bill-pay-no'){ ui.billPay=null; render(); return; }
  if(act==='bill-copy'){ const b=live('bills').find(x=>x.id===t.dataset.b); if(b) copyText(billReq(b)).then(ok=>flash(ok?'Реквизиты скопированы — вставьте в интернет-банк.':'Не получилось скопировать — выделите текст вручную.')); return; }
  if(act==='bill-del'){ ui.confirmBill=true; render(); return; }
  if(act==='bill-del-no'){ ui.confirmBill=false; render(); return; }
  if(act==='bill-del-yes'){ const b=live('bills').find(x=>x.id===ui.bill); if(b){ b.deleted=true; touch(b); } ui.bill=null; ui.confirmBill=false; save(); render(); return; }
  // учёт
  if(act==='ym'){ const d=new Date((ui.ym||todayISO().slice(0,7))+'-15T12:00:00'); d.setMonth(d.getMonth()+ +t.dataset.n); ui.ym=isoOf(d).slice(0,7); render(); return; }
  if(act==='m-type'){ ui.mType=t.dataset.t; render(); return; }
  if(act==='m-add'){ const g=(k)=>document.getElementById('mn-'+k), amt=r2(num(g('amt').value)); if(!(amt>0)){ g('amt').focus(); return; }
    addMoney({type:ui.mType||'out', amount:amt, cat:g('cat').value.trim()||'Прочее', sec:g('sec').value, date:g('date').value||todayISO(), note:g('note').value.trim()}); save(); render(); return; }
  if(act==='m-del'){ ui.confirmMoney=t.dataset.m; render(); return; }
  if(act==='m-del-yes'){ const m=live('money').find(x=>x.id===t.dataset.m); if(m){ m.deleted=true; touch(m); } ui.confirmMoney=null; save(); render(); return; }
  if(act==='m-csv'){ saveFile(`Учёт MIGLANI ${todayISO()}.csv`, moneyCSV()); return; }
  // машина
  if(act==='car-pick'){ ui.car=t.dataset.c; render(); return; }
  if(act==='car-edit'){ ui.carEdit=t.dataset.c; render(); return; }
  if(act==='car-cancel'){ ui.carEdit=null; render(); return; }
  if(act==='car-save'){ const g=(k)=>document.getElementById('cr-'+k), name=g('name').value.trim()||'Машина'; if(!S) S=blank();
    const p={name, plate:g('plate').value.trim().toUpperCase(), fuel:g('fuel').value, inspection:g('insp').value, octa:g('octa').value, kasko:g('kasko').value,
      serviceKm:num(g('skm').value)||'', serviceMonths:num(g('smo').value)||'', lastServiceKm:num(g('lkm').value)||'', lastServiceDate:g('ldt').value};
    if(t.dataset.c==='new'){ const c=touch(Object.assign({id:uid()},p)); S.cars.push(c); ui.car=c.id; } else touch(Object.assign(live('cars').find(x=>x.id===t.dataset.c)||{},p));
    ui.carEdit=null; save(); render(); return; }
  if(act==='car-del'){ const c=live('cars').find(x=>x.id===t.dataset.c); if(c){ c.deleted=true; touch(c); } ui.carEdit=null; ui.car=null; save(); render(); return; }
  if(act==='fuel-add'){ const g=(k)=>document.getElementById('fu-'+k); let l=num(g('l').value), s=num(g('s').value), p=num(g('p').value);
    if(!l&&s&&p) l=s/p; if(!s&&l&&p) s=l*p; if(!p&&l&&s) p=s/l;
    if(!(l>0&&s>0)){ flash('Впишите два из трёх: литры, сумму или цену за литр.'); return; }
    const c=live('cars').find(x=>x.id===ui.car); if(!c) return; const st=carStats(c), odo=num(g('o').value);
    if(odo&&st.odo&&odo<st.odo&&!ui.odoOk){ ui.odoOk=true; flash(`Пробег ${fmt(odo,0)} меньше прошлого (${fmt(st.odo,0)}). Проверьте одометр; если всё верно — нажмите «Записать» ещё раз.`); return; }
    ui.odoOk=false;
    const f=touch({id:uid(), car:c.id, date:g('d').value||todayISO(), liters:Math.round(l*100)/100, sum:r2(s), price:Math.round(p*1000)/1000, odo:odo||'', full:g('full').checked, station:g('st').value.trim(), sec:'me'});
    S.fuel.push(f); addMoney({type:'out', amount:f.sum, sec:'me', cat:'Топливо', note:`${c.name}: ${fmt(f.liters,1)} л${f.station?' · '+f.station:''}`, date:f.date});
    ui.fuelDraft=null; save(); flash(`Заправка записана: ${fmt(f.liters,1)} л, ${money(f.sum)} — и в «Учёт».`); return; }
  // покупки
  if(act==='shop-list'){ ui.shopList=t.dataset.l; render(); return; }
  if(act==='shop-newlist'){ const n=prompt('Название нового списка'); if(n&&n.trim()){ S.settings.shopLists=[...shopLists(), n.trim()]; ui.shopList=n.trim(); save(); render(); } return; }
  if(act==='shop-add'){ const el=document.getElementById('sh-add'); if(el&&el.value.trim()){ addShopItems(el.value, ui.shopList||shopLists()[0]); save(); render(); setTimeout(()=>{ const q=document.getElementById('sh-add'); if(q) q.focus(); },30); } return; }
  if(act==='shop-sugg'){ addShopItems(t.dataset.n, ui.shopList||shopLists()[0]); save(); render(); return; }
  if(act==='shop-done'){ const i=live('shopItems').find(x=>x.id===t.dataset.i); if(i){ i.done=true; i.boughtAt=Date.now(); touch(i); save(); render(); } return; }
  if(act==='shop-rm'){ const i=live('shopItems').find(x=>x.id===t.dataset.i); if(i){ i.deleted=true; touch(i); save(); render(); } return; }
  if(act==='shop-go'){ ui.shopStore=t.dataset.s; ui.shopSession=uid(); render(); window.scrollTo(0,0); return; }
  if(act==='shop-tick'){ const i=live('shopItems').find(x=>x.id===t.dataset.i); if(!i) return;
    if(i.done&&i.session===ui.shopSession){ i.done=false; i.session=null; i.sessionStore=null; } else { i.done=true; i.boughtAt=Date.now(); i.session=ui.shopSession; i.sessionStore=ui.shopStore; }
    touch(i); save(); render(); return; }
  if(act==='shop-exit'){ ui.shopStore=null; render(); return; }
  if(act==='shop-finish'){ const bought=live('shopItems').filter(i=>i.done&&i.session===ui.shopSession);
    const total=r2(bought.reduce((s,i)=>s+(+i.price||0)*(+i.qty||1),0));
    if(total>0) addMoney({type:'out', amount:total, sec:ui.shopList==='Деду'?'me':'home', cat:'Продукты', note:`${ui.shopStore}: ${bought.length} товаров (${ui.shopList})`});
    const st=ui.shopStore; ui.shopStore=null; save(); flash(total>0?`Покупка в ${st} — ${money(total)} записана в «Учёт».`:`Покупки отмечены. Цен не было — в «Учёт» ничего не записано.`); return; }
  if(act==='store-add'){ const el=document.getElementById('sh-newstore'), n=el&&el.value.trim(); if(!n) return; if(!live('stores').length) S.stores=STORES_DEFAULT.map(x=>touch({id:uid(),name:x,address:''}));
    S.stores.push(touch({id:uid(),name:n,address:''})); ui.open.shopset=true; save(); render(); return; }
  if(act==='heat-dims'){ const g=(k)=>num(document.getElementById('ht-'+k).value); ui.dimW=g('w'); ui.dimD=g('d'); ui.dimH=g('h');
    const L=ui.dimW*ui.dimD*ui.dimH/1000; if(L>0){ S.heat=Object.assign(heatDefaults(), S.heat||{}); S.heat.boilerL=Math.round(L); save(); } render(); return; }
  if(act==='heat-buy'){
    const g=(k)=>document.getElementById('hb-'+k), qty=num(g('qty').value), sum=num(g('sum').value), unit=g('unit').value, date=g('date').value||todayISO();
    if(!(qty>0)) return; S.heat=Object.assign(heatDefaults(), S.heat||{}); const h=S.heat;
    const L=unit==='bag'?qty*(+h.bagL||40):unit==='m3l'?qty*1000:qty*1000*SOLID.stacked/SOLID.loose;
    const c=heatCalc(); h.stockL=(c.left||0)+L; h.stockDate=todayISO();
    if(sum>0){ if(unit==='bag') h.bagPrice=Math.round(sum/qty*100)/100; else h.m3Price=Math.round(sum/(L/1000)*100)/100;
      S.money.push({id:uid(), date, type:'out', amount:sum, sec:'home', cat:'Дрова', note:`${fmt(qty,1)} ${unit==='bag'?'мешков':unit==='m3l'?'м³ насыпью':'м³ складом'}`, updatedAt:Date.now()}); }
    h.buys=h.buys||[]; h.buys.push({id:uid(), date, qty, unit, sum});
    save(); render(); return; }
  if(act==='heat-ask'){ ui.chat=ui.chat||{turns:[]}; ui.chat.open=true; ui.chat.draft='Посмотри мой расчёт по дровам и отоплению. Как сделать в доме теплее и потратить меньше денег? Что поменять в первую очередь?'; render(); return; }
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
  if(act==='photo-open'){ ui.photo={mode:t.dataset.m||'weigh',files:[],urls:[]}; render(); return; }
  if(act==='photo-close'){ if(ui.photo){ ui.photo.ctl&&ui.photo.ctl.abort(); ui.photo.urls.forEach(u=>URL.revokeObjectURL(u)); } ui.photo=null; render(); return; }
  if(act==='photo-mode'){ const p=ui.photo; if(p&&!p.busy){ p.mode=t.dataset.m; p.res=null; p.text=''; p.err=''; if(p.mode!=='store'&&p.files.length>1){ p.files=p.files.slice(0,1); p.urls.slice(1).forEach(u=>URL.revokeObjectURL(u)); p.urls=p.urls.slice(0,1); } } render(); return; }
  if(act==='photo-run'){ photoRun(); return; }
  if(act==='photo-stop'){ ui.photo&&ui.photo.ctl&&ui.photo.ctl.abort(); return; }
  if(act==='growth'){ growthRun(); return; }
  if(act==='growth-stop'){ ui.growth&&ui.growth.ctl&&ui.growth.ctl.abort(); return; }
  if(act==='report-dl'){ saveFile(`Отчёт MIGLANI ${todayISO()}.txt`, reportText()); return; }
  if(act==='data-dl'){ saveFile(`Данные MIGLANI ${todayISO()}.json`, JSON.stringify(S,null,1)); return; }
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
      st.stock=Math.round(left+v); st.stockDate=todayISO(); ui.open[fid]=true;
      const ppk=pricePerKg(fid); if(ppk>0){ addMoney({type:'out', amount:r2(v*ppk), sec:'farm', cat:'Корм', note:`${F[fid].name}: ${fmt(v,0)} кг`}); save(); flash(`Приход записан, ${money(r2(v*ppk))} — в «Учёт» как расход на корм.`); break; }
      save(); render(); break;
    }
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&e.target&&e.target.id==='chat-in'){ e.preventDefault(); chatSend(); return; }
  if(e.key==='Enter'&&e.target&&(e.target.id==='au-pw'||e.target.id==='au-email')){ e.preventDefault(); authGo(); return; }
  if(e.key==='Enter'&&e.target&&e.target.id==='qa'){ e.preventDefault(); quickAdd(); return; }
  if(e.key==='Enter'&&e.target&&e.target.id==='sh-add'){ e.preventDefault(); document.querySelector('[data-act="shop-add"]').click(); return; }
  if(e.key==='Escape'){ if(ui.task){ ui.task=null; ui.taskDraft=null; } else if(ui.bill){ ui.bill=null; ui.billPay=null; } else if(ui.feed) ui.feed=null; else if(ui.photo){ ui.photo.ctl&&ui.photo.ctl.abort(); ui.photo=null; } else if(ui.chat&&ui.chat.open){ ui.chat.open=false; } else return; render(); }
});
document.addEventListener('toggle',e=>{ const d=e.target; if(d.dataset&&d.dataset.det) ui.open[d.dataset.det]=d.open; },true);
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.daynote){ if(!S) S=blank(); const v=t.value.trim(); if(v) S.days[t.dataset.daynote]=v; else delete S.days[t.dataset.daynote]; save(); return; }
  if(!S) return;
  if(t.dataset.flag){ S.settings[t.dataset.flag]=t.checked; save(); render(); return; }
  if(t.dataset.reqstatus){ const r=live('requests').find(x=>x.id===t.dataset.reqstatus); if(r){ r.status=t.value; touch(r); save(); render(); } return; }
  if(t.dataset.shopprice){ const i=live('shopItems').find(x=>x.id===t.dataset.shopprice); if(!i) return; const v=r2(num(t.value)); i.price=v||''; touch(i);
    if(v>0&&i.sessionStore) S.shopPrices.push(touch({id:uid(), name:normName(i.name), store:i.sessionStore, price:v, date:todayISO()}));   // цена на полке — за штуку/единицу
    save(); render(); return; }
  if(t.dataset.storeaddr){ if(!live('stores').length) S.stores=STORES_DEFAULT.map(x=>touch({id:uid(),name:x,address:''}));
    const s=live('stores').find(x=>x.name===t.dataset.storeaddr); if(s){ s.address=t.value.trim(); touch(s); } ui.open.shopset=true; save(); return; }
  if(t.dataset.heat){
    S.heat=Object.assign(heatDefaults(), S.heat||{}); const k=t.dataset.heat, h=S.heat;
    if(k==='stockBags'){ if(t.value.trim()===''){ h.stockL=null; h.stockDate=null; } else { h.stockL=Math.max(0,num(t.value))*(+h.bagL||40); h.stockDate=todayISO(); } }
    else h[k]=['wood','moist','stove','house'].includes(k)?t.value:(t.value.trim()===''?'':Math.max(0,num(t.value)));
    save(); render(); return;
  }
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
