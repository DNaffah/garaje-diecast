/* Ayudas para las pruebas con cuentas: crear una cuenta ya confirmada desde la página
   (así la cookie queda en el navegador de la prueba) y leer el "buzón" del Supabase falso. */
const FALSO = 'http://127.0.0.1:54321';
const BASE = 'http://127.0.0.1:8788/';

async function codigoDe(correo) {
  const r = await fetch(`${FALSO}/__correo?email=${encodeURIComponent(correo)}`);
  return (await r.json()).codigo;
}

async function totpDe(secreto) {
  const r = await fetch(`${FALSO}/__totp?secreto=${encodeURIComponent(secreto)}`);
  return (await r.json()).codigo;
}

async function crearRegalo(autos) {
  const r = await fetch(`${FALSO}/__regalo`, { method: 'POST', body: JSON.stringify({ autos }) });
  return (await r.json()).id;
}

/* Desde la página, como lo haría el propio sitio. */
function llamar(page, metodo, ruta, cuerpo) {
  return page.evaluate(async ({ metodo, ruta, cuerpo }) => {
    const op = { method: metodo, headers: { 'X-Garaje': '1' } };
    if (metodo !== 'GET') { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo ?? {}); }
    const r = await fetch('/api/' + ruta, op);
    let datos = null;
    try { datos = await r.json(); } catch { /* vacío */ }
    return { estado: r.status, datos };
  }, { metodo, ruta, cuerpo });
}

async function cuentaNueva(page, correo, clave = 'garaje2026pista') {
  await page.goto(BASE, { waitUntil: 'load' });
  await llamar(page, 'POST', 'registro', { correo, clave, acepto: true, version: '2026-11-02' });
  await page.waitForTimeout(150);
  await llamar(page, 'POST', 'verificar', { correo, codigo: await codigoDe(correo), clave });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#acceso', { state: 'hidden' });
}

const correoUnico = (nombre) => `${nombre}+${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}@ejemplo.co`;

module.exports = { BASE, FALSO, codigoDe, totpDe, crearRegalo, llamar, cuentaNueva, correoUnico };
