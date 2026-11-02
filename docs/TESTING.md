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
