/* Servidor del garaje: corre en Cloudflare (functions/api/[[ruta]].js) y es lo único
   que habla con Supabase. La sesión vive en cookies HttpOnly que el navegador guarda pero
   ningún script de la página puede leer. Variables de entorno (en Cloudflare):
   SUPABASE_URL, SUPABASE_CLAVE_PUBLICA y SUPABASE_CLAVE_SECRETA (esta última como Secret). */

export const POLITICA_VERSION = '2026-11-02';

const COOKIE_ACCESO = '__Host-garaje_s';
const COOKIE_RENOVAR = '__Host-garaje_r';
const COOKIE_RECUPERAR = '__Host-garaje_rec';
const TREINTA_DIAS = 60 * 60 * 24 * 30;

const CORREO = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,24}$/;
const CODIGO = /^\d{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* ---------- respuestas ---------- */

function responder(datos, estado = 200, cookies = []) {
  const h = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(JSON.stringify(datos), { status: estado, headers: h });
}
const error = (mensaje, estado = 400, extra = {}, cookies = []) => responder({ error: mensaje, ...extra }, estado, cookies);

function cookie(nombre, valor, maxAge) {
  return `${nombre}=${valor}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
const cookiesDeSesion = (s) => [cookie(COOKIE_ACCESO, s.access_token, TREINTA_DIAS), cookie(COOKIE_RENOVAR, s.refresh_token, TREINTA_DIAS)];
const cookiesBorradas = () => [cookie(COOKIE_ACCESO, '', 0), cookie(COOKIE_RENOVAR, '', 0), cookie(COOKIE_RECUPERAR, '', 0)];

function leerCookies(request) {
  const salida = {};
  (request.headers.get('Cookie') || '').split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  });
  return salida;
}

/* ---------- entradas ---------- */

async function cuerpoJSON(request, maximo = 4096) {
  if (Number(request.headers.get('Content-Length') || 0) > maximo) throw new ErrorEntrada('El envío es demasiado grande.', 413);
  const texto = await request.text();
  if (texto.length > maximo) throw new ErrorEntrada('El envío es demasiado grande.', 413);
  try {
    const datos = JSON.parse(texto || '{}');
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error();
    return datos;
  } catch { throw new ErrorEntrada('Formato inválido.'); }
}

class ErrorEntrada extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

function correoValido(v) {
  const c = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (c.length > 254 || !CORREO.test(c)) throw new ErrorEntrada('Escribe un correo válido.');
  return c;
}

/* bcrypt (lo que usa Supabase) solo mira los primeros 72 bytes: más largo no suma nada. */
function claveValida(v) {
  if (typeof v !== 'string') throw new ErrorEntrada('Escribe una contraseña.');
  const bytes = new TextEncoder().encode(v).length;
  if (v.length < 10) throw new ErrorEntrada('La contraseña necesita al menos 10 caracteres.');
  if (bytes > 72) throw new ErrorEntrada('La contraseña es demasiado larga (máximo 72 caracteres).');
  if (!/\p{L}/u.test(v) || !/\d/.test(v)) throw new ErrorEntrada('La contraseña necesita letras y números.');
  return v;
}

function codigoValido(v) {
  const c = typeof v === 'string' ? v.replace(/\s/g, '') : '';
  if (!CODIGO.test(c)) throw new ErrorEntrada('El código son 6 números.');
  return c;
}

/* ---------- Supabase ---------- */

function configuracion(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const local = env.MODO_PRUEBA === '1' && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(url);
  if (!(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || local)) return null;
  const publica = String(env.SUPABASE_CLAVE_PUBLICA || '');
  const secreta = String(env.SUPABASE_CLAVE_SECRETA || '');
  /* Si alguien cruza las claves al configurar, el servidor no arranca en vez de usar la
     secreta donde va la pública. */
  const rol = (clave) => (clave.startsWith('eyJ') ? reclamos(clave).role : '');
  const publicaOk = publica.startsWith('sb_publishable_') || rol(publica) === 'anon';
  const secretaOk = secreta.startsWith('sb_secret_') || rol(secreta) === 'service_role';
  if (!publicaOk || !secretaOk) return null;
  return { url, publica, secreta };
}

/* Las llamadas de Auth sin sesión (registro, códigos, entrar) van con la clave secreta y la
   IP real del visitante en Sb-Forwarded-For. Así los límites de Supabase cuentan por persona
   y no por las IPs de Cloudflare, que comparten todos los visitantes. */
async function supa(cfg, ruta, { metodo = 'POST', cuerpo, token, secreta = false, ip = '' } = {}) {
  const clave = secreta || ip ? cfg.secreta : cfg.publica;
  const h = { 'Content-Type': 'application/json', apikey: clave };
  if (token) h.Authorization = `Bearer ${token}`;
  else if (clave.startsWith('eyJ')) h.Authorization = `Bearer ${clave}`;
  if (ip) h['Sb-Forwarded-For'] = ip;
  let r;
  try {
    r = await fetch(cfg.url + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  } catch {
    return { ok: false, status: 503, datos: null };
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* respuesta vacía */ }
  return { ok: r.ok, status: r.status, datos };
}

const codigoError = (datos) => String(datos?.error_code || datos?.code || datos?.error || '');

function reclamos(token) {
  try {
    const parte = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(parte + '='.repeat((4 - (parte.length % 4)) % 4)));
  } catch { return {}; }
}

/* Lee la sesión de las cookies. Si el token está por vencer lo renueva. Los datos del token
   solo se usan para decidir si renovar; quien decide qué se puede hacer es Supabase. */
async function sesion(request, cfg) {
  const c = leerCookies(request);
  const acceso = c[COOKIE_ACCESO], renovar = c[COOKIE_RENOVAR];
  if (!acceso || !renovar) return null;
  const vence = Number(reclamos(acceso).exp || 0);
  if (vence - Date.now() / 1000 > 60) return { token: acceso, cookies: [] };
  const r = await supa(cfg, '/auth/v1/token?grant_type=refresh_token', { cuerpo: { refresh_token: renovar }, ip: ipReal(request) });
  if (r.ok && r.datos?.access_token) return { token: r.datos.access_token, cookies: cookiesDeSesion(r.datos) };
  /* Solo se cierra la sesión si Supabase la rechaza. Si está ocupado o caído, se conserva. */
  if ([400, 401, 403].includes(r.status)) return { token: null, cookies: cookiesBorradas() };
  return { token: null, cookies: [], temporal: true };
}

async function usuarioDe(cfg, token) {
  const u = await supa(cfg, '/auth/v1/user', { metodo: 'GET', token });
  if (u.ok && u.datos?.id) return { usuario: u.datos };
  return { cerrada: [401, 403].includes(u.status) };
}
const sesionCerrada = () => error('Tu sesión se cerró. Vuelve a entrar.', 401, {}, cookiesBorradas());
const ocupado = (cookies = []) => error('El servicio está ocupado. Intenta de nuevo en un momento.', 503, {}, cookies);

const factoresVerificados = (usuario) => (usuario?.factors || []).filter((f) => f.status === 'verified' && f.factor_type === 'totp');

/* ---------- límite de intentos ---------- */

async function huella(cfg, texto) {
  const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.secreta), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Cada regla es [qué se cuenta, máximo, ventana en segundos, 'fallos']. Las reglas marcadas
   'fallos' solo suman cuando el intento sale mal (anotarFallo); así nadie bloquea la cuenta
   de otra persona solo por saber su correo. La IP y el correo nunca se guardan en claro: se
   guarda una huella. Si la base no responde, no se deja pasar. */
async function permitir(cfg, accion, reglas) {
  for (const [parte, maximo, segundos, tipo] of reglas) {
    const clave = `${accion}:${await huella(cfg, parte)}`;
    const r = await supa(cfg, '/rest/v1/rpc/permitir_intento', { secreta: true, cuerpo: { p_clave: clave, p_max: maximo, p_segundos: segundos, p_anotar: tipo !== 'fallos' } });
    if (!r.ok || r.datos !== true) {
      console.warn(JSON.stringify({ evento: 'limite', accion, estado: r.status }));
      return false;
    }
  }
  return true;
}
async function anotarFallo(cfg, accion, reglas) {
  for (const [parte, , segundos, tipo] of reglas) {
    if (tipo !== 'fallos') continue;
    const clave = `${accion}:${await huella(cfg, parte)}`;
    await supa(cfg, '/rest/v1/rpc/permitir_intento', { secreta: true, cuerpo: { p_clave: clave, p_max: 1000000, p_segundos: segundos, p_anotar: true } });
  }
}

const ipReal = (request) => request.headers.get('CF-Connecting-IP') || '';
/* Para los límites, una IPv6 cuenta por su red /64: cambiar de dirección dentro de la misma
   red no da intentos nuevos. */
function ipDe(request) {
  const ip = ipReal(request) || 'sin-ip';
  if (!ip.includes(':')) return ip;
  const [cabeza, cola = ''] = ip.toLowerCase().split('::');
  const a = cabeza ? cabeza.split(':') : [];
  const b = cola ? cola.split(':') : [];
  const grupos = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return `${grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
/* Lo que no hace falta esperar (mandar un correo) se hace después de responder, para que la
   respuesta tarde lo mismo exista o no la cuenta. */
function despues(ctx, promesa) {
  if (ctx?.waitUntil) ctx.waitUntil(promesa.catch(() => {}));
  else return promesa.catch(() => {});
}
const demasiados = () => error('Demasiados intentos. Espera unos minutos y vuelve a probar.', 429);

/* ---------- acciones ---------- */

async function registro(request, cfg, s, ctx) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  const clave = claveValida(d.clave);
  if (d.acepto !== true || d.version !== POLITICA_VERSION) throw new ErrorEntrada('Para crear la cuenta tienes que aceptar la política de datos.');
  const ip = ipDe(request);
  if (!(await permitir(cfg, 'registro', [[ip, 5, 3600], [correo, 3, 3600]]))) return demasiados();

  /* La versión aceptada viaja con el registro y la base la anota sola como prueba de la
     autorización. Misma respuesta y mismo tiempo exista o no la cuenta. */
  await despues(ctx, supa(cfg, '/auth/v1/signup', { cuerpo: { email: correo, password: clave, data: { politica_version: POLITICA_VERSION } }, ip: ipReal(request) }));
  return responder({ ok: true });
}

/* Al confirmar el correo se vuelve a fijar la contraseña de quien confirma. Si otra persona
   se registró antes con ese correo y su propia contraseña, Supabase la conserva: sin este
   paso, esa persona podría entrar a la cuenta apenas el dueño real la confirme. */
async function verificar(request, cfg) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  const codigo = codigoValido(d.codigo);
  if (typeof d.clave !== 'string' || !d.clave || d.clave.length > 200) throw new ErrorEntrada('Vuelve a escribir tu contraseña.');
  if (!(await permitir(cfg, 'verificar', [[correo, 8, 900], [ipDe(request), 30, 900]]))) return demasiados();
  const r = await supa(cfg, '/auth/v1/verify', { cuerpo: { type: 'email', email: correo, token: codigo }, ip: ipReal(request) });
  if (!r.ok || !r.datos?.access_token) return error('El código no es correcto o ya venció.');
  const cambio = await cambiarClave(cfg, r.datos.access_token, d.clave);
  if (!cambio.ok && cambio.codigo !== 'same_password') {
    await supa(cfg, '/auth/v1/logout?scope=global', { token: r.datos.access_token });
    return error('Tu correo quedó confirmado, pero no se pudo guardar tu contraseña. Usa "Olvidé mi contraseña".', 400, {}, cookiesBorradas());
  }
  return responder({ ok: true }, 200, cookiesDeSesion(r.datos));
}

async function reenviar(request, cfg, s, ctx) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  if (!(await permitir(cfg, 'reenviar', [[correo, 3, 3600], [ipDe(request), 10, 3600]]))) return demasiados();
  await despues(ctx, supa(cfg, '/auth/v1/resend', { cuerpo: { type: 'signup', email: correo }, ip: ipReal(request) }));
  return responder({ ok: true });
}

