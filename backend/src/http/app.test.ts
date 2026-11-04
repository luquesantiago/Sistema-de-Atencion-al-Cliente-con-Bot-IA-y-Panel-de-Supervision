import { once } from 'node:events'
import bcrypt from 'bcryptjs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { AiClient, CustomerStatus, DataChangeExtraction, RewriteInput } from '../domain/ai-client.js'
import type { CustomerPolicy, CustomerRepository } from '../domain/customer.js'
import type {
  Catalogs,
  CreateCustomerInput,
  CreatePolicyInput,
  CustomerEditRepository,
  LinkPhoneInput,
  ReplaceCoveragesInput,
  UnlinkPhoneInput,
  UpdateCustomerInput,
  UpdatePolicyInput,
} from '../domain/customer-edits.js'
import type { PlannedInstallment } from '../domain/installments.js'
import {
  RequestManagementError,
  type DataChangeDecisionInput,
  type DecisionNotification,
  type PageRequest,
  type PendingDataChange,
  type PendingPhoneChange,
  type PendingProspect,
  type DecisionActor,
  type PhoneChangeDecisionInput,
  type ProspectDecisionInput,
  type RequestManagementRepository,
} from '../domain/request-management.js'
import type { WhatsAppClient, WhatsAppImage } from '../domain/whatsapp-client.js'
import { ManageCustomers } from '../application/manage-customers.js'
import { ManageCustomerEdits } from '../application/manage-customer-edits.js'
import { ManageAgencySettings } from '../application/manage-agency-settings.js'
import { ManageInbox } from '../application/manage-inbox.js'
import { ManageSession } from '../application/manage-session.js'
import { sessionDurationMs, signSession, type PanelUserRepository, type StoredPanelUser } from '../domain/session.js'
import {
  agencyTextFields,
  settingDescription,
  type AgencySettings,
  type AgencySettingsRepository,
  type StoredAgencySettings,
} from '../domain/agency-settings.js'
import { decideClose, type CloseInput, type PanelActor } from '../domain/case-actions.js'
import type {
  CloseOutcome,
  InboxActionState,
  InboxConversation,
  InboxEntry,
  InboxImageRef,
  InboxPage,
  InboxRepository,
} from '../domain/inbox.js'
import { ManageRequests } from '../application/manage-requests.js'
import { ProcessIncomingMessage } from '../application/process-incoming-message.js'
import { InMemoryAgencyInfoSource } from '../infrastructure/in-memory-agency-info.js'
import { InMemoryConversationStore } from '../infrastructure/in-memory-conversation-store.js'
import { InMemoryCustomerRepository } from '../infrastructure/in-memory-customer-repository.js'
import { createApp, requireRole, type PanelSessionOptions } from './app.js'

class FakeAi implements AiClient {
  public async classifyCustomerStatus(_reply: string): Promise<CustomerStatus> {
    return 'UNRELATED'
  }
  public async classifyIntent(_text: string) {
    return { intent: 'otra consulta' as const, urgency: null }
  }
  public async extractDataChange(_text: string): Promise<DataChangeExtraction> {
    return { field: null, value: null }
  }
  public async isThreat(_text: string): Promise<boolean> {
    return false
  }
  public async rewrite(_input: RewriteInput): Promise<string> {
    return ''
  }
}

// Bandeja en memoria: la página es la que pide la prueba, ya ordenada. Datos ficticios.
class FakeInbox implements InboxRepository {
  public customerFilters: Array<number | undefined> = []

  public constructor(public entries: InboxEntry[] = [], public conversation: InboxConversation | null = null) {}

  public async listPage(page: PageRequest, customerId?: number): Promise<InboxPage> {
    this.customerFilters.push(customerId)
    return { entries: this.entries.slice(page.offset, page.offset + page.limit), total: this.entries.length }
  }

  public async findConversation(caseId: number): Promise<InboxConversation | null> {
    return this.conversation?.entry.caseId === caseId ? this.conversation : null
  }

  public state: InboxActionState | null = null
  public image: InboxImageRef | null = null

  public async findActionState(caseId: number): Promise<InboxActionState | null> {
    return this.state?.caseId === caseId ? this.state : null
  }

  public async take(_caseId: number, actor: PanelActor): Promise<boolean> {
    if (this.state) this.state = { ...this.state, assigneeId: actor.userId }
    return this.state !== null
  }

  public async release(_caseId: number, expectedAssigneeId: number): Promise<boolean> {
    if (!this.state || this.state.assigneeId !== expectedAssigneeId) return false
    this.state = { ...this.state, assigneeId: null }
    return true
  }

  public async close(caseId: number, actor: PanelActor, input: CloseInput, at: Date): Promise<CloseOutcome> {
    if (this.state?.caseId !== caseId) return { ok: false, error: 'not-in-inbox' }
    const plan = decideClose(this.state, actor, input)
    return plan.ok ? { ok: true, closedAt: at } : { ok: false, error: plan.error }
  }

  public async recordOperatorReply(): Promise<{ messageId: number }> {
    return { messageId: 77 }
  }

  public async findImage(): Promise<InboxImageRef | null> {
    return this.image
  }

  public readonly blocked: Array<{ caseId: number; blocked: boolean }> = []

  public async setPhoneBlocked(caseId: number, blocked: boolean): Promise<{ phone: string } | null> {
    this.blocked.push({ caseId, blocked })
    return this.state?.caseId === caseId ? { phone: this.state.phone } : null
  }
}

// Configuración de la agencia en memoria, con los datos de ejemplo de la migración. Cuenta las
// lecturas para probar que un pedido rechazado no lee nada.
class FakeAgencySettings implements AgencySettingsRepository {
  public reads = 0
  public readonly saved: AgencySettings[] = []
  public state: StoredAgencySettings = {
    texts: {
      address: { value: 'Ficticia 123', description: 'Dato de ejemplo, la agencia no lo informó: dirección' },
      phone: { value: '11 7816-8015', description: 'Dato de ejemplo, la agencia no lo informó: teléfono' },
      assistancePhone: { value: null, description: 'Sin informar por la agencia: teléfono de grúa' },
      email: { value: null, description: 'Sin informar por la agencia: email' },
      web: { value: null, description: 'Sin informar por la agencia: web' },
      paymentMethods: { value: null, description: 'Sin informar por la agencia: medios de pago' },
    },
    hours: [1, 2, 3, 4, 5].map((day) => ({ day, opens: '09:00', closes: '18:00' })),
    ramos: [{ id: 1, name: 'auto', active: true }, { id: 2, name: 'moto', active: true }],
    plans: [{ id: 1, name: 'terceros', active: true }, { id: 2, name: 'todo riesgo', active: true }],
  }

  public async readSettings(): Promise<StoredAgencySettings> {
    this.reads += 1
    return structuredClone(this.state)
  }

