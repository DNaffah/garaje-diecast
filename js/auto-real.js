/* Aquí se busca el carro de verdad detrás de cada miniatura.
   Lo delicado es no mezclar generaciones: un '67 Camaro no es el de 2019. Por eso se cruzan
   los años de producción del artículo de Wikipedia con el año o el código del modelo. */
import { pedirJSON, imagenSegura } from './wiki.js';

const EN = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';

const MARCAS = ['Acura','Alfa Romeo','AMC','Aston Martin','Audi','Austin','Bentley','BMW','Bugatti','Buick','Cadillac','Chevrolet','Chrysler','Citroën','Datsun','DeLorean','De Tomaso','Dodge','Ferrari','Fiat','Ford','GMC','Honda','Hummer','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mercedes-AMG','Mercury','Mini','Mitsubishi','Nissan','Oldsmobile','Opel','Pagani','Peugeot','Plymouth','Pontiac','Porsche','Prince','RAM','Renault','Rivian','Rolls-Royce','Shelby','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'];
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
  const entreParentesis = ((/\(([^)]+)\)/.exec(t) || [])[1] || '').trim();
  let codigo = /^[A-Z]{0,5}\d{2,3}[A-Z]?$/.test(entreParentesis) ? entreParentesis : '';
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [alias, m] of Object.entries(ALIAS)) t = t.replace(new RegExp(`\\b${alias}\\b`, 'i'), m);
  if (!codigo) codigo = (/\b([A-Z]{1,3}\d{1,3}[A-Z]?)\b/.exec(t) || [])[1] || '';
  const anio = (/\b(19|20)\d{2}\b/.exec(t) || [''])[0];
  let modelo = t.replace(/\b(19|20)\d{2}\b/, '').replace(new RegExp(`\\b${escaparRe(marca || '¤')}\\b`, 'i'), '').replace(/\s+/g, ' ').trim();
  if (codigo) modelo = modelo.replace(new RegExp(`\\b${escaparRe(codigo)}\\b`), '').replace(/\s+/g, ' ').trim();
  const consulta = [anio, marca, modelo].filter(Boolean).join(' ');
  return { consulta, marca, modelo, anio, codigo };
}

const codigoCortoDe = (codigo) => (/[A-Z]?\d+[A-Z]?$/.exec(codigo || '') || [''])[0];
const tokens = (texto) => texto.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);

