/* Supabase de mentira para las pruebas: imita las respuestas de Auth (registro, códigos,
   sesiones, 2FA con TOTP) y de las funciones SQL de docs/supabase-cuentas.sql, con las
   mismas reglas (dueño, nivel de sesión, validación). Escucha solo en 127.0.0.1.
   Extras de prueba: GET /__correo?email=  (último código enviado) y POST /__regalo. */
const http = require('http');
const crypto = require('crypto');

const PUBLICA = 'sb_publishable_prueba';
const SECRETA = 'sb_secret_prueba';

const usuarios = new Map();      // correo -> usuario
const sesiones = new Map();      // access token -> { id, aal }
const renovaciones = new Map();  // refresh token -> { id, aal }
const correos = new Map();       // correo -> último código
const garajes = [];              // { id, dueno, autos, fondo, actualizado }
const intentos = [];
const autorizaciones = [];
const retos = new Map();
const ajustes = { autoconfirmar: false }; /* como apagar "Confirm email" en Supabase */

const b64u = (b) => Buffer.from(b).toString('base64url');
function jwt(id, aal) {
  return `${b64u('{"alg":"HS256"}')}.${b64u(JSON.stringify({ sub: id, aal, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' }))}.${crypto.randomBytes(16).toString('base64url')}`;
}
function nuevaSesion(u, aal = 'aal1') {
  const access_token = jwt(u.id, aal);
  const refresh_token = crypto.randomBytes(16).toString('hex');
  sesiones.set(access_token, { id: u.id, aal });
  renovaciones.set(refresh_token, { id: u.id, aal });
  return { access_token, refresh_token, expires_in: 3600, token_type: 'bearer', user: vista(u) };
}
const vista = (u) => ({ id: u.id, email: u.email, factors: u.factores.map((f) => ({ id: f.id, status: f.status, factor_type: 'totp' })) });
const porId = (id) => [...usuarios.values()].find((u) => u.id === id);
const codigo6 = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