  public async saveSettings(settings: AgencySettings): Promise<void> {
    this.saved.push(settings)
    const texts = { ...this.state.texts }
    for (const field of agencyTextFields) {
      texts[field] = { value: settings[field], description: settingDescription(field, this.state.texts[field], settings[field]) }
    }
    this.state = {
      texts,
      hours: settings.hours,
      ramos: this.state.ramos.map((item) => ({ ...item, active: settings.activeRamoIds.includes(item.id) })),
      plans: this.state.plans.map((item) => ({ ...item, active: settings.activePlanIds.includes(item.id) })),
    }
  }
}

// Usuarios ficticios del panel: el operador 10 (el de las pruebas de siempre), el
// administrador 11 y un usuario dado de baja. La clave de todos es «clave-correcta».
const sessionSecret = 'secreto-de-prueba'
let passwordHash = ''

beforeAll(async () => {
  // Costo bajo para que las pruebas no tarden: el de la base es 10.
  passwordHash = await bcrypt.hash('clave-correcta', 4)
})

class FakePanelUsers implements PanelUserRepository {
  public readonly users: StoredPanelUser[] = [
    { userId: 10, username: 'graciela', name: 'Graciela', lastName: 'Prueba', role: 'operador', active: true },
    { userId: 11, username: 'roberto', name: 'Roberto', lastName: 'Prueba', role: 'administrador', active: true },
    { userId: 12, username: 'baja', name: 'Usuario', lastName: 'De baja', role: 'operador', active: false },
  ]

  public async findByUsername(username: string) {
    const user = this.users.find((candidate) => candidate.username === username)
    return user ? { ...user, passwordHash } : null
  }

  public async findById(userId: number) {
    return this.users.find((candidate) => candidate.userId === userId) ?? null
  }
}

function panelSession(users: PanelUserRepository = new FakePanelUsers()): PanelSessionOptions {
  return { manageSession: new ManageSession(users, sessionSecret), secureCookies: false }
}

// Cookie de una sesión válida, firmada como la firma el backend.
function sessionCookie(userId: number, secret = sessionSecret): string {
  return `sesion_panel=${signSession({ userId, exp: Date.now() + sessionDurationMs }, secret)}`
}

// Las pruebas de los endpoints llaman con la sesión del operador 10; las de la sesión usan fetch.
function panelFetch(url: string, init: RequestInit = {}, cookie = sessionCookie(10)) {
  const headers = new Headers(init.headers)
  headers.set('Cookie', cookie)
  return fetch(url, { ...init, headers })
}

class FakeWhatsApp implements WhatsAppClient {
  public readonly sent: Array<{ to: string; text: string }> = []
  public fail = false

  public async sendText(to: string, text: string): Promise<void> {
    if (this.fail) throw new Error('WAHA unavailable')
    this.sent.push({ to, text })
  }

  public image: WhatsAppImage | null = null

  public async downloadImage(): Promise<WhatsAppImage | null> {
    return this.image
  }
}

class FakeRequestRepository implements RequestManagementRepository {
  public readonly prospectPage: PageRequest[] = []
  public readonly phonePage: PageRequest[] = []
  public readonly dataChangePage: PageRequest[] = []
  public readonly prospectDecisions: ProspectDecisionInput[] = []
  public readonly phoneDecisions: PhoneChangeDecisionInput[] = []
  public readonly dataChangeDecisions: DataChangeDecisionInput[] = []
  public readonly actors: DecisionActor[] = []
  public prospects: PendingProspect[] = []
  public phoneChanges: PendingPhoneChange[] = []
  public dataChanges: PendingDataChange[] = []

  public async listPendingProspects(page: PageRequest): Promise<PendingProspect[]> {
    this.prospectPage.push(page)
    return this.prospects
  }

  public async listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]> {
    this.phonePage.push(page)
    return this.phoneChanges
  }

  public async listPendingDataChanges(page: PageRequest): Promise<PendingDataChange[]> {
    this.dataChangePage.push(page)
    return this.dataChanges
  }

  public async decideProspect(input: ProspectDecisionInput, actor: DecisionActor) {
    this.prospectDecisions.push(input)
    this.actors.push(actor)
    return {
      id: input.id,
      decision: input.decision,
      casoId: 31,
      phone: '5491100000008',
      ...(input.decision === 'aprobar' ? { clienteId: 44 } : {}),
    }
  }

  // Estado del prospecto para el reintento del aviso: solo el confirmado se avisa.
  public prospectState: 'confirmado' | 'pendiente' = 'confirmado'
  public readonly recordedProspectNotifications: Array<{ id: number; text: string }> = []

  public async getProspectNotification(id: number) {
    if (this.prospectState !== 'confirmado') {
      throw new RequestManagementError(409, 'CONFLICT', 'El alta no está aprobada: no hay un aviso de aprobación para enviar.')
    }
    return { id, phone: '5491100000008' }
  }

  public async recordProspectNotification(id: number, text: string, _sentAt: Date): Promise<void> {
    this.recordedProspectNotifications.push({ id, text })
  }

  public async decidePhoneChange(input: PhoneChangeDecisionInput, actor: DecisionActor) {
    this.phoneDecisions.push(input)
    this.actors.push(actor)
    return { id: input.id, decision: input.decision, phone: '5491100000000' }
  }

  public async decideDataChange(input: DataChangeDecisionInput, actor: DecisionActor) {
    this.dataChangeDecisions.push(input)
    this.actors.push(actor)
    return { id: input.id, decision: input.decision, phone: '5491100000000' }
  }

  public async getPhoneChangeNotification(id: number) {
    return { id, decision: 'aprobar' as const, phone: '5491100000000' }
  }

  public async getDataChangeNotification(id: number): Promise<DecisionNotification> {
    return { id, decision: 'aprobar' as const, phone: '5491100000000' }
  }

  public readonly recordedNotifications: Array<{ id: number; text: string }> = []

  public async recordPhoneChangeNotification(id: number, text: string, _sentAt: Date): Promise<void> {
    this.recordedNotifications.push({ id, text })
  }

  public async recordDataChangeNotification(id: number, text: string, _sentAt: Date): Promise<void> {
    this.recordedNotifications.push({ id, text })
  }
}

// Doble de prueba de las ediciones de cartera: registra cada entrada y
// devuelve el id del cliente que el caso de uso debe recargar.
class FakeCustomerEditRepository implements CustomerEditRepository {
  public readonly created: CreateCustomerInput[] = []
  public readonly updated: UpdateCustomerInput[] = []
  public readonly deactivated: number[] = []
  public readonly linked: LinkPhoneInput[] = []
  public readonly unlinked: UnlinkPhoneInput[] = []
  public readonly createdPolicies: CreatePolicyInput[] = []
  public readonly createdInstallments: PlannedInstallment[][] = []
  public readonly policyUpdates: UpdatePolicyInput[] = []
  public readonly coverageReplacements: ReplaceCoveragesInput[] = []
  // Devuelve el id 1 (Laura Gómez) para que la ficha se pueda recargar.
  public resultCustomerId = 1
  public conflict = false
  public catalogs: Catalogs = {
    ramoNames: ['auto', 'hogar'],
    policyStatusNames: ['activa', 'dada de baja'],
    currencies: [{ code: 'ARS', name: 'Peso argentino' }],
    companies: [{ id: 5, name: 'Seguros Castaño' }],
    plans: [{ id: 2, name: 'Básico' }],
  }

