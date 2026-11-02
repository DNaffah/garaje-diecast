// Panel de búsqueda y garaje de vitrinas.
import { buscarModelos, leerModelo } from './wiki.js';
import { cargarGaraje, guardarGaraje } from './almacen.js';

const $ = (s, r = document) => r.querySelector(s);
const conMovimiento = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const ENTRADA = 'cubic-bezier(.2,.7,.3,1)';

let garaje = cargarGaraje();
let busquedaActual = null;

const el = {
  panel: $('#panel'), q: $('#q'), resultados: $('#resultados'), lista: $('#lista-coleccion'), contador: $('#contador'),
  vitrinas: $('#vitrinas'), vacio: $('#vacio'), sub: $('#garaje-sub'),
};

const enGaraje = (titulo) => garaje.some((a) => a.titulo === titulo);
const guardar = () => guardarGaraje(garaje);

// ---------- Búsqueda ----------
let espera;
export function iniciarPanel() {
  el.q.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => buscar(el.q.value.trim()), 320);
  });
  $('#buscador').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(espera); buscar(el.q.value.trim()); });
  $('#abrir-panel').addEventListener('click', () => { el.panel.classList.add('abierto'); el.q.focus(); });
  $('#panel-cerrar').addEventListener('click', () => el.panel.classList.remove('abierto'));
  pintarColeccion();
  pintarVitrinas({ encender: true });
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
    el.resultados.replaceChildren(ul);
  } catch (err) {
    if (err.name === 'AbortError') return;
    el.resultados.replaceChildren(parrafo('No se pudo conectar con la Hot Wheels Wiki. Revisa la conexión e intenta de nuevo.', 'pista-texto error'));
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
    if (enGaraje(m.titulo)) quitar(m.titulo);
    else agregar({ titulo: m.titulo, foto: m.mini, anio: '' }, img);
  });
  li.append(img, nombre, boton);
  return li;
}

function actualizarBoton(boton) {
  const esta = enGaraje(boton.dataset.titulo);
  boton.setAttribute('aria-pressed', String(esta));
  boton.textContent = esta ? 'Quitar' : 'Agregar';
  boton.setAttribute('aria-label', `${esta ? 'Quitar' : 'Agregar'} ${boton.dataset.titulo} ${esta ? 'del' : 'al'} garaje`);
}
const refrescarBotones = () => el.resultados.querySelectorAll('.boton-agregar').forEach(actualizarBoton);

// ---------- Colección (lista del panel) ----------
function pintarColeccion() {
  el.contador.textContent = String(garaje.length);
  el.lista.replaceChildren(...garaje.map((a) => {
    const li = document.createElement('li');
    const n = document.createElement('span');
    n.textContent = a.titulo;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quitar';
    b.textContent = 'Quitar';
    b.setAttribute('aria-label', `Quitar ${a.titulo} del garaje`);
    b.addEventListener('click', () => quitar(a.titulo));
    li.append(n, b);
    return li;
  }));
  el.vacio.hidden = garaje.length > 0;
  el.sub.textContent = garaje.length
    ? `${garaje.length} ${garaje.length === 1 ? 'auto' : 'autos'} en exhibición. Toca una vitrina para entrar al museo de ese auto.`
    : 'Agrega autos desde el panel para llenar las vitrinas.';
}

// ---------- Vitrinas ----------
function vitrina(a) {
  const li = document.createElement('li');
  li.className = 'vitrina';
  li.dataset.titulo = a.titulo;
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
  etiqueta.append(nombre, anio);

  const repisa = document.createElement('div');
  repisa.className = 'repisa';
  boton.append(caja, repisa, etiqueta);
  li.append(boton);
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
  if (!encender || !conMovimiento()) { items.forEach((v) => v.classList.add('encendida')); return; }
  // Momento de entrada: las luces de las vitrinas se prenden una tras otra.
  items.forEach((v, i) => parpadear(v, 250 + Math.min(i, 14) * 90));
}

function parpadear(v, retraso = 0) {
  const pasos = [[0, true], [70, false], [140, true], [230, false], [300, true]];
  pasos.forEach(([t, on]) => setTimeout(() => v.classList.toggle('encendida', on), retraso + t));
}

function flip(mutar) {
  const antes = new Map([...el.vitrinas.children].map((v) => [v.dataset.titulo, v.getBoundingClientRect()]));
  mutar();
  if (!conMovimiento()) return;
  [...el.vitrinas.children].forEach((v) => {
    const a = antes.get(v.dataset.titulo);
    if (!a) return;
    const d = v.getBoundingClientRect();
    const dx = a.left - d.left, dy = a.top - d.top;
    if (dx || dy) v.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: ENTRADA });
  });
}

async function agregar(a, origenImg) {
  if (enGaraje(a.titulo)) return;
  garaje.push(a);
  guardar();
  pintarColeccion();
  refrescarBotones();
  const nueva = vitrina(a);
  flip(() => el.vitrinas.append(nueva));
  await llegada(nueva, origenImg);
  completarDatos(a.titulo);
}

async function llegada(v, origenImg) {
  const autoEl = v.querySelector('.auto');
  if (!conMovimiento()) { v.classList.add('encendida'); return; }
  const angosto = matchMedia('(max-width: 880px)').matches;
  v.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const destino = autoEl.getBoundingClientRect();
  // 1. El auto sale del panel y vuela a la entrada de la vitrina.
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
  // 2. Entra rodando sobre el tramo de pista, con un pequeño rebote de suspensión.
  autoEl.style.opacity = '';
  await autoEl.animate([
    { transform: 'translateX(-120%)', opacity: 0 },
    { transform: 'translateX(6%)', opacity: 1, offset: .75 },
    { transform: 'translateX(-2%) translateY(1px)', offset: .88 },
    { transform: 'none' },
  ], { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.catch(() => {});
  // 3. Se prende la luz de la vitrina.
  parpadear(v);
}

async function completarDatos(titulo) {
  try {
    const m = await leerModelo(titulo);
    const a = garaje.find((x) => x.titulo === titulo);
    if (!a) return;
    // la foto principal de la ficha, salvo que sea un boceto; si no, la versión más reciente
    const principal = m.imagen && !/sketch|drawing|render|concept|blueprint/i.test(decodeURIComponent(m.imagen)) ? m.imagen : '';
    const reciente = principal || m.versiones.at(-1)?.foto || m.versiones[0]?.foto || m.galeria[0]?.foto || m.imagen;
    if (reciente) a.foto = reciente;
    a.anio = (/\b(19|20)\d{2}\b/.exec(m.anios) || [''])[0];
    guardar();
    const v = [...el.vitrinas.children].find((x) => x.dataset.titulo === titulo);
    if (!v) return;
    if (reciente) ponerFoto(v.querySelector('.auto'), reciente);
    v.querySelector('.anio').textContent = a.anio;
  } catch { /* la vitrina se queda con la miniatura de la búsqueda */ }
}

async function quitar(titulo) {
  const v = [...el.vitrinas.children].find((x) => x.dataset.titulo === titulo);
  garaje = garaje.filter((a) => a.titulo !== titulo);
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

export const autosDelGaraje = () => garaje.slice();

function parrafo(texto, clase) { const p = document.createElement('p'); p.className = clase; p.textContent = texto; return p; }
function esqueleto() { const d = document.createElement('div'); d.className = 'esqueleto'; d.style.height = '44px'; return d; }
