/* Panel de la izquierda y vitrinas. Cada cambio se guarda en la cuenta de quien
   entró, así el garaje se ve igual en todos sus dispositivos. */
import { buscarModelos, leerModelo, imagenSegura, decodificar } from './wiki.js';
import { confirmarDosVeces } from './confirmar.js';
import { leerNube, guardarNube, hayPendiente, reintentar } from './nube.js';

const $ = (s, r = document) => r.querySelector(s);
const conMovimiento = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const ENTRADA = 'cubic-bezier(.2,.7,.3,1)';

let garaje = [];
let fondo = 'pista';
let cargado = false;
let busquedaActual = null;
let ultimaVersionNube = '';

const el = {
  panel: $('#panel'), q: $('#q'), resultados: $('#resultados'), lista: $('#lista-coleccion'), contador: $('#contador'),
  vitrinas: $('#vitrinas'), vacio: $('#vacio'), sub: $('#garaje-sub'), nube: $('#estado-nube'),
};

const enGaraje = (clave) => garaje.some((a) => a.clave === clave);
export const autoDelGaraje = (clave, { exacto = false } = {}) =>
  garaje.find((a) => a.clave === clave) || (exacto ? null : garaje.find((a) => a.titulo === clave)) || null;
function texto60(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }

function limpiarLista(lista) {
  return (Array.isArray(lista) ? lista : []).filter((a) => a && typeof a.titulo === 'string' && a.titulo.length < 200).slice(0, 300).map((a) => ({
    clave: typeof a.clave === 'string' && a.clave.startsWith(a.titulo) && a.clave.length < 400 ? a.clave : a.titulo,
    titulo: a.titulo,
    color: texto60(a.color, 60),
    serie: texto60(a.serie, 120),
    foto: imagenSegura(typeof a.foto === 'string' ? a.foto : ''),
    anio: typeof a.anio === 'string' && /^\d{4}$/.test(a.anio) ? a.anio : '',
    fotoReal: imagenSegura(typeof a.fotoReal === 'string' ? a.fotoReal : ''),
  }));
}

const GUARDADO = 'Guardado en tu cuenta. Lo ves igual en todos tus dispositivos.';

function guardar() {
  estadoNube('Guardando…');
  guardarNube(garaje, fondo, (err, version) => {
    if (err) { avisarError(err); return; }
    ultimaVersionNube = version || ultimaVersionNube;
    estadoNube(GUARDADO, 'ok');
  });
}

/* Sin sesión (venció o se cerró en otro lado) se recarga y aparece la pantalla de entrada. */
function avisarError(err) {
  if (err.estado === 401 || err.estado === 403) { location.reload(); return; }
  estadoNube(err.estado === 0 ? 'Sin conexión: el cambio se guarda cuando vuelva la red.' : err.message, 'aviso');
}
export const guardarTodo = guardar;

function estadoNube(texto, tipo = '') {
  if (!el.nube) return;
  el.nube.textContent = texto;
  el.nube.dataset.tipo = tipo;
}

async function traerDeLaNube({ primeraVez = false } = {}) {
  if (hayPendiente()) return;
  try {
    const remoto = await leerNube();
    cargado = true;
    if (!primeraVez && remoto.actualizado && remoto.actualizado === ultimaVersionNube) return;
    ultimaVersionNube = remoto.actualizado || '';
    garaje = limpiarLista(remoto.autos);
    if (/^(pista|taller|noche|desierto|estudio)$/.test(remoto.fondo || '')) fondo = remoto.fondo;
    pintarColeccion();
    pintarVitrinas({ encender: primeraVez });
    refrescarBotones();
    estadoNube(GUARDADO, 'ok');
  } catch (e) {
    avisarError(e);
  }
}

let espera;
export async function iniciarPanel() {
  el.q.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => buscar(el.q.value.trim()), 320);
  });
  $('#buscador').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(espera); buscar(el.q.value.trim()); });
  $('#abrir-panel').addEventListener('click', () => { el.panel.classList.add('abierto'); el.q.focus(); });
  $('#panel-cerrar').addEventListener('click', () => el.panel.classList.remove('abierto'));
  estadoNube('Abriendo tu garaje…');
  pintarColeccion();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') traerDeLaNube(); });
  addEventListener('online', () => reintentar((err) => !err && estadoNube(GUARDADO, 'ok')));
  await traerDeLaNube({ primeraVez: true });
}

