# Rastro

Seguimiento de pedidos con fecha de llegada estimada, aviso de retraso y detector de SMS falsos.

**Estado:** MVP local probado de principio a fin con un **proveedor de prueba** (datos simulados). Todavía no está conectado a ningún transportista real. La web muestra un aviso de "Modo de prueba" mientras tanto. No hace falta pagar una API para esta fase.

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

### DHL Shipment Tracking - Unified

Rastro incluye un conector de solo lectura para la API unificada de seguimiento de DHL. Solo muestra el estado y los eventos publicados por DHL, y la fecha prevista únicamente cuando DHL la devuelve. No calcula retrasos propios a partir de esos datos. Compartir el envío y cruzarlo con el análisis de SMS quedan desactivados para datos DHL.

DHL informa actualmente que la API es gratuita para pruebas; el acceso requiere una clave aprobada del Developer Portal. La cuota inicial documentada es de 250 consultas al día y una consulta cada 5 segundos. El proveedor consulta un envío por petición, así que una lista grande puede tardar. La clave `demo-key` devuelve un envío ficticio de muestra, no un paquete real.

En PowerShell, configura la clave solo en la sesión local del servidor (no la pongas en el código ni en Git):

```powershell
$env:TRACKING_PROVIDER = 'dhl'
$env:DHL_API_KEY = 'tu_clave_aprobada'
npm run dev
```

Para probar solo el formato de respuesta de DHL, se puede usar `DHL_API_KEY='demo-key'`; la interfaz lo identifica como modo de demostración.

Antes de usar datos DHL para predicciones, análisis propios, compartir u otros fines distintos del seguimiento legítimo, revisa las condiciones vigentes y solicita autorización escrita a DHL cuando corresponda. Las condiciones de la API limitan revelar, modificar o derivar información de los datos de seguimiento. Referencias: [acceso y cuota de DHL](https://developer.dhl.com/tracking) y [tarifas de la API unificada](https://support-developer.dhl.com/support/solutions/articles/47001249492-is-the-dhl-shipment-tracking-unified-api-free-of-charge-).

## Publicarlo (Vercel, gratis para empezar)

1. Sube esta carpeta a un repositorio de GitHub (privado).
2. En [vercel.com](https://vercel.com), "Add New → Project" y elige el repositorio. No hace falta cambiar ningún ajuste: `vercel.json` ya indica que la web está en `public/`.
3. En "Settings → Environment Variables" añade las variables de arriba cuando tengas un proveedor real.
4. Para usar tu dominio: "Settings → Domains".

## Lo que NO está hecho todavía

- **Seguimiento real.** La demo usa datos simulados. Hace falta escoger un proveedor, crear una cuenta y guardar su clave como variable de entorno del servidor.
- **Cuentas y base de datos.** Los envíos siguen guardándose en el navegador y no se sincronizan entre dispositivos. Falta escoger e integrar un proveedor de autenticación y almacenamiento.
- **Avisos remotos.** Los avisos locales del navegador están implementados; para avisar con la app cerrada o enviar email hacen falta un servicio push/email, claves, consentimiento y despliegue.
- **Compartir envío.** El enlace ahora contiene una copia fija del estado y del número de seguimiento. En modo local solo funciona en ese mismo ordenador; para compartirlo entre dispositivos hace falta publicar la app en un dominio.
- **Importar pedidos del email.** Necesita integración OAuth de Gmail o Microsoft, configuración de sus aplicaciones y consentimiento del usuario.
- **Fiabilidad y estimaciones calibradas.** La app ya no muestra porcentajes ficticios. Para publicar una comparativa y calibrar `lib/eta.js` hay que recopilar entregas reales con fechas verificadas y suficiente muestra.
- **Textos legales.** Antes de abrir el servicio al público faltan la identidad y datos de contacto del responsable, los plazos de conservación, los proveedores de datos y la revisión legal de privacidad, condiciones y cookies.
- **Límite de uso en producción.** `/api/track` y `/api/sms` tienen un límite básico por IP en memoria, suficiente para pruebas locales. En Vercel las instancias no comparten ese contador; producción necesita un almacén de límites compartido y reglas ajustadas al proveedor elegido.

## Terminado para la fase de prueba local

- Selector de modo claro/oscuro con preferencia guardada en el navegador.
- PWA con manifiesto y service worker: la interfaz y sus recursos se guardan en caché para volver a abrir la app sin conexión. El seguimiento y el análisis de SMS sí necesitan internet.
- Pruebas manuales de lista, filtros, búsqueda, detalle, alta y baja de envíos, SMS, avisos, reclamación y compartir; los envíos añadidos para la prueba se eliminaron al terminar.
- Pruebas automáticas: `npm test` (20 tests).

## Siguiente orden recomendado

1. Mantener el proveedor simulado mientras se termina y valida la experiencia local, sin consumir una cuota de API.
2. Para probar un envío DHL real, solicitar y configurar una clave aprobada; la clave de demostración devuelve solo datos ficticios. Después revisar si DHL autoriza los cálculos predictivos propios de Rastro.
3. Antes de publicar: elegir autenticación y base de datos, definir dominio y responsable legal, preparar privacidad/condiciones/cookies y configurar límites compartidos.
4. Después del despliegue: habilitar avisos push/email y probar compartir entre dispositivos.

La carcasa de la web y sus recursos estáticos se guardan en caché mediante `public/sw.js`, por lo que las pantallas pueden abrirse sin conexión. Las consultas y análisis de la API necesitan conexión.
## Cosas a tener en cuenta

- La reclamación habla del plazo de 30 días de la normativa de consumo. Es orientativo, y puede no aplicar igual a vendedores de fuera de la UE. La propia pantalla lo avisa.
- El análisis de SMS usa reglas. Nunca lo presentes como garantía de que un mensaje es seguro.
