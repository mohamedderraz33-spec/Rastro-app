// POST /api/sms
// Body: { text, shipments?: [{ name, store, carrier, status }] }
// Respuesta: { level, title, advice, reasons[], cross }

import { analyzeSms } from '../lib/sms.js';
import { rateLimit } from '../lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const quota = rateLimit(req, 'sms', 30, 60_000);
  if (typeof res.setHeader === 'function') {
    res.setHeader('X-RateLimit-Limit', String(quota.limit));
    res.setHeader('X-RateLimit-Remaining', String(quota.remaining));
  }
  if (!quota.allowed) {
    if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(quota.retryAfter));
    return res.status(429).json({ error: 'rate_limited', message: 'Has hecho demasiados análisis. Espera un minuto e inténtalo de nuevo.', retryAfter: quota.retryAfter });
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.trim().length < 8) {
    return res.status(422).json({ error: 'text_too_short', message: 'Pega el mensaje completo para poder analizarlo.' });
  }
  const { level, title, advice, reasons, cross } = analyzeSms(text, body.shipments);
  return res.status(200).json({ level, title, advice, reasons, cross });
}
