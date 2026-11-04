// Plan de cuotas del alta de póliza, con la misma regla que el backend
// (backend/src/domain/installments.ts): una cuota por mes desde el inicio de la
// vigencia, el mismo día de cada mes (el último si el mes es más corto),
// mientras venza antes del vencimiento. El backend decide: esto solo sirve
// para preguntar cuántas cuotas vencidas están pagas y armar el resumen.

// Fecha de hoy en Argentina, aaaa-mm-dd: igual que el backend
// (templates.ts, argentinaToday), aunque el navegador esté en otra zona.
export function hoyEnArgentina(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? ''
  return `${parte('year')}-${parte('month')}-${parte('day')}`
}

export function vencimientosMensuales(inicio: string, vencimiento: string): string[] {
  const fechas: string[] = []
  if (!inicio || !vencimiento || vencimiento <= inicio) return fechas
  for (let mes = 0; ; mes += 1) {
    const fecha = sumarMeses(inicio, mes)
    if (fecha >= vencimiento) break
    fechas.push(fecha)
  }
  return fechas
}

// Vencida: con vencimiento anterior a hoy en Argentina, igual que el saldo.
export function cuotasVencidas(vencimientos: string[], hoy: string): number {
  return vencimientos.filter((fecha) => fecha < hoy).length
}

function sumarMeses(iso: string, meses: number): string {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const mesDestino = mes - 1 + meses
  const ultimoDia = new Date(Date.UTC(anio, mesDestino + 1, 0)).getUTCDate()
  return new Date(Date.UTC(anio, mesDestino, Math.min(dia, ultimoDia))).toISOString().slice(0, 10)
}
