import type { Customer, CustomerPolicy } from './customer.js'
import type { DataChangeTargetField } from './data-change.js'

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

// Quien dice ser cliente nuevo todavía no arranca el alta: primero se le ofrece resolver
// consultas o darle datos de la empresa. El alta empieza solo si pide contratar.
export const newCustomerQueryOffer =
  'Perfecto. ¿Tiene alguna consulta sobre nuestros servicios o necesita algún dato de la empresa? Si quiere contratar un seguro, indíquemelo y le pido los datos para iniciar el alta.'

// Consulta que necesita un cliente identificado, hecha por alguien que todavía no lo es.
export const newCustomerNoDataNotice =
  'Como todavía no es cliente de Seguros Castaño, no tiene pólizas ni datos registrados en la empresa.'

// La misma consulta por sus datos, con la oferta vuelta a mandar en el mismo mensaje.
export const newCustomerNoDataAndOffer =
  `${newCustomerNoDataNotice} ¿Tiene alguna consulta sobre nuestros servicios o necesita algún dato de la empresa? ` +
  'Si quiere contratar un seguro, indíquemelo y le pido los datos para iniciar el alta.'

// Aviso a quien pregunta por sus datos o sus teléfonos sin haberse identificado todavía.
export const notIdentifiedDataNotice = 'Todavía no se identificó, por lo que no le puedo mostrar sus datos.'

// El mismo aviso, para la consulta por el listado de sus pólizas.
export const notIdentifiedPoliciesNotice = 'Todavía no se identificó, por lo que no le puedo mostrar sus pólizas.'

// Cliente identificado sin ninguna póliza en la cartera: no hay listado que mostrar.
export const noPoliciesMessage = 'No tiene pólizas registradas en la empresa.'

// Después de contestar los datos o las pólizas que pidió un cliente identificado, se le
// pregunta si sigue con algo más, en el mismo mensaje, para no dejar la respuesta colgada.
export const anotherQueryQuestion = '¿Tiene alguna otra consulta?'

// El listado de pólizas del cliente identificado, una línea por póliza con su número, su
// ramo, su estado y su vencimiento. Como los datos personales, no pasa por la redacción
// del proveedor de IA: son datos de la cartera y tienen que salir tal cual.
export function customerPoliciesTemplate(customer: Customer, now: Date): string {
  if (customer.policies.length === 0) return noPoliciesMessage
  const lines = customer.policies.map((policy) => {
    const verb = isExpired(policy, now) ? 'venció' : 'vence'
    return `- ${policy.number} (${policy.ramo}): ${displayStatus(policy, now)}, ${verb} el ${displayDate(policy.expirationDate)}.`
  })
  return ['Sus pólizas:', ...lines].join('\n')
}

// Los datos registrados del cliente identificado, una línea por dato. No pasan por la
// redacción del proveedor de IA: son datos personales y tienen que salir tal cual.
export function customerDataTemplate(customer: Customer, phones: string[]): string {
  const phoneLines = phones.length > 0 ? ['Teléfonos vinculados:', ...phones] : ['Teléfonos vinculados: ninguno']
  return [
    'Sus datos registrados:',
    `Nombre y apellido: ${customer.firstName} ${customer.lastName}`,
    `DNI: ${customer.dni}`,
    ...phoneLines,
  ].join('\n')
}

export const customerStatusRetryQuestion =
  'Disculpe, no pude identificar si ya es cliente o si sería un cliente nuevo. ¿Podría confirmármelo?'

export const existingCustomerDniRequest =
  'Gracias. Para verificar sus datos, ¿me indica su DNI? El número desde el que nos escribe quedará sujeto a revisión para actualizar su teléfono de contacto.'

export const prospectHandoffMessage =
  'Gracias por compartir sus datos y la foto de su DNI. Un miembro autorizado del equipo revisará la solicitud y se comunicará con usted para completar el alta.'

