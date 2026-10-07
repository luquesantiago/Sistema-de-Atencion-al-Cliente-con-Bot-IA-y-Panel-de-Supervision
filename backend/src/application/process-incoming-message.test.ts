import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiClient, CustomerStatus, RewriteInput } from '../domain/ai-client.js'
import type { Customer } from '../domain/customer.js'
import type { Intent } from '../domain/intent.js'
import {
  approvalNotice,
  customerStatusQuestion,
  customerStatusRetryQuestion,
  existingCustomerDniRequest,
  firstDniRequest,
  handoffMessage,
  newCustomerNameRequest,
  newCustomerPhotoRequest,
  phoneChangePendingMessage,
  prospectHandoffMessage,
  repeatedDniRequest,
  useNewPhoneRequest,
} from '../domain/templates.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'
import { InMemoryCustomerRepository } from '../infrastructure/in-memory-customer-repository.js'
import { ProcessIncomingMessage } from './process-incoming-message.js'

// Clientes ficticios, solo para estas pruebas.
const ana: Customer = {
  id: 'ficticio-ana',
  dni: '99000001',
  firstName: 'Ana',
  lastName: 'Ficticia',
  policies: [
    { number: 'POL-90001', ramo: 'auto', status: 'activa', expirationDate: '2027-03-15' },
    { number: 'POL-90002', ramo: 'hogar', status: 'activa', expirationDate: '2026-09-01' },
  ],
}
const bruno: Customer = {
  id: 'ficticio-bruno',
  dni: '99000002',
  firstName: 'Bruno',
  lastName: 'Ficticio',
  policies: [{ number: 'POL-90003', ramo: 'moto', status: 'suspendida por mora', expirationDate: '2026-12-10' }],
}
const carla: Customer = { id: 'ficticio-carla', dni: '99000003', firstName: 'Carla', lastName: 'Ficticia', policies: [] }

const now = new Date('2026-10-05T15:00:00Z')
const phone = '5490000000001'
const otherPhone = '5490000000002'

// Decisor falso: la intención sale de una tabla por texto; la redacción devuelve la
// plantilla tal cual, salvo que la prueba la cambie. Registra todo lo que recibe.
class FakeAi implements AiClient {
  public customerStatusClassified: string[] = []
  public readonly classified: string[] = []
  public readonly rewritten: RewriteInput[] = []
  public customerStatuses = new Map<string, CustomerStatus>()
  public customerStatusError: Error | null = null
  public intents = new Map<string, Intent>()
  public classifyError: Error | null = null
  public rewriteResult: ((input: RewriteInput) => string) | Error = (input) => input.template

  public async classifyCustomerStatus(reply: string): Promise<CustomerStatus> {
    this.customerStatusClassified.push(reply)
    if (this.customerStatusError) throw this.customerStatusError
    return this.customerStatuses.get(reply) ?? 'UNRELATED'
  }

  public async classifyIntent(text: string): Promise<Intent> {
    this.classified.push(text)
    if (this.classifyError) throw this.classifyError
    return this.intents.get(text) ?? 'no sé'
  }

  public async rewrite(input: RewriteInput): Promise<string> {
    this.rewritten.push(input)
    if (this.rewriteResult instanceof Error) throw this.rewriteResult
    return this.rewriteResult(input)
  }
}

class FakeWhatsApp implements WhatsAppClient {
  public readonly sent: Array<{ phone: string; text: string }> = []
  public failNext = false

  public async sendText(to: string, text: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('WAHA no respondió')
    }
    this.sent.push({ phone: to, text })
  }

  public textsTo(to: string): string[] {
    return this.sent.filter((message) => message.phone === to).map((message) => message.text)
  }
}

let ai: FakeAi
let whatsapp: FakeWhatsApp
let assistant: ProcessIncomingMessage
let customers: InMemoryCustomerRepository
let counter = 0

function newAssistant(phoneLinked = true) {
  customers = new InMemoryCustomerRepository([ana, bruno, carla])
  if (phoneLinked) {
    customers.linkPhone(phone)
    customers.linkPhone(otherPhone)
  }
  return new ProcessIncomingMessage(customers, ai, whatsapp, () => now)
}

function send(text: string, from = phone, messageId = `msg-${++counter}`, media?: 'image') {
  return assistant.execute({ messageId, phone: from, text, media })
}

function lastText(to = phone) {
  return whatsapp.textsTo(to).at(-1)
}

async function identify(dni = ana.dni, from = phone) {
  await send(dni, from)
  ai.classified.length = 0
  ai.rewritten.length = 0
}

