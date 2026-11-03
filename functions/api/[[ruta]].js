/* Todo lo que llega a /api/* lo atiende servidor/app.js. */
import { manejar } from '../../servidor/app.js';

export const onRequest = (contexto) => manejar(contexto.request, contexto.env, contexto);
