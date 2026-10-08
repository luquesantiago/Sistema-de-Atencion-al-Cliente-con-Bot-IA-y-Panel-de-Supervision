import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import type { AgencyInfo, AgencyInfoSource } from '../domain/agency-info.js'

// Claves de parametro_configuracion con los datos de contacto de la agencia (migración
// 20261007235643_informacion_agencia): son de ejemplo hasta que la agencia informe los reales.
export const agencyInfoKeys = { address: 'direccion_agencia', phone: 'telefono_agencia' } as const

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

export class PrismaAgencyInfoSource implements AgencyInfoSource {
  public constructor(private readonly prisma: PrismaClient) {}

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
    hours: rows.hours.map((row) => ({ day: row.dia_semana, opens: timeOf(row.hora_apertura), closes: timeOf(row.hora_cierre) })),
  }
}
