// Cloud sync via Supabase (REST, no SDK). Per-task last-write-wins; deletions are synced as tombstones.
const SKEY='my-planner-sync';
let cfg=JSON.parse(localStorage.getItem(SKEY)||'{}'),syncing=false,syncT;
const saveCfg=()=>localStorage.setItem(SKEY,JSON.stringify(cfg));
function setStatus(txt,s){const g=document.getElementById('gear'),st=document.getElementById('sstatus');if(g){g.title='Sync: '+txt;g.dataset.s=s||''}if(st)st.textContent=txt}
async function auth(path,body){
  const r=await fetch(cfg.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error_description||j.msg||j.message||'Auth failed ('+r.status+')');
  return j;
}
function takeSession(j){if(!j.access_token)return false;cfg.access=j.access_token;cfg.refresh=j.refresh_token;cfg.exp=Date.now()+((j.expires_in||3600)-60)*1000;if(j.user)cfg.uid=j.user.id;saveCfg();return true}
async function token(){
  if(!cfg.refresh)throw new Error('Not signed in');
  if(Date.now()>cfg.exp)takeSession(await auth('token?grant_type=refresh_token',{refresh_token:cfg.refresh}));
  return cfg.access;
}
async function rest(path,opt={}){
  const r=await fetch(cfg.url+'/rest/v1/'+path,{...opt,headers:{apikey:cfg.key,Authorization:'Bearer '+await token(),'Content-Type':'application/json',...(opt.headers||{})}});
  if(!r.ok)throw new Error('Sync error '+r.status+' '+(await r.text()).slice(0,100));
  return r.json().catch(()=>null);
}
function pendingRows(){
  const rows=[];
  Object.keys(dirty).forEach(id=>{
    const t=tasks.find(x=>String(x.id)===id);
    if(t)rows.push({user_id:cfg.uid,id,updated:t.u,deleted:false,data:{date:t.date,name:t.name,start:t.start,end:t.end,cat:t.cat}});
    else if(tombs[id])rows.push({user_id:cfg.uid,id,updated:tombs[id],deleted:true,data:{}});
    else delete dirty[id];
  });
  return rows;
}
function applyRemote(r){
  const id=Number(r.id),i=tasks.findIndex(t=>t.id===id),localU=i>=0?tasks[i].u:(tombs[id]||0);
  if(r.updated<=localU)return false; // local copy is newer (or same)
  delete dirty[id];
  if(r.deleted){if(i>=0){tasks.splice(i,1);known.delete(id)}tombs[id]=r.updated;if(selected===id)selected=null}
  else{const t={...r.data,id,u:r.updated};if(i>=0)tasks[i]=t;else tasks.push(t);known.set(id,sig(t));delete tombs[id]}
  return true;
}
async function syncNow(){
  if(syncing||!cfg.refresh||!cfg.url)return;
  syncing=true;setStatus('Syncing…','busy');
  try{
    let since=cfg.lastPull||'1970-01-01T00:00:00Z',changed=false;
    for(;;){ // pull everything the server received since last time (server clock, so offline edits are never missed)
      const rows=await rest('tasks?select=id,updated,deleted,data,synced_at&order=synced_at.asc&limit=1000&synced_at=gte.'+encodeURIComponent(since));
      rows.forEach(r=>{if(applyRemote(r))changed=true});
      if(rows.length)since=rows[rows.length-1].synced_at;
      if(rows.length<1000)break;
    }
    const rows=pendingRows();
    for(let i=0;i<rows.length;i+=200)await rest('tasks?on_conflict=user_id,id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows.slice(i,i+200))});
    rows.forEach(r=>{const t=tasks.find(x=>String(x.id)===r.id);if((t?t.u:tombs[r.id])===r.updated)delete dirty[r.id]});
    cfg.lastPull=since;saveCfg();persist();
    if(changed)render();
    setStatus('Synced '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),'ok');
  }catch(e){setStatus((navigator.onLine===false?'Offline — ':'')+e.message,'err')}
  syncing=false;
}
function syncSoon(){clearTimeout(syncT);if(cfg.refresh&&pendingRows().length)syncT=setTimeout(syncNow,1500)}
async function signIn(create){
  const g=id=>document.getElementById(id);
  cfg.url=g('sUrl').value.trim().replace(/\/+$/,'');cfg.key=g('sKey').value.trim();cfg.email=g('sEmail').value.trim();
  try{
    setStatus('Signing in…','busy');
    const body={email:cfg.email,password:g('sPass').value},j=await auth(create?'signup':'token?grant_type=password',body);
    if(!takeSession(j)){saveCfg();setStatus('Account created. Confirm the email we sent, then press Sign in.');return}
    g('sPass').value='';cfg.lastPull=0;tasks.forEach(t=>dirty[t.id]=1);Object.keys(tombs).forEach(id=>dirty[id]=1);saveCfg();await syncNow();
  }catch(e){setStatus(e.message,'err')}
}
(function ui(){
  const g=id=>document.getElementById(id);
  g('gear').onclick=()=>{g('sUrl').value=cfg.url||'';g('sKey').value=cfg.key||'';g('sEmail').value=cfg.email||'';g('smodal').classList.remove('hidden');if(!cfg.refresh)setStatus('Not signed in')};
  g('sClose').onclick=()=>g('smodal').classList.add('hidden');
  g('sIn').onclick=()=>signIn(false);g('sUp').onclick=()=>signIn(true);g('sNow').onclick=syncNow;
  g('sOut').onclick=()=>{cfg.refresh=cfg.access=null;saveCfg();setStatus('Signed out');};
  setStatus(cfg.refresh?'Sync on':'Not signed in');
  setInterval(syncNow,60000);addEventListener('online',syncNow);document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow()});
  setTimeout(syncNow,500);
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
