/* Entrada al garaje: crear cuenta, confirmar el correo, entrar, recuperar la contraseña
   y el código de doble paso. También el diálogo "Tu cuenta" (2FA, salir y borrar).
   Las reglas de verdad las pone el servidor; aquí solo se avisa antes para no hacer esperar. */
import { api, ErrorApi } from './api.js';

export const POLITICA_VERSION = '2026-11-02';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const $ = (s, r = document) => r.querySelector(s);
const conMovimiento = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

const acceso = $('#acceso');
const placa = $('#placa');
const app = $('#app');
let correoActual = '';
let claveNueva = '';
/* La contraseña escrita al crear la cuenta (o al entrar sin haber confirmado) se reenvía al
   confirmar el código: así queda la de quien confirma. Solo vive en memoria. */
let claveVerificar = '';
let modoDosPasos = 'entrar';

/* ---------- link del regalo ---------- */

/* El código del link (?g=...) se guarda solo en esta pestaña hasta que la persona entre,
   y se quita de la barra de direcciones para que no termine en una captura. */
function guardarCodigoRegalo() {
  const p = new URLSearchParams(location.search);
  const g = (p.get('g') || '').trim().toLowerCase();
  if (UUID.test(g)) { try { sessionStorage.setItem('garaje164.regalo', g); } catch { /* sin almacenamiento */ } }
  if (!p.has('g')) return;
  p.delete('g');
  history.replaceState(null, '', location.pathname + (p.toString() ? `?${p}` : '') + location.hash);
}
function codigoRegalo() {
  try { const g = sessionStorage.getItem('garaje164.regalo') || ''; return UUID.test(g) ? g : ''; } catch { return ''; }
}
function olvidarRegalo() { try { sessionStorage.removeItem('garaje164.regalo'); } catch { /* nada que borrar */ } }

/* Lo que guardaba la versión sin cuentas en el navegador ya no se usa. */
function limpiarRestos() {
  try { ['garaje164.autos', 'garaje164.id', 'garaje164.respaldo', 'garaje164.fondo'].forEach((k) => localStorage.removeItem(k)); } catch { /* nada */ }
}

/* ---------- pasos de la placa ---------- */

function irA(paso, { aviso = '' } = {}) {
  placa.hidden = false;
  placa.querySelectorAll('.paso').forEach((f) => {
    const activo = f.dataset.paso === paso;
    f.hidden = !activo;
    if (activo) {
      f.reset?.();
      f.querySelector('.acceso-error').textContent = '';
      $('#acceso-titulo').textContent = f.dataset.titulo;
      f.querySelectorAll('[data-correo]').forEach((x) => { x.textContent = correoActual; });
      f.querySelectorAll('.reglas li').forEach((li) => li.classList.remove('cumple'));
      f.querySelectorAll('.solo-sin-clave').forEach((x) => { x.hidden = Boolean(claveVerificar); });
    }
  });
  const nota = $('#acceso-nota');
  const texto = aviso || (codigoRegalo() && (paso === 'entrar' || paso === 'crear')
    ? 'Abriste un garaje de regalo. Entra o crea tu cuenta para quedártelo.' : '');
  nota.textContent = texto;
  nota.hidden = !texto;
  const primero = placa.querySelector(`.paso[data-paso="${paso}"] input:not([type=checkbox])`);
  requestAnimationFrame(() => primero?.focus());
}

function datosDe(form) { return Object.fromEntries(new FormData(form)); }

/* Envía un paso: bloquea el botón mientras espera y muestra el error junto al formulario. */
function alEnviar(paso, accion) {
  const form = placa.querySelector(`.paso[data-paso="${paso}"]`);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button[type=submit]');
    const error = form.querySelector('.acceso-error');
    error.textContent = '';
    const texto = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Un momento…';
    try {
      await accion(datosDe(form), form);
    } catch (err) {
      error.textContent = err instanceof ErrorApi || err instanceof Error ? err.message : 'Algo falló. Intenta de nuevo.';
      form.querySelector('input:not([type=checkbox])')?.focus();
    } finally {
      boton.disabled = false;
      boton.textContent = texto;
    }
  });
}

function revisarClave(clave) {
  if (clave.length < 10) throw new Error('La contraseña necesita al menos 10 caracteres.');
  if (new TextEncoder().encode(clave).length > 72) throw new Error('La contraseña es demasiado larga (máximo 72 caracteres).');
  if (!/\p{L}/u.test(clave) || !/\d/.test(clave)) throw new Error('La contraseña necesita letras y números.');
}

function conectarReglas() {
  placa.querySelectorAll('.reglas').forEach((ul) => {
    const campo = $(`#${ul.dataset.para}`);
    campo.addEventListener('input', () => {
      const v = campo.value;
      ul.querySelector('[data-regla="largo"]').classList.toggle('cumple', v.length >= 10);
      ul.querySelector('[data-regla="letras"]').classList.toggle('cumple', /\p{L}/u.test(v));
      ul.querySelector('[data-regla="numeros"]').classList.toggle('cumple', /\d/.test(v));
    });
  });
}

