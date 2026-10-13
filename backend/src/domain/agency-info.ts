// Información de la agencia que el asistente responde en cualquier momento (RF-ATE-06): los
// ramos y los planes activos, la dirección, el teléfono y el horario de atención. No es de
// ningún cliente (change asistente-informacion-general, decisión 3).

// Un día con atención, como en horario_atencion: 1 = lunes … 7 = domingo, y las horas de
// Argentina en HH:MM.
export type OpeningHours = { day: number; opens: string; closes: string }

export type AgencyInfo = {
  // En el orden de su id.
  ramos: string[]
  plans: string[]
  // null si falta el parámetro o está vacío.
  address: string | null
  phone: string | null
  hours: OpeningHours[]
}

export interface AgencyInfoSource {
  read(): Promise<AgencyInfo>
}

// La plantilla y los datos que la redacción tiene que conservar tal cual (checkRewrite).
export type AgencyInfoAnswer = { template: string; literals: string[] }

const dayNames = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

function dayName(day: number): string {
  const name = dayNames[day - 1]
  if (!name) throw new Error(`Día de la semana fuera de rango: ${day}`)
  return name
}

// «los sábados», «los lunes»: lunes a viernes no cambian en plural.
function pluralDayName(day: number): string {
  const name = dayName(day)
  return name.endsWith('s') ? name : `${name}s`
}

// 09:00 da «9» y 09:30 da «9:30».
function hourText(time: string): string {
  const [hours = '', minutes = ''] = time.split(':')
  return minutes === '00' ? String(Number(hours)) : `${Number(hours)}:${minutes}`
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`
}

type HoursSegment = { text: string; days: string; hours: string }

// Agrupa los días seguidos con el mismo rango: «de lunes a viernes, de 9 a 18 h».
function hourSegments(hours: readonly OpeningHours[]): HoursSegment[] {
  const groups: OpeningHours[][] = []
  for (const day of [...hours].sort((a, b) => a.day - b.day)) {
    const group = groups.at(-1)
    const last = group?.at(-1)
    if (group && last && last.day + 1 === day.day && last.opens === day.opens && last.closes === day.closes) group.push(day)
    else groups.push([day])
  }
  return groups.flatMap((group) => {
    const first = group[0]
    const last = group.at(-1)
    if (!first || !last) return []
    const days = group.length > 1 ? `${dayName(first.day)} a ${dayName(last.day)}` : pluralDayName(first.day)
    const range = `${hourText(first.opens)} a ${hourText(first.closes)}`
    const daysText = group.length > 1 ? `de ${days}` : `los ${days}`
    return [{ text: `${daysText}, de ${range} h`, days, hours: range }]
  })
}

// La plantilla de la información de la agencia, o null si falta un dato: en ese caso se
// deriva (RF-ATE-02).
export function agencyInfoAnswer(info: AgencyInfo): AgencyInfoAnswer | null {
  const { ramos, plans, address, phone, hours } = info
  if (ramos.length === 0 || plans.length === 0 || hours.length === 0 || !address || !phone) return null
  const segments = hourSegments(hours)
  const template = [
    `Seguros Castaño ofrece seguros de ${listOf(ramos)}.`,
    `Los planes disponibles son ${listOf(plans)}.`,
    `Nuestra oficina está en ${address} y nuestro teléfono es ${phone}.`,
    `Nuestro horario de atención es ${listOf(segments.map((segment) => segment.text))}.`,
  ].join(' ')
  const literals = [...ramos, ...plans, address, phone, ...segments.flatMap((segment) => [segment.days, segment.hours])]
  return { template, literals }
}