async function entrar(request, cfg) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  if (typeof d.clave !== 'string' || !d.clave || d.clave.length > 200) throw new ErrorEntrada('Escribe tu contraseña.');
  const ip = ipDe(request);
  const reglas = [[`${ip}|${correo}`, 5, 900, 'fallos'], [correo, 15, 3600, 'fallos'], [ip, 30, 900]];
  if (!(await permitir(cfg, 'entrar', reglas))) return demasiados();

  const r = await supa(cfg, '/auth/v1/token?grant_type=password', { cuerpo: { email: correo, password: d.clave }, ip: ipReal(request) });
  if (!r.ok || !r.datos?.access_token) {
    const codigo = codigoError(r.datos);
    console.warn(JSON.stringify({ evento: 'entrar_fallido', motivo: codigo || r.status }));
    if (codigo === 'email_not_confirmed') return error('Te falta confirmar el correo con el código que te enviamos.', 403, { pendiente: 'verificar' });
    if (r.status === 429) return demasiados();
    if (r.status >= 500) return ocupado();
    await anotarFallo(cfg, 'entrar', reglas);
    return error('Correo o contraseña incorrectos.', 401);
  }
  const necesita2fa = factoresVerificados(r.datos.user).length > 0;
  return responder({ ok: true, necesita2fa }, 200, cookiesDeSesion(r.datos));
}

