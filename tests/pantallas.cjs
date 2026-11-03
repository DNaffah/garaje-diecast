/* Revisa el garaje y el museo en pantallas de todo tipo: celulares, tablets, laptops y monitores.
   También la pantalla de entrada (la persiana) sin sesión.
   Uso: tests/correr.sh tests/pantallas.cjs carpeta-de-capturas */
const { chromium } = require('playwright');
const path = require('path');
const { simular } = require('./simulador.cjs');
const { BASE, llamar, cuentaNueva, correoUnico } = require('./sesion.cjs');

const OUT = process.argv[2] || 'capturas';
const PANTALLAS = [
  ['celular-chico', 320, 568, true], ['iphone-se', 375, 667, true], ['celular', 390, 844, true], ['celular-grande', 430, 932, true],
  ['celular-horizontal', 844, 390, true], ['tablet', 768, 1024, true], ['tablet-horizontal', 1024, 768, true],
  ['laptop', 1366, 768, false], ['escritorio', 1920, 1080, false], ['monitor-2k', 2560, 1440, false],
];

(async () => {
  const b = await chromium.launch();
  const fallos = [];

  /* Una sola cuenta con 3 carros; cada pantalla reusa su sesión. */
  const base = await b.newContext();
  const pb = await base.newPage();
  await pb.route(/^https:\/\//, simular);
  await cuentaNueva(pb, correoUnico('pantallas'));
  await llamar(pb, 'PUT', 'garaje', { fondo: 'pista', autos: [
    { clave: 'Nissan Skyline GT-R (BNR34)', titulo: 'Nissan Skyline GT-R (BNR34)', foto: 'https://static.wikia.nocookie.net/hotwheels/images/a.png', anio: '2010' },
    { clave: 'Twin Mill', titulo: 'Twin Mill', foto: 'https://static.wikia.nocookie.net/hotwheels/images/b.png', anio: '1969' },
    { clave: "'67 Camaro|x.jpg", titulo: "'67 Camaro", foto: 'https://static.wikia.nocookie.net/hotwheels/images/c.png', anio: '2025', color: 'Spectraflame Blue', serie: 'HW Dream Garage' },
  ] });
  const sesion = await base.storageState();
  await base.close();

  for (const [nombre, w, h, tactil] of PANTALLAS) {
    /* La persiana sin sesión: la placa entera visible o alcanzable con scroll, sin salirse a los lados. */
    const ctxEntrada = await b.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: tactil && w < 900 });
    const pe = await ctxEntrada.newPage();
    await pe.goto(BASE, { waitUntil: 'load' });
    await pe.waitForSelector('#placa:not([hidden])');
    const placa = await pe.evaluate(() => {
      const r = document.querySelector('#placa').getBoundingClientRect();
      return { izq: Math.round(r.left), der: Math.round(innerWidth - r.right), alto: Math.round(r.height) };
    });
    if (placa.izq < 8 || placa.der < 8) fallos.push(`${nombre}: la placa de entrada pega con el borde ${JSON.stringify(placa)}`);
    await pe.locator('[data-paso="entrar"] button[type=submit]').scrollIntoViewIfNeeded();
    if (!(await pe.locator('[data-paso="entrar"] button[type=submit]').isVisible())) fallos.push(`${nombre}: no se alcanza el botón Entrar`);
    await pe.screenshot({ path: path.join(OUT, `${nombre}-entrada.png`) });
    await ctxEntrada.close();

    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: tactil, isMobile: tactil && w < 900, storageState: sesion });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fallos.push(`${nombre}: error ${e.message}`));
    await page.route(/^https:\/\//, simular);
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('#acceso', { state: 'hidden' });
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
