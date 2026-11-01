/* Repz, version installable : remplace window.claude (base de données, identité, IA) par des équivalents locaux.
   Tout reste sur le téléphone (IndexedDB). La mise au propre des séances passe par la clé Anthropic de la personne. */
(()=>{
"use strict";
window.REPZ_PWA=true;
const KEY="mj_aikey"; // même clé que Mijonote (même site github.io)
const getKey=()=>{try{return localStorage.getItem(KEY)||""}catch{return ""}};

/* ---------- IndexedDB ---------- */
const idb=new Promise((ok,ko)=>{
  const r=indexedDB.open("repz",1);
  r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("docs"))d.createObjectStore("docs")};
  r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);
});
const tx=(mode,fn)=>idb.then(d=>new Promise((ok,ko)=>{const t=d.transaction("docs",mode);const res=fn(t.objectStore("docs"));t.oncomplete=()=>ok(res&&"result" in res?res.result:undefined);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error)}));
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
const rid=n=>{const c="abcdefghijklmnopqrstuvwxyz0123456789",a=crypto.getRandomValues(new Uint8Array(n));return Array.from(a,x=>c[x%36]).join("")};

const NAME="repz_name";
const getName=()=>{try{return localStorage.getItem(NAME)||""}catch{return ""}};
const setName=n=>{try{localStorage.setItem(NAME,String(n||"").trim().slice(0,30))}catch{}};
let cache=null;
const loadAll=()=>cache||(cache=(async()=>{
  const d=await idb;
  const m=await new Promise((ok,ko)=>{const out=new Map(),cur=d.transaction("docs","readonly").objectStore("docs").openCursor();
    cur.onsuccess=()=>{const c=cur.result;if(c){out.set(c.key,c.value);c.continue()}else ok(out)};cur.onerror=()=>ko(cur.error)});
  // Données de Tullio : seulement avec le lien perso (?moi), et seulement si aucune séance n'est encore enregistrée.
  // Tout autre premier lancement démarre vide (programme de base fourni par l'app).
  const wantMine=/[?&]moi\b/.test(location.search);
  const hasWorkouts=[...m.keys()].some(k=>k.startsWith("workouts/"));
  let mineDone=false;try{mineDone=!!localStorage.getItem("repz_mine_done")}catch{}
  const isTullio=/^tullio$/i.test(getName().trim());
  if(!hasWorkouts&&(wantMine||(isTullio&&!mineDone))){
    try{const r=await fetch("seed.json",{cache:"no-store"});if(r.ok){const seed=await r.json();
      await tx("readwrite",s=>{for(const [k,v] of Object.entries(seed))s.put(v,k)});for(const [k,v] of Object.entries(seed))m.set(k,v);
      if(!getName())setName("Tullio");try{localStorage.setItem("repz_mine_done","1")}catch{}}}catch{}
  }
  if(wantMine&&!getName())setName("Tullio");
  if(wantMine)try{history.replaceState(null,"",location.pathname)}catch{}
  return m;
})());