beforeEach(() => {
  ai = new FakeAi()
  whatsapp = new FakeWhatsApp()
  assistant = newAssistant()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('DNI primero (RF-ATE-03)', () => {
  it('sin DNI pide el DNI y no llama al proveedor de IA', async () => {
    await expect(send('hola, ¿cuándo vence mi seguro?')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText()).toBe(firstDniRequest)
    expect(ai.classified).toEqual([])
  })

  it('con el DNI reconocido responde la consulta guardada', async () => {
    ai.intents.set('hola, ¿cuándo vence mi seguro?', 'vencimiento')
    await send('hola, ¿cuándo vence mi seguro?')
    await expect(send('99.000.001')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'vencimiento' })
    expect(ai.classified).toEqual(['hola, ¿cuándo vence mi seguro?'])
    expect(lastText()).toContain('POL-90001 (auto): vence el 15/03/2027.')
  })

  it('con el DNI reconocido y sin consulta guardada manda la bienvenida', async () => {
    await expect(send('99000001')).resolves.toMatchObject({ status: 'WELCOME_SENT' })
    expect(lastText()).toBe('Gracias, Ana. ¿En qué lo puedo ayudar?')
    expect(ai.classified).toEqual([])
  })

  it('una fecha no es un DNI: pide el DNI y no suma intento', async () => {
    await send('¿vence el 15/11/2026?')
    await expect(send('¿me escuchan? 15/11/2026')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText()).toBe(repeatedDniRequest)
  })
})

describe('DNI no reconocido (RF-ATE-03)', () => {
  it('al cuarto DNI no reconocido deriva; un texto sin DNI no suma intento', async () => {
    await send('Hola')
    await expect(send('30111222')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(lastText()).toBe(customerStatusQuestion)
    await expect(send('perdón, ya lo busco')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REASKED' })
    ai.customerStatuses.set('Sí, ya soy cliente', 'EXISTING_CUSTOMER')
    await send('Sí, ya soy cliente')
    await send('30111223')
    await send('Sí, ya soy cliente')
    await send('30111224')
    await send('Sí, ya soy cliente')
    await expect(send('30111225')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI no reconocido' })
    expect(lastText()).toBe(handoffMessage)
  })

  it('si el DNI es correcto después de confirmar que ya es cliente, responde la consulta pendiente', async () => {
    await send('¿en qué estado está mi póliza?')
    await send('30111222')
    ai.customerStatuses.set('Sí, ya soy cliente', 'EXISTING_CUSTOMER')
    await send('Sí, ya soy cliente')
    ai.intents.set('¿en qué estado está mi póliza?', 'estado de póliza')
    await expect(send('99000002')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'estado de póliza' })
    expect(lastText()).toContain('POL-90003 (moto): suspendida por mora.')
  })

})

describe('cliente nuevo', () => {
  it('interpreta la respuesta con IA, guarda los datos del prospecto y deriva al recibir la foto', async () => {
    assistant = newAssistant(false)
    ai.customerStatuses.set('Soy nuevo cliente', 'NEW_CUSTOMER')
    await expect(send('hola')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(lastText()).toBe(customerStatusQuestion)
    await expect(send('Soy nuevo cliente')).resolves.toMatchObject({ status: 'NAME_REQUESTED' })
    expect(lastText()).toBe(newCustomerNameRequest)
    await expect(send('Laura Inventada')).resolves.toMatchObject({ status: 'NEW_CUSTOMER_DNI_REQUESTED' })
    await expect(send('99.000.010')).resolves.toMatchObject({ status: 'PHOTO_REQUESTED' })
    expect(lastText()).toBe(newCustomerPhotoRequest)
    await expect(send('', phone, 'foto-dni', 'image')).resolves.toMatchObject({ status: 'PROSPECT_HANDED_OFF' })
    expect(customers.prospects).toEqual([{ phone, name: 'Laura Inventada', dni: '99000010' }])
    expect(lastText()).toBe(prospectHandoffMessage)
    expect(ai.customerStatusClassified).toEqual(['Soy nuevo cliente'])
    await expect(send('¿Me puede ayudar?')).resolves.toMatchObject({ status: 'SILENCED' })
    expect(customers.handoffMessages).toEqual([{ phone, content: '¿Me puede ayudar?' }])
    customers.closeHandoff(phone)
    await expect(send('Buenas')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
  })

  it('vuelve a preguntar cuando la respuesta no indica si ya es cliente', async () => {
    assistant = newAssistant(false)
    await send('Buenas')
    await expect(send('¿a qué hora atienden?')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REASKED' })
    expect(lastText()).toBe(customerStatusRetryQuestion)
  })

  it('enmascara el DNI antes de enviar la respuesta a la IA', async () => {
    assistant = newAssistant(false)
    ai.customerStatuses.set('Sí, mi DNI es [DNI]', 'EXISTING_CUSTOMER')
    await send('Hola')
    await send('Sí, mi DNI es 30.111.222')
    expect(ai.customerStatusClassified).toEqual(['Sí, mi DNI es [DNI]'])
  })

  it('deriva si falla el clasificador y no da por identificado al cliente', async () => {
    assistant = newAssistant(false)
    ai.customerStatusError = new Error('timeout')
    await send('Hola')
    await expect(send('Sí')).resolves.toMatchObject({ status: 'HANDOFF_SENT' })
    expect(customers.prospects).toEqual([])
    expect(lastText()).toBe(handoffMessage)
  })

  it('un cliente existente crea una solicitud pendiente sin vincular el teléfono automáticamente', async () => {
    assistant = newAssistant(false)
    ai.customerStatuses.set('Sí, ya soy cliente', 'EXISTING_CUSTOMER')
    await send('Hola')
    await send('Sí, ya soy cliente')
    expect(lastText()).toBe(existingCustomerDniRequest)
    await expect(send('30111222')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    await send('Sí, ya soy cliente')
    await expect(send(ana.dni)).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING' })
    expect(customers.phoneChangeRequests).toEqual([{ phone, customerId: ana.id }])
    expect(await customers.hasLinkedPhone(phone)).toBe(false)
    expect(lastText()).toBe(phoneChangePendingMessage)
    await expect(send('¿ya se actualizó?')).resolves.toMatchObject({ status: 'SILENCED' })
  })

  it('no persiste ni deriva un prospecto sin recibir la foto del DNI', async () => {
    assistant = newAssistant(false)
    ai.customerStatuses.set('Soy nuevo', 'NEW_CUSTOMER')
    await send('Hola')
    await send('Soy nuevo')
    await send('Laura Inventada')
    await send('99000099')
    await expect(send('No tengo la foto ahora')).resolves.toMatchObject({ status: 'PHOTO_REQUESTED' })
    expect(customers.prospects).toEqual([])
  })

  it('si el DNI declarado ya existe en la cartera, solicita la aprobación del teléfono y no duplica el prospecto', async () => {
    assistant = newAssistant(false)
    ai.customerStatuses.set('Soy nuevo', 'NEW_CUSTOMER')
    await send('Hola')
    await send('Soy nuevo')
    await send('Laura Inventada')
    await expect(send(ana.dni)).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING' })
    expect(customers.phoneChangeRequests).toEqual([{ phone, customerId: ana.id }])
    expect(customers.prospects).toEqual([])
  })
})

describe('solo datos propios (RF-ATE-02)', () => {
  it('la plantilla tiene solo las pólizas del identificado y el DNI no sale al proveedor', async () => {
    const question = 'mi DNI es 99-000-001, ¿cuándo vence?'
    await identify()
    ai.intents.set('mi DNI es [DNI], ¿cuándo vence?', 'vencimiento')
    await expect(send(question)).resolves.toMatchObject({ status: 'ANSWER_SENT' })

    const template = ai.rewritten[0]?.template ?? ''
    expect(template).toContain('POL-90001')
    expect(template).toContain('POL-90002')
    expect(template).not.toContain('POL-90003')
    const outgoing = JSON.stringify([ai.classified, ai.rewritten])
    expect(outgoing).not.toContain('99000001')
    expect(outgoing).not.toContain('99-000-001')
  })
})

describe('respuestas', () => {
  it('el saludo se responde con cortesía redactada, sin derivar', async () => {
    await identify()
    ai.intents.set('gracias!', 'saludo')
    ai.rewriteResult = () => 'Hola Ana, gracias por escribirnos. ¿En qué la puedo ayudar?'
    await expect(send('gracias!')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'saludo' })
    expect(lastText()).toBe('Hola Ana, gracias por escribirnos. ¿En qué la puedo ayudar?')
  })

  it('un cliente sin pólizas que pregunta el vencimiento se deriva sin redactar', async () => {
    await identify(carla.dni)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'cliente sin pólizas' })
    expect(ai.rewritten).toEqual([])
  })
})

describe('siniestros y cotizaciones (RF-ATE-04)', () => {
  it.each<[string, Intent]>([
    ['tuve un choque', 'siniestro'],
    ['¿cuánto sale asegurar el auto?', 'cotización'],
  ])('«%s» deriva sin redactar', async (text, intent) => {
    await identify()
    ai.intents.set(text, intent)
    ai.rewriteResult = () => 'Texto válido que no se debería usar.'
    await expect(send(text)).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: `intención: ${intent}` })
    expect(lastText()).toBe(handoffMessage)
    expect(ai.rewritten).toEqual([])
  })
})

describe('redacción controlada (RF-ATE-02)', () => {
  beforeEach(async () => {
    await identify()
    ai.intents.set('¿cuándo vence?', 'vencimiento')
  })

  it('se envía una redacción que conserva los datos', async () => {
    ai.rewriteResult = () =>
      'Ana, le cuento: su póliza POL-90001 de auto vence el 15/03/2027 y la POL-90002 de hogar venció el 01/09/2026.'
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    expect(lastText()).toContain('le cuento')
  })

  it('una redacción que cambia una fecha se deriva', async () => {
    ai.rewriteResult = (input) => input.template.replace('15/03/2027', '15/03/2028')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT' })
    expect(lastText()).toBe(handoffMessage)
    expect(whatsapp.textsTo(phone).some((text) => text.includes('2028'))).toBe(false)
  })

  it('si la redacción falla se deriva', async () => {
    ai.rewriteResult = new Error('timeout')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'falla de la redacción' })
  })
})

