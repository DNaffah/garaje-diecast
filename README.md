# Garaje 1:64

Garaje y museo de una colección de autos a escala 1:64. Regalo de cumpleaños.

- **Panel izquierdo:** busca cualquier modelo en vivo en la [Hot Wheels Wiki](https://hotwheels.fandom.com/wiki/) y lo agrega o quita del garaje.
- **Garaje:** cada auto en su vitrina, con tira de luz y tramo de pista.
- **Museo:** al tocar una vitrina, recorrido por etapas con el scroll (fotos del mismo carro real) sobre un escenario al azar, ficha del auto real, versiones de la miniatura (se pueden agregar al garaje) y lo que dice su base.

Cada persona entra con su cuenta (correo, contraseña y verificación en dos pasos opcional) y tiene su propio garaje, igual en todos sus dispositivos.

- `sitio/`: lo que se publica (HTML, CSS y JS sin build).
- `servidor/app.js`: la API `/api/*` que corre en Cloudflare Pages Functions. Es lo único que habla con Supabase; la sesión va en cookies HttpOnly.
- `docs/supabase-cuentas.sql`: tablas, funciones y permisos en Supabase.

Datos personales: ver `sitio/privacidad.html`. Seguridad: `docs/SECURITY.md`.

## Puesta en marcha (una vez)
Ver `docs/DESPLIEGUE.md`: Supabase (SQL, correo y claves) y Cloudflare Pages (carpeta `sitio`, variables de entorno). Los scripts de `docs/historico/` son del esquema viejo y no se deben correr.

## Fuentes de datos (todas públicas y de solo lectura)

| Qué | De dónde |
|---|---|
| Modelos, versiones y texto de la base | API de MediaWiki de hotwheels.fandom.com (textos CC BY-SA 3.0; las fotos de las miniaturas son de sus autores o de Mattel y solo se enlazan) |
| Texto del auto real | Wikipedia en español (o inglés si no existe), CC BY-SA |
| Ficha del auto real | Infobox del artículo de Wikipedia de la generación, adaptado y traducido (CC BY-SA 4.0) |
| Fotos del auto real | Solo fotos libres de Wikimedia Commons, con autor, licencia y enlace en la página |

Hot Wheels es una marca de Mattel. Este proyecto es un regalo personal, no comercial y sin relación con la marca; no usa su logo.

## Correr y probar en local

```bash
npm install --prefix .herramientas wrangler@3.114.17
node tests/supabase-falso.cjs 54321 &        # Supabase de mentira, solo 127.0.0.1
tests/servidor-local.sh                      # el sitio en http://127.0.0.1:8788
tests/correr.sh tests/cuentas.cjs capturas   # cuentas, sesión, 2FA, regalo, aislamiento
tests/correr.sh tests/e2e.cjs capturas       # garaje y museo
tests/correr.sh tests/pantallas.cjs capturas # 10 tamaños de pantalla
tests/sql/probar.sh                          # el SQL en un PostgreSQL desechable
```

Ver `docs/TESTING.md`.

## Licencias

Fuentes Big Shoulders Display y Figtree: SIL Open Font License 1.1, servidas desde `sitio/fonts/` (textos de licencia en `sitio/fonts/OFL-*.txt`).

## Licencia del código

MIT aplica solo al código propio (ver `LICENSE`). Las fuentes de `sitio/fonts/` están bajo SIL OFL 1.1. Los textos, fichas e imágenes que se muestran pertenecen a sus autores y se rigen por sus licencias (CC BY-SA 3.0/4.0 o la licencia de cada archivo de Commons).
