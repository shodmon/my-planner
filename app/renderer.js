const KEY='my-planner-v2',OLD='my-planner-day-v1',VKEY='my-planner-view';
const demo=[['Gaming','09:46','10:16','game'],['Programming','10:16','11:16','code'],['Gaming','11:16','14:16','game'],['Job search','14:16','15:16','job'],['Gaming','15:16','18:16','game'],['Programming','18:16','19:16','code'],['Gaming','19:16','20:16','game']];
const DAY_START=0,DAY_END=1439,SNAP=5,MIN_LEN=15; // timeline 00:00–23:59, 1px = 1 minute

// ---- Date helpers (dates are 'YYYY-MM-DD' strings) ----
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pd=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ymd(d)};
const addMonths=(s,n)=>{const d=pd(s),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return ymd(d)};
const weekStart=s=>addDays(s,-((pd(s).getDay()+6)%7)); // weeks start Monday
const todayStr=()=>ymd(new Date());
const fd=(s,o)=>pd(s).toLocaleDateString('en-US',o);

const mkDemo=()=>{const d=todayStr(),b=Date.now();return demo.map((x,i)=>({id:b+i,date:d,name:x[0],start:x[1],end:x[2],cat:x[3]}))};
let tombs={},dirty={}; // dirty = ids changed locally but not yet uploaded
function load(){
  try{
    const v2=JSON.parse(localStorage.getItem(KEY)||'null');if(v2&&Array.isArray(v2.tasks)){tombs=v2.tombs||{};dirty=v2.dirty||Object.fromEntries(v2.tasks.map(t=>[t.id,1]));return v2.tasks}
    const v1=JSON.parse(localStorage.getItem(OLD)||'null');if(Array.isArray(v1))return v1.map(t=>({...t,date:todayStr()})); // migrate single-day data
  }catch(e){}
  return [];
}
let tasks=load(),view=localStorage.getItem(VKEY)||'day',anchor=todayStr();
let running=false,seconds=0,int,selected=null,editing=null,clip=null,drag=null,lastDown={id:null,t:0},lastCell={d:null,t:0},lastBlank={t:0,x:0,y:0},toastT;
const undo=[],redo=[];
// change tracking for sync: every task carries u (last-modified ms); deletions are remembered in tombs
const sig=t=>JSON.stringify([t.date,t.name,t.start,t.end,t.cat]),known=new Map();
tasks.forEach(t=>{if(!t.u){t.u=Date.now();dirty[t.id]=1}known.set(t.id,sig(t))});
const persist=()=>localStorage.setItem(KEY,JSON.stringify({tasks,tombs,dirty}));
function stampChanges(){
  const now=Date.now(),seen=new Set();
  tasks.forEach(t=>{seen.add(t.id);const g=sig(t);if(known.get(t.id)!==g){t.u=now;known.set(t.id,g);delete tombs[t.id];dirty[t.id]=1}});
  known.forEach((g,id)=>{if(!seen.has(id)){known.delete(id);tombs[id]=now;dirty[id]=1}});
}
document.body.classList.toggle('touch',matchMedia('(pointer:coarse)').matches);

const $=x=>document.getElementById(x),
m=t=>{let[a,b]=t.split(':').map(Number);return a*60+b},
toTime=n=>pad(Math.floor(n/60))+':'+pad(n%60),
dur=t=>Math.max(0,m(t.end)-m(t.start)),
fmt=n=>`${Math.floor(n/60)}h ${pad(n%60)}m`,
esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
nowMin=()=>{const n=new Date();return n.getHours()*60+n.getMinutes()},
sel=()=>tasks.find(t=>t.id===selected),
uid=()=>{let i=Date.now();while(tasks.some(t=>t.id===i))i++;return i},
dayTasks=d=>tasks.filter(t=>t.date===d).sort((a,b)=>m(a.start)-m(b.start)),
defBase=d=>d===todayStr()?Math.ceil(nowMin()/SNAP)*SNAP:540;