/* TOTP (RFC 6238) para comprobar los códigos de la app. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function deBase32(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secreto, paso = Math.floor(Date.now() / 30000)) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(paso));
  const h = crypto.createHmac('sha1', deBase32(secreto)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
const totpValido = (secreto, code) => [-1, 0, 1].some((d) => totp(secreto, Math.floor(Date.now() / 30000) + d) === code);

const FOTO = /^(https:\/\/(static\.wikia\.nocookie\.net|upload\.wikimedia\.org|thumb\.wikimedia\.org)\/[^\s"<>]{1,600})?$/;
const CLAVES = ['clave', 'titulo', 'foto', 'anio', 'fotoReal', 'color', 'serie'];
function autosValidos(a) {
  return Array.isArray(a) && a.length <= 300 && JSON.stringify(a).length <= 300000 && a.every((e) =>
    e && typeof e === 'object' && !Array.isArray(e) && typeof e.titulo === 'string' && e.titulo.length >= 1 && e.titulo.length <= 200
    && Object.keys(e).every((k) => CLAVES.includes(k))
    && (e.clave ?? '').length <= 400 && (e.color ?? '').length <= 60 && (e.serie ?? '').length <= 120
    && /^(\d{4})?$/.test(e.anio ?? '') && FOTO.test(e.foto ?? '') && FOTO.test(e.fotoReal ?? ''));
}

function servidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let cuerpo = '';
    for await (const c of req) cuerpo += c;
    let d = {};
    try { d = cuerpo ? JSON.parse(cuerpo) : {}; } catch { /* vacío */ }
    const enviar = (estado, datos) => { res.writeHead(estado, { 'Content-Type': 'application/json' }); res.end(datos === undefined ? '' : JSON.stringify(datos)); };
    const pg = (estado, code) => enviar(estado, { code, message: code });

    /* ----- solo para las pruebas ----- */
    if (url.pathname === '/__correo') return enviar(200, { codigo: correos.get(url.searchParams.get('email')) || '' });
    if (url.pathname === '/__totp') return enviar(200, { codigo: totp(url.searchParams.get('secreto')) });
    if (url.pathname === '/__regalo') {
      const g = { id: crypto.randomUUID(), dueno: null, autos: d.autos || [], fondo: 'pista', actualizado: new Date().toISOString() };
      garajes.push(g);
      return enviar(200, { id: g.id });
    }
    if (url.pathname === '/__ajustes') { Object.assign(ajustes, d); return enviar(200, ajustes); }
    if (url.pathname === '/__estado') return enviar(200, { autorizaciones, intentos: intentos.length, usuarios: usuarios.size });

    const apikey = req.headers.apikey;
    if (apikey !== PUBLICA && apikey !== SECRETA) return enviar(401, { message: 'Invalid API key' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const s = sesiones.get(token);
    const u = s ? porId(s.id) : null;

    /* ----- Auth ----- */
    const ruta = url.pathname;
    if (ruta === '/auth/v1/signup') {
      const existente = usuarios.get(d.email);
      if (/contrasena1/i.test(d.password || '')) return enviar(422, { error_code: 'weak_password', msg: 'weak' });
      if (existente?.confirmado) return enviar(200, { id: crypto.randomUUID(), email: d.email });
      /* Como GoTrue: si el correo ya existe sin confirmar, NO cambia la contraseña; solo manda
         otro código. */
      if (existente) { correos.set(d.email, (existente.codigo = codigo6())); return enviar(200, { id: existente.id, email: d.email }); }
      const nuevo = { id: crypto.randomUUID(), email: d.email, factores: [], clave: d.password, confirmado: ajustes.autoconfirmar };
      usuarios.set(d.email, nuevo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.data?.politica_version || '')) autorizaciones.push({ usuario: nuevo.id, version: d.data.politica_version });
      if (ajustes.autoconfirmar) return enviar(200, nuevaSesion(nuevo));
      correos.set(d.email, (nuevo.codigo = codigo6()));
      return enviar(200, { id: nuevo.id, email: d.email });
    }
    if (ruta === '/auth/v1/resend') {
      const x = usuarios.get(d.email);
      if (x && !x.confirmado) correos.set(d.email, (x.codigo = codigo6()));
      return enviar(200, {});
    }
    if (ruta === '/auth/v1/verify') {
      const x = usuarios.get(d.email);
      if (d.type === 'email' && x && !x.confirmado && x.codigo === d.token) { x.confirmado = true; x.codigo = null; return enviar(200, nuevaSesion(x)); }
      if (d.type === 'recovery' && x && x.recuperar === d.token) { x.recuperar = null; return enviar(200, nuevaSesion(x)); }
      return enviar(403, { error_code: 'otp_expired' });
    }
    if (ruta === '/auth/v1/recover') {
      const x = usuarios.get(d.email);
      if (x?.confirmado) correos.set(d.email, (x.recuperar = codigo6()));
      return enviar(200, {});
    }
    if (ruta === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const x = usuarios.get(d.email);
        if (!x || x.clave !== d.password) return enviar(400, { error_code: 'invalid_credentials' });
        if (!x.confirmado) return enviar(400, { error_code: 'email_not_confirmed' });
        return enviar(200, nuevaSesion(x));
      }
      const r = renovaciones.get(d.refresh_token);
      if (!r) return enviar(400, { error_code: 'refresh_token_not_found' });
      renovaciones.delete(d.refresh_token);
      return enviar(200, nuevaSesion(porId(r.id), r.aal));
    }
    if (ruta === '/auth/v1/logout') {
      if (url.searchParams.get('scope') === 'global' && s) for (const [t, v] of sesiones) if (v.id === s.id) sesiones.delete(t);
      sesiones.delete(token);
      return enviar(204);
    }
    if (!u && ruta.startsWith('/auth/v1/')) return enviar(401, { error_code: 'bad_jwt' });
    if (ruta === '/auth/v1/user' && req.method === 'GET') return enviar(200, vista(u));
    if (ruta === '/auth/v1/user' && req.method === 'PUT') {
      if (u.factores.some((f) => f.status === 'verified') && s.aal !== 'aal2') return enviar(401, { error_code: 'insufficient_aal' });
      if (d.password === u.clave) return enviar(422, { error_code: 'same_password' });
      u.clave = d.password;
      return enviar(200, vista(u));
    }
    if (ruta === '/auth/v1/factors' && req.method === 'POST') {
      const f = { id: crypto.randomUUID(), status: 'unverified', secreto: [...crypto.randomBytes(20)].map((b) => B32[b % 32]).join('') };
      u.factores.push(f);
      return enviar(200, { id: f.id, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', secret: f.secreto, uri: 'otpauth://x' } });
    }
    const mf = /^\/auth\/v1\/factors\/([0-9a-f-]+)(\/challenge|\/verify)?$/.exec(ruta);
    if (mf) {
      const f = u.factores.find((x) => x.id === mf[1]);
      if (!f) return enviar(404, { error_code: 'mfa_factor_not_found' });
      if (mf[2] === '/challenge') { const id = crypto.randomUUID(); retos.set(id, f.id); return enviar(200, { id }); }
      if (mf[2] === '/verify') {
        if (retos.get(d.challenge_id) !== f.id || !totpValido(f.secreto, d.code)) return enviar(422, { error_code: 'mfa_verification_failed' });
        retos.delete(d.challenge_id);
        f.status = 'verified';
        return enviar(200, nuevaSesion(u, 'aal2'));
      }
      if (req.method === 'DELETE') {
        if (f.status === 'verified' && s.aal !== 'aal2') return enviar(401, { error_code: 'insufficient_aal' });
        u.factores = u.factores.filter((x) => x !== f);
        return enviar(200, { id: f.id });
      }
    }

    /* ----- funciones SQL ----- */
    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(ruta)?.[1];
    if (rpc === 'permitir_intento') {
      if (apikey !== SECRETA) return pg(401, '42501');
      const ahora = Date.now();
      const n = intentos.filter((x) => x.clave === d.p_clave && ahora - x.t < d.p_segundos * 1000).length;
      if (n >= d.p_max) return enviar(200, false);
      if (d.p_anotar !== false) intentos.push({ clave: d.p_clave, t: ahora });
      return enviar(200, true);
    }
    if (rpc) {
      if (!u) return enviar(401, { code: 'PGRST301', message: 'JWT' });
      const completa = s.aal === 'aal2' || !u.factores.some((f) => f.status === 'verified');
      if (!completa) return pg(403, '42501');
      let mio = garajes.find((g) => g.dueno === u.id);
      const asegurar = () => { if (!mio) { mio = { id: crypto.randomUUID(), dueno: u.id, autos: [], fondo: 'pista', actualizado: new Date().toISOString() }; garajes.push(mio); } };
      if (rpc === 'mi_garaje') { asegurar(); return enviar(200, { autos: mio.autos, fondo: mio.fondo, actualizado: mio.actualizado }); }
      if (rpc === 'guardar_mi_garaje') {
        if (!autosValidos(d.p_autos)) return pg(400, '22023');
        asegurar();
        Object.assign(mio, { autos: d.p_autos, fondo: /^(pista|taller|noche|desierto|estudio)$/.test(d.p_fondo) ? d.p_fondo : 'pista', actualizado: new Date().toISOString() });
        return enviar(200, mio.actualizado);
      }
      if (rpc === 'reclamar_garaje') {
        const regalo = garajes.find((g) => g.id === d.p_id);
        if (!regalo || (regalo.dueno && regalo.dueno !== u.id)) return pg(404, 'P0002');
        if (regalo.dueno === u.id) return enviar(200, { reclamado: false });
        if (mio) {
          const vistos = new Set(regalo.autos.map((a) => a.clave));
          regalo.autos = [...regalo.autos, ...mio.autos.filter((a) => !vistos.has(a.clave))].slice(0, 300);
          garajes.splice(garajes.indexOf(mio), 1);
        }
        regalo.dueno = u.id;
        return enviar(200, { reclamado: true });
      }
      if (rpc === 'borrar_mi_cuenta') {
        if (mio) garajes.splice(garajes.indexOf(mio), 1);
        usuarios.delete(u.email);
        for (const [t, v] of sesiones) if (v.id === u.id) sesiones.delete(t);
        return enviar(204);
      }
    }
    enviar(404, { message: 'no existe en el simulador' });
  });
}

module.exports = { servidor, PUBLICA, SECRETA, totp };

if (require.main === module) {
  const puerto = Number(process.argv[2] || 54321);
  servidor().listen(puerto, '127.0.0.1', () => console.log(`Supabase falso en 127.0.0.1:${puerto}`));
}