/* Pide el reto del factor y lo verifica. Devuelve la sesión nueva (aal2) o null. */
async function pasarCodigo2fa(cfg, token, codigo, usuario) {
  const factor = factoresVerificados(usuario)[0];
  if (!factor) return { sinFactor: true };
  const reto = await supa(cfg, `/auth/v1/factors/${encodeURIComponent(factor.id)}/challenge`, { token, cuerpo: {} });
  if (!reto.ok || !reto.datos?.id) return { sesion: null };
  const v = await supa(cfg, `/auth/v1/factors/${encodeURIComponent(factor.id)}/verify`, { token, cuerpo: { challenge_id: reto.datos.id, code: codigo } });
  return { sesion: v.ok && v.datos?.access_token ? v.datos : null, factor };
}

/* El límite del código de la app se cuenta por la cuenta que Supabase confirma, no por lo
   que diga el token antes de validarlo. */
async function preparar2fa(request, cfg, s) {
  const { usuario, cerrada } = await usuarioDe(cfg, s.token);
  if (!usuario) return { respuesta: cerrada ? sesionCerrada() : ocupado(s.cookies) };
  const reglas = [[usuario.id, 5, 900, 'fallos'], [ipDe(request), 30, 900]];
  if (!(await permitir(cfg, '2fa', reglas))) return { respuesta: demasiados() };
  return { usuario, reglas };
}

