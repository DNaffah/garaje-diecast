/* Si alguien mete la página dentro de otra (un iframe), no se muestra: evita trucos de clic
   engañoso. El servidor además manda frame-ancestors 'none'. */
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error("La página no se puede usar dentro de otra.");
}

import { iniciarPanel } from './garaje.js';
import { iniciarMuseo } from './museo.js';
import { iniciarAcceso } from './cuenta.js';

let iniciado = false;
iniciarAcceso(async () => {
  if (iniciado) return;
  iniciado = true;
  await iniciarPanel();
  iniciarMuseo();
});
