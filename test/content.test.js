import test from 'node:test';
import assert from 'node:assert/strict';
import { riskLevel, claimText } from '../public/js/content.js';

const DAY = 86400000;

test('riesgo de aduana: sin datos, bajo, medio y alto', () => {
  assert.equal(riskLevel([]).label, 'Sin datos');
  assert.equal(riskLevel(['ropa']).label, 'Riesgo bajo');
  assert.equal(riskLevel(['electronica']).label, 'Riesgo bajo');
  assert.equal(riskLevel(['pilas']).label, 'Riesgo medio');
  assert.equal(riskLevel(['pilas', 'electronica']).label, 'Riesgo medio');
  assert.equal(riskLevel(['pilas', 'liquidos']).label, 'Riesgo alto');
});

test('reclamación con fecha del pedido calcula el límite a 30 días', () => {
  const order = Date.UTC(2026, 9, 25, 12);
  const t = claimText({ name: 'Auriculares', store: 'AliExpress', code: 'LP1', carrier: 'Cainiao', delayDays: 3, orderTs: order });
  assert.match(t, /hasta el/);
  assert.match(t, /3 días de retraso/);
  assert.match(t, /disputa en la plataforma/);
  const limit = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(order + 30 * DAY);
  assert.ok(t.includes(limit));
});

test('reclamación sin fecha deja un hueco y no inventa el límite', () => {
  const t = claimText({ name: 'Zapas', store: 'Zalando', code: 'ZL1', carrier: 'Correos', delayDays: 0, orderTs: null });
  assert.match(t, /\[fecha del pedido\]/);
  assert.doesNotMatch(t, /hasta el/);
  assert.doesNotMatch(t, /disputa/);
  assert.doesNotMatch(t, /retraso/);
});
