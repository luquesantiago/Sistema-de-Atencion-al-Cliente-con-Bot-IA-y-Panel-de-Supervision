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
  newCustomerPhotoRetryRequest,
  phoneChangePendingMessage,
  prospectHandoffMessage,
  repeatedDniRequest,
  useNewPhoneRequest,
} from '../domain/templates.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'
import { InMemoryConversationStore } from '../infrastructure/in-memory-conversation-store.js'
import { InMemoryCustomerRepository } from '../infrastructure/in-memory-customer-repository.js'
import { ProcessIncomingMessage } from './process-incoming-message.js'

// Clientes ficticios, solo para estas pruebas.
const ana: Customer = {
  id: 1,
  dni: '99000001',
  firstName: 'Ana',
  lastName: 'Ficticia',
  policies: [
    { number: 'POL-90001', ramo: 'auto', status: 'activa', expirationDate: '2027-03-15' },
    { number: 'POL-90002', ramo: 'hogar', status: 'activa', expirationDate: '2026-09-01' },
  ],
}
const bruno: Customer = {
  id: 2,
  dni: '99000002',
  firstName: 'Bruno',
  lastName: 'Ficticio',
  policies: [{ number: 'POL-90003', ramo: 'moto', status: 'suspendida por mora', expirationDate: '2026-12-10' }],
}
const carla: Customer = { id: 3, dni: '99000003', firstName: 'Carla', lastName: 'Ficticia', policies: [] }

const start = new Date('2026-10-07T15:00:00Z')
const phone = '5490000000001'
const otherPhone = '5490000000002'