describe('mandar a aprobar (RF-APR-01)', () => {
  it.each<[string, Intent]>([
    ['quiero dar de baja la póliza', 'baja'],
    ['quiero agregar un conductor', 'modificación'],
  ])('«%s» manda el aviso fijo, sin redactar', async (text, intent) => {
    await identify()
    ai.intents.set(text, intent)
    await expect(send(text)).resolves.toMatchObject({ status: 'APPROVAL_NOTICE_SENT', intent })
    expect(lastText()).toBe(approvalNotice)
    expect(ai.rewritten).toEqual([])
  })

  it('pide escribir desde el nuevo número para iniciar el trámite de cambio de teléfono', async () => {
    await identify()
    ai.intents.set('cambié de número', 'cambio de teléfono')
    await expect(send('cambié de número')).resolves.toMatchObject({ status: 'NEW_PHONE_REQUESTED' })
    expect(lastText()).toBe(useNewPhoneRequest)
  })
})

describe('no es de seguros', () => {
  it('no se contesta nada', async () => {
    await identify()
    const sentBefore = whatsapp.sent.length
    ai.intents.set('¿me vendés zapatillas?', 'no es de seguros')
    await expect(send('¿me vendés zapatillas?')).resolves.toMatchObject({ status: 'IGNORED_NOT_INSURANCE' })
    expect(whatsapp.sent.length).toBe(sentBefore)
  })

  it('si era la consulta guardada antes del DNI, manda la bienvenida', async () => {
    ai.intents.set('¿me vendés zapatillas?', 'no es de seguros')
    await send('¿me vendés zapatillas?')
    await expect(send('99000001')).resolves.toMatchObject({ status: 'WELCOME_SENT' })
  })
})

