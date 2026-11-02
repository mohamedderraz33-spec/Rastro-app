import { CATS, riskLevel, claimText } from './js/content.js';

/* ---------- utilidades ---------- */
const DAY = 86400000;
const KEY = 'rastro.v1';
const MAX_ITEMS = 20;

const f = {
  long: new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
  short: new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }),
  wd: new Intl.DateTimeFormat('es-ES', { weekday: 'short' }),
  num: new Intl.DateTimeFormat('es-ES', { day: 'numeric' }),
  time: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }),
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
function whenLabel(ts) {
  const now = Date.now();
  if (sameDay(ts, now)) return 'Hoy';
  if (sameDay(ts, now - DAY)) return 'Ayer';
  return cap(f.short.format(ts));
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const $ = (id) => document.getElementById(id);

/* ---------- estado (se guarda en el navegador) ---------- */
function seed() {
  const now = Date.now();
  const mk = (code, name, store, ageDays, contents) => ({
    id: 'd-' + code, code, name, store, createdAt: now - ageDays * DAY, orderedAt: null, contents: contents || [], demo: true,
  });
  return {
    items: [
      mk('LP00583921047321', 'Auriculares Bluetooth', 'AliExpress', 8, ['electronica', 'pilas']),
      mk('ZL-ES-5520317', 'Zapatillas running', 'Zalando', 3),
      mk('SHEIN-ES-77410282', 'Vestido de verano', 'Shein', 9),
      mk('YT2638401957316', 'Funda de móvil', 'Temu', 5, ['ropa']),
      mk('ES0482217730', 'Cargador USB-C', 'Amazon', 5),
    ],
    cache: {}, prefs: { delay: true, out: true, pickup: true }, updatedAt: null, provider: null,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.items)) {
        return { items: s.items, cache: s.cache || {}, prefs: Object.assign({ delay: true, out: true, pickup: true }, s.prefs), updatedAt: s.updatedAt || null, provider: s.provider || null };
      }
    }
  } catch (e) { /* sin almacenamiento: se usa en memoria */ }
  return seed();
}
let state = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorar */ } }
const errors = {}; // id -> código de error de la última consulta (no se guarda)
let netError = false;
let refreshing = false;

const itemById = (id) => state.items.find((x) => x.id === id);

/* ---------- estados ---------- */
const STAGES = ['Preparado', 'Salió de origen', 'En tránsito', 'Aduana España', 'Reparto'];
const STATUS = {
  registered: { t: 'Registrado', c: 'plain', stage: 0 },
  transit: { t: 'En camino', c: '', stage: 2 },
  customs: { t: 'Retenido en aduana', c: 'warn', stage: 3 },
  out: { t: 'En reparto', c: '', stage: 4 },
  pickup: { t: 'Listo para recoger', c: '', stage: 4 },
  delivered: { t: 'Entregado', c: 'ok', stage: 5 },
  unknown: { t: 'Sin datos', c: 'plain', stage: 0 },
};
const stOf = (s) => (s && STATUS[s.status]) || STATUS.unknown;
const delayOf = (s) => (s && s.eta && s.eta.delayDays) || 0;
function orderTsOf(item, s) {
  if (item.orderedAt) return item.orderedAt;
  if (item.demo && s && s.events && s.events.length) return s.events[s.events.length - 1].ts;
  return null;
}
function pickupLeft(s) { return Math.max(0, Math.ceil((s.pickup.deadlineTs - Date.now()) / DAY)); }

/* ---------- navegación ---------- */
const view = $('view');
const fabwrap = $('fabwrap');
const searchBtn = $('searchBtn');
const BACK = '<a class="back" href="#"><svg class="icon" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Todos los envíos</a>';
let current = 'list';
let tab = 'todos';
let query = '';
let rtab = 'transportistas';
let smsText = '';
let statsCache = null;