async function entrar2fa(request, cfg, s) {
  const d = await cuerpoJSON(request);
  const codigo = codigoValido(d.codigo);
  const { usuario, reglas, respuesta } = await preparar2fa(request, cfg, s);
  if (respuesta) return respuesta;
  const { sesion: nueva } = await pasarCodigo2fa(cfg, s.token, codigo, usuario);
  if (!nueva) {
    await anotarFallo(cfg, '2fa', reglas);
    return error('El código no es correcto. Mira la app otra vez; cambia cada 30 segundos.', 400, {}, s.cookies);
  }
  return responder({ ok: true }, 200, cookiesDeSesion(nueva));
}

async function yo(request, cfg, s) {
  if (s?.temporal) return ocupado();
  if (!s?.token) return responder({ conectado: false }, 200, s?.cookies || []);
  const { usuario, cerrada } = await usuarioDe(cfg, s.token);
  if (!usuario) return cerrada ? responder({ conectado: false }, 200, cookiesBorradas()) : ocupado(s.cookies);
  const dosPasos = factoresVerificados(usuario).length > 0;
  const completa = !dosPasos || reclamos(s.token).aal === 'aal2';
  return responder({ conectado: true, correo: usuario.email, dosPasos, completa }, 200, s.cookies);
}

async function salir(request, cfg, s) {
  if (s?.token) await supa(cfg, '/auth/v1/logout?scope=local', { token: s.token });
  return responder({ ok: true }, 200, cookiesBorradas());
}

async function olvide(request, cfg, s, ctx) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  if (!(await permitir(cfg, 'olvide', [[correo, 5, 3600], [ipDe(request), 10, 3600]]))) return demasiados();
  await despues(ctx, supa(cfg, '/auth/v1/recover', { cuerpo: { email: correo }, ip: ipReal(request) }));
  return responder({ ok: true });
}

async function cambiarClave(cfg, token, clave) {
  const r = await supa(cfg, '/auth/v1/user', { metodo: 'PUT', token, cuerpo: { password: clave } });
  if (r.ok) return { ok: true };
  const codigo = codigoError(r.datos);
  const mensaje = codigo === 'weak_password' ? 'Esa contraseña es muy fácil de adivinar. Prueba con otra.'
    : codigo === 'same_password' ? 'La contraseña nueva tiene que ser distinta de la anterior.'
      : 'No se pudo cambiar la contraseña. Intenta de nuevo.';
  return { ok: false, codigo, mensaje };
}

