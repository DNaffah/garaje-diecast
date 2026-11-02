// Museo de un auto: recorrido de 360° con scroll sobre el fondo elegido,
// la ficha del auto real, la miniatura con sus versiones y la placa de la base.
import { leerModelo, WIKI_BASE } from './wiki.js';
import { leerAutoReal } from './auto-real.js';
import { cargarFondo, guardarFondo, cargarFondoPropio, guardarFondoPropio } from './almacen.js';
import { quizasMostrarNota } from './animo.js';

const $ = (s, r = document) => r.querySelector(s);
const el = {
  museo: $('#museo'), titulo: $('#museo-titulo'), tipo: $('#museo-tipo'), fotos: $('#fotos'), grados: $('#grados'),
  pie: $('#foto-pie'), aro: $('#aro'), pista: $('#escenario-pista'), escenario: $('#escenario'), fondo: $('#fondo'),
  fondos: $('#fondos'), real: $('#sala-real'), mini: $('#sala-mini'), base: $('#sala-base'), creditos: $('#creditos'),
  desliza: $('#desliza'),
};

const FONDOS = [
  { id: 'pista', nombre: 'Pista naranja' },
  { id: 'taller', nombre: 'Taller' },
  { id: 'noche', nombre: 'Ciudad de noche' },
  { id: 'desierto', nombre: 'Desierto al atardecer' },
  { id: 'estudio', nombre: 'Estudio blanco' },
];

let fotos = [];
let fondoActual = cargarFondo();
let fondoPropio = cargarFondoPropio();
let tituloAbierto = '';
let carga = 0;
let ultimoFoco = null;

export function iniciarMuseo() {
  pintarSelectorFondos();
  aplicarFondo(fondoActual);
  $('#volver').addEventListener('click', cerrar);
  el.museo.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  el.museo.addEventListener('scroll', () => requestAnimationFrame(girar), { passive: true });
  addEventListener('resize', () => requestAnimationFrame(() => { ajustarBarra(); girar(); }));
  addEventListener('hashchange', segunRuta);
  segunRuta();
}

function segunRuta() {
  const m = /^#auto\/(.+)$/.exec(location.hash);
  if (m) {
    let titulo = '';
    try { titulo = decodeURIComponent(m[1]); } catch { titulo = ''; }
    if (titulo && titulo.length < 200) abrir(titulo);
  } else if (!el.museo.hidden) {
    ocultar();
  }
}

function cerrar() {
  if (location.hash.startsWith('#auto/')) history.back();
  else ocultar();
}

function ocultar() {
  el.museo.hidden = true;
  document.body.style.overflow = '';
  tituloAbierto = '';
  ultimoFoco?.focus?.();
}

async function abrir(titulo) {
  if (tituloAbierto === titulo && !el.museo.hidden) return;
  tituloAbierto = titulo;
  const id = ++carga;
  ultimoFoco = document.activeElement;
  el.museo.hidden = false;
  document.body.style.overflow = 'hidden';
  el.museo.scrollTop = 0;
  $('#volver').focus({ preventScroll: true });
  ajustarBarra();

  el.titulo.textContent = titulo;
  el.tipo.textContent = 'Cargando datos de la wiki…';
  el.pie.textContent = '';
  el.fotos.replaceChildren();
  el.real.replaceChildren(esqueletos(4));
  el.mini.replaceChildren();
  el.base.replaceChildren();
  el.creditos.replaceChildren();
  fotos = [];
  girar();

  quizasMostrarNota($('#nota'), $('#nota-texto'), $('#nota-cerrar'));

  let modelo;
  try {
    modelo = await leerModelo(titulo);
  } catch {
    if (id !== carga) return;
    el.tipo.textContent = '';
    el.real.replaceChildren(texto('p', 'No se pudo leer este modelo en la Hot Wheels Wiki. Revisa la conexión y vuelve a abrirlo.', 'error'));
    return;
  }
  if (id !== carga) return;
  el.titulo.textContent = modelo.titulo;
  pintarMiniatura(modelo);
  pintarBase(modelo);

  let real = { articulo: null, ficha: [], fotos: [] };
  if (modelo.tipo !== 'original') {
    el.tipo.textContent = 'Buscando el auto real…';
    real = await leerAutoReal(modelo).catch(() => real);
    if (id !== carga) return;
  }
  pintarReal(modelo, real);
  armarRecorrido(modelo, real);
  pintarCreditos(modelo, real);
}

