// PLANTILLA para conectar un proveedor real de seguimiento (TrackingMore, Ship24, 17TRACK, ...).
//
// Cómo usarla:
//   1. Copia este archivo con el nombre del proveedor, por ejemplo lib/providers/trackingmore.js
//   2. Rellena track() siguiendo la documentación de ese proveedor.
//   3. Pon en el servidor las variables TRACKING_PROVIDER=trackingmore y TRACKINGMORE_KEY=...
//
// Lo que tiene que devolver track() es SIEMPRE esta forma, sea cual sea el proveedor.
// El resto de la app (estimación, avisos, pantallas) no cambia.
//
//   Shipment = {
//     code:    string,                    // el número de seguimiento tal como llegó
//     carrier: string,                    // nombre del transportista, ej. "SEUR"
//     route:   'china'|'eu'|'domestic',   // tipo de ruta (ver detectCarrier en lib/carriers.js)
//     status:  'registered'|'transit'|'customs'|'out'|'pickup'|'delivered',
//     events:  [{ ts, code, title, place }],   // del más reciente al más antiguo; ts en milisegundos
//     pickup?: { place, code?, deadlineTs }    // solo si status === 'pickup'
//   }
//   Si un envío falla: { code, error: 'not_found' | 'provider_error' }
//
//   Códigos de evento: registered, picked_up, left_origin, arrived_dest, customs, released,
//                      in_transit, pickup_ready, out, delivered
//
// Consejos:
//   - La clave se lee con process.env.NOMBRE_KEY y no se escribe nunca en el código.
//   - Pide los envíos nuevos UNA vez y guarda la respuesta; no consultes siempre lo mismo,
//     porque los planes gratuitos tienen cupo.
//   - Si el proveedor usa webhooks (te avisa él), hará falta además un archivo en api/ que los reciba.

import { detectCarrier } from '../carriers.js';

export async function track(requests, { now = Date.now() } = {}) { // eslint-disable-line no-unused-vars
  void detectCarrier;
  throw new Error('Plantilla sin implementar: copia este archivo y rellena track().');
}