function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),1800)}

// ---- History ----
const snap=()=>JSON.stringify(tasks);
const pushUndo=b=>{undo.push(b);if(undo.length>100)undo.shift();redo.length=0};
function mutate(fn){const b=snap();fn();pushUndo(b);render()}
function step(from,to,label){
  if(!from.length)return toast('Nothing to '+label);
  to.push(snap());tasks=JSON.parse(from.pop());
  if(!sel())selected=null;render();toast(label==='undo'?'Undone':'Redone');
}

// ---- Views / navigation ----
function visibleDays(){return view==='week'?Array.from({length:7},(_,i)=>addDays(weekStart(anchor),i)):[anchor]}
function ensureVisible(date){
  if(view==='day')anchor=date;
  else if(view==='week'){if(weekStart(date)!==weekStart(anchor))anchor=date}
  else if(date.slice(0,7)!==anchor.slice(0,7))anchor=date;
}
function go(dir,big){anchor=big?addMonths(anchor,dir*12):view==='day'?addDays(anchor,dir):view==='week'?addDays(anchor,7*dir):addMonths(anchor,dir);render()}
function setView(v){view=v;localStorage.setItem(VKEY,v);render()}

// ---- Layout: overlapping tasks sit side by side ----
function layout(list){
  const out={},sorted=[...list].sort((a,b)=>m(a.start)-m(b.start)||m(b.end)-m(a.end));
  let cluster=[],lanes=[],cEnd=0;
  const flush=()=>{cluster.forEach(id=>out[id].cols=lanes.length);cluster=[];lanes=[]};
  sorted.forEach(t=>{
    if(cluster.length&&m(t.start)>=cEnd)flush();
    let lane=lanes.findIndex(e=>e<=m(t.start));if(lane<0)lane=lanes.length;
    lanes[lane]=m(t.end);cEnd=cluster.length?Math.max(cEnd,m(t.end)):m(t.end);
    out[t.id]={lane};cluster.push(t.id);
  });
  flush();return out;
}

function renderTimeline(){
  const tl=$('timeline');tl.className='v-'+view;
  if(view==='month')return renderMonth();
  const days=visibleDays(),n=days.length,wk=n>1,t0=todayStr();
  let html=wk?`<div class="dayheads" style="grid-template-columns:60px repeat(${n},1fr)"><div></div>${days.map(d=>`<div class="dh${d===t0?' today':''}" data-date="${d}"><small>${fd(d,{weekday:'short'}).toUpperCase()}</small><b>${pd(d).getDate()}</b></div>`).join('')}</div>`:'';
  for(let h=0;h<24;h++)html+=`<div class="hour"><span>${pad(h)}:00</span><div class="cell" style="height:60px"></div></div>`;
  const cols=days.map((d,i)=>{
    const list=dayTasks(d),L=layout(list);
    const ev=list.map(t=>{
      const s=Math.max(DAY_START,m(t.start)),e=Math.min(DAY_END,m(t.end));if(e<=s)return '';
      const {lane,cols}=L[t.id],w=100/cols;
      const cls=`event ${t.cat}${t.id===selected?' sel':''}${drag&&drag.id===t.id?' dragging':''}`;
      return `<div class="${cls}" data-id="${t.id}" style="top:${s-DAY_START}px;height:${Math.max(38,e-s)}px;left:calc(${lane*w}% + 4px);width:calc(${w}% - 8px)"><strong>${esc(t.name)}</strong><small>${t.start}–${t.end} · ${fmt(dur(t))}</small><i class="rs"></i></div>`;
    }).join('');
    return `<div class="col" style="left:${i*100/n}%;width:${100/n}%">${ev}</div>`;
  }).join('');
  tl.innerHTML=html+`<div class="events" style="top:${wk?44:0}px">${cols}<div class="nowline"></div></div>`;
  placeNow();
}