  public async createCustomer(input: CreateCustomerInput): Promise<number> {
    this.created.push(input)
    return this.resultCustomerId
  }

  public async updateCustomer(input: UpdateCustomerInput): Promise<void> {
    this.throwIfConflict()
    this.updated.push(input)
  }

  public async deactivateCustomer(id: number): Promise<void> {
    this.deactivated.push(id)
  }

  public async linkPhone(input: LinkPhoneInput): Promise<void> {
    this.linked.push(input)
  }

  public async unlinkPhone(input: UnlinkPhoneInput): Promise<void> {
    this.unlinked.push(input)
  }

  public async createPolicy(input: CreatePolicyInput, installments: PlannedInstallment[]): Promise<number> {
    this.throwIfConflict()
    // El repositorio real comprueba que el cliente exista y esté activo.
    if (input.customerId !== this.resultCustomerId) {
      throw new RequestManagementError(404, 'NOT_FOUND', 'No existe un cliente activo con ese identificador.')
    }
    this.createdPolicies.push(input)
    this.createdInstallments.push(installments)
    return this.resultCustomerId
  }

  public async updatePolicy(input: UpdatePolicyInput): Promise<number> {
    this.policyUpdates.push(input)
    return this.resultCustomerId
  }

  public async replaceCoverages(input: ReplaceCoveragesInput): Promise<number> {
    this.coverageReplacements.push(input)
    return this.resultCustomerId
  }

  public async listCatalogs(): Promise<Catalogs> {
    return this.catalogs
  }

  private throwIfConflict(): void {
    if (this.conflict) {
      throw new RequestManagementError(409, 'CONFLICT', 'Ya existe un registro con esos datos únicos.')
    }
  }
}

