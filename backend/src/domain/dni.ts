// Un DNI de 7 u 8 dígitos, junto o en grupos separados por puntos, espacios o guiones
// (30111222, 30.111.222, 30 111 222, 30-111-222). No puede ser parte de un número más
// largo ni de una fecha: «15/11/2026» no es un DNI.
const dniPattern = /(?<![\d/])(?<!\d[.-])(\d{1,2})[.\s-]?(\d{3})[.\s-]?(\d{3})(?![\d/])(?![.-]\d)/g

export function findDni(text: string): string | null {
  for (const match of text.matchAll(dniPattern)) {
    return `${match[1]}${match[2]}${match[3]}`
  }
  return null
}

// Lo que sale al proveedor de IA nunca lleva el DNI: se tapa con la misma expresión que
// lo reconoce, así que los dos aceptan los mismos formatos.
export function maskDni(text: string): string {
  return text.replace(dniPattern, '[DNI]')
}

export type YesNo = 'yes' | 'no'

// Respuesta a «¿Es usted cliente nuevo?». Lo resuelve el código, sin el modelo: antes de
// identificar al cliente no sale nada al proveedor. Lo que no es un sí se toma como un no.
export function parseYesNo(text: string): YesNo {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/^[^\p{L}]+/u, '')
  return /^(si|soy nuev[oa])(?![\p{L}])/u.test(normalized) ? 'yes' : 'no'
}