export const phoneChangePendingMessage =
  'Verificamos sus datos. La actualización de este número quedó pendiente de aprobación por un miembro del equipo; le informaremos la decisión por este WhatsApp.'

// Respuesta fija a lo que no tiene que ver con la agencia, incluidas las preguntas sobre
// cómo funciona el asistente: no deriva ni revela nada del sistema.
export const notInsuranceMessage =
  'Disculpe, esa consulta no tiene que ver con Seguros Castaño. Si tiene una consulta sobre sus seguros, estamos para ayudarlo.'

// Lo mismo dicho por un cliente nuevo en la oferta, con la oferta vuelta a mandar en el mismo
// mensaje: un solo envío en vez del texto fijo y la oferta uno atrás del otro.
export const notInsuranceAndNewCustomerOffer =
  'Disculpe, esa consulta no tiene que ver con Seguros Castaño. ¿Tiene alguna consulta sobre nuestros servicios o necesita algún dato de la empresa? Si quiere contratar un seguro, indíquemelo y le pido los datos para iniciar el alta.'

// Repreguntas cuando no se entiende la consulta: una redacción distinta por intento, para no
// repetir el mismo mensaje; sin datos de las pólizas y sin pasar por la redacción de la IA.
export const clarificationRequests = [
  'Disculpe, no terminé de entender su consulta. ¿Podría contármela con otras palabras?',
  'Todavía no entendí bien su consulta. ¿Podría explicarla de otra manera?',
]

// step es la cantidad de repreguntas que ya se mandaron (1 la primera, 2 la segunda). Con un
// paso fuera del catálogo se usa el último texto.
export function clarificationRequestFor(step: number): string {
  return clarificationRequests[step - 1] ?? clarificationRequests[clarificationRequests.length - 1] ?? ''
}

export const useNewPhoneRequest =
  'Para solicitar un cambio de teléfono, escríbanos desde el nuevo número. Así podremos verificarlo antes de iniciar el trámite.'

// Preguntas del flujo de cambio de datos (change cambio-datos-cliente): una redacción
// distinta por intento, en versión de usted y sin pasar por la redacción de la IA.
export const dataChangeFieldQuestions = [
  'Para procesar su pedido, ¿qué dato personal quiere cambiar: su nombre o su apellido?',
  '¿Cuál de sus datos personales necesita actualizar: el nombre o el apellido?',
  'Para ayudarlo con la actualización, indíqueme por favor qué dato quiere cambiar: su nombre o su apellido.',
]

// attempt 0 es la pregunta inicial y 1 y 2 las repreguntas; con un intento fuera del
// catálogo se usa el último texto.
export function dataChangeFieldQuestion(attempt: number): string {
  return dataChangeFieldQuestions[attempt] ?? dataChangeFieldQuestions[dataChangeFieldQuestions.length - 1] ?? ''
}

const dataChangeValueQuestions = [
  'Perfecto. ¿Cuál es el nuevo {field} que quiere tener registrado?',
  '¿Me indica el nuevo {field} que desea registrar?',
  'Para completar el cambio de {field}, necesito el nuevo dato. ¿Cuál sería?',
]

// Mismo criterio de intentos que la pregunta del campo.
export function dataChangeValueQuestion(field: DataChangeTargetField, attempt: number): string {
  const template = dataChangeValueQuestions[attempt] ?? dataChangeValueQuestions[dataChangeValueQuestions.length - 1] ?? ''
  return template.replace('{field}', field)
}

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

export function welcomeMessage(customer: Customer, fresh = true): string {
  const greeting = fresh ? `Hola, ${customer.firstName}` : `Gracias, ${customer.firstName}`
  return `${greeting}. ¿En qué lo puedo ayudar?`
}

export function courtesyTemplate(customer: Customer, fresh = true): string {
  return fresh ? `Hola, ${customer.firstName}. ¿En qué lo puedo ayudar?` : '¿En qué más puedo ayudarle?'
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
