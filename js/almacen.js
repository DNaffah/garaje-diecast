// Lo que se recuerda en este navegador: la lista del garaje y el fondo elegido.
// No hay cuentas ni datos personales; si el navegador bloquea el almacenamiento, la página sigue funcionando en memoria.

const CLAVE_GARAJE = 'garaje164.autos';
const CLAVE_FONDO = 'garaje164.fondo';
const CLAVE_FONDO_PROPIO = 'garaje164.fondoPropio';

function leer(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch { return porDefecto; }
}
function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch { return false; }
}

export function cargarGaraje() {
  const lista = leer(CLAVE_GARAJE, []);
  return Array.isArray(lista)
    ? lista.filter((a) => a && typeof a.titulo === 'string' && a.titulo.length < 200).map((a) => ({
        titulo: a.titulo, foto: typeof a.foto === 'string' ? a.foto : '', anio: typeof a.anio === 'string' ? a.anio : '',
      }))
    : [];
}
export const guardarGaraje = (lista) => guardar(CLAVE_GARAJE, lista);
export const cargarFondo = () => leer(CLAVE_FONDO, 'pista');
export const guardarFondo = (f) => guardar(CLAVE_FONDO, f);
export const cargarFondoPropio = () => {
  const v = leer(CLAVE_FONDO_PROPIO, '');
  return typeof v === 'string' && v.startsWith('data:image/') ? v : '';
};
export const guardarFondoPropio = (dataUrl) => guardar(CLAVE_FONDO_PROPIO, dataUrl);
