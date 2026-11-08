/* Plan de respaldo: con la Hot Wheels Wiki caída o bloqueada, la búsqueda usa Wikipedia
   y el museo abre igual, con el auto real.
   Uso: tests/correr.sh tests/respaldo.cjs carpeta-de-capturas */
const { chromium } = require('playwright');
const path = require('path');
const { simular } = require('./simulador.cjs');
const { cuentaNueva, correoUnico } = require('./sesion.cjs');

const OUT = process.argv[2] || 'capturas';

(async () => {
  const b = await chromium.launch();
  const fallos = [];
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  let llamadasFandom = 0;
  let modo = 'lenta';
  await page.route(/^https:\/\/(?!fonts\.)/, async (route) => {
    if (new URL(route.request().url()).hostname === 'hotwheels.fandom.com') {
      llamadasFandom++;
      if (modo === 'colgada') return; /* nunca responde */
      if (modo === 'bloqueada') return route.fulfill({ status: 403, contentType: 'text/html', body: '<h1>Blocked</h1>' });
      await new Promise((r) => setTimeout(r, 800));
      return simular(route).catch(() => {});
    }
    return simular(route);
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await cuentaNueva(page, correoUnico('respaldo'));
  await page.waitForTimeout(400);

  /* 0. Con la wiki sana pero lenta, buscar otra vez lo mismo (Enter a mitad de la primera
        búsqueda) no debe caer al respaldo. */
  await page.fill('#q', 'skyline');
  await page.waitForTimeout(450);
  await page.press('#q', 'Enter');
  await page.waitForSelector('.resultado');
  if (/no respondió/.test(await page.locator('#resultados').innerText())) fallos.push('una búsqueda repetida cayó al respaldo con la wiki funcionando');

  /* 1. Wiki colgada: a los 9 s entra el respaldo. */
  modo = 'colgada';
  await page.fill('#q', 'skyline r34');
  await page.waitForSelector('#resultados :text("no respondió")', { timeout: 15000 }).catch(() => fallos.push('con la wiki colgada no entró el respaldo'));

  /* 2. Wiki bloqueada (403). */
  modo = 'bloqueada';
  await page.fill('#q', 'skyline gt');
  await page.waitForSelector('.resultado');
  const aviso = await page.locator('#resultados').innerText().catch(() => '');
  if (!/no respondió/.test(aviso)) fallos.push('no se avisa que la búsqueda viene de Wikipedia');
  if ((await page.locator('.resultado').count()) !== 2) fallos.push('se esperaban 2 resultados de Wikipedia');
  if (!llamadasFandom) fallos.push('ni siquiera se intentó la Hot Wheels Wiki');
  await page.screenshot({ path: path.join(OUT, 'respaldo-1-busqueda.png') });

  await page.locator('.resultado .boton-agregar').first().click();
  await page.waitForTimeout(1700);
  if ((await page.locator('.vitrina').count()) !== 1) fallos.push('no se agregó el auto al garaje');

  await page.locator('.vitrina-boton').first().click();
  await page.waitForSelector('#museo:not([hidden])');
  await page.waitForTimeout(2500);
  const museo = await page.locator('#museo').innerText();
  if (/No se pudo leer este modelo/.test(museo)) fallos.push('el museo quedó en error en vez de usar el respaldo');
  if (!/no respondió o no tiene esta página/.test(museo)) fallos.push('el museo no explica que faltan los datos de la miniatura');
  if (!/Mattel/.test(museo)) fallos.push('faltan los créditos y el aviso de marca');
  if (/Hot Wheels Wiki \(Fandom\), colaboradores/.test(museo)) fallos.push('se le da crédito a la wiki por datos que no vinieron de ella');
  await page.screenshot({ path: path.join(OUT, 'respaldo-2-museo.png'), fullPage: false });

  if (errores.length) fallos.push('errores en consola: ' + errores.join(' | '));
  await b.close();
  if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
  console.log('OK: el respaldo con Wikipedia funciona');
})();