function route(scrollTop = true) {
  const hsh = location.hash;
  const m = hsh.match(/^#envio-(.+)$/);
  const item = m && itemById(m[1]);
  if (item) { current = 'detail'; renderDetail(item); }
  else if (hsh === '#sms') { current = 'sms'; renderSms(); }
  else if (hsh === '#ranking') { current = 'ranking'; renderRanking(); }
  else if (hsh === '#avisos') { current = 'avisos'; renderAvisos(); }
  else { current = 'list'; renderList(); }
  searchBtn.hidden = current !== 'list';
  if (scrollTop) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => route(true));

function rerender() {
  if (!['list', 'detail', 'avisos'].includes(current)) return;
  const a = document.activeElement;
  if (a && (a.id === 'q' || a.id === 'orderDate')) return;
  const y = window.scrollY;
  route(false);
  window.scrollTo(0, y);
}

/* ---------- lista ---------- */
const TABS = [['todos', 'Todos'], ['camino', 'En camino'], ['entregados', 'Entregados'], ['retraso', 'Con retraso']];
function byTab(item) {
  const s = state.cache[item.id];
  if (tab === 'camino') return !s || s.status !== 'delivered';
  if (tab === 'entregados') return !!s && s.status === 'delivered';
  if (tab === 'retraso') return delayOf(s) > 0;
  return true;
}
function rowText(item, s) {
  if (!s) return errors[item.id] ? 'Sin datos todavía' : 'Consultando…';
  const e = s.eta;
  if (s.status === 'delivered') return 'Entregado ' + f.short.format(e.mainTs);
  if (s.status === 'out') return 'Llega hoy';
  if (s.status === 'pickup') return 'Recoger antes del ' + f.short.format(e.mainTs);
  if (s.status === 'registered') return 'Esperando primer escaneo';
  return 'Llega ~ ' + f.short.format(e.mainTs);
}

function renderList() {
  const late = state.items.filter((i) => delayOf(state.cache[i.id]) > 0).length;
  const q = query.trim().toLowerCase();
  const items = state.items.filter(byTab).filter((i) => {
    const s = state.cache[i.id];
    return !q || `${i.name} ${i.store} ${i.code} ${s ? s.carrier : ''}`.toLowerCase().includes(q);
  });
  let h = '';
  if (state.provider === 'mock') {
    h += '<div class="banner">Modo de prueba: los envíos y las fechas son simulados, no vienen de los transportistas.</div>';
  }
  if (netError) {
    h += '<div class="banner warn" role="status">No se pudo actualizar. Se muestran los últimos datos guardados.</div>';
  }
  if (searchBtn.getAttribute('aria-expanded') === 'true') {
    h += `<div class="search"><input class="input" id="q" type="search" placeholder="Buscar por nombre, tienda o número" value="${esc(query)}" aria-label="Buscar envíos"></div>`;
  }
  h += '<div class="tabs" role="tablist">' + TABS.map((t) => {
    const b = t[0] === 'retraso' && late ? `<span class="badge">${late}</span>` : '';
    return `<button class="tab" role="tab" type="button" data-tab="${t[0]}" aria-selected="${tab === t[0]}">${t[1]}${b}</button>`;
  }).join('') + '</div>';
  const upd = state.updatedAt ? `<span class="upd">${refreshing ? 'Actualizando…' : 'Actualizado ' + f.time.format(state.updatedAt)}</span>` : (refreshing ? '<span class="upd">Actualizando…</span>' : '');
  h += `<div class="countrow"><span class="label">${items.length}${items.length === 1 ? ' envío' : ' envíos'}</span>${upd}</div>`;
  if (!items.length) {
    const msg = tab === 'retraso' ? ['Ningún envío con retraso', 'Todo va según lo previsto.']
      : q ? ['Sin resultados', 'Prueba con otro nombre o con el número completo.']
        : ['Aquí no hay nada todavía', 'Pulsa + para añadir un envío.'];
    h += `<div class="empty"><b>${msg[0]}</b>${msg[1]}</div>`;
  } else {
    h += '<div class="list">' + items.map((i) => {
      const s = state.cache[i.id];
      const st = stOf(s);
      let extra = '';
      if (s && s.status === 'pickup') {
        const left = pickupLeft(s);
        extra = ` <span class="pill ${left <= 2 ? 'warn' : ''}">Quedan ${left} d</span>`;
      }
      if (delayOf(s)) extra = ` <span class="pill warn">+${delayOf(s)} d</span>`;
      const carrier = s ? s.carrier : 'Consultando…';
      return `<a class="item" href="#envio-${esc(i.id)}">` +
        `<div class="r1"><span class="nm">${esc(i.name)}</span><span class="pill ${st.c}">${st.t}</span></div>` +
        `<div class="sub"><span>${esc(i.store || 'Sin tienda')} · ${esc(carrier)}</span><span>${rowText(i, s)}${extra}</span></div></a>`;
    }).join('') + '</div>';
  }
  view.innerHTML = h;
  fabwrap.hidden = false;
  const qi = $('q');
  if (qi) {
    qi.addEventListener('input', () => {
      query = qi.value;
      const pos = qi.selectionStart;
      renderList();
      const n = $('q');
      n.focus();
      try { n.setSelectionRange(pos, pos); } catch (e) { /* ignorar */ }
    });
  }
}

/* ---------- detalle ---------- */
function etaView(s) {
  const e = s.eta;
  if (e.kind === 'delivered') return { big: 'Entregado el ' + f.long.format(e.mainTs), win: '' };
  if (e.kind === 'today') return { big: 'Llega hoy', win: 'El repartidor ya está en tu zona.' };
  const same = f.short.format(e.fromTs) === f.short.format(e.toTs);
  return {
    big: same ? 'El ' + f.short.format(e.fromTs) : `Entre el ${f.short.format(e.fromTs)} y el ${f.short.format(e.toTs)}`,
    win: `Lo más probable: ${f.long.format(e.mainTs)}. Es un cálculo orientativo y se ajusta cuando el paquete se mueve.`,
  };
}

function customsHtml(item) {
  const risk = riskLevel(item.contents);
  let h = `<div class="card"><div class="risk-h"><h3>Riesgo en aduana</h3><span class="pill ${risk.cls}">${risk.label}</span></div>` +
    '<p class="muted">¿Qué lleva el paquete? Marca lo que corresponda y te digo si puede dar problemas en esta ruta.</p>' +
    '<div class="chips">' + CATS.map((c) => `<button class="chip" type="button" data-cat="${c.k}" aria-pressed="${(item.contents || []).includes(c.k)}">${c.t}</button>`).join('') + '</div>';
  if (risk.sel.length) h += '<ul class="notes">' + risk.sel.map((c) => `<li>${c.m}</li>`).join('') + '</ul>';
  h += '<p class="note">Desde 2021 todo lo que llega de fuera de la UE paga IVA, y puede cobrártelo el transportista al entregar. Es una estimación: la decisión siempre es de la aduana.</p></div>';
  return h;
}

function renderDetail(item) {
  const s = state.cache[item.id];
  let h = BACK + '<div class="panel">';
  const st = stOf(s);
  h += `<div class="head"><span class="label">${esc(item.store || 'Sin tienda')}</span><h2>${esc(item.name)}</h2>` +
    `<div class="meta"><span class="mono">${esc(item.code)}</span><button class="sbtn" type="button" data-act="copy">Copiar</button>` +
    '<button class="sbtn" type="button" data-act="share">Compartir</button><button class="sbtn" type="button" data-act="delete">Quitar</button>' +
    `<span>${esc(s ? s.carrier : '')}</span><span class="pill ${st.c}">${st.t}</span></div></div>`;

  if (!s) {
    const err = errors[item.id];
    h += '<div class="card"><h3>' + (err ? 'Todavía no hay datos' : 'Consultando…') + '</h3><p class="muted">' +
      (err === 'not_found'
        ? 'Este número aún no aparece en el sistema del transportista. A veces tarda unas horas en registrarse. Vuelve a intentarlo más tarde desde el menú.'
        : err === 'invalid_code'
          ? 'El número parece incompleto. Quítalo y añádelo de nuevo con el número completo.'
          : err ? 'No se pudo consultar ahora mismo. Inténtalo de nuevo desde el menú.' : 'Estoy preguntando por tu envío.') + '</p></div></div>';
    view.innerHTML = h;
    fabwrap.hidden = true;
    return;
  }

  if (s.status === 'pickup') {
    const p = s.pickup, left = pickupLeft(s);
    const ready = s.events.find((e) => e.code === 'pickup_ready');
    const since = ready ? Math.max(0, Math.floor((Date.now() - ready.ts) / DAY)) : 0;
    let segs = '';
    for (let i = 0; i < since + left; i++) segs += `<i class="${i >= since ? 'left' : ''}"></i>`;
    h += '<div class="card eta"><span class="label">Listo para recoger</span>' +
      `<div class="big">Te quedan ${left}${left === 1 ? ' día' : ' días'} para recogerlo</div>` +
      `<div class="segs${left <= 2 ? ' urgent' : ''}" aria-hidden="true">${segs}</div>` +
      `<div class="win">Hasta el ${esc(f.long.format(s.eta.mainTs))}. Después lo devuelven al vendedor.</div>` +
      `<div><div class="label">${esc(p.place)}</div>` +
      (p.code ? `<div class="lockcode">${esc(String(p.code).replace(/(\d{3})(\d{3})/, '$1 $2'))}</div><div class="note">Código para abrir la taquilla.</div>` : '') +
      '</div></div>';
  } else {
    const e = etaView(s);
    h += `<div class="card eta"><span class="label">${s.status === 'delivered' ? 'Resultado' : 'Llegada estimada'}</span><div class="big">${esc(e.big)}</div>` +
      (e.win ? `<div class="win">${esc(e.win)}</div>` : '');
    if (s.eta.kind === 'estimate' && s.eta.dist) {
      const maxp = Math.max(...s.eta.dist.map((x) => x.p));
      h += '<div class="dist" aria-hidden="true">' + s.eta.dist.map((x) => {
        const ht = Math.max(6, Math.round((x.p / maxp) * 74));
        return `<div class="d${x.main ? ' top' : ''}"><div class="col-bar" style="height:${ht}px"></div></div>`;
      }).join('') + '</div>';
      h += '<div class="dlabels" aria-hidden="true">' + s.eta.dist.map((x) =>
        `<span><b>${f.num.format(x.ts)}</b>${f.wd.format(x.ts).replace('.', '')}</span>`).join('') + '</div>';
      h += '<div class="note">Cuanto más alta la barra, más probable es ese día.</div>';
    }
    h += '</div>';
  }

  const delay = delayOf(s);
  if (delay) {
    h += `<div class="alert" role="alert"><strong>Va con ${delay} días de retraso</strong><p>${esc(s.eta.reason || '')} He movido la fecha estimada y te aviso si cambia otra vez.</p></div>`;
  } else if (s.status === 'transit' || s.status === 'out') {
    h += '<div class="ontime">Va según lo previsto. Sin incidencias en la ruta.</div>';
  }

  if (s.route === 'china' && ['registered', 'transit', 'customs'].includes(s.status)) h += customsHtml(item);

  const cur = st.stage;
  h += '<div class="steps" aria-label="Progreso del envío">' + STAGES.map((n, i) => {
    let cls = 'step';
    if (s.status === 'delivered' || i < cur) cls += ' done';
    else if (i === cur) cls += s.status === 'customs' ? ' now hold' : ' now';
    return `<div class="${cls}"><i></i><span>${n}</span></div>`;
  }).join('') + '</div>';

  h += `<a class="card" href="#ranking"><h3>¿Cómo de fiable es ${esc(s.carrier)}?</h3><p class="muted">Compara cuánto tardan y cuántos envíos llegan a tiempo, por transportista y por tienda.</p></a>`;

  if (s.status !== 'delivered') {
    const ot = orderTsOf(item, s);
    h += '<div class="card"><h3>Si no llega a tiempo</h3>';
    if (ot) {
      h += `<p class="muted">Si no pactaste otra fecha con la tienda, el plazo máximo de entrega es de 30 días desde el pedido. En este caso, hasta el ${esc(f.long.format(ot + 30 * DAY))}.</p>`;
    } else {
      const today = new Date().toISOString().slice(0, 10);
      h += '<p class="muted">El plazo máximo de entrega es de 30 días desde el pedido. Pon la fecha del pedido para ver cuándo vence.</p>' +
        `<input class="input" type="date" id="orderDate" max="${today}" aria-label="Fecha del pedido">`;
    }
    h += '<button class="btn line" type="button" data-act="claim">Preparar la reclamación</button></div>';
  }

  h += '<div><h3 style="font-size:1.05rem; margin-bottom:14px">Historial</h3><ul class="tl">' + s.events.map((ev) =>
    `<li><div class="when">${whenLabel(ev.ts)}<br>${f.time.format(ev.ts)}</div><div class="dot"></div><div class="tx"><b>${esc(ev.title)}</b><span>${esc(ev.place || '')}</span></div></li>`).join('') + '</ul></div>';

  if (s.status !== 'delivered' && s.status !== 'pickup') {
    h += '<div class="how"><span class="label">Cómo calculo la fecha</span><ul>' +
      '<li>Cuánto suele tardar este tipo de ruta</li><li>Cuánto lleva el paquete en cada paso</li>' +
      '<li>Festivos y campañas (11.11, Black Friday, Navidad)</li><li>En cuanto el paquete se mueve, recalculo la fecha</li></ul></div>';
  }
  h += '</div>';
  view.innerHTML = h;
  fabwrap.hidden = true;
}

/* ---------- SMS ---------- */
const SAMPLE_SMS = 'Correos: tu paquete ha sido retenido por tasas pendientes (1,99 EUR). Abónalas hoy o será devuelto: correos-envios-es.top/pago';
function smsResultHtml(r) {
  let h = `<div class="verdict ${esc(r.level)}" role="status"><strong>${esc(r.title)}</strong><span>${esc(r.advice)}</span></div>`;
  if (r.reasons && r.reasons.length) h += '<div class="card"><h3>Por qué</h3><ul class="notes">' + r.reasons.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul></div>';
  if (r.cross) h += `<div class="card"><h3>Con tus envíos</h3><p class="muted">${esc(r.cross)}</p></div>`;
  h += '<div class="card"><h3>Qué hacer</h3><ul class="notes">' +
    '<li>Si de verdad crees que hay tasas, entra tú mismo en la web oficial escribiendo la dirección, no desde el enlace del SMS.</li>' +
    '<li>Si ya pulsaste y pusiste datos de la tarjeta, avisa a tu banco para bloquearla.</li>' +
    '<li>Puedes consultar a INCIBE en el 017, la línea gratuita de ayuda en ciberseguridad.</li></ul></div>';
  return h;
}
function renderSms() {
  view.innerHTML = BACK + '<div class="panel"><div class="head"><span class="label">Antiestafas</span><h2>¿Es real este SMS?</h2>' +
    '<div class="meta"><span>Pega el mensaje que te ha llegado y te digo si es sospechoso.</span></div></div>' +
    '<div class="field"><label class="label" for="smsText">Mensaje</label>' +
    `<textarea class="input" id="smsText" rows="5" placeholder="Pega aquí el SMS…">${esc(smsText)}</textarea></div>` +
    '<div class="btnrow"><button class="btn" type="button" id="smsGo">Analizar</button><button class="btn line" type="button" id="smsEx">Probar con un ejemplo</button></div>' +
    '<div id="smsOut" class="stack" aria-live="polite"></div>' +
    '<p class="note">Este análisis usa reglas sencillas. La versión final usará IA y una lista de webs oficiales siempre al día. Nunca des datos ni tarjeta desde el enlace de un SMS.</p></div>';
  fabwrap.hidden = true;
  const ta = $('smsText'), out = $('smsOut');
  async function run() {
    smsText = ta.value;
    if (smsText.trim().length < 8) { out.innerHTML = '<div class="hint err">Pega el mensaje completo para poder analizarlo.</div>'; return; }
    out.innerHTML = '<div class="hint">Analizando…</div>';
    try {
      const shipments = state.items.map((i) => { const s = state.cache[i.id]; return { name: i.name, store: i.store, carrier: s ? s.carrier : '', status: s ? s.status : '' }; });
      const res = await fetch('/api/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: smsText, shipments }) });
      const data = await res.json();
      out.innerHTML = res.ok ? smsResultHtml(data) : `<div class="hint err">${esc(data.message || 'No se pudo analizar.')}</div>`;
    } catch (e) {
      out.innerHTML = '<div class="hint err">No se pudo analizar ahora mismo. Comprueba la conexión e inténtalo de nuevo.</div>';
    }
  }
  $('smsGo').addEventListener('click', run);
  $('smsEx').addEventListener('click', () => { ta.value = SAMPLE_SMS; run(); });
}

/* ---------- fiabilidad ---------- */
const meterClass = (v) => (v >= 90 ? 'ok' : v < 80 ? 'warn' : '');
async function renderRanking() {
  fabwrap.hidden = true;
  if (!statsCache) {
    view.innerHTML = BACK + '<div class="panel"><div class="head"><span class="label">Comparativa</span><h2>Fiabilidad</h2></div><div class="hint">Cargando…</div></div>';
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) throw new Error('http');
      statsCache = await res.json();
    } catch (e) {
      view.innerHTML = BACK + '<div class="panel"><div class="head"><h2>Fiabilidad</h2></div><div class="empty"><b>No se pudo cargar</b>Inténtalo de nuevo en un momento.</div></div>';
      return;
    }
    if (current !== 'ranking') return;
  }
  const d = statsCache;
  let h = BACK + '<div class="panel"><div class="head"><span class="label">Comparativa</span><h2>Fiabilidad</h2></div>';
  if (d.sample) h += '<div class="demo">Cifras de ejemplo inventadas para enseñar el diseño. En la versión real se calcularán con los envíos de los usuarios.</div>';
  h += '<div class="tabs two" role="tablist">' +
    `<button class="tab" role="tab" type="button" data-rtab="transportistas" aria-selected="${rtab === 'transportistas'}">Transportistas</button>` +
    `<button class="tab" role="tab" type="button" data-rtab="tiendas" aria-selected="${rtab === 'tiendas'}">Tiendas</button></div><div>`;
  if (rtab === 'transportistas') {
    h += d.carriers.slice().sort((a, b) => b.rel - a.rel).map((c) =>
      `<div class="rk"><div class="t"><b>${esc(c.n)}</b><span class="pct">${c.rel} %</span></div><div class="meter ${meterClass(c.rel)}"><i style="width:${c.rel}%"></i></div>` +
      `<div class="m"><span>Tarda ${esc(c.time)}</span><span>${esc(c.inc)}</span></div></div>`).join('');
    h += '<p class="note" style="margin-top:10px">El porcentaje es la proporción de envíos que llegan en la fecha estimada.</p>';
  } else {
    h += d.stores.slice().sort((a, b) => b.rel - a.rel).map((c) =>
      `<div class="rk"><div class="t"><b>${esc(c.n)}</b><span class="pct">${c.rel} %</span></div><div class="meter ${meterClass(c.rel)}"><i style="width:${c.rel}%"></i></div>` +
      `<div class="m"><span>Tarda en enviarlo: ${esc(c.ship)}</span><span>Llega en total: ${esc(c.total)}</span></div></div>`).join('');
    h += '<p class="note" style="margin-top:10px">El porcentaje es la proporción de pedidos que llegan en el plazo que prometió la tienda.</p>';
  }
  h += '</div></div>';
  view.innerHTML = h;
}