describe('endpoints de trámites', () => {
  let repository: FakeRequestRepository
  let whatsapp: FakeWhatsApp
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string

  beforeEach(async () => {
    repository = new FakeRequestRepository()
    whatsapp = new FakeWhatsApp()
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, assistancePhone: null, email: null, web: null, paymentMethods: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(repository, whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(new FakeInbox(), whatsapp),
      new ManageAgencySettings(new FakeAgencySettings()),
      panelSession(),
    )
    server = app.listen(0)
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.close()
    await once(server, 'close')
  })

  it('lista prospectos pendientes con paginación limitada', async () => {
    repository.prospects = [{
      id: 8,
      caseId: 20,
      name: 'Laura Díaz',
      dni: '30111222',
      phone: '5491100000000',
      registeredAt: '2026-10-07T12:00:00.000Z',
    }]

    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos?limit=10&offset=5`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: repository.prospects, limit: 10, offset: 5 })
    expect(repository.prospectPage).toEqual([{ limit: 10, offset: 5 }])
  })

  it('rechaza paginación inválida con un error consistente', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono?limit=1000`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('rechaza JSON mal formado como error de validación', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('aprueba un prospecto con nombre y apellido confirmados por el operador', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'aprobar',
        fundamento: 'Datos revisados con el cliente',
        nombre: 'Laura',
        apellido: 'Díaz',
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 8, decision: 'aprobar', casoId: 31, clienteId: 44, notificationSent: true })
    // El alta aprobada se avisa con el texto fijo y queda guardada en el caso (RF-ATE-05).
    expect(whatsapp.sent).toEqual([{
      to: '5491100000008',
      text: 'Su alta como cliente de Seguros Castaño fue confirmada. Desde ahora puede consultarnos por este WhatsApp sobre sus pólizas.',
    }])
    expect(repository.recordedProspectNotifications.map((item) => item.id)).toEqual([8])
    expect(repository.prospectDecisions).toEqual([{
      id: 8,
      decision: 'aprobar',
      fundamento: 'Datos revisados con el cliente',
      nombre: 'Laura',
      apellido: 'Díaz',
    }])
    expect(repository.actors).toEqual([{ userId: 10, username: 'graciela', name: 'Graciela', lastName: 'Prueba', role: 'operador' }])
  })

  it('la decisión queda a nombre del usuario de la sesión', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Identidad verificada' }),
    }, sessionCookie(11))
    expect(response.status).toBe(200)
    expect(repository.actors).toMatchObject([{ userId: 11, username: 'roberto' }])
  })

  it('el cuerpo no puede elegir quién decide', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', fundamento: 'Datos incompletos', usuario: 11 }),
    })
    expect(response.status).toBe(400)
    expect(repository.prospectDecisions).toEqual([])
  })

  it('al rechazar el alta devuelve el caso, para abrirlo en la bandeja', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', fundamento: 'La foto no coincide' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 8, decision: 'rechazar', casoId: 31 })
    // El rechazo no se avisa solo: lo explica el operador desde la bandeja.
    expect(whatsapp.sent).toEqual([])
  })

  it('si el aviso del alta falla, el alta queda registrada y se puede reintentar', async () => {
    whatsapp.fail = true
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Datos revisados', nombre: 'Laura', apellido: 'Díaz' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 8, clienteId: 44, notificationSent: false })
    expect(repository.prospectDecisions).toHaveLength(1)
    expect(repository.recordedProspectNotifications).toEqual([])

    const failedRetry = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/notificacion`, { method: 'POST' })
    await expect(failedRetry.json()).resolves.toMatchObject({ id: 8, notificationSent: false })

    whatsapp.fail = false
    const retry = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/notificacion`, { method: 'POST' })
    expect(retry.status).toBe(200)
    await expect(retry.json()).resolves.toEqual({ id: 8, decision: 'aprobar', notificationSent: true })
    expect(whatsapp.sent).toHaveLength(1)
    expect(repository.recordedProspectNotifications.map((item) => item.id)).toEqual([8])
    // El reintento no vuelve a aplicar la decisión.
    expect(repository.prospectDecisions).toHaveLength(1)
  })

  it('no reintenta el aviso de un alta que no está aprobada', async () => {
    repository.prospectState = 'pendiente'
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/notificacion`, { method: 'POST' })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
    expect(whatsapp.sent).toEqual([])
  })

  it('no permite que el navegador elija el actor o rol de la decisión', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'rechazar',
        fundamento: 'Datos inconsistentes',
        actor: 'admin',
        rol: 'administrador',
      }),
    })

    expect(response.status).toBe(400)
    expect(repository.prospectDecisions).toEqual([])
  })

  it('aprueba el cambio y avisa por WhatsApp; reporta explícitamente si falla el aviso', async () => {
    const request = () => panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'aprobar',
        fundamento: 'Identidad verificada',
        telefonosADesvincular: [3],
      }),
    })

    const response = await request()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 12, decision: 'aprobar', notificationSent: true })
    expect(repository.phoneDecisions[0]).toMatchObject({ id: 12, telefonosADesvincular: [3] })
    expect(whatsapp.sent).toHaveLength(1)

    whatsapp.fail = true
    const failedNotificationResponse = await request()
    await expect(failedNotificationResponse.json()).resolves.toMatchObject({
      id: 12,
      decision: 'aprobar',
      notificationSent: false,
      warning: expect.any(String),
    })

    whatsapp.fail = false
    const retryResponse = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/notificacion`, { method: 'POST' })
    await expect(retryResponse.json()).resolves.toEqual({
      id: 12,
      decision: 'aprobar',
      notificationSent: true,
    })
  })

  it('guarda el aviso de la decisión una vez cuando sale por WhatsApp', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', fundamento: 'No se pudo verificar', telefonosADesvincular: [] }),
    })
    await expect(response.json()).resolves.toMatchObject({ notificationSent: true })
    expect(repository.recordedNotifications).toEqual([{ id: 12, text: whatsapp.sent[0]?.text }])
  })

  it('con el envío fallido no guarda el aviso, y el reintento por /notificacion lo guarda', async () => {
    whatsapp.fail = true
    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Identidad verificada', telefonosADesvincular: [] }),
    })
    await expect(response.json()).resolves.toMatchObject({ notificationSent: false })
    expect(repository.recordedNotifications).toEqual([])

    whatsapp.fail = false
    const retry = await panelFetch(`${baseUrl}/api/tramites/cambios-telefono/12/notificacion`, { method: 'POST' })
    await expect(retry.json()).resolves.toMatchObject({ notificationSent: true })
    expect(repository.recordedNotifications).toHaveLength(1)
    expect(repository.recordedNotifications[0]?.id).toBe(12)
  })

  it('lista los cambios de datos pendientes con la paginación pedida', async () => {
    repository.dataChanges = [{
      id: 21,
      caseId: 40,
      customerName: 'Ana Ficticia',
      customerDni: '99000001',
      phone: '5491100000001',
      field: 'apellido',
      currentValue: 'Ficticia',
      value: 'Gómez',
      requestedAt: '2026-11-02T12:00:00.000Z',
    }]

    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-datos?limit=10&offset=0`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: repository.dataChanges, limit: 10, offset: 0 })
    expect(repository.dataChangePage).toEqual([{ limit: 10, offset: 0 }])
  })

  it('la decisión no acepta el dato en la petición: el cambio sale del detalle que guardó el servidor', async () => {
    const response = await panelFetch(`${baseUrl}/api/tramites/cambios-datos/21/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Identidad verificada', field: 'dni', value: '11111111' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(repository.dataChangeDecisions).toEqual([])
  })

  it('aprueba el cambio de datos, avisa por WhatsApp y reintenta el aviso si el envío falla', async () => {
    const request = () => panelFetch(`${baseUrl}/api/tramites/cambios-datos/21/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Identidad verificada' }),
    })

    const response = await request()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 21, decision: 'aprobar', notificationSent: true })
    expect(repository.dataChangeDecisions).toEqual([{ id: 21, decision: 'aprobar', fundamento: 'Identidad verificada' }])
    expect(repository.actors).toMatchObject([{ userId: 10, username: 'graciela' }])
    expect(whatsapp.sent[0]?.text).toContain('cambio de datos fue aprobada')
    expect(repository.recordedNotifications).toEqual([{ id: 21, text: whatsapp.sent[0]?.text }])

    whatsapp.fail = true
    const failed = await request()
    await expect(failed.json()).resolves.toMatchObject({
      id: 21,
      decision: 'aprobar',
      notificationSent: false,
      warning: expect.any(String),
    })

    whatsapp.fail = false
    const retry = await panelFetch(`${baseUrl}/api/tramites/cambios-datos/21/notificacion`, { method: 'POST' })
    await expect(retry.json()).resolves.toEqual({ id: 21, decision: 'aprobar', notificationSent: true })
  })
})

describe('endpoints de clientes', () => {
  let customers: InMemoryCustomerRepository
  let edits: FakeCustomerEditRepository
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string

  const policy = (number: string, expirationDate: string): CustomerPolicy => ({
    number,
    ramo: 'auto',
    status: 'activa',
    expirationDate,
    currency: 'ARS',
    installments: [],
  })

  beforeEach(async () => {
    customers = new InMemoryCustomerRepository([
      {
        id: 1,
        dni: '30111222',
        firstName: 'Laura',
        lastName: 'Gómez',
        active: true,
        policies: [policy('POL-00123', '2026-06-20')],
      },
      { id: 2, dni: '28111222', firstName: 'Ramiro', lastName: 'Pérez', active: true, policies: [] },
      { id: 3, dni: '40111222', firstName: 'Sofía', lastName: 'Benítez', active: true, policies: [] },
    ])
    // Un mismo teléfono vinculado a dos clientes (RF-CAR-03).
    customers.addPhoneLink(1, 17, '5491155551001')
    customers.addPhoneLink(2, 17, '5491155551001')

    edits = new FakeCustomerEditRepository()
    const whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, assistancePhone: null, email: null, web: null, paymentMethods: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      // Mismo día que el inicio de las altas de prueba: ninguna cuota vencida.
      new ManageCustomerEdits(edits, customers, () => new Date('2026-10-01T15:00:00Z')),
      new ManageInbox(new FakeInbox(), whatsapp),
      new ManageAgencySettings(new FakeAgencySettings()),
      panelSession(),
    )
    server = app.listen(0)
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.close()
    await once(server, 'close')
  })

  it('lista los clientes por apellido con total y paginación', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?limit=2&offset=0`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: '3',
          dni: '40111222',
          cuit: null,
          razonSocial: null,
          firstName: 'Sofía',
          lastName: 'Benítez',
          phones: [],
          policies: [],
        },
        {
          id: '1',
          dni: '30111222',
          cuit: null,
          razonSocial: null,
          firstName: 'Laura',
          lastName: 'Gómez',
          phones: ['5491155551001'],
          policies: [{ number: 'POL-00123', ramo: 'auto', status: 'activa', expirationDate: '2026-06-20' }],
        },
      ],
      total: 3,
      limit: 2,
      offset: 0,
    })
  })

  it('devuelve el resto de los clientes en la segunda página', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?limit=2&offset=2`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 3,
      items: [{ id: '2', lastName: 'Pérez' }],
    })
  })

  it('rechaza paginación fuera de rango con un error consistente', async () => {
    for (const query of ['limit=0', 'limit=1000', 'offset=-1']) {
      const response = await panelFetch(`${baseUrl}/api/clientes?${query}`)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    }
  })

  it('busca por DNI ignorando puntos y espacios', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?buscar=${encodeURIComponent('30.111')}`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ id: '1', dni: '30111222' }],
    })
  })

  it('busca por nombre sin distinguir mayúsculas ni acentos', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?buscar=gomez`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ id: '1', lastName: 'Gómez' }],
    })
  })

  it('devuelve a todos los clientes que comparten un teléfono', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?buscar=5491155551001`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 2,
      items: [{ id: '1' }, { id: '2' }],
    })
  })

  it('responde una lista vacía cuando nadie coincide con la búsqueda', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?buscar=zzzz`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: [], total: 0, limit: 25, offset: 0 })
  })

  it('rechaza una búsqueda demasiado larga', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes?buscar=${'x'.repeat(61)}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('devuelve el detalle con teléfonos y pólizas', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: '1',
      dni: '30111222',
      cuit: null,
      razonSocial: null,
      firstName: 'Laura',
      lastName: 'Gómez',
      phones: [{ id: 17, number: '5491155551001' }],
      policies: [
        {
          id: '1',
          number: 'POL-00123',
          ramo: 'auto',
          status: 'activa',
          currency: 'ARS',
          company: null,
          startDate: null,
          expirationDate: '2026-06-20',
          premiumCents: null,
          observations: null,
          insuredItem: null,
          coverages: [],
        },
      ],
    })
  })

  it('devuelve arreglos vacíos para un cliente sin pólizas ni teléfonos', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/3`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ phones: [], policies: [] })
  })

  it('rechaza un identificador que no sea un número de cliente', async () => {
    for (const id of ['abc', '0', '1.5']) {
      const response = await panelFetch(`${baseUrl}/api/clientes/${id}`)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    }
  })

  it('responde 404 para un cliente que no existe', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/9999`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('crea un cliente persona con los datos normalizados y devuelve su ficha', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'persona',
        dni: '30.111.222',
        lastName: 'Gómez',
        firstName: 'Ana',
        phone: '+54 9 11 5555-1234',
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ id: '1', dni: '30111222' })
    expect(edits.created).toEqual([{
      kind: 'persona',
      dni: '30111222',
      lastName: 'Gómez',
      firstName: 'Ana',
      phone: '5491155551234',
    }])
  })

  it('no permite que el navegador meta campos de más en un alta', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'persona',
        dni: '30111222',
        lastName: 'Gómez',
        firstName: 'Ana',
        actor: 'admin',
      }),
    })

    expect(response.status).toBe(400)
    expect(edits.created).toEqual([])
  })

  it('edita el nombre de una persona sin tocar el DNI', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Gómez', firstName: 'Ana María' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: '1' })
    expect(edits.updated).toEqual([{
      id: 1,
      changes: { kind: 'persona', lastName: 'Gómez', firstName: 'Ana María' },
    }])
  })

  it('rechaza una edición que quiera cambiar el DNI', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dni: '30999888' }),
    })

    expect(response.status).toBe(400)
    expect(edits.updated).toEqual([])
  })

  it('rechaza un identificador de cliente que no sea válido', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/0`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Gómez', firstName: 'Ana' }),
    })

    expect(response.status).toBe(400)
    expect(edits.updated).toEqual([])
  })

  it('reporta el conflicto de un dato único repetido', async () => {
    edits.conflict = true
    const response = await panelFetch(`${baseUrl}/api/clientes/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Gómez', firstName: 'Ana' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('da de baja un cliente y responde con su identificador', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1' })
    expect(edits.deactivated).toEqual([1])
  })

  it('vincula un teléfono al cliente', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/telefonos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '(011) 5555-9876' }),
    })

    expect(response.status).toBe(200)
    expect(edits.linked).toEqual([{ customerId: 1, phone: '01155559876' }])
  })

  it('desvincula solo el teléfono indicado del cliente', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/telefonos/17`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    expect(edits.unlinked).toEqual([{ customerId: 1, phoneId: 17 }])
  })

  it('edita una póliza y devuelve la ficha del dueño', async () => {
    const response = await panelFetch(`${baseUrl}/api/polizas/9`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'dada de baja', expirationDate: '2027-06-20' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: '1' })
    expect(edits.policyUpdates).toEqual([{
      id: 9,
      status: 'dada de baja',
      expirationDate: '2027-06-20',
    }])
  })

  it('reemplaza las coberturas de una póliza', async () => {
    const response = await panelFetch(`${baseUrl}/api/polizas/9/coberturas`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coverages: [{ planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 }],
      }),
    })

    expect(response.status).toBe(200)
    expect(edits.coverageReplacements).toEqual([{
      policyId: 9,
      coverages: [{ planId: 2, description: 'Responsabilidad civil', insuredSumCents: 100_000_00 }],
    }])
  })

  it('da de alta una póliza en un cliente que todavía no tiene ninguna', async () => {
    edits.resultCustomerId = 3
    const response = await panelFetch(`${baseUrl}/api/clientes/3/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
        coverages: [{ planId: 2, description: null, insuredSumCents: null }],
      }),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ id: '3' })
    expect(edits.createdPolicies).toEqual([{
      customerId: 3,
      ramo: 'auto',
      status: 'activa',
      currency: 'ARS',
      startDate: '2026-10-01',
      expirationDate: '2027-10-01',
      premiumCents: 12_500_00,
      coverages: [{ planId: 2, description: null, insuredSumCents: null }],
    }])
    // El plan de cuotas sale con el alta: 12 cuotas por la prima, todas sin pagar.
    expect(edits.createdInstallments[0]).toHaveLength(12)
    expect(edits.createdInstallments[0]?.every((item) => !item.paid && item.amountCents === 12_500_00)).toBe(true)
  })

  it('rechaza un alta de póliza sin prima mensual', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'La prima mensual es obligatoria para dar de alta una póliza.' },
    })
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un alta de póliza con cuotas vencidas sin declarar las pagas', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-07-01',
        expirationDate: '2027-07-01',
        premiumCents: 12_500_00,
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'Indique cuántas de las 3 cuotas ya vencidas están pagas.' },
    })
    expect(edits.createdPolicies).toEqual([])
  })

  it('no permite que el navegador meta campos de más en un alta de póliza', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
        actor: 'operador',
      }),
    })

    expect(response.status).toBe(400)
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un alta de póliza con número: lo asigna el sistema', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        number: 'POL-00999',
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'El número de póliza lo asigna el sistema automáticamente.' },
    })
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un alta de póliza sin vigencia', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
      }),
    })

    expect(response.status).toBe(400)
    expect(edits.createdPolicies).toEqual([])
  })

  it('reporta el conflicto cuando el número que asigna el sistema está tomado', async () => {
    edits.conflict = true
    const response = await panelFetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('responde 404 al dar de alta una póliza en un cliente que no existe', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/9999/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
      }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un identificador de cliente que no sea válido', async () => {
    const response = await panelFetch(`${baseUrl}/api/clientes/0/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        premiumCents: 12_500_00,
      }),
    })

    expect(response.status).toBe(400)
    expect(edits.createdPolicies).toEqual([])
  })

  it('devuelve los catálogos para los formularios', async () => {
    const response = await panelFetch(`${baseUrl}/api/catalogos`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ramoNames: ['auto', 'hogar'],
      policyStatusNames: ['activa', 'dada de baja'],
      currencies: [{ code: 'ARS', name: 'Peso argentino' }],
      companies: [{ id: 5, name: 'Seguros Castaño' }],
      plans: [{ id: 2, name: 'Básico' }],
    })
  })
})