// Decisor falso: la intención y el tipo de cliente salen de una tabla por texto; la
// redacción devuelve la plantilla tal cual, salvo que la prueba la cambie. Registra todo.
class FakeAi implements AiClient {
  public readonly customerStatusClassified: string[] = []
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
let customers: InMemoryCustomerRepository
let store: InMemoryConversationStore
let assistant: ProcessIncomingMessage
let now: Date
let counter = 0

// Una instancia nueva sobre el mismo almacén es un backend reiniciado.
function restart() {
  assistant = new ProcessIncomingMessage(customers, store, ai, whatsapp, () => now)
}

function useStore(settings: { maxDniRetries: number; inactivityMinutes: number }) {
  store = new InMemoryConversationStore(settings)
  restart()
}

function later(minutes: number) {
  now = new Date(now.getTime() + minutes * 60_000)
}

function send(text: string, from = phone, messageId = `msg-${++counter}`, media?: 'image') {
  return assistant.execute({ messageId, phone: from, text, ...(media ? { media } : {}) })
}

function sendPhoto(from = phone) {
  return send('', from, `foto-${++counter}`, 'image')
}

function lastText(to = phone) {
  return whatsapp.textsTo(to).at(-1)
}

function link(number: string, ...linked: Customer[]) {
  for (const customer of linked) customers.linkPhone(number, customer.id)
}

// Número vinculado a Ana y a Bruno: pide el DNI.
async function identifyShared(customer: Customer = ana, from = phone) {
  link(from, ana, bruno)
  await send(customer.dni, from)
  ai.classified.length = 0
  ai.rewritten.length = 0
}

async function openConversation(from = phone) {
  const open = await store.findOpen(from)
  if (!open) throw new Error('No hay conversación abierta')
  return open
}

function casesOf(conversationId: number) {
  return store.snapshot().cases.filter((item) => item.conversationId === conversationId)
}

beforeEach(() => {
  ai = new FakeAi()
  whatsapp = new FakeWhatsApp()
  customers = new InMemoryCustomerRepository([ana, bruno, carla])
  now = start
  useStore({ maxDniRetries: 3, inactivityMinutes: 30 })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('número vinculado (RF-ATE-03, RF-CAR-03)', () => {
  it('vinculado a un solo cliente: responde sin pedir el DNI y la conversación queda con ese cliente', async () => {
    link(phone, ana)
    ai.intents.set('¿cuándo vence mi seguro?', 'vencimiento')
    await expect(send('¿cuándo vence mi seguro?')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'vencimiento' })
    expect(whatsapp.textsTo(phone)).toHaveLength(1)
    expect(lastText()).toContain('POL-90001 (auto): vence el 15/03/2027.')
    expect((await openConversation()).customerId).toBe(ana.id)
  })

  it('vinculado a dos clientes: pide el DNI y responde la consulta guardada con el cliente de ese DNI', async () => {
    link(phone, ana, bruno)
    await expect(send('¿en qué estado está mi póliza?')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText()).toBe(firstDniRequest)
    expect(ai.classified).toEqual([])
    ai.intents.set('¿en qué estado está mi póliza?', 'estado de póliza')
    await expect(send('99.000.002')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'estado de póliza' })
    expect(lastText()).toContain('POL-90003 (moto): suspendida por mora.')
    expect((await openConversation()).customerId).toBe(bruno.id)
  })

  it('vinculado a dos clientes: el DNI de un cliente no vinculado deriva', async () => {
    link(phone, ana, bruno)
    await send('hola')
    await expect(send(carla.dni)).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI de otra persona' })
    expect(lastText()).toBe(handoffMessage)
    expect((await openConversation()).customerId).toBeNull()
  })

  it('vinculado a dos clientes: el DNI y la consulta en el mismo mensaje van a un solo caso', async () => {
    link(phone, ana, bruno)
    ai.intents.set('mi DNI es [DNI], ¿cuándo vence?', 'vencimiento')
    await expect(send('mi DNI es 99000001, ¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    const conversation = await openConversation()
    expect(conversation.cases).toHaveLength(1)
    expect(conversation.cases[0]?.type).toBe('vencimiento')
  })

  it('vinculado a dos clientes: sin consulta guardada, manda la bienvenida', async () => {
    link(phone, ana, bruno)
    await expect(send(ana.dni)).resolves.toMatchObject({ status: 'WELCOME_SENT' })
    expect(lastText()).toBe('Gracias, Ana. ¿En qué lo puedo ayudar?')
    expect(ai.classified).toEqual([])
  })

  it('vinculado solo a un cliente cargado por error: se atiende como no vinculado', async () => {
    link(phone, ana)
    customers.deactivate(ana.id)
    await expect(send('hola')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(lastText()).toBe(customerStatusQuestion)
  })

  it('una fecha no es un DNI: vuelve a pedir el DNI y no cuenta un intento', async () => {
    link(phone, ana, bruno)
    await send('¿vence el 15/11/2026?')
    await expect(send('¿me escuchan? 15/11/2026')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText()).toBe(repeatedDniRequest)
  })
})

describe('otro DNI en una conversación identificada', () => {
  it('el DNI del mismo cliente sigue normal; un DNI distinto deriva', async () => {
    link(phone, ana)
    ai.intents.set('mi DNI es [DNI], ¿cuándo vence?', 'vencimiento')
    await expect(send('mi DNI es 99000001, ¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    await expect(send('y el de 99000002?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI de otra persona' })
    expect(lastText()).toBe(handoffMessage)
    expect((await openConversation()).suspended).toBe(true)
  })
})

describe('número no vinculado (RF-ATE-03)', () => {
  it('pregunta si ya es cliente y guarda la consulta', async () => {
    await expect(send('hola, ¿cuándo vence mi seguro?')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(lastText()).toBe(customerStatusQuestion)
    const conversation = await openConversation()
    expect(conversation.messages.map((message) => [message.origin, message.text]))
      .toEqual([['cliente', 'hola, ¿cuándo vence mi seguro?'], ['asistente', customerStatusQuestion]])
    expect(ai.classified).toEqual([])
  })

  it('una respuesta ajena vuelve a preguntar', async () => {
    await send('Buenas')
    await expect(send('¿a qué hora atienden?')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REASKED' })
    expect(lastText()).toBe(customerStatusRetryQuestion)
  })

  it('una falla de la clasificación deriva sin dar por identificado al cliente', async () => {
    ai.customerStatusError = new Error('timeout')
    await send('Hola')
    await expect(send('Sí')).resolves.toMatchObject({
      status: 'HANDOFF_SENT',
      reason: 'falla del proveedor al identificar el tipo de cliente',
    })
    expect(lastText()).toBe(handoffMessage)
    expect((await openConversation()).customerId).toBeNull()
  })

  it('el DNI se tapa antes de mandar la respuesta a la clasificación', async () => {
    ai.customerStatuses.set('Sí, mi DNI es [DNI]', 'EXISTING_CUSTOMER')
    await send('Hola')
    await send('Sí, mi DNI es 30.111.222')
    expect(ai.customerStatusClassified).toEqual(['Sí, mi DNI es [DNI]'])
    expect(lastText()).toBe(existingCustomerDniRequest)
  })
})

describe('DNI no reconocido (RF-ATE-03)', () => {
  async function unrecognized(times: number) {
    ai.customerStatuses.set('ya soy cliente', 'EXISTING_CUSTOMER')
    const results = []
    for (let attempt = 0; attempt < times; attempt++) {
      await send('ya soy cliente')
      results.push(await send(`3011122${attempt}`))
    }
    return results
  }

  it('vuelve a preguntar si ya es cliente; con 3 reintentos deriva al cuarto DNI no reconocido', async () => {
    await send('Hola')
    const results = await unrecognized(4)
    expect(results.slice(0, 3).map((result) => result.status)).toEqual([
      'CUSTOMER_STATUS_REQUESTED',
      'CUSTOMER_STATUS_REQUESTED',
      'CUSTOMER_STATUS_REQUESTED',
    ])
    expect(results[3]).toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI no reconocido' })
    expect(lastText()).toBe(handoffMessage)
  })

  it('con el parámetro en 2, deriva al tercero', async () => {
    useStore({ maxDniRetries: 2, inactivityMinutes: 30 })
    await send('Hola')
    const results = await unrecognized(3)
    expect(results[1]).toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(results[2]).toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI no reconocido' })
  })

  it('la consulta guardada sobrevive a un DNI no reconocido', async () => {
    link(phone, ana, bruno)
    await send('¿en qué estado está mi póliza?')
    await expect(send('30111222')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    ai.customerStatuses.set('Sí, ya soy cliente', 'EXISTING_CUSTOMER')
    await expect(send('Sí, ya soy cliente')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText()).toBe(repeatedDniRequest)
    ai.intents.set('¿en qué estado está mi póliza?', 'estado de póliza')
    await expect(send(bruno.dni)).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'estado de póliza' })
  })
})

describe('cambio de teléfono (RF-CAR-05)', () => {
  async function requestFromUnlinked(query = '¿en qué estado está mi póliza?') {
    ai.customerStatuses.set('ya soy cliente', 'EXISTING_CUSTOMER')
    ai.intents.set(query, 'estado de póliza')
    await send(query)
    await send('ya soy cliente')
    return send(ana.dni)
  }

  it('desde un número no vinculado queda la solicitud en un caso propio, sigue atendiendo y no vincula el número', async () => {
    await expect(requestFromUnlinked()).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING', answer: 'ANSWER_SENT' })
    expect(whatsapp.textsTo(phone).slice(-2)[0]).toBe(phoneChangePendingMessage)
    expect(lastText()).toContain('POL-90001 (auto): activa.')
    expect(await customers.linkedCustomerIds(phone)).toEqual([])

    const conversation = await openConversation()
    expect(conversation).toMatchObject({ customerId: ana.id, suspended: false })
    const requestCase = conversation.cases.find((item) => item.type === 'cambio de teléfono')
    expect(requestCase).toMatchObject({ handedOff: false, hasPending: true })
    expect(store.snapshot().phoneChanges).toMatchObject([{ customerId: ana.id, phone, status: 'pendiente', caseId: requestCase?.id }])
    const queryCase = conversation.cases.find((item) => item.type === 'estado de póliza')
    expect(conversation.messages.filter((message) => message.caseId === requestCase?.id).map((message) => message.text))
      .toEqual([ana.dni, phoneChangePendingMessage])
    expect(conversation.messages.find((message) => message.text.includes('POL-90001'))?.caseId).toBe(queryCase?.id)

    ai.intents.set('gracias', 'saludo')
    await expect(send('gracias')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'saludo' })
  })

  it('sin consulta guardada manda el aviso y la bienvenida', async () => {
    ai.customerStatuses.set('sí', 'EXISTING_CUSTOMER')
    await send('123')
    await send('sí')
    await expect(send(ana.dni)).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING', answer: 'WELCOME_SENT' })
    expect(whatsapp.textsTo(phone).slice(-2)).toEqual([phoneChangePendingMessage, 'Gracias, Ana. ¿En qué lo puedo ayudar?'])
  })

  it('si ya hay una solicitud pendiente, no se crea otra', async () => {
    await requestFromUnlinked()
    later(31)
    await expect(requestFromUnlinked('¿cuál es el estado?')).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING' })
    expect(lastText()).toContain('POL-90001')
    expect(store.snapshot().phoneChanges).toHaveLength(1)
  })

  it('el pedido desde un número vinculado pide escribir desde el nuevo, sin silenciar', async () => {
    link(phone, ana)
    ai.intents.set('cambié de número', 'cambio de teléfono')
    await expect(send('cambié de número')).resolves.toMatchObject({ status: 'NEW_PHONE_REQUESTED' })
    expect(lastText()).toBe(useNewPhoneRequest)
    expect(ai.rewritten).toEqual([])
    expect((await openConversation()).suspended).toBe(false)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
  })
})

describe('cliente nuevo (RF-ATE-05)', () => {
  async function upToPhoto(dni = '99.000.010') {
    ai.customerStatuses.set('Soy nuevo cliente', 'NEW_CUSTOMER')
    await send('hola')
    await expect(send('Soy nuevo cliente')).resolves.toMatchObject({ status: 'NAME_REQUESTED' })
    expect(lastText()).toBe(newCustomerNameRequest)
    await expect(send('Laura Inventada')).resolves.toMatchObject({ status: 'NEW_CUSTOMER_DNI_REQUESTED' })
    return send(dni)
  }

  it('con nombre, DNI y foto queda un prospecto pendiente en el caso derivado, sin crear un cliente ni guardar la imagen', async () => {
    await expect(upToPhoto()).resolves.toMatchObject({ status: 'PHOTO_REQUESTED' })
    expect(lastText()).toBe(newCustomerPhotoRequest)
    await expect(sendPhoto()).resolves.toMatchObject({ status: 'PROSPECT_HANDED_OFF' })
    expect(lastText()).toBe(prospectHandoffMessage)

    const conversation = await openConversation()
    expect(conversation.suspended).toBe(true)
    const state = store.snapshot()
    const derived = state.cases.find((item) => item.handedOffAt !== null)
    expect(derived?.handoffReason).toBe('cliente nuevo')
    expect(state.prospects).toEqual([{ id: expect.any(Number), caseId: derived?.id, name: 'Laura Inventada', dni: '99000010', status: 'pendiente' }])
    expect(conversation.messages.some((message) => message.text.includes('foto de su DNI'))).toBe(true)
    expect(await customers.findByDni('99000010')).toBeNull()
    expect(ai.customerStatusClassified).toEqual(['Soy nuevo cliente'])
  })

  it('un texto en lugar de la foto vuelve a pedirla y no registra el prospecto', async () => {
    await upToPhoto()
    await expect(send('No tengo la foto ahora')).resolves.toMatchObject({ status: 'PHOTO_REQUESTED' })
    expect(lastText()).toBe(newCustomerPhotoRetryRequest)
    expect(store.snapshot().prospects).toEqual([])
  })

  it('un mensaje sin DNI cuando se espera el DNI vuelve a pedirlo', async () => {
    ai.customerStatuses.set('Soy nuevo', 'NEW_CUSTOMER')
    await send('hola')
    await send('Soy nuevo')
    await send('Laura Inventada')
    await expect(send('no me lo acuerdo')).resolves.toMatchObject({ status: 'NEW_CUSTOMER_DNI_REQUESTED' })
  })

  it('el DNI de un cliente sigue como cliente existente, sin prospecto', async () => {
    await expect(upToPhoto(ana.dni)).resolves.toMatchObject({ status: 'PHONE_CHANGE_PENDING' })
    expect(store.snapshot().phoneChanges).toHaveLength(1)
    expect(store.snapshot().prospects).toEqual([])
  })

  it('desde un número vinculado a otros clientes, el DNI de un cliente no vinculado deriva', async () => {
    link(phone, ana, bruno)
    await send('hola')
    await send('30111222')
    ai.customerStatuses.set('soy nuevo', 'NEW_CUSTOMER')
    await send('soy nuevo')
    await send('Carla')
    await expect(send(carla.dni)).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'DNI de otra persona' })
  })

  it('en una conversación posterior, el mismo DNI sigue sin reconocerse', async () => {
    await upToPhoto()
    await sendPhoto()
    const prospectCase = store.snapshot().cases.find((item) => item.handedOffAt !== null)
    later(5)
    store.closeCase(prospectCase?.id ?? 0, now)
    later(40)
    ai.customerStatuses.set('ya soy cliente', 'EXISTING_CUSTOMER')
    await expect(send('hola')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    await send('ya soy cliente')
    await expect(send('99000010')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(store.snapshot().conversations).toHaveLength(2)
  })
})

describe('silencio (RF-DER-03)', () => {
  it.each<[string, Intent]>([
    ['tuve un choque', 'siniestro'],
    ['quiero dar de baja la póliza', 'baja'],
  ])('después de «%s» no contesta, no llama al proveedor y guarda el mensaje en el caso derivado', async (text, intent) => {
    await identifyShared()
    ai.intents.set(text, intent)
    await send(text)
    const sentBefore = whatsapp.sent.length
    ai.classified.length = 0

    await expect(send('¿hola? ¿cuándo vence?')).resolves.toMatchObject({ status: 'SILENCED' })
    await expect(sendPhoto()).resolves.toMatchObject({ status: 'SILENCED' })
    expect(whatsapp.sent.length).toBe(sentBefore)
    expect(ai.classified).toEqual([])

    const conversation = await openConversation()
    const derived = conversation.cases.find((item) => item.handedOff)
    const silenced = conversation.messages.slice(-2)
    expect(silenced.map((message) => message.caseId)).toEqual([derived?.id, derived?.id])
    expect(silenced[0]?.text).toBe('¿hola? ¿cuándo vence?')
    expect(silenced[1]?.text).toContain('imagen')
    expect(store.snapshot().replies.filter((reply) => silenced.some((message) => message.id === reply.queryMessageId))).toEqual([])

    restart()
    await expect(send('¿hay alguien?')).resolves.toMatchObject({ status: 'SILENCED' })
    expect(whatsapp.sent.length).toBe(sentBefore)
  })

  it('el aviso de mandar a aprobar no se redacta', async () => {
    await identifyShared()
    ai.intents.set('quiero agregar un conductor', 'modificación')
    await expect(send('quiero agregar un conductor')).resolves.toMatchObject({ status: 'APPROVAL_NOTICE_SENT' })
    expect(lastText()).toBe(approvalNotice)
    expect(ai.rewritten).toEqual([])
    const derived = (await openConversation()).cases.find((item) => item.handedOff)
    expect(store.snapshot().cases.find((item) => item.id === derived?.id)?.handoffReason).toBe('pedido para aprobar: modificación')
  })

  it('cerrado el caso dentro del plazo, sigue en la misma conversación sin volver a identificar', async () => {
    await identifyShared()
    ai.intents.set('tuve un choque', 'siniestro')
    await send('tuve un choque')
    const conversation = await openConversation()
    later(5)
    store.closeCase(conversation.cases.find((item) => item.handedOff)?.id ?? 0, now)
    later(5)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    expect((await openConversation()).id).toBe(conversation.id)
  })

  it('cerrado el caso después del plazo, abre una conversación nueva y la anterior termina a la hora del cierre', async () => {
    await identifyShared()
    ai.intents.set('tuve un choque', 'siniestro')
    await send('tuve un choque')
    const previous = await openConversation()
    later(60)
    const closedAt = now
    store.closeCase(previous.cases.find((item) => item.handedOff)?.id ?? 0, closedAt)
    later(10)
    await expect(send('hola')).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect((await openConversation()).id).not.toBe(previous.id)
    expect(store.snapshot().conversations.find((item) => item.id === previous.id)?.endedAt).toEqual(closedAt)
  })

  it('después de derivar, otro número se atiende normal', async () => {
    await identifyShared()
    ai.intents.set('tuve un choque', 'siniestro')
    await send('tuve un choque')
    link(otherPhone, ana, bruno)
    await expect(send('hola', otherPhone)).resolves.toMatchObject({ status: 'DNI_REQUESTED' })
    expect(lastText(otherPhone)).toBe(firstDniRequest)
  })

  it('una conversación migrada abierta con un caso derivado no se contesta', async () => {
    const openedAt = new Date('2026-09-01T12:00:00Z')
    store.seedConversation(
      { phone, customerId: null, suspended: true, startedAt: openedAt, endedAt: null },
      [{ type: 'siniestro', openedAt, handedOffAt: openedAt, handoffReason: null, closedAt: null, unattendedAlert: false }],
    )
    await expect(send('¿novedades?')).resolves.toMatchObject({ status: 'SILENCED' })
    expect(whatsapp.sent).toEqual([])
  })
})

describe('reinicio del backend', () => {
  it('termina la conversación que no estaba en silencio y empieza una nueva', async () => {
    await send('hola')
    const previous = await openConversation()
    later(2)
    restart()
    await expect(send('hola de nuevo')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    const current = await openConversation()
    expect(current.id).not.toBe(previous.id)
    const ended = store.snapshot().conversations.find((item) => item.id === previous.id)
    expect(ended?.endedAt).toEqual(start)
    expect(casesOf(previous.id).every((item) => item.closedAt !== null)).toBe(true)
  })
})

describe('inactividad', () => {
  it('a los 31 minutos, la identificación empieza en una conversación nueva y se cierran los casos sin nada pendiente', async () => {
    ai.customerStatuses.set('ya soy cliente', 'EXISTING_CUSTOMER')
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await send('¿cuándo vence?')
    await send('ya soy cliente')
    await send(ana.dni)
    const previous = await openConversation()
    const lastMessageAt = now
    later(31)
    await expect(send('hola')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect((await openConversation()).id).not.toBe(previous.id)

    const state = store.snapshot()
    expect(state.conversations.find((item) => item.id === previous.id)?.endedAt)
      .toEqual(new Date(lastMessageAt.getTime() + 30 * 60_000))
    const previousCases = casesOf(previous.id)
    expect(previousCases.find((item) => item.type === 'vencimiento')?.closedAt).not.toBeNull()
    expect(previousCases.find((item) => item.type === 'cambio de teléfono')?.closedAt).toBeNull()
  })

  it('a los 29 minutos sigue en la misma conversación', async () => {
    await identifyShared()
    const conversation = await openConversation()
    later(29)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    expect((await openConversation()).id).toBe(conversation.id)
  })

  it('una conversación con un caso derivado sin cerrar no se cierra', async () => {
    await identifyShared()
    ai.intents.set('tuve un choque', 'siniestro')
    await send('tuve un choque')
    const conversation = await openConversation()
    later(600)
    await expect(send('¿hola?')).resolves.toMatchObject({ status: 'SILENCED' })
    expect((await openConversation()).id).toBe(conversation.id)
  })
})

describe('casos por intención', () => {
  it('la consulta guardada, la identificación y la respuesta quedan en un caso con el tipo de la consulta', async () => {
    link(phone, ana, bruno)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await send('¿cuándo vence?')
    await send(ana.dni)
    const conversation = await openConversation()
    expect(conversation.cases).toEqual([expect.objectContaining({ type: 'vencimiento', handedOff: false })])
    expect(conversation.messages).toHaveLength(4)
    const query = conversation.messages[0]
    const answer = conversation.messages[3]
    const reply = store.snapshot().replies.find((item) => item.sentMessageId === answer?.id)
    expect(reply?.queryMessageId).toBe(query?.id)
  })

  it('una intención distinta abre un caso nuevo', async () => {
    link(phone, ana)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    ai.intents.set('gracias', 'saludo')
    await send('¿cuándo vence?')
    await send('¿cuándo vence?')
    await send('gracias')
    expect((await openConversation()).cases.map((item) => item.type)).toEqual(['vencimiento', 'saludo'])
  })

  it('«no sé» deriva en un caso sin tipo', async () => {
    await identifyShared()
    await expect(send('una cosa rara')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'intención: no sé' })
    const derived = (await openConversation()).cases.find((item) => item.handedOff)
    expect(derived?.type).toBeNull()
  })

  it('«no es de seguros» queda en el caso actual sin respuesta', async () => {
    link(phone, ana)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    ai.intents.set('¿me vendés zapatillas?', 'no es de seguros')
    await send('¿cuándo vence?')
    const sentBefore = whatsapp.sent.length
    await expect(send('¿me vendés zapatillas?')).resolves.toMatchObject({ status: 'IGNORED_NOT_INSURANCE' })
    expect(whatsapp.sent.length).toBe(sentBefore)
    const conversation = await openConversation()
    expect(conversation.cases.map((item) => item.type)).toEqual(['vencimiento'])
    expect(conversation.messages.at(-1)?.text).toBe('¿me vendés zapatillas?')
  })

  it('una consulta guardada que no es de seguros recibe la bienvenida', async () => {
    link(phone, ana, bruno)
    ai.intents.set('¿me vendés zapatillas?', 'no es de seguros')
    await send('¿me vendés zapatillas?')
    await expect(send(ana.dni)).resolves.toMatchObject({ status: 'WELCOME_SENT' })
    expect((await openConversation()).cases.map((item) => item.type)).toEqual([null])
  })

  it('una falla del proveedor al decidir deriva en un caso sin tipo', async () => {
    await identifyShared()
    ai.classifyError = new Error('HTTP 429')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'falla del proveedor al decidir' })
    expect(lastText()).toBe(handoffMessage)
    expect((await openConversation()).cases.find((item) => item.handedOff)?.type).toBeNull()
  })
})

describe('respuestas (RF-ATE-02, RF-ATE-04)', () => {
  it('cada mensaje enviado tiene su respuesta enviada', async () => {
    link(phone, ana, bruno)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await send('¿cuándo vence?')
    await send(ana.dni)
    const state = store.snapshot()
    const sentMessages = state.messages.filter((message) => message.origin === 'asistente')
    expect(sentMessages).toHaveLength(2)
    expect(sentMessages.every((message) => state.replies.some((reply) => reply.sentMessageId === message.id))).toBe(true)
  })

  it('una redacción que cambia una fecha queda como respuesta no enviada y se deriva sin texto del cliente', async () => {
    await identifyShared()
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    ai.rewriteResult = (input) => input.template.replace('15/03/2027', '15/03/2028')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT' })
    expect(lastText()).toBe(handoffMessage)
    expect(whatsapp.textsTo(phone).some((text) => text.includes('2028'))).toBe(false)

    const state = store.snapshot()
    const rejected = state.replies.find((reply) => reply.sentMessageId === null)
    expect(rejected?.text).toContain('15/03/2028')
    const derived = state.cases.find((item) => item.handedOffAt !== null)
    expect(derived?.handoffReason).toBe('redacción rechazada: datos distintos de la plantilla')
  })

  it('se envía una redacción que conserva los datos', async () => {
    await identifyShared()
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    ai.rewriteResult = () =>
      'Ana, le cuento: su póliza POL-90001 de auto vence el 15/03/2027 y la POL-90002 de hogar venció el 01/09/2026.'
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })
    expect(lastText()).toContain('le cuento')
  })

  it('si la redacción falla se deriva', async () => {
    await identifyShared()
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    ai.rewriteResult = new Error('timeout')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'falla de la redacción' })
  })

  it('el saludo se responde con cortesía redactada, sin derivar', async () => {
    await identifyShared()
    ai.intents.set('gracias!', 'saludo')
    ai.rewriteResult = () => 'Hola Ana, gracias por escribirnos. ¿En qué la puedo ayudar?'
    await expect(send('gracias!')).resolves.toMatchObject({ status: 'ANSWER_SENT', intent: 'saludo' })
    expect(lastText()).toBe('Hola Ana, gracias por escribirnos. ¿En qué la puedo ayudar?')
  })

  it('un cliente sin pólizas que pregunta el vencimiento se deriva sin redactar', async () => {
    link(phone, carla)
    ai.intents.set('¿cuándo vence?', 'vencimiento')
    await expect(send('¿cuándo vence?')).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: 'cliente sin pólizas' })
    expect(ai.rewritten).toEqual([])
  })

