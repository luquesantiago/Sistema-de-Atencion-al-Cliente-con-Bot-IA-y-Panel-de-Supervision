import type { WhatsAppClient } from '../domain/whatsapp-client.js'
import {
  RequestManagementError,
  type PageRequest,
  type PendingPhoneChange,
  type PendingProspect,
  type PhoneChangeDecisionInput,
  type ProspectDecisionInput,
  type RequestManagementRepository,
} from '../domain/request-management.js'

const maxPageSize = 100
const maxId = 4_294_967_295

export class ManageRequests {
  public constructor(
    private readonly repository: RequestManagementRepository,
    private readonly whatsapp: WhatsAppClient,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  public listPendingProspects(page: PageRequest): Promise<PendingProspect[]> {
    validatePage(page)
    return this.repository.listPendingProspects(page)
  }

  public listPendingPhoneChanges(page: PageRequest): Promise<PendingPhoneChange[]> {
    validatePage(page)
    return this.repository.listPendingPhoneChanges(page)
  }

  public decideProspect(input: ProspectDecisionInput) {
    validateDecision(input.id, input.decision, input.fundamento)
    if (input.decision === 'aprobar') {
      validateName(input.nombre, 'nombre')
      validateName(input.apellido, 'apellido')
    }
    return this.repository.decideProspect(input)
  }

  public async decidePhoneChange(input: PhoneChangeDecisionInput) {
    validateDecision(input.id, input.decision, input.fundamento)
    if (!Array.isArray(input.telefonosADesvincular) ||
      input.telefonosADesvincular.some((id) => !isValidId(id)) ||
      new Set(input.telefonosADesvincular).size !== input.telefonosADesvincular.length) {
      throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La lista de teléfonos a desvincular no es válida.')
    }
    if (input.decision === 'rechazar' && input.telefonosADesvincular.length > 0) {
      throw new RequestManagementError(400, 'VALIDATION_ERROR', 'No se pueden desvincular teléfonos al rechazar una solicitud.')
    }

    const result = await this.repository.decidePhoneChange(input)
    const notificationSent = await this.sendPhoneChangeNotification(result.id, result.phone, result.decision)
    return { id: result.id, decision: result.decision, notificationSent }
  }

  public async retryPhoneChangeNotification(id: number) {
    if (!isValidId(id)) {
      throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del trámite no es válido.')
    }
    const notification = await this.repository.getPhoneChangeNotification(id)
    const notificationSent = await this.sendPhoneChangeNotification(
      notification.id,
      notification.phone,
      notification.decision,
    )
    return { id: notification.id, decision: notification.decision, notificationSent }
  }

  private async sendPhoneChangeNotification(id: number, phone: string, decision: 'aprobar' | 'rechazar') {
    const text = decision === 'aprobar'
      ? 'Su solicitud de actualización de teléfono fue aprobada. El número solicitado ya quedó registrado.'
      : 'Su solicitud de actualización de teléfono fue rechazada. Si necesita más información, comuníquese con nuestro equipo.'
    try {
      await this.whatsapp.sendText(phone, text)
    } catch {
      console.error(`[tramites] No se pudo notificar la decisión ${id} al cliente.`)
      return false
    }
    // El aviso ya salió: si no se puede guardar, queda la línea en el log y no se reenvía.
    try {
      await this.repository.recordPhoneChangeNotification(id, text, this.clock())
    } catch {
      console.error(`[tramites] No se pudo guardar el aviso de la decisión ${id}.`)
    }
    return true
  }
}

function validatePage(page: PageRequest): void {
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > maxPageSize ||
    !Number.isInteger(page.offset) || page.offset < 0) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La paginación no es válida.')
  }
}

function validateDecision(id: number, decision: string, fundamento: string): void {
  if (!isValidId(id)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El identificador del trámite no es válido.')
  }
  if (decision !== 'aprobar' && decision !== 'rechazar') {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'La decisión debe ser aprobar o rechazar.')
  }
  if (typeof fundamento !== 'string' || fundamento.trim().length < 3 || fundamento.trim().length > 2000) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'El fundamento es obligatorio y debe tener hasta 2000 caracteres.')
  }
}

function validateName(value: string | undefined, field: string): void {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', `El ${field} es obligatorio y debe tener hasta 100 caracteres.`)
  }
}

function isValidId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= maxId
}
