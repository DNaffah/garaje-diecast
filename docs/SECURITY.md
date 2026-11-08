# Seguridad

## Qué hay que proteger
- Las cuentas: correo y contraseña (cifrada por Supabase con bcrypt), y el factor de la 2FA.
- El garaje de cada cuenta. Solo su dueño lo puede ver o cambiar.
- La prueba de la autorización de datos (Ley 1581).
- Las claves de Supabase. La pública y la secreta viven solo en Cloudflare, como variables de entorno; nunca en el repo ni en la página.

## Arquitectura
Navegador → Cloudflare Pages (`sitio/` + `servidor/app.js` en `/api/*`) → Supabase (Auth y funciones SQL). La página nunca habla con Supabase ni ve un token.

## Controles
| Riesgo | Control |
|---|---|
| Robo de sesión por XSS | Sesión en cookies `__Host-` HttpOnly, Secure, SameSite=Strict que pone el servidor. No hay `innerHTML`; CSP `default-src 'none'` con lista cerrada por tipo (cabeceras en `sitio/_headers` y `<meta>`) |
| CSRF | SameSite=Strict, y además todo lo que cambia algo exige `Origin` igual al sitio, la cabecera `X-Garaje: 1` y JSON (`mismoOrigen`) |
| IDOR, ver o tocar el garaje de otro | Las funciones SQL usan `auth.uid()` y no reciben el id del garaje propio. RLS activo, tablas sin permisos directos, `security definer` con `search_path = ''`. Probado contra PostgreSQL real (`tests/sql/probar.sh`) |
| Saltarse la 2FA | `sesion_completa()` exige aal2 en la base cuando la cuenta tiene un factor verificado. Supabase además exige aal2 para cambiar la contraseña o quitar el factor |
| Token robado después de cerrar sesión | `sesion_completa()` revisa que la sesión siga viva en `auth.sessions` |
| Registrar primero el correo de otra persona | Al confirmar el código se vuelve a fijar la contraseña de quien confirma; la del primer registro deja de servir (probado en `tests/cuentas.cjs`) |
| Fuerza bruta | Límites por IP (IPv6 por red /64) y por cuenta en entrar, registro, códigos, recuperación, 2FA y borrado (`permitir_intento`, con candado contra ráfagas). En entrar, los límites por cuenta solo cuentan fallos. En códigos y correos (`reglasDeCorreo`) hay tres contadores: IP, IP + correo (bajo) y correo (más alto): quien conoce un correo ajeno solo se bloquea a sí mismo, y el tope por correo sigue frenando a quien reparte el ataque entre muchas IPs. La IP siempre va primero. Supabase recibe la IP real (`Sb-Forwarded-For`) (probado en `tests/limites.cjs`) |
| Repetir en bucle las rutas sin límite propio | `TOPES_POR_IP` en `servidor/app.js`: tope amplio por IP en `GET yo`, `GET/PUT garaje`, `salir` y `2fa/activar`. Reclamar regalo cuenta la IP antes que el usuario del token, que todavía no está validado |
| La Hot Wheels Wiki se cae o bloquea las consultas | Plan de respaldo en `wiki.js`: tras 9 s o cualquier error, la búsqueda usa Wikipedia (solo artículos con ficha de automóvil) y el museo abre con el auto real. No se guarda nada nuevo en el garaje (probado en `tests/respaldo.cjs`) |
| Saber qué correos tienen cuenta | Registro, reenvío y recuperación responden igual y en el mismo tiempo: el correo se manda después de responder |
| Caída o saturación de Supabase | Si Supabase responde 429 o 5xx, la sesión no se borra: se responde 503 y se reintenta |
| Contraseñas débiles | Mínimo 10 caracteres, letras y números, máximo 72 bytes (límite de bcrypt), en el servidor y en Supabase |
| Datos basura o enlaces raros en el garaje | `autos_validos()` en la base: campos permitidos, solo texto, largos máximos, años de 4 cifras y fotos solo de Fandom o Wikimedia. El navegador vuelve a validar al cargar |
| Claves cruzadas al configurar | El servidor no arranca si la clave pública no es publishable/anon o la secreta no es secret/service_role |
| Texto de terceros hecho para trabar la pestaña (ReDoS) | Limpieza lineal de `<ref>` y comentarios, cuantificadores con tope y wikitexto cortado a 150 000 caracteres |
| Clickjacking | `frame-ancestors 'none'` y `X-Frame-Options: DENY`; `main.js` además deja la página en blanco dentro de un iframe |
| Cuerpos enormes | Se revisa `Content-Length` antes de leer: 4 KB para auth, 320 KB para el garaje |
| Scripts de base viejos | `docs/historico/` corta con error si alguien los corre |