describe('silencio después de derivar (RF-DER-03)', () => {
  it.each<[string, Intent]>([
    ['tuve un choque', 'siniestro'],
    ['quiero dar de baja la póliza', 'baja'],
  ])('después de «%s» no responde ni llama al proveedor; otro número sí se atiende', async (text, intent) => {
    await identify()
    ai.intents.set(text, intent)
    await send(text)
    const sentBefore = whatsapp.sent.length
    ai.classified.length = 0

    await expect(send('¿hola? ¿cuándo vence?')).resolves.toMatchObject({ status: 'SILENCED' })
    expect(whatsapp.sent.length).toBe(sentBefore)
    expect(ai.classified).toEqual([])

    await expect(send('hola', otherPhone)).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText(otherPhone)).toBe(firstDniRequest)
  })

  it('un backend reiniciado vuelve a pedir el DNI a un número identificado o en silencio', async () => {
    await identify()
    ai.intents.set('tuve un choque', 'siniestro')
    await send('tuve un choque')
    await identify(bruno.dni, otherPhone)

    assistant = newAssistant()
    await send('¿cuándo vence?')
    expect(lastText()).toBe(firstDniRequest)
    await send('¿cuándo vence?', otherPhone)
    expect(lastText(otherPhone)).toBe(firstDniRequest)
  })
})

describe('fallas', () => {
  it('si el proveedor falla al decidir, deriva y no lanza', async () => {
    await identify()
    ai.classifyError = new Error('HTTP 429')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({
      status: 'HANDOFF_SENT',
      reason: 'falla del proveedor al decidir',
    })
    expect(lastText()).toBe(handoffMessage)
  })

  it('si WhatsApp falla al derivar, lanza y el reintento vuelve a derivar', async () => {
    await identify()
    ai.intents.set('tuve un choque', 'siniestro')
    whatsapp.failNext = true
    await expect(send('tuve un choque', phone, 'msg-choque')).rejects.toThrow('WAHA')
    await expect(send('tuve un choque', phone, 'msg-choque')).resolves.toMatchObject({ status: 'HANDOFF_SENT' })
    expect(lastText()).toBe(handoffMessage)
  })

  it('el mismo mensaje dos veces envía una sola respuesta', async () => {
    await send('hola', phone, 'msg-repetido')
    await expect(send('hola', phone, 'msg-repetido')).resolves.toMatchObject({ status: 'DUPLICATE_IGNORED' })
    expect(whatsapp.textsTo(phone)).toEqual([firstDniRequest])
  })
})
