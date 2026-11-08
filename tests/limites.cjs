/* Límites de intentos vistos desde afuera, contra el servidor local y el Supabase falso.
   Cada caso usa su propia IP (CF-Connecting-IP), como la pone Cloudflare.
   Uso: tests/correr.sh tests/limites.cjs */
const BASE = 'http://127.0.0.1:8788/api/';
const fallos = [];

async function pedir(metodo, ruta, ip, cuerpo, extra = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Garaje': '1', Origin: 'http://127.0.0.1:8788', 'CF-Connecting-IP': ip, ...extra },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}
const verificar = (ip, correo) => pedir('POST', 'verificar', ip, { correo, codigo: '000000', clave: 'garaje2026pista' });

(async () => {
  /* 1. Alguien que conoce un correo ajeno no puede bloquear a su dueño. */
  const victima = 'victima@ejemplo.co';
  let ultimo;
  for (let i = 0; i < 9; i++) ultimo = await verificar('203.0.113.10', victima);
  if (ultimo.estado !== 429) fallos.push(`el atacante debía quedar bloqueado al noveno código (salió ${ultimo.estado})`);
  const dueno = await verificar('198.51.100.20', victima);
  if (dueno.estado === 429) fallos.push('el dueño del correo quedó bloqueado por los intentos de otra IP');

  /* 2. El tope global por correo sigue frenando a quien reparte el ataque entre muchas IPs. */
  const repartido = 'repartido@ejemplo.co';
  let bloqueado = false;
  for (let i = 0; i < 40 && !bloqueado; i++) bloqueado = (await verificar(`203.0.113.${100 + i}`, repartido)).estado === 429;
  if (!bloqueado) fallos.push('un correo aguantó 40 códigos desde 40 IPs sin bloquearse');

  /* 3. Una IP no puede probar códigos sin fin cambiando de correo. */
  let n = 0;
  for (; n < 35; n++) if ((await verificar('203.0.113.30', `otro${n}@ejemplo.co`)).estado === 429) break;
  if (n >= 35) fallos.push('una IP pudo mandar 35 códigos a correos distintos');

  /* 4. Con un token inventado, reclamar un regalo choca primero con el tope por IP. */
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  let topeReclamar = false;
  for (let i = 0; i < 25 && !topeReclamar; i++) {
    const falso = `${b64({ alg: 'HS256' })}.${b64({ sub: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, exp: 4102444800 })}.x`;
    const r = await pedir('POST', 'reclamar', '203.0.113.40', { codigo: '11111111-1111-4111-8111-111111111111' },
      { Cookie: `__Host-garaje_s=${falso}; __Host-garaje_r=inventado` });
    topeReclamar = r.estado === 429;
  }
  if (!topeReclamar) fallos.push('reclamar con tokens inventados no tiene tope por IP');

  /* 5. Las rutas sin límite propio tienen un tope amplio por IP. */
  let topeYo = 0;
  for (let i = 0; i < 320; i++) if ((await pedir('GET', 'yo', '203.0.113.50')).estado === 429) { topeYo = i + 1; break; }
  if (!topeYo) fallos.push('GET /api/yo aguantó 320 pedidos seguidos de una IP');
  else if (topeYo < 300) fallos.push(`GET /api/yo se bloqueó demasiado pronto (pedido ${topeYo})`);

  /* 6. Al confirmar el correo, la contraseña se valida igual que al registrarse. */
  const debil = await pedir('POST', 'verificar', '203.0.113.60', { correo: 'debil@ejemplo.co', codigo: '000000', clave: 'abc' });
  if (debil.estado !== 400 || !/contraseña/i.test(debil.datos.error || '')) fallos.push(`una contraseña débil al confirmar no se rechazó bien (${debil.estado})`);

  if (fallos.length) { console.log('FALLOS:\n- ' + fallos.join('\n- ')); process.exit(1); }
  console.log('OK: límites por IP, por IP y correo, y por correo funcionan');
})();
