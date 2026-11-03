# Garaje 1:64

Garaje y museo de una colección de autos a escala 1:64. Regalo de cumpleaños.

- **Panel izquierdo:** busca cualquier modelo en vivo en la [Hot Wheels Wiki](https://hotwheels.fandom.com/wiki/) y lo agrega o quita del garaje.
- **Garaje:** cada auto en su vitrina, con tira de luz y tramo de pista.
- **Museo:** al tocar una vitrina, recorrido por etapas con el scroll (fotos del mismo carro real) sobre un escenario al azar, ficha del auto real, versiones de la miniatura (se pueden agregar al garaje) y lo que dice su base.

Sitio estático. La colección se guarda en Supabase para verla igual en todos los dispositivos (con el link del regalo, `?g=…`), y también en el navegador por si no hay conexión.

## Configurar la nube (una vez)
1. Crear un proyecto en supabase.com y correr `docs/supabase-garaje.sql` y luego `docs/supabase-endurecer.sql` en el SQL Editor.
2. Poner la Project URL y la Publishable key en `js/config.js` (nunca la secret).
3. El primer SQL devuelve el link del regalo.

## Fuentes de datos (todas públicas y de solo lectura)

| Qué | De dónde |
|---|---|
| Modelos, versiones y texto de la base | API de MediaWiki de hotwheels.fandom.com (textos CC BY-SA 3.0; las fotos de las miniaturas son de sus autores o de Mattel y solo se enlazan) |
| Texto del auto real | Wikipedia en español (o inglés si no existe), CC BY-SA |
| Ficha del auto real | Infobox del artículo de Wikipedia de la generación, adaptado y traducido (CC BY-SA 4.0) |
| Fotos del auto real | Solo fotos libres de Wikimedia Commons, con autor, licencia y enlace en la página |

Hot Wheels es una marca de Mattel. Este proyecto es un regalo personal, no comercial y sin relación con la marca; no usa su logo.

## Correr en local

```bash
python3 -m http.server 8164 --bind 127.0.0.1
# abrir http://127.0.0.1:8164/
```

## Pruebas

```bash
NODE_PATH=$(npm root -g) node tests/e2e.cjs capturas
```

Usa Playwright con respuestas simuladas de las APIs (no necesita red). Ver `docs/TESTING.md`.

## Licencias

Fuentes Big Shoulders Display y Figtree: SIL Open Font License 1.1, servidas desde `fonts/` (textos de licencia en `fonts/OFL-*.txt`).

## Licencia del código

MIT aplica solo al código propio (ver `LICENSE`). Las fuentes de `fonts/` están bajo SIL OFL 1.1. Los textos, fichas e imágenes que se muestran pertenecen a sus autores y se rigen por sus licencias (CC BY-SA 3.0/4.0 o la licencia de cada archivo de Commons).
