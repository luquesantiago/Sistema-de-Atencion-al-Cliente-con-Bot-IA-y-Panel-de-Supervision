import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import type { AgencyInfo, AgencyInfoSource } from '../domain/agency-info.js'
import {
  agencyTextFields,
  settingDescription,
  type AgencySettings,
  type AgencySettingsRepository,
  type StoredAgencySettings,
} from '../domain/agency-settings.js'

// Claves de parametro_configuracion con los datos de la agencia. La dirección y el teléfono
// (migración 20261007235643_informacion_agencia) son de ejemplo hasta que la agencia informe los
// reales; los otros cuatro (migración 20261103180000_configuracion_agencia) arrancan vacíos.
export const agencyInfoKeys = {
  address: 'direccion_agencia',
  phone: 'telefono_agencia',
  assistancePhone: 'telefono_asistencia',
  email: 'email_agencia',
  web: 'web_agencia',
  paymentMethods: 'medios_pago',
} as const

export type AgencyInfoRows = {
  ramos: Array<{ id_ramo: number; nombre: string; activo: boolean }>
  plans: Array<{ id_plan: number; nombre: string; activo: boolean }>
  hours: Array<{ dia_semana: number; hora_apertura: Date; hora_cierre: Date }>
  settings: Array<{ clave: string; valor: string }>
}

// Error sin datos de la base: el manejador de errores de app.ts lo vuelca al log.
export class AgencyInfoError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'AgencyInfoError'
  }
}

export class PrismaAgencyInfoSource implements AgencyInfoSource, AgencySettingsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  // Lo que ve el administrador en Configuración: también los ramos y los planes inactivos.
  public async readSettings(): Promise<StoredAgencySettings> {
    return readStoredSettings(this.prisma)
  }

  // Todo junto o nada (change configuracion-agencia, decisión 2): los parámetros con su
  // descripción, el horario de cada día y qué ramos y planes quedan activos.
  public async saveSettings(settings: AgencySettings): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const previous = await readStoredSettings(transaction)
      for (const field of agencyTextFields) {
        const next = settings[field]
        await transaction.parametro_configuracion.upsert({
          where: { clave: agencyInfoKeys[field] },
          create: {
            clave: agencyInfoKeys[field],
            valor: next ?? '',
            descripcion: settingDescription(field, { value: null, description: null }, next),
          },
          update: { valor: next ?? '', descripcion: settingDescription(field, previous.texts[field], next) },
        })
      }
      const days = settings.hours.map((day) => day.day)
      await transaction.horario_atencion.deleteMany({ where: { dia_semana: { notIn: days } } })
      for (const day of settings.hours) {
        const hours = { hora_apertura: timeValue(day.opens), hora_cierre: timeValue(day.closes) }
        await transaction.horario_atencion.upsert({
          where: { dia_semana: day.day },
          create: { dia_semana: day.day, ...hours },
          update: hours,
        })
      }
      await transaction.ramo.updateMany({ where: { id_ramo: { in: settings.activeRamoIds } }, data: { activo: true } })
      await transaction.ramo.updateMany({ where: { id_ramo: { notIn: settings.activeRamoIds } }, data: { activo: false } })
      await transaction.plan.updateMany({ where: { id_plan: { in: settings.activePlanIds } }, data: { activo: true } })
      await transaction.plan.updateMany({ where: { id_plan: { notIn: settings.activePlanIds } }, data: { activo: false } })
    })
  }

  public async read(): Promise<AgencyInfo> {
    try {
      const [ramos, plans, hours, settings] = await Promise.all([
        this.prisma.ramo.findMany({ select: { id_ramo: true, nombre: true, activo: true } }),
        this.prisma.plan.findMany({ select: { id_plan: true, nombre: true, activo: true } }),
        this.prisma.horario_atencion.findMany({ select: { dia_semana: true, hora_apertura: true, hora_cierre: true } }),
        this.prisma.parametro_configuracion.findMany({
          where: { clave: { in: Object.values(agencyInfoKeys) } },
          select: { clave: true, valor: true },
        }),
      ])
      return agencyInfoFromRows({ ramos, plans, hours, settings })
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? ` (${error.code})` : ''
      throw new AgencyInfoError(`No se pudo leer la información de la agencia${code}`)
    }
  }
}

type SettingsClient = Pick<Prisma.TransactionClient, 'ramo' | 'plan' | 'horario_atencion' | 'parametro_configuracion'>

async function readStoredSettings(client: SettingsClient): Promise<StoredAgencySettings> {
  const [ramos, plans, hours, settings] = await Promise.all([
    client.ramo.findMany({ select: { id_ramo: true, nombre: true, activo: true }, orderBy: { id_ramo: 'asc' } }),
    client.plan.findMany({ select: { id_plan: true, nombre: true, activo: true }, orderBy: { id_plan: 'asc' } }),
    client.horario_atencion.findMany({ select: { dia_semana: true, hora_apertura: true, hora_cierre: true }, orderBy: { dia_semana: 'asc' } }),
    client.parametro_configuracion.findMany({
      where: { clave: { in: Object.values(agencyInfoKeys) } },
      select: { clave: true, valor: true, descripcion: true },
    }),
  ])
  const text = (key: string) => {
    const row = settings.find((setting) => setting.clave === key)
    return { value: row?.valor.trim() || null, description: row?.descripcion ?? null }
  }
  return {
    texts: {
      address: text(agencyInfoKeys.address),
      phone: text(agencyInfoKeys.phone),
      assistancePhone: text(agencyInfoKeys.assistancePhone),
      email: text(agencyInfoKeys.email),
      web: text(agencyInfoKeys.web),
      paymentMethods: text(agencyInfoKeys.paymentMethods),
    },
    hours: hours.map((row) => ({ day: row.dia_semana, opens: timeOf(row.hora_apertura), closes: timeOf(row.hora_cierre) })),
    ramos: ramos.map((row) => ({ id: row.id_ramo, name: row.nombre, active: row.activo })),
    plans: plans.map((row) => ({ id: row.id_plan, name: row.nombre, active: row.activo })),
  }
}

// HH:MM de Argentina como el TIME de la columna: una fecha del 01/01/1970 en UTC.
function timeValue(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00Z`)
}

// Una columna TIME llega como una fecha del 01/01/1970 en UTC: la hora y los minutos UTC son
// los de la columna, que ya son de Argentina (comentario de horario_atencion).
function timeOf(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`
}

// Arma la información de la agencia con las filas de la base: deja afuera los ramos y los
// planes cargados como inactivos y los ordena por id. Un parámetro ausente o vacío da null.
export function agencyInfoFromRows(rows: AgencyInfoRows): AgencyInfo {
  const setting = (key: string): string | null => rows.settings.find((row) => row.clave === key)?.valor.trim() || null
  return {
    ramos: rows.ramos.filter((row) => row.activo).sort((a, b) => a.id_ramo - b.id_ramo).map((row) => row.nombre),
    plans: rows.plans.filter((row) => row.activo).sort((a, b) => a.id_plan - b.id_plan).map((row) => row.nombre),
    address: setting(agencyInfoKeys.address),
    phone: setting(agencyInfoKeys.phone),
    assistancePhone: setting(agencyInfoKeys.assistancePhone),
    email: setting(agencyInfoKeys.email),
    web: setting(agencyInfoKeys.web),
    paymentMethods: setting(agencyInfoKeys.paymentMethods),
    hours: rows.hours.map((row) => ({ day: row.dia_semana, opens: timeOf(row.hora_apertura), closes: timeOf(row.hora_cierre) })),
  }
}
