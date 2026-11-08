/* Lo que llega de la Hot Wheels Wiki es texto de terceros: se limpia y se pinta
   con textContent, nunca como HTML. */
const API = 'https://hotwheels.fandom.com/api.php';
export const WIKI_BASE = 'https://hotwheels.fandom.com/wiki/';
const HOSTS_IMAGEN = ['static.wikia.nocookie.net', 'upload.wikimedia.org', 'thumb.wikimedia.org'];

const cache = new Map();

export async function pedirJSON(base, params, { signal } = {}) {
  const url = base + '?' + new URLSearchParams({ ...params, format: 'json', origin: '*', formatversion: '2' });
  if (cache.has(url)) return cache.get(url);
  const promesa = fetch(url, { signal }).then(async (r) => {
    if (!r.ok) throw new Error(`La fuente respondió ${r.status}`);
    const json = await r.json();
    if (json?.error) throw new Error(json.error.info || json.error.code || 'Error de la API');
    return json;
  });
  cache.set(url, promesa);
  promesa.catch(() => cache.delete(url));
  return promesa;
}

/* Un nombre de archivo mal codificado (un % suelto) no debe tumbar el museo. */
export function decodificar(s = '') {
  try { return decodeURIComponent(s); } catch { return s; }
}

/* Las páginas de la wiki las edita cualquiera. Con un tope de largo, una página
   inflada a propósito no congela la pestaña limpiando el texto. */
export const TOPE_WIKITEXTO = 150000;

export function imagenSegura(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_IMAGEN.includes(u.hostname) ? u.href : '';
  } catch { return ''; }
}

const SIN_FOTO = /image not available|no ?image|noimage|placeholder|coming soon/i;
const NO_SON_MODELOS = /^(List of|Category:|File:|Template:|User|\d{4}\b|Hot Wheels\b|Code 3|Base codes|Treasure Hunt)/i;

/* Plan de respaldo: si la Hot Wheels Wiki no responde, tarda demasiado o bloquea las consultas,
   se busca el auto real en Wikipedia (solo artículos con ficha de automóvil). Se pierden los datos
   de la miniatura, pero el garaje y el museo siguen funcionando. */
const RESPALDO = 'https://en.wikipedia.org/w/api.php';
const ESPERA_WIKI = 9000;

function conEspera(signal) {
  if (typeof AbortSignal.timeout !== 'function' || typeof AbortSignal.any !== 'function') return signal;
  return AbortSignal.any([signal, AbortSignal.timeout(ESPERA_WIKI)].filter(Boolean));
}

async function buscarEnWikipedia(texto, signal) {
  const r = await pedirJSON(RESPALDO, {
    action: 'query', generator: 'search', gsrsearch: `${texto} hastemplate:"Infobox automobile"`, gsrnamespace: '0', gsrlimit: '12',
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '200',
  }, { signal });
  return (r?.query?.pages ?? [])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => ({ titulo: p.title, mini: imagenSegura(p.thumbnail?.source ?? ''), respaldo: true }));
}

export async function buscarModelos(texto, { signal } = {}) {
  try {
    return await buscarEnFandom(texto, conEspera(signal));
  } catch (e) {
    if (signal?.aborted) throw e;
    return buscarEnWikipedia(texto, signal);
  }
}

async function buscarEnFandom(texto, signal) {
  const r = await pedirJSON(API, {
    action: 'query', generator: 'search', gsrsearch: texto, gsrnamespace: '0', gsrlimit: '20',
    prop: 'pageimages|categories', piprop: 'thumbnail', pithumbsize: '200',
    clcategories: 'Category:1:64|Category:Licensed Hot Wheels|Category:Unlicensed Hot Wheels', cllimit: 'max',
  }, { signal });
  const paginas = r?.query?.pages ?? [];
  return paginas
    .filter((p) => p.categories?.length && !NO_SON_MODELOS.test(p.title) && !/\(disambiguation\)/i.test(p.title))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, 14)
    .map((p) => ({ titulo: p.title, mini: imagenSegura(p.thumbnail?.source ?? '') }));
}

/* Quita <ref>…</ref>, <ref …/> y comentarios <!-- --> recorriendo el texto una sola vez.
   Con regex, un texto lleno de "<ref " sin cerrar tardaba segundos en limpiarse. */