describe('Bandeja de Atención', () => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string

  const reclamo: InboxEntry = {
    caseId: 12,
    conversationId: 4,
    severity: 'alto',
    customer: { id: 7, name: 'Ana Prueba', document: '99000001' },
    phone: '5491100000001',
    phoneBlocked: false,
    queryType: 'reclamo',
    handoffReason: 'intención: reclamo',
    handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
    takenAt: null,
    assignee: null,
    prospectState: null,
    pendingPhoneChangeAt: null,
    pendingDataChangeAt: null,
    lastMessage: { text: 'me cobraron de más', origin: 'cliente', at: new Date('2026-10-15T13:00:00.000Z') },
  }
  let inbox: FakeInbox
  let whatsapp: FakeWhatsApp

  beforeEach(async () => {
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, assistancePhone: null, email: null, web: null, paymentMethods: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    inbox = new FakeInbox([reclamo, { ...reclamo, caseId: 13, severity: null }], {
      entry: reclamo,
      alerts: [],
      messages: [{
        id: 1,
        caseId: 12,
        origin: 'cliente',
        text: 'me cobraron de más',
        at: new Date('2026-10-15T13:00:00.000Z'),
        hasImage: false,
        author: null,
      }],
    })
    inbox.state = {
      caseId: 12,
      inInbox: true,
      handedOff: true,
      assigneeId: null,
      prospectState: null,
      unattendedAlerts: 0,
      hasCustomerMessage: true,
      phone: '5491100000001',
      phoneBlocked: false,
      takenAt: null,
    }
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(inbox, whatsapp),
      new ManageAgencySettings(new FakeAgencySettings()),
      panelSession(),
    )
    server = app.listen(0)
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.close()
    await once(server, 'close')
  })

  it('lista los casos con total y paginación, con las fechas en ISO UTC', async () => {
    const response = await panelFetch(`${baseUrl}/api/bandeja?limit=1&offset=0`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [{
        caseId: 12,
        severity: 'alto',
        label: null,
        customer: { id: 7, name: 'Ana Prueba', document: '99000001' },
        phone: '5491100000001',
        phoneBlocked: false,
        queryType: 'reclamo',
        handoffReason: 'intención: reclamo',
        handedOff: true,
        lastMessage: { text: 'me cobraron de más', origin: 'cliente', at: '2026-10-15T13:00:00.000Z' },
        assignee: null,
        assignedToMe: false,
        takenAt: null,
        waitingSince: '2026-10-15T13:00:00.000Z',
      }],
      total: 2,
      limit: 1,
      offset: 0,
    })
  })

  it('devuelve el detalle con la conversación', async () => {
    const response = await panelFetch(`${baseUrl}/api/bandeja/12`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      case: { caseId: 12, severity: 'alto' },
      messages: [{ id: 1, origin: 'cliente', inCase: true, at: '2026-10-15T13:00:00.000Z' }],
    })
  })

  it.each(['/api/bandeja?limit=0', '/api/bandeja?offset=-1', '/api/bandeja/abc', '/api/bandeja?customerId=abc', '/api/bandeja?customerId=0'])('%s da 400', async (path) => {
    const response = await panelFetch(`${baseUrl}${path}`)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('pasa el filtro por cliente a la bandeja', async () => {
    const response = await panelFetch(`${baseUrl}/api/bandeja?customerId=7`)
    expect(response.status).toBe(200)
    expect(inbox.customerFilters).toEqual([7])
  })

  it('un caso que no está en la bandeja da 404', async () => {
    const response = await panelFetch(`${baseUrl}/api/bandeja/99`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  function post(path: string, body?: unknown) {
    return panelFetch(`${baseUrl}${path}`, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
  }

  it('toma un caso y devuelve el ítem', async () => {
    const response = await post('/api/bandeja/12/toma')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ caseId: 12 })
    expect(inbox.state?.assigneeId).toBe(10)
  })

  it('libera un caso tomado: queda sin responsable y sigue derivado', async () => {
    await post('/api/bandeja/12/toma')
    const response = await post('/api/bandeja/12/liberacion')
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(body).toMatchObject({ caseId: 12 })
    expect(body).not.toHaveProperty('assistantResumed')
    expect(inbox.state?.assigneeId).toBeNull()
    expect(inbox.state?.handedOff).toBe(true)
  })

  it('liberar un caso sin responsable da 409', async () => {
    const response = await post('/api/bandeja/12/liberacion')
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('contesta: 201 con el mensaje guardado y el texto enviado por WhatsApp', async () => {
    const response = await post('/api/bandeja/12/respuestas', { texto: 'Hola, le escribo por su reclamo.' })
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ sent: true, saved: true, messageId: 77 })
    expect(whatsapp.sent).toEqual([{ to: '5491100000001', text: 'Hola, le escribo por su reclamo.' }])
  })

  it('no permite enviar una respuesta desde la Bandeja a un número bloqueado', async () => {
    if (!inbox.state) throw new Error('La prueba requiere el estado del caso')
    inbox.state.phoneBlocked = true
    const response = await post('/api/bandeja/12/respuestas', { texto: 'Hola' })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
    expect(whatsapp.sent).toEqual([])
  })

  it('si WhatsApp falla al contestar, 502', async () => {
    whatsapp.fail = true
    const response = await post('/api/bandeja/12/respuestas', { texto: 'Hola' })
    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'WHATSAPP_ERROR' } })
  })

  it.each([
    ['texto vacío', { texto: '  ' }],
    ['campo desconocido', { texto: 'Hola', usuario: 'admin' }],
  ])('contestar con %s da 400', async (_name, body) => {
    const response = await post('/api/bandeja/12/respuestas', body)
    expect(response.status).toBe(400)
    expect(whatsapp.sent).toEqual([])
  })

  it('cerrar un caso sin tomar da 409; tomado, 200', async () => {
    const before = await post('/api/bandeja/12/cierre', {})
    expect(before.status).toBe(409)
    await post('/api/bandeja/12/toma')
    const after = await post('/api/bandeja/12/cierre', {})
    expect(after.status).toBe(200)
    await expect(after.json()).resolves.toMatchObject({ caseId: 12 })
  })

  it('cerrar con alertasRevisadas que no es booleano da 400', async () => {
    const response = await post('/api/bandeja/12/cierre', { alertasRevisadas: 'sí' })
    expect(response.status).toBe(400)
  })

  it('bloquea y desbloquea el número del caso', async () => {
    const bloqueado = await post('/api/bandeja/12/bloqueo', { bloqueado: true })
    expect(bloqueado.status).toBe(200)
    await expect(bloqueado.json()).resolves.toEqual({ caseId: 12, phone: '5491100000001', phoneBlocked: true })
    const liberado = await post('/api/bandeja/12/bloqueo', { bloqueado: false })
    expect(liberado.status).toBe(200)
    await expect(liberado.json()).resolves.toEqual({ caseId: 12, phone: '5491100000001', phoneBlocked: false })
    expect(inbox.blocked).toEqual([
      { caseId: 12, blocked: true },
      { caseId: 12, blocked: false },
    ])
  })

  it.each([
    ['sin cuerpo', undefined],
    ['bloqueado que no es booleano', { bloqueado: 'sí' }],
    ['campo desconocido', { bloqueado: true, usuario: 'admin' }],
  ])('bloquear con %s da 400', async (_name, body) => {
    const response = await post('/api/bandeja/12/bloqueo', body)
    expect(response.status).toBe(400)
    expect(inbox.blocked).toEqual([])
  })

  it('bloquear un caso fuera de la bandeja da 404 sin escribir', async () => {
    const response = await post('/api/bandeja/99/bloqueo', { bloqueado: true })
    expect(response.status).toBe(404)
    expect(inbox.blocked).toEqual([])
  })

  it('las acciones con un id inválido dan 400 y con un caso fuera de la bandeja, 404', async () => {
    expect((await post('/api/bandeja/abc/toma')).status).toBe(400)
    expect((await post('/api/bandeja/99/cierre', {})).status).toBe(404)
  })

  it('la imagen sale con su tipo y sin caché', async () => {
    inbox.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    whatsapp.image = { mimeType: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff]) }
    const response = await panelFetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff])
  })

  it('una imagen que ya no está disponible da 404 IMAGE_UNAVAILABLE', async () => {
    inbox.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    const response = await panelFetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'IMAGE_UNAVAILABLE' } })
  })

  it('una imagen que no es de la conversación da 404 NOT_FOUND', async () => {
    const response = await panelFetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })
})