const UNIDADES = {
  in: [25.4, 'mm', 0], mm: [1, 'mm', 0], ft: [304.8, 'mm', 0], lb: [0.4536, 'kg', 0], kg: [1, 'kg', 0],
  mph: [1.609, 'km/h', 0], 'km/h': [1, 'km/h', 0], kmh: [1, 'km/h', 0], cuin: [0.016387, 'L', 1], 'cu in': [0.016387, 'L', 1],
  cc: [0.001, 'L', 1], l: [1, 'L', 1], hp: [1, 'hp', 0], bhp: [1, 'hp', 0], ps: [0.9863, 'hp', 0], kw: [1.341, 'hp', 0],
  'lb·ft': [1.356, 'N·m', 0], lbft: [1.356, 'N·m', 0], 'lb-ft': [1.356, 'N·m', 0], nm: [1, 'N·m', 0], 'n·m': [1, 'N·m', 0],
};
function aMetrico(numero, unidad) {
  const n = Number(String(numero).replace(/,/g, ''));
  const u = UNIDADES[unidad.trim().toLowerCase()];
  if (!u || !Number.isFinite(n)) return `${numero} ${unidad.trim()}`;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: u[2] }).format(n * u[0])} ${u[1]}`;
}

/* Muchos artículos cubren varias generaciones y anotan años: "manual (1969–1998) · 6 velocidades (1999–2002)".
   Aquí se deja solo lo que corresponde al año del modelo; si no se sabe el año, se deja todo. */
function soloDelAnio(valor, anio) {
  if (!anio) return valor;
  const partes = valor.split(' · ');
  const conAnios = partes.map((p) => ({ p, anios: (p.match(/(?<!\d)(19|20)\d{2}(?!\d)/g) || []).map(Number), hasta: /present/i.test(p) }));
  if (!conAnios.some((x) => x.anios.length)) return valor;
  const cubre = (x) => {
    if (!x.anios.length) return false;
    const desde = Math.min(...x.anios), fin = x.hasta ? 9999 : Math.max(...x.anios);
    return Number(anio) >= desde - 1 && Number(anio) <= fin + 1;
  };
  const exactas = conAnios.filter((x) => x.anios.length === 1 && x.anios[0] === Number(anio));
  const elegidas = (exactas.length ? exactas : conAnios.filter(cubre)).map((x) => x.p.replace(/\s*\((?:MY)?\s*(19|20)\d{2}[^)]*\)/g, '').trim());
  return elegidas.length ? [...new Set(elegidas)].join(' · ') : partes[0];
}

function sinPlantillas(v) {
  let s = v.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\{\{\s*(?:convert|cvt)\s*\|\s*([\d.,]+)\s*\|\s*([^|}]+)[^{}]*\}\}/gi, (_, n, u) => aMetrico(n, u))
      .replace(/\{\{\s*(?:ubl|unbulleted list|plainlist|flatlist|hlist|bulleted list|nowrap|small|nobr)\s*\|([^{}]*)\}\}/gi, (_, x) => x.split('|').map((y) => y.trim()).filter((y) => y && !y.includes('=')).join(' · '))
      .replace(/\{\{\s*(?:start date|start year|end date)\s*\|\s*(\d{4})[^{}]*\}\}/gi, '$1')
      .replace(/\{\{[^{}]*\}\}/g, '');
  }
  return s
    .replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '')
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]#]*)(#[^\]]*)?\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s([^\]]+)\]/g, '$1')
    .replace(/'{2,}/g, '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/^\s*\*\s*/gm, ' · ').replace(/\s*·\s*(·\s*)+/g, ' · ')
    .replace(/\s+/g, ' ').replace(/^\s*·\s*|\s*·\s*$/g, '').trim();
}

function bloqueInfobox(wikitexto) {
  const i = wikitexto.search(/\{\{\s*Infobox (automobile|car)/i);
  if (i < 0) return '';
  let nivel = 0;
  for (let k = i; k < wikitexto.length - 1; k++) {
    if (wikitexto[k] === '{' && wikitexto[k + 1] === '{') { nivel++; k++; }
    else if (wikitexto[k] === '}' && wikitexto[k + 1] === '}') { nivel--; k++; if (nivel === 0) return wikitexto.slice(i, k + 1); }
  }
  return '';
}

function camposInfobox(bloque) {
  const campos = {};
  let nivel = 0, actual = '', partes = [];
  for (let k = 0; k < bloque.length; k++) {
    const c = bloque[k], d = bloque[k + 1];
    if ((c === '{' && d === '{') || (c === '[' && d === '[')) { nivel++; actual += c + d; k++; continue; }
    if ((c === '}' && d === '}') || (c === ']' && d === ']')) { nivel--; actual += c + d; k++; continue; }
    if (c === '|' && nivel === 1) { partes.push(actual); actual = ''; continue; }
    actual += c;
  }
  partes.push(actual.replace(/\}\}\s*$/, ''));
  for (const p of partes.slice(1)) {
    const m = /^\s*([a-z_ 0-9]+?)\s*=\s*([\s\S]*)$/i.exec(p);
    if (m) campos[m[1].toLowerCase().replace(/\s+/g, '_')] = m[2];
  }
  return campos;
}

function rangoProduccion(texto) {
  const anios = (texto.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
  if (!anios.length) return null;
  const hasta = /present/i.test(texto) ? new Date().getFullYear() : Math.max(...anios);
  return [Math.min(...anios), hasta];
}

const TRADUCCIONES = [
  [/\bFR layout\b/i, 'Motor delantero, tracción trasera'], [/\bFF layout\b/i, 'Motor delantero, tracción delantera'],
  [/\bMR layout\b/i, 'Motor central, tracción trasera'], [/\bRR layout\b/i, 'Motor trasero, tracción trasera'],
  [/\bF4 layout\b/i, 'Motor delantero, tracción total'],
  [/\bstraight[- ]six( engine)?\b/gi, '6 cilindros en línea'], [/\bstraight[- ]four( engine)?\b/gi, '4 cilindros en línea'],
  [/\binline[- ](four|4)( engine)?\b/gi, '4 cilindros en línea'], [/\binline[- ](six|6)( engine)?\b/gi, '6 cilindros en línea'],
  [/\bflat[- ]six( engine)?\b/gi, 'bóxer de 6 cilindros'], [/\bflat[- ]four( engine)?\b/gi, 'bóxer de 4 cilindros'],
  [/\b(V6|V8|V10|V12|W16)( engine)?\b/g, '$1'], [/\btwin[- ]turbo(charged)?\b/gi, 'biturbo'], [/\bturbocharged\b/gi, 'turbo'],
  [/\bsupercharged\b/gi, 'con compresor'], [/\bnaturally aspirated\b/gi, 'atmosférico'],
  [/\b(manual|automatic) transmission\b/gi, '$1'], [/\bsemi-automatic\b/gi, 'secuencial'],
  [/\bJanuary|February|March|April|May|June|July|August|September|October|November|December\b/g, ''],
  [/front[- ]engine,? rear[- ]wheel[- ]drive/i, 'Motor delantero, tracción trasera'],
  [/front[- ]engine,? front[- ]wheel[- ]drive/i, 'Motor delantero, tracción delantera'],
  [/front[- ]engine,? (four|all)[- ]wheel[- ]drive/i, 'Motor delantero, tracción total'],
  [/rear mid[- ]engine,? rear[- ]wheel[- ]drive|mid[- ]engine,? rear[- ]wheel[- ]drive/i, 'Motor central, tracción trasera'],
  [/rear[- ]engine,? rear[- ]wheel[- ]drive/i, 'Motor trasero, tracción trasera'],
  [/\bcoup[eé]\b/gi, 'coupé'], [/\bconvertible\b/gi, 'convertible'], [/\bsedan\b/gi, 'sedán'], [/\bhatchback\b/gi, 'hatchback'],
  [/\b(\d)[- ]door (\w+(?: \w+)?)/gi, '$2 de $1 puertas'], [/\b(\d)[- ]door\b/gi, '$1 puertas'],
  [/\bstation wagon\b/gi, 'familiar'], [/\bpanel van\b/gi, 'furgón'], [/\bpickup truck\b/gi, 'pickup'], [/\bTarga top\b/gi, 'Targa'],
  [/\bmanual\b/gi, 'manual'], [/\bautomatic\b/gi, 'automática'], [/\bspeed\b/gi, 'velocidades'],
  [/\bWest Germany\b/g, 'Alemania Occidental'], [/\bGermany\b/g, 'Alemania'], [/\bJapan\b/g, 'Japón'], [/\bUnited States\b/g, 'Estados Unidos'],
  [/\bItaly\b/g, 'Italia'], [/\bUnited Kingdom\b/g, 'Reino Unido'], [/\bFrance\b/g, 'Francia'], [/\bMexico\b/g, 'México'], [/\bBrazil\b/g, 'Brasil'], [/\bSouth Korea\b/g, 'Corea del Sur'], [/\bSweden\b/g, 'Suecia'],
  [/\bSports car\b/i, 'Deportivo'], [/\bpresent\b/gi, 'hoy'], [/\bMuscle car\b/i, 'Muscle car'], [/\bPony car\b/i, 'Pony car'], [/\bGrand tourer\b/i, 'Gran turismo'],
];
const traducir = (v) => TRADUCCIONES.reduce((s, [re, es]) => s.replace(re, es), v).replace(/\b(engine|transmission|layout)\b/gi, '')
  .replace(/(\d)-velocidades/g, '$1 velocidades').replace(/\s+,/g, ',').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s*·\s*$/, '').trim();

const FILAS_FICHA = [
  ['production', 'Producción'], ['assembly', 'Ensamblaje'], ['designer', 'Diseño'], ['class', 'Categoría'],
  ['body_style', 'Carrocería'], ['layout', 'Disposición'], ['engine', 'Motor'], ['power', 'Potencia'],
  ['transmission', 'Transmisión'], ['top_speed', 'Velocidad máxima'], ['weight', 'Peso'], ['length', 'Largo'],
];

/* Varios motores en la misma generación: se resume como "De 3,8 L a 6,5 L · 6 cilindros en línea y V8". */
function resumirMotores(valor) {
  const partes = valor.split(' · ');
  if (partes.length < 3) return valor;
  const litros = [...valor.matchAll(/(\d+(?:,\d+)?) L\b/g)].map((m) => Number(m[1].replace(',', '.')));
  const tipos = ['6 cilindros en línea', '4 cilindros en línea', 'bóxer de 6 cilindros', 'bóxer de 4 cilindros', 'V6', 'V8', 'V10', 'V12', 'W16'].filter((t) => valor.includes(t));
  if (litros.length < 2) return partes.slice(0, 2).join(' · ');
  const f = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);
  const min = Math.min(...litros), max = Math.max(...litros);
  const rango = min === max ? `${f(min)} L` : `De ${f(min)} L a ${f(max)} L`;
  return tipos.length ? `${rango} · ${tipos.join(' y ')}` : rango;
}

function sinRepetidos(valor) {
  const partes = [...new Set(valor.split(' · ').map((p) => p.trim()).filter(Boolean))];
  return partes.filter((p) => !partes.some((q) => q !== p && q.toLowerCase().includes(p.toLowerCase()))).join(' · ');
}

function fichaDesde(campos, anio, produccion) {
  return FILAS_FICHA.map(([k, etiqueta]) => {
    let v = campos[k] ? sinPlantillas(campos[k]) : '';
    if (!v) return null;
    if (k === 'production') {
      if (produccion) return { etiqueta, valor: produccion };
      const rango = rangoProduccion(soloDelAnio(v, anio));
      const texto = rango ? (rango[0] === rango[1] ? String(rango[0]) : `${rango[0]}–${rango[1] >= new Date().getFullYear() ? 'hoy' : rango[1]}`) : v;
      return { etiqueta, valor: anio && rango && rango[0] !== rango[1] ? `Año modelo ${anio} · generación ${texto}` : texto };
    }
    v = soloDelAnio(v, anio);
    v = sinRepetidos(traducir(v));
    if (k === 'engine') v = resumirMotores(v);
    if (k === 'transmission') v = v.replace(/(\d+) velocidades ((?:\p{Lu}\w+ )?)(manual|automática)/gu, (_, n, marca, tipo) => `${tipo[0].toUpperCase()}${tipo.slice(1)} ${marca}de ${n} velocidades`.replace(/\s+/g, ' '));
    if (v.length > 120) v = v.split(' · ').slice(0, 2).join(' · ');
    if (v.length > 120) v = v.slice(0, 117).replace(/\s\S*$/, '') + '…';
    return v ? { etiqueta, valor: v } : null;
  }).filter(Boolean);
}

const NO_ES_EL_AUTO = /\b(engine|list of|transmission|motorsport|racing|in popular culture|video game|concept|platform|chassis|tuner|company|museum|disambiguation)\b/i;
const PALABRAS_GENERACION = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|generation|series|\d{4}|–|-|\(|\)|classic)$/i;

async function articuloDeGeneracion(datos) {
  const { marca, modelo, anio, codigo } = datos;
  const corto = codigoCortoDe(codigo);
  const busqueda = [marca, modelo, codigo || anio].filter(Boolean).join(' ');
  const r = await pedirJSON(EN, { action: 'query', list: 'search', srsearch: busqueda, srlimit: '10' });
  let titulos = (r?.query?.search ?? []).map((x) => x.title);
  if (codigo) {
    const primera = tokens(modelo)[0] || '';
    const r2 = await pedirJSON(EN, { action: 'query', list: 'search', srsearch: `${marca} ${primera} ${corto || codigo}`, srlimit: '6' }).catch(() => null);
    titulos = [...new Set([...(r2?.query?.search ?? []).map((x) => x.title), ...titulos])];
  }
  titulos = titulos.filter((t) => !NO_ES_EL_AUTO.test(t)).slice(0, 12);
  if (!titulos.length) return null;
  const p = await pedirJSON(EN, {
    action: 'query', titles: titulos.join('|'), prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main',
    piprop: 'original', redirects: '1',
  });
  const modeloTokens = tokens(modelo).filter((w) => !/^(19|20)\d{2}$/.test(w));
  const marcaTok = (marca || '').toLowerCase().split(/[\s-]/)[0];
  let mejor = null;
  for (const pag of p?.query?.pages ?? []) {
    const texto = pag.revisions?.[0]?.slots?.main?.content || '';
    const campos = camposInfobox(bloqueInfobox(texto));
    const t = pag.title.toLowerCase();
    const portada = decodeURIComponent((pag.original?.source || '').split('/').pop() || '').replace(/_/g, ' ');
    const presentes = modeloTokens.filter((k) => t.includes(k)).length;
    const reCodigo = codigo ? new RegExp(`\\b(${escaparRe(codigo)}|${escaparRe(corto || codigo)})\\b`, 'i') : null;
    const codigoEnTitulo = Boolean(reCodigo?.test(pag.title));
    const nombraCodigo = codigoEnTitulo || Boolean(reCodigo?.test(portada));
    const tieneModelo = presentes > 0 || nombraCodigo;
    const tieneMarca = !marcaTok || t.includes(marcaTok) || (campos.manufacturer || '').toLowerCase().includes(marcaTok);
    if (!tieneModelo || !tieneMarca || !Object.keys(campos).length) continue;
    const rango = rangoProduccion(sinPlantillas(campos.production || campos.model_years || ''));
    let puntos = 0;
    puntos += presentes * 2 - (modeloTokens.length - presentes) * 4;
    if (anio && rango) puntos += Number(anio) >= rango[0] && Number(anio) <= rango[1] ? 10 - Math.min(5, (rango[1] - rango[0]) / 10) : -20;
    if (codigoEnTitulo) puntos += 15;
    else if (nombraCodigo) puntos += 5;
    const extra = pag.title.split(/[\s()]+/).filter((w) => w && !modeloTokens.includes(w.toLowerCase()) && w.toLowerCase() !== marcaTok && !PALABRAS_GENERACION.test(w) && !(reCodigo && reCodigo.test(w)));
    puntos -= extra.length * 3;
    if (!mejor || puntos > mejor.puntos) mejor = { puntos, titulo: pag.title, campos, rango, portada: pag.original };
  }
  return mejor;
}

const IMAGEINFO = { prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'Artist|LicenseShortName' };
const DESCARTAR = /\b(interior|engine|motor(?! ?show)|dashboard|cockpit|badge|logo|emblem|wheels?|rims?|seats?|steering|trunk|details?|hot ?wheels|matchbox|diecast|die-cast|scale|lego|toys?|tamiya|model kit|brochure|advert\w*|crash\w*|wreck\w*|license plate|lamps?|grille|hood ornament|chassis|frame|tail ?lights?|headlights?|mirrors?|door handle|miniature|replica|modell?|dett|vin|police|polizei|race|racing|rally|gt500|jgtc|super gt|le mans|livery|drift|nascar|xanavi|calsonic|crowd|people|parking|street|traffic|for sale|rusty|abandoned|barn|restoration|project|parts?|cutaway|sketch|drawing|diagram|map)\b/i;
/* Motores, carros modificados o tuneados: no sirven para mostrar el carro tal como salió de fábrica. */
const NO_DE_FABRICA = /dett|\brb\d{2}|\b\d[a-z]{1,2}-?g?te\b|engine bay|\b(tuned|modified|custom|widebody|wide body|liberty walk|rocket bunny|stance[d]?|drag|lowrider|rat rod|hot rod|replica)\b/i;

const ANGULOS = [
  [/front[\s_,-]*(left|l\b)|left[\s_,-]*front|vorne[\s_-]*links|avant[\s_-]*gauche|\bfl\b/i, 'Frente izquierdo', 0],
  [/front[\s_,-]*(right|r\b)|right[\s_,-]*front|vorne[\s_-]*rechts|avant[\s_-]*droit|\bfr\b/i, 'Frente derecho', 1],
  [/\b(front|vorne|avant|frontal)\b/i, 'Frente', 0.5],
  [/\b(side|profile|seite|lateral)\b/i, 'Lateral', 2],
  [/rear[\s_,-]*(right|r\b)|right[\s_,-]*rear|hinten[\s_-]*rechts|\brr\b/i, 'Trasera derecha', 3],
  [/rear[\s_,-]*(left|l\b)|left[\s_,-]*rear|hinten[\s_-]*links|\brl\b/i, 'Trasera izquierda', 4],
  [/\b(rear|back|hinten|heck|arrière|trasera)\b/i, 'Trasera', 3.5],
];
const anguloDe = (n) => { for (const [re, texto, orden] of ANGULOS) if (re.test(n)) return { texto, orden }; return null; };
const ANGULO_PALABRAS = /\b(front|rear|back|side|profile|left|right|vorne|hinten|links|rechts|seite|heck|avant|arrière|gauche|droit|fl|fr|rr|rl|view|three[- ]quarters?|3\/4)\b/gi;

/* Si dos fotos se llaman igual salvo por "front" o "rear", casi siempre son del mismo carro
   y del mismo fotógrafo. Con eso se arma el recorrido sin mezclar carros. */
export function llaveSerie(nombre) {
  return nombre.toLowerCase().replace(/\.[a-z]{3,4}$/, '').replace(ANGULO_PALABRAS, ' ')
    .replace(/\(cropped\)|\(\d{1,2}\)|\b\d{1,3}\b|\bimg\b/g, ' ').replace(/[^a-z0-9äöüéèàñ]+/g, ' ').trim();
}

function textoPlano(html = '') {
  const doc = new DOMParser().parseFromString(`<p>${html}</p>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function candidataDe(p) {
  const info = p.imageinfo?.[0];
  if (!info) return null;
  const nombre = p.title.replace(/^(File|Archivo):/, '');
  if (/\.(svg|gif|tiff?)$/i.test(nombre) || DESCARTAR.test(nombre) || NO_DE_FABRICA.test(nombre)) return null;
  const proporcion = info.width / info.height;
  if (info.width < 1000 || proporcion < 1.25 || proporcion > 2.4) return null;
  const url = imagenSegura(info.thumburl || info.url);
  if (!url) return null;
  const meta = info.extmetadata || {};
  return {
    url, nombre, angulo: anguloDe(nombre), serie: llaveSerie(nombre), deArticulo: Boolean(p.deArticulo),
    autor: textoPlano(meta.Artist?.value), licencia: textoPlano(meta.LicenseShortName?.value),
    pagina: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
  };
}