// La barra superior puede ocupar una o dos líneas; el escenario se pega justo debajo.
function ajustarBarra() {
  const alto = $('.museo-barra').offsetHeight;
  el.escenario.style.top = `${alto}px`;
  el.escenario.style.height = `calc(100vh - ${alto}px)`;
}

// ---------- Recorrido 360° ----------
function armarRecorrido(modelo, real) {
  const reales = real.fotos.map((f) => ({ url: f.url, pie: f.angulo ? `${f.angulo.texto} · auto real` : 'Auto real' }));
  const versiones = modelo.versiones.slice(-12).map((v) => ({ url: v.foto, pie: [v.anio, v.color].filter(Boolean).join(', ') + ' · miniatura' }));
  fotos = reales.length >= 3 ? reales : [...reales, ...versiones].slice(0, 10);
  if (!fotos.length && modelo.imagen) fotos = [{ url: modelo.imagen, pie: 'Miniatura' }];
  el.tipo.textContent = reales.length >= 3
    ? `Auto real${real.articulo ? ' · ' + real.articulo.titulo : ''}`
    : modelo.tipo === 'original' ? 'Diseño original de la marca · recorrido por sus versiones' : 'Recorrido por las versiones de la miniatura';
  el.fotos.replaceChildren(...fotos.map((f) => {
    const img = document.createElement('img');
    img.src = f.url;
    img.alt = '';
    img.decoding = 'async';
    img.addEventListener('error', () => { img.remove(); });
    return img;
  }));
  el.pista.style.height = fotos.length > 1 ? `${Math.max(260, fotos.length * 70)}vh` : '100vh';
  el.desliza.hidden = fotos.length < 2;
  if (!fotos.length) el.pie.textContent = 'La wiki no tiene fotos de este modelo todavía.';
  girar();
}

function girar() {
  if (el.museo.hidden) return;
  const total = el.pista.offsetHeight - el.escenario.offsetHeight;
  const recorrido = Math.min(Math.max(el.museo.scrollTop / Math.max(total, 1), 0), 1);
  const grados = Math.round(recorrido * 360);
  el.grados.textContent = String(grados);
  el.aro.style.setProperty('--giro', `${grados}deg`);
  el.desliza.style.opacity = recorrido > .03 ? '0' : '1';
  const imgs = [...el.fotos.children];
  const n = imgs.length;
  if (!n) return;
  const pos = recorrido * n;               // la última foto se funde con la primera al llegar a 360°
  const i = Math.min(Math.floor(pos), n - 1);
  const t = pos - i;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  imgs.forEach((img, k) => {
    let opacidad = 0, local = 0;
    const siguiente = (i + 1) % n;
    if (k === i) { opacidad = t < .7 ? 1 : 1 - (t - .7) / .3; local = t; }
    else if (k === siguiente && n > 1 && t >= .7) { opacidad = (t - .7) / .3; local = t - 1; }
    if (n === 1) opacidad = 1;
    img.style.opacity = opacidad.toFixed(3);
    img.style.transform = quieto ? 'none'
      : `translateX(${((.5 - local) * 6).toFixed(2)}%) rotateY(${((local - .5) * -10).toFixed(2)}deg) scale(${(1 + Math.sin(local * Math.PI) * .03).toFixed(3)})`;
  });
  el.pie.textContent = fotos[t >= .85 && n > 1 ? (i + 1) % n : i]?.pie || '';
}

