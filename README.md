# Garaje 1:64

Garaje y museo de una colección de autos a escala 1:64. Regalo de cumpleaños.

- **Panel izquierdo:** busca cualquier modelo en vivo en la [Hot Wheels Wiki](https://hotwheels.fandom.com/wiki/) y lo agrega o quita del garaje.
- **Garaje:** cada auto en su vitrina, con tira de luz y tramo de pista.
- **Museo:** al tocar una vitrina, recorrido de 360° con el scroll sobre el fondo que se elija (o una imagen propia), ficha del auto real, versiones de la miniatura y lo que dice su base.

Sitio estático, sin servidor, sin cuentas y sin claves. La colección y el fondo se guardan solo en el navegador de quien lo usa.

## Fuentes de datos (todas públicas y de solo lectura)

| Qué | De dónde |
|---|---|
| Modelos, versiones, fotos de miniaturas, texto de la base | API de MediaWiki de hotwheels.fandom.com (CC BY-SA) |
| Texto del auto real | Wikipedia en español (o inglés si no existe), CC BY-SA |
| Ficha del auto real | Wikidata (CC0) |
| Fotos del auto real | Wikimedia Commons (licencia de cada foto, con crédito en la página) |

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

## Licencia

Código bajo MIT (ver `LICENSE`). Los datos e imágenes que se muestran pertenecen a sus fuentes y se cargan desde ellas.
