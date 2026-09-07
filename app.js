
async function api(path, options={}){
  const r=await fetch(path,options);
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`HTTP ${r.status}`);
  return data;
}

async function updateOnline(){
  try{await api('/api/status'); $('#onlineDot').classList.remove('off'); $('#onlineText').textContent='ONLINE';}
  catch(e){$('#onlineDot').classList.add('off'); $('#onlineText').textContent='OFFLINE';}
}

function openOnlineDownload(){ $('#onlineModal').classList.remove('hidden'); }
function closeOnlineDownload(){ $('#onlineModal').classList.add('hidden'); }
window.openOnlineDownload=openOnlineDownload; window.closeOnlineDownload=closeOnlineDownload;

async function downloadFromInternet(){
  const url=$('#downloadUrl').value.trim(); const name=$('#downloadName').value.trim();
  if(!/^https?:\/\//i.test(url)){toast('Enter an HTTP/HTTPS URL.'); return;}
  try{
    toast('Downloading…');
    const out=await api('/api/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url,name})});
    state.downloads.unshift({name:out.name,pct:100,status:'Downloaded',folder:out.path});
    state.storage+=0.1; save(); renderDownloads(); updateStorage(); closeOnlineDownload(); toast(`Downloaded: ${out.name}`);
  }catch(e){toast(`Download failed: ${e.message}`)}
}
window.downloadFromInternet=downloadFromInternet;

async function refreshRuntime(){
  if(!window.nativeAPI){ $('#runtimeStatusText').textContent='Browser mode: use the desktop build to control a VM/container.'; return; }
  try{
    const r=await window.nativeAPI.runtimeStatus();
    $('#runtimeStatusText').textContent=`ADB: ${r.adbFound?'ready':'missing'} • Emulator: ${r.emulatorFound?'ready':'missing'} • Docker: ${r.dockerFound?'ready':'missing'} • Devices: ${r.devices.length}`;
    const sel=$('#avdSelect'); sel.innerHTML='<option value="">Select AVD</option>'; r.avds.forEach(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;sel.appendChild(o)});
  }catch(e){$('#runtimeStatusText').textContent='Runtime check failed: '+e.message}
}
async function startSelectedAvd(){
  const avd=$('#avdSelect').value; if(!avd){toast('Select an AVD first.');return;}
  try{const r=await window.nativeAPI.startRuntime(avd);toast(r.message||'Starting Android VM…');setTimeout(refreshRuntime,3000)}catch(e){toast(e.message)}
}
async function startRedroid(){
  if(!window.nativeAPI){toast('Container control is available in the desktop build.');return}
  try{const r=await window.nativeAPI.startRedroid();toast(r.message||'Starting Android container…');setTimeout(refreshRuntime,4000)}catch(e){toast(e.message)}
}
window.startRedroid=startRedroid;

async function connectRedroid(){
  if(!window.nativeAPI){toast('Container control is available in the desktop build.');return}
  try{const r=await window.nativeAPI.connectRedroid('127.0.0.1',5555);toast(r.message||'Container connected');setTimeout(refreshRuntime,1000)}catch(e){toast(e.message)}
}
window.refreshRuntime=refreshRuntime;window.startSelectedAvd=startSelectedAvd;window.connectRedroid=connectRedroid;
const state = {
  apps: [
    {name:"Starfield",type:"game",icon:"✦"},
    {name:"Forza Horizon 5",type:"game",icon:"🏎"},
    {name:"Minecraft",type:"game",icon:"▦"},
    {name:"Disney+",type:"movie",icon:"D+"},
    {name:"Party Animals",type:"game",icon:"🐾"},
    {name:"Fortnite",type:"game",icon:"F"},
    {name:"Diablo",type:"game",icon:"D"},
    {name:"Assassin's Creed Mirage",type:"game",icon:"A"},
    {name:"Ghostwire Tokyo",type:"game",icon:"G"},
    {name:"Google Chrome",type:"android",icon:"◉",installed:true},
    {name:"YouTube Music",type:"music",icon:"♫"},
  ],
  downloads: [],
  storage: 0.4,
  currentFilter:"all"
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function showSection(id){
  $$(".screen").forEach(x=>x.classList.remove("active"));
  $("#"+id).classList.add("active");
  $$(".quick-btn").forEach(b=>b.classList.toggle("active", b.dataset.section===id));
  sound("nav");
  if(id==="apps") renderApps();
  if(id==="downloads") renderDownloads();
  if(id==="search") renderSearch();
}
window.showSection=showSection;

$$(".quick-btn").forEach(b=>b.addEventListener("click",()=>showSection(b.dataset.section)));

function sound(kind){
  if(!$("#soundToggle") || !$("#soundToggle").checked) return;
  // Web Audio click/hover cue. Replace with licensed first-party audio assets for a production build.
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.frequency.value=kind==="focus"?640:420; g.gain.value=.025;
    o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.045);
  }catch(e){}
}

