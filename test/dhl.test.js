import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShipment, track } from '../lib/providers/dhl.js';
import trackHandler from '../api/track.js';

const dhlRecord = (overrides = {}) => ({
  id: '7777777770',
  service: 'ecommerce-iberia',
  status: {
    timestamp: '2026-11-10T10:20:00+01:00',
    statusCode: 'transit',
    description: 'El envío está en camino',
    location: { address: { addressLocality: 'Madrid', countryCode: 'ES' } },
  },
  estimatedTimeOfDelivery: '2026-11-13',
  events: [
    { timestamp: '2026-11-10T10:20:00+01:00', statusCode: 'transit', description: 'El envío está en camino', location: { address: { addressLocality: 'Madrid', countryCode: 'ES' } } },
    { timestamp: '2026-11-09T08:00:00+01:00', statusCode: 'pre-transit', description: 'Información recibida', location: { address: { addressLocality: 'Barcelona', countryCode: 'ES' } } },
  ],
  ...overrides,
});

test('DHL: normaliza eventos y conserva el estado publicado por el transportista', () => {
  const shipment = normalizeShipment(dhlRecord(), '7777777770');
  assert.equal(shipment.dataSource, 'DHL');
  assert.equal(shipment.status, 'transit');
  assert.equal(shipment.statusLabel, 'El envío está en camino');
  assert.equal(shipment.carrier, 'DHL ecommerce-iberia');
  assert.equal(shipment.events[0].code, 'in_transit');
  assert.equal(shipment.events[0].place, 'Madrid, ES');
  assert.ok(shipment.events[0].ts > shipment.events[1].ts);
});

test('DHL: usa solo la fecha prevista que devuelve DHL, sin predicción propia', () => {
  const shipment = normalizeShipment(dhlRecord(), '7777777770');
  assert.equal(shipment.eta.source, 'dhl');
  assert.equal(shipment.eta.kind, 'carrier');
  assert.equal(shipment.eta.mainTs, Date.parse('2026-11-13'));
  assert.deepEqual(shipment.eta.dist, []);
  assert.equal(shipment.eta.delayDays, 0);
});

test('DHL: si no facilita una fecha, la marca como no disponible', () => {
  const shipment = normalizeShipment(dhlRecord({ estimatedTimeOfDelivery: undefined }), '7777777770');
  assert.equal(shipment.eta.kind, 'unavailable');
  assert.equal(shipment.eta.mainTs, null);
});

test('DHL: los entregados usan el evento de DHL y no una predicción', () => {
  const shipment = normalizeShipment(dhlRecord({
    status: { timestamp: '2026-11-11T09:00:00Z', statusCode: 'delivered', description: 'Entregado' },
    estimatedTimeOfDelivery: undefined,
  }), '7777777770');
  assert.equal(shipment.status, 'delivered');
  assert.equal(shipment.eta.kind, 'delivered');
  assert.equal(shipment.eta.mainTs, Date.parse('2026-11-11T09:00:00Z'));
});

test('DHL: hace GET autenticado con el código de seguimiento', async () => {
  let requestUrl, requestOptions;
  const result = await track([{ code: '7777777770' }], {
    apiKey: 'test-key', minIntervalMs: 0,
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestOptions = options;
      return { ok: true, status: 200, json: async () => ({ shipments: [dhlRecord()] }) };
    },
  });
  assert.equal(requestUrl.origin, 'https://api-eu.dhl.com');
  assert.equal(requestUrl.pathname, '/track/shipments');
  assert.equal(requestUrl.searchParams.get('trackingNumber'), '7777777770');
  assert.equal(requestUrl.searchParams.get('language'), 'es');
  assert.equal(requestOptions.headers['DHL-API-Key'], 'test-key');
  assert.equal(result[0].code, '7777777770');
});

test('DHL: no encuentra envíos con respuesta 404', async () => {
  const [result] = await track([{ code: '7777777770' }], {
    apiKey: 'test-key', minIntervalMs: 0,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.deepEqual(result, { code: '7777777770', error: 'not_found' });
});

test('DHL: requiere la clave solo en el servidor', async () => {
  await assert.rejects(() => track([{ code: '7777777770' }], { apiKey: '', minIntervalMs: 0 }), /DHL_API_KEY/);
});

test('API de DHL no calcula ETA ni retrasos a partir del historial', async () => {
  const oldProvider = process.env.TRACKING_PROVIDER;
  const oldKey = process.env.DHL_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.TRACKING_PROVIDER = 'dhl';
  process.env.DHL_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ shipments: [dhlRecord({ estimatedTimeOfDelivery: undefined })] }) });
  try {
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await trackHandler({ method: 'POST', body: { shipments: [{ code: '7777777770' }] } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.provider, 'dhl');
    assert.equal(res.body.results[0].eta.kind, 'unavailable');
    assert.equal(res.body.results[0].eta.delayDays, 0);
  } finally {
    if (oldProvider === undefined) delete process.env.TRACKING_PROVIDER; else process.env.TRACKING_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.DHL_API_KEY; else process.env.DHL_API_KEY = oldKey;
    globalThis.fetch = oldFetch;
  }
});
