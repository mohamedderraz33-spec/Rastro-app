// Proveedor de PRUEBA: simula el seguimiento sin llamar a ningún servicio externo.
// Sirve para desarrollar y enseñar la app. Los datos no son reales.
//
// Contrato (lo mismo que tendrá que devolver un proveedor real, ver template.js):
//   track(requests, { now }) -> Promise<Array<Shipment | { code, error }>>
//   Shipment = { code, carrier, route, status, events[], pickup? }
//   events: de más reciente a más antiguo. { ts, code, title, place }
//   code de evento: registered | picked_up | left_origin | arrived_dest | customs | released | in_transit | pickup_ready | out | delivered

import { detectCarrier } from '../carriers.js';
import { campaign } from '../eta.js';

const DAY = 86400000;
const at = (now, days, h = 12, m = 0) => {
  const d = new Date(now + days * DAY);
  d.setUTCHours(h, m, 0, 0);
  return d.getTime();
};

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Envíos de ejemplo con historia fija (relativa a hoy), para que la app arranque con algo que ver.
const FIXTURES = {
  LP00583921047321: (now) => ({
    carrier: 'Cainiao + Correos', route: 'china', status: 'customs',
    events: [
      { ts: at(now, -1, 8, 40), code: 'customs', title: 'Pendiente de revisión en aduana', place: 'Madrid, España' },
      { ts: at(now, -2, 21, 15), code: 'arrived_dest', title: 'Llegó a España', place: 'Centro logístico de Madrid' },
      { ts: at(now, -5, 2, 10), code: 'left_origin', title: 'Salió del país de origen', place: 'Aeropuerto de Hangzhou, China' },
      { ts: at(now, -7, 17, 30), code: 'picked_up', title: 'Recogido por el transportista', place: 'Hangzhou, China' },
      { ts: at(now, -8, 10, 2), code: 'registered', title: 'Pedido preparado por el vendedor', place: 'AliExpress' },
    ],
  }),
  'ZL-ES-5520317': (now) => ({
    carrier: 'Correos', route: 'domestic', status: 'pickup',
    pickup: { place: 'Taquilla Citypaq · Estación Sur', code: '482913', deadlineTs: now + 3 * DAY - 60000 },
    events: [
      { ts: at(now, -1, 17, 22), code: 'pickup_ready', title: 'Depositado en la taquilla', place: 'Taquilla Citypaq · Estación Sur' },
      { ts: at(now, -2, 19, 10), code: 'in_transit', title: 'En tránsito nacional', place: 'Centro logístico de Madrid' },
      { ts: at(now, -3, 13, 0), code: 'registered', title: 'Pedido enviado', place: 'Almacén de Zalando' },
    ],
  }),
  'SHEIN-ES-77410282': (now) => ({
    carrier: 'SEUR', route: 'domestic', status: 'out',
    events: [
      { ts: at(now, 0, 7, 12), code: 'out', title: 'En reparto', place: 'Repartidor de SEUR, tu zona' },
      { ts: at(now, 0, 4, 30), code: 'in_transit', title: 'Llegó a la delegación', place: 'Centro SEUR de tu provincia' },
      { ts: at(now, -1, 20, 44), code: 'in_transit', title: 'En tránsito nacional', place: 'Plataforma logística, Zaragoza' },
      { ts: at(now, -4, 9, 20), code: 'arrived_dest', title: 'Llegó a España', place: 'Centro logístico de Madrid' },
      { ts: at(now, -9, 15, 5), code: 'registered', title: 'Pedido preparado por el vendedor', place: 'Shein' },
    ],
  }),
  YT2638401957316: (now) => ({
    carrier: 'Yun Express + Correos', route: 'china', status: 'transit',
    events: [
      { ts: at(now, -1, 13, 50), code: 'in_transit', title: 'En tránsito internacional', place: 'Vuelo a Europa' },
      { ts: at(now, -3, 6, 35), code: 'left_origin', title: 'Salió del país de origen', place: 'Shenzhen, China' },
      { ts: at(now, -4, 18, 10), code: 'picked_up', title: 'Recogido por el transportista', place: 'Shenzhen, China' },
      { ts: at(now, -5, 11, 0), code: 'registered', title: 'Pedido preparado por el vendedor', place: 'Temu' },
    ],
  }),
  ES0482217730: (now) => ({
    carrier: 'Correos Express', route: 'domestic', status: 'delivered',
    events: [
      { ts: at(now, -2, 11, 21), code: 'delivered', title: 'Entregado', place: 'Entregado en tu domicilio' },
      { ts: at(now, -2, 7, 5), code: 'out', title: 'En reparto', place: 'Repartidor, tu zona' },
      { ts: at(now, -3, 19, 40), code: 'in_transit', title: 'Llegó a la delegación', place: 'Correos Express, tu provincia' },
      { ts: at(now, -5, 14, 0), code: 'registered', title: 'Pedido enviado', place: 'Almacén de Amazon' },
    ],
  }),
};