## Riesgo aceptado
- El link del regalo (`?g=`) es de un solo uso: la primera cuenta que lo use se queda con ese garaje. Se manda solo al dueño.
- La clave pública vieja de Supabase sigue en el historial de git (primer commit, `js/config.js`). Con ella se puede llamar directo al Auth de Supabase y saltarse los límites del servidor. A la base no llega: RLS y permisos la cierran. **Pendiente del dueño:** borrarla y desactivar las claves legacy (ver `docs/DESPLIEGUE.md`).
- Los límites viven en la base: cada pedido abusivo igual llega a la función y gasta una consulta. Una regla de Rate Limiting de Cloudflare lo frenaría antes, pero necesita dominio propio (ver `docs/DESPLIEGUE.md`).
- Los términos de Fandom (rev. dic. 2025) piden permiso escrito para el acceso automático. Regalo personal, no comercial, con pocas consultas, crédito CC BY-SA y fotos solo enlazadas: riesgo bajo, aceptado por el dueño. Si Fandom bloquea, entra el respaldo con Wikipedia.
- Las vistas previas de Cloudflare no tienen variables de entorno (solo Production), así que no funcionan con datos reales.

## Si pasa un incidente
1. **Contener:** pausar el proyecto de Cloudflare Pages o quitar sus variables de entorno.
2. **Rotar:** claves de Supabase (publishable y secret) y, si hizo falta, la contraseña del correo de envío. Cerrar todas las sesiones desde Supabase → Authentication.
3. **Revisar:** logs de Auth de Supabase y logs de Cloudflare para saber qué cuentas y datos se tocaron.
4. **Avisar:** por correo a las personas afectadas, y a la Superintendencia de Industria y Comercio dentro de los 15 días hábiles siguientes a detectarlo.
5. **Registrar:** qué pasó, cuándo, qué se hizo y qué cambia para que no se repita (en este archivo).

## Privacidad y legal
- Política en `sitio/privacidad.html` (Ley 1581 de 2012, Decreto 1377 de 2013). La autorización se pide con una casilla sin marcar, el servidor exige la versión vigente y la base anota la prueba sola al crear el usuario.
- Encargados: Supabase, Cloudflare y el proveedor de correo, con sus contratos de tratamiento de datos.
- Al borrar la cuenta queda solo una huella del correo con la fecha y la versión aceptada, 3 años. Limpieza diaria con pg_cron (`public.limpieza_diaria()`): intentos viejos, cuentas sin confirmar a los 7 días junto con su autorización, y huellas de más de 3 años. Si una cuenta se borra desde el panel de Supabase, su autorización se seudonimiza igual.
- Lo que cree el rol `postgres` en el futuro en `public` nace sin permisos para `anon` ni `authenticated` (`alter default privileges`). Una tabla nueva hecha desde el Table Editor necesita sus `grant` a mano, y una función nueva igual lleva su `revoke ... from public` (PUBLIC conserva EXECUTE por defecto).
- Contenido de terceros: Hot Wheels Wiki y Wikipedia (CC BY-SA), fotos libres de Commons con autor y licencia. Hot Wheels es marca de Mattel; sitio personal, sin fines comerciales y sin su logo.
