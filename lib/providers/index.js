// Elige el proveedor de seguimiento según la variable de entorno TRACKING_PROVIDER.
//   (vacío) o "mock"  ->  proveedor de prueba (datos simulados)
//   "nombre"          ->  lib/providers/nombre.js  (ver template.js para saber qué tiene que exportar)
//
// Las claves de las APIs se leen de variables de entorno en el servidor. Nunca van en public/.

export async function getProvider() {
  const name = (process.env.TRACKING_PROVIDER || 'mock').toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(name)) throw new Error('TRACKING_PROVIDER no es válido.');
  try {
    const mod = await import(`./${name}.js`);
    if (typeof mod.track !== 'function') throw new Error(`El proveedor "${name}" no exporta track().`);
    return mod;
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`No existe el proveedor "${name}" (falta lib/providers/${name}.js).`);
    }
    throw err;
  }
}
