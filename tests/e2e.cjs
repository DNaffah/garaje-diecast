/* Prueba completa en Chromium con las APIs simuladas, sin internet. Entra con una cuenta
   nueva y guarda en el servidor local (wrangler + Supabase falso).
   Uso: tests/correr.sh tests/e2e.cjs carpeta-de-capturas */
const { chromium } = require('playwright');
const path = require('path');

const OUT = process.argv[2] || 'capturas';

const { simular } = require('./simulador.cjs');
const { BASE, llamar, cuentaNueva, correoUnico } = require('./sesion.cjs');

(async () => {
  const b = await chromium.launch();
  const fallos = [];
  for (const [w, h, nombre] of [[1440, 900, 'escritorio'], [390, 844, 'movil']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errores.push(m.text()); });
    page.on('dialog', (d) => { errores.push('Se abrió un diálogo: ' + d.message()); d.dismiss(); });
    await page.route(/^https:\/\/(?!fonts\.)/, simular);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await cuentaNueva(page, correoUnico(nombre));
    await page.waitForTimeout(400);

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

    /* Una foto guardada con un % suelto no debe dejar el museo colgado. */
    const fotoReal = async (v) => {
      const g = (await llamar(page, 'GET', 'garaje')).datos;
      g.autos[0].fotoReal = v;
      await llamar(page, 'PUT', 'garaje', { autos: g.autos, fondo: g.fondo });
    };
    await fotoReal('https://upload.wikimedia.org/a/%E0b');
    await page.reload({ waitUntil: 'load' });
    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('#datos-recorrido li', { timeout: 8000 }).catch(() => fallos.push(`${nombre}: una foto guardada mal codificada colgó el museo`));
    await page.click('#volver');
    await fotoReal('');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);

    await page.locator('.vitrina-boton').first().click();
    await page.waitForSelector('#datos-recorrido li');
    await page.waitForTimeout(500);
    const t = await page.textContent('#museo-titulo');
    if (!/Skyline/.test(t)) fallos.push(`${nombre}: título del museo inesperado: ${t}`);
    const fotosRec = await page.$$eval('#marco img', (xs) => xs.map((x) => decodeURIComponent(x.src)));
    if (!fotosRec.length) fallos.push(`${nombre}: el recorrido no tiene fotos`);
    if (fotosRec.some((u) => /engine|R33|police/i.test(u))) fallos.push(`${nombre}: entró una foto que no es el mismo auto: ${fotosRec.join(' | ')}`);
    if (!/R34[ _]V[ _]Spec[ _]II/.test(fotosRec[0] || '')) fallos.push(`${nombre}: la foto principal no es la portada del artículo: ${fotosRec[0]}`);
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
      await page.waitForTimeout(1000);
      const guardada = (await llamar(page, 'GET', 'garaje')).datos.autos[0].fotoReal;
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