  it.each<[string, Intent]>([
    ['tuve un choque', 'siniestro'],
    ['¿cuánto sale asegurar el auto?', 'cotización'],
  ])('«%s» deriva sin redactar', async (text, intent) => {
    await identifyShared()
    ai.intents.set(text, intent)
    ai.rewriteResult = () => 'Texto válido que no se debería usar.'
    await expect(send(text)).resolves.toMatchObject({ status: 'HANDOFF_SENT', reason: `intención: ${intent}` })
    expect(lastText()).toBe(handoffMessage)
    expect(ai.rewritten).toEqual([])
  })
})

describe('fallas', () => {
  it('si WhatsApp falla, no queda nada guardado y el reintento hace lo mismo que la primera vez', async () => {
    whatsapp.failNext = true
    await expect(send('hola', phone, 'msg-hola')).rejects.toThrow('WAHA')
    expect(store.snapshot().conversations).toEqual([])
    await expect(send('hola', phone, 'msg-hola')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
    expect(whatsapp.textsTo(phone)).toEqual([customerStatusQuestion])
  })

  it('si WhatsApp falla al derivar, la etapa no cambia y el reintento vuelve a derivar', async () => {
    await identifyShared()
    ai.intents.set('tuve un choque', 'siniestro')
    const before = store.snapshot()
    whatsapp.failNext = true
    await expect(send('tuve un choque', phone, 'msg-choque')).rejects.toThrow('WAHA')
    expect(store.snapshot()).toEqual(before)
    await expect(send('tuve un choque', phone, 'msg-choque')).resolves.toMatchObject({ status: 'HANDOFF_SENT' })
    expect(lastText()).toBe(handoffMessage)
  })

  it('si el almacén falla al leer, lanza, no envía nada y el mensaje no queda marcado', async () => {
    store.failNextRead = true
    await expect(send('hola', phone, 'msg-lectura')).rejects.toThrow()
    expect(whatsapp.sent).toEqual([])
    await expect(send('hola', phone, 'msg-lectura')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
  })

  it('si el almacén falla al guardar, lanza, no envía nada y el mensaje no queda marcado', async () => {
    store.failNextSave = true
    await expect(send('hola', phone, 'msg-guardado')).rejects.toThrow()
    expect(whatsapp.sent).toEqual([])
    await expect(send('hola', phone, 'msg-guardado')).resolves.toMatchObject({ status: 'CUSTOMER_STATUS_REQUESTED' })
  })

  it('el mismo mensaje dos veces envía una sola respuesta', async () => {
    await send('hola', phone, 'msg-repetido')
    await expect(send('hola', phone, 'msg-repetido')).resolves.toMatchObject({ status: 'DUPLICATE_IGNORED' })
    expect(whatsapp.textsTo(phone)).toEqual([customerStatusQuestion])
    expect(store.snapshot().messages.filter((message) => message.origin === 'cliente')).toHaveLength(1)
  })

  it('una imagen fuera de la etapa de la foto no se procesa ni se guarda', async () => {
    await expect(sendPhoto()).resolves.toMatchObject({ status: 'IGNORED_MEDIA' })
    expect(store.snapshot().conversations).toEqual([])
    expect(whatsapp.sent).toEqual([])
  })
})

describe('solo datos propios (RF-ATE-02)', () => {
  it('la plantilla tiene solo las pólizas del identificado y ningún pedido al proveedor lleva el DNI', async () => {
    link(phone, ana, bruno)
    ai.customerStatuses.set('sí, soy cliente, DNI [DNI]', 'EXISTING_CUSTOMER')
    ai.intents.set('hola', 'saludo')
    await send('hola')
    await send('30111222')
    await send('sí, soy cliente, DNI 99-000-001')
    await send('99000001')
    ai.intents.set('mi DNI es [DNI], ¿cuándo vence?', 'vencimiento')
    await expect(send('mi DNI es 99-000-001, ¿cuándo vence?')).resolves.toMatchObject({ status: 'ANSWER_SENT' })

    const template = ai.rewritten.at(-1)?.template ?? ''
    expect(template).toContain('POL-90001')
    expect(template).toContain('POL-90002')
    expect(template).not.toContain('POL-90003')
    const outgoing = JSON.stringify([ai.customerStatusClassified, ai.classified, ai.rewritten])
    expect(outgoing).not.toContain('99000001')
    expect(outgoing).not.toContain('99-000-001')
    expect(outgoing).not.toContain('30111222')
  })
})
