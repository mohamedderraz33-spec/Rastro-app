// Limitador sencillo por IP y proceso. En plataformas serverless cada instancia
// puede tener su propio contador: producción necesita un almacén compartido.

export function createRateLimiter() {
  const buckets = new Map();

  return function checkRateLimit(req, namespace, limit, windowMs, now = Date.now()) {
    const headers = req && req.headers || {};
    const forwarded = String(headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = String(req && (req.ip || (req.socket && req.socket.remoteAddress)) || forwarded || 'unknown');
    const key = `${namespace}:${ip}`;
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (buckets.size > 5000) {
      for (const [oldKey, oldBucket] of buckets) {
        if (now >= oldBucket.resetAt) buckets.delete(oldKey);
      }
    }

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count >= limit) return { allowed: false, limit, remaining: 0, retryAfter };
    bucket.count += 1;
    return { allowed: true, limit, remaining: Math.max(0, limit - bucket.count), retryAfter };
  };
}

const checkRateLimit = createRateLimiter();

export function rateLimit(req, namespace, limit, windowMs, now) {
  return checkRateLimit(req, namespace, limit, windowMs, now);
}
