# Seguridad

## Qué hay que proteger
- Un sitio estático en GitHub Pages: no hay servidor propio, cuentas, contraseñas ni pagos.
- La lista de carros del garaje, guardada en Supabase. No tiene datos personales: solo nombres de modelos y enlaces a fotos.
- El código del garaje (un UUID que va en el link del regalo). Quien lo tenga puede ver y editar ese garaje, y nada más.

## Controles
| Riesgo | Control |
|---|---|
| Inyección de HTML o scripts desde la wiki, Wikipedia o Commons | Todo se limpia a texto y se pinta con `textContent`. No hay `innerHTML` en el proyecto. El HTML de autores de Commons pasa por `DOMParser` y solo se usa su texto |
| Cargar scripts o recursos de terceros | CSP en `<meta>` con `default-src 'none'` y lista cerrada por tipo: scripts, estilos y fuentes solo del propio sitio; imágenes solo de Fandom y Wikimedia; conexiones solo a la wiki, Wikipedia, Commons y el proyecto exacto de Supabase. Sin `object`, `frame`, `worker` ni `form-action` |
| Fuentes de Google (rastreo de IP) | Fuentes servidas desde el propio sitio (`fonts/`, licencia SIL OFL 1.1) |
| Clickjacking (meter la página en un iframe) | GitHub Pages no deja enviar `frame-ancestors`; `main.js` deja la página en blanco si está dentro de otra |
| Filtrar el código del garaje | `referrer: strict-origin` (a otros sitios solo llega el dominio) y el `?g=` se quita de la barra de direcciones apenas se guarda en el dispositivo |
| Lectura o escritura masiva en Supabase | RLS activado y sin permisos sobre la tabla (probado: lectura directa responde 401). Solo dos funciones `security definer`: `leer_garaje` y `guardar_garaje`, que exigen el UUID exacto |
| Datos basura o enlaces raros guardados por quien tenga el link | `guardar_garaje` valida tamaño (máx. 300 carros), campos permitidos, largo de textos, años de 4 cifras y que las fotos sean solo de Fandom o Wikimedia (`docs/supabase-endurecer.sql`). El navegador vuelve a validar todo al cargar (`limpiarLista`, `imagenSegura`) |
| Usar una clave secreta en el navegador | `nube.js` ignora claves `sb_secret_` y JWT con rol distinto de `anon`. En `config.js` solo va la Publishable key, pública por diseño |
| Datos manipulados en `localStorage` | Se validan tipo, largo y host de cada campo al cargar |
| Abuso de las APIs públicas | Búsqueda con espera de 320 ms, máximo 60 caracteres, cancelación de búsquedas viejas y caché en memoria; las respuestas de error de MediaWiki no se guardan |
| Borrar un carro por accidente | "Sacar" pide un segundo toque de confirmación |
| Enlaces externos | `target="_blank"` con `rel="noopener noreferrer"`, solo `https` |

## Riesgo aceptado
- El UUID del garaje se guarda en `localStorage` para no tener que abrir el link en cada visita. Un script inyectado podría leerlo, pero la CSP no permite scripts externos ni en línea y no hay `innerHTML`. El impacto máximo sería editar una lista de carros de juguete. Si el link se filtra, se crea un garaje nuevo con el SQL y se manda el link nuevo.
- La Publishable key de Supabase es pública (así funciona Supabase); la protección está en RLS y en las funciones.

## Privacidad y legal
- Sin cookies, analítica ni rastreadores. La página lo dice al pie.
- Datos de la miniatura: Hot Wheels Wiki (CC BY-SA). Texto y fichas: Wikipedia (CC BY-SA). Fotos: Wikimedia Commons, con autor y licencia de cada foto en pantalla y en créditos.
- Hot Wheels es marca de Mattel; el sitio no usa su logo, no se indexa en buscadores y es un regalo personal sin fines comerciales.