/* Recuperar la contraseña: el código del correo inicia una sesión. Si la cuenta tiene 2FA,
   antes de cambiar la contraseña también se pide el código de la app (paso 2). */
async function restablecer(request, cfg) {
  const d = await cuerpoJSON(request);
  const correo = correoValido(d.correo);
  const codigo = codigoValido(d.codigo);
  const clave = claveValida(d.clave);
  if (!(await permitir(cfg, 'restablecer', [[correo, 8, 900], [ipDe(request), 30, 900]]))) return demasiados();
  const v = await supa(cfg, '/auth/v1/verify', { cuerpo: { type: 'recovery', email: correo, token: codigo }, ip: ipReal(request) });
  if (!v.ok || !v.datos?.access_token) return error('El código no es correcto o ya venció.');
  const { usuario } = await usuarioDe(cfg, v.datos.access_token);
  if (factoresVerificados(usuario || v.datos.user).length) {
    return responder({ ok: false, necesita2fa: true }, 200, [...cookiesDeSesion(v.datos), cookie(COOKIE_RECUPERAR, '1', 600)]);
  }
  const cambio = await cambiarClave(cfg, v.datos.access_token, clave);
  if (!cambio.ok) return error(cambio.mensaje, 400, {}, cookiesDeSesion(v.datos));
  return responder({ ok: true }, 200, cookiesDeSesion(v.datos));
}

async function restablecer2fa(request, cfg, s) {
  if (leerCookies(request)[COOKIE_RECUPERAR] !== '1') return error('Vuelve a pedir el código de recuperación.', 403);
  const d = await cuerpoJSON(request);
  const codigo = codigoValido(d.codigo);
  const clave = claveValida(d.clave);
  const { usuario, reglas, respuesta } = await preparar2fa(request, cfg, s);
  if (respuesta) return respuesta;
  const { sesion: nueva } = await pasarCodigo2fa(cfg, s.token, codigo, usuario);
  if (!nueva) {
    await anotarFallo(cfg, '2fa', reglas);
    return error('El código de la app no es correcto.', 400, {}, s.cookies);
  }
  const cambio = await cambiarClave(cfg, nueva.access_token, clave);
  if (!cambio.ok) return error(cambio.mensaje, 400, {}, cookiesDeSesion(nueva));
  return responder({ ok: true }, 200, [...cookiesDeSesion(nueva), cookie(COOKIE_RECUPERAR, '', 0)]);
}

/* Errores de la base: 42501 = sesión sin el segundo paso; 22023 = lista inválida. */
function errorDeBase(r, cookies) {
  const codigo = codigoError(r.datos);
  if (r.status === 401) return error('Tu sesión se cerró. Vuelve a entrar.', 401, {}, cookiesBorradas());
  if (codigo === '42501') return error('Falta el código de doble paso.', 403, { necesita2fa: true }, cookies);
  if (codigo === '22023') return error('La lista tiene datos que no se pueden guardar.', 400, {}, cookies);
  if (codigo === 'P0002') return error('Ese enlace de regalo ya no es válido.', 404, {}, cookies);
  return error('No se pudo conectar con la base de datos.', 502, {}, cookies);
}

async function leerGaraje(request, cfg, s) {
  const r = await supa(cfg, '/rest/v1/rpc/mi_garaje', { token: s.token, cuerpo: {} });
  if (!r.ok) return errorDeBase(r, s.cookies);
  const g = r.datos || {};
  return responder({ autos: Array.isArray(g.autos) ? g.autos : [], fondo: g.fondo || 'pista', actualizado: g.actualizado || '' }, 200, s.cookies);
}

async function guardarGaraje(request, cfg, s) {
  const d = await cuerpoJSON(request, 320000);
  if (!Array.isArray(d.autos) || d.autos.length > 300) throw new ErrorEntrada('Lista inválida.');
  const fondo = typeof d.fondo === 'string' ? d.fondo.slice(0, 20) : 'pista';
  const r = await supa(cfg, '/rest/v1/rpc/guardar_mi_garaje', { token: s.token, cuerpo: { p_autos: d.autos, p_fondo: fondo } });
  if (!r.ok) return errorDeBase(r, s.cookies);
  return responder({ actualizado: r.datos }, 200, s.cookies);
}

