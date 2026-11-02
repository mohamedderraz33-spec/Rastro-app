// GET /api/stats
// Fiabilidad de transportistas y tiendas. De momento son cifras de EJEMPLO (sample: true).

import { CARRIERS, STORES, SAMPLE_DATA } from '../lib/carriers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  return res.status(200).json({ sample: SAMPLE_DATA, carriers: CARRIERS, stores: STORES });
}