describe('sesión del panel', () => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string
  let users: FakePanelUsers
  let inbox: FakeInbox

  beforeEach(async () => {
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    const whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, assistancePhone: null, email: null, web: null, paymentMethods: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    users = new FakePanelUsers()
    // Datos ficticios.
    const entry: InboxEntry = {
      caseId: 12,
      conversationId: 4,
      severity: 'alto',
      customer: null,
      phone: '5491100000001',
      queryType: 'reclamo',
      handoffReason: 'intención: reclamo',
      handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
      takenAt: null,
      assignee: null,
      prospectState: null,
      pendingPhoneChangeAt: null,
      pendingDataChangeAt: null,
      lastMessage: null,
    }
    inbox = new FakeInbox([entry], { entry, alerts: [], messages: [] })
    inbox.state = {
      caseId: 12,
      inInbox: true,
      handedOff: true,
      assigneeId: null,
      prospectState: null,
      unattendedAlerts: 0,
      hasCustomerMessage: true,
      phone: '5491100000001',
      takenAt: null,
    }
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(inbox, whatsapp),
      new ManageAgencySettings(new FakeAgencySettings()),
      panelSession(users),
    )
    // Una ruta de administración de prueba: este change no agrega ninguna real.
    app.get('/api/prueba-administracion', requireRole('administrador'), (_request, response) => {
      response.status(200).json({ ok: true })
    })
    server = app.listen(0)
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.close()
    await once(server, 'close')
  })

  function login(usuario: string, clave: string) {
    return fetch(`${baseUrl}/api/sesion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usuario, clave }),
    })
  }

  it('el login correcto deja la cookie de sesión y devuelve el usuario', async () => {
    const response = await login('Graciela', 'clave-correcta')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 10,
      usuario: 'graciela',
      nombre: 'Graciela',
      apellido: 'Prueba',
      rol: 'operador',
    })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^sesion_panel=[^;]+;/)
    expect(cookie).toContain('Max-Age=28800')
    expect(cookie).toContain('Path=/api')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    // En desarrollo el panel corre por HTTP: Secure solo en producción.
    expect(cookie).not.toContain('Secure')

    const sessionValue = cookie.split(';')[0] ?? ''
    const current = await fetch(`${baseUrl}/api/sesion`, { headers: { Cookie: sessionValue } })
    expect(current.status).toBe(200)
    await expect(current.json()).resolves.toMatchObject({ id: 10, rol: 'operador' })
    const list = await fetch(`${baseUrl}/api/bandeja`, { headers: { Cookie: sessionValue } })
    expect(list.status).toBe(200)
  })

  it.each([
    ['clave incorrecta', 'graciela', 'otra-clave'],
    ['usuario inexistente', 'nadie', 'clave-correcta'],
    ['usuario dado de baja', 'baja', 'clave-correcta'],
  ])('%s: 401 con el mismo mensaje y sin cookie', async (_caso, usuario, clave) => {
    const response = await login(usuario, clave)
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
    await expect(response.json()).resolves.toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Usuario o clave incorrectos.' },
    })
  })

  it('un login sin usuario o con campos de más da 400', async () => {
    const response = await fetch(`${baseUrl}/api/sesion`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clave: 'clave-correcta', rol: 'administrador' }),
    })
    expect(response.status).toBe(400)
  })

  it('después de 5 fallos seguidos bloquea al usuario con 429, aunque la clave sea correcta', async () => {
    for (let i = 0; i < 5; i += 1) expect((await login('graciela', 'otra-clave')).status).toBe(401)
    const response = await login('graciela', 'clave-correcta')
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'TOO_MANY_ATTEMPTS' } })
  })

  it('cerrar sesión borra la cookie', async () => {
    const response = await fetch(`${baseUrl}/api/sesion/cierre`, { method: 'POST', headers: { Cookie: sessionCookie(10) } })
    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toMatch(/^sesion_panel=;.*Expires=Thu, 01 Jan 1970/)
  })

  it.each([
    ['sin cookie', undefined],
    ['con la cookie alterada', `${sessionCookie(10)}x`],
    ['firmada con otro secreto', sessionCookie(10, 'otro-secreto')],
    ['de un usuario dado de baja', sessionCookie(12)],
    ['de un usuario que no existe', sessionCookie(99)],
  ])('%s: la API responde 401 sin leer datos', async (_caso, cookie) => {
    const headers: Record<string, string> = cookie === undefined ? {} : { Cookie: cookie }
    const list = await fetch(`${baseUrl}/api/bandeja`, { headers })
    expect(list.status).toBe(401)
    await expect(list.json()).resolves.toEqual({ error: { code: 'UNAUTHORIZED', message: 'Iniciá sesión para continuar.' } })
    const take = await fetch(`${baseUrl}/api/bandeja/12/toma`, { method: 'POST', headers })
    expect(take.status).toBe(401)
    expect(inbox.customerFilters).toEqual([])
    expect(inbox.state?.assigneeId).toBeNull()
    expect((await fetch(`${baseUrl}/api/sesion`, { headers })).status).toBe(401)
  })

  it('una baja con la sesión abierta corta el acceso en el pedido siguiente', async () => {
    const cookie = sessionCookie(10)
    expect((await fetch(`${baseUrl}/api/bandeja`, { headers: { Cookie: cookie } })).status).toBe(200)
    const graciela = users.users.find((user) => user.userId === 10)
    if (!graciela) throw new Error('Falta el usuario de prueba.')
    graciela.active = false
    expect((await fetch(`${baseUrl}/api/bandeja`, { headers: { Cookie: cookie } })).status).toBe(401)
  })

  it('una ruta de administración da 403 al operador y responde al administrador', async () => {
    const operator = await fetch(`${baseUrl}/api/prueba-administracion`, { headers: { Cookie: sessionCookie(10) } })
    expect(operator.status).toBe(403)
    await expect(operator.json()).resolves.toMatchObject({ error: { code: 'FORBIDDEN' } })
    const admin = await fetch(`${baseUrl}/api/prueba-administracion`, { headers: { Cookie: sessionCookie(11) } })
    expect(admin.status).toBe(200)
  })

  it('un cambio de rol se aplica en el pedido siguiente', async () => {
    const graciela = users.users.find((user) => user.userId === 10)
    if (!graciela) throw new Error('Falta el usuario de prueba.')
    graciela.role = 'administrador'
    const response = await fetch(`${baseUrl}/api/prueba-administracion`, { headers: { Cookie: sessionCookie(10) } })
    expect(response.status).toBe(200)
  })

  it('el actor sale de la sesión, y el cuerpo no puede elegirlo', async () => {
    const withActor = await fetch(`${baseUrl}/api/bandeja/12/toma`, {
      method: 'POST',
      headers: { Cookie: sessionCookie(10), 'content-type': 'application/json' },
      body: JSON.stringify({ usuario: 11 }),
    })
    expect(withActor.status).toBe(400)
    expect(inbox.state?.assigneeId).toBeNull()
    const take = await fetch(`${baseUrl}/api/bandeja/12/toma`, { method: 'POST', headers: { Cookie: sessionCookie(11) } })
    expect(take.status).toBe(200)
    expect(inbox.state?.assigneeId).toBe(11)
  })

  it('el webhook de WhatsApp no usa la sesión del panel', async () => {
    const response = await fetch(`${baseUrl}/webhooks/whatsapp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Webhook-Secret': 'test' },
      body: JSON.stringify({
        event: 'message',
        payload: { id: 'mensaje-1', from: '5491100000099@c.us', fromMe: false, body: 'Hola' },
      }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.not.toMatchObject({ status: 'IGNORED' })
  })

  it('/health sigue sin sesión', async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200)
  })
})

