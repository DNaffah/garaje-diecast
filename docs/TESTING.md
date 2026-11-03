# Pruebas

## A · Técnica (automática)
`tests/e2e.cjs` levanta Chromium a 1440×900 y 390×844 con las APIs simuladas y comprueba:
- estado vacío, búsqueda (descarta páginas que no son modelos), agregar 3 autos, persistencia al recargar;
- museo: título, fotos del recorrido (sin fotos de motor), grados a mitad del scroll, cambio de fondo, versiones, placa de la base;
- diseño original (Twin Mill) marcado como tal; volver con botón y con Escape; quitar desde la lista;
- sin scroll horizontal, sin errores de consola, sin diálogos.

## B · Usuario simulado
Personas: el coleccionista que agrega 20 autos seguidos desde el celular; el que busca un modelo con nombre raro ("'67 Camaro", "Bone Shaker"); el que solo quiere ver el giro. Se recorren en vivo contra las APIs reales.

## C · Seguridad
- Wikitexto con `<script>` en una celda: no se inserta (comprobado en `e2e.cjs`).
- Autor de Commons con HTML: se muestra como texto plano (comprobado).
- Revisión de CSP, hosts de imagen y `localStorage` en `docs/SECURITY.md`.

## D · Resultado
Se anota en cada entrega: fecha, qué pasó, qué falló y cómo se corrigió.

### 2026-11-02 · primera entrega
- **A técnica:** `tests/e2e.cjs` pasa completo en 1440×900 y 390×844 (sin errores de consola, sin scroll horizontal).
- **B usuario simulado (en vivo, APIs reales):** búsqueda, agregar, quitar, museo y cambio de fondo probados con R34, '67 Camaro, 1997 Supra, '69 Charger, VW T1, '71 911, Countach, Twin Mill y Bone Shaker.
  - Falló: la búsqueda traía páginas que no son modelos (tiendas, series). Arreglo: solo páginas en categorías de modelos 1:64.
  - Falló: la vitrina mostraba "Image not available" o bocetos. Arreglo: se descartan y se usa la foto principal o la versión más reciente.
  - Falló: el recorrido mezclaba generaciones (Camaro moderno en el '67, 911 de 2019 en el '71, Caravelle T5 en el T1). Arreglo: si el modelo trae código o año, solo entran fotos que lo nombren (año ±2); si no hay 2, se usan las versiones de la miniatura.
  - Falló: un error de la API quedaba en caché y dejaba un auto sin fotos. Arreglo: las respuestas con `error` no se guardan.
  - Falló: Wikimedia sirve miniaturas desde `thumb.wikimedia.org` y la lista de hosts lo bloqueaba. Arreglo: agregado a `imagenSegura` y a la CSP.
- **C seguridad:** sin `innerHTML` con datos externos; HTML de wikitexto y de autores de Commons neutralizado (comprobado); CSP con lista cerrada; revisión de secretos por patrón sin hallazgos.
- **Pendiente conocido:** si la wiki o Wikimedia cambian su API, la búsqueda o las fotos pueden fallar; la página muestra el error y sigue funcionando con lo guardado.

### 2026-11-02 · segunda entrega (después de la revisión del dueño)
- **Problemas reportados:** el garaje no se veía igual en otro dispositivo; no había botón visible para sacar carros; las fotos del auto real eran malas y de otro carro.
- **Revisión independiente:** un revisor con perfil de experto en autos y diseño evaluó capturas reales en dos rondas. Primera ronda: no aprobado (ficha de otra generación, wikitexto en inglés, fotos recortadas, '67 mostrando un '68, nota que tapaba datos).
- **Arreglos:** artículo de Wikipedia por generación (años de producción del infobox y código en el título); foto de portada del año exacto; series del mismo carro y fotos verificadas del mismo modelo y generación; filtro de motores, interiores, autos de carreras, policía y tuneados; foto completa con fondo difuminado; ficha en español, métrica y filtrada por año; crédito por foto; confirmación al sacar; fondo al azar; versiones que se agregan al garaje.
- **A técnica:** `tests/e2e.cjs` pasa en 1440×900 y 390×844 (incluye sacar desde la vitrina y desde el museo, agregar una versión, elegir otra foto y persistencia).
- **B usuario simulado:** recorridos en vivo de R34, '67 Camaro, 1997 Supra, '71 911 y Countach: todas las fotos del recorrido son del mismo modelo y generación.
- **C seguridad:** Supabase con RLS y sin acceso directo (401), funciones con UUID; CSP `default-src 'none'`; sin `innerHTML`; revisión de secretos sin hallazgos; ver `SECURITY.md`.

