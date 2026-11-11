// POST /api/track
// Body: { shipments: [{ code, createdAt }] }  (máximo 20)
// Respuesta: { results: [Shipment + eta | { code, error }] }  en el mismo orden.

import { getProvider } from '../lib/providers/index.js';
import { estimate } from '../lib/eta.js';
import { rateLimit } from '../lib/rate-limit.js';

const MAX = 20;
const DAY = 86400000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const quota = rateLimit(req, 'track', 30, 60_000);
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-RateLimit-Limit', String(quota.limit));
    res.setHeader('X-RateLimit-Remaining', String(quota.remaining));
  }
  if (!quota.allowed) {
    if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(quota.retryAfter));
    return res.status(429).json({ error: 'rate_limited', message: 'Has hecho demasiadas consultas. Espera un minuto e inténtalo de nuevo.', retryAfter: quota.retryAfter });
  }

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
      const providerName = (process.env.TRACKING_PROVIDER || 'mock').toLowerCase();
      // DHL's public API terms limit analysis and derived data. For this basic
      // integration, display only DHL's own ETA when present; never invent one.
      const eta = providerName === 'dhl' ? s.eta : estimate(s, now);
      return { ...s, eta, fetchedAt: now };
    });
    const providerName = (process.env.TRACKING_PROVIDER || 'mock').toLowerCase();
    const providerLabel = providerName === 'dhl' && process.env.DHL_API_KEY === 'demo-key' ? 'dhl-demo' : providerName;
    return res.status(200).json({ provider: providerLabel, results });
  } catch (err) {
    console.error('[track]', err && err.message);
    return res.status(502).json({ error: 'provider_error', message: 'No se pudo consultar el seguimiento ahora mismo.' });
  }
}