// ---------- Fondos ----------
function pintarSelectorFondos() {
  const etiqueta = document.createElement('span');
  etiqueta.textContent = 'Fondo';
  etiqueta.id = 'fondo-etiqueta';
  const botones = FONDOS.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fondo-opcion';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', f.nombre);
    b.title = f.nombre;
    b.dataset.fondo = f.id;
    const muestra = document.createElement('span');
    muestra.className = `muestra f-${f.id}`;
    b.append(muestra);
    b.addEventListener('click', () => aplicarFondo(f.id));
    return b;
  });
  const subir = document.createElement('button');
  subir.type = 'button';
  subir.className = 'fondo-subir';
  subir.setAttribute('role', 'radio');
  subir.dataset.fondo = 'propio';
  subir.textContent = fondoPropio ? 'Mi imagen' : 'Subir imagen';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.hidden = true;
  input.id = 'fondo-archivo';
  subir.addEventListener('click', () => (fondoPropio && fondoActual !== 'propio' ? aplicarFondo('propio') : input.click()));
  input.addEventListener('change', () => leerImagenPropia(input.files?.[0], subir));
  el.fondos.replaceChildren(etiqueta, ...botones, subir, input);
}

const LIMITE_BYTES = 8 * 1024 * 1024;
async function leerImagenPropia(archivo, boton) {
  if (!archivo) return;
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size > LIMITE_BYTES) {
    boton.textContent = 'Usa una foto JPG, PNG o WebP de menos de 8 MB';
    return;
  }
  try {
    // se reduce a 1600 px y se guarda como JPG para que quepa en el navegador
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    fondoPropio = lienzo.toDataURL('image/jpeg', .82);
    const guardada = guardarFondoPropio(fondoPropio);
    boton.textContent = guardada ? 'Mi imagen' : 'Mi imagen (solo esta visita)';
    aplicarFondo('propio');
  } catch {
    boton.textContent = 'No se pudo abrir esa imagen';
  }
}

function aplicarFondo(id) {
  if (id === 'propio' && !fondoPropio) id = 'pista';
  fondoActual = id;
  guardarFondo(id);
  el.fondo.className = 'fondo' + (id === 'propio' ? '' : ` f-${id}`);
  el.fondo.style.backgroundImage = id === 'propio' ? `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.25)), url("${fondoPropio}")` : '';
  el.escenario.classList.toggle('claro', id === 'estudio');
  el.fondos.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fondo === id)));
}

// ---------- Salas ----------
function pintarReal(modelo, real) {
  const nodos = [];
  if (modelo.tipo === 'original') {
    nodos.push(texto('p', 'El auto', 'rotulo'), texto('h3', 'Diseño original, sin versión de calle'));
    const cuerpo = document.createElement('div');
    cuerpo.append(texto('p', 'Este modelo salió del estudio de diseño de la marca. No copia un auto que exista en la calle, así que el recorrido pasa por sus versiones de color.', 'texto-real'));
    modelo.descripcion.slice(0, 2).forEach((p) => cuerpo.append(texto('p', p)));
    if (modelo.descripcion.length) cuerpo.append(texto('p', 'Texto de la Hot Wheels Wiki, en inglés.', 'nota-idioma'));
    nodos.push(cuerpo);
    el.real.replaceChildren(...nodos);
    return;
  }
  nodos.push(texto('p', 'El auto real', 'rotulo'), texto('h3', real.articulo?.titulo || (modelo.basadoEn ? capital(modelo.basadoEn) : modelo.titulo)));
  const cuerpo = document.createElement('div');
  cuerpo.className = 'sala-real-cuerpo';
  const izq = document.createElement('div');
  if (real.articulo?.extracto) {
    izq.append(texto('p', real.articulo.extracto, 'texto-real'));
    if (real.articulo.idioma === 'en') izq.append(texto('p', 'Wikipedia no tiene este artículo en español; se muestra en inglés.', 'nota-idioma'));
    izq.append(enlace(real.articulo.url, 'Leer el artículo completo en Wikipedia'));
  } else if (modelo.descripcion.length) {
    modelo.descripcion.slice(0, 2).forEach((p) => izq.append(texto('p', p, 'texto-real')));
    izq.append(texto('p', 'Texto de la Hot Wheels Wiki, en inglés.', 'nota-idioma'));
  } else {
    izq.append(texto('p', 'No encontramos un artículo sobre el auto real de este modelo.', 'texto-real'));
  }
  if (modelo.basadoEn) izq.append(texto('p', `Según la wiki, la miniatura toma como base: ${modelo.basadoEn}.`, 'nota-idioma'));
  const der = document.createElement('div');
  if (real.ficha.length) {
    const dl = document.createElement('dl');
    dl.className = 'ficha';
    real.ficha.forEach((f) => dl.append(texto('dt', f.etiqueta), texto('dd', f.valor)));
    der.append(dl);
  }
  cuerpo.append(izq, der);
  nodos.push(cuerpo);
  el.real.replaceChildren(...nodos);
}

