// El auto de calle en que se basa la miniatura: texto de Wikipedia (español si existe),
// ficha desde Wikidata y fotos de varios ángulos desde Wikimedia Commons.
import { pedirJSON, imagenSegura } from './wiki.js';

const MARCAS = ['Acura','Alfa Romeo','AMC','Aston Martin','Audi','Austin','Bentley','BMW','Bugatti','Buick','Cadillac','Chevrolet','Chrysler','Citroën','Datsun','DeLorean','DeTomaso','De Tomaso','Dodge','Ferrari','Fiat','Ford','GMC','Honda','Hummer','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mercedes-AMG','Mercury','Mini','Mitsubishi','Nissan','Oldsmobile','Opel','Pagani','Peugeot','Plymouth','Pontiac','Porsche','Prince','RAM','Renault','Rivian','Rolls-Royce','Shelby','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'];
const ALIAS = { Chevy: 'Chevrolet', VW: 'Volkswagen', Mercedes: 'Mercedes-Benz', Benz: 'Mercedes-Benz' };

function escaparRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function marcaDe(titulo, categorias = []) {
  for (const [alias, marca] of Object.entries(ALIAS)) if (new RegExp(`\\b${alias}\\b`, 'i').test(titulo)) return marca;
  const enTitulo = MARCAS.find((m) => new RegExp(`\\b${escaparRe(m)}\\b`, 'i').test(titulo));
  if (enTitulo) return enTitulo;
  for (const c of categorias) {
    const m = /^(.+?) (Cars|Vehicles|Automobiles|Trucks)$/.exec(c);
    if (m) {
      const encontrada = MARCAS.find((x) => x.toLowerCase() === m[1].toLowerCase()) || ALIAS[m[1]];
      if (encontrada) return encontrada;
    }
  }
  return '';
}

export function consultaDelAuto(titulo, marca) {
  let t = titulo.replace(/^'(\d{2})\s*/, (_, a) => (Number(a) > 30 ? '19' : '20') + a + ' ');
  // solo cuenta como código de chasis algo tipo "BNR34" o "E30"; "(2022)" o "(Hot Wheels XL)" no
  const entreParentesis = ((/\(([^)]+)\)/.exec(t) || [])[1] || '').trim();
  let codigo = /^[A-Z]{0,5}\d{2,3}[A-Z]?$/.test(entreParentesis) ? entreParentesis : '';
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  // o un código dentro del nombre: "Volkswagen T1 Panel Bus" → T1, "Supra MK4" → MK4
  if (!codigo) codigo = (/\b([A-Z]{1,3}\d{1,3}[A-Z]?)\b/.exec(t) || [])[1] || '';
  for (const [alias, m] of Object.entries(ALIAS)) t = t.replace(new RegExp(`\\b${alias}\\b`, 'i'), m);
  if (marca && !t.toLowerCase().includes(marca.toLowerCase())) t = `${marca} ${t}`;
  return { consulta: t, codigo };
}

function tokensModelo(consulta, marca) {
  return consulta.toLowerCase().replace(marca.toLowerCase(), '').split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(19|20)\d{2}$/.test(w));
}

// estricto: el título del artículo debe nombrar todo el modelo (p. ej. "Skyline GT-R", no solo "Skyline")
async function articulo(idioma, busqueda, marca, estricto, nombreModelo = busqueda) {
  const base = `https://${idioma}.wikipedia.org/w/api.php`;
  const r = await pedirJSON(base, { action: 'query', list: 'search', srsearch: busqueda, srlimit: '8' });
  const tokens = tokensModelo(nombreModelo, marca);
  const anio = (/\b(19|20)\d{2}\b/.exec(nombreModelo) || [''])[0];
  const validos = (r?.query?.search ?? []).filter((x) => {
    const t = x.title.toLowerCase();
    const tieneMarca = marca ? t.includes(marca.toLowerCase().split('-')[0]) : true;
    const coinciden = tokens.filter((k) => t.includes(k)).length;
    return tieneMarca && (estricto ? tokens.length > 0 && coinciden === tokens.length : coinciden > 0);
  });
  // con año (p. ej. '69 Charger): el artículo cuyo título cubre ese año, o si no el general del modelo,
  // nunca uno de otra época como "Dodge Charger (LX)"
  const cubreAnio = (titulo) => {
    if (titulo.includes(anio)) return true;
    const r = /((?:19|20)\d{2})\s*[–-]\s*((?:19|20)\d{2}|present)/i.exec(titulo);
    return !!r && Number(anio) >= Number(r[1]) && (/present/i.test(r[2]) || Number(anio) <= Number(r[2]));
  };
  const candidato = anio
    ? validos.find((x) => cubreAnio(x.title)) || validos.find((x) => !x.title.includes('('))
    : validos[0];
  if (!candidato) return null;
  const s = await fetch(`https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidato.title.replace(/ /g, '_'))}`).then((x) => (x.ok ? x.json() : null));
  if (!s || s.type === 'disambiguation') return null;
  return {
    titulo: s.title, extracto: s.extract || '', idioma,
    url: `https://${idioma}.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}`,
    wikidata: s.wikibase_item || '',
  };
}

