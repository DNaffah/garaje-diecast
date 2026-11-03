/* Prueba de cuentas de punta a punta: Chromium contra el servidor de Cloudflare local
   (wrangler pages dev en 127.0.0.1:8788) y el Supabase falso (127.0.0.1:54321).
   Uso: node tests/cuentas.cjs carpeta-de-capturas */
const { chromium } = require('playwright');
const path = require('path');
const { simular } = require('./simulador.cjs');
const { BASE, codigoDe, totpDe, crearRegalo, llamar, cuentaNueva, correoUnico } = require('./sesion.cjs');

const OUT = process.argv[2] || 'capturas';
const fallos = [];
const revisar = (ok, texto) => { if (!ok) fallos.push(texto); };

async function contexto(b, ancho = 1280, alto = 860) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.errores = [];
  page.on('pageerror', (e) => page.errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errores.push(m.text()); });
  await page.route(/^https:\/\//, simular);
  return { ctx, page };
}

async function escribir(page, selector, texto) { await page.fill(selector, ''); await page.fill(selector, texto); }

(async () => {
  const b = await chromium.launch();
  const clave = 'garaje2026pista';

  /* 1. Crear cuenta desde la pantalla, con los errores de antes */
  const A = await contexto(b);
  const correoA = correoUnico('ana');
  await A.page.goto(BASE, { waitUntil: 'load' });
  await A.page.waitForSelector('#placa:not([hidden])');
  revisar(await A.page.isHidden('#app'), 'sin sesión el garaje no debería verse');
  revisar(/Entrar al garaje/.test(await A.page.textContent('#acceso-titulo')), 'no aparece la pantalla de entrar');
  await A.page.screenshot({ path: path.join(OUT, 'c1-entrar.png') });
  await A.page.click('[data-ir="crear"]');
  await escribir(A.page, '#crear-correo', correoA);
  await escribir(A.page, '#crear-clave', 'corta1');
  await A.page.click('[data-paso="crear"] button[type=submit]');
  revisar(/10 caracteres/.test(await A.page.textContent('[data-paso="crear"] .acceso-error')), 'no avisó contraseña corta');
  await escribir(A.page, '#crear-clave', clave);
  await A.page.click('[data-paso="crear"] button[type=submit]');
  revisar(/aceptar la política/.test(await A.page.textContent('[data-paso="crear"] .acceso-error')), 'dejó seguir sin la autorización de datos');
  await A.page.check('[name=acepto]');
  await A.page.click('[data-paso="crear"] button[type=submit]');
  await A.page.waitForSelector('[data-paso="verificar"]:not([hidden])');
  revisar((await A.page.textContent('[data-paso="verificar"] [data-correo]')) === correoA, 'no muestra el correo al que llegó el código');
  await escribir(A.page, '#verificar-codigo', '000000');
  await A.page.click('[data-paso="verificar"] button[type=submit]');
  await A.page.waitForFunction(() => document.querySelector('[data-paso="verificar"] .acceso-error').textContent, null, { timeout: 5000 }).catch(() => {});
  revisar(/no es correcto/.test(await A.page.textContent('[data-paso="verificar"] .acceso-error')), 'aceptó un código falso');
  await escribir(A.page, '#verificar-codigo', await codigoDe(correoA));
  await A.page.screenshot({ path: path.join(OUT, 'c2-codigo.png') });
  await A.page.click('[data-paso="verificar"] button[type=submit]');
  await A.page.waitForSelector('#acceso', { state: 'hidden', timeout: 8000 }).catch(() => fallos.push('después de confirmar no subió la persiana'));
  revisar((await A.page.textContent('#cuenta-correo')) === correoA, 'el panel no muestra el correo de la cuenta');

  /* 2. La sesión: cookie que JavaScript no puede leer */
  const galletas = await A.ctx.cookies();
  const s = galletas.find((c) => c.name === '__Host-garaje_s');
  revisar(s && s.httpOnly && s.secure && s.sameSite === 'Strict', `cookie de sesión sin HttpOnly/Secure/Strict: ${JSON.stringify(s && { h: s.httpOnly, s: s.secure, ss: s.sameSite })}`);
  revisar((await A.page.evaluate(() => document.cookie)) === '', 'la página puede leer la cookie');
  revisar((await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('garaje164')).length)) === 0, 'quedó algo del garaje en localStorage');

  /* 3. Agregar un carro, recargar y seguir conectado con el carro guardado */
  await A.page.fill('#q', 'skyline');
  await A.page.waitForSelector('.resultado');
  await A.page.locator('.resultado .boton-agregar').first().click();
  await A.page.waitForTimeout(2200);
  await A.page.reload({ waitUntil: 'load' });
  await A.page.waitForSelector('#acceso', { state: 'hidden' });
  await A.page.waitForTimeout(800);
  revisar((await A.page.locator('.vitrina').count()) === 1, 'el carro no quedó guardado en la cuenta');
  await A.page.screenshot({ path: path.join(OUT, 'c3-garaje.png') });

  /* 4. Otra cuenta no ve el garaje de la primera */
  const B = await contexto(b);
  const correoB = correoUnico('beto');
  await cuentaNueva(B.page, correoB);
  revisar((await B.page.locator('.vitrina').count()) === 0, 'una cuenta nueva ve carros de otra');
  await llamar(B.page, 'PUT', 'garaje', { autos: [], fondo: 'pista' });
  const deA = await llamar(A.page, 'GET', 'garaje');
  revisar(deA.datos?.autos?.length === 1, 'guardar en la cuenta B tocó el garaje de A');

  /* 5. Protección contra CSRF: sin la cabecera propia o desde otro origen, no pasa */
  const sinCabecera = await A.page.evaluate(async () => (await fetch('/api/salir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
  revisar(sinCabecera === 403, `POST sin X-Garaje respondió ${sinCabecera}`);
  const otroOrigen = await fetch(BASE + 'api/entrar', { method: 'POST', headers: { Origin: 'https://malo.example', 'X-Garaje': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoA, clave }) });
  revisar(otroOrigen.status === 403, `POST desde otro origen respondió ${otroOrigen.status}`);

  /* 6. Datos inválidos: el servidor los rechaza aunque alguien salte la página */
  const raro = await llamar(A.page, 'PUT', 'garaje', { autos: [{ titulo: 'x', foto: 'https://malo.example/a.png' }], fondo: 'pista' });
  revisar(raro.estado === 400, `aceptó una foto de otro sitio (${raro.estado})`);
  const extra = await llamar(A.page, 'PUT', 'garaje', { autos: [{ titulo: 'x', script: '<b>' }], fondo: 'pista' });
  revisar(extra.estado === 400, `aceptó campos extra (${extra.estado})`);

  /* 7. Activar 2FA desde "Tu cuenta" */
  await A.page.click('#abrir-cuenta');
  await A.page.click('#activar-2fa');
  await A.page.waitForSelector('#form-confirmar-2fa:not([hidden])');
  const secreto = (await A.page.textContent('#secreto-2fa')).replace(/\s/g, '');
  revisar(/^[A-Z2-7]{16,}$/.test(secreto), 'no se ve la clave para la app');
  await A.page.screenshot({ path: path.join(OUT, 'c4-2fa.png') });
  await escribir(A.page, '#confirmar-2fa-codigo', '123456');
  await A.page.click('#form-confirmar-2fa button[type=submit]');
  await A.page.waitForTimeout(300);
  revisar(/no es correcto/.test(await A.page.textContent('#form-confirmar-2fa .acceso-error')), 'activó 2FA con un código falso');
  await escribir(A.page, '#confirmar-2fa-codigo', await totpDe(secreto));
  await A.page.click('#form-confirmar-2fa button[type=submit]');
  await A.page.waitForTimeout(400);
  revisar(/Activa/.test(await A.page.textContent('#estado-2fa')), 'la 2FA no quedó activa');

  /* 8. Salir y entrar: ahora pide el código de la app. Sin él, la base no entrega el garaje */
  await A.page.click('#salir');
  await A.page.waitForSelector('#placa:not([hidden])');
  await escribir(A.page, '#entrar-correo', correoA);
  await escribir(A.page, '#entrar-clave', clave);
  await A.page.click('[data-paso="entrar"] button[type=submit]');
  await A.page.waitForSelector('[data-paso="dospasos"]:not([hidden])');
  const sinSegundoPaso = await llamar(A.page, 'GET', 'garaje');
  revisar(sinSegundoPaso.estado === 403, `con solo la contraseña la API entregó el garaje (${sinSegundoPaso.estado})`);
  await escribir(A.page, '#dospasos-codigo', await totpDe(secreto));
  await A.page.click('[data-paso="dospasos"] button[type=submit]');
  await A.page.waitForSelector('#acceso', { state: 'hidden', timeout: 8000 }).catch(() => fallos.push('con el código de la app no entró'));

  /* 9. Olvidé mi contraseña, con 2FA activa */
  const C = await contexto(b);
  await C.page.goto(BASE, { waitUntil: 'load' });
  await C.page.waitForSelector('#placa:not([hidden])');
  await C.page.click('[data-ir="olvide"]');
  await escribir(C.page, '#olvide-correo', correoA);
  await C.page.click('[data-paso="olvide"] button[type=submit]');
  await C.page.waitForSelector('[data-paso="restablecer"]:not([hidden])');
  const nueva = 'nuevagaraje2027';
  await escribir(C.page, '#restablecer-codigo', await codigoDe(correoA));
  await escribir(C.page, '#restablecer-clave', nueva);
  await C.page.click('[data-paso="restablecer"] button[type=submit]');
  await C.page.waitForSelector('[data-paso="dospasos"]:not([hidden])', { timeout: 5000 }).catch(() => fallos.push('recuperar con 2FA no pidió el código de la app'));
  await escribir(C.page, '#dospasos-codigo', await totpDe(secreto));
  await C.page.click('[data-paso="dospasos"] button[type=submit]');
  await C.page.waitForSelector('#acceso', { state: 'hidden', timeout: 8000 }).catch(() => fallos.push('después de la contraseña nueva no entró'));
  const vieja = await fetch(BASE + 'api/entrar', { method: 'POST', headers: { Origin: BASE.slice(0, -1), 'X-Garaje': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoA, clave }) });
  revisar(vieja.status === 401, `la contraseña vieja todavía sirve (${vieja.status})`);

  /* 10. Límite de intentos: la sexta contraseña mala seguida se frena */
  const D = await contexto(b);
  await D.page.goto(BASE, { waitUntil: 'load' });
  let ultimo = 0;
  for (let i = 0; i < 6; i++) ultimo = (await llamar(D.page, 'POST', 'entrar', { correo: correoB, clave: 'equivocada123' })).estado;
  revisar(ultimo === 429, `no frenó los intentos (${ultimo})`);

  /* 11. El link del regalo: quien crea la cuenta con él se queda con ese garaje */
  const regalo = await crearRegalo([
    { clave: 'Twin Mill', titulo: 'Twin Mill', foto: '', anio: '', fotoReal: '', color: '', serie: '' },
    { clave: "'67 Camaro", titulo: "'67 Camaro", foto: '', anio: '', fotoReal: '', color: '', serie: '' },
  ]);
  const E = await contexto(b, 390, 844);
  const correoE = correoUnico('amigo');
  await E.page.goto(`${BASE}?g=${regalo}`, { waitUntil: 'load' });
  await E.page.waitForSelector('#placa:not([hidden])');
  revisar(!E.page.url().includes(regalo), 'el código del regalo se quedó en la barra de direcciones');
  revisar(/garaje de regalo/.test(await E.page.textContent('#acceso-nota')), 'no avisa que es un garaje de regalo');
  await E.page.screenshot({ path: path.join(OUT, 'c5-regalo-movil.png') });
  await E.page.click('[data-ir="crear"]');
  await escribir(E.page, '#crear-correo', correoE);
  await escribir(E.page, '#crear-clave', clave);
  await E.page.check('[name=acepto]');
  await E.page.click('[data-paso="crear"] button[type=submit]');
  await E.page.waitForSelector('[data-paso="verificar"]:not([hidden])');
  await escribir(E.page, '#verificar-codigo', await codigoDe(correoE));
  await E.page.click('[data-paso="verificar"] button[type=submit]');
  await E.page.waitForSelector('#acceso', { state: 'hidden', timeout: 8000 }).catch(() => fallos.push('el amigo no entró'));
  await E.page.waitForTimeout(900);
  revisar((await E.page.locator('.vitrina').count()) === 2, `el amigo no recibió los carros del regalo (${await E.page.locator('.vitrina').count()})`);
  revisar(/ya es tuyo/.test(await E.page.textContent('#aviso-cuenta')), 'no avisó que el garaje ya es suyo');
  await E.page.screenshot({ path: path.join(OUT, 'c6-regalo-reclamado.png') });
  const robo = await llamar(B.page, 'POST', 'reclamar', { codigo: regalo });
  revisar(robo.estado === 404, `otra cuenta pudo reclamar el regalo ya reclamado (${robo.estado})`);

  /* 11b. Alguien registra primero el correo de otra persona con su propia contraseña. Cuando
     el dueño real se registra y confirma, la contraseña que vale es la del dueño. */
  const correoV = correoUnico('victima');
  const F = await contexto(b);
  await F.page.goto(BASE, { waitUntil: 'load' });
  await llamar(F.page, 'POST', 'registro', { correo: correoV, clave: 'atacante2026x', acepto: true, version: '2026-11-02' });
  await F.page.waitForTimeout(150);
  await llamar(F.page, 'POST', 'registro', { correo: correoV, clave: 'duenoreal2026', acepto: true, version: '2026-11-02' });
  await F.page.waitForTimeout(150);
  const conf = await llamar(F.page, 'POST', 'verificar', { correo: correoV, codigo: await codigoDe(correoV), clave: 'duenoreal2026' });
  revisar(conf.estado === 200, `el dueño no pudo confirmar (${conf.estado})`);
  const atacante = await fetch(BASE + 'api/entrar', { method: 'POST', headers: { Origin: BASE.slice(0, -1), 'X-Garaje': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoV, clave: 'atacante2026x' }) });
  revisar(atacante.status === 401, `quien registró primero el correo ajeno pudo entrar (${atacante.status})`);
  const dueno = await fetch(BASE + 'api/entrar', { method: 'POST', headers: { Origin: BASE.slice(0, -1), 'X-Garaje': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoV, clave: 'duenoreal2026' }) });
  revisar(dueno.status === 200, `el dueño real no puede entrar con su contraseña (${dueno.status})`);
  await F.ctx.close();

  /* 12. Borrar la cuenta */
  await B.page.click('#abrir-cuenta');
  if (!(await B.page.evaluate(() => document.querySelector('#cuenta').open))) {
    await B.page.screenshot({ path: path.join(OUT, 'c-falla-cuenta.png') });
    fallos.push(`no se abrió "Tu cuenta" en B: ${B.page.url()} ${await B.page.isVisible('#placa')}`);
  }
  await escribir(B.page, '#borrar-clave', 'mala-clave-1');
  await escribir(B.page, '#borrar-confirmar', 'BORRAR');
  await B.page.click('#form-borrar button[type=submit]');
  await B.page.waitForTimeout(300);
  revisar(/no es correcta/.test(await B.page.textContent('#form-borrar .acceso-error')), 'borró la cuenta con la contraseña mala');
  await escribir(B.page, '#borrar-clave', clave);
  await B.page.click('#form-borrar button[type=submit]');
  await B.page.waitForSelector('#placa:not([hidden])', { timeout: 8000 }).catch(() => fallos.push('después de borrar no volvió a la entrada'));
  const yaNo = await fetch(BASE + 'api/entrar', { method: 'POST', headers: { Origin: BASE.slice(0, -1), 'X-Garaje': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: correoB, clave }) });
  revisar(yaNo.status === 401 || yaNo.status === 429, `la cuenta borrada todavía entra (${yaNo.status})`);

  /* 13. Sin correo configurado: con "Confirm email" apagado un rato, el amigo crea su cuenta
     con el link del regalo, no espera código, entra con su contraseña y se queda el garaje. */
  await fetch('http://127.0.0.1:54321/__ajustes', { method: 'POST', body: JSON.stringify({ autoconfirmar: true }) });
  const regalo2 = await crearRegalo([{ clave: 'Twin Mill', titulo: 'Twin Mill', foto: '', anio: '', fotoReal: '', color: '', serie: '' }]);
  const G = await contexto(b, 390, 844);
  /* Otra IP: desde la de la prueba ya van los 5 registros por hora que permite el límite. */
  await G.page.setExtraHTTPHeaders({ 'CF-Connecting-IP': '203.0.113.7' });
  const correoG = correoUnico('cumpleanero');
  await G.page.goto(`${BASE}?g=${regalo2}`, { waitUntil: 'load' });
  await G.page.waitForSelector('#placa:not([hidden])');
  await G.page.click('[data-ir="crear"]');
  await escribir(G.page, '#crear-correo', correoG);
  await escribir(G.page, '#crear-clave', clave);
  await G.page.check('[name=acepto]');
  await G.page.click('[data-paso="crear"] button[type=submit]');
  await G.page.waitForSelector('[data-paso="verificar"]:not([hidden])');
  await G.page.click('[data-paso="verificar"] [data-ir="entrar"]');
  await escribir(G.page, '#entrar-correo', correoG);
  await escribir(G.page, '#entrar-clave', clave);
  await G.page.click('[data-paso="entrar"] button[type=submit]');
  await G.page.waitForSelector('#acceso', { state: 'hidden', timeout: 8000 }).catch(() => fallos.push('sin correo, el amigo no pudo entrar'));
  await G.page.waitForTimeout(900);
  revisar((await G.page.locator('.vitrina').count()) === 1, 'sin correo, el amigo no recibió el garaje del regalo');
  await fetch('http://127.0.0.1:54321/__ajustes', { method: 'POST', body: JSON.stringify({ autoconfirmar: false }) });
  await G.page.screenshot({ path: path.join(OUT, 'c7-sin-correo.png') });

  for (const [n, x] of [['A', A], ['B', B], ['C', C], ['D', D], ['E', E], ['G', G]]) {
    if (x.page.errores.length) fallos.push(`errores de consola en ${n}: ${x.page.errores.join(' | ')}`);
    revisar(!(await x.page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `scroll horizontal en ${n}`);
  }
  await b.close();
  console.log(fallos.length ? 'FALLOS:\n- ' + fallos.join('\n- ') : 'OK: cuentas, sesión, 2FA, regalo y aislamiento pasaron');
  process.exitCode = fallos.length ? 1 : 0;
})();
