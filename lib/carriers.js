// Datos de transportistas y tiendas, y detección del transportista por el formato del número.
// IMPORTANTE: las cifras de fiabilidad son de EJEMPLO (inventadas para el prototipo).
// Hay que sustituirlas por datos calculados con envíos reales antes de enseñarlas como ciertas.

export const SAMPLE_DATA = true;

export const CARRIERS = [
  { n: 'DHL Express', rel: 96, time: '2-4 días', inc: 'Pocas incidencias' },
  { n: 'UPS', rel: 95, time: '2-4 días', inc: 'Pocas incidencias' },
  { n: 'SEUR', rel: 93, time: '1-2 días en España', inc: 'Algún retraso en picos' },
  { n: 'GLS', rel: 92, time: '1-3 días en España', inc: 'Algún retraso en picos' },
  { n: 'Correos Express', rel: 91, time: '1-2 días en España', inc: 'Algún retraso en picos' },
  { n: 'Correos', rel: 88, time: '2-4 días en España', inc: 'Retrasos en campañas' },
  { n: 'Cainiao + Correos', rel: 74, time: '12-25 días desde China', inc: 'Aduana lenta en campañas' },
  { n: 'Yun Express + Correos', rel: 71, time: '14-28 días desde China', inc: 'Aduana lenta en campañas' },
];

export const STORES = [
  { n: 'Amazon', ship: '0-1 días', total: '1-3 días', rel: 97 },
  { n: 'Zalando', ship: '1 día', total: '2-4 días', rel: 95 },
  { n: 'PcComponentes', ship: '1 día', total: '2-3 días', rel: 94 },
  { n: 'Shein', ship: '2-3 días', total: '7-14 días', rel: 82 },
  { n: 'Temu', ship: '2-4 días', total: '8-16 días', rel: 79 },
  { n: 'AliExpress', ship: '2-5 días', total: '10-25 días', rel: 72 },
];

/**
 * Detecta el transportista y el tipo de ruta a partir del número.
 * route: 'china' (envío largo desde Asia), 'eu' (internacional corto) o 'domestic' (dentro de España).
 */
export function detectCarrier(code) {
  const u = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (/^LP\d{12,16}$/.test(u)) return { name: 'Cainiao + Correos', route: 'china' };
  if (/^YT\d{13,16}$/.test(u)) return { name: 'Yun Express + Correos', route: 'china' };
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(u)) {
    // Formato postal internacional S10: las dos últimas letras son el país de origen.
    const origin = u.slice(-2);
    if (origin === 'ES') return { name: 'Correos', route: 'domestic' };
    if (origin === 'CN' || origin === 'HK') return { name: 'Correos', route: 'china' };
    return { name: 'Correos', route: 'eu' };
  }
  if (/^1Z[A-Z0-9]{16}$/.test(u)) return { name: 'UPS', route: 'eu' };
  if (/^\d{14}$/.test(u)) return { name: 'SEUR', route: 'domestic' };
  if (/^\d{10}$/.test(u)) return { name: 'DHL Express', route: 'eu' };
  if (/^\d{12,15}$/.test(u)) return { name: 'Correos Express', route: 'domestic' };
  return { name: 'Transportista por confirmar', route: 'eu' };
}
