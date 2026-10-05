// Encadena las tareas de una misma clave: cada una arranca cuando termina la anterior, haya salido bien o mal.
// Las de claves distintas corren en paralelo. WAHA manda los avisos sin esperar la respuesta del anterior,
// así que el webhook la usa para procesar de a uno los mensajes de cada remitente.
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<void>>()

  public run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(key) ?? Promise.resolve()).then(task)
    const tail: Promise<void> = result
      .then(() => undefined, () => undefined)
      .then(() => {
        if (this.tails.get(key) === tail) this.tails.delete(key)
      })
    this.tails.set(key, tail)
    return result
  }
}
