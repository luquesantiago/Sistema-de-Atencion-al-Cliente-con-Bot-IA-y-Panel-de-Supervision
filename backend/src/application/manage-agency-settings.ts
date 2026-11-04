import {
  agencyInfoFromSettings,
  agencyPreview,
  parseAgencySettings,
  settingMark,
  type AgencyPreview,
  type AgencySettings,
  type AgencySettingsRepository,
  type AgencyTextField,
  type CatalogItem,
  type SettingMark,
  type StoredAgencySettings,
} from '../domain/agency-settings.js'
import type { OpeningHours } from '../domain/agency-info.js'
import { RequestManagementError } from '../domain/request-management.js'

// Configuración de la información de la agencia, solo para el administrador (RF-SUP-07,
// RF-ATE-06; change configuracion-agencia). El asistente lee estos datos en cada consulta,
// así que lo guardado vale desde el mensaje siguiente.

export type AgencySettingsView = Record<AgencyTextField, string | null> & {
  marks: Record<AgencyTextField, SettingMark>
  hours: OpeningHours[]
  ramos: CatalogItem[]
  plans: CatalogItem[]
  preview: AgencyPreview
}

export class ManageAgencySettings {
  public constructor(private readonly repository: AgencySettingsRepository) {}

  public async get(): Promise<AgencySettingsView> {
    return toView(await this.repository.readSettings())
  }

  public async save(body: unknown): Promise<AgencySettingsView> {
    const stored = await this.repository.readSettings()
    const settings = parseAgencySettings(body)
    checkCatalogIds(settings, stored)
    await this.repository.saveSettings(settings)
    return this.get()
  }

  // Arma lo que contestaría el asistente con un borrador, sin guardar nada.
  public async preview(body: unknown): Promise<AgencyPreview> {
    const stored = await this.repository.readSettings()
    const settings = parseAgencySettings(body)
    checkCatalogIds(settings, stored)
    return agencyPreview(agencyInfoFromSettings(settings, stored.ramos, stored.plans))
  }
}

function checkCatalogIds(settings: AgencySettings, stored: StoredAgencySettings): void {
  const known = (items: CatalogItem[], ids: number[]) => ids.every((id) => items.some((item) => item.id === id))
  if (!known(stored.ramos, settings.activeRamoIds)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'Uno de los ramos activos no existe.')
  }
  if (!known(stored.plans, settings.activePlanIds)) {
    throw new RequestManagementError(400, 'VALIDATION_ERROR', 'Uno de los planes activos no existe.')
  }
}

function byField<T>(of: (field: AgencyTextField) => T): Record<AgencyTextField, T> {
  return {
    address: of('address'),
    phone: of('phone'),
    assistancePhone: of('assistancePhone'),
    email: of('email'),
    web: of('web'),
    paymentMethods: of('paymentMethods'),
  }
}

function toView(stored: StoredAgencySettings): AgencySettingsView {
  const value = (field: AgencyTextField) => stored.texts[field].value
  const texts = byField(value)
  const marks = byField((field) => settingMark(stored.texts[field].value, stored.texts[field].description))
  const current: AgencySettings = {
    address: value('address') ?? '',
    phone: value('phone') ?? '',
    assistancePhone: value('assistancePhone'),
    email: value('email'),
    web: value('web'),
    paymentMethods: value('paymentMethods'),
    hours: stored.hours,
    activeRamoIds: stored.ramos.filter((item) => item.active).map((item) => item.id),
    activePlanIds: stored.plans.filter((item) => item.active).map((item) => item.id),
  }
  return {
    ...texts,
    marks,
    hours: [...stored.hours].sort((a, b) => a.day - b.day),
    ramos: [...stored.ramos].sort((a, b) => a.id - b.id),
    plans: [...stored.plans].sort((a, b) => a.id - b.id),
    preview: agencyPreview(agencyInfoFromSettings(current, stored.ramos, stored.plans)),
  }
}
