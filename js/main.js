/* Si alguien mete la página dentro de otra (un iframe), no se muestra: evita trucos de clic engañoso. */
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  throw new Error("La página no se puede usar dentro de otra.");
}

import { iniciarPanel } from './garaje.js';
import { iniciarMuseo } from './museo.js';

iniciarPanel();
iniciarMuseo();