const PROPIEDADES = [
  ['P176', 'Fabricante'],
  ['P495', 'País de origen'],
  ['P2031', 'Producción desde'],
  ['P2032', 'Producción hasta'],
  ['P571', 'Lanzamiento'],
  ['P287', 'Diseñado por'],
  ['P2109', 'Potencia'],
  ['P2052', 'Velocidad máxima'],
  ['P2067', 'Peso'],
  ['P2043', 'Largo'],
];

async function ficha(qid) {
  if (!/^Q\d+$/.test(qid)) return [];
  const W = 'https://www.wikidata.org/w/api.php';
  const r = await pedirJSON(W, { action: 'wbgetentities', ids: qid, props: 'claims' });
  const claims = r?.entities?.[qid]?.claims ?? {};
  const filas = [];
  const porResolver = new Set();
  for (const [p, etiqueta] of PROPIEDADES) {
    const v = claims[p]?.[0]?.mainsnak?.datavalue;
    if (!v) continue;
    if (v.type === 'wikibase-entityid') { filas.push({ etiqueta, id: v.value.id }); porResolver.add(v.value.id); }
    else if (v.type === 'time') filas.push({ etiqueta, texto: (/[+-](\d{4})/.exec(v.value.time) || [])[1] || '' });
    else if (v.type === 'quantity') {
      const unidad = (/Q\d+$/.exec(v.value.unit || '') || [])[0];
      if (unidad) porResolver.add(unidad);
      filas.push({ etiqueta, cantidad: Number(v.value.amount), unidad });
    }
  }
  let etiquetas = {};
  if (porResolver.size) {
    const e = await pedirJSON(W, { action: 'wbgetentities', ids: [...porResolver].slice(0, 50).join('|'), props: 'labels', languages: 'es|en' });
    etiquetas = Object.fromEntries(Object.entries(e?.entities ?? {}).map(([k, v]) => [k, v.labels?.es?.value || v.labels?.en?.value || '']));
  }
  // Producción desde/hasta y lanzamiento: si hay periodo, no repetir el lanzamiento
  const tienePeriodo = filas.some((f) => f.etiqueta === 'Producción desde');
  return filas
    .filter((f) => !(tienePeriodo && f.etiqueta === 'Lanzamiento'))
    .map((f) => {
      if (f.id) return { etiqueta: f.etiqueta, valor: etiquetas[f.id] || '' };
      if (f.cantidad !== undefined) {
        const n = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(f.cantidad);
        const u = SIMBOLOS[etiquetas[f.unidad]] || etiquetas[f.unidad] || '';
        return { etiqueta: f.etiqueta, valor: u ? `${n} ${u}` : n };
      }
      return { etiqueta: f.etiqueta, valor: f.texto };
    })
    .filter((f) => f.valor);
}
const SIMBOLOS = { 'kilómetro por hora': 'km/h', 'kilometre per hour': 'km/h', 'kilogramo': 'kg', 'kilogram': 'kg', 'caballo de fuerza': 'hp', 'horsepower': 'hp', 'caballo de vapor': 'CV', 'metric horsepower': 'CV', 'kilovatio': 'kW', 'kilowatt': 'kW', 'milímetro': 'mm', 'millimetre': 'mm', 'metro': 'm', 'metre': 'm', 'milla por hora': 'mph', 'mile per hour': 'mph' };