async function buscar(texto) {
  busquedaActual?.abort();
  if (texto.length < 2) {
    el.resultados.replaceChildren(parrafo('Escribe al menos dos letras del nombre del modelo.', 'pista-texto'));
    return;
  }
  const control = new AbortController();
  busquedaActual = control;
  el.resultados.replaceChildren(esqueleto(), esqueleto(), esqueleto());
  try {
    const lista = await buscarModelos(texto, { signal: control.signal });
    if (control.signal.aborted) return;
    if (!lista.length) {
      el.resultados.replaceChildren(parrafo(`No hay modelos con “${texto}”. Prueba con el nombre corto que trae el blíster, por ejemplo “Supra” o “Bone Shaker”.`, 'pista-texto'));
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'lista-resultados';
    lista.forEach((m) => ul.append(filaResultado(m)));
    const aviso = lista[0].respaldo ? [parrafo('La Hot Wheels Wiki no respondió. Mientras vuelve, estos son autos reales de Wikipedia.', 'pista-texto')] : [];
    el.resultados.replaceChildren(...aviso, ul);
  } catch (err) {
    if (err.name === 'AbortError') return;
    el.resultados.replaceChildren(parrafo('No se pudo conectar con la Hot Wheels Wiki ni con Wikipedia. Revisa la conexión e intenta de nuevo.', 'pista-texto error'));
  }
}

function filaResultado(m) {
  const li = document.createElement('li');
  li.className = 'resultado';
  const img = document.createElement('img');
  img.className = 'mini';
  img.alt = '';
  img.loading = 'lazy';
  if (m.mini) img.src = m.mini;
  const nombre = document.createElement('span');
  nombre.className = 'nombre';
  nombre.textContent = m.titulo;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton-agregar';
  boton.dataset.titulo = m.titulo;
  actualizarBoton(boton);
  boton.addEventListener('click', () => {
    if (enGaraje(m.titulo)) quitarAuto(m.titulo);
    else agregar({ clave: m.titulo, titulo: m.titulo, foto: m.mini, anio: '', fotoReal: '', color: '', serie: '' }, img);
  });
  li.append(img, nombre, boton);
  return li;
}

function actualizarBoton(boton) {
  const esta = enGaraje(boton.dataset.titulo);
  boton.setAttribute('aria-pressed', String(esta));
  boton.textContent = esta ? 'Sacar' : 'Agregar';
  boton.setAttribute('aria-label', `${esta ? 'Sacar' : 'Agregar'} ${boton.dataset.titulo} ${esta ? 'del' : 'al'} garaje`);
}
const refrescarBotones = () => el.resultados.querySelectorAll('.boton-agregar').forEach(actualizarBoton);

function pintarColeccion() {
  el.contador.textContent = String(garaje.length);
  el.lista.replaceChildren(...garaje.map((a) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.textContent = a.color ? `${a.titulo} · ${a.color}` : a.titulo;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quitar';
    b.textContent = 'Sacar';
    b.setAttribute('aria-label', `Sacar ${a.titulo} del garaje`);
    b.addEventListener('click', () => quitarAuto(a.clave));
    li.append(n, b);
    return li;
  }));
  el.vacio.hidden = !cargado || garaje.length > 0;
  el.sub.textContent = garaje.length
    ? `${garaje.length} ${garaje.length === 1 ? 'auto' : 'autos'} en exhibición. Toca una vitrina para entrar al museo de ese auto.`
    : 'Agrega autos desde el panel para llenar las vitrinas.';
}

