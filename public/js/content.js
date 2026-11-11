// Textos y reglas que usa la web: riesgo en aduana y mensaje de reclamación.
// Son funciones puras (sin DOM) para poder probarlas.

export const CATS = [
  { k: 'pilas', t: 'Pilas o baterías', s: 2, m: 'Las baterías de litio tienen restricciones en el transporte aéreo. Dentro de un aparato suelen pasar; sueltas, pueden retenerlas o devolverlas.' },
  { k: 'liquidos', t: 'Líquidos o perfume', s: 2, m: 'Los líquidos inflamables y los perfumes tienen límites en avión y pueden quedarse parados.' },
  { k: 'electronica', t: 'Electrónica', s: 1, m: 'La electrónica debe llevar el marcado CE y la aduana la mira más en campañas fuertes.' },
  { k: 'comida', t: 'Comida o suplementos', s: 2, m: 'Alimentos y suplementos pasan controles sanitarios y a veces se retienen.' },
  { k: 'marcas', t: 'Marcas conocidas', s: 2, m: 'Si la aduana sospecha que es una imitación, puede quedarse con el paquete y destruirlo.' },
  { k: 'ropa', t: 'Ropa u objetos normales', s: 0, m: 'Casi nunca da problemas, salvo que haya mucha cola en la aduana.' },
];

/** Nivel de riesgo según lo que lleva el paquete. */
export function riskLevel(contents) {
  const sel = CATS.filter((c) => (contents || []).includes(c.k));
  if (!sel.length) return { label: 'Sin datos', cls: 'plain', sel };
  const score = sel.reduce((m, c) => m + c.s, 0);
  if (score >= 4) return { label: 'Riesgo alto', cls: 'bad', sel };
  if (score >= 2) return { label: 'Riesgo medio', cls: 'warn', sel };
  return { label: 'Riesgo bajo', cls: 'ok', sel };
}

const DAY = 86400000;
const long = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Mensaje de reclamación listo para copiar.
 * @param {{name:string, store:string, code:string, carrier:string, delayDays:number, orderTs:number|null}} d
 * orderTs: fecha del pedido si se conoce con seguridad; si es null se deja un hueco para rellenar.
 */
export function claimText(d) {
  const known = Number.isFinite(d.orderTs);
  const order = known ? long.format(d.orderTs) : '[fecha del pedido]';
  const deadline = known ? long.format(d.orderTs + 30 * DAY) : null;
  const late = d.delayDays ? ` y lleva ${d.delayDays} días de retraso respecto a la fecha estimada` : '';
  const platform = /aliexpress|temu|shein/i.test(d.store || '')
    ? '\n\nSi no recibo respuesta, abriré también una disputa en la plataforma.'
    : '';
  return (
    `Asunto: Reclamación por pedido no entregado (seguimiento ${d.code})\n\n` +
    'Hola:\n\n' +
    `El ${order} hice el pedido «${d.name}» en ${d.store}. El envío con número de seguimiento ${d.code} (${d.carrier}) sigue sin entregarse${late}.\n\n` +
    'Salvo que se pactara otra fecha, el plazo máximo de entrega es de 30 días naturales desde el pedido' +
    (deadline ? `, es decir, hasta el ${deadline}.` : '.') + '\n\n' +
    'Les pido que:\n' +
    '1. Me confirmen el estado real del envío.\n' +
    '2. Si no se entrega en un plazo razonable, me reembolsen el importe o me envíen un nuevo pedido.' +
    platform +
    '\n\nQuedo a la espera de su respuesta.\n\nUn saludo,\n[tu nombre]'
  );
}
