/* Todas las llamadas al servidor propio (/api). La sesión va sola en una cookie que
   esta página no puede leer. La cabecera X-Garaje la exige el servidor para aceptar
   cambios: un formulario de otro sitio no la puede poner. */
export class ErrorApi extends Error {
  constructor(mensaje, estado, datos) { super(mensaje); this.estado = estado; this.datos = datos; }
}

export async function api(metodo, ruta, cuerpo) {
  const opciones = { method: metodo, credentials: 'same-origin', cache: 'no-store', headers: { 'X-Garaje': '1' } };
  if (metodo !== 'GET') {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo ?? {});
  }
  let r;
  try {
    r = await fetch(`/api/${ruta}`, opciones);
  } catch {
    throw new ErrorApi('Sin conexión. Revisa el internet e intenta de nuevo.', 0, {});
  }
  let datos = {};
  try { datos = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new ErrorApi(datos.error || 'Algo falló. Intenta de nuevo.', r.status, datos);
  return datos;
}
