import { createHmac, timingSafeEqual } from 'node:crypto'

// Sesión del panel (RF-SUP-07; change acceso-por-rol, decisiones 1 y 4). El token es
// base64url(payload).base64url(hmac): no hay tabla de sesiones, y la firma impide fabricar
// o alterar una. El usuario, su rol y si está activo se leen de la base en cada pedido.

export const sessionDurationMs = 8 * 60 * 60 * 1000
export const maxFailedLogins = 5
export const loginLockMs = 15 * 60 * 1000

export type SessionPayload = { userId: number; exp: number }

export type PanelRole = 'administrador' | 'operador'

// El usuario con la sesión iniciada, como lo lee el backend de la base en cada pedido.
export type PanelUser = {
  userId: number
  username: string
  name: string
  lastName: string
  role: PanelRole
}

// Un usuario de la tabla usuario, activo o no. La clave solo viaja en la búsqueda del login.
export type StoredPanelUser = PanelUser & { active: boolean }

export interface PanelUserRepository {
  // El nombre de usuario llega normalizado (sin espacios y en minúsculas).
  findByUsername(username: string): Promise<(StoredPanelUser & { passwordHash: string }) | null>
  findById(userId: number): Promise<StoredPanelUser | null>
}

export function isPanelRole(value: unknown): value is PanelRole {
  return value === 'administrador' || value === 'operador'
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signature(body, secret)}`
}

// null si el token está mal formado, la firma no coincide o ya venció.
export function verifySession(token: string, secret: string, now: Date): SessionPayload | null {
  const [body, received, ...rest] = token.split('.')
  if (body === undefined || received === undefined || rest.length > 0) return null
  const expected = Buffer.from(signature(body, secret))
  const actual = Buffer.from(received)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!isSessionPayload(payload) || payload.exp <= now.getTime()) return null
  return payload
}

function signature(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null || !('userId' in value) || !('exp' in value)) return false
  return typeof value.userId === 'number' && Number.isSafeInteger(value.userId) && value.userId > 0
    && typeof value.exp === 'number' && Number.isFinite(value.exp)
}

// Intentos fallidos por usuario normalizado: 5 seguidos lo bloquean 15 minutos y un acierto
// reinicia la cuenta. Vive en memoria: un reinicio la borra. Es una defensa básica, no un
// registro de seguridad.
export class LoginAttempts {
  private readonly failures = new Map<string, { count: number; lockedUntil: number | null }>()

  constructor(private readonly now: () => Date) {}

  isLocked(username: string): boolean {
    const entry = this.failures.get(username)
    if (!entry?.lockedUntil) return false
    if (entry.lockedUntil > this.now().getTime()) return true
    // Pasó el bloqueo: vuelve a tener los 5 intentos.
    this.failures.delete(username)
    return false
  }

  recordFailure(username: string): void {
    const count = (this.failures.get(username)?.count ?? 0) + 1
    this.failures.set(username, {
      count,
      lockedUntil: count >= maxFailedLogins ? this.now().getTime() + loginLockMs : null,
    })
  }

  recordSuccess(username: string): void {
    this.failures.delete(username)
  }
}
