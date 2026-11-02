import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate, campaign } from '../lib/eta.js';
import { analyzeSms } from '../lib/sms.js';
import { track } from '../lib/providers/mock.js';
import { detectCarrier } from '../lib/carriers.js';
import trackHandler from '../api/track.js';
import smsHandler from '../api/sms.js';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0); // 2 nov 2026, en campaña 11.11

function fakeRes() {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

test('campaña: noviembre es campaña, junio no', () => {
  assert.ok(campaign(NOW));
  assert.equal(campaign(Date.UTC(2026, 5, 10)), null);
});

test('aduana en campaña: retraso de 3 días con motivo', async () => {
  const [s] = await track([{ code: 'LP00583921047321', createdAt: NOW }], { now: NOW });
  assert.equal(s.status, 'customs');
  const e = estimate(s, NOW);
  assert.equal(e.kind, 'estimate');
  assert.equal(e.delayDays, 3);
  assert.match(e.reason, /11\.11/);
  assert.ok(e.fromTs <= e.mainTs && e.mainTs <= e.toTs);
  const sum = e.dist.reduce((m, d) => m + d.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(e.dist.every((d) => d.ts > NOW));
});

test('sin campaña no hay retraso por aduana', async () => {
  const june = Date.UTC(2026, 5, 10, 12);
  const [s] = await track([{ code: 'LP00583921047321', createdAt: june }], { now: june });
  assert.equal(estimate(s, june).delayDays, 0);
});

test('en reparto llega hoy; entregado y recogida tienen su tipo', async () => {
  const out = await track([
    { code: 'SHEIN-ES-77410282' }, { code: 'ES0482217730' }, { code: 'ZL-ES-5520317' },
  ], { now: NOW });
  assert.equal(estimate(out[0], NOW).kind, 'today');
  assert.equal(estimate(out[1], NOW).kind, 'delivered');
  const p = estimate(out[2], NOW);
  assert.equal(p.kind, 'pickup');
  assert.ok(p.mainTs > NOW);
});

test('envío nuevo: arranca registrado y avanza con el tiempo', async () => {
  const code = 'LP99999999999999';
  const [a] = await track([{ code, createdAt: NOW }], { now: NOW });
  assert.equal(a.status, 'registered');
  assert.equal(a.carrier, 'Cainiao + Correos');
  const [b] = await track([{ code, createdAt: NOW - 40 * DAY }], { now: NOW });
  assert.equal(b.status, 'delivered');
  const [c] = await track([{ code, createdAt: NOW - 5 * DAY }], { now: NOW });
  assert.equal(c.status, 'transit');
  assert.ok(estimate(c, NOW).fromTs > NOW);
});

test('detección de transportista', () => {
  assert.equal(detectCarrier('LP00583921047321').route, 'china');
  assert.equal(detectCarrier('RR123456789CN').route, 'china');
  assert.equal(detectCarrier('RR123456789ES').route, 'domestic');
  assert.equal(detectCarrier('1Z999AA10123456784').name, 'UPS');
  assert.equal(detectCarrier('xyz').name, 'Transportista por confirmar');
});

test('SMS de estafa típica: muy sospechoso', () => {
  const r = analyzeSms('Correos: tu paquete ha sido retenido por tasas pendientes (1,99 EUR). Abónalas hoy o será devuelto: correos-envios-es.top/pago');
  assert.equal(r.level, 'bad');
  assert.ok(r.reasons.length >= 3);
});

test('SMS legítimo con web oficial: sin alarma', () => {
  const r = analyzeSms('Tu pedido de Amazon sale hoy a reparto. Sigue el envío en amazon.es/seguimiento', []);
  assert.equal(r.level, 'ok');
});

test('SMS con enlace acortado: al menos sospechoso', () => {
  const r = analyzeSms('Tienes un paquete pendiente de entrega, confirma tus datos: bit.ly/3xYz');
  assert.notEqual(r.level, 'ok');
});

test('SMS: cruza con los envíos del usuario', () => {
  const sms = 'SEUR: intento de entrega fallido, reprograma en seur-envio.xyz/ya';
  const sin = analyzeSms(sms, []);
  assert.match(sin.cross, /No tienes ningún envío/);
  const con = analyzeSms(sms, [{ name: 'Vestido', store: 'Shein', carrier: 'SEUR', status: 'out' }]);
  assert.match(con.cross, /Sí tienes un envío/);
});

test('API /api/track: valida entradas y mantiene el orden', async () => {
  const res = fakeRes();
  await trackHandler({ method: 'POST', body: { shipments: [{ code: 'corto' }, { code: 'LP00583921047321', createdAt: 'basura' }] } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.results[0].error, 'invalid_code');
  assert.equal(res.body.results[1].status, 'customs');
  assert.ok(res.body.results[1].eta);
});

test('API /api/track: rechaza métodos que no son POST y body vacío', async () => {
  const r1 = fakeRes();
  await trackHandler({ method: 'GET' }, r1);
  assert.equal(r1.code, 405);
  const r2 = fakeRes();
  await trackHandler({ method: 'POST', body: undefined }, r2);
  assert.deepEqual(r2.body.results, []);
});

test('API /api/track: máximo 20 envíos por petición', async () => {
  const shipments = Array.from({ length: 30 }, (_, i) => ({ code: `LP0000000000${i}${i}` }));
  const res = fakeRes();
  await trackHandler({ method: 'POST', body: { shipments } }, res);
  assert.equal(res.body.results.length, 20);
});

test('API /api/sms: texto corto da 422', async () => {
  const res = fakeRes();
  await smsHandler({ method: 'POST', body: { text: 'hola' } }, res);
  assert.equal(res.code, 422);
});

test('proveedor desconocido da error claro y /api/track responde 502', async () => {
  process.env.TRACKING_PROVIDER = 'noexiste';
  const res = fakeRes();
  await trackHandler({ method: 'POST', body: { shipments: [{ code: 'LP00583921047321' }] } }, res);
  delete process.env.TRACKING_PROVIDER;
  assert.equal(res.code, 502);
  assert.equal(res.body.error, 'provider_error');
});
