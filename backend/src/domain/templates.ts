import type { Customer, CustomerPolicy } from './customer.js'

// Textos del asistente (design.md, decisión 4). Los fijos se envían tal cual; los de
// póliza y la cortesía pasan por la redacción del modelo y por checkRewrite.

// Mensaje sugerido de AGENTS.md para las derivaciones.
export const handoffMessage =
  'Su pregunta será derivada a un miembro de nuestro equipo especializado, quien podrá ayudarlo con mayor detalle.'

export const approvalNotice =
  'Recibimos su pedido. Un miembro de nuestro equipo lo va a revisar y se va a comunicar con usted.'

export const firstDniRequest =
  'Hola, gracias por comunicarse con Seguros Castaño. Para poder ayudarlo, ¿me indica su número de DNI?'

export const repeatedDniRequest = 'Para poder ayudarlo, necesito su número de DNI.'

export const newCustomerNameRequest =
  'Gracias por elegirnos. Para iniciar el alta, ¿me indica su nombre y apellido?'

export const newCustomerDniRequest = 'Gracias. Ahora, ¿me indica su número de DNI?'

export const newCustomerPhotoRequest =
  'Por último, envíenos una foto clara de su DNI por este mismo chat. La imagen quedará disponible en WhatsApp para el equipo y no se guardará una copia en el sistema.'

export const newCustomerPhotoRetryRequest = 'Para continuar con el alta, necesitamos una foto clara de su DNI enviada por este chat.'

export const customerStatusQuestion =
  'Para orientarlo mejor, ¿ya es cliente de Seguros Castaño o sería un cliente nuevo?'

export const customerStatusRetryQuestion =
  'Disculpe, no pude identificar si ya es cliente o si sería un cliente nuevo. ¿Podría confirmármelo?'

export const existingCustomerDniRequest =
  'Gracias. Para verificar sus datos, ¿me indica su DNI? El número desde el que nos escribe quedará sujeto a revisión para actualizar su teléfono de contacto.'

export const prospectHandoffMessage =
  'Gracias por compartir sus datos y la foto de su DNI. Un miembro autorizado del equipo revisará la solicitud y se comunicará con usted para completar el alta.'

export const phoneChangePendingMessage =
  'Verificamos sus datos. La actualización de este número quedó pendiente de aprobación por un miembro del equipo; le informaremos la decisión por este WhatsApp.'

export const useNewPhoneRequest =
  'Para solicitar un cambio de teléfono, escríbanos desde el nuevo número. Así podremos verificarlo antes de iniciar el trámite.'

export type Clock = () => Date

const argentinaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Fecha de hoy en Argentina, aaaa-mm-dd: la del servidor está en UTC (docs/caso8_der.md).
export function argentinaToday(now: Date): string {
  return argentinaDate.format(now)
}

export function isExpired(policy: CustomerPolicy, now: Date): boolean {
  return policy.expirationDate < argentinaToday(now)
}

function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function displayStatus(policy: CustomerPolicy, now: Date): string {
  return policy.status === 'activa' && isExpired(policy, now) ? 'vencida' : policy.status
}

export function welcomeMessage(customer: Customer): string {
  return `Gracias, ${customer.firstName}. ¿En qué lo puedo ayudar?`
}

export function courtesyTemplate(customer: Customer): string {
  return `Gracias por escribirnos, ${customer.firstName}. ¿En qué lo puedo ayudar?`
}

export function expirationsTemplate(customer: Customer, now: Date): string {
  const lines = customer.policies.map((policy) => {
    const verb = isExpired(policy, now) ? 'venció' : 'vence'
    return `- ${policy.number} (${policy.ramo}): ${verb} el ${displayDate(policy.expirationDate)}.`
  })
  return [`${customer.firstName}, estos son los vencimientos de sus pólizas:`, ...lines].join('\n')
}

export function statusesTemplate(customer: Customer, now: Date): string {
  const lines = customer.policies.map((policy) => `- ${policy.number} (${policy.ramo}): ${displayStatus(policy, now)}.`)
  return [`${customer.firstName}, este es el estado de sus pólizas:`, ...lines].join('\n')
}
