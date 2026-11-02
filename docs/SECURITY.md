# Seguridad

## Superficie
- Sitio estático: no hay servidor, base de datos, cuentas, sesiones ni secretos.
- Llama solo a APIs públicas de lectura (Fandom, Wikipedia, Wikidata, Commons) con `origin=*`, sin credenciales.
- Lo único que guarda es la lista de autos, el fondo elegido y, si se sube, una imagen de fondo reducida a 1600 px, todo en `localStorage` del propio navegador.

## Controles
| Riesgo | Control |
|---|---|
| XSS por contenido de la wiki (wikitexto, HTML de autores en Commons) | Se limpia a texto plano; todo se pinta con `textContent`; el HTML de Commons se pasa por `DOMParser` y solo se usa su texto |
| Imágenes o enlaces a dominios inesperados | `imagenSegura` admite solo tres hosts por https (Fandom y Wikimedia); los enlaces se construyen con `URL` y solo https |
| Carga de scripts o conexiones a terceros | CSP en `<meta>`: `script-src 'self'`, `connect-src` y `img-src` con lista cerrada, `object-src 'none'`, `base-uri 'none'` |
| Datos manipulados en `localStorage` | Se validan tipo y largo al cargar; el fondo propio debe empezar por `data:image/` |
| Subida de imagen de fondo | Solo JPG/PNG/WebP de menos de 8 MB; se redibuja en canvas (no se guarda el archivo original) |
| Abuso de las APIs | Búsqueda con espera de 320 ms, cancelación de búsquedas viejas y caché en memoria |
| Enlaces externos | `target="_blank"` con `rel="noopener noreferrer"` |

## Fuera de alcance
GitHub Pages no permite cabeceras propias (HSTS, `frame-ancestors`). No aplica: no hay sesión que proteger.