function conectarVerClave() {
  document.querySelectorAll('.ver-clave').forEach((b) => {
    b.addEventListener('click', () => {
      const campo = $(`#${b.dataset.para}`);
      const ver = campo.type === 'password';
      campo.type = ver ? 'text' : 'password';
      b.textContent = ver ? 'Ocultar' : 'Ver';
      b.setAttribute('aria-pressed', String(ver));
      campo.focus();
    });
  });
}

let esperaReenvio = 0;
function conectarReenvio(boton, accion) {
  boton.addEventListener('click', async () => {
    if (Date.now() < esperaReenvio) return;
    const error = boton.closest('form').querySelector('.acceso-error');
    try {
      await accion();
      esperaReenvio = Date.now() + 60000;
      boton.disabled = true;
      error.textContent = '';
      let quedan = 60;
      boton.textContent = `Código enviado (${quedan} s)`;
      const t = setInterval(() => {
        quedan -= 1;
        boton.textContent = `Código enviado (${quedan} s)`;
        if (quedan <= 0) { clearInterval(t); boton.disabled = false; boton.textContent = 'Enviar otro código'; }
      }, 1000);
    } catch (err) { error.textContent = err.message; }
  });
}

function conectarFormularios(alEntrar) {
  conectarVerClave();
  conectarReglas();
  placa.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irA(b.dataset.ir)));

  alEnviar('entrar', async (d) => {
    correoActual = d.correo.trim().toLowerCase();
    try {
      const r = await api('POST', 'entrar', { correo: correoActual, clave: d.clave });
      if (r.necesita2fa) { modoDosPasos = 'entrar'; irA('dospasos'); return; }
      await exito(alEntrar);
    } catch (err) {
      if (err.datos?.pendiente === 'verificar') { claveVerificar = d.clave; irA('verificar', { aviso: 'Te falta confirmar el correo. Escribe el código que te llegó o pide otro.' }); return; }
      throw err;
    }
  });

  alEnviar('crear', async (d, form) => {
    revisarClave(d.clave);
    if (!form.querySelector('[name=acepto]').checked) throw new Error('Para crear la cuenta tienes que aceptar la política de datos.');
    correoActual = d.correo.trim().toLowerCase();
    await api('POST', 'registro', { correo: correoActual, clave: d.clave, acepto: true, version: POLITICA_VERSION });
    claveVerificar = d.clave;
    irA('verificar');
  });

  alEnviar('verificar', async (d) => {
    const clave = claveVerificar || d.clave || '';
    if (!clave) throw new Error('Escribe tu contraseña para terminar.');
    await api('POST', 'verificar', { correo: correoActual, codigo: d.codigo, clave });
    claveVerificar = '';
    await exito(alEntrar);
  });
  conectarReenvio($('#reenviar-registro'), () => api('POST', 'reenviar', { correo: correoActual }));

  alEnviar('olvide', async (d) => {
    correoActual = d.correo.trim().toLowerCase();
    await api('POST', 'olvide', { correo: correoActual });
    irA('restablecer');
  });

  alEnviar('restablecer', async (d) => {
    revisarClave(d.clave);
    const r = await api('POST', 'restablecer', { correo: correoActual, codigo: d.codigo, clave: d.clave });
    if (r.necesita2fa) { claveNueva = d.clave; modoDosPasos = 'recuperar'; irA('dospasos'); return; }
    await exito(alEntrar, 'Listo, tu contraseña nueva quedó guardada.');
  });
  conectarReenvio($('#reenviar-recuperar'), () => api('POST', 'olvide', { correo: correoActual }));

  alEnviar('dospasos', async (d) => {
    if (modoDosPasos === 'recuperar') {
      await api('POST', 'restablecer/2fa', { codigo: d.codigo, clave: claveNueva });
      claveNueva = '';
      await exito(alEntrar, 'Listo, tu contraseña nueva quedó guardada.');
      return;
    }
    await api('POST', '2fa/entrar', { codigo: d.codigo });
    await exito(alEntrar);
  });
  $('#dospasos-salir').addEventListener('click', async () => {
    claveNueva = '';
    claveVerificar = '';
    await api('POST', 'salir').catch(() => {});
    irA('entrar');
  });
}

/* ---------- entrar al garaje ---------- */

async function exito(alEntrar, mensaje = '') {
  const yo = await api('GET', 'yo');
  if (!yo.conectado || !yo.completa) throw new Error('No se pudo abrir la sesión. Intenta de nuevo.');
  let aviso = mensaje;
  const regalo = codigoRegalo();
  if (regalo) {
    try {
      const r = await api('POST', 'reclamar', { codigo: regalo });
      if (r.reclamado) aviso = 'Este garaje de regalo ya es tuyo. Solo tú lo puedes ver y editar.';
    } catch (err) {
      aviso = err.estado === 404 ? 'Ese garaje de regalo ya tiene dueño, así que abrimos el tuyo.' : '';
    }
    olvidarRegalo();
  }
  await abrir(yo, alEntrar, aviso);
}