/* ---------- requêtes ---------- */
const getF=(o,f)=>f.split(".").reduce((a,k)=>a==null?a:a[k],o);
const OPS={"==":(a,b)=>a===b,"!=":(a,b)=>a!==b,"<":(a,b)=>a<b,"<=":(a,b)=>a<=b,">":(a,b)=>a>b,">=":(a,b)=>a>=b,"in":(a,b)=>b.includes(a),"not-in":(a,b)=>!b.includes(a),"array-contains":(a,b)=>Array.isArray(a)&&a.includes(b)};
function runQuery(m,coll,q){
  const p=coll+"/";let docs=[];
  for(const [k,v] of m)if(k.startsWith(p)&&!k.slice(p.length).includes("/"))docs.push({id:k.slice(p.length),v});
  for(const [f,op,val] of q.where)docs=docs.filter(d=>OPS[op]&&OPS[op](getF(d.v,f),val));
  if(q.order){const [f,dir]=q.order,s=dir==="desc"?-1:1;docs.sort((a,b)=>{const x=getF(a.v,f),y=getF(b.v,f);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return x<y?-s:x>y?s:0})}
  else docs.sort((a,b)=>a.id<b.id?-1:1);
  if(q.limit)docs=docs.slice(0,q.limit);
  const snaps=docs.map(d=>{const c=clone(d.v);return {id:d.id,exists:true,data:()=>clone(c),metadata:{fromCache:false,hasPendingWrites:false}}});
  return {docs:snaps,size:snaps.length,empty:!snaps.length,docChanges:()=>snaps.map((doc,i)=>({type:"added",doc,oldIndex:-1,newIndex:i})),metadata:{fromCache:false,hasPendingWrites:false}};
}
const snapDoc=(m,key)=>{const id=key.split("/").pop(),v=m.get(key),c=clone(v);return {id,exists:v!==undefined,data:()=>v===undefined?undefined:clone(c),metadata:{fromCache:false,hasPendingWrites:false}}};
const subs=new Set(); // {match:(key)=>bool, run:(m)=>void}
function notify(key){loadAll().then(m=>{for(const s of subs)if(s.match(key))setTimeout(()=>s.alive&&s.run(m))})}
async function write(key,val){
  const m=await loadAll();
  if(val===undefined){m.delete(key);await tx("readwrite",s=>s.delete(key))}
  else{val=clone(val);m.set(key,val);await tx("readwrite",s=>s.put(val,key))}
  notify(key);
}
function deepMerge(a,b){const o=isObj(a)?{...a}:{};for(const k in b){if(isObj(b[k])&&b[k].__delete__){delete o[k];continue}o[k]=isObj(b[k])&&isObj(o[k])?deepMerge(o[k],b[k]):b[k]}return o}
function subscribe(match,run){const s={match,alive:true,run:m=>{try{run(m)}catch(e){console.error(e)}}};subs.add(s);loadAll().then(m=>s.alive&&s.run(m));return ()=>{s.alive=false;subs.delete(s)}}
function docRef(coll,id){
  id=id||rid(20);const key=coll+"/"+id;
  return {id,path:key,
    get:async()=>snapDoc(await loadAll(),key),
    set:async d=>write(key,d),
    update:async d=>{const m=await loadAll();if(m.get(key)===undefined){const e=new Error("Document introuvable");e.code="invalid_argument";throw e}await write(key,deepMerge(m.get(key),d))},
    delete:async()=>write(key,undefined),
    acquire:async()=>({acquired:true}),
    onSnapshot:(fn)=>subscribe(k=>k===key,m=>fn(snapDoc(m,key))),
    collection:n=>collRef(key+"/"+n)};
}
function query(coll,q){
  return {
    where:(f,op,v)=>query(coll,{...q,where:[...q.where,[f,op,v]]}),
    orderBy:(f,dir)=>query(coll,{...q,order:[f,dir||"asc"]}),
    limit:n=>query(coll,{...q,limit:n}),
    get:async()=>runQuery(await loadAll(),coll,q),
    onSnapshot:(fn)=>subscribe(k=>k.slice(0,k.lastIndexOf("/"))===coll,m=>fn(runQuery(m,coll,q)))
  };
}
function collRef(coll){
  return Object.assign(query(coll,{where:[],order:null,limit:0}),{path:coll,
    doc:id=>docRef(coll,id),
    add:async d=>{const r=docRef(coll);await r.set(d);return r}});
}
const db=Object.freeze({collection:collRef,doc:p=>{const i=p.lastIndexOf("/");return docRef(p.slice(0,i),p.slice(i+1))}});

/* ---------- identité : une seule personne, propriétaire ---------- */
const me={id:"local",get name(){return getName()},avatarUrl:"icons/icon-192.png",color:"#1C3170",email:null,isOwner:true,canEdit:true};
const user=Object.freeze({isOwner:async()=>true,canEdit:async()=>true,can:async()=>true,me:async()=>({...me}),id:async()=>"local",name:async()=>me.name,
  avatarUrl:async()=>me.avatarUrl,email:async()=>null,search:async()=>[],
  profiles:async ids=>{const o={};for(const i of [].concat(ids))o[i]={id:i,name:i==="local"?me.name:"",avatarUrl:me.avatarUrl,color:me.color,email:null,isMe:i==="local",guest:false};return o}});

