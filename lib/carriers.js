// No se publican porcentajes hasta tener una muestra de entregas reales.
export const SAMPLE_DATA = false;
export const CARRIERS = [];
export const STORES = [];

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