describe('Configuración de la agencia (RF-SUP-07, RF-ATE-06)', () => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string
  let settings: FakeAgencySettings

  // Datos ficticios, no de la agencia.
  const draft = {
    address: 'Calle Ficticia 456',
    phone: '11 4000-0000',
    assistancePhone: '0800 555 0000',
    email: 'contacto@ejemplo.com',
    web: null,
    paymentMethods: 'Transferencia. Alias: EJEMPLO.ALIAS',
    hours: [
      { day: 1, opens: '09:00', closes: '18:00' },
      { day: 6, opens: '09:00', closes: '13:00' },
    ],
    activeRamoIds: [1],
    activePlanIds: [1, 2],
  }

  beforeEach(async () => {
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    const whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({
      ramos: [], plans: [], address: null, phone: null, assistancePhone: null, email: null, web: null, paymentMethods: null, hours: [],
    })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    settings = new FakeAgencySettings()
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(new FakeInbox(), whatsapp),
      new ManageAgencySettings(settings),
      panelSession(),
    )
    server = app.listen(0)
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    server.close()
    await once(server, 'close')
  })

  const admin = sessionCookie(11)
  function call(path: string, method: string, body?: unknown, cookie: string | null = admin) {
    return fetch(`${baseUrl}/api/configuracion/agencia${path}`, {
      method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  it('el administrador lee los datos con las marcas y la vista previa', async () => {
    const response = await call('', 'GET')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      address: 'Ficticia 123',
      assistancePhone: null,
      marks: { address: 'example', phone: 'example', assistancePhone: 'missing', email: 'missing', web: 'missing', paymentMethods: 'missing' },
      ramos: [{ id: 1, name: 'auto', active: true }, { id: 2, name: 'moto', active: true }],
      preview: { agencyInfo: expect.stringContaining('Nuestra oficina está en Ficticia 123'), assistance: null, paymentMethods: null },
    })
  })

  it('el administrador guarda: los datos cambiados dejan de ser de ejemplo y la vista previa los usa', async () => {
    const response = await call('', 'PUT', draft)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(settings.saved).toHaveLength(1)
    expect(body).toMatchObject({
      marks: { address: null, phone: null, assistancePhone: null, web: 'missing' },
      ramos: [{ id: 1, name: 'auto', active: true }, { id: 2, name: 'moto', active: false }],
      preview: {
        agencyInfo: expect.stringMatching(/seguros de auto\..*y los sábados, de 9 a 13 h/),
        assistance: expect.stringContaining('comuníquese al 0800 555 0000'),
        paymentMethods: 'Estos son los medios de pago de Seguros Castaño: Transferencia. Alias: EJEMPLO.ALIAS',
      },
    })
  })

  it.each<[string, Record<string, unknown>]>([
    ['sin dirección', { address: '' }],
    ['horario invertido', { hours: [{ day: 1, opens: '18:00', closes: '09:00' }] }],
    ['un ramo que no existe', { activeRamoIds: [99] }],
    ['sin planes activos', { activePlanIds: [] }],
  ])('un dato inválido (%s) da 400 y no guarda nada', async (_caso, cambio) => {
    const response = await call('', 'PUT', { ...draft, ...cambio })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    expect(settings.saved).toEqual([])
  })

  it('la vista previa arma los textos del borrador sin guardar nada', async () => {
    const response = await call('/vista-previa', 'POST', draft)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      agencyInfo: expect.stringContaining('Calle Ficticia 456'),
      assistance: expect.stringContaining('0800 555 0000'),
    })
    expect(settings.saved).toEqual([])
    expect(settings.state.texts.address.value).toBe('Ficticia 123')
  })

  it.each<[string, string, unknown]>([
    ['', 'GET', undefined],
    ['', 'PUT', draft],
    ['/vista-previa', 'POST', draft],
  ])('un operador recibe 403 en %s %s sin leer ni modificar nada', async (path, method, body) => {
    const response = await call(path, method, body, sessionCookie(10))
    expect(response.status).toBe(403)
    expect(settings.reads).toBe(0)
    expect(settings.saved).toEqual([])
  })

  it('sin sesión da 401', async () => {
    expect((await call('', 'GET', undefined, null)).status).toBe(401)
    expect(settings.reads).toBe(0)
  })
})
