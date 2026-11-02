/* Para acciones que no se deshacen: el primer toque pregunta, el segundo hace. */
export function confirmarDosVeces(boton, pregunta) {
  if (boton.dataset.confirmando === '1') { delete boton.dataset.confirmando; return true; }
  const original = [...boton.childNodes].map((n) => n.cloneNode(true));
  boton.dataset.confirmando = '1';
  boton.textContent = pregunta;
  setTimeout(() => {
    if (boton.dataset.confirmando !== '1') return;
    delete boton.dataset.confirmando;
    boton.replaceChildren(...original);
  }, 3500);
  return false;
}
