import { once } from 'node:events'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { AiClient, CustomerStatus, RewriteInput } from '../domain/ai-client.js'
import type { CustomerRepository } from '../domain/customer.js'
import type {
  PageRequest,
  PendingPhoneChange,
  PendingProspect,
  PhoneChangeDecisionInput,
  ProspectDecisionInput,
  RequestManagementRepository,
} from '../domain/request-management.js'
import type { WhatsAppClient } from '../domain/whatsapp-client.js'
import { ManageRequests } from '../application/manage-requests.js'
import { ProcessIncomingMessage } from '../application/process-incoming-message.js'
import { InMemoryConversationStore } from '../infrastructure/in-memory-conversation-store.js'
import { InMemoryCustomerRepository } from '../infrastructure/in-memory-customer-repository.js'
import { createApp } from './app.js'

class FakeAi implements AiClient {
  public async classifyCustomerStatus(_reply: string): Promise<CustomerStatus> {
    return 'UNRELATED'
  }
  public async classifyIntent(_text: string) {
    return 'no sé' as const
  }
  public async rewrite(_input: RewriteInput): Promise<string> {
    return ''
  }
}

class FakeWhatsApp implements WhatsAppClient {
  public readonly sent: Array<{ to: string; text: string }> = []
  public fail = false

  public async sendText(to: string, text: string): Promise<void> {
    if (this.fail) throw new Error('WAHA unavailable')
    this.sent.push({ to, text })
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
    return { id: input.id, decision: input.decision, ...(input.decision === 'aprobar' ? { clienteId: 44 } : {}) }
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

describe('endpoints de trámites', () => {
  let repository: FakeRequestRepository
  let whatsapp: FakeWhatsApp
  let server: ReturnType<ReturnType<typeof createApp>['listen']>
  let baseUrl: string

  beforeEach(async () => {
    repository = new FakeRequestRepository()
    whatsapp = new FakeWhatsApp()
    const customers: CustomerRepository = new InMemoryCustomerRepository([])
    const assistant = new ProcessIncomingMessage(customers, new InMemoryConversationStore(), new FakeAi(), whatsapp)
    const app = createApp(
      assistant,
      { secret: 'test', findPhoneByLid: async () => null },
      new ManageRequests(repository, whatsapp),
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
    await expect(response.json()).resolves.toEqual({ id: 8, decision: 'aprobar', clienteId: 44 })
    expect(repository.prospectDecisions).toEqual([{
      id: 8,
      decision: 'aprobar',
      fundamento: 'Datos revisados con el cliente',
      nombre: 'Laura',
      apellido: 'Díaz',
    }])
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
