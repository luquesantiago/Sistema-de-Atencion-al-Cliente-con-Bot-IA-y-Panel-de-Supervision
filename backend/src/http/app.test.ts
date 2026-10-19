import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { AiClient, CustomerStatus, RewriteInput } from '../domain/ai-client.js'
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
import {
  RequestManagementError,
  type PageRequest,
  type PendingPhoneChange,
  type PendingProspect,
  type PhoneChangeDecisionInput,
  type ProspectDecisionInput,
  type RequestManagementRepository,
} from '../domain/request-management.js'
import type { WhatsAppClient, WhatsAppImage } from '../domain/whatsapp-client.js'
import { ManageCustomers } from '../application/manage-customers.js'
import { ManageCustomerEdits } from '../application/manage-customer-edits.js'
import { ManageInbox } from '../application/manage-inbox.js'
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
import { createApp } from './app.js'

class FakeAi implements AiClient {
  public async classifyCustomerStatus(_reply: string): Promise<CustomerStatus> {
    return 'UNRELATED'
  }
  public async classifyIntent(_text: string) {
    return { intent: 'otra consulta' as const, urgency: null }
  }
  public async rewrite(_input: RewriteInput): Promise<string> {
    return ''
  }
}

// Bandeja en memoria: la página es la que pide la prueba, ya ordenada. Datos ficticios.
class FakeInbox implements InboxRepository {
  public constructor(public entries: InboxEntry[] = [], public conversation: InboxConversation | null = null) {}

  public async listPage(page: PageRequest): Promise<InboxPage> {
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
}

const panelActor = async () => ({ userId: 10 })

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
  public readonly prospectDecisions: ProspectDecisionInput[] = []
  public readonly phoneDecisions: PhoneChangeDecisionInput[] = []
  public prospects: PendingProspect[] = []
  public phoneChanges: PendingPhoneChange[] = []

  public async listPendingProspects(page: PageRequest): Promise<PendingProspect[]> {
    this.prospectPage.push(page)
    return this.prospects
  }

