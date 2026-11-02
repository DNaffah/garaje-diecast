/* Sincronización con Supabase. El código del garaje llega en el link del regalo (?g=...)
   y cada dispositivo lo recuerda. Si en config.js alguien pone la clave secreta, aquí se ignora. */
import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA } from './config.js';

const CLAVE_ID = 'garaje164.id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function claveSegura(clave) {
  if (!clave || clave.startsWith('sb_secret_')) return '';
  if (clave.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(atob(clave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') return '';
    } catch { return ''; }
  }
  return clave;
}

const URL_OK = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL || '');
const CLAVE = claveSegura(SUPABASE_CLAVE_PUBLICA);
if (SUPABASE_CLAVE_PUBLICA && !CLAVE) console.warn('config.js: esa clave no es pública. Usa la Publishable key o la anon.');

export function idGaraje() {
  const enEnlace = new URLSearchParams(location.search).get('g') || '';
  if (UUID.test(enEnlace)) {
    try { localStorage.setItem(CLAVE_ID, enEnlace.toLowerCase()); } catch { /* sin almacenamiento */ }
    return enEnlace.toLowerCase();
  }
  try { const v = localStorage.getItem(CLAVE_ID) || ''; return UUID.test(v) ? v : ''; } catch { return ''; }
}

/* Una vez guardado el código en el dispositivo, se quita de la barra de direcciones
   para que no termine en una captura de pantalla o en un link compartido por error. */
export function ocultarCodigoDelEnlace() {
  const params = new URLSearchParams(location.search);
  if (!params.has('g')) return;
  idGaraje();
  params.delete('g');
  const resto = params.toString();
  history.replaceState(null, '', location.pathname + (resto ? `?${resto}` : '') + location.hash);
}

export const nubeDisponible = () => URL_OK && Boolean(CLAVE) && Boolean(idGaraje());

async function rpc(funcion, cuerpo) {
  const cabeceras = { 'Content-Type': 'application/json', apikey: CLAVE };
  if (CLAVE.startsWith('eyJ')) cabeceras.Authorization = `Bearer ${CLAVE}`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funcion}`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}`);
  return r.json();
}

export async function leerNube() {
  const filas = await rpc('leer_garaje', { p_id: idGaraje() });
  const fila = Array.isArray(filas) ? filas[0] : null;
  if (!fila) throw new Error('El enlace del garaje no existe.');
  return { autos: Array.isArray(fila.autos) ? fila.autos : [], fondo: fila.fondo, actualizado: fila.actualizado };
}

let pendiente = null, temporizador = null;
export function guardarNube(autos, fondo, alTerminar) {
  pendiente = { p_id: idGaraje(), p_autos: autos, p_fondo: fondo };
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    const envio = pendiente;
    try {
      const actualizado = await rpc('guardar_garaje', envio);
      if (pendiente === envio) pendiente = null;
      alTerminar?.(null, actualizado);
    } catch (e) {
      alTerminar?.(e);
    }
  }, 700);
}
export const hayPendiente = () => Boolean(pendiente);
export function reintentar(alTerminar) { if (pendiente) guardarNube(pendiente.p_autos, pendiente.p_fondo, alTerminar); }
