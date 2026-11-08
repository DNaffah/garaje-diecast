/* El museo de cada carro: el recorrido con el scroll, la ficha, la miniatura y su base. */
import { leerModelo, WIKI_BASE, imagenSegura, decodificar } from './wiki.js';
import { leerAutoReal, recorridoDesde, llaveSerie, marcaDe } from './auto-real.js';
import { autoDelGaraje, actualizarAuto, quitarAuto, agregarAuto } from './garaje.js';
import { quizasMostrarNota } from './animo.js';
import { confirmarDosVeces } from './confirmar.js';

const $ = (s, r = document) => r.querySelector(s);
const el = {
  museo: $('#museo'), titulo: $('#museo-titulo'), tipo: $('#museo-tipo'), marco: $('#marco'), pista: $('#recorrido'),
  escenario: $('#escenario'), fondo: $('#fondo'), datos: $('#datos-recorrido'), etapa: $('#etapa'),
  contador: $('#contador-etapa'), barra: $('#barra-etapa'), elegir: $('#elegir-foto'), selector: $('#selector-fotos'),
  rejilla: $('#rejilla-fotos'), real: $('#sala-real'), mini: $('#sala-mini'), base: $('#sala-base'), creditos: $('#creditos'),
  desliza: $('#desliza'), sacar: $('#sacar-museo'), credito: $('#credito-foto'),
};

const FONDOS = [
  { id: 'pista', nombre: 'Pista naranja' },
  { id: 'taller', nombre: 'Taller' },
  { id: 'noche', nombre: 'Ciudad de noche' },
  { id: 'desierto', nombre: 'Desierto al atardecer' },
  { id: 'estudio', nombre: 'Estudio blanco' },
];
const PREFERIDAS = ['Motor', 'Potencia', 'Transmisión', 'Producción', 'Disposición', 'Carrocería', 'Diseño', 'Velocidad máxima', 'Peso'];

let fondoAnterior = '';
let tituloAbierto = '';
let carga = 0;
let ultimoFoco = null;
let etapas = [];
let notas = [];
let real = null, modeloActual = null;

export function iniciarMuseo() {
  $('#volver').addEventListener('click', cerrar);
  el.sacar.addEventListener('click', async () => {
    if (!confirmarDosVeces(el.sacar, 'Toca otra vez para sacarlo')) return;
    const auto = autoDelGaraje(tituloAbierto);
    cerrar();
    if (auto) await quitarAuto(auto.clave);
  });
  el.elegir.addEventListener('click', abrirSelector);
  $('#cerrar-selector').addEventListener('click', () => el.selector.close());
  el.museo.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.selector.open) cerrar(); });
  el.museo.addEventListener('scroll', () => requestAnimationFrame(avanzar), { passive: true });
  addEventListener('resize', () => requestAnimationFrame(() => { ajustarBarra(); avanzar(); }));
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

function ajustarBarra() {
  const alto = $('.museo-barra').offsetHeight;
  el.escenario.style.top = `${alto}px`;
  el.escenario.style.height = `calc(100vh - ${alto}px)`;
}

