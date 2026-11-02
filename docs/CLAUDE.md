# Contexto para agentes

**Talla M** (estrategia universal de desarrollo): regalo para una sola persona, sin login ni pagos. Guarda una lista de carros en Supabase.

## Qué es
Sitio estático en GitHub Pages. HTML + CSS + JS en módulos, sin build ni dependencias de ejecución.

```
index.html               estructura y CSP
css/estilos.css          estilos (tokens en :root)
css/fuentes.css, fonts/  fuentes propias (SIL OFL)
js/config.js             Project URL y Publishable key de Supabase (públicas)
js/main.js               arranque y bloqueo de iframes
js/wiki.js               Hot Wheels Wiki: búsqueda, lectura y limpieza de wikitexto
js/auto-real.js          Wikipedia y Commons: generación correcta, fotos del mismo carro y ficha
js/garaje.js             panel, vitrinas, animaciones y sincronización
js/nube.js               Supabase (leer_garaje / guardar_garaje)
js/museo.js              recorrido por etapas, ficha, miniatura, base y créditos
js/animo.js              notas de ánimo al azar
js/confirmar.js          confirmación de dos toques
js/almacen.js            localStorage con try/catch
docs/supabase-*.sql      tabla, funciones y validaciones
tests/e2e.cjs            Playwright con APIs simuladas
```

## Reglas del proyecto
- Todo texto que venga de una API se pinta con `textContent`. Nada de `innerHTML`.
- Imágenes solo de `static.wikia.nocookie.net`, `upload.wikimedia.org` y `thumb.wikimedia.org` (`imagenSegura`).
- Si se agrega un dominio, actualizar la CSP de `index.html`.
- Fotos del auto real: mismo modelo y generación (código o año ±2, año exacto si hay 3 o más); nada de motores, interiores, autos de carreras o tuneados.
- Comentarios cortos con `/* */`, en español, explicando el porqué.

## Definición de terminado
Pruebas de `tests/e2e.cjs` pasan, capturas revisadas, consola sin errores, prueba en vivo contra las APIs reales y Supabase.
