/* Prueba completa en Chromium con las APIs simuladas, sin internet.
   Uso: servir la carpeta en 127.0.0.1:8164 y correr  node tests/e2e.cjs carpeta-de-capturas */
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

const INFOBOX = `{{Infobox automobile
| name = Nissan Skyline GT-R
| manufacturer = [[Nissan]]
| production = 1969–1972 · 1989–2002
| layout = [[Front-engine, four-wheel-drive layout|Front-engine, all-wheel-drive]]
| engine = 2.6 L [[Nissan RB engine#RB26DETT|RB26DETT]] twin-turbo [[Straight-six engine|I6]]
| power = {{convert|206|kW|hp|abbr=on}}
| transmission = 6-speed [[Getrag]] manual
| body_style = 2-door [[coupé]]
}}`;

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
    if (url.pathname.includes('/page/summary/')) return json({ title: 'Nissan Skyline GT-R', extract: 'El Nissan Skyline GT-R es un deportivo japonés de Nissan.', type: 'standard' });
    if (p.list === 'search') return json({ query: { search: [{ title: 'Nissan Skyline GT-R' }, { title: 'Nissan RB engine' }, { title: 'Nissan Skyline' }] } });
    if (p.prop === 'langlinks') return json({ query: { pages: [{ title: p.titles, langlinks: [{ lang: 'es', title: 'Nissan Skyline GT-R' }] }] } });
    if (p.generator === 'images') {
      const nombres = ['Nissan Skyline R34 GT-R Nür front left.jpg', 'Nissan Skyline R34 GT-R Nür rear right.jpg', 'Nissan Skyline R33 GT-R 001.jpg', 'RB26DETT R34 engine.jpg'];
      return json({ query: { pages: nombres.map((n) => ({ title: 'File:' + n, imageinfo: [{ width: 1600, height: 900, thumburl: 'https://upload.wikimedia.org/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: '<a href="x">Fotógrafo <b>Ejemplo</b></a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] })) } });
    }
    if (String(p.prop || '').includes('revisions')) return json({ query: { pages: [
      { title: 'Nissan Skyline GT-R', original: { source: 'https://upload.wikimedia.org/x/Nissan_Skyline_GT-R_R34_V_Spec_II.jpg' }, revisions: [{ slots: { main: { content: INFOBOX } } }] },
      { title: 'Nissan Skyline', revisions: [{ slots: { main: { content: '{{Infobox automobile\n| production = 1957–present\n}}' } } }] },
    ] } });
  }
  if (url.hostname === 'commons.wikimedia.org') {
    const nombres = ['Nissan Skyline R34 GT-R V Spec side.jpg', 'Nissan Skyline R34 police car.jpg', 'Nissan Skyline R34 at show.jpg'];
    return json({ query: { pages: nombres.map((n, i) => ({ title: 'File:' + n, index: i + 1, imageinfo: [{ width: 1600, height: 900, thumburl: 'https://upload.wikimedia.org/x/' + encodeURIComponent(n), descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(n), extmetadata: { Artist: { value: 'Otra persona' }, LicenseShortName: { value: 'CC BY 2.0' } } }] })) } });
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

    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1600);
    if ((await page.locator('.vitrina').count()) !== 3) fallos.push(`${nombre}: la colección no se recordó al recargar`);

    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('#datos-recorrido li');
    await page.waitForTimeout(500);
    const t = await page.textContent('#museo-titulo');
    if (!/Skyline/.test(t)) fallos.push(`${nombre}: título del museo inesperado: ${t}`);
    const fotosRec = await page.$$eval('#marco img', (xs) => xs.map((x) => decodeURIComponent(x.src)));
    if (!fotosRec.length) fallos.push(`${nombre}: el recorrido no tiene fotos`);
    if (fotosRec.some((u) => /engine|R33|police/i.test(u))) fallos.push(`${nombre}: entró una foto que no es el mismo auto: ${fotosRec.join(' | ')}`);
    if (!/R34_V_Spec_II/.test(fotosRec[0] || '')) fallos.push(`${nombre}: la foto principal no es la portada del artículo: ${fotosRec[0]}`);
    const datos = await page.$$eval('#datos-recorrido li', (xs) => xs.map((x) => x.textContent));
    if (!datos.some((d) => /RB26DETT/.test(d)) || !datos.some((d) => /276 hp/.test(d))) fallos.push(`${nombre}: la ficha del recorrido no trae motor y potencia: ${datos.join(' | ')}`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-3-museo-0.png`) });
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = (document.querySelector('#recorrido').offsetHeight - innerHeight) * .7; });
    await page.waitForTimeout(400);
    const contador = await page.textContent('#contador-etapa');
    if (!/^0[2-9] \/ /.test(contador)) fallos.push(`${nombre}: el recorrido no avanzó con el scroll (${contador})`);
    if (!/f-(pista|taller|noche|desierto|estudio)/.test(await page.getAttribute('#fondo', 'class'))) fallos.push(`${nombre}: no se puso un fondo al azar`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-4-museo-avance.png`) });
    await page.evaluate(() => { document.querySelector('#museo').scrollTop = 0; });
    if (await page.isVisible('#elegir-foto')) {
      await page.click('#elegir-foto');
      await page.waitForSelector('#selector-fotos[open] .opcion-foto');
      await page.screenshot({ path: path.join(OUT, `${nombre}-5-selector.png`) });
      await page.locator('.opcion-foto').nth(1).click();
      await page.waitForTimeout(300);
      const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem('garaje164.autos'))[0].fotoReal);
      if (!guardada) fallos.push(`${nombre}: la foto elegida no quedó guardada`);
    } else fallos.push(`${nombre}: no aparece el botón Elegir otra foto`);
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = document.querySelector('#recorrido').offsetHeight; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${nombre}-6-salas.png`) });
    if (!(await page.isVisible('.placa'))) fallos.push(`${nombre}: no aparece la placa de la base`);
    const desborde = await page.evaluate(() => {
      const r = document.querySelector('#sala-real').getBoundingClientRect();
      const dd = [...document.querySelectorAll('#sala-real .ficha dd')].map((x) => x.getBoundingClientRect().right);
      return { sala: Math.round(r.right), dd: Math.round(Math.max(0, ...dd)), ancho: innerWidth };
    });
    if (desborde.sala > desborde.ancho || desborde.dd > desborde.ancho) fallos.push(`${nombre}: la ficha del auto real se sale de la pantalla (${JSON.stringify(desborde)})`);
    const tampo = await page.locator('.version').count();
    if (tampo !== 3) fallos.push(`${nombre}: se esperaban 3 versiones con foto, hubo ${tampo}`);
    const antes = await page.locator('.vitrina').count();
    await page.locator('.version').first().click();
    await page.waitForTimeout(1800);
    if (await page.isVisible('#museo')) fallos.push(`${nombre}: tocar una versión no llevó al garaje`);
    if ((await page.locator('.vitrina').count()) !== antes + 1) fallos.push(`${nombre}: tocar una versión no la agregó al garaje`);
    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('#datos-recorrido li');
    if (await page.locator('script', { hasText: 'alert(1)' }).count()) fallos.push(`${nombre}: se insertó HTML de la wiki`);
    const autor = await page.textContent('#creditos');
    if (!/Fotógrafo Ejemplo/.test(autor) || /<b>/.test(autor)) fallos.push(`${nombre}: créditos mal limpiados`);

    await page.click('#volver');
    await page.waitForTimeout(300);
    if (await page.isVisible('#museo')) fallos.push(`${nombre}: el botón volver no cerró el museo`);
    await page.locator('.vitrina-boton').nth(1).click();
    await page.waitForSelector('.version');
    const tipo = await page.textContent('#museo-tipo');
    if (!/Diseño original/.test(tipo)) fallos.push(`${nombre}: Twin Mill no se marcó como diseño original (${tipo})`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-7-original.png`) });
    await page.click('#sacar-museo');
    if (!/otra vez/i.test(await page.textContent('#sacar-museo'))) fallos.push(`${nombre}: Sacar del garaje no pidió confirmación`);
    await page.click('#sacar-museo');
    await page.waitForTimeout(1000);
    if ((await page.locator('.vitrina').count()) !== 3) fallos.push(`${nombre}: Sacar del garaje (museo) no sacó el auto`);
    await page.locator('.vitrina').first().hover().catch(() => {});
    await page.locator('.vitrina .sacar').first().click({ force: true });
    await page.waitForTimeout(150);
    await page.locator('.vitrina .sacar').first().click({ force: true });
    await page.waitForTimeout(1000);
    if ((await page.locator('.vitrina').count()) !== 2) fallos.push(`${nombre}: el botón Sacar de la vitrina no funcionó`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-8-tras-sacar.png`) });

    const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (anchoDoc) fallos.push(`${nombre}: hay scroll horizontal`);
    if (errores.length) fallos.push(`${nombre}: errores de consola: ${errores.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
  console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'OK: todas las comprobaciones pasaron');
  process.exitCode = fallos.length ? 1 : 0;
})();