function makeTile(a,i){
  const el=document.createElement("div");
  el.className="tile"+(i===0?" featured":"");
  el.innerHTML=`<div class="ticon">${a.icon}</div><div class="tname">${a.name}</div>`;
  el.addEventListener("mouseenter",()=>sound("focus"));
  el.addEventListener("click",()=>launchApp(a));
  return el;
}
function renderHome(){
  const rail=$("#gamesRail"); rail.innerHTML="";
  state.apps.slice(0,9).forEach((a,i)=>rail.appendChild(makeTile(a,i)));
}
function renderApps(){
  const g=$("#appGrid"); g.innerHTML="";
  state.apps.filter(a=>state.currentFilter==="all"||a.type===state.currentFilter).forEach(a=>{
    const card=document.createElement("div"); card.className="app-card";
    card.innerHTML=`<div class="app-art">${a.icon}</div><div class="badge">${a.type.toUpperCase()}</div><h3>${a.name}</h3><div class="meta">${a.installed?"Installed":"Available • Demo Store"}</div>`;
    card.onclick=()=>launchApp(a); g.appendChild(card);
  });
}
function filterApps(f,btn){
  state.currentFilter=f; $$(".chip").forEach(x=>x.classList.remove("active"));btn.classList.add("active");renderApps();sound("nav");
}
window.filterApps=filterApps;

function launchApp(a){
  if(a.name==="Google Chrome"){
    toast("Chrome launch placeholder • opens in the simulator shell.");
    return;
  }
  toast(`Launching ${a.name}…`);
}

async function openInstall(){
  if(window.nativeAPI){
    try{const r=await window.nativeAPI.installApk(); if(r?.canceled)return; if(r?.installed){toast(r.message||'APK installed');} else {toast(r.message||'APK copied to Downloads');}
      const file=(r?.path||'').split(/[\\/]/).pop(); if(file){ const name=file.replace(/\.apk$/i,'').replace(/[-_]+/g,' '); state.apps.unshift({name,type:'android',icon:'A',installed:Boolean(r?.installed)}); state.downloads.unshift({name:file,pct:100,status:r?.installed?'Installed':'Copied',folder:r.path}); save(); renderApps(); renderDownloads(); }
    }catch(e){toast(e.message)}
    return;
  }
  $("#modal").classList.remove("hidden");
}
function closeModal(){ $("#modal").classList.add("hidden"); $("#apkFile").value=""; }
window.openInstall=openInstall; window.closeModal=closeModal;

function installApk(){
  const file=$("#apkFile").files[0];
  if(!file){toast("Choose an APK file first.");return;}
  const raw=file.name.replace(/\.apk$/i,"").replace(/[-_]+/g," ");
  const name=raw.replace(/\b\w/g,c=>c.toUpperCase());
  state.apps.unshift({name,type:"android",icon:"A",installed:true});
  state.storage=Math.min(127.5,state.storage+0.8);
  state.downloads.unshift({name:`${name} • installation`,pct:100,status:"Installed",folder:`/Apps/${name}`});
  save();
  closeModal(); renderApps(); renderDownloads(); updateStorage();
  toast(`${name} installed. Folder created: /Apps/${name}`);
}