/* ---------- avisos ---------- */
const TOGGLES = [['delay', 'Si un envío se retrasa'], ['out', 'Cuando salga a reparto'], ['pickup', 'Cuando queden pocos días para recoger']];
function renderAvisos() {
  const feed = [];
  state.items.forEach((i) => {
    const s = state.cache[i.id];
    if (!s) return;
    const last = s.events[0] ? s.events[0].ts : Date.now();
    if (delayOf(s) && state.prefs.delay) feed.push({ i, ts: last, t: `Retraso de ${delayOf(s)} días`, x: `${i.name}: ${s.eta.reason || 'Se ha movido la fecha estimada.'}` });
    if (s.status === 'pickup' && state.prefs.pickup) feed.push({ i, ts: last, t: `Te quedan ${pickupLeft(s)} días para recoger`, x: `${i.name} está en ${s.pickup.place}.` });
    if (s.status === 'out' && state.prefs.out) feed.push({ i, ts: last, t: 'Sale hoy a reparto', x: `${i.name} ya está con el repartidor de ${s.carrier}.` });
  });
  feed.sort((a, b) => b.ts - a.ts);
  let h = BACK + '<div class="panel"><div class="head"><span class="label">Notificaciones</span><h2>Avisos</h2></div>' +
    '<div class="card"><h3>Quiero que me avise</h3><div>' + TOGGLES.map((t) =>
      `<div class="trow"><span>${t[1]}</span><button class="sw" type="button" role="switch" data-pref="${t[0]}" aria-checked="${state.prefs[t[0]]}" aria-label="${t[1]}"></button></div>`).join('') +
    '</div><p class="note">Los avisos al móvil llegarán con la app. Ahora se ven aquí.</p></div>' +
    '<div><h3 style="font-size:1.05rem; margin-bottom:6px">Últimos avisos</h3>';
  if (feed.length) {
    h += '<div class="feed">' + feed.map((x) =>
      `<a class="fi" href="#envio-${esc(x.i.id)}"><div class="ft"><b>${esc(x.t)}</b><small>${whenLabel(x.ts)} ${f.time.format(x.ts)}</small></div><span>${esc(x.x)}</span></a>`).join('') + '</div>';
  } else {
    h += '<div class="empty"><b>Sin avisos</b>Activa alguna opción de arriba para recibirlos.</div>';
  }
  h += '</div></div>';
  view.innerHTML = h;
  fabwrap.hidden = true;
}