function renderMonth(){
  const first=anchor.slice(0,8)+'01',start=weekStart(first),last=addDays(addMonths(first,1),-1),t0=todayStr();
  const weeks=Math.ceil((Math.round((pd(last)-pd(start))/864e5)+1)/7);
  let html='<div class="mgrid">'+['MON','TUE','WED','THU','FRI','SAT','SUN'].map(x=>`<div class="mh">${x}</div>`).join('');
  for(let i=0;i<weeks*7;i++){
    const d=addDays(start,i),list=dayTasks(d);
    const chips=list.slice(0,3).map(t=>`<div class="chip ${t.cat}${t.id===selected?' sel':''}" data-id="${t.id}"><span>${t.start}</span>${esc(t.name)}</div>`).join('');
    html+=`<div class="mday${d.slice(0,7)!==first.slice(0,7)?' other':''}${d===t0?' today':''}${d===anchor?' cur':''}" data-date="${d}"><b class="mn">${pd(d).getDate()}</b>${chips}${list.length>3?`<div class="more">+${list.length-3} more</div>`:''}</div>`;
  }
  $('timeline').innerHTML=html+'</div>';
}

function placeNow(){
  const el=document.querySelector('.nowline');if(!el)return;
  const n=nowMin();el.style.display=(n>=DAY_START&&n<=DAY_END&&visibleDays().includes(todayStr()))?'block':'none';el.style.top=(n-DAY_START)+'px';
}

function render(){
  tasks.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:m(a.start)-m(b.start));
  stampChanges();localStorage.setItem(KEY,JSON.stringify({tasks,tombs,dirty}));if(typeof syncSoon==='function')syncSoon();$('bar').classList.toggle('show',!!sel());
  // header / titles
  $('tlTitle').textContent=view==='day'?fd(anchor,{weekday:'long',month:'long',day:'numeric',year:'numeric'}):view==='month'?fd(anchor,{month:'long',year:'numeric'}):(()=>{const d=visibleDays();return fd(d[0],{month:'short',day:'numeric'})+' – '+fd(d[6],{month:'short',day:'numeric',year:'numeric'})})();
  $('balLabel').textContent=view.toUpperCase()+' BALANCE';
  $('jump').value=anchor;
  document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===view));
  // sidebar: tasks of the focused day
  $('sideTitle').textContent=anchor===todayStr()?'Today':fd(anchor,{weekday:'short',month:'short',day:'numeric'});
  $('tasks').innerHTML=dayTasks(anchor).map(t=>`<p data-id="${t.id}" class="${t.id===selected?'sel':''}"><span class="dot ${t.cat}"></span><span class="tn">${esc(t.name)}</span><small>${t.start}</small></p>`).join('')||'<p class="empty">Nothing planned — press N</p>';
  // stats for the visible range
  const vd=visibleDays(),inRange=t=>view==='month'?t.date.startsWith(anchor.slice(0,7)):vd.includes(t.date);
  let total=0,sum={game:0,code:0,job:0};
  tasks.filter(inRange).forEach(t=>{total+=dur(t);if(sum[t.cat]!=null)sum[t.cat]+=dur(t)});
  $('summary').textContent=fmt(total)+' planned';
  $('gameStat').textContent=fmt(sum.game);$('codeStat').textContent=fmt(sum.code);$('jobStat').textContent=fmt(sum.job);
  const rel=sum.game+sum.code+sum.job;
  $('balance').textContent=`Gaming ${rel?Math.round(sum.game/rel*100):0}%`;
  renderTimeline();updateCurrent();
}
const reveal=()=>document.querySelector('.event.sel,.chip.sel')?.scrollIntoView({block:'nearest',behavior:'smooth'});