function renderDownloads(){
  const box=$("#downloadsList");box.innerHTML="";
  if(!state.downloads.length){box.innerHTML=`<div class="download"><div class="drow"><b>No active downloads</b><span class="meta">Queue is empty</span></div></div>`;return}
  state.downloads.forEach(d=>{
    const el=document.createElement("div");el.className="download";
    el.innerHTML=`<div class="drow"><b>${d.name}</b><span class="meta">${d.status||"Downloading"}</span></div><div class="progress"><i style="width:${d.pct}%"></i></div><div class="meta" style="margin-top:6px">${d.folder||""}</div>`;
    box.appendChild(el);
  });
}
function addDemoDownload(){
  const d={name:["Movie Pack","Music Album","Android Game"][Math.floor(Math.random()*3)],pct:0,status:"Downloading",folder:"/Downloads"};
  state.downloads.unshift(d);renderDownloads();
  const timer=setInterval(()=>{d.pct+=10;if(d.pct>=100){d.pct=100;d.status="Downloaded";d.folder="/Downloads/"+d.name;clearInterval(timer)}renderDownloads();save();},350);
}

function syncCloud(){
  const count=state.apps.length+state.downloads.length;
  $("#cloudText").textContent=`${count} items synced in your demo cloud`;
  toast("Demo cloud sync complete.");
}

function updateStorage(){
  $("#storageText").textContent=`${state.storage.toFixed(1)} GB used of 128 GB`;
  $("#storageMeter").style.width=`${Math.min(100,(state.storage/128)*100)}%`;
}
function openFileManager(){toast("Virtual storage: /Apps, /Downloads, /Media, /Cloud");}

function renderSearch(){
  const q=($("#searchInput")?.value||"").toLowerCase();
  const box=$("#searchResults"); if(!box) return; box.innerHTML="";
  state.apps.filter(a=>a.name.toLowerCase().includes(q)).forEach(a=>{
    const card=document.createElement("div"); card.className="app-card";
    card.innerHTML=`<div class="app-art">${a.icon}</div><h3>${a.name}</h3><div class="meta">${a.type}</div>`;
    card.onclick=()=>launchApp(a);box.appendChild(card);
  });
}
window.renderSearch=renderSearch;

function toast(msg){
  const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200);
}

function save(){localStorage.setItem("xboxSimState",JSON.stringify(state))}
function load(){
  try{const s=JSON.parse(localStorage.getItem("xboxSimState"));if(s){Object.assign(state,s)}}catch(e){}
}
function setupWallpapers(){
  $$(".wall").forEach((w,i)=>w.onclick=()=>{
    document.body.dataset.wall=i;
    $$(".wall").forEach(x=>x.classList.remove("active"));w.classList.add("active");
    localStorage.setItem("wall",i);
  });
  const i=Number(localStorage.getItem("wall")||0); document.body.dataset.wall=i;
  $$(".wall")[i]?.classList.add("active");
}
function updateTime(){const d=new Date();$("#time").textContent=d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
document.addEventListener("keydown",e=>{
  if(e.key==="Escape") closeModal();
  if(e.key==="ArrowRight"||e.key==="ArrowLeft"){
    const tiles=$$("#gamesRail .tile");const active=document.activeElement?.classList.contains("tile")?document.activeElement:tiles[0];
    const idx=Math.max(0,tiles.indexOf(active)+(e.key==="ArrowRight"?1:-1)); tiles[idx]?.focus();tiles[idx]?.classList.add("focused");
  }
});
load();renderHome();renderApps();renderDownloads();updateStorage();setupWallpapers();updateTime();updateOnline();refreshRuntime();setInterval(updateTime,30000);setInterval(updateOnline,15000);
