// Prueba de extremo a extremo con respuestas simuladas de la wiki (sin red).
// Uso: servir la carpeta en 127.0.0.1:8164 y correr  node tests/e2e.cjs [carpeta-capturas]
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'http://127.0.0.1:8164/';
const OUT = process.argv[2] || 'capturas';

const svgAuto = (color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220"><rect width="400" height="220" fill="#d9dcdf"/><path d="M40 160 L80 110 L170 90 L260 92 L320 120 L370 150 L370 170 L40 170Z" fill="${color}"/><circle cx="110" cy="172" r="26" fill="#222"/><circle cx="300" cy="172" r="26" fill="#222"/></svg>`;

const WIKITEXTO_R34 = `{{casting
|name = Nissan Skyline GT-R (BNR34)
|series = [[2010 New Models]]
|years = [[2010]] - Present
|designer = [[Phil Riehlman]]
|number = R0922
|image = R34Sketch.png}}

==Description==
The '''Nissan Skyline GT-R''' is a series of sports cars. This casting is based on a Nissan Skyline GT-R R-Tune.<ref>x</ref>

The base of the casting reads '''Nissan Skyline GT-R R34'''; later versions changed.

==Versions==
{| class="wikitable sortable"
! style="x" |'''Col #'''
! style="x" |'''Year'''
! style="x" |'''Series'''
! style="x" |'''Color'''
! style="x" |'''Tampo'''
! style="x" |'''Photo'''
|-
|007/240
|[[List of 2010 Hot Wheels|2010]]
|[[2010 New Models]]<br>7/44
| rowspan="2" |Metalflake Grey
| rowspan="2" |Nissan logo
| rowspan="2" |[[File:R34 Gray.JPG|75px]]
|-
|007/214
|2010
|[[2010 HW Premiere]]
|-
|112/250
|[[List of 2014 Hot Wheels|2014]]
|[[HW Workshop]]
|Blue
|<script>alert(1)</script> GT-R
|[[File:R34 Blue.JPG|75px]]
|-
|050/250
|2019
|[[HW Speed Graphics]]
|White
|Red stripes
|[[File:R34 White.jpg|75px]]
|}

==Gallery==
<gallery>
R34 Loose.jpg|Loose
</gallery>
`;

const WIKITEXTO_TWIN = `{{casting
|name = Twin Mill
|series = [[1969 Hot Wheels]]
|years = 1969 - Present
|designer = [[Ira Gilford]]
|image = TwinMill.jpg}}

==Description==
The '''Twin Mill''' is an original Hot Wheels design with two engines.

==Versions==
{| class="wikitable"
! Year !! Series !! Color !! Photo
|-
| 1969 || Original 16 || Red || [[File:TM Red.jpg|75px]]
|-
| 2000 || Virtual Collection || Purple || [[File:TM Purple.jpg|75px]]
|}
`;

async function simular(route) {
  const url = new URL(route.request().url());
  const p = Object.fromEntries(url.searchParams);
  const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(obj) });
  if (/static\.wikia|upload\.wikimedia/.test(url.hostname)) {
    const colores = ['#c0392b', '#2e6bd1', '#e8e8e8', '#6b6f76', '#f1c40f', '#7d3c98'];
    const c = colores[[...url.pathname].reduce((s, ch) => s + ch.charCodeAt(0), 0) % colores.length];
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svgAuto(c) });
  }
  if (url.hostname === 'hotwheels.fandom.com') {
    const cat = [{ title: 'Category:1:64' }];
    if (p.generator === 'search') return json({ query: { pages: [
      { title: 'Nissan Skyline GT-R (BNR34)', index: 1, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/r34.png' } },
      { title: '2010 New Models', index: 2, categories: cat },
      { title: 'Twin Mill', index: 3, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/tm.png' } },
      { title: 'AutoZone', index: 4, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/az.png' } },
      { title: "'67 Camaro", index: 5, categories: cat, thumbnail: { source: 'https://static.wikia.nocookie.net/hotwheels/images/camaro.png' } },
    ] } });
    if (p.action === 'parse') {
      const w = /Twin/.test(p.page) ? WIKITEXTO_TWIN : /Camaro/.test(p.page) ? WIKITEXTO_R34.replace(/Nissan Skyline GT-R \(BNR34\)/g, "'67 Camaro") : WIKITEXTO_R34;
      return json({ parse: { title: p.page, wikitext: w } });
    }
    if (p.prop === 'categories') return json({ query: { pages: [{ title: p.titles, categories: /Twin/.test(p.titles)
      ? [{ title: 'Category:Unlicensed Hot Wheels' }, { title: 'Category:Hot Wheels Original Designs' }]
      : [{ title: 'Category:Licensed Hot Wheels' }, { title: 'Category:Nissan Cars' }] }] } });
    if (p.prop === 'imageinfo') return json({ query: { pages: p.titles.split('|').map((t) => ({ title: t, imageinfo: [{ thumburl: 'https://static.wikia.nocookie.net/hotwheels/images/' + encodeURIComponent(t) }] })) } });
  }
  if (/wikipedia\.org$/.test(url.hostname)) {
    if (url.pathname.includes('/page/summary/')) return json({ title: 'Nissan Skyline GT-R', extract: 'El Nissan Skyline GT-R es un deportivo japonés producido por Nissan entre 1969 y 2002.', wikibase_item: 'Q1063047', type: 'standard' });
    return json({ query: { search: [{ title: 'Nissan Skyline GT-R' }] } });
  }
  if (url.hostname === 'www.wikidata.org') {
    if (p.props === 'claims') return json({ entities: { Q1063047: { claims: {
      P176: [{ mainsnak: { datavalue: { type: 'wikibase-entityid', value: { id: 'Q20165' } } } }],
      P2031: [{ mainsnak: { datavalue: { type: 'time', value: { time: '+1999-01-01T00:00:00Z' } } } }],
      P2052: [{ mainsnak: { datavalue: { type: 'quantity', value: { amount: '+250', unit: 'http://www.wikidata.org/entity/Q180154' } } } }],
    } } } });
    return json({ entities: { Q20165: { labels: { es: { value: 'Nissan' } } }, Q180154: { labels: { es: { value: 'kilómetro por hora' } } } } });
  }
  if (url.hostname === 'commons.wikimedia.org') {
    const nombres = ['Nissan Skyline R34 GT-R front left.jpg', 'Nissan Skyline R34 GT-R rear right.jpg', 'Nissan Skyline R34 side.jpg', 'Nissan Skyline R34 engine bay.jpg', 'Nissan Skyline R34 at show.jpg'];
    return json({ query: { pages: nombres.map((n, i) => ({ title: 'File:' + n, index: i + 1, imageinfo: [{ width: 1600, height: 900, thumburl: 'https://upload.wikimedia.org/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: '<a href="x">Fotógrafo <b>Ejemplo</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] })) } });
  }
  return route.fulfill({ status: 404, body: '' });
}

(async () => {
  const b = await chromium.launch();
  const fallos = [];
  for (const [w, h, nombre] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errores.push(m.text()); });
    page.on('dialog', (d) => { errores.push('Se abrió un diálogo: ' + d.message()); d.dismiss(); });
    await page.route(/^https:\/\/(?!fonts\.)/, simular);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.goto(BASE, { waitUntil: 'load' });

    // estado vacío
    if (!(await page.isVisible('#vacio'))) fallos.push(`${nombre}: no se ve el estado vacío`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-0-vacio.png`) });

    if (nombre === 'movil') await page.click('#abrir-panel');
    await page.fill('#q', 'skyline');
    await page.waitForSelector('.resultado');
    const filas = await page.locator('.resultado').count();
    if (filas !== 3) fallos.push(`${nombre}: se esperaban 3 resultados (sin la página de serie), hubo ${filas}`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-1-busqueda.png`) });

    for (const i of [0, 1, 2]) {
      if (nombre === 'movil' && !(await page.$eval('#panel', (p) => p.classList.contains('abierto')))) { await page.click('#abrir-panel'); await page.waitForTimeout(350); }
      await page.locator('.resultado .boton-agregar').nth(i).click();
      await page.waitForTimeout(1700);
    }
    const vitrinas = await page.locator('.vitrina').count();
    if (vitrinas !== 3) fallos.push(`${nombre}: se esperaban 3 vitrinas, hubo ${vitrinas}`);
    if (nombre === 'movil') await page.click('#panel-cerrar').catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `${nombre}-2-garaje.png`), fullPage: true });

    // persistencia
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1600);
    if ((await page.locator('.vitrina').count()) !== 3) fallos.push(`${nombre}: la colección no se recordó al recargar`);

    // museo del auto licenciado
    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('.ficha dd');
    await page.waitForTimeout(400);
    const t = await page.textContent('#museo-titulo');
    if (!/Skyline/.test(t)) fallos.push(`${nombre}: título del museo inesperado: ${t}`);
    const nFotos = await page.locator('#fotos img').count();
    if (nFotos < 3) fallos.push(`${nombre}: el recorrido tiene ${nFotos} fotos`);
    if (await page.locator('#fotos img[src*="engine"]').count()) fallos.push(`${nombre}: entró una foto del motor al recorrido`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-3-museo-0.png`) });
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = (document.querySelector('#escenario-pista').offsetHeight - innerHeight) * .45; });
    await page.waitForTimeout(250);
    const grados = Number(await page.textContent('#grados'));
    if (grados < 100 || grados > 220) fallos.push(`${nombre}: a mitad del recorrido marcó ${grados}°`);
    await page.click('[data-fondo="noche"]');
    await page.screenshot({ path: path.join(OUT, `${nombre}-4-museo-giro.png`) });
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = document.querySelector('#escenario-pista').offsetHeight; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${nombre}-5-salas.png`) });
    if (!(await page.isVisible('.placa'))) fallos.push(`${nombre}: no aparece la placa de la base`);
    const tampo = await page.locator('.version').count();
    if (tampo !== 3) fallos.push(`${nombre}: se esperaban 3 versiones con foto, hubo ${tampo}`);
    if (await page.locator('script', { hasText: 'alert(1)' }).count()) fallos.push(`${nombre}: se insertó HTML de la wiki`);
    const autor = await page.textContent('#creditos');
    if (!/Fotógrafo Ejemplo/.test(autor) || /<b>/.test(autor)) fallos.push(`${nombre}: créditos mal limpiados`);
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = m.scrollHeight; });
    await page.screenshot({ path: path.join(OUT, `${nombre}-6-salas-fin.png`) });

    // volver y abrir el diseño original
    await page.click('#volver');
    await page.waitForTimeout(300);
    if (await page.isVisible('#museo')) fallos.push(`${nombre}: el botón volver no cerró el museo`);
    await page.locator('.vitrina-boton').nth(1).click();
    await page.waitForSelector('.version');
    const tipo = await page.textContent('#museo-tipo');
    if (!/Diseño original/.test(tipo)) fallos.push(`${nombre}: Twin Mill no se marcó como diseño original (${tipo})`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-7-original.png`) });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // quitar desde la lista
    if (nombre === 'movil') { await page.click('#abrir-panel'); await page.waitForTimeout(350); }
    await page.locator('.lista-coleccion .quitar').first().click();
    await page.waitForTimeout(900);
    if ((await page.locator('.vitrina').count()) !== 2) fallos.push(`${nombre}: quitar no sacó la vitrina`);

    const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (anchoDoc) fallos.push(`${nombre}: hay scroll horizontal`);
    if (errores.length) fallos.push(`${nombre}: errores de consola: ${errores.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'OK: todas las comprobaciones pasaron');
  process.exitCode = fallos.length ? 1 : 0;
})();
