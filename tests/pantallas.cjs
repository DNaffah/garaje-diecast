/* Revisa el garaje y el museo en pantallas de todo tipo: celulares, tablets, laptops y monitores.
   Uso: servir la carpeta en 127.0.0.1:8164 y correr  node tests/pantallas.cjs carpeta-de-capturas */
const { chromium } = require('playwright');
const path = require('path');
const { simular } = require('./simulador.cjs');

const OUT = process.argv[2] || 'capturas';
const PANTALLAS = [
  ['celular-chico', 320, 568, true], ['iphone-se', 375, 667, true], ['celular', 390, 844, true], ['celular-grande', 430, 932, true],
  ['celular-horizontal', 844, 390, true], ['tablet', 768, 1024, true], ['tablet-horizontal', 1024, 768, true],
  ['laptop', 1366, 768, false], ['escritorio', 1920, 1080, false], ['monitor-2k', 2560, 1440, false],
];

(async () => {
  const b = await chromium.launch();
  const fallos = [];
  for (const [nombre, w, h, tactil] of PANTALLAS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: tactil && w < 900 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fallos.push(`${nombre}: error ${e.message}`));
    await page.route(/^https:\/\//, simular);
    await page.addInitScript(() => localStorage.setItem('garaje164.autos', JSON.stringify([
      { clave: 'Nissan Skyline GT-R (BNR34)', titulo: 'Nissan Skyline GT-R (BNR34)', foto: 'https://static.wikia.nocookie.net/hotwheels/images/a.png', anio: '2010' },
      { clave: 'Twin Mill', titulo: 'Twin Mill', foto: 'https://static.wikia.nocookie.net/hotwheels/images/b.png', anio: '1969' },
      { clave: "'67 Camaro|x.jpg", titulo: "'67 Camaro", foto: 'https://static.wikia.nocookie.net/hotwheels/images/c.png', anio: '2025', color: 'Spectraflame Blue', serie: 'HW Dream Garage' },
    ])));
    await page.goto('http://127.0.0.1:8164/', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const salidas = async (zona) => page.evaluate((zona) => {
      const ancho = document.documentElement.clientWidth;
      const raiz = zona === 'museo' ? document.querySelector('#museo') : document.body;
      return [...raiz.querySelectorAll('h1,h2,h3,p,button,dd,dt,.vitrina,.marco,.panel-datos,.placa,.etiqueta')]
        .filter((el) => el.offsetParent !== null && !el.closest('.versiones, .panel:not(.abierto)'))
        .map((el) => ({ el: el.className || el.tagName, d: Math.round(el.getBoundingClientRect().right - ancho) }))
        .filter((x) => x.d > 1).slice(0, 4);
    }, zona);
    const g = await salidas('garaje');
    if (g.length) fallos.push(`${nombre}: en el garaje algo se sale por la derecha ${JSON.stringify(g)}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) fallos.push(`${nombre}: scroll horizontal en el garaje`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-garaje.png`) });

    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('#datos-recorrido li');
    await page.waitForTimeout(500);
    const medidas = await page.evaluate(() => {
      const m = document.querySelector('#marco').getBoundingClientRect();
      const p = document.querySelector('.panel-datos').getBoundingClientRect();
      const e = document.querySelector('#escenario').getBoundingClientRect();
      return { marcoAlto: Math.round(m.height), marcoAncho: Math.round(m.width), panelAbajo: Math.round(p.bottom), escenarioAbajo: Math.round(e.bottom), ancho: innerWidth };
    });
    if (medidas.marcoAlto < 120) fallos.push(`${nombre}: la foto del recorrido queda muy pequeña (${medidas.marcoAlto}px de alto)`);
    if (medidas.panelAbajo > medidas.escenarioAbajo + 2) fallos.push(`${nombre}: el panel de datos se corta abajo (${medidas.panelAbajo} > ${medidas.escenarioAbajo})`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-museo.png`) });
    await page.evaluate(() => { const m = document.querySelector('#museo'); m.scrollTop = document.querySelector('#recorrido').offsetHeight; });
    await page.waitForTimeout(300);
    const s = await salidas('museo');
    if (s.length) fallos.push(`${nombre}: en el museo algo se sale por la derecha ${JSON.stringify(s)}`);
    await page.screenshot({ path: path.join(OUT, `${nombre}-salas.png`) });
    await ctx.close();
  }
  await b.close();
  console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'OK: se ve bien en las 10 pantallas');
})();