function updateCurrent(){const x=nowMin(),t0=todayStr(),t=tasks.find(t=>t.date===t0&&m(t.start)<=x&&x<m(t.end));$('current').textContent=t?t.name:'Nothing scheduled'}
function clock(){
  $('clock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
  $('hdate').textContent=fd(todayStr(),{weekday:'long',month:'long',day:'numeric'}).toUpperCase().replace(',',' ·');
  updateCurrent();placeNow();
}
setInterval(clock,1000);clock();

// ---- Task actions ----
function nudge(t,d,resize){
  mutate(()=>{
    const s=m(t.start),e=m(t.end);
    if(resize)t.end=toTime(Math.max(s+MIN_LEN,Math.min(DAY_END,e+d)));
    else{const ns=Math.max(DAY_START,Math.min(s+d,DAY_END-(e-s)));t.start=toTime(ns);t.end=toTime(ns+e-s)}
  });
}
function shiftDay(t,n){mutate(()=>{t.date=addDays(t.date,n);ensureVisible(t.date)});toast('Moved to '+fd(t.date,{weekday:'short',month:'short',day:'numeric'}))}
function place(src,base,date){
  const s=Math.max(DAY_START,Math.min(base,DAY_END-src.len));
  const n={id:uid(),date,name:src.name,cat:src.cat,start:toTime(s),end:toTime(s+src.len)};
  mutate(()=>{tasks.push(n);selected=n.id;ensureVisible(date)});reveal();
}
const asClip=t=>({name:t.name,cat:t.cat,len:dur(t)});
const copy=t=>{clip=asClip(t);toast('Copied "'+t.name+'"')};
const paste=()=>{if(!clip)return toast('Nothing copied');const t=sel(),d=t?t.date:anchor;place(clip,t?m(t.end):defBase(d),d);toast('Pasted')};
const dup=t=>{place(asClip(t),m(t.end),t.date);toast('Duplicated')};
function del(t){mutate(()=>{tasks=tasks.filter(x=>x.id!==t.id);selected=null});toast('Deleted · Ctrl+Z to undo')}

// ---- Modal (add / edit) ----
function openModal(t,pre){
  editing=t?t.id:null;
  $('mtitle').textContent=t?'Edit task':'Add task';$('save').textContent=t?'Save':'Add task';
  const s0=sel(),bd=t?t.date:pre?pre.date:(s0?s0.date:anchor),base=pre?pre.start:s0&&!t?m(s0.end):defBase(bd),s=Math.max(DAY_START,Math.min(base,DAY_END-60));
  $('name').value=t?t.name:'';$('mdate').value=bd;$('start').value=t?t.start:toTime(s);$('end').value=t?t.end:toTime(s+60);
  if(t)$('cat').value=t.cat;
  $('modal').classList.remove('hidden');setTimeout(()=>$('name').focus(),0);
}
const closeModal=()=>{$('modal').classList.add('hidden');editing=null};
function saveModal(){
  const name=$('name').value.trim(),date=$('mdate').value,start=$('start').value,end=$('end').value,cat=$('cat').value;
  if(!name||!date||!start||!end||m(end)<=m(start)){toast('Enter a name, date and a valid time range');return}
  if(m(start)<DAY_START||m(end)>DAY_END){toast('A task must stay within one day (00:00–23:59)');return}
  mutate(()=>{
    if(editing!=null)Object.assign(tasks.find(t=>t.id===editing),{name,date,start,end,cat});
    else{const n={id:uid(),date,name,start,end,cat};tasks.push(n);selected=n.id}
    anchor=date;
  });
  closeModal();reveal();
}
$('add').onclick=()=>openModal();$('cancel').onclick=closeModal;$('save').onclick=saveModal;
$('reset').onclick=()=>{mutate(()=>{tasks=tasks.filter(t=>t.date!==todayStr()).concat(mkDemo());selected=null});toast('Demo day restored for today · Ctrl+Z to undo')};
$('prev').onclick=()=>go(-1);$('next').onclick=()=>go(1);
$('today').onclick=()=>{anchor=todayStr();render()};
$('jump').onchange=e=>{if(e.target.value){anchor=e.target.value;render()}};
$('seg').onclick=e=>{const b=e.target.closest('button[data-v]');if(b)setView(b.dataset.v)};

// ---- Mouse ----
$('timeline').addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const dh=e.target.closest('.dh');if(dh){anchor=dh.dataset.date;setView('day');return}
  const el=e.target.closest('.event,.chip');
  if(!el){
    const cell=e.target.closest('.mday');
    if(cell){ // month: click = focus day, double-click = open day view
      const d=cell.dataset.date,now=Date.now();selected=null;
      if(e.target.closest('.mn')){anchor=d;setView('day');return} // click the date number = open that day
      if(lastCell.d===d&&now-lastCell.t<350){lastCell={d:null,t:0};anchor=d;render();openModal(null,{date:d,start:540});return} // double-click = new task
      lastCell={d,t:now};anchor=d;render();return;
    }
    const ev=document.querySelector('.events');
    if(ev){ // day/week: double-click empty space = new task at that day + time
      const r=ev.getBoundingClientRect(),days=visibleDays(),x=e.clientX-r.left;
      if(x>=0&&x<r.width){
        const i=Math.min(days.length-1,Math.floor(x/(r.width/days.length))),start=Math.floor((DAY_START+(e.clientY-r.top))/15)*15,now=Date.now();
        if(lastBlank.t&&now-lastBlank.t<350&&Math.hypot(e.clientX-lastBlank.x,e.clientY-lastBlank.y)<8){lastBlank={t:0,x:0,y:0};selected=null;anchor=days[i];render();openModal(null,{date:days[i],start});return}
        lastBlank={t:now,x:e.clientX,y:e.clientY};
      }
    }
    if(selected!=null){selected=null;render()}return;
  }
  const t=tasks.find(x=>String(x.id)===el.dataset.id);if(!t)return;
  e.preventDefault();
  const now=Date.now();selected=t.id;
  if(lastDown.id===t.id&&now-lastDown.t<350){lastDown={id:null,t:0};render();openModal(t);return}
  if(e.pointerType==='touch'){lastDown={id:t.id,t:now};render();return} // touch: tap selects, use the action bar
  lastDown={id:t.id,t:now};
  const days=view==='month'?[t.date]:visibleDays(),ev=document.querySelector('.events');
  drag={id:t.id,mode:el.classList.contains('chip')?'chip':e.target.classList.contains('rs')?'resize':'move',startX:e.clientX,startY:e.clientY,s:m(t.start),e:m(t.end),date:t.date,days,colW:ev?ev.getBoundingClientRect().width/days.length:1,before:snap(),moved:false};
  document.body.classList.add('dragging-task');render();
  window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);window.addEventListener('pointercancel',onUp);
});
function onMove(e){
  if(!drag)return;const t=sel();if(!t)return;
  if(drag.mode==='chip'){ // month: drag a chip onto another day
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
    if(drag.moved){document.querySelectorAll('.mday.drop').forEach(x=>x.classList.remove('drop'));document.elementFromPoint(e.clientX,e.clientY)?.closest('.mday')?.classList.add('drop')}
    return;
  }
  const d=Math.round((e.clientY-drag.startY)/SNAP)*SNAP,n=drag.days.length;
  const dx=n>1?Math.round((e.clientX-drag.startX)/drag.colW):0;
  if(d||dx)drag.moved=true;
  if(drag.mode==='resize')t.end=toTime(Math.max(drag.s+MIN_LEN,Math.min(DAY_END,drag.e+d)));
  else{
    const len=drag.e-drag.s,ns=Math.max(DAY_START,Math.min(drag.s+d,DAY_END-len));
    t.start=toTime(ns);t.end=toTime(ns+len);
    t.date=drag.days[Math.max(0,Math.min(n-1,drag.days.indexOf(drag.date)+dx))];
  }
  renderTimeline();
}
function onUp(e){
  window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);window.removeEventListener('pointercancel',onUp);
  document.body.classList.remove('dragging-task');
  const d=drag;drag=null;let changed=d.moved;
  if(d.mode==='chip'){
    changed=false;
    if(d.moved){const c=document.elementFromPoint(e.clientX,e.clientY)?.closest('.mday'),t=tasks.find(x=>x.id===d.id);
      if(c&&t&&c.dataset.date!==t.date){t.date=c.dataset.date;changed=true}}
  }
  if(changed)pushUndo(d.before);
  render();
}
$('tasks').addEventListener('click',e=>{
  const p=e.target.closest('p[data-id]');if(!p)return;
  selected=tasks.find(t=>String(t.id)===p.dataset.id).id;render();reveal();
});

