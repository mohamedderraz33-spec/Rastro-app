// DHL Shipment Tracking - Unified. Only use for the recipient's legitimate
// tracking purpose. Keep the API key on the server, never in public/.

const ENDPOINT = 'https://api-eu.dhl.com/track/shipments';
const MAX_DAILY_CALLS = 250;
const MIN_INTERVAL_MS = 5000;

let queue = Promise.resolve();
let lastRequestAt = 0;
let dailyCount = 0;
let dailyDate = new Date().toISOString().slice(0, 10);

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationOf(value) {
  const address = value && value.address || {};
  const locality = String(address.addressLocality || '').trim();
  const country = String(address.countryCode || '').trim();
  const place = locality && country && !locality.toUpperCase().endsWith(country.toUpperCase())
    ? `${locality}, ${country}` : locality;
  return place || (typeof value === 'string' ? value : '');
}

function mapStatus(status, events) {
  const code = String(status && status.statusCode || '').toLowerCase();
  const description = String(status && (status.description || status.status) || '').toLowerCase();
  if (code === 'delivered') return 'delivered';
  if (code === 'pre-transit') return 'registered';
  if (code === 'transit') return 'transit';
  if (description.includes('customs') || description.includes('aduana')) return 'customs';
  const latest = events[0] && events[0].statusCode;
  if (latest === 'delivered') return 'delivered';
  return 'unknown';
}

function etaOf(shipment) {
  const current = shipment && shipment.status || {};
  if (String(current.statusCode || '').toLowerCase() === 'delivered') {
    return { kind: 'delivered', source: 'dhl', mainTs: timestamp(current.timestamp) || Date.now(), delayDays: 0, reason: null };
  }
  const eta = timestamp(shipment && shipment.estimatedTimeOfDelivery);
  if (eta === null) return { kind: 'unavailable', source: 'dhl', mainTs: null, delayDays: 0, reason: null };
  return {
    kind: 'carrier', source: 'dhl', mainTs: eta, fromTs: eta, toTs: eta,
    dist: [], delayDays: 0, reason: null,
  };
}

export function normalizeShipment(shipment, requestedCode) {
  if (!shipment || typeof shipment !== 'object') return null;
  const sourceEvents = Array.isArray(shipment.events) ? shipment.events : [];
  const events = sourceEvents.map((event) => {
    const code = String(event && event.statusCode || 'unknown').toLowerCase();
    const title = String(event && (event.description || event.status || event.remark) || code).trim();
    return {
      ts: timestamp(event && event.timestamp) || 0,
      code: code === 'pre-transit' ? 'registered' : code === 'transit' ? 'in_transit' : code,
      title,
      place: locationOf(event && event.location),
    };
  }).sort((a, b) => b.ts - a.ts);

  const current = shipment.status || {};
  const label = String(current.description || current.status || current.statusCode || 'Estado no indicado por DHL').trim();
  const service = String(shipment.service || '').trim();
  const carrier = shipment.provider && shipment.provider.name
    ? `DHL ${shipment.provider.name}`
    : service ? `DHL ${service}` : 'DHL';

  return {
    // DHL's demo key returns a fixed sample shipment with an ID different from
    // the queried tracking number; keep the request code for API correlation.
    code: String(requestedCode || shipment.id || ''),
    carrier,
    route: 'eu',
    status: mapStatus(current, sourceEvents),
    statusLabel: label,
    dataSource: 'DHL',
    events,
    eta: etaOf(shipment),
  };
}

function queuedRequest(task, minIntervalMs) {
  const result = queue.then(async () => {
    const wait = Math.max(0, minIntervalMs - (Date.now() - lastRequestAt));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = result.catch(() => {});
  return result;
}

async function fetchShipment(code, { apiKey, fetchImpl, minIntervalMs }) {
  return queuedRequest(async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== dailyDate) { dailyDate = today; dailyCount = 0; }
    if (dailyCount >= MAX_DAILY_CALLS) return { code, error: 'rate_limited' };

    const url = new URL(ENDPOINT);
    url.searchParams.set('trackingNumber', code);
    url.searchParams.set('language', 'es');
    dailyCount += 1;
    const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'DHL-API-Key': apiKey } });
    if (response.status === 404) return { code, error: 'not_found' };
    if (!response.ok) throw new Error(`DHL API respondió HTTP ${response.status}`);
    const payload = await response.json();
    const record = Array.isArray(payload && payload.shipments) ? payload.shipments[0] : null;
    return record ? normalizeShipment(record, code) : { code, error: 'not_found' };
  }, minIntervalMs);
}

export async function track(requests, {
  apiKey = process.env.DHL_API_KEY,
  fetchImpl = globalThis.fetch,
  minIntervalMs = MIN_INTERVAL_MS,
} = {}) {
  if (!apiKey) throw new Error('Falta DHL_API_KEY. Configura la clave aprobada por DHL en el servidor.');
  if (typeof fetchImpl !== 'function') throw new Error('Este Node.js no dispone de fetch. Usa Node.js 18 o superior.');

  const results = [];
  for (const request of requests) {
    results.push(await fetchShipment(request.code, { apiKey, fetchImpl, minIntervalMs }));
  }
  return results;
}