export function sinRefs(t = '') {
  const s = String(t);
  const bajo = s.toLowerCase();
  let fuera = '';
  let i = 0;
  let quedanCierres = true;
  let ref = bajo.indexOf('<ref');
  let com = s.indexOf('<!--');
  while (i < s.length) {
    if (ref !== -1 && ref < i) ref = bajo.indexOf('<ref', i);
    if (com !== -1 && com < i) com = s.indexOf('<!--', i);
    const prox = ref === -1 ? com : com === -1 ? ref : Math.min(ref, com);
    if (prox === -1) { fuera += s.slice(i); break; }
    fuera += s.slice(i, prox);
    if (prox === com) {
      const fin = s.indexOf('-->', prox + 4);
      i = fin === -1 ? s.length : fin + 3;
      continue;
    }
    const cierreTag = s.indexOf('>', prox);
    if (cierreTag === -1) break;
    if (s[cierreTag - 1] === '/') { i = cierreTag + 1; continue; }
    const fin = quedanCierres ? bajo.indexOf('</ref>', cierreTag) : -1;
    if (fin === -1) quedanCierres = false;
    i = fin === -1 ? cierreTag + 1 : fin + 6;
  }
  return fuera;
}

export function limpiarWikitexto(t = '') {
  let s = sinRefs(String(t).slice(0, TOPE_WIKITEXTO));
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s
    .replace(/\[\[(?:File|Image|Archivo):[^\][]{0,500}\]\]/gi, '')
    .replace(/\[\[[^\][|]{0,300}\|([^\][]{0,300})\]\]/g, '$1')
    .replace(/\[\[([^\][]{0,300})\]\]/g, '$1')
    .replace(/\[https?:\/\/[^\s\][]{1,500}\s([^\][]{1,300})\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^<>]{1,300}>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => (n === '8209' || n === '8208' ? '-' : Number(n) <= 0x10FFFF ? String.fromCodePoint(Number(n)) : ''))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => (parseInt(n, 16) <= 0x10FFFF ? String.fromCodePoint(parseInt(n, 16)) : ''))
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');
  return s.trim();
}

function seccion(wikitexto, nombre) {
  const re = new RegExp(`^==\\s*${nombre}\\s*==\\s*$`, 'mi');
  const m = re.exec(wikitexto);
  if (!m) return '';
  const resto = wikitexto.slice(m.index + m[0].length);
  const fin = resto.search(/^==[^=]/m);
  return fin === -1 ? resto : resto.slice(0, fin);
}

function campoPlantilla(wikitexto, campo) {
  const m = new RegExp(`\\|\\s*${campo}\\s*=\\s*((?:\\[\\[[^\\]]*\\]\\]|\\{\\{[^}]*\\}\\}|[^\\n|])*)`, 'i').exec(wikitexto);
  return m ? limpiarWikitexto(m[1]) : '';
}

function celdaSinAtributos(c) {
  const m = /^\s*(?:(?:rowspan|colspan|style|align|class|bgcolor|width)\s*=\s*"[^"]*"\s*)+\|(.*)$/is.exec(c);
  return m ? m[1] : c;
}

export function leerVersiones(wikitexto) {
  const tabla = seccion(wikitexto, 'Versions');
  if (!tabla) return [];
  const inicio = tabla.indexOf('{|');
  if (inicio === -1) return [];
  const filas = tabla.slice(inicio).split(/\n\|-[^\n]*/);
  const encabezados = [];
  filas[0].split('\n').forEach((linea) => {
    if (linea.startsWith('!')) linea.slice(1).split('!!').forEach((h) => encabezados.push(limpiarWikitexto(celdaSinAtributos(h)).toLowerCase()));
  });
  const col = (nombre) => encabezados.findIndex((h) => h.startsWith(nombre));
  const iAnio = col('year'), iSerie = col('series'), iColor = col('color'), iFoto = col('photo'), iNum = col('col');
  const versiones = [];
  for (const fila of filas.slice(1)) {
    const celdas = [];
    fila.split('\n').forEach((linea) => {
      if (linea.startsWith('|') && !linea.startsWith('|}') && !linea.startsWith('|-')) {
        linea.slice(1).split('||').forEach((c) => celdas.push(celdaSinAtributos(c)));
      }
    });
    if (celdas.length !== encabezados.length || iFoto < 0) continue;
    const foto = /\[\[(?:File|Image):([^|\]]+)/i.exec(celdas[iFoto] ?? '');
    if (!foto) continue;
    versiones.push({
      archivo: foto[1].trim(),
      anio: (/\b(19|20)\d{2}\b/.exec(celdas[iAnio] ?? '') || [''])[0],
      serie: limpiarWikitexto(celdas[iSerie] ?? '').replace(/\s*\/\s*$/, ''),
      color: limpiarWikitexto(celdas[iColor] ?? ''),
      numero: limpiarWikitexto(celdas[iNum] ?? ''),
    });
  }
  return versiones;
}

function leerGaleria(wikitexto) {
  const m = /<gallery[^>]*>([\s\S]*?)<\/gallery>/i.exec(seccion(wikitexto, 'Gallery'));
  if (!m) return [];
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [archivo, ...pie] = l.replace(/^(File|Image):/i, '').split('|');
    return { archivo: archivo.trim(), pie: limpiarWikitexto(pie.join(' ')) };
  });
}

