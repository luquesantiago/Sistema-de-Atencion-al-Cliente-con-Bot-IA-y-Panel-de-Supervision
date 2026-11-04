/**
 * Configuración de la información de la agencia (solo administrador). Viene de
 * `/api/configuracion/agencia`; el backend valida todo y responde 403 a un
 * operador.
 */
import { leer } from './respuesta'

export type CampoTexto = 'address' | 'phone' | 'assistancePhone' | 'email' | 'web' | 'paymentMethods'

/** De ejemplo (la agencia no informó el real), sin cargar, o definitivo (null). */
export type MarcaDato = 'example' | 'missing' | null

/** Un día con atención: 1 = lunes … 7 = domingo, horas de Argentina en HH:MM. */
export type HorarioDia = { day: number; opens: string; closes: string }

export type ItemCatalogo = { id: number; name: string; active: boolean }

/** Lo que contestaría el asistente, sin la redacción de la IA. null: deriva. */
export type VistaPrevia = {
  agencyInfo: string | null
  assistance: string | null
  paymentMethods: string | null
}

export type ConfiguracionAgencia = Record<CampoTexto, string | null> & {
  marks: Record<CampoTexto, MarcaDato>
  hours: HorarioDia[]
  ramos: ItemCatalogo[]
  plans: ItemCatalogo[]
  preview: VistaPrevia
}

/** Lo que se guarda: los textos (null = sin cargar), los días con atención y lo activo. */
export type CambiosConfiguracion = Record<CampoTexto, string | null> & {
  hours: HorarioDia[]
  activeRamoIds: number[]
  activePlanIds: number[]
}

const ruta = '/api/configuracion/agencia'

function enviarJson(method: string, datos: CambiosConfiguracion, signal?: AbortSignal): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos), signal }
}

export async function obtenerConfiguracion(signal?: AbortSignal): Promise<ConfiguracionAgencia> {
  return leer<ConfiguracionAgencia>(await fetch(ruta, { signal, cache: 'no-store' }))
}

export async function guardarConfiguracion(datos: CambiosConfiguracion): Promise<ConfiguracionAgencia> {
  return leer<ConfiguracionAgencia>(await fetch(ruta, enviarJson('PUT', datos)))
}

/** Arma la vista previa de un borrador sin guardar nada. */
export async function previsualizarConfiguracion(datos: CambiosConfiguracion, signal?: AbortSignal): Promise<VistaPrevia> {
  return leer<VistaPrevia>(await fetch(`${ruta}/vista-previa`, enviarJson('POST', datos, signal)))
}
