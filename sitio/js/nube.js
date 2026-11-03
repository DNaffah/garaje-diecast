/* El garaje vive en la cuenta. Se lee y se guarda a través del servidor propio;
   los cambios seguidos se juntan en un solo envío. */
import { api } from './api.js';

export async function leerNube() {
  const d = await api('GET', 'garaje');
  return { autos: Array.isArray(d.autos) ? d.autos : [], fondo: d.fondo, actualizado: d.actualizado };
}

let pendiente = null, temporizador = null;
export function guardarNube(autos, fondo, alTerminar) {
  pendiente = { autos, fondo };
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    const envio = pendiente;
    try {
      const d = await api('PUT', 'garaje', envio);
      if (pendiente === envio) pendiente = null;
      alTerminar?.(null, d.actualizado);
    } catch (e) {
      alTerminar?.(e);
    }
  }, 700);
}
export const hayPendiente = () => Boolean(pendiente);
export function reintentar(alTerminar) { if (pendiente) guardarNube(pendiente.autos, pendiente.fondo, alTerminar); }