export async function urlsDeArchivos(nombres, ancho = 480, signal) {
  const unicos = [...new Set(nombres.filter(Boolean))];
  const mapa = new Map();
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const r = await pedirJSON(API, {
      action: 'query', titles: lote.map((n) => 'File:' + n).join('|'),
      prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(ancho),
    }, { signal });
    const normal = new Map((r?.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of r?.query?.pages ?? []) {
      const info = p.imageinfo?.[0];
      const url = imagenSegura(info?.thumburl || info?.url || '');
      if (!url) continue;
      const original = (normal.get(p.title) ?? p.title).replace(/^File:/, '');
      mapa.set(original, url);
      mapa.set(p.title.replace(/^File:/, ''), url);
    }
  }
  return mapa;
}

/* Sin la wiki solo se sabe el nombre: el museo arma el auto real con Wikipedia (auto-real.js). */
const modeloDeRespaldo = (titulo) => ({
  titulo, serieDebut: '', anios: '', disenador: '', numero: '', imagen: '', descripcion: [], baseDice: '', basadoEn: '',
  categorias: [], tipo: 'desconocido', versiones: [], galeria: [], respaldo: true,
});

export async function leerModelo(titulo) {
  try {
    return await leerDeFandom(titulo);
  } catch {
    return modeloDeRespaldo(titulo);
  }
}

async function leerDeFandom(titulo) {
  const signal = conEspera();
  const [parse, cats] = await Promise.all([
    pedirJSON(API, { action: 'parse', page: titulo, prop: 'wikitext', redirects: '1' }, { signal }),
    pedirJSON(API, { action: 'query', titles: titulo, prop: 'categories', cllimit: 'max', clshow: '!hidden', redirects: '1' }, { signal }),
  ]);
  const wikitexto = (parse?.parse?.wikitext ?? '').slice(0, TOPE_WIKITEXTO);
  if (!wikitexto) throw new Error('La wiki no devolvió esa página.');
  const categorias = (cats?.query?.pages?.[0]?.categories ?? []).map((c) => c.title.replace(/^Category:/, ''));

  const descripcion = limpiarWikitexto(seccion(wikitexto, 'Description'))
    .split(/\n+/).map((p) => p.trim()).filter((p) => p && !/^[*#:;|{!]/.test(p)).slice(0, 3);
  const baseDice = (/base[^.]{0,40}?reads\s*'''([^']+)'''/i.exec(wikitexto) || [])[1] || '';
  const basadoEn = (/casting (?:is )?(?:based on|a replica of|modeled after)\s+(?:an?\s+|the\s+)?([^.;\n]{3,80})/i.exec(limpiarWikitexto(seccion(wikitexto, 'Description'))) || [])[1] || '';

  const versiones = leerVersiones(wikitexto).filter((v) => !SIN_FOTO.test(v.archivo));
  const galeria = leerGaleria(wikitexto).filter((g) => !SIN_FOTO.test(g.archivo)).slice(0, 24);
  const imagenPrincipal = campoPlantilla(wikitexto, 'image');
  const urls = await urlsDeArchivos([...versiones.map((v) => v.archivo), ...galeria.map((g) => g.archivo), imagenPrincipal], 480, signal);
  versiones.forEach((v) => { v.foto = urls.get(v.archivo) || ''; });

  const licenciado = categorias.includes('Licensed Hot Wheels');
  const original = categorias.some((c) => /Unlicensed Hot Wheels|Hot Wheels Original Designs/i.test(c));

  return {
    titulo: parse.parse.title || titulo,
    serieDebut: campoPlantilla(wikitexto, 'series'),
    anios: campoPlantilla(wikitexto, 'years').replace(/\s*-\s*present\b/i, '–hoy').replace(/\bpresent\b/i, 'hoy'),
    disenador: campoPlantilla(wikitexto, 'designer'),
    numero: campoPlantilla(wikitexto, 'number'),
    imagen: urls.get(imagenPrincipal) || '',
    descripcion, baseDice, basadoEn, categorias,
    tipo: licenciado ? 'licenciado' : original ? 'original' : 'desconocido',
    versiones: versiones.filter((v) => v.foto),
    galeria: galeria.map((g) => ({ ...g, foto: urls.get(g.archivo) || '' })).filter((g) => g.foto),
  };
}
