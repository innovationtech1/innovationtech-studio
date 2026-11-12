// Pone un límite de tiempo a una espera: nada se queda «pensando» para siempre (un video que el
// teléfono no termina de abrir, el audio que no arranca). Con `respaldo` no falla: devuelve ese valor.
export function conLimite<T>(p: Promise<T>, ms: number, mensaje: string | null, respaldo?: T): Promise<T> {
  let reloj: ReturnType<typeof setTimeout>;
  const tarde = new Promise<T>((res, rej) => {
    reloj = setTimeout(() => (mensaje === null ? res(respaldo as T) : rej(new Error(mensaje))), ms);
  });
  return Promise.race([p, tarde]).finally(() => clearTimeout(reloj));
}