/* ---------- clics dentro de las vistas ---------- */
function copyText(text, btn, okLabel, failLabel) {
  const old = btn.textContent;
  const done = (t) => { btn.textContent = t; setTimeout(() => { btn.textContent = old; }, 1600); };
  try { navigator.clipboard.writeText(text).then(() => done(okLabel), () => done(failLabel)); } catch (e) { done(failLabel); }
}
let selectedId = null; // envío del detalle abierto
view.addEventListener('click', (ev) => {
  const t = ev.target.closest('.tab');
  if (t && t.hasAttribute('data-tab')) { tab = t.getAttribute('data-tab'); renderList(); return; }
  if (t && t.hasAttribute('data-rtab')) { rtab = t.getAttribute('data-rtab'); renderRanking(); return; }
  const pf = ev.target.closest('[data-pref]');
  if (pf) { const k = pf.getAttribute('data-pref'); state.prefs[k] = !state.prefs[k]; save(); renderAvisos(); return; }
  const m = location.hash.match(/^#envio-(.+)$/);
  const item = m && itemById(m[1]);
  if (!item) return;
  const chip = ev.target.closest('.chip');
  if (chip) {
    const c = chip.getAttribute('data-cat');
    item.contents = item.contents || [];
    const i = item.contents.indexOf(c);
    if (i > -1) item.contents.splice(i, 1); else item.contents.push(c);
    save();
    const y = window.scrollY; renderDetail(item); window.scrollTo(0, y);
    return;
  }
  const act = ev.target.closest('[data-act]');
  if (!act) return;
  const a = act.getAttribute('data-act');
  const s = state.cache[item.id];
  selectedId = item.id;
  if (a === 'copy') copyText(item.code, act, 'Copiado', 'Selecciona y copia');
  if (a === 'claim') {
    $('claimText').value = claimText({
      name: item.name, store: item.store || 'la tienda', code: item.code, carrier: s ? s.carrier : '',
      delayDays: delayOf(s), orderTs: orderTsOf(item, s),
    });
    showSheet($('claimSheet'));
  }
  if (a === 'share') { $('shareLink').textContent = 'https://rastro.example/s/' + hash(item.code).toString(36); showSheet($('shareSheet')); }
  if (a === 'delete') { $('deleteText').textContent = `Se quitará «${item.name}» de tu lista. Esto no cancela el pedido.`; showSheet($('deleteSheet')); }
});
view.addEventListener('change', (ev) => {
  if (ev.target.id !== 'orderDate') return;
  const m = location.hash.match(/^#envio-(.+)$/);
  const item = m && itemById(m[1]);
  if (!item || !ev.target.value) return;
  item.orderedAt = new Date(ev.target.value + 'T12:00:00').getTime();
  save();
  renderDetail(item);
});

searchBtn.addEventListener('click', () => {
  const open = searchBtn.getAttribute('aria-expanded') === 'true';
  searchBtn.setAttribute('aria-expanded', String(!open));
  if (open) query = '';
  renderList();
  const qi = $('q'); if (qi) qi.focus();
});

/* ---------- hojas inferiores ---------- */
const scrim = $('scrim');
let openSheet = null, lastFocus = null;
function showSheet(el) {
  lastFocus = document.activeElement; openSheet = el;
  scrim.hidden = false; el.hidden = false;
  const first = el.querySelector('input,textarea,select,button'); if (first) first.focus();
}
function closeSheet() {
  if (!openSheet) return;
  openSheet.hidden = true; scrim.hidden = true; openSheet = null;
  if (lastFocus && document.body.contains(lastFocus) && lastFocus.focus) lastFocus.focus();
}
$('fab').addEventListener('click', () => { $('porder').max = new Date().toISOString().slice(0, 10); showSheet($('addSheet')); });
$('menuBtn').addEventListener('click', () => {
  $('demoRow').hidden = !state.items.some((i) => i.demo);
  $('modeNote').textContent = state.provider === 'mock' ? 'Modo de prueba: los envíos y las fechas son simulados.' : '';
  showSheet($('menuSheet'));
});
scrim.addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));

