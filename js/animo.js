/* Mensajitos de ánimo. Salen al azar al abrir un carro, no siempre, para que no cansen. */
const NOTAS = [
  'El primero que compraste seguro todavía lo tienes. Ese cuenta doble.',
  'Hoy la pista es tuya. Sin límite de vueltas.',
  'Los modelos buenos tardan en salir. Tú vas a tu ritmo, y vas bien.',
  'Que este año traiga más rectas que curvas. Y que las curvas valgan la pena.',
  'Ningún loop es tan alto como para no intentarlo.',
  'Hasta el auto más rápido entra a pits. Descansa cuando haga falta.',
  'Lo raro aparece cuando uno no deja de buscar. Sigue buscando.',
  'Si se raya la pintura, igual sigue rodando.',
  'Feliz vuelta al sol. Que la siguiente sea a fondo.',
  'Otro más para la vitrina. Ya casi no cabe nada, ¿no?',
  'Lo que se arma con calma dura más que lo que sale de afán.',
  'Un Super Treasure Hunt no se encuentra todos los días. Tú tampoco.',
];

let ultima = -1;
let abiertos = 0;
let mostradas = 0;

export function quizasMostrarNota(nodo, texto, boton) {
  abiertos++;
  const toca = (mostradas === 0 && abiertos >= 2 && Math.random() < 0.7) || (mostradas > 0 && Math.random() < 0.33);
  if (!toca) return;
  let i;
  do { i = Math.floor(Math.random() * NOTAS.length); } while (i === ultima && NOTAS.length > 1);
  ultima = i;
  mostradas++;
  setTimeout(() => mostrar(nodo, texto, boton, NOTAS[i]), 1400);
}

function mostrar(nodo, texto, boton, frase) {
  texto.textContent = frase;
  nodo.hidden = false;
  const mov = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (mov) nodo.animate(
    [{ transform: 'translateY(30px) rotate(4deg) scale(.9)', opacity: 0 }, { transform: 'translateY(-4px) rotate(-1.5deg)', opacity: 1, offset: .7 }, { transform: 'rotate(-1deg)', opacity: 1 }],
    { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  const cerrar = () => {
    boton.removeEventListener('click', cerrar);
    clearTimeout(auto);
    if (!mov) { nodo.hidden = true; return; }
    nodo.animate([{ opacity: 1, transform: 'rotate(-1deg)' }, { opacity: 0, transform: 'translateY(20px) rotate(3deg)' }], { duration: 220, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
      .finished.then(() => { nodo.hidden = true; });
  };
  boton.addEventListener('click', cerrar);
  const auto = setTimeout(cerrar, 6500);
}
