/* Lo que se queda guardado en este navegador. Si el navegador no deja guardar
   (modo incógnito, por ejemplo), la página funciona igual; solo que al cerrarla se olvida. */
const CLAVE_GARAJE = 'garaje164.autos';
const CLAVE_FONDO = 'garaje164.fondo';

function leer(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch { return false; }
}

export function cargarGaraje() {
  const lista = leer(CLAVE_GARAJE, []);
  return Array.isArray(lista) ? lista : [];
}
export const guardarGaraje = (lista) => guardar(CLAVE_GARAJE, lista);
export const cargarFondo = () => leer(CLAVE_FONDO, 'pista');
export const guardarFondo = (f) => guardar(CLAVE_FONDO, f);
