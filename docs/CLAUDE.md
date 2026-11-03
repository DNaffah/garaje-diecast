# Contexto para agentes

**Talla L** (estrategia universal de desarrollo): cuentas de usuario, datos personales (correo) y una API propia. Cualquier cambio en login, sesiones, permisos o datos pasa por revisión de seguridad aparte y por la parte legal (Ley 1581).

## Qué es
Sitio en Cloudflare Pages. Lo estático está en `sitio/` (HTML + CSS + JS en módulos, sin build). `/api/*` lo atiende `servidor/app.js` (Pages Functions), que es lo único que habla con Supabase.

```
sitio/index.html          estructura, persiana de entrada, diálogo de cuenta, CSP
sitio/_headers            cabeceras de seguridad de Cloudflare
sitio/privacidad.html     política de tratamiento de datos (versión = POLITICA_VERSION)
sitio/css/estilos.css     garaje y museo (tokens en :root)
sitio/css/acceso.css      persiana, formularios de cuenta y política
sitio/js/main.js          arranque
sitio/js/cuenta.js        entrar, crear cuenta, códigos, 2FA, link del regalo, "Tu cuenta"
sitio/js/api.js           fetch a /api con la cabecera X-Garaje
sitio/js/nube.js          leer y guardar el garaje de la cuenta
sitio/js/garaje.js        panel, vitrinas y animaciones
sitio/js/wiki.js          Hot Wheels Wiki: búsqueda, lectura y limpieza de wikitexto
sitio/js/auto-real.js     Wikipedia y Commons: generación correcta, fotos del mismo carro y ficha
sitio/js/museo.js         recorrido, ficha, versiones, base y créditos
servidor/app.js           API: cookies HttpOnly, CSRF, límites de intentos, llamadas a Supabase
functions/api/[[ruta]].js monta servidor/app.js en /api/*
docs/supabase-cuentas.sql esquema, funciones, permisos y limpieza diaria
docs/DESPLIEGUE.md        pasos de Supabase y Cloudflare
tests/                    simulador de APIs, Supabase falso, pruebas de navegador y de SQL
```

## Reglas del proyecto
- Todo texto que venga de una API se pinta con `textContent`. Nada de `innerHTML`.
- La sesión nunca toca el JavaScript de la página: solo cookies `__Host-` HttpOnly que pone el servidor.
- Los permisos se deciden en la base (`auth.uid()`, `sesion_completa()`); la página solo oculta botones.
- Ninguna función SQL recibe el id del garaje propio. Nuevas funciones: `security definer`, `search_path = ''`, `revoke` a public/anon/authenticated y `grant` solo a quien toque.
- Las regex de Postgres no aceptan repeticiones de más de 255: medir el largo aparte.
- Si cambia la política de datos de fondo: subir `POLITICA_VERSION` (cuenta.js, app.js y privacidad.html), etiquetar la versión en git y pedir de nuevo la autorización.
- Imágenes solo de `static.wikia.nocookie.net`, `upload.wikimedia.org` y `thumb.wikimedia.org`. Si se agrega un dominio, actualizar la CSP de `sitio/index.html` y `sitio/_headers`.
- Comentarios cortos con `/* */`, en español, explicando el porqué.

## Definición de terminado
Pasan `tests/cuentas.cjs`, `tests/e2e.cjs`, `tests/pantallas.cjs` y `tests/sql/probar.sh`; capturas revisadas; consola sin errores; revisión de seguridad aparte para cambios de acceso o datos; prueba en vivo contra Supabase y Cloudflare.
