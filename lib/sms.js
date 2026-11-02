// Análisis de SMS sospechosos de falsos avisos de paquetería.
// Ahora usa reglas sencillas. La idea es que más adelante lo complemente un modelo de IA
// y una lista de webs oficiales mantenida al día.

export const OFFICIAL = [
  'correos.es', 'correosexpress.com', 'seur.com', 'dhl.com', 'dhl.es', 'gls-spain.es', 'ups.com', 'mrw.es',
  'amazon.es', 'amazon.com', 'aliexpress.com', 'temu.com', 'shein.com', 'zalando.es', 'agenciatributaria.gob.es',
];
const SHORTENERS = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'rb.gy', 'shorturl.at', 'ow.ly'];
const BRANDS = ['correos', 'seur', 'dhl', 'gls', 'ups', 'mrw', 'amazon', 'aliexpress', 'temu', 'shein', 'zalando'];

const URL_RE = /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/gi;

function hostsOf(text) {
  const urls = text.match(URL_RE) || [];
  const seen = new Set();
  const hosts = [];
  for (const u of urls) {
    const h = u.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase().replace(/[.,;:)]+$/, '');
    if (h && !seen.has(h)) { seen.add(h); hosts.push(h); }
  }
  return hosts;
}

function isOfficial(host) {
  return OFFICIAL.some((d) => host === d || host.endsWith('.' + d));
}

/**
 * @param {string} text Texto del SMS.
 * @param {Array<{name:string, store:string, carrier:string, status:string}>} shipments Resumen de los envíos del usuario.
 * @returns {{level:'bad'|'warn'|'ok', title:string, advice:string, reasons:string[], cross:string|null, score:number}}
 */
export function analyzeSms(text, shipments = []) {
  const t = String(text || '').slice(0, 2000);
  const low = t.toLowerCase();
  const reasons = [];
  let score = 0;

  const hosts = hostsOf(t);
  for (const host of hosts) {
    if (SHORTENERS.includes(host)) {
      score += 3;
      reasons.push(`El enlace está acortado (${host}), así que no se ve adónde lleva.`);
      continue;
    }
    if (isOfficial(host)) continue;
    score += 3;
    reasons.push(`El enlace (${host}) no es una web oficial.`);
    if (BRANDS.some((b) => host.includes(b))) {
      score += 2;
      reasons.push('La dirección copia el nombre de una empresa de envíos.');
    }
    if (/\.(top|xyz|click|icu|vip|shop|live|cfd|sbs)$/.test(host)) {
      score += 1;
      reasons.push(`Acaba en un dominio raro (.${host.split('.').pop()}).`);
    }
  }
  if (/tasas|aduana|abon|pagar|pague|importe|€|eur\b|\b\d+[.,]\d{2}\b/.test(low)) {
    score += 2;
    reasons.push('Te pide pagar una cantidad pequeña.');
  }
  if (/hoy|urgente|inmediat|24 ?h|devuelto|devoluci|cancelad|retenido|bloquead|última/.test(low)) {
    score += 2;
    reasons.push('Mete prisa o amenaza con devolver el paquete.');
  }
  if (/confirma|reprogram|actualiza.*(datos|direcci)/.test(low) && hosts.length) {
    score += 1;
    reasons.push('Te pide confirmar datos desde un enlace.');
  }

  let level = 'ok';
  let title = 'No veo señales claras de estafa';
  let advice = 'Aun así, no des datos ni tarjeta desde un enlace de un SMS.';
  if (score >= 5) {
    level = 'bad'; title = 'Casi seguro que es una estafa'; advice = 'No pulses el enlace ni pagues nada.';
  } else if (score >= 3) {
    level = 'warn'; title = 'Sospechoso'; advice = 'Mejor no pulses el enlace hasta comprobarlo.';
  }

  // Comparar con los envíos del usuario
  let cross = null;
  const brand = BRANDS.find((b) => low.includes(b));
  const mine = Array.isArray(shipments) ? shipments.slice(0, 50) : [];
  if (brand) {
    const match = mine.find((s) => s && s.status !== 'delivered' &&
      `${s.carrier || ''} ${s.store || ''}`.toLowerCase().includes(brand));
    cross = match
      ? `Sí tienes un envío relacionado: «${String(match.name || '').slice(0, 80)}». Aun así, en su seguimiento no consta ningún pago pendiente.`
      : `No tienes ningún envío con «${brand}» en Rastro. Este mensaje no encaja con ninguno de tus paquetes.`;
  } else if (hosts.length || score) {
    cross = 'El mensaje no dice de qué empresa es. Comprueba tus envíos aquí en Rastro: si no hay ninguno parecido, ignóralo.';
  }

  return { level, title, advice, reasons, cross, score };
}
