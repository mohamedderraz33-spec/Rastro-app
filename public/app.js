import { CATS, riskLevel, claimText } from './js/content.js';

const $ = (id) => document.getElementById(id);
const KEY = 'rastro.v1';
const DAY = 86400000;
const seed = () => ({
  items: [
    { id:'d-LP00583921047321', code:'LP00583921047321', name:'Auriculares Bluetooth', store:'AliExpress', createdAt:Date.now()-8*DAY, demo:true, contents:['electronica','pilas'] },
    { id:'d-ZL-ES-5520317', code:'ZL-ES-5520317', name:'Zapatillas running', store:'Zalando', createdAt:Date.now()-3*DAY, demo:true, contents:[] },
    { id:'d-SHEIN-ES-77410282', code:'SHEIN-ES-77410282', name:'Vestido de verano', store:'Shein', createdAt:Date.now()-9*DAY, demo:true, contents:[] },
    { id:'d-YT2638401957316', code:'YT2638401957316', name:'Funda de móvil', store:'Temu', createdAt:Date.now()-5*DAY, demo:true, contents:['ropa'] },
    { id:'d-ES0482217730', code:'ES0482217730', name:'Cargador USB-C', store:'Amazon', createdAt:Date.now()-5*DAY, demo:true, contents:[] }
  ], cache:{}, prefs:{delay:true,out:true,pickup:true}, provider:null
});
let state;
try { state=JSON.parse(localStorage.getItem(KEY)) || seed(); if(!Array.isArray(state.items)) state=seed(); }
catch { state=seed(); }
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}};
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let tab='todos', search='', active=null, busy=false;
const view=$('view'), fabwrap=$('fabwrap'), scrim=$('scrim');
const sheets=['addSheet','menuSheet','claimSheet','shareSheet','deleteSheet'].map($);
function openSheet(s){scrim.hidden=false;s.hidden=false;}
function closeSheet(){sheets.forEach(s=>s.hidden=true);scrim.hidden=true;}
scrim.addEventListener('click',closeSheet);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeSheet));
$('fab').addEventListener('click',()=>openSheet($('addSheet')));
$('menuBtn').addEventListener('click',()=>openSheet($('menuSheet')));
$('searchBtn').addEventListener('click',()=>{const b=$('searchBtn');b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')!=='true');render();});
$('refreshBtn').addEventListener('click',()=>{closeSheet();refresh();});
$('demoBtn').addEventListener('click',()=>{state.items=state.items.filter(x=>!x.demo);save();closeSheet();render();});
$('addForm').addEventListener('submit',e=>{
 e.preventDefault();const code=$('code').value.trim().replace(/\s+/g,'');
 if(code.length<8){$('hint').textContent='El número es demasiado corto.';return;}
 if(state.items.some(x=>x.code.toUpperCase()===code.toUpperCase())){$('hint').textContent='Ese envío ya está en tu lista.';return;}
 const order=$('porder').value, now=Date.now();
 state.items.unshift({id:'n'+now.toString(36),code,name:$('pname').value.trim()||'Envío '+code.slice(-5),store:$('pstore').value,createdAt:order?new Date(order+'T12:00:00').getTime():now,contents:[]});
 save();closeSheet();location.hash='';render();refresh();
});
function status(s){return ({registered:'Registrado',transit:'En camino',customs:'En aduana',out:'En reparto',pickup:'Listo para recoger',delivered:'Entregado'})[s]||'Consultando';}
function render(){
 const q=search.toLowerCase();
 const items=state.items.filter(i=>(tab==='todos'||(tab==='camino'&&state.cache[i.id]?.status!=='delivered')||(tab==='entregados'&&state.cache[i.id]?.status==='delivered')||(tab==='retraso'&&(state.cache[i.id]?.eta?.delayDays||0)>0))&&(!q||[i.name,i.store,i.code].join(' ').toLowerCase().includes(q)));
 let h=state.provider==='mock'?'<div class="banner">Modo de prueba: los datos son simulados.</div>':'';
 if($('searchBtn').getAttribute('aria-expanded')==='true')h+=`<div class="search"><input class="input" id="q" placeholder="Buscar envío" value="${esc(search)}"></div>`;
 h+='<div class="tabs">'+[['todos','Todos'],['camino','En camino'],['entregados','Entregados'],['retraso','Con retraso']].map(([k,v])=>`<button class="tab" data-tab="${k}" aria-selected="${tab===k}">${v}</button>`).join('')+'</div>';
 h+=`<div class="countrow"><span class="label">${items.length} envíos</span><span class="upd">${busy?'Actualizando…':''}</span></div>`;
 h+=items.length?'<div class="list">'+items.map(i=>{const s=state.cache[i.id];return `<a class="item" href="#envio-${esc(i.id)}"><div class="r1"><span class="nm">${esc(i.name)}</span><span class="pill">${status(s?.status)}</span></div><div class="sub"><span>${esc(i.store||'Sin tienda')} · ${esc(s?.carrier||'Consultando…')}</span><span>${s?.eta?.mainTs?new Date(s.eta.mainTs).toLocaleDateString('es-ES'):'Pendiente'}</span></div></a>`;}).join('')+'</div>':'<div class="empty"><b>No hay envíos</b>Pulsa + para añadir uno.</div>';
 view.innerHTML=h;fabwrap.hidden=false;
 const qi=$('q');if(qi)qi.addEventListener('input',()=>{search=qi.value;render();const n=$('q');n.focus();n.setSelectionRange(search.length,search.length);});
}
view.addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b){tab=b.dataset.tab;render();}});
async function refresh(){
 if(busy||!state.items.length)return;busy=true;render();
 try{const r=await fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shipments:state.items.map(i=>({code:i.code,createdAt:i.createdAt}))})});if(!r.ok)throw Error();const d=await r.json();state.items.forEach((i,n)=>{if(d.results?.[n]&&!d.results[n].error)state.cache[i.id]=d.results[n];});state.provider=d.provider;save();}
 catch{view.insertAdjacentHTML('afterbegin','<div class="banner warn">No se pudo actualizar el seguimiento.</div>');}
 finally{busy=false;render();}
}
const m=location.hash.match(/^#envio-(.+)$/);
if(m){location.hash='';}
render();refresh();