async function abrir(titulo) {
  if (tituloAbierto === titulo && !el.museo.hidden) return;
  tituloAbierto = titulo;
  const id = ++carga;
  ultimoFoco = document.activeElement;
  fondoAlAzar();
  el.museo.hidden = false;
  document.body.style.overflow = 'hidden';
  el.museo.scrollTop = 0;
  ajustarBarra();
  $('#volver').focus({ preventScroll: true });
  el.sacar.hidden = !autoDelGaraje(titulo);
  el.sacar.textContent = 'Sacar del garaje';
  delete el.sacar.dataset.confirmando;

  el.titulo.textContent = titulo;
  el.tipo.textContent = 'Buscando el auto en la wiki…';
  el.marco.replaceChildren(esqueletoFoto());
  el.datos.replaceChildren();
  el.etapa.textContent = '';
  el.contador.textContent = '';
  el.elegir.hidden = true;
  el.real.replaceChildren(esqueletos(4));
  el.mini.replaceChildren();
  el.base.replaceChildren();
  el.creditos.replaceChildren();
  etapas = []; notas = []; real = null; modeloActual = null;

  quizasMostrarNota($('#nota'), $('#nota-texto'), $('#nota-cerrar'));

  let modelo;
  try {
    modelo = await leerModelo(titulo);
  } catch {
    if (id !== carga) return;
    el.tipo.textContent = '';
    el.marco.replaceChildren();
    el.real.replaceChildren(texto('p', 'No se pudo leer este modelo en la Hot Wheels Wiki. Revisa la conexión y vuelve a abrirlo.', 'error'));
    return;
  }
  if (id !== carga) return;
  /* Sin la wiki, la foto de la miniatura que ya está en la vitrina sirve para el recorrido. */
  if (modelo.respaldo) modelo.imagen = imagenSegura(autoDelGaraje(titulo)?.foto || '');
  modeloActual = modelo;
  el.titulo.textContent = modelo.titulo;
  pintarMiniatura(modelo);
  pintarBase(modelo);

  /* Sin la wiki y sin una marca en el nombre (un diseño original, por ejemplo), buscar "el auto
     real" en Commons traería fotos de cualquier cosa: mejor no mostrar ninguna. */
  const adivinaria = modelo.respaldo && !marcaDe(modelo.titulo);
  if (modelo.tipo !== 'original' && !adivinaria) {
    el.tipo.textContent = 'Buscando el auto real…';
    real = await leerAutoReal(modelo).catch(() => null);
    if (id !== carga) return;
  }
  const guardada = imagenSegura(autoDelGaraje(titulo)?.fotoReal || '');
  if (real && guardada) {
    const elegida = real.candidatas.find((c) => c.url === guardada) || { url: guardada, nombre: decodificar(guardada.split('/').pop().split('?')[0]), angulo: null, serie: llaveSerie(decodificar(guardada.split('/').pop())) };
    real.recorrido = recorridoDesde(elegida, real.candidatas);
  }
  pintarReal(modelo, real);
  armarRecorrido(modelo, real);
  pintarCreditos(modelo, real);
}

function armarRecorrido(modelo, r) {
  const fotosReales = r?.recorrido ?? [];
  let fotos;
  if (fotosReales.length) {
    fotos = fotosReales.map((f, i) => ({ url: f.url, rotulo: f.angulo?.texto || (i === 0 ? 'Vista principal' : `Vista ${i + 1}`), credito: [f.autor, f.licencia].filter(Boolean).join(' · ') }));
    el.tipo.textContent = `El auto real detrás de la miniatura ${modelo.titulo}`;
    if (r.nombreReal) el.titulo.textContent = r.nombreReal;
  } else {
    const versiones = modelo.versiones.slice(-6).reverse();
    fotos = (versiones.length ? versiones : [{ foto: modelo.imagen }]).filter((v) => v.foto)
      .map((v) => ({ url: v.foto, rotulo: [v.anio, v.color].filter(Boolean).join(' · ') || 'La miniatura', mini: true }));
    el.tipo.textContent = modelo.tipo === 'original'
      ? 'Diseño original de la marca · sus versiones'
      : 'La miniatura · no hay fotos confiables del auto real';
  }
  const ficha = r?.ficha ?? [];
  notas = PREFERIDAS.map((k) => ficha.find((f) => f.etiqueta === k)).filter(Boolean).slice(0, 5);
  if (!notas.length) {
    notas = [['Producida', modelo.anios], ['Debutó en', modelo.serieDebut], ['Diseñador de la miniatura', modelo.disenador]]
      .filter(([, v]) => v).map(([etiqueta, valor]) => ({ etiqueta, valor }));
  }
  const total = Math.max(fotos.length, notas.length, 1);
  etapas = Array.from({ length: total }, (_, i) => fotos[Math.min(Math.floor((i * fotos.length) / total), fotos.length - 1)]).filter(Boolean);

  el.marco.classList.toggle('es-miniatura', Boolean(fotos[0]?.mini));
  el.marco.replaceChildren(...fotos.map((f) => {
    const img = document.createElement('img');
    img.src = f.url;
    img.alt = '';
    img.decoding = 'async';
    img.dataset.url = f.url;
    img.addEventListener('error', () => img.remove());
    return img;
  }));
  el.datos.replaceChildren(...notas.map((n) => {
    const li = document.createElement('li');
    li.append(texto('span', n.etiqueta, 'dato-etiqueta'), texto('span', n.valor, 'dato-valor'));
    return li;
  }));
  el.elegir.hidden = !(r?.candidatas?.length > 1);
  el.pista.style.height = `${Math.max(1, etapas.length) * 90 + 30}vh`;
  el.desliza.hidden = etapas.length < 2;
  avanzar();
}