/* La persiana sube y deja ver el garaje. Es el único movimiento de entrada del sitio. */
async function abrir(yo, alEntrar, aviso = '') {
  pintarCuenta(yo);
  app.hidden = false;
  const cargando = alEntrar();
  if (conMovimiento()) {
    await placa.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
    await acceso.animate([{ transform: 'none' }, { transform: 'translateY(-101%)' }], { duration: 900, easing: 'cubic-bezier(.6,0,.25,1)', fill: 'forwards' }).finished.catch(() => {});
  }
  acceso.hidden = true;
  await cargando;
  if (aviso) avisoGaraje(aviso);
}

function avisoGaraje(texto) {
  const p = $('#aviso-cuenta');
  p.textContent = texto;
  p.hidden = false;
  setTimeout(() => { p.hidden = true; }, 7000);
}

export async function iniciarAcceso(alEntrar) {
  limpiarRestos();
  guardarCodigoRegalo();
  conectarFormularios(alEntrar);
  conectarCuenta();
  let yo = { conectado: false };
  try {
    yo = await api('GET', 'yo');
  } catch (err) {
    irA('entrar', { aviso: err.message });
    return;
  }
  if (yo.conectado && yo.completa) {
    if (codigoRegalo()) { await exito(alEntrar).catch(() => abrir(yo, alEntrar)); return; }
    await abrir(yo, alEntrar);
    return;
  }
  if (yo.conectado) { modoDosPasos = 'entrar'; irA('dospasos'); return; }
  irA('entrar');
}

/* ---------- diálogo "Tu cuenta" ---------- */

const dialogo = $('#cuenta');
let estado2fa = false;

function pintarCuenta(yo) {
  $('#cuenta-correo').textContent = yo.correo || '';
  $('#cuenta-correo-dialogo').textContent = yo.correo || '';
  estado2fa = Boolean(yo.dosPasos);
  pintar2fa();
}

function pintar2fa() {
  $('#estado-2fa').textContent = estado2fa
    ? 'Activa. Al entrar te pedimos el código de tu app de autenticación.'
    : 'Desactivada. Actívala para que no baste con la contraseña para entrar.';
  $('#activar-2fa').hidden = estado2fa;
  $('#form-quitar-2fa').hidden = !estado2fa;
  $('#form-confirmar-2fa').hidden = true;
}

function errorEn(form, err) {
  if (err.estado === 401) { location.reload(); return; }
  form.querySelector('.acceso-error').textContent = err.message;
}

function conectarCuenta() {
  $('#abrir-cuenta').addEventListener('click', () => { pintar2fa(); dialogo.showModal(); });
  $('#cerrar-cuenta').addEventListener('click', () => dialogo.close());

  let factorId = '';
  $('#activar-2fa').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    const form = $('#form-confirmar-2fa');
    boton.disabled = true;
    try {
      const r = await api('POST', '2fa/activar');
      factorId = r.id;
      const qr = $('#qr-2fa');
      if (String(r.qr).startsWith('data:image/svg+xml')) qr.src = r.qr;
      $('#secreto-2fa').textContent = String(r.secreto || '').match(/.{1,4}/g)?.join(' ') || '';
      form.hidden = false;
      boton.hidden = true;
      form.querySelector('input').focus();
    } catch (err) { errorEn(form, err); form.hidden = false; }
    boton.disabled = false;
  });

  $('#form-confirmar-2fa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api('POST', '2fa/confirmar', { id: factorId, codigo: datosDe(form).codigo });
      estado2fa = true;
      form.reset();
      pintar2fa();
      $('#estado-2fa').textContent = 'Activa. Desde ahora, al entrar te pedimos el código de la app.';
    } catch (err) { errorEn(form, err); }
  });

  $('#form-quitar-2fa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api('POST', '2fa/quitar', { codigo: datosDe(form).codigo });
      estado2fa = false;
      form.reset();
      pintar2fa();
    } catch (err) { errorEn(form, err); }
  });

  $('#salir').addEventListener('click', async () => {
    await api('POST', 'salir').catch(() => {});
    location.replace('/');
  });

  $('#form-borrar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = datosDe(form);
    if (d.confirmar !== 'BORRAR') { form.querySelector('.acceso-error').textContent = 'Escribe BORRAR, en mayúsculas, para confirmar.'; return; }
    try {
      await api('POST', 'cuenta/borrar', { clave: d.clave, confirmar: d.confirmar });
      location.replace('/');
    } catch (err) { errorEn(form, err); }
  });
}