function vitrina(a) {
  const li = document.createElement('li');
  li.className = 'vitrina';
  li.dataset.clave = a.clave;
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'vitrina-boton';
  boton.setAttribute('aria-label', `Entrar al museo de ${a.titulo}`);
  boton.addEventListener('click', () => { location.hash = 'auto/' + encodeURIComponent(a.titulo); });

  const caja = document.createElement('div');
  caja.className = 'caja';
  const tramo = document.createElement('div');
  tramo.className = 'tramo';
  const auto = document.createElement('div');
  auto.className = 'auto';
  ponerFoto(auto, a.foto);
  caja.append(tramo, auto);

  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta';
  const nombre = document.createElement('span');
  nombre.className = 'nombre';
  nombre.textContent = a.titulo;
  const anio = document.createElement('span');
  anio.className = 'anio';
  anio.textContent = a.anio;
  anio.title = 'Año de esta miniatura';
  etiqueta.append(nombre, anio);
  if (a.color || a.serie) {
    const detalle = document.createElement('span');
    detalle.className = 'detalle';
    detalle.textContent = [a.color, a.serie].filter(Boolean).join(' · ');
    etiqueta.append(detalle);
  }

  const repisa = document.createElement('div');
  repisa.className = 'repisa';
  boton.append(caja, repisa, etiqueta);

  const sacar = document.createElement('button');
  sacar.type = 'button';
  sacar.className = 'sacar';
  sacar.setAttribute('aria-label', `Sacar ${a.titulo} del garaje`);
  sacar.title = 'Sacar del garaje';
  const equis = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  equis.setAttribute('viewBox', '0 0 24 24');
  equis.setAttribute('aria-hidden', 'true');
  const trazo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  trazo.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  equis.append(trazo);
  const palabra = document.createElement('span');
  palabra.textContent = 'Sacar';
  sacar.append(equis, palabra);
  sacar.addEventListener('click', () => { if (confirmarDosVeces(sacar, '¿Sacar? Toca otra vez')) quitarAuto(a.clave); });

  li.append(boton, sacar);
  return li;
}

function ponerFoto(contenedor, foto) {
  if (foto) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = foto;
    img.loading = 'lazy';
    img.decoding = 'async';
    contenedor.replaceChildren(img);
  } else {
    const s = document.createElement('span');
    s.className = 'sin-foto';
    s.textContent = 'Sin foto';
    contenedor.replaceChildren(s);
  }
}

function pintarVitrinas({ encender = false } = {}) {
  el.vitrinas.replaceChildren(...garaje.map(vitrina));
  const items = [...el.vitrinas.children];
  garaje.filter((a) => !a.foto).slice(0, 6).forEach((a) => completarDatos(a.clave));
  if (!encender || !conMovimiento()) { items.forEach((v) => v.classList.add('encendida')); return; }
  items.forEach((v, i) => parpadear(v, 250 + Math.min(i, 14) * 90));
}

function parpadear(v, retraso = 0) {
  const pasos = [[0, true], [70, false], [140, true], [230, false], [300, true]];
  pasos.forEach(([t, on]) => setTimeout(() => v.classList.toggle('encendida', on), retraso + t));
}

function flip(mutar) {
  const antes = new Map([...el.vitrinas.children].map((v) => [v.dataset.clave, v.getBoundingClientRect()]));
  mutar();
  if (!conMovimiento()) return;
  [...el.vitrinas.children].forEach((v) => {
    const a = antes.get(v.dataset.clave);
    if (!a) return;
    const d = v.getBoundingClientRect();
    const dx = a.left - d.left, dy = a.top - d.top;
    if (dx || dy) v.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: ENTRADA });
  });
}

export function agregarAuto(a) {
  if (enGaraje(a.clave)) {
    const v = [...el.vitrinas.children].find((x) => x.dataset.clave === a.clave);
    v?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (v) parpadear(v, 300);
    return;
  }
  agregar(a, null);
}

async function agregar(a, origenImg) {
  if (a.clave.length >= 400) a = { ...a, clave: a.titulo };
  if (enGaraje(a.clave)) return;
  if (garaje.length >= 300) { estadoNube('El garaje ya tiene 300 carros, el máximo. Saca alguno para meter otro.', 'aviso'); return; }
  garaje.push(a);
  guardar();
  pintarColeccion();
  refrescarBotones();
  const nueva = vitrina(a);
  flip(() => el.vitrinas.append(nueva));
  await llegada(nueva, origenImg);
  if (a.clave === a.titulo) completarDatos(a.clave);
}

