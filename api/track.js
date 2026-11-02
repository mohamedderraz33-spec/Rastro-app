// POST /api/track
// Body: { shipments: [{ code, createdAt }] }  (máximo 20)
// Respuesta: { results: [Shipment + eta | { code, error }] }  en el mismo orden.

import { getProvider } from '../lib/providers/index.js';
import { estimate } from '../lib/eta.js';

const MAX = 20;
const DAY = 86400000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const list = Array.isArray(body.shipments) ? body.shipments : [];
  const now = Date.now();

  const requests = list.slice(0, MAX).map((s) => {
    const code = String((s && s.code) || '').trim().slice(0, 100);
    let createdAt = Number(s && s.createdAt);
    if (!Number.isFinite(createdAt)) createdAt = now;
    createdAt = Math.min(now, Math.max(now - 120 * DAY, createdAt));
    return { code, createdAt };
  });

  const valid = requests.filter((r) => r.code.length >= 8);

  try {
    const provider = await getProvider();
    const found = valid.length ? await provider.track(valid, { now }) : [];
    const byCode = new Map(found.map((s) => [s.code, s]));
    const results = requests.map((r) => {
      if (r.code.length < 8) return { code: r.code, error: 'invalid_code' };
      const s = byCode.get(r.code);
      if (!s) return { code: r.code, error: 'not_found' };
      if (s.error) return { code: r.code, error: s.error };
      return { ...s, eta: estimate(s, now), fetchedAt: now };
    });
    return res.status(200).json({ provider: (process.env.TRACKING_PROVIDER || 'mock').toLowerCase(), results });
  } catch (err) {
    console.error('[track]', err && err.message);
    return res.status(502).json({ error: 'provider_error', message: 'No se pudo consultar el seguimiento ahora mismo.' });
  }
}