// --- fotos de varios ángulos desde Commons ---
const DESCARTAR = /\b(interior|engine|motor(?! ?show)|dashboard|cockpit|badge|logo|emblem|wheels?|rims?|seats?|steering|trunk|details?|hot ?wheels|matchbox|diecast|die-cast|scale|1[_:]\d+|lego|toys?|tamiya|model kit|brochure|advert\w*|crash\w*|wreck\w*|license plate|lamps?|grille|hood ornament|chassis|frame|tail ?lights?|headlights?|mirrors?|door handle|miniature|replica|modell?)\b/i;
const ANGULOS = [
  [/front[\s_-]*(left|l\b)|left[\s_-]*front|vorne[\s_-]*links|avant[\s_-]*gauche/i, 315, 'Frente, lado izquierdo'],
  [/front[\s_-]*(right|r\b)|right[\s_-]*front|vorne[\s_-]*rechts|avant[\s_-]*droit/i, 45, 'Frente, lado derecho'],
  [/rear[\s_-]*(right|r\b)|right[\s_-]*rear|hinten[\s_-]*rechts|arrière[\s_-]*droit/i, 135, 'Trasera, lado derecho'],
  [/rear[\s_-]*(left|l\b)|left[\s_-]*rear|hinten[\s_-]*links|arrière[\s_-]*gauche/i, 225, 'Trasera, lado izquierdo'],
  [/\b(front|vorne|avant|frontal)\b/i, 20, 'Frente'],
  [/\b(rear|back|hinten|heck|arrière|trasera)\b/i, 180, 'Trasera'],
  [/\b(side|profile|seite|lateral)\b/i, 90, 'Lateral'],
];

function anguloDe(nombre) {
  for (const [re, grados, texto] of ANGULOS) if (re.test(nombre)) return { grados, texto };
  return null;
}

