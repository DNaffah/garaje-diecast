# Contexto para agentes

**Talla M** (estrategia universal de desarrollo): página para una sola persona, sin login, sin pagos, sin datos personales ni de terceros.

## Qué es
Sitio estático en GitHub Pages. HTML + CSS + JS en módulos, sin build ni dependencias de ejecución.

```
index.html          estructura y CSP
css/estilos.css     tokens (:root) y todos los estilos
js/main.js          arranque
js/wiki.js          API de la Hot Wheels Wiki: búsqueda, lectura y limpieza de wikitexto
js/auto-real.js     Wikipedia, Wikidata y Commons para el auto real
js/garaje.js        panel, vitrinas y animaciones de entrada/salida
js/museo.js         recorrido 360°, fondos, salas y créditos
js/animo.js         notas de ánimo aleatorias
js/almacen.js       localStorage (colección y fondo), con try/catch
tests/e2e.cjs       Playwright con APIs simuladas
```

## Reglas del proyecto
- Todo texto que venga de una API se pinta con `textContent`. Nunca `innerHTML` con datos externos.
- Imágenes solo de `static.wikia.nocookie.net`, `upload.wikimedia.org` y `thumb.wikimedia.org` (`imagenSegura`).
- Si se agrega un dominio, actualizar la CSP de `index.html`.
- Movimiento: solo `transform`/`opacity`, respetar `prefers-reduced-motion`.
- Texto visible en español, sin nombre del destinatario.

## Definición de terminado
Pruebas de `tests/e2e.cjs` pasan, capturas de escritorio y móvil revisadas, consola sin errores, prueba en vivo contra las APIs reales.