function coincide(nombre, datos) {
  const { anio, codigo } = datos;
  if (codigo) {
    const corto = codigoCortoDe(codigo);
    return new RegExp(`\\b(${escaparRe(codigo)}${corto && corto !== codigo ? '|' + escaparRe(corto) : ''})\\b`, 'i').test(nombre);
  }
  if (anio) return (nombre.match(/\b(?:19|20)\d{2}\b/g) || []).some((y) => Math.abs(Number(y) - Number(anio)) <= 2);
  return true;
}

async function fotosCandidatas(datos, articulo) {
  const lotes = [];
  if (articulo) {
    const r = await pedirJSON(EN, { action: 'query', titles: articulo.titulo, generator: 'images', gimlimit: '80', ...IMAGEINFO });
    lotes.push(...(r?.query?.pages ?? []).map((pag) => ({ ...pag, deArticulo: true })));
  }
  const busqueda = [datos.anio, datos.marca, datos.modelo, datos.codigo].filter(Boolean).join(' ');
  const c = await pedirJSON(COMMONS, { action: 'query', generator: 'search', gsrsearch: `${busqueda} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40', ...IMAGEINFO }).catch(() => null);
  lotes.push(...(c?.query?.pages ?? []));
  const vistas = new Set();
  const modeloTok = tokens(datos.modelo)[0] || '';
  return lotes.map(candidataDe).filter((x) => {
    if (!x || vistas.has(x.nombre)) return false;
    vistas.add(x.nombre);
    return coincide(x.nombre, datos) && (Boolean(datos.codigo) || !modeloTok || x.nombre.toLowerCase().includes(modeloTok));
  });
}

/* La foto de portada la escogen los editores de Wikipedia, así que es la primera opción,
   siempre que sea del año o del código del modelo. */
function portadaValida(articulo, datos) {
  const src = articulo?.portada?.source;
  if (!src || !imagenSegura(src)) return null;
  const nombre = decodeURIComponent(src.split('/').pop().split('?')[0]).replace(/_/g, ' ');
  if (DESCARTAR.test(nombre) || NO_DE_FABRICA.test(nombre)) return null;
  const tieneAnioOCodigo = /\b(19|20)\d{2}\b/.test(nombre) || (datos.codigo && /[A-Z]\d{2}/.test(nombre));
  const generacionAngosta = articulo.rango && articulo.rango[1] - articulo.rango[0] <= 12;
  if (!coincide(nombre, datos) && (tieneAnioOCodigo || !generacionAngosta)) return null;
  return { url: imagenSegura(src), nombre, angulo: anguloDe(nombre), serie: llaveSerie(nombre), autor: '', licencia: '', pagina: `https://en.wikipedia.org/wiki/${encodeURIComponent(articulo.titulo.replace(/ /g, '_'))}` };
}

export function recorridoDesde(principal, candidatas) {
  const usadas = new Set([principal.nombre]);
  const angulos = new Set([principal.angulo?.orden ?? 'principal']);
  const vuelta = [principal];
  const tomar = (lista) => {
    for (const c of lista) {
      if (vuelta.length >= 5) return;
      if (usadas.has(c.nombre)) continue;
      const clave = c.angulo?.orden ?? `sin-${c.nombre}`;
      if (c.angulo && angulos.has(clave)) continue;
      usadas.add(c.nombre);
      angulos.add(clave);
      vuelta.push(c);
    }
  };
  /* Primero otros ángulos del mismo carro; después otras fotos verificadas del mismo modelo
     y generación, empezando por las que eligió Wikipedia y por las que dicen su ángulo. */
  const porAngulo = (a, b) => (a.angulo?.orden ?? 9) - (b.angulo?.orden ?? 9);
  tomar(candidatas.filter((c) => c.serie === principal.serie).sort(porAngulo));
  tomar(candidatas.filter((c) => c.serie !== principal.serie)
    .sort((a, b) => (Number(b.deArticulo) - Number(a.deArticulo)) || (Number(Boolean(b.angulo)) - Number(Boolean(a.angulo))) || porAngulo(a, b)));
  return vuelta;
}

function mejorPrincipal(candidatas) {
  const puntos = (c) => (c.angulo ? 3 - Math.min(c.angulo.orden, 3) * 0.5 : 0) + candidatas.filter((x) => x.serie === c.serie).length * 2;
  return [...candidatas].sort((a, b) => puntos(b) - puntos(a))[0] || null;
}

async function articuloEspanol(tituloEn) {
  const r = await pedirJSON(EN, { action: 'query', titles: tituloEn, prop: 'langlinks', lllang: 'es', redirects: '1' });
  const es = r?.query?.pages?.[0]?.langlinks?.[0]?.title;
  const titulo = es || tituloEn;
  const idioma = es ? 'es' : 'en';
  const s = await fetch(`https://${idioma}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo.replace(/ /g, '_'))}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!s?.extract) return null;
  return { titulo: s.title, extracto: s.extract, idioma, url: `https://${idioma}.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, '_'))}` };
}

function produccionDeDescripcion(datos, modelo) {
  if (!datos.codigo || datos.anio) return '';
  const texto = (modelo.descripcion || []).join(' ');
  const inicio = anioDeReferencia(datos, modelo);
  const fin = (/\b(?:production ended|ended production|discontinued|until|produced until)\b[^.]{0,40}?\b((?:19|20)\d{2})\b/i.exec(texto) || [])[1];
  const gen = codigoCortoDe(datos.codigo) || datos.codigo;
  if (inicio && fin && Number(fin) >= Number(inicio)) return `${inicio}–${fin} · generación ${gen}`;
  return inicio ? `Desde ${inicio} · generación ${gen}` : '';
}

function anioDeReferencia(datos, modelo) {
  if (datos.anio) return datos.anio;
  const texto = (modelo.descripcion || []).join(' ');
  if (datos.codigo) {
    const corto = codigoCortoDe(datos.codigo);
    const frase = texto.split(/(?<=\.)\s+/).find((f) => new RegExp(`\\b(${escaparRe(datos.codigo)}|${escaparRe(corto)})\\b`).test(f));
    const anio = (/\b((?:19|20)\d{2})\b/.exec(frase || '') || [])[1];
    if (anio) return anio;
  }
  return (/\b(?:introduced|produced|released|launched|debuted|unveiled)\b[^.]{0,50}?\b((?:19|20)\d{2})\b/i.exec(texto) || [])[1] || '';
}

export async function leerAutoReal(modelo) {
  const marca = marcaDe(modelo.titulo, modelo.categorias);
  const datos = consultaDelAuto(modelo.titulo, marca);
  const articulo = await articuloDeGeneracion(datos).catch(() => null);
  const [candidatas, texto] = await Promise.all([
    fotosCandidatas(datos, articulo).catch(() => []),
    articulo ? articuloEspanol(articulo.titulo).catch(() => null) : null,
  ]);
  let portada = portadaValida(articulo, datos);
  if (portada && datos.anio && !portada.nombre.includes(datos.anio)) {
    const delAnio = candidatas.filter((c) => c.nombre.includes(datos.anio));
    if (delAnio.length) portada = null;
  }
  const todas = portada ? [portada, ...candidatas.filter((c) => c.nombre !== portada.nombre)] : candidatas;
  const exactas = datos.anio ? candidatas.filter((c) => c.nombre.includes(datos.anio)) : [];
  const principal = portada || mejorPrincipal(exactas.length ? exactas : candidatas);
  const nombreReal = [datos.marca, datos.modelo].filter(Boolean).join(' ') + (datos.anio ? ` · ${datos.anio}` : datos.codigo ? ` · ${codigoCortoDe(datos.codigo) || datos.codigo}` : '');
  return {
    marca, datos, nombreReal,
    articulo: articulo ? { titulo: articulo.titulo, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(articulo.titulo.replace(/ /g, '_'))}` } : null,
    texto,
    ficha: articulo ? fichaDesde(articulo.campos, anioDeReferencia(datos, modelo), produccionDeDescripcion(datos, modelo)) : [],
    candidatas: todas.slice(0, 16),
    recorrido: principal ? recorridoDesde(principal, exactas.length >= 3 ? exactas : todas) : [],
  };
}
