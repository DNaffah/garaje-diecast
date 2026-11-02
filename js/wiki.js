// Lectura de la Hot Wheels Wiki (Fandom) por su API pública de MediaWiki.
// Todo lo que viene de la wiki se trata como texto no confiable: se limpia aquí
// y se pinta siempre con textContent.

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
    // MediaWiki responde 200 con {error} cuando limita o rechaza: eso no se guarda en caché
    if (json?.error) throw new Error(json.error.info || json.error.code || 'Error de la API');
    return json;
  });
  cache.set(url, promesa);
  promesa.catch(() => cache.delete(url));
  return promesa;
}

export function imagenSegura(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_IMAGEN.includes(u.hostname) ? u.href : '';
  } catch { return ''; }
}

const SIN_FOTO = /image not available|no ?image|noimage|placeholder|coming soon/i;
const NO_SON_MODELOS = /^(List of|Category:|File:|Template:|User|\d{4}\b|Hot Wheels\b|Code 3|Base codes|Treasure Hunt)/i;

export async function buscarModelos(texto, { signal } = {}) {
  const r = await pedirJSON(API, {
    action: 'query', generator: 'search', gsrsearch: texto, gsrnamespace: '0', gsrlimit: '20',
    prop: 'pageimages|categories', piprop: 'thumbnail', pithumbsize: '200',
    // solo interesa saber si la página es un modelo: la wiki los clasifica en estas categorías
    clcategories: 'Category:1:64|Category:Licensed Hot Wheels|Category:Unlicensed Hot Wheels', cllimit: 'max',
  }, { signal });
  const paginas = r?.query?.pages ?? [];
  return paginas
    .filter((p) => p.categories?.length && !NO_SON_MODELOS.test(p.title) && !/\(disambiguation\)/i.test(p.title))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .slice(0, 14)
    .map((p) => ({ titulo: p.title, mini: imagenSegura(p.thumbnail?.source ?? '') }));
}

// --- limpieza de wikitexto ---
export function limpiarWikitexto(t = '') {
  let s = t
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  // plantillas {{...}} (hasta 3 niveles de anidación)
  for (let i = 0; i < 3; i++) s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s
    .replace(/\[\[(?:File|Image|Archivo):[^\]]*\]\]/gi, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
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
  const m = new RegExp(`\\|\\s*${campo}\\s*=\\s*([^\\n|]*(?:\\[\\[[^\\]]*\\]\\][^\\n|]*)*)`, 'i').exec(wikitexto);
  return m ? limpiarWikitexto(m[1]) : '';
}

function celdaSinAtributos(c) {
  // " rowspan="2" |Metalflake Grey" → "Metalflake Grey" (sin romper [[enlace|texto]])
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

export async function urlsDeArchivos(nombres, ancho = 480) {
  const unicos = [...new Set(nombres.filter(Boolean))];
  const mapa = new Map();
  for (let i = 0; i < unicos.length; i += 50) {
    const lote = unicos.slice(i, i + 50);
    const r = await pedirJSON(API, {
      action: 'query', titles: lote.map((n) => 'File:' + n).join('|'),
      prop: 'imageinfo', iiprop: 'url', iiurlwidth: String(ancho),
    });
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

export async function leerModelo(titulo) {
  const [parse, cats] = await Promise.all([
    pedirJSON(API, { action: 'parse', page: titulo, prop: 'wikitext', redirects: '1' }),
    pedirJSON(API, { action: 'query', titles: titulo, prop: 'categories', cllimit: 'max', clshow: '!hidden', redirects: '1' }),
  ]);
  const wikitexto = parse?.parse?.wikitext ?? '';
  if (!wikitexto) throw new Error('La wiki no devolvió esa página.');
  const categorias = (cats?.query?.pages?.[0]?.categories ?? []).map((c) => c.title.replace(/^Category:/, ''));

  const descripcion = limpiarWikitexto(seccion(wikitexto, 'Description'))
    .split(/\n+/).map((p) => p.trim()).filter((p) => p && !/^[*#:;|{!]/.test(p)).slice(0, 3);
  const baseDice = (/base[^.]{0,40}?reads\s*'''([^']+)'''/i.exec(wikitexto) || [])[1] || '';
  const basadoEn = (/casting (?:is )?(?:based on|a replica of|modeled after)\s+(?:an?\s+|the\s+)?([^.;\n]{3,80})/i.exec(limpiarWikitexto(seccion(wikitexto, 'Description'))) || [])[1] || '';

  const versiones = leerVersiones(wikitexto).filter((v) => !SIN_FOTO.test(v.archivo));
  const galeria = leerGaleria(wikitexto).filter((g) => !SIN_FOTO.test(g.archivo)).slice(0, 24);
  const imagenPrincipal = campoPlantilla(wikitexto, 'image');
  const urls = await urlsDeArchivos([...versiones.map((v) => v.archivo), ...galeria.map((g) => g.archivo), imagenPrincipal]);
  versiones.forEach((v) => { v.foto = urls.get(v.archivo) || ''; });

  const licenciado = categorias.includes('Licensed Hot Wheels');
  const original = categorias.some((c) => /Unlicensed Hot Wheels|Hot Wheels Original Designs/i.test(c));

  return {
    titulo: parse.parse.title || titulo,
    serieDebut: campoPlantilla(wikitexto, 'series'),
    anios: campoPlantilla(wikitexto, 'years'),
    disenador: campoPlantilla(wikitexto, 'designer'),
    numero: campoPlantilla(wikitexto, 'number'),
    imagen: urls.get(imagenPrincipal) || '',
    descripcion, baseDice, basadoEn, categorias,
    tipo: licenciado ? 'licenciado' : original ? 'original' : 'desconocido',
    versiones: versiones.filter((v) => v.foto),
    galeria: galeria.map((g) => ({ ...g, foto: urls.get(g.archivo) || '' })).filter((g) => g.foto),
  };
}