function avanzar() {
  if (el.museo.hidden || !etapas.length) return;
  const total = el.pista.offsetHeight - el.escenario.offsetHeight;
  const p = Math.min(Math.max(el.museo.scrollTop / Math.max(total, 1), 0), 1);
  const n = etapas.length;
  const i = Math.min(Math.floor(p * n), n - 1);
  const local = p * n - i;
  const etapa = etapas[i];
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  [...el.marco.children].forEach((img) => {
    const activa = img.dataset.url === etapa.url;
    img.classList.toggle('activa', activa);
    if (activa && !quieto) img.style.transform = `scale(${(1 + local * 0.04).toFixed(3)})`;
  });
  el.marco.style.setProperty('--foto', `url("${etapa.url}")`);
  el.etapa.textContent = etapa.rotulo;
  el.credito.textContent = etapa.credito ? `Foto: ${etapa.credito}` : '';
  el.contador.textContent = `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  el.barra.style.transform = `scaleX(${((i + local) / n).toFixed(3)})`;
  [...el.datos.children].forEach((li, k) => {
    li.classList.toggle('visto', k < i);
    li.classList.toggle('actual', k === i);
  });
  el.desliza.style.opacity = p > 0.03 ? '0' : '1';
}

function abrirSelector() {
  if (!real?.candidatas?.length) return;
  const actual = real.recorrido[0]?.url;
  el.rejilla.replaceChildren(...real.candidatas.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opcion-foto';
    b.setAttribute('aria-pressed', String(c.url === actual));
    b.setAttribute('aria-label', `Usar la foto ${c.nombre}`);
    const img = document.createElement('img');
    img.src = c.url; img.alt = ''; img.loading = 'lazy';
    b.append(img, texto('span', c.angulo?.texto || 'Foto', 'opcion-rotulo'));
    b.addEventListener('click', () => {
      real.recorrido = recorridoDesde(c, real.candidatas);
      const auto = autoDelGaraje(tituloAbierto);
      if (auto) actualizarAuto(auto.clave, { fotoReal: c.url });
      el.selector.close();
      armarRecorrido(modeloActual, real);
      pintarCreditos(modeloActual, real);
    });
    return b;
  }));
  el.selector.showModal();
}

/* Cada vez que se entra a un carro le toca un escenario distinto, al azar. */
function fondoAlAzar() {
  const opciones = FONDOS.map((f) => f.id).filter((id) => id !== fondoAnterior);
  const id = opciones[Math.floor(Math.random() * opciones.length)];
  fondoAnterior = id;
  el.fondo.className = `fondo f-${id}`;
  el.escenario.classList.toggle('claro', id === 'estudio');
}

function pintarReal(modelo, r) {
  if (modelo.respaldo && !r) {
    el.real.replaceChildren(texto('p', 'El auto', 'rotulo'), texto('h3', 'Sin datos por ahora'),
      texto('p', 'Sin la Hot Wheels Wiki no se puede saber con certeza qué auto hay detrás de este modelo. Vuelve a abrirlo más tarde.', 'texto-real'));
    return;
  }
  if (modelo.tipo === 'original') {
    const cuerpo = document.createElement('div');
    cuerpo.append(texto('p', 'Este modelo salió del estudio de diseño de la marca: no copia un auto que exista en la calle. Por eso el recorrido pasa por sus versiones de color.', 'texto-real'));
    modelo.descripcion.slice(0, 2).forEach((p) => cuerpo.append(texto('p', p)));
    if (modelo.descripcion.length) cuerpo.append(texto('p', 'Texto de la Hot Wheels Wiki, en inglés.', 'nota-idioma'));
    el.real.replaceChildren(texto('p', 'El auto', 'rotulo'), texto('h3', 'Diseño original, sin versión de calle'), cuerpo);
    return;
  }
  const nombre = r?.articulo?.titulo || (modelo.basadoEn ? capital(modelo.basadoEn) : modelo.titulo);
  const cuerpo = document.createElement('div');
  cuerpo.className = 'sala-real-cuerpo';
  const izq = document.createElement('div');
  if (r?.texto?.extracto) {
    izq.append(texto('p', r.texto.extracto, 'texto-real'));
    if (r.texto.idioma === 'en') izq.append(texto('p', 'Wikipedia no tiene este artículo en español; se muestra en inglés.', 'nota-idioma'));
    izq.append(enlace(r.texto.url, 'Leer el artículo completo en Wikipedia'));
  } else if (modelo.descripcion.length) {
    modelo.descripcion.slice(0, 2).forEach((p) => izq.append(texto('p', p, 'texto-real')));
    izq.append(texto('p', 'Texto de la Hot Wheels Wiki, en inglés.', 'nota-idioma'));
  } else {
    izq.append(texto('p', 'No encontramos un artículo confiable sobre el auto real de este modelo.', 'texto-real'));
  }
  if (modelo.basadoEn) izq.append(texto('p', `La miniatura está basada en: ${modelo.basadoEn}.`, 'nota-idioma'));
  const der = document.createElement('div');
  if (r?.ficha?.length) {
    const dl = document.createElement('dl');
    dl.className = 'ficha';
    r.ficha.forEach((f) => dl.append(texto('dt', f.etiqueta), texto('dd', f.valor)));
    der.append(dl, texto('p', 'Ficha adaptada y traducida del artículo de Wikipedia de esta generación (CC BY-SA 4.0).', 'nota-idioma'));
  }
  cuerpo.append(izq, der);
  el.real.replaceChildren(texto('p', 'El auto real', 'rotulo'), texto('h3', nombre), cuerpo);
}

function pintarMiniatura(modelo) {
  const nodos = [texto('p', 'La miniatura 1:64', 'rotulo'), texto('h3', modelo.titulo)];
  const dl = document.createElement('dl');
  dl.className = 'datos-mini';
  [['Producida', modelo.anios], ['Debutó en', modelo.serieDebut], ['Diseñador', modelo.disenador], ['Versiones de color', modelo.versiones.length ? String(modelo.versiones.length) : '']]
    .filter(([, v]) => v)
    .forEach(([k, v]) => { const d = document.createElement('div'); d.append(texto('dt', k), texto('dd', v)); dl.append(d); });
  nodos.push(dl);
  if (modelo.respaldo) nodos.push(texto('p', 'La Hot Wheels Wiki no respondió o no tiene esta página, así que aquí faltan los datos y las versiones de la miniatura. El auto real se arma con Wikipedia.', 'nota-idioma'));
  if (modelo.versiones.length) {
    const ul = document.createElement('ul');
    ul.className = 'versiones';
    ul.setAttribute('aria-label', 'Versiones de la miniatura');
    modelo.versiones.slice().reverse().slice(0, 10).forEach((v) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'version';
      const clave = `${modelo.titulo}|${v.archivo}`;
      const yaEsta = Boolean(autoDelGaraje(clave, { exacto: true }));
      if (yaEsta) b.classList.add('en-vitrina');
      b.setAttribute('aria-label', `${yaEsta ? 'Ver en el garaje' : 'Agregar al garaje'} la versión ${v.color || ''} de ${v.anio}`.replace(/\s+/g, ' '));
      const img = document.createElement('img');
      img.src = v.foto; img.alt = ''; img.loading = 'lazy';
      b.append(img, texto('span', v.anio || '·', 'v-anio'), texto('span', v.color || 'Color sin dato', 'v-color'), texto('span', v.serie, 'v-serie'),
        texto('span', yaEsta ? 'En tu garaje' : 'Agregar al garaje', 'v-accion'));
      b.addEventListener('click', () => {
        const auto = {
          clave, titulo: modelo.titulo, foto: v.foto, anio: v.anio || '', fotoReal: '',
          color: (v.color || '').slice(0, 60), serie: (v.serie || '').slice(0, 120),
        };
        cerrar();
        setTimeout(() => agregarAuto(auto), 320);
      });
      li.append(b);
      ul.append(li);
    });
    nodos.push(carrusel(ul, modelo.versiones.length));
  }
  if (!modelo.respaldo) nodos.push(enlace(WIKI_BASE + encodeURIComponent(modelo.titulo.replace(/ /g, '_')), 'Ver la ficha completa en la Hot Wheels Wiki'));
  el.mini.replaceChildren(...nodos);
}

/* La fila de versiones se mueve con flechas (y con el dedo en el celular). Se muestran las 10 más recientes. */
function carrusel(ul, total) {
  const caja = document.createElement('div');
  caja.className = 'carrusel';
  const flecha = (dir, etiqueta) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `flecha flecha-${dir}`;
    b.setAttribute('aria-label', etiqueta);
    b.textContent = dir === 'izq' ? '‹' : '›';
    b.addEventListener('click', () => ul.scrollBy({ left: (dir === 'izq' ? -1 : 1) * ul.clientWidth * 0.8, behavior: 'smooth' }));
    return b;
  };
  const izq = flecha('izq', 'Ver versiones anteriores');
  const der = flecha('der', 'Ver más versiones');
  const actualizar = () => {
    izq.disabled = ul.scrollLeft <= 4;
    der.disabled = ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 4;
  };
  ul.addEventListener('scroll', () => requestAnimationFrame(actualizar), { passive: true });
  requestAnimationFrame(actualizar);
  caja.append(izq, ul, der);
  const nodos = [caja];
  if (total > 10) nodos.push(texto('p', `Se muestran las 10 versiones más recientes de ${total}.`, 'nota-idioma'));
  const f = document.createDocumentFragment();
  f.append(...nodos);
  return f;
}

function pintarBase(modelo) {
  if (!modelo.baseDice) { el.base.replaceChildren(); return; }
  const placa = document.createElement('div');
  placa.className = 'placa';
  placa.append(texto('p', modelo.baseDice));
  el.base.replaceChildren(texto('p', 'Debajo del auto', 'rotulo'), texto('h3', 'Lo que dice la base'), placa,
    texto('p', 'Voltea la miniatura: este es el nombre que viene grabado en el chasis.', 'placa-pie'));
}

function parrafoConEnlaces(partes) {
  const p = document.createElement('p');
  partes.forEach((x) => p.append(typeof x === 'string' ? document.createTextNode(x) : enlace(x.href, x.texto)));
  return p;
}

function pintarCreditos(modelo, r) {
  const BY_SA_3 = 'https://creativecommons.org/licenses/by-sa/3.0/';
  const BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0/';
  const MARCA = 'Hot Wheels es una marca registrada de Mattel, Inc.; este garaje es un regalo personal, no comercial, sin relación con Mattel ni respaldo de su parte.';
  const nodos = modelo.respaldo ? [texto('p', MARCA)] : [
    parrafoConEnlaces(['Datos y textos de la miniatura: ', { href: WIKI_BASE + encodeURIComponent(modelo.titulo.replace(/ /g, '_')), texto: 'Hot Wheels Wiki (Fandom)' },
      ', colaboradores de la wiki, ', { href: BY_SA_3, texto: 'CC BY-SA 3.0' },
      '. Las fotos de las miniaturas pertenecen a sus autores o a Mattel y se muestran enlazadas desde la wiki, sin copiarlas. Hot Wheels es una marca registrada de Mattel, Inc.; este garaje es un regalo personal, no comercial, sin relación con Mattel ni respaldo de su parte.']),
  ];
  if (r?.articulo) {
    nodos.push(parrafoConEnlaces(['Ficha técnica: adaptada y traducida al español del artículo de Wikipedia ', { href: r.articulo.url, texto: `“${r.articulo.titulo}”` },
      ', colaboradores de Wikipedia, ', { href: BY_SA_4, texto: 'CC BY-SA 4.0' }, '. La ficha adaptada se comparte bajo la misma licencia.']));
  }
  if (r?.texto) {
    nodos.push(parrafoConEnlaces([`Texto del auto real: Wikipedia en ${r.texto.idioma === 'es' ? 'español' : 'inglés'}, `, { href: r.texto.url, texto: `“${r.texto.titulo}”` }, ', ', { href: BY_SA_4, texto: 'CC BY-SA 4.0' }, '.']));
  }
  if (r?.recorrido?.length) {
    const ul = document.createElement('ul');
    r.recorrido.forEach((f) => {
      const li = document.createElement('li');
      li.append(enlace(f.pagina, f.nombre), document.createTextNode(` · ${f.autor} · `));
      li.append(f.licenciaUrl ? enlace(f.licenciaUrl, f.licencia) : document.createTextNode(f.licencia));
      ul.append(li);
    });
    nodos.push(texto('p', 'Fotos del auto real (Wikimedia Commons, sin modificaciones):'), ul);
  }
  el.creditos.replaceChildren(...nodos);
}

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
function esqueletoFoto() { const d = document.createElement('div'); d.className = 'esqueleto esqueleto-foto'; return d; }
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