async function reclamar(request, cfg, s) {
  const d = await cuerpoJSON(request);
  const id = typeof d.codigo === 'string' ? d.codigo.trim().toLowerCase() : '';
  if (!UUID.test(id)) throw new ErrorEntrada('Ese enlace de regalo no es válido.');
  const quien = reclamos(s.token).sub || 'x';
  if (!(await permitir(cfg, 'reclamar', [[quien, 10, 3600]]))) return demasiados();
  const r = await supa(cfg, '/rest/v1/rpc/reclamar_garaje', { token: s.token, cuerpo: { p_id: id } });
  if (!r.ok) return errorDeBase(r, s.cookies);
  return responder({ ok: true, reclamado: Boolean(r.datos?.reclamado) }, 200, s.cookies);
}

async function activar2fa(request, cfg, s) {
  const { usuario, cerrada } = await usuarioDe(cfg, s.token);
  if (!usuario) return cerrada ? sesionCerrada() : ocupado(s.cookies);
  if (factoresVerificados(usuario).length) return error('La verificación en dos pasos ya está activa.', 409, {}, s.cookies);
  /* Si alguien empezó a activarla y no terminó, ese intento se borra antes de crear otro. */
  for (const f of (usuario.factors || []).filter((x) => x.status !== 'verified')) {
    await supa(cfg, `/auth/v1/factors/${encodeURIComponent(f.id)}`, { metodo: 'DELETE', token: s.token });
  }
  const r = await supa(cfg, '/auth/v1/factors', { token: s.token, cuerpo: { factor_type: 'totp', friendly_name: 'Garaje 1:64', issuer: 'Garaje 1:64' } });
  const qr = String(r.datos?.totp?.qr_code || '');
  if (!r.ok || !r.datos?.id || !qr.startsWith('data:image/svg+xml')) return error('No se pudo empezar la activación. Intenta de nuevo.', 502, {}, s.cookies);
  return responder({ id: r.datos.id, qr, secreto: String(r.datos.totp.secret || '') }, 200, s.cookies);
}

async function confirmar2fa(request, cfg, s) {
  const d = await cuerpoJSON(request);
  const codigo = codigoValido(d.codigo);
  const id = typeof d.id === 'string' && UUID.test(d.id) ? d.id : '';
  if (!id) throw new ErrorEntrada('Vuelve a empezar la activación.');
  const { reglas, respuesta } = await preparar2fa(request, cfg, s);
  if (respuesta) return respuesta;
  const reto = await supa(cfg, `/auth/v1/factors/${encodeURIComponent(id)}/challenge`, { token: s.token, cuerpo: {} });
  if (!reto.ok || !reto.datos?.id) return error('Vuelve a empezar la activación.', 400, {}, s.cookies);
  const v = await supa(cfg, `/auth/v1/factors/${encodeURIComponent(id)}/verify`, { token: s.token, cuerpo: { challenge_id: reto.datos.id, code: codigo } });
  if (!v.ok || !v.datos?.access_token) {
    await anotarFallo(cfg, '2fa', reglas);
    return error('El código no es correcto. Revisa que la hora del celular esté bien.', 400, {}, s.cookies);
  }
  return responder({ ok: true }, 200, cookiesDeSesion(v.datos));
}

async function quitar2fa(request, cfg, s) {
  const d = await cuerpoJSON(request);
  const codigo = codigoValido(d.codigo);
  const { usuario, reglas, respuesta } = await preparar2fa(request, cfg, s);
  if (respuesta) return respuesta;
  const { sesion: nueva, factor, sinFactor } = await pasarCodigo2fa(cfg, s.token, codigo, usuario);
  if (sinFactor) return error('La verificación en dos pasos no está activa.', 409, {}, s.cookies);
  if (!nueva) {
    await anotarFallo(cfg, '2fa', reglas);
    return error('El código no es correcto.', 400, {}, s.cookies);
  }
  const r = await supa(cfg, `/auth/v1/factors/${encodeURIComponent(factor.id)}`, { metodo: 'DELETE', token: nueva.access_token });
  if (!r.ok) return error('No se pudo desactivar. Intenta de nuevo.', 502, {}, cookiesDeSesion(nueva));
  return responder({ ok: true }, 200, cookiesDeSesion(nueva));
}