  public async listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]> {
    this.phonePage.push(page)
    return this.phoneChanges
  }

  public async decideProspect(input: ProspectDecisionInput) {
    this.prospectDecisions.push(input)
    return { id: input.id, decision: input.decision, casoId: 31, ...(input.decision === 'aprobar' ? { clienteId: 44 } : {}) }
  }

  public async decidePhoneChange(input: PhoneChangeDecisionInput) {
    this.phoneDecisions.push(input)
    return { id: input.id, decision: input.decision, phone: '5491100000000' }
  }

  public async getPhoneChangeNotification(id: number) {
    return { id, decision: 'aprobar' as const, phone: '5491100000000' }
  }

  public readonly recordedNotifications: Array<{ id: number; text: string }> = []

  public async recordPhoneChangeNotification(id: number, text: string, _sentAt: Date): Promise<void> {
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

  public async createPolicy(input: CreatePolicyInput): Promise<number> {
    this.throwIfConflict()
    // El repositorio real comprueba que el cliente exista y esté activo.
    if (input.customerId !== this.resultCustomerId) {
      throw new RequestManagementError(404, 'NOT_FOUND', 'No existe un cliente activo con ese identificador.')
    }
    this.createdPolicies.push(input)
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
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(repository, whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(new FakeInbox(), whatsapp),
      panelActor,
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

    const response = await fetch(`${baseUrl}/api/tramites/prospectos?limit=10&offset=5`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: repository.prospects, limit: 10, offset: 5 })
    expect(repository.prospectPage).toEqual([{ limit: 10, offset: 5 }])
  })

  it('rechaza paginación inválida con un error consistente', async () => {
    const response = await fetch(`${baseUrl}/api/tramites/cambios-telefono?limit=1000`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('rechaza JSON mal formado como error de validación', async () => {
    const response = await fetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
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
    const response = await fetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
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
    await expect(response.json()).resolves.toEqual({ id: 8, decision: 'aprobar', casoId: 31, clienteId: 44 })
    expect(repository.prospectDecisions).toEqual([{
      id: 8,
      decision: 'aprobar',
      fundamento: 'Datos revisados con el cliente',
      nombre: 'Laura',
      apellido: 'Díaz',
    }])
  })

  it('al rechazar el alta devuelve el caso, para abrirlo en la bandeja', async () => {
    const response = await fetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', fundamento: 'La foto no coincide' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: 8, decision: 'rechazar', casoId: 31 })
  })

  it('no permite que el navegador elija el actor o rol de la decisión', async () => {
    const response = await fetch(`${baseUrl}/api/tramites/prospectos/8/decision`, {
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
    const request = () => fetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
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
    const retryResponse = await fetch(`${baseUrl}/api/tramites/cambios-telefono/12/notificacion`, { method: 'POST' })
    await expect(retryResponse.json()).resolves.toEqual({
      id: 12,
      decision: 'aprobar',
      notificationSent: true,
    })
  })

  it('guarda el aviso de la decisión una vez cuando sale por WhatsApp', async () => {
    const response = await fetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'rechazar', fundamento: 'No se pudo verificar', telefonosADesvincular: [] }),
    })
    await expect(response.json()).resolves.toMatchObject({ notificationSent: true })
    expect(repository.recordedNotifications).toEqual([{ id: 12, text: whatsapp.sent[0]?.text }])
  })

  it('con el envío fallido no guarda el aviso, y el reintento por /notificacion lo guarda', async () => {
    whatsapp.fail = true
    const response = await fetch(`${baseUrl}/api/tramites/cambios-telefono/12/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'aprobar', fundamento: 'Identidad verificada', telefonosADesvincular: [] }),
    })
    await expect(response.json()).resolves.toMatchObject({ notificationSent: false })
    expect(repository.recordedNotifications).toEqual([])

    whatsapp.fail = false
    const retry = await fetch(`${baseUrl}/api/tramites/cambios-telefono/12/notificacion`, { method: 'POST' })
    await expect(retry.json()).resolves.toMatchObject({ notificationSent: true })
    expect(repository.recordedNotifications).toHaveLength(1)
    expect(repository.recordedNotifications[0]?.id).toBe(12)
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
        policies: [policy('POL-00123', '2026-06-20')],
      },
      { id: 2, dni: '28111222', firstName: 'Ramiro', lastName: 'Pérez', policies: [] },
      { id: 3, dni: '40111222', firstName: 'Sofía', lastName: 'Benítez', policies: [] },
    ])
    // Un mismo teléfono vinculado a dos clientes (RF-CAR-03).
    customers.addPhoneLink(1, 17, '5491155551001')
    customers.addPhoneLink(2, 17, '5491155551001')

    edits = new FakeCustomerEditRepository()
    const whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, hours: [] })
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), agency, new FakeAi(), whatsapp)
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(edits, customers),
      new ManageInbox(new FakeInbox(), whatsapp),
      panelActor,
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
    const response = await fetch(`${baseUrl}/api/clientes?limit=2&offset=0`)

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
    const response = await fetch(`${baseUrl}/api/clientes?limit=2&offset=2`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 3,
      items: [{ id: '2', lastName: 'Pérez' }],
    })
  })

  it('rechaza paginación fuera de rango con un error consistente', async () => {
    for (const query of ['limit=0', 'limit=1000', 'offset=-1']) {
      const response = await fetch(`${baseUrl}/api/clientes?${query}`)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    }
  })

  it('busca por DNI ignorando puntos y espacios', async () => {
    const response = await fetch(`${baseUrl}/api/clientes?buscar=${encodeURIComponent('30.111')}`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ id: '1', dni: '30111222' }],
    })
  })

  it('busca por nombre sin distinguir mayúsculas ni acentos', async () => {
    const response = await fetch(`${baseUrl}/api/clientes?buscar=gomez`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [{ id: '1', lastName: 'Gómez' }],
    })
  })

  it('devuelve a todos los clientes que comparten un teléfono', async () => {
    const response = await fetch(`${baseUrl}/api/clientes?buscar=5491155551001`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      total: 2,
      items: [{ id: '1' }, { id: '2' }],
    })
  })

  it('responde una lista vacía cuando nadie coincide con la búsqueda', async () => {
    const response = await fetch(`${baseUrl}/api/clientes?buscar=zzzz`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ items: [], total: 0, limit: 25, offset: 0 })
  })

  it('rechaza una búsqueda demasiado larga', async () => {
    const response = await fetch(`${baseUrl}/api/clientes?buscar=${'x'.repeat(61)}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('devuelve el detalle con teléfonos y pólizas', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1`)

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
    const response = await fetch(`${baseUrl}/api/clientes/3`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ phones: [], policies: [] })
  })

  it('rechaza un identificador que no sea un número de cliente', async () => {
    for (const id of ['abc', '0', '1.5']) {
      const response = await fetch(`${baseUrl}/api/clientes/${id}`)
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
    }
  })

  it('responde 404 para un cliente que no existe', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/9999`)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  it('crea un cliente persona con los datos normalizados y devuelve su ficha', async () => {
    const response = await fetch(`${baseUrl}/api/clientes`, {
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
    const response = await fetch(`${baseUrl}/api/clientes`, {
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
    const response = await fetch(`${baseUrl}/api/clientes/1`, {
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
    const response = await fetch(`${baseUrl}/api/clientes/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dni: '30999888' }),
    })

    expect(response.status).toBe(400)
    expect(edits.updated).toEqual([])
  })

  it('rechaza un identificador de cliente que no sea válido', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/0`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Gómez', firstName: 'Ana' }),
    })

    expect(response.status).toBe(400)
    expect(edits.updated).toEqual([])
  })

  it('reporta el conflicto de un dato único repetido', async () => {
    edits.conflict = true
    const response = await fetch(`${baseUrl}/api/clientes/1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lastName: 'Gómez', firstName: 'Ana' }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('da de baja un cliente y responde con su identificador', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: '1' })
    expect(edits.deactivated).toEqual([1])
  })

  it('vincula un teléfono al cliente', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1/telefonos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: '(011) 5555-9876' }),
    })

    expect(response.status).toBe(200)
    expect(edits.linked).toEqual([{ customerId: 1, phone: '01155559876' }])
  })

  it('desvincula solo el teléfono indicado del cliente', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1/telefonos/17`, { method: 'DELETE' })

    expect(response.status).toBe(200)
    expect(edits.unlinked).toEqual([{ customerId: 1, phoneId: 17 }])
  })

  it('edita una póliza y devuelve la ficha del dueño', async () => {
    const response = await fetch(`${baseUrl}/api/polizas/9`, {
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
    const response = await fetch(`${baseUrl}/api/polizas/9/coberturas`, {
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
    const response = await fetch(`${baseUrl}/api/clientes/3/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
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
      coverages: [{ planId: 2, description: null, insuredSumCents: null }],
    }])
  })

  it('no permite que el navegador meta campos de más en un alta de póliza', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
        actor: 'operador',
      }),
    })

    expect(response.status).toBe(400)
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un alta de póliza con número: lo asigna el sistema', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1/polizas`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        number: 'POL-00999',
        ramo: 'auto',
        status: 'activa',
        currency: 'ARS',
        startDate: '2026-10-01',
        expirationDate: '2027-10-01',
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: { message: 'El número de póliza lo asigna el sistema automáticamente.' },
    })
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un alta de póliza sin vigencia', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/1/polizas`, {
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
    const response = await fetch(`${baseUrl}/api/clientes/1/polizas`, {
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

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'CONFLICT' } })
  })

  it('responde 404 al dar de alta una póliza en un cliente que no existe', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/9999/polizas`, {
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

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(edits.createdPolicies).toEqual([])
  })

  it('rechaza un identificador de cliente que no sea válido', async () => {
    const response = await fetch(`${baseUrl}/api/clientes/0/polizas`, {
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
    expect(edits.createdPolicies).toEqual([])
  })

  it('devuelve los catálogos para los formularios', async () => {
    const response = await fetch(`${baseUrl}/api/catalogos`)

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
    queryType: 'reclamo',
    handoffReason: 'intención: reclamo',
    handedOffAt: new Date('2026-10-15T13:00:00.000Z'),
    takenAt: null,
    assignee: null,
    prospectState: null,
    pendingPhoneChangeAt: null,
    lastMessage: { text: 'me cobraron de más', origin: 'cliente', at: new Date('2026-10-15T13:00:00.000Z') },
  }
  let inbox: FakeInbox
  let whatsapp: FakeWhatsApp

  beforeEach(async () => {
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    whatsapp = new FakeWhatsApp()
    const agency = new InMemoryAgencyInfoSource({ ramos: [], plans: [], address: null, phone: null, hours: [] })
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
      takenAt: null,
    }
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(new FakeRequestRepository(), whatsapp),
      new ManageCustomers(customers),
      new ManageCustomerEdits(new FakeCustomerEditRepository(), customers),
      new ManageInbox(inbox, whatsapp),
      panelActor,
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
    const response = await fetch(`${baseUrl}/api/bandeja?limit=1&offset=0`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      items: [{
        caseId: 12,
        severity: 'alto',
        label: null,
        customer: { id: 7, name: 'Ana Prueba', document: '99000001' },
        phone: '5491100000001',
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
    const response = await fetch(`${baseUrl}/api/bandeja/12`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      case: { caseId: 12, severity: 'alto' },
      messages: [{ id: 1, origin: 'cliente', inCase: true, at: '2026-10-15T13:00:00.000Z' }],
    })
  })

  it.each(['/api/bandeja?limit=0', '/api/bandeja?offset=-1', '/api/bandeja/abc'])('%s da 400', async (path) => {
    const response = await fetch(`${baseUrl}${path}`)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'VALIDATION_ERROR' } })
  })

  it('un caso que no está en la bandeja da 404', async () => {
    const response = await fetch(`${baseUrl}/api/bandeja/99`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })

  function post(path: string, body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
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

  it('contesta: 201 con el mensaje guardado y el texto enviado por WhatsApp', async () => {
    const response = await post('/api/bandeja/12/respuestas', { texto: 'Hola, le escribo por su reclamo.' })
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ sent: true, saved: true, messageId: 77 })
    expect(whatsapp.sent).toEqual([{ to: '5491100000001', text: 'Hola, le escribo por su reclamo.' }])
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

  it('las acciones con un id inválido dan 400 y con un caso fuera de la bandeja, 404', async () => {
    expect((await post('/api/bandeja/abc/toma')).status).toBe(400)
    expect((await post('/api/bandeja/99/cierre', {})).status).toBe(404)
  })

  it('la imagen sale con su tipo y sin caché', async () => {
    inbox.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    whatsapp.image = { mimeType: 'image/jpeg', data: new Uint8Array([0xff, 0xd8, 0xff]) }
    const response = await fetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff])
  })

  it('una imagen que ya no está disponible da 404 IMAGE_UNAVAILABLE', async () => {
    inbox.image = { ref: 'false_1@lid_ABC', phone: '5491100000001' }
    const response = await fetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'IMAGE_UNAVAILABLE' } })
  })

  it('una imagen que no es de la conversación da 404 NOT_FOUND', async () => {
    const response = await fetch(`${baseUrl}/api/bandeja/12/mensajes/1/imagen`)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'NOT_FOUND' } })
  })
})