function pintarMiniatura(modelo) {
  const nodos = [texto('p', 'La miniatura 1:64', 'rotulo'), texto('h3', modelo.titulo)];
  const dl = document.createElement('dl');
  dl.className = 'datos-mini';
  [['Producido', modelo.anios], ['Debutó en', modelo.serieDebut], ['Diseñador', modelo.disenador], ['Versiones con foto', modelo.versiones.length ? String(modelo.versiones.length) : '']]
    .filter(([, v]) => v)
    .forEach(([k, v]) => { const d = document.createElement('div'); d.append(texto('dt', k), texto('dd', v)); dl.append(d); });
  nodos.push(dl);
  if (modelo.versiones.length) {
    const ul = document.createElement('ul');
    ul.className = 'versiones';
    ul.setAttribute('aria-label', 'Versiones de la miniatura');
    modelo.versiones.forEach((v) => {
      const li = document.createElement('li');
      li.className = 'version';
      const img = document.createElement('img');
      img.src = v.foto; img.alt = `${modelo.titulo}, ${v.color || 'versión'} de ${v.anio}`; img.loading = 'lazy';
      li.append(img, texto('span', v.anio || '·', 'v-anio'), texto('span', v.color || 'Color sin dato', 'v-color'), texto('span', v.serie, 'v-serie'));
      ul.append(li);
    });
    nodos.push(ul);
  }
  nodos.push(enlace(WIKI_BASE + encodeURIComponent(modelo.titulo.replace(/ /g, '_')), 'Ver la ficha completa en la Hot Wheels Wiki'));
  el.mini.replaceChildren(...nodos);
}

function pintarBase(modelo) {
  if (!modelo.baseDice) { el.base.replaceChildren(); return; }
  const placa = document.createElement('div');
  placa.className = 'placa';
  placa.append(texto('p', modelo.baseDice));
  el.base.replaceChildren(texto('p', 'Debajo del auto', 'rotulo'), texto('h3', 'Lo que dice la base'), placa,
    texto('p', 'Voltea la miniatura: este es el nombre que viene grabado en el chasis.', 'placa-pie'));
}

function pintarCreditos(modelo, real) {
  const nodos = [texto('p', 'Datos e imágenes de la miniatura: Hot Wheels Wiki (Fandom), contenido bajo CC BY-SA. Hot Wheels es una marca de Mattel; este garaje es un regalo personal sin relación con la marca.')];
  if (real.articulo) nodos.push(texto('p', `Texto del auto real: Wikipedia (${real.articulo.idioma}), CC BY-SA. Ficha: Wikidata, CC0.`));
  if (real.fotos.length) {
    const ul = document.createElement('ul');
    real.fotos.forEach((f) => {
      const li = document.createElement('li');
      const a = enlace(f.pagina, f.nombre);
      li.append(a, document.createTextNode(` · ${[f.autor, f.licencia].filter(Boolean).join(', ') || 'Wikimedia Commons'}`));
      ul.append(li);
    });
    nodos.push(texto('p', 'Fotos del auto real, de Wikimedia Commons:'), ul);
  }
  el.creditos.replaceChildren(...nodos);
}

// ---------- utilidades ----------
function texto(tag, contenido, clase) { const n = document.createElement(tag); if (clase) n.className = clase; n.textContent = contenido; return n; }
function enlace(href, contenido) {
  const a = document.createElement('a');
  a.className = 'enlace';
  a.textContent = contenido;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  try { const u = new URL(href); if (u.protocol === 'https:') a.href = u.href; } catch { /* sin enlace */ }
  return a;
}
function esqueletos(n) { const f = document.createDocumentFragment(); for (let i = 0; i < n; i++) { const d = document.createElement('div'); d.className = 'esqueleto'; f.append(d); } return f; }
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