/* Borrar la cuenta pide la contraseña otra vez. El borrado lo hace la base con la sesión
   actual, que ya tiene el segundo paso si la cuenta usa 2FA. */
async function borrarCuenta(request, cfg, s) {
  const d = await cuerpoJSON(request);
  if (d.confirmar !== 'BORRAR') throw new ErrorEntrada('Escribe BORRAR para confirmar.');
  if (typeof d.clave !== 'string' || !d.clave || d.clave.length > 200) throw new ErrorEntrada('Escribe tu contraseña.');
  const { usuario, cerrada } = await usuarioDe(cfg, s.token);
  if (!usuario?.email) return cerrada || !usuario ? sesionCerrada() : ocupado(s.cookies);
  const reglas = [[usuario.id, 5, 900, 'fallos']];
  if (!(await permitir(cfg, 'borrar', reglas))) return demasiados();
  const prueba = await supa(cfg, '/auth/v1/token?grant_type=password', { cuerpo: { email: usuario.email, password: d.clave }, ip: ipReal(request) });
  if (!prueba.ok || prueba.datos?.user?.id !== usuario.id) {
    await anotarFallo(cfg, 'borrar', reglas);
    return error('La contraseña no es correcta.', 400, {}, s.cookies);
  }
  await supa(cfg, '/auth/v1/logout?scope=local', { token: prueba.datos.access_token });
  const r = await supa(cfg, '/rest/v1/rpc/borrar_mi_cuenta', { token: s.token, cuerpo: {} });
  if (!r.ok) return errorDeBase(r, s.cookies);
  return responder({ ok: true }, 200, cookiesBorradas());
}

/* ---------- rutas ---------- */

const RUTAS = {
  'POST registro': [registro, false],
  'POST verificar': [verificar, false],
  'POST reenviar': [reenviar, false],
  'POST entrar': [entrar, false],
  'POST olvide': [olvide, false],
  'POST restablecer': [restablecer, false],
  'GET yo': [yo, 'opcional'],
  'POST salir': [salir, 'opcional'],
  'POST 2fa/entrar': [entrar2fa, true],
  'POST 2fa/activar': [activar2fa, true],
  'POST 2fa/confirmar': [confirmar2fa, true],
  'POST 2fa/quitar': [quitar2fa, true],
  'POST restablecer/2fa': [restablecer2fa, true],
  'GET garaje': [leerGaraje, true],
  'PUT garaje': [guardarGaraje, true],
  'POST reclamar': [reclamar, true],
  'POST cuenta/borrar': [borrarCuenta, true],
};

/* Contra CSRF: además de SameSite=Strict, todo lo que cambia algo tiene que venir del
   mismo origen y con la cabecera propia de la página (un formulario de otro sitio no puede ponerla). */
function mismoOrigen(request) {
  const url = new URL(request.url);
  return request.headers.get('Origin') === url.origin && request.headers.get('X-Garaje') === '1'
    && (request.headers.get('Content-Type') || '').startsWith('application/json');
}

export async function manejar(request, env, ctx) {
  const cfg = configuracion(env);
  if (!cfg) return error('El servidor no está configurado.', 503);
  const ruta = new URL(request.url).pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  const entrada = RUTAS[`${request.method} ${ruta}`];
  if (!entrada) return error('No existe.', 404);
  if (request.method !== 'GET' && !mismoOrigen(request)) return error('Origen no permitido.', 403);
  const [accion, conSesion] = entrada;
  try {
    let s = null;
    if (conSesion) {
      s = await sesion(request, cfg);
      if (conSesion === true && s?.temporal) return ocupado();
      if (conSesion === true && !s?.token) return error('Tu sesión se cerró. Vuelve a entrar.', 401, {}, s?.cookies || []);
    }
    return await accion(request, cfg, s, ctx);
  } catch (e) {
    if (e instanceof ErrorEntrada) return error(e.message, e.estado);
    console.error(JSON.stringify({ evento: 'error', ruta, mensaje: String(e?.message || e).slice(0, 200) }));
    return error('Algo falló en el servidor. Intenta de nuevo.', 500);
  }
}
