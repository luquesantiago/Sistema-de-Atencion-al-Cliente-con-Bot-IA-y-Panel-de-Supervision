import { policyStatuses, ramos } from './customer.js'

export type RewriteCheck = { ok: true } | { ok: false; reason: string }

// Términos que la redacción no puede sumar (design.md, decisión 5): compromisos de
// acciones, temas que se derivan o datos que no están en la plantilla, y presentarse
// como persona o como bot. Se buscan por raíz, sin tildes y en minúsculas.
export const forbiddenTerms: ReadonlyArray<{ term: string; pattern: RegExp }> = [
  { term: 'registrad', pattern: /\bregistrad/g },
  { term: 'aprobad', pattern: /\baprobad/g },
  { term: 'confirmad', pattern: /\bconfirmad/g },
  { term: 'procesad', pattern: /\bprocesad/g },
  { term: 'gestionad', pattern: /\bgestionad/g },
  { term: 'dimos de baja', pattern: /\bdimos de baja\b/g },
  { term: 'dada de baja', pattern: /\bdada de baja\b/g },
  { term: 'modificad', pattern: /\bmodificad/g },
  { term: 'reembols', pattern: /\breembols/g },
  { term: 'devolv', pattern: /\bdevolv/g },
  { term: 'cobertura', pattern: /\bcobertura/g },
  { term: 'plan', pattern: /\bplan(es)?\b/g },
  { term: 'cotiz', pattern: /\bcotiz/g },
  { term: 'precio', pattern: /\bprecio/g },
  { term: 'siniestro', pattern: /\bsiniestro/g },
  { term: 'saldo', pattern: /\bsaldo/g },
  { term: 'deuda', pattern: /\bdeuda/g },
  { term: 'cuota', pattern: /\bcuota/g },
  { term: 'soy una persona', pattern: /\bsoy una persona\b/g },
  { term: 'soy un humano', pattern: /\bsoy (un )?humano\b/g },
  { term: 'inteligencia artificial', pattern: /\binteligencia artificial\b/g },
  { term: 'bot', pattern: /\bbots?\b/g },
]

const linkPattern = /https?:\/\/|www\.|@|\b[a-z0-9-]+\.(com|ar|net|org|gob|gov|io|info)\b/

// Un importe con su moneda, sobre el texto normalizado: «$ 45.000,00» o «us$ 45,00». Se
// compara entero, así cambiar el formato, la moneda o el número no coincide.
const amountPattern = /(?:us\$|\$) ?\d{1,3}(?:\.\d{3})*,\d{2}\b/g
const policyPattern = /\bpol-\d+\b/g
const datePattern = /\b\d{2}\/\d{2}\/\d{4}\b/g
const digitsPattern = /\d+/g
// Los días de la semana, sin tildes y en singular o en plural: una redacción que agrega
// un día al horario cambia los datos. «Vencida(s)», «por vencer» y «ningún/ninguna» dan el
// sentido de los importes del saldo: si cambian, cambia lo que se informa.
const weekdays = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabados?', 'domingos?']
const wordPatterns = [
  ...policyStatuses,
  'vencidas?',
  ...ramos,
  'vence',
  'vencio',
  'por vencer',
  'ningun[ao]?',
  ...weekdays,
].map(
  (word) => [word, new RegExp(`\\b${word}\\b`, 'g')] as const,
)

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

function literalPattern(literal: string): RegExp {
  return new RegExp(`\\b${normalize(literal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
}

// Datos de un texto con su posición: importes, pólizas, fechas, otros números, estados,
// ramos, días de la semana y las palabras de los vencimientos. Los importes, las pólizas y
// las fechas se tapan con espacios antes de buscar lo demás, para no contar sus dígitos
// como números sueltos sin correr las posiciones.
function dataOf(text: string): Array<{ position: number; item: string }> {
  const data: Array<{ position: number; item: string }> = []
  let rest = text
  for (const [kind, pattern] of [['importe', amountPattern], ['póliza', policyPattern], ['fecha', datePattern]] as const) {
    for (const match of rest.matchAll(pattern)) data.push({ position: match.index, item: `${kind}:${match[0].replace(' ', '')}` })
    rest = rest.replace(pattern, (match) => ' '.repeat(match.length))
  }
  for (const match of rest.matchAll(digitsPattern)) data.push({ position: match.index, item: `número:${match[0]}` })
  for (const [word, pattern] of wordPatterns) {
    for (const match of rest.matchAll(pattern)) data.push({ position: match.index, item: `palabra:${word}` })
  }
  return data
}

// Sin orden, los datos se comparan como multiconjunto. En orden (el saldo), como secuencia:
// así no se pueden intercambiar las cuotas vencidas con las por vencer.
function dataSequence(text: string, ordered: boolean): string[] {
  const data = dataOf(text)
  if (ordered) return data.sort((a, b) => a.position - b.position).map(({ item }) => item)
  return data.map(({ item }) => item).sort()
}

// Controla la redacción del modelo contra la plantilla que la originó (RF-ATE-02). literals
// son los datos de la información de la agencia (ramos, planes, dirección, teléfono y
// horario): cada uno tiene que aparecer tal cual, las mismas veces que en la plantilla. Se
// controlan antes que los demás datos, para que el motivo diga qué dato cambió. ordered
// exige además que los datos aparezcan en el mismo orden que en la plantilla.
export function checkRewrite(
  template: string,
  draft: string,
  literals: readonly string[] = [],
  ordered = false,
): RewriteCheck {
  const normalizedDraft = normalize(draft)
  const normalizedTemplate = normalize(template)
  if (!normalizedDraft.trim()) return { ok: false, reason: 'redacción vacía' }
  if (linkPattern.test(normalizedDraft)) return { ok: false, reason: 'link o dirección' }

  for (const literal of literals) {
    const pattern = literalPattern(literal)
    if (countMatches(normalizedDraft, pattern) !== countMatches(normalizedTemplate, pattern)) {
      return { ok: false, reason: 'dato de la agencia distinto' }
    }
  }

  const expected = dataSequence(normalizedTemplate, ordered)
  const actual = dataSequence(normalizedDraft, ordered)
  if (expected.length !== actual.length || expected.some((item, index) => item !== actual[index])) {
    return { ok: false, reason: 'datos distintos de la plantilla' }
  }

  for (const { term, pattern } of forbiddenTerms) {
    if (countMatches(normalizedDraft, pattern) > countMatches(normalizedTemplate, pattern)) {
      return { ok: false, reason: `término prohibido: ${term}` }
    }
  }
  return { ok: true }
}