/** Genera una historia simulada que avanza con el tiempo desde createdAt. */
function generate(code, createdAt, now) {
  const det = detectCarrier(code);
  const h = hash(code);
  const china = det.route === 'china';
  const camp = china ? campaign(now) : null;
  const wait = china ? 1 + (camp ? camp.extra : 0) : 0;
  const T = china ? 14 + (h % 8) : det.route === 'eu' ? 4 + (h % 4) : 2 + (h % 3);

  const ms = [{ o: 0, status: 'registered', code: 'registered', title: 'Envío registrado en Rastro', place: 'Esperando el primer escaneo del transportista' }];
  if (china) {
    const arr = T - 5;
    ms.push(
      { o: 1, status: 'transit', code: 'picked_up', title: 'Recogido por el transportista', place: 'Origen, China' },
      { o: 3, status: 'transit', code: 'left_origin', title: 'Salió del país de origen', place: 'Aeropuerto de origen, China' },
      { o: arr, status: 'transit', code: 'arrived_dest', title: 'Llegó a España', place: 'Centro logístico de Madrid' },
      { o: arr + 1, status: 'customs', code: 'customs', title: 'Pendiente de revisión en aduana', place: 'Madrid, España' },
      { o: arr + 1 + wait, status: 'transit', code: 'released', title: 'Liberado por la aduana', place: 'Madrid, España' },
      { o: arr + 2 + wait, status: 'transit', code: 'in_transit', title: 'En tránsito nacional', place: 'Centro logístico de Correos' },
      { o: arr + 3 + wait, status: 'out', code: 'out', title: 'En reparto', place: 'Repartidor, tu zona' },
      { o: arr + 3.4 + wait, status: 'delivered', code: 'delivered', title: 'Entregado', place: 'Entregado en tu domicilio' },
    );
  } else {
    ms.push(
      { o: 0.3, status: 'transit', code: 'picked_up', title: 'Recogido por el transportista', place: 'Origen' },
      { o: Math.max(0.6, T - 1), status: 'transit', code: 'in_transit', title: 'Llegó a la delegación', place: 'Delegación de tu provincia' },
      { o: Math.max(0.9, T - 0.4), status: 'out', code: 'out', title: 'En reparto', place: 'Repartidor, tu zona' },
      { o: T, status: 'delivered', code: 'delivered', title: 'Entregado', place: 'Entregado en tu domicilio' },
    );
  }

  const reached = ms.filter((m) => createdAt + m.o * DAY <= now);
  const last = reached[reached.length - 1] || ms[0];
  const events = reached.map((m) => ({ ts: createdAt + m.o * DAY, code: m.code, title: m.title, place: m.place })).reverse();
  return { carrier: det.name, route: det.route, status: last.status, events };
}

export async function track(requests, { now = Date.now() } = {}) {
  return requests.map((r) => {
    const code = r.code;
    const fx = FIXTURES[code];
    const base = fx ? fx(now) : generate(code, r.createdAt || now, now);
    return { code, ...base };
  });
}