async function llegada(v, origenImg) {
  const autoEl = v.querySelector('.auto');
  if (!conMovimiento()) { v.classList.add('encendida'); return; }
  const angosto = matchMedia('(max-width: 880px)').matches;
  v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const destino = autoEl.getBoundingClientRect();
  if (origenImg?.src && !angosto) {
    const o = origenImg.getBoundingClientRect();
    const vuelo = document.createElement('img');
    vuelo.className = 'vuelo';
    vuelo.src = origenImg.src;
    vuelo.alt = '';
    document.body.append(vuelo);
    const x0 = o.left + o.width / 2 - 60, y0 = o.top + o.height / 2 - 35;
    const x1 = destino.left - 40, y1 = destino.bottom - 70;
    autoEl.style.opacity = '0';
    await vuelo.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6) rotate(-8deg)`, opacity: .2 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 80}px) scale(1) rotate(4deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.9) rotate(0deg)`, opacity: 1 },
    ], { duration: 620, easing: 'cubic-bezier(.45,.05,.3,1)' }).finished.catch(() => {});
    vuelo.remove();
  }
  autoEl.style.opacity = '';
  await autoEl.animate([
    { transform: 'translateX(-120%)', opacity: 0 },
    { transform: 'translateX(6%)', opacity: 1, offset: .75 },
    { transform: 'translateX(-2%) translateY(1px)', offset: .88 },
    { transform: 'none' },
  ], { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.catch(() => {});
  parpadear(v);
}

async function completarDatos(clave) {
  try {
    const actual = garaje.find((x) => x.clave === clave);
    if (!actual) return;
    const m = await leerModelo(actual.titulo);
    const a = garaje.find((x) => x.clave === clave);
    if (!a || m.respaldo) return;
    const principal = m.imagen && !/sketch|drawing|render|concept|blueprint/i.test(decodificar(m.imagen)) ? m.imagen : '';
    const foto = principal || m.versiones.at(-1)?.foto || m.versiones[0]?.foto || m.galeria[0]?.foto || m.imagen;
    if (foto) a.foto = foto;
    a.anio = (/\b(19|20)\d{2}\b/.exec(m.anios) || [''])[0];
    guardar();
    const v = [...el.vitrinas.children].find((x) => x.dataset.clave === clave);
    if (!v) return;
    if (foto) ponerFoto(v.querySelector('.auto'), foto);
    v.querySelector('.anio').textContent = a.anio;
  } catch { /* la vitrina se queda con la miniatura de la búsqueda */ }
}

export function actualizarAuto(clave, cambios) {
  const a = garaje.find((x) => x.clave === clave);
  if (!a) return;
  Object.assign(a, cambios);
  guardar();
  const v = [...el.vitrinas.children].find((x) => x.dataset.clave === clave);
  if (v && 'foto' in cambios) ponerFoto(v.querySelector('.auto'), a.foto);
  if (v && 'anio' in cambios) v.querySelector('.anio').textContent = a.anio;
}

export async function quitarAuto(clave) {
  const v = [...el.vitrinas.children].find((x) => x.dataset.clave === clave);
  garaje = garaje.filter((a) => a.clave !== clave);
  guardar();
  pintarColeccion();
  refrescarBotones();
  if (!v) return;
  if (conMovimiento()) {
    v.classList.remove('encendida');
    await v.querySelector('.auto').animate(
      [{ transform: 'none' }, { transform: 'translateX(-4%)', offset: .2 }, { transform: 'translateX(140%)', opacity: 0 }],
      { duration: 480, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.catch(() => {});
    await v.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], { duration: 180, fill: 'forwards' }).finished.catch(() => {});
  }
  flip(() => v.remove());
}

function parrafo(texto, clase) { const p = document.createElement('p'); p.className = clase; p.textContent = texto; return p; }
function esqueleto() { const d = document.createElement('div'); d.className = 'esqueleto'; d.style.height = '44px'; return d; }