// ---- Hotkeys ----
document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(!$('smodal').classList.contains('hidden')){if(k==='escape')$('smodal').classList.add('hidden');return}
  if(!$('modal').classList.contains('hidden')){
    if(k==='escape')closeModal();
    else if(k==='enter'&&e.target.tagName!=='SELECT'){e.preventDefault();saveModal()}
    return;
  }
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  const t=sel();
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?step(redo,undo,'redo'):step(undo,redo,'undo')}
  else if(mod&&k==='y'){e.preventDefault();step(redo,undo,'redo')}
  else if(mod&&k==='c'){if(t){e.preventDefault();copy(t)}}
  else if(mod&&k==='x'){if(t){e.preventDefault();copy(t);del(t)}}
  else if(mod&&k==='v'){e.preventDefault();paste()}
  else if(mod&&k==='d'){e.preventDefault();if(t)dup(t)}
  else if(k==='n'&&!e.altKey){e.preventDefault();openModal()}
  else if(mod||e.metaKey){return}
  else if(k==='delete'||k==='backspace'){if(t){e.preventDefault();del(t)}}
  else if(k==='enter'||k==='f2'){if(t){e.preventDefault();openModal(t)}}
  else if(k==='escape'){selected=null;render()}
  else if(k==='d'){setView('day')}else if(k==='w'){setView('week')}else if(k==='m'){setView('month')}
  else if(k==='t'){anchor=todayStr();render()}
  else if(k==='arrowleft'||k==='arrowright'||k==='pageup'||k==='pagedown'){
    e.preventDefault();const dir=(k==='arrowleft'||k==='pageup')?-1:1;
    if(e.altKey&&t)shiftDay(t,dir);else go(dir,e.shiftKey);
  }
  else if(k==='arrowup'||k==='arrowdown'){
    e.preventDefault();if(view==='month')return;
    if(!t){const l=dayTasks(anchor);if(l.length){selected=l[k==='arrowup'?l.length-1:0].id;render();reveal()}return}
    nudge(t,(k==='arrowup'?-1:1)*(e.shiftKey?30:SNAP),e.altKey);reveal();
  }
  else if(k===' '){e.preventDefault();start()}
});

function start(){
  if(running){clearInterval(int);running=false;$('timerBtn').textContent='Start timer';$('focus').textContent='▶ Focus';return}
  const x=nowMin(),t0=todayStr();if(!tasks.find(t=>t.date===t0&&m(t.start)<=x&&x<m(t.end)))return toast('Nothing scheduled right now');
  running=true;$('timerBtn').textContent='Stop timer';$('focus').textContent='⏸ Focus';
  int=setInterval(()=>{seconds++;const h=Math.floor(seconds/3600),mi=Math.floor(seconds%3600/60),s=seconds%60;$('timer').textContent=[h,mi,s].map(v=>pad(v)).join(':')},1000);
}
$('fab').onclick=()=>openModal();
$('bar').onclick=e=>{const t=sel(),a=e.target.dataset.a;if(!t||!a)return;
  ({edit:()=>openModal(t),dup:()=>dup(t),del:()=>del(t),up:()=>nudge(t,-15),down:()=>nudge(t,15),prev:()=>shiftDay(t,-1),next:()=>shiftDay(t,1),close:()=>{selected=null;render()}})[a]()};
$('timerBtn').onclick=start;$('focus').onclick=start;
render();document.querySelector('.nowline')?.scrollIntoView({block:'center'});
