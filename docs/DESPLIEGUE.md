# Puesta en marcha (cuentas + Cloudflare)

Lo que hay que hacer una sola vez para publicar la versión con cuentas. Las claves y
contraseñas se copian de un panel al otro; nunca van al repositorio ni a un chat.

## 0. Antes de empezar
- Un **Gmail dedicado** para el sitio (por ejemplo para "Garaje 1:64"), con la verificación en dos
  pasos activada y una **contraseña de aplicación** (Cuenta de Google → Seguridad → Contraseñas de
  aplicaciones). Sirve para mandar los códigos y como correo de contacto de la política.
- Los datos del responsable para `sitio/privacidad.html`: nombre, ciudad, dirección para
  notificaciones, correo y teléfono.

## 1. Supabase
1. **SQL Editor** → pegar `docs/supabase-cuentas.sql` → **Run**. Debe terminar sin errores.
   - No correr nada de `docs/historico/` (ni el viejo `supabase-endurecer.sql`).
   - Si aparece el aviso "pg_cron no está disponible": Integrations → Cron → Enable, y correr el script otra vez.
2. **Authentication → Sign In / Providers → Email**:
   - Confirm email: activado. Secure email change y Secure password change: activados.
   - Minimum password length: `10`. Password requirements: letras y números.
   - Email OTP expiration: `600` segundos. Email OTP length: `6`.
3. **Authentication → Emails → SMTP Settings**: activar el SMTP propio con el Gmail del paso 0
   (host `smtp.gmail.com`, puerto `465`, usuario = el Gmail, contraseña = la contraseña de
   aplicación, remitente "Garaje 1:64"). Sin esto, Supabase solo les manda correos a los miembros
   del equipo del proyecto: a nadie más le llegarían los códigos.
4. **Authentication → Emails → Templates**:
   - **Confirm signup**: asunto `Tu código para el Garaje 1:64`, cuerpo = `docs/correos/confirmar-registro.html`.
   - **Reset password**: asunto `Cambiar la contraseña del Garaje 1:64`, cuerpo = `docs/correos/recuperar-clave.html`.
5. **Authentication → Multi-Factor**: dejar solo TOTP (app de autenticación); teléfono y WebAuthn apagados.
6. **Authentication → Rate Limits**: activar el reenvío de la IP del cliente (IP address forwarding),
   para que los límites cuenten por visitante y no por las IPs de Cloudflare.
7. **Project Settings → API Keys** (rotar, porque la clave pública vieja estuvo publicada en GitHub Pages):
   - Crear una **Publishable key** nueva y una **Secret key**.
   - Borrar la Publishable key vieja y desactivar las claves legacy (anon y service_role).
   - Las dos nuevas se pegan solo en Cloudflare (paso 3).
8. Mirar la **región** del proyecto (Project Settings → General) para ponerla en la política.

## 2. GitHub
La rama `cuentas` tiene esta versión. Cloudflare publica desde ahí mientras se prueba; cuando
todo esté bien se une a `main`.

## 3. Cloudflare Pages
1. Crear la cuenta en dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Connect to Git**. Autorizar GitHub solo para el repo
   `garaje-diecast` y elegirlo.
3. Configuración:
   - Project name: `garaje-164` (la dirección queda como `garaje-164.pages.dev` si está libre).
   - Production branch: `cuentas`.
   - Framework preset: None. Build command: vacío. Build output directory: `sitio`.
4. **Settings → Variables and Secrets**, solo en **Production** (no en Preview):
   - `SUPABASE_URL` = Project URL de Supabase (texto).
   - `SUPABASE_CLAVE_PUBLICA` = la Publishable key nueva (Secret).
   - `SUPABASE_CLAVE_SECRETA` = la Secret key nueva (Secret).
   - No poner `MODO_PRUEBA`.
5. **Save and Deploy**.

## 4. Después
- Poner la dirección de Cloudflare como **Site URL** en Supabase → Authentication → URL Configuration.
- Completar `sitio/privacidad.html` (responsable, región, proveedor de correo) antes de que alguien se registre.
- Probar en vivo: crear una cuenta propia, confirmar el correo, agregar un carro, abrir en otro
  dispositivo, activar y probar la 2FA, recuperar la contraseña, cerrar sesión.
- Revisar que el garaje del regalo se puede reclamar sin perder carros:
  `select public.autos_validos(autos), jsonb_array_length(autos) from public.garajes where dueno is null;`
- Mandar al amigo el link nuevo con su código (`https://<dirección>/?g=...`). Al crear su cuenta, ese garaje pasa a ser suyo.
- Unir `cuentas` a `main`, cambiar la Production branch a `main` y dejar en GitHub Pages solo la
  redirección a la dirección nueva (o desactivar GitHub Pages).
- Guardar copia de los contratos de tratamiento de datos (DPA) de Supabase, Cloudflare y Google.

## Actualizaciones
### 2026-11-08 · límites, respaldo y limpieza
1. **Supabase → SQL Editor:** pegar otra vez todo `docs/supabase-cuentas.sql` y **Run**. Se puede repetir sin
   perder datos. Agrega `limpieza_diaria()`, cambia la tarea de pg_cron y cierra los permisos por defecto.
2. **Supabase → Project Settings → API Keys:** borrar la Publishable key vieja ("default") y desactivar las
   legacy (anon y service_role). Quedan solo las que se llaman "cloudflare".
3. **Solo si algún día se usa un dominio propio** (las reglas del WAF van por dominio y `*.pages.dev` es de
   Cloudflare): Security → WAF → Rate limiting rules → Create rule (el plan gratis trae una). Si la ruta contiene
   `/api/`, contar por IP, 120 pedidos cada 10 segundos, Block 10 segundos. Mientras tanto, los límites del
   servidor (`TOPES_POR_IP` y `permitir`) hacen ese trabajo.

## Probar en local
```bash
npm install --prefix .herramientas wrangler@3.114.17
node tests/supabase-falso.cjs 54321 &      # Supabase de mentira en 127.0.0.1:54321
tests/servidor-local.sh                    # el sitio en http://127.0.0.1:8788
tests/correr.sh tests/cuentas.cjs capturas
tests/correr.sh tests/e2e.cjs capturas
tests/correr.sh tests/pantallas.cjs capturas
tests/correr.sh tests/respaldo.cjs capturas  # la Hot Wheels Wiki caída: búsqueda y museo con Wikipedia
tests/correr.sh tests/limites.cjs            # límites por IP, por IP + correo y por correo
tests/sql/probar.sh                        # el SQL en un PostgreSQL desechable
```
Los códigos de la simulación se leen en `http://127.0.0.1:54321/__correo?email=...`.
