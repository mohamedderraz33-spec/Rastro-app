// GET /api/stats
// Se mantiene vacío hasta recopilar datos reales y suficientes para no inventar porcentajes.

import { CARRIERS, STORES, SAMPLE_DATA } from '../lib/carriers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const available = !SAMPLE_DATA && CARRIERS.length > 0 && STORES.length > 0;
  return res.status(200).json({ available, sample: SAMPLE_DATA, carriers: CARRIERS, stores: STORES });
}