### 2026-11-02 · tercera entrega (pantallas, legal y revisión de seguridad aparte)
- **A técnica:** `tests/e2e.cjs` pasa en 1440×900 y 390×844. Se agregó: tocar una versión la mete al garaje y vuelve; foto guardada mal codificada no cuelga el museo.
- **Pantallas:** `tests/pantallas.cjs` revisa 10 tamaños, de 320×568 a 2560×1440, incluido celular horizontal (844×390): sin scroll horizontal, nada se sale por la derecha, la foto mide al menos 120 px de alto y el panel de datos se ve completo. Falló primero el celular horizontal (foto de 98 px) y la ficha en celular (la tira de versiones estiraba la grilla); los dos se arreglaron.
- **Revisión legal aparte:** solo fotos libres de Commons con autor y licencia; crédito también para la foto de portada; enlaces a las licencias CC y aviso de adaptación de la ficha; aviso de marca de Mattel; texto de privacidad; archivos OFL de las fuentes.
- **C seguridad, revisión aparte (otro agente, solo lectura):** sin hallazgos críticos, altos ni medios. Siete bajos y nueve informativos; arreglados:
  - B1 `authenticated` podía ejecutar las funciones → `revoke` explícito en `supabase-endurecer.sql`.
  - B2 el servidor aceptaba carros sin `titulo` → `coalesce` y largo 1–200.
  - B3 un borrado desde la nube se llevaba la lista → copia local antes de reemplazar.
  - B4 `&#99999999;` lanzaba RangeError → entidades fuera de Unicode se descartan.
  - B5 regex de tiempo cuadrático con wikitexto armado → recorrido lineal y topes (2 MB en < 20 ms).
  - B6 `decodeURIComponent` sin try → `decodificar`.
  - I2, I3, I5, I6: fondo validado y evento muerto quitado; tope de 300 carros en el cliente; enlace de licencia solo a CC/Wikimedia; `blob:` fuera de la CSP.
  - B7 (origen compartido en github.io) queda como riesgo aceptado en `SECURITY.md`.

### 2026-11-02 · cuarta entrega (cuentas de usuario, talla L)
- **A técnica:**
  - `tests/cuentas.cjs` (12 escenarios contra wrangler local y Supabase falso): registro con errores de antes, código falso, cookie HttpOnly/Secure/Strict, nada en localStorage, carro guardado en la cuenta, aislamiento entre cuentas, CSRF, datos inválidos, activar 2FA, entrar con 2FA (la API niega el garaje con solo la contraseña), recuperar con 2FA, límite de intentos, link del regalo, registro previo del correo ajeno y borrado de cuenta.
  - `tests/e2e.cjs` y `tests/pantallas.cjs` (10 tamaños, también la persiana sin sesión) entran ahora con cuenta.
  - `tests/sql/probar.sh`: el SQL en PostgreSQL 16 real con un `auth` como el de Supabase, corrido dos veces.
- **B usuario simulado:** en el PC del dueño, con wrangler y la wiki real: crear cuenta, confirmar con código, la persiana sube, agregar el R34, recargar y seguir conectado con el carro guardado. Consola sin errores.
- **C seguridad, tres revisiones aparte en paralelo:**
  - Accesos y sesiones: A1 (registrar primero un correo ajeno y quedarse con la cuenta) arreglado y probado; A2 (clave pública ya publicada) se resuelve rotándola; M1 (IP compartida de Cloudflare y sesiones borradas ante un 429) arreglado con `Sb-Forwarded-For` y 503 sin borrar la sesión; B1 a B4 arreglados (límites por fallos, IPv6 /64, 2FA contada por la cuenta validada, respuestas en el mismo tiempo, `Content-Length`).
  - Datos y despliegue: regex `{1,600}` inválida en Postgres (ningún garaje se podía guardar; también en el script viejo) arreglada y probada en Postgres real; mezcla del regalo que perdía carros sin clave arreglada; scripts viejos bajo candado en `docs/historico/`; carrera del límite de intentos con candado; sesión revisada en `auth.sessions`; claves cruzadas rechazadas; `.gitignore` y cabeceras de `/privacidad` corregidos.
  - Legal (Ley 1581): política completa (vigencia, derechos y plazos, encargados y transmisión, cookies, conservación), casilla con edad y alcance, prueba de autorización anotada por la base y conservada 3 años como huella, limpieza diaria. Pendiente del dueño: datos del responsable, región de Supabase y proveedor de correo.
- **Lección:** el Supabase falso no reproduce todo (la contraseña de un registro repetido, la regex de Postgres). Por eso ahora hay prueba contra Postgres real y queda la prueba en vivo contra Supabase antes de entregar.