function textoPlano(html = '') {
  const doc = new DOMParser().parseFromString(`<p>${html}</p>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

const IMAGEINFO = { prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1400', iiextmetadatafilter: 'Artist|LicenseShortName' };
const MENOS_PUNTOS = /\b(police|polizei|race|racing|rally|gt500|jgtc|super gt|le mans|livery|drift|nascar|xanavi|calsonic|people|crowd|parking|street|traffic|for sale|rusty|abandoned)\b/i;

// Fuentes: 1º las fotos que usa el artículo de Wikipedia del modelo (curadas); 2º búsqueda en Commons.
async function fotosDelArticulo(articuloEn) {
  if (!articuloEn) return [];
  const r = await pedirJSON('https://en.wikipedia.org/w/api.php', { action: 'query', titles: articuloEn.titulo, generator: 'images', gimlimit: '80', ...IMAGEINFO });
  return (r?.query?.pages ?? []).map((p) => ({ ...p, deArticulo: true }));
}
async function fotosDeCommons(consulta, codigo) {
  const r = await pedirJSON('https://commons.wikimedia.org/w/api.php', {
    action: 'query', generator: 'search', gsrsearch: `${consulta} ${consulta.includes(codigo) ? '' : codigo} filetype:bitmap`.replace(/\s+/g, ' ').trim(), gsrnamespace: '6', gsrlimit: '40', ...IMAGEINFO,
  });
  return r?.query?.pages ?? [];
}

// Regla para que todas las fotos sean del mismo auto: si el modelo trae código (R34, T1) o año ('67),
// solo entran fotos que lo nombren (el año con ±3 de margen, misma generación).
// Si no hay al menos 2, no se muestran fotos de otro auto: el recorrido usa las versiones de la miniatura.
export async function fotosDelAuto(consulta, codigo, articuloEn) {
  const anio = (/\b(19|20)\d{2}\b/.exec(consulta) || [''])[0];
  const exigeCoincidencia = Boolean(codigo || anio);
  let paginas = await fotosDelArticulo(articuloEn);
  let candidatas = puntuar(paginas, consulta, codigo, anio);
  const suficientes = () => (exigeCoincidencia ? candidatas.filter((c) => c.delModelo).length >= 3 : candidatas.length >= 4);
  if (!suficientes()) {
    paginas = [...paginas, ...await fotosDeCommons(consulta, codigo).catch(() => [])];
    candidatas = puntuar(paginas, consulta, codigo, anio);
  }
  let base = exigeCoincidencia ? candidatas.filter((c) => c.delModelo) : candidatas.filter((c) => c.puntos > 0);
  if (exigeCoincidencia && base.length < 2) return [];
  // autos de carreras, de policía o de calle con gente: fuera, si quedan al menos 3 fotos limpias
  const limpias = base.filter((c) => !c.penalizada);
  if (limpias.length >= 3) base = limpias;
  return ordenarVuelta(base);
}

function puntuar(paginas, consulta, codigo, anio) {
  const codigoCorto = (/[A-Z]?\d+[A-Z]?$/.exec(codigo) || [''])[0]; // BNR34 → R34
  const reCodigo = codigo ? new RegExp(`\\b(${escaparRe(codigo)}${codigoCorto.length > 1 && codigoCorto !== codigo ? '|' + escaparRe(codigoCorto) : ''})\\b`, 'i') : null;
  const enRango = (nombre) => (nombre.match(/\b(?:19|20)\d{2}\b/g) || []).some((y) => Math.abs(Number(y) - Number(anio)) <= 2);
  const tokens = tokensModelo(consulta, '');
  const vistas = new Set();
  const candidatas = [];
  for (const p of paginas) {
    if (vistas.has(p.title)) continue;
    vistas.add(p.title);
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const nombre = p.title.replace(/^(File|Archivo):/, '');
    if (/\.svg$/i.test(nombre) || DESCARTAR.test(nombre) || /dett|engine|vin\b/i.test(nombre)) continue;
    const proporcion = info.width / info.height;
    if (info.width < 900 || proporcion < 1.2 || proporcion > 2.6) continue;
    const url = imagenSegura(info.thumburl || info.url);
    if (!url) continue;
    const angulo = anguloDe(nombre);
    let puntos = p.deArticulo ? 2 : (p.index ? 30 - p.index : 0) / 10;
    if (angulo) puntos += 2;
    const delModelo = reCodigo ? reCodigo.test(nombre) : Boolean(anio) && enRango(nombre);
    if (delModelo) puntos += 6;
    if (anio && nombre.includes(anio)) puntos += 4;
    puntos += tokens.filter((k) => nombre.toLowerCase().includes(k)).length * 0.5;
    const penalizada = MENOS_PUNTOS.test(nombre);
    if (penalizada) puntos -= 3;
    const meta = info.extmetadata || {};
    candidatas.push({
      url, nombre, angulo, puntos, delModelo, penalizada,
      autor: textoPlano(meta.Artist?.value), licencia: textoPlano(meta.LicenseShortName?.value),
      pagina: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
    });
  }
  return candidatas.sort((a, b) => b.puntos - a.puntos);
}

function ordenarVuelta(base) {
  const elegidas = [];
  const angulosUsados = new Set();
  for (const c of base) {
    if (elegidas.length >= 8) break;
    if (c.angulo && angulosUsados.has(c.angulo.grados)) continue;
    if (c.angulo) angulosUsados.add(c.angulo.grados);
    elegidas.push(c);
  }
  // Orden de vuelta: arranca en el frente izquierdo y gira hacia la derecha;
  // las fotos sin ángulo conocido cierran el recorrido.
  const desdeFrente = (g) => (g - 300 + 360) % 360;
  const conAngulo = elegidas.filter((c) => c.angulo).sort((a, b) => desdeFrente(a.angulo.grados) - desdeFrente(b.angulo.grados));
  return [...conAngulo, ...elegidas.filter((c) => !c.angulo)];
}

export async function leerAutoReal(modelo) {
  const marca = marcaDe(modelo.titulo, modelo.categorias);
  const { consulta, codigo } = consultaDelAuto(modelo.titulo, marca);
  const conCodigo = `${consulta} ${codigo}`.trim();
  const [esExacto, enExacto] = await Promise.all([
    articulo('es', consulta, marca, true).catch(() => null),
    articulo('en', conCodigo, marca, true, consulta).catch(() => null),
  ]);
  // texto: español si nombra el modelo completo; si no, inglés exacto; si no, el más cercano
  const art = esExacto || enExacto
    || await articulo('es', consulta, marca, false).catch(() => null)
    || await articulo('en', conCodigo, marca, false, consulta).catch(() => null);
  const enParaFotos = enExacto || (art?.idioma === 'en' ? art : await articulo('en', conCodigo, marca, false, consulta).catch(() => null));
  const [filas, fotos] = await Promise.all([
    art?.wikidata ? ficha(art.wikidata).catch(() => []) : [],
    fotosDelAuto(consulta, codigo, enParaFotos).catch(() => []),
  ]);
  return { marca, consulta, articulo: art, ficha: filas, fotos };
}