$('claimCopy').addEventListener('click', function () {
  const ta = $('claimText');
  copyText(ta.value, this, 'Copiado', 'Selecciona el texto y cópialo');
  ta.select();
});
$('shareCopy').addEventListener('click', function () { copyText($('shareLink').textContent, this, 'Copiado', 'Selecciona y copia'); });
$('refreshBtn').addEventListener('click', () => { closeSheet(); refresh(); });
$('demoBtn').addEventListener('click', () => {
  state.items = state.items.filter((i) => !i.demo);
  save(); closeSheet();
  if (location.hash && location.hash !== '#') location.hash = ''; else route(true);
});
$('deleteOk').addEventListener('click', () => {
  if (!selectedId) return;
  state.items = state.items.filter((i) => i.id !== selectedId);
  delete state.cache[selectedId]; delete errors[selectedId];
  selectedId = null; save(); closeSheet();
  location.hash = '';
  route(true);
});

/* ---------- añadir ---------- */
const hint = $('hint');
$('addForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const code = $('code').value.trim().replace(/\s+/g, '');
  const name = $('pname').value.trim();
  const store = $('pstore').value;
  const order = $('porder').value;
  if (code.length < 8) { hint.className = 'hint err'; hint.textContent = 'El número es muy corto. Copia el número completo del pedido.'; return; }
  if (state.items.some((x) => x.code.toUpperCase() === code.toUpperCase())) { hint.className = 'hint err'; hint.textContent = 'Ese envío ya está en tu lista.'; return; }
  if (state.items.length >= MAX_ITEMS) { hint.className = 'hint err'; hint.textContent = `Por ahora puedes seguir hasta ${MAX_ITEMS} envíos a la vez. Quita alguno que ya no uses.`; return; }
  const orderedAt = order ? new Date(order + 'T12:00:00').getTime() : null;
  const now = Date.now();
  const item = {
    id: 'n' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    code, name: name || 'Envío ' + code.slice(-5), store, createdAt: orderedAt ? Math.min(orderedAt, now) : now,
    orderedAt: orderedAt ? Math.min(orderedAt, now) : null, contents: [],
  };
  state.items.unshift(item);
  save();
  $('code').value = ''; $('pname').value = ''; $('pstore').value = ''; $('porder').value = '';
  hint.className = 'hint'; hint.textContent = 'Detecto el transportista por el formato del número.';
  closeSheet();
  tab = 'todos';
  location.hash = 'envio-' + item.id;
  refresh();
});

/* ---------- consulta al servidor ---------- */
async function refresh() {
  if (refreshing || !state.items.length) return;
  refreshing = true;
  const items = state.items.slice(0, MAX_ITEMS);
  rerender();
  try {
    const res = await fetch('/api/track', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipments: items.map((i) => ({ code: i.code, createdAt: i.createdAt })) }),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    items.forEach((it, idx) => {
      const r = data.results && data.results[idx];
      if (!r) return;
      if (r.error) errors[it.id] = r.error;
      else { delete errors[it.id]; state.cache[it.id] = r; }
    });
    state.updatedAt = Date.now();
    state.provider = data.provider || state.provider;
    netError = false;
    save();
  } catch (e) {
    netError = true;
  } finally {
    refreshing = false;
    rerender();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!state.updatedAt || Date.now() - state.updatedAt > 2 * 60 * 1000)) refresh();
});

route(true);
refresh();
