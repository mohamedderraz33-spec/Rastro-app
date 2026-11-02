# Rastro

Seguimiento de pedidos con fecha de llegada estimada, aviso de retraso y detector de SMS falsos.

**Estado:** funciona de principio a fin con un **proveedor de prueba** (datos simulados). Todavía no está conectado a ningún transportista real. La web muestra un aviso de "Modo de prueba" mientras tanto.

## Probarlo en tu ordenador

Necesitas [Node.js](https://nodejs.org) 18 o más nuevo. Dentro de esta carpeta:

```
npm run dev
```

Abre http://localhost:3000 (mejor con el móvil simulado: en Chrome, F12 y el icono del móvil).

Para pasar los tests: `npm test`

## Qué hay en cada carpeta

| Carpeta | Para qué sirve |
|---|---|
| `public/` | La web que ve el usuario (HTML, CSS y JavaScript). No lleva ninguna clave. |
| `api/` | Las funciones del servidor: `track` (consulta envíos), `sms` (analiza un SMS), `stats` (fiabilidad). |
| `lib/providers/` | **De dónde vienen los datos de seguimiento.** `mock.js` es el de prueba. |
| `lib/eta.js` | El cálculo de la fecha de llegada y del retraso. |
| `lib/sms.js` | El análisis de SMS sospechosos. |
| `lib/carriers.js` | Detección del transportista por el número y cifras de fiabilidad (de ejemplo). |
| `test/` | Tests automáticos. |

## Conectar un proveedor de seguimiento real

1. Crea cuenta en el proveedor y consigue su clave de API. **Nunca la escribas en el código ni la subas a GitHub.**
2. Copia `lib/providers/template.js` con el nombre del proveedor, por ejemplo `lib/providers/trackingmore.js`.
3. Rellena la función `track()` siguiendo su documentación. El archivo explica exactamente qué forma tienen que tener los datos que devuelve. El resto de la app (fecha estimada, avisos, pantallas) no se toca.
4. En el servidor, define las variables de entorno:
   - `TRACKING_PROVIDER=trackingmore`
   - `TRACKINGMORE_KEY=` (tu clave)

En el ordenador: `TRACKING_PROVIDER=trackingmore TRACKINGMORE_KEY=xxxx npm run dev`.

## Publicarlo (Vercel, gratis para empezar)

1. Sube esta carpeta a un repositorio de GitHub (privado).
2. En [vercel.com](https://vercel.com), "Add New → Project" y elige el repositorio. No hace falta cambiar ningún ajuste: `vercel.json` ya indica que la web está en `public/`.
3. En "Settings → Environment Variables" añade las variables de arriba cuando tengas un proveedor real.
4. Para usar tu dominio: "Settings → Domains".

## Lo que NO está hecho todavía

- **Seguimiento real.** Ahora es simulado.
- **Cuentas y base de datos.** Los envíos se guardan solo en el navegador de cada persona (se pierden si borra los datos del navegador y no pasan de un móvil a otro).
- **Avisos al móvil** (notificaciones push y email).
- **Compartir envío.** El enlace es de ejemplo.
- **Importar pedidos del email.**
- **Fiabilidad real.** Las cifras de `lib/carriers.js` son inventadas. No las publiques como ciertas.
- **Fecha estimada calibrada.** `lib/eta.js` usa reglas sencillas. Hay que ajustarlas con envíos reales.
- **Textos legales** (privacidad, condiciones, cookies): obligatorios antes de abrirlo al público, y más si pones anuncios.
- **Límite de uso por persona** en la API, para que nadie gaste tu cupo del proveedor.
- **Instalable sin conexión** (service worker). El manifiesto ya está.

## Cosas a tener en cuenta

- La reclamación habla del plazo de 30 días de la normativa de consumo. Es orientativo, y puede no aplicar igual a vendedores de fuera de la UE. La propia pantalla lo avisa.
- El análisis de SMS usa reglas. Nunca lo presentes como garantía de que un mensaje es seguro.