/* ---------- IA : Claude avec la clé de la personne ---------- */
const MODELS={quick:"claude-haiku-5-5",default:"claude-sonnet-5-5",complex:"claude-opus-5-5"};
const err=(code,text)=>{const e=new Error(text||code);e.code=code;return e};
function askKey(){
  return new Promise(res=>{
    const w=document.createElement("div");
    w.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(10,19,48,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Barlow,-apple-system,sans-serif";
    w.innerHTML=`<div style="background:#fff;color:#141824;border-radius:20px;max-width:420px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h3 style="margin:0 0 8px;font:800 1.3rem 'Barlow Condensed',sans-serif;text-transform:uppercase">Mettre une séance au propre</h3>
      <p style="margin:0 0 12px;line-height:1.45;font-size:.95rem">Pour lire un message en vrac et en faire une séance, Repz utilise Claude avec ta propre clé Anthropic (la même que pour Mijonote). Elle reste sur ce téléphone et coûte quelques centimes par séance.</p>
      <p style="margin:0 0 12px;font-size:.9rem"><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style="color:#1C3170;font-weight:600">Créer une clé sur console.anthropic.com</a></p>
      <input type="password" autocomplete="off" placeholder="sk-ant-..." style="width:100%;box-sizing:border-box;padding:.75rem;border:1.5px solid #DCE1E9;border-radius:12px;font-size:16px">
      <p data-e style="color:#D02B1F;font-size:.85rem;min-height:1em;margin:6px 0 0"></p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button data-c style="padding:.65rem 1rem;border-radius:12px;border:1.5px solid #DCE1E9;background:#fff;font-size:1rem">Annuler</button>
        <button data-o style="padding:.65rem 1.2rem;border-radius:12px;border:0;background:#1C3170;color:#fff;font-weight:700;font-size:1rem">Enregistrer</button>
      </div></div>`;
    document.body.appendChild(w);
    const inp=w.querySelector("input");setTimeout(()=>inp.focus(),50);
    const done=v=>{w.remove();res(v)};
    w.querySelector("[data-c]").onclick=()=>done(false);
    w.querySelector("[data-o]").onclick=()=>{const k=inp.value.trim();if(!/^sk-/.test(k)){w.querySelector("[data-e]").textContent="La clé commence par « sk- ».";return}try{localStorage.setItem(KEY,k)}catch{}done(true)};
  });
}
async function imgPart(blob){
  let type=blob.type||"image/jpeg",out=blob;
  if(!/^image\/(jpeg|png|webp|gif)$/.test(type)||blob.size>3.5e6){
    const bmp=await createImageBitmap(blob,{imageOrientation:"from-image"});const s=Math.min(1,1800/Math.max(bmp.width,bmp.height));
    const c=document.createElement("canvas");c.width=Math.round(bmp.width*s);c.height=Math.round(bmp.height*s);c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
    out=await new Promise(r=>c.toBlob(r,"image/jpeg",.85));type="image/jpeg";
  }
  const b64=await new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(",")[1]);r.onerror=()=>ko(r.error);r.readAsDataURL(out)});
  return {type:"image",source:{type:"base64",media_type:type,data:b64}};
}
async function call(input,o={}){
  if(!getKey()&&!(await askKey()))throw err("not_granted");
  const msgs=typeof input==="string"?[{role:"user",content:input}]:input.map(m=>({role:m.role,content:m.content}));
  const imgs=o.images?[].concat(Array.from(o.images)):[];
  if(imgs.length){const last=msgs[msgs.length-1];const parts=[];for(const b of imgs)parts.push(await imgPart(b));last.content=[...parts,{type:"text",text:String(last.content)}]}
  const model=MODELS[o.modelTier]||MODELS.default;let r;
  try{r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:o.signal,
      headers:{"content-type":"application/json","x-api-key":getKey(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model,max_tokens:8000,messages:msgs})})}
  catch(e){if(o.signal&&o.signal.aborted)throw err("cancelled");throw err("upstream_error")}
  if(!r.ok){if(r.status===401){try{localStorage.removeItem(KEY)}catch{}throw err("not_granted")}if(r.status===429||r.status===529)throw err("rate_limited");throw err("upstream_error")}
  const j=await r.json();const text=(j.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");
  o.onText&&o.onText({text,delta:text});
  return {text,truncated:j.stop_reason==="max_tokens",modelTierApplied:o.modelTier||"default"};
}
function parseJSON(t){
  t=String(t||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/,"");
  try{return JSON.parse(t)}catch{}
  const s=t.search(/[\[{]/);if(s<0)throw err("invalid_json");const close=t[s]==="{"?"}":"]",e=t.lastIndexOf(close);
  try{return JSON.parse(t.slice(s,e+1))}catch{throw err("invalid_json")}
}
const NOTE="\n\nRéponds uniquement avec le JSON demandé, sans texte autour ni balises de code.";
const sample=Object.freeze(Object.assign((i,o)=>call(i,o),{
  json:async(i,o)=>parseJSON((await call(typeof i==="string"?i+NOTE:i,o)).text),
  limits:async()=>({maxPromptBytes:262144,images:{maxCount:4,maxInputBytes:20e6,mediaTypes:["image/jpeg","image/png","image/webp","image/gif"]}})
}));

/* ---------- sauvegarde ---------- */
function askName(){return new Promise(ok=>{
  const d=document.createElement("div");
  d.style.cssText="position:fixed;inset:0;z-index:100;background:linear-gradient(160deg,#1C3170,#0A1330);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Barlow,system-ui,sans-serif;color:#fff";
  d.innerHTML='<form style="width:100%;max-width:360px;display:flex;flex-direction:column;gap:16px;text-align:center"><img src="icons/icon-192.png" alt="" style="width:96px;height:96px;border-radius:24px;margin:0 auto;box-shadow:0 10px 30px rgba(0,0,0,.4)"><h1 style="margin:0;font-family:\'Barlow Condensed\',system-ui;font-size:2.4rem;text-transform:uppercase;color:#E9B949">Bienvenue sur Repz</h1><p style="margin:0;opacity:.85">Ton carnet de muscu. Tes séances restent sur ton téléphone.</p><input name="n" placeholder="Ton prénom" autocomplete="given-name" required maxlength="30" style="padding:14px;border-radius:14px;border:0;font-size:1.1rem;text-align:center;color:#0A1330"><button style="padding:15px;border:0;border-radius:14px;background:linear-gradient(135deg,#F2CB66,#E9B949 50%,#B98A2C);color:#0A1330;font-weight:800;font-size:1.1rem;text-transform:uppercase;letter-spacing:.05em">C\'est parti</button></form>';
  document.body.appendChild(d);const f=d.querySelector("form");setTimeout(()=>f.n.focus(),100);
  f.onsubmit=e=>{e.preventDefault();const v=f.n.value.trim();if(!v)return;setName(v);d.remove();ok(v)};
})}
/* partage de l'appli réservé au propriétaire : appareil chargé avec ses séances (lien perso) ou code propriétaire */
const OWNER_H="63fda2eab9893320e9e13b672e032351a66650386c54f3f430a19d37165aaffd";
const isOwner=()=>{try{return localStorage.getItem("repz_owner")==="1"||!!localStorage.getItem("repz_mine_done")}catch{return false}};
async function ownerCode(code){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("owner:"+String(code||"").trim()));
  const h=Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");if(h!==OWNER_H)return false;try{localStorage.setItem("repz_owner","1")}catch{}return true}
{const q=new URLSearchParams(location.search).get("proprio");if(q)ownerCode(q).finally(()=>{try{history.replaceState(null,"",location.pathname)}catch{}})}
window.REPZ={
  isOwner,ownerCode,
  name:()=>getName(),
  setName:n=>setName(n),
  askName,
  hasKey:()=>!!getKey(),
  clearKey:()=>{try{localStorage.removeItem(KEY)}catch{}},
  exportAll:async()=>{const m=await loadAll();const o={};for(const [k,v] of m)o[k]=v;return JSON.stringify({app:"repz",v:1,date:new Date().toISOString(),docs:o})},
  importAll:async txt=>{const j=JSON.parse(txt);const docs=j.docs||j;if(!docs||typeof docs!=="object")throw new Error("Fichier invalide");
    await tx("readwrite",s=>{s.clear();for(const [k,v] of Object.entries(docs))s.put(v,k)});cache=null;return Object.keys(docs).length}
};

const caps={db,user,sample};
window.claude=Object.freeze({use:name=>Promise.resolve(caps[name]||null)});

// premier lancement sans prénom : écran d'accueil, puis rechargement pour que l'app l'affiche partout
loadAll().then(()=>{if(getName())return;const go=()=>askName().then(()=>location.reload());const when=()=>{if(window.Gate&&!window.Gate.allowed())document.addEventListener("gate-open",go,{once:true});else go()};document.body?when():addEventListener("DOMContentLoaded",when)});

if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch{}
})();
