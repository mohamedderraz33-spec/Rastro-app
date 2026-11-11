// Estimación de la fecha de llegada.
// Es un modelo sencillo con reglas, NO está calibrado con datos reales.
// Cuando haya envíos reales, hay que ajustar MEDIAN y los extras con lo que se observe.

const DAY = 86400000;

/** Días totales típicos y dispersión (en días) por tipo de ruta. */
export const MEDIAN = {
  china: { total: 15, sd: 3.5 },
  eu: { total: 5, sd: 1.6 },
  domestic: { total: 2, sd: 0.8 },
};

/** Campañas con más volumen de lo normal. Añaden días extra en la aduana. */
export function campaign(now) {
  const d = new Date(now);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  if ((m === 10 && day >= 25) || m === 11 || (m === 12 && day <= 2)) {
    return { name: '11.11 y Black Friday', extra: 3 };
  }
  if ((m === 12 && day >= 3) || (m === 1 && day <= 6)) {
    return { name: 'Navidad y Reyes', extra: 3 };
  }
  return null;
}

export function noonUTC(ts) {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

function latest(events, code) {
  return (events || []).find((e) => e.code === code);
}

/** Distribución sobre los días siguientes a la fecha más probable (algo más larga por la derecha). */
function distribution(mainDay, sd, now) {
  const items = [];
  let sum = 0;
  for (let o = mainDay - 3; o <= mainDay + 4; o++) {
    if (o < 1) continue;
    const s = o > mainDay ? sd * 1.45 : sd;
    const p = Math.exp(-Math.pow(o - mainDay, 2) / (2 * s * s));
    items.push({ o, p });
    sum += p;
  }
  return items.map(({ o, p }) => ({ ts: noonUTC(now + o * DAY), p: p / sum, main: o === mainDay }));
}

/**
 * Calcula la estimación a partir de un envío ya normalizado.
 * Devuelve { kind, mainTs, fromTs, toTs, dist, delayDays, reason }.
 */
export function estimate(s, now = Date.now()) {
  const events = s.events || [];

  if (s.status === 'delivered') {
    const ev = latest(events, 'delivered') || events[0];
    return { kind: 'delivered', mainTs: noonUTC(ev ? ev.ts : now), delayDays: 0, reason: null };
  }
  if (s.status === 'pickup' && s.pickup) {
    return { kind: 'pickup', mainTs: noonUTC(s.pickup.deadlineTs), delayDays: 0, reason: null };
  }
  if (s.status === 'out') {
    return { kind: 'today', mainTs: noonUTC(now), delayDays: 0, reason: null };
  }

  const camp = campaign(now);
  const prof = MEDIAN[s.route] || MEDIAN.eu;
  const china = s.route === 'china';
  const lastMile = china ? 2 : 1;
  let remaining;
  let sd = prof.sd;
  let delay = 0;
  let reason = null;

  if (s.status === 'customs') {
    const c = latest(events, 'customs');
    const inCustoms = c ? (now - c.ts) / DAY : 0;
    const extra = camp ? camp.extra : 0;
    remaining = Math.max(1, 1 + extra - inCustoms) + lastMile;
    sd = camp ? 1.7 : 1.0;
    if (extra > 0) {
      delay = extra;
      reason = `Campaña del ${camp.name}: llegan más paquetes de lo normal y la aduana va más lenta.`;
    }
  } else if (s.status === 'transit') {
    if (latest(events, 'arrived_dest')) {
      remaining = 1 + lastMile + (camp ? 1 : 0);
      sd = 1.2;
    } else {
      const start = latest(events, 'picked_up') || latest(events, 'registered');
      const since = start ? (now - start.ts) / DAY : 0;
      remaining = Math.max(china ? 3 : 1, prof.total - since) + (camp && china ? 1 : 0);
    }
  } else {
    // registered u otros: aún no se ha movido
    remaining = prof.total + (camp && china ? 1 : 0);
    sd = prof.sd + 0.5;
  }

  const mainDay = Math.max(1, Math.round(remaining));
  const dist = distribution(mainDay, sd, now);
  const inWindow = dist.filter((d) => d.p >= 0.08);
  const win = inWindow.length ? inWindow : dist;

  return {
    kind: 'estimate',
    mainTs: noonUTC(now + mainDay * DAY),
    fromTs: win[0].ts,
    toTs: win[win.length - 1].ts,
    dist,
    delayDays: delay,
    reason,
  };
}
