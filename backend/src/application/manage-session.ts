import bcrypt from 'bcryptjs'
import { RequestManagementError } from '../domain/request-management.js'
import {
  LoginAttempts,
  sessionDurationMs,
  signSession,
  verifySession,
  type PanelUser,
  type PanelUserRepository,
  type StoredPanelUser,
} from '../domain/session.js'

// Inicio de sesión del panel contra la tabla usuario (RF-SUP-07; change acceso-por-rol, decisión 4).

// Hash bcrypt de una clave al azar que nadie conoce: se compara contra él cuando el usuario no
// existe, así el tiempo de respuesta no revela si existe.
const unknownUserHash = '$2b$10$5/DRF2KROWv.IwgB/WKpHOwLQFQ/EnSoa2McP38DXf7vymk0yvldS'

export type LoginResult = { token: string; user: PanelUser; expiresAt: Date }

export class ManageSession {
  private readonly attempts: LoginAttempts

  public constructor(
    private readonly repository: PanelUserRepository,
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.attempts = new LoginAttempts(clock)
  }

  // El mismo error para un usuario que no existe, una clave incorrecta o un usuario dado de baja.
  public async login(username: string, password: string): Promise<LoginResult> {
    const normalized = username.trim().toLowerCase()
    if (this.attempts.isLocked(normalized)) {
      throw new RequestManagementError(429, 'TOO_MANY_ATTEMPTS', 'Demasiados intentos. Probá de nuevo en unos minutos.')
    }
    const stored = normalized ? await this.repository.findByUsername(normalized) : null
    const matches = await bcrypt.compare(password, stored?.passwordHash ?? unknownUserHash)
    if (!stored || !stored.active || !matches) {
      this.attempts.recordFailure(normalized)
      throw new RequestManagementError(401, 'INVALID_CREDENTIALS', 'Usuario o clave incorrectos.')
    }
    this.attempts.recordSuccess(normalized)
    const expiresAt = new Date(this.clock().getTime() + sessionDurationMs)
    const user = toPanelUser(stored)
    return { token: signSession({ userId: user.userId, exp: expiresAt.getTime() }, this.secret), user, expiresAt }
  }

  // null si no hay token, no es válido, venció, o el usuario ya no existe o está dado de baja.
  // El rol se lee de la base en cada pedido: un cambio de rol se aplica en el pedido siguiente.
  public async currentUser(token: string | undefined): Promise<PanelUser | null> {
    if (!token) return null
    const payload = verifySession(token, this.secret, this.clock())
    if (!payload) return null
    const stored = await this.repository.findById(payload.userId)
    if (!stored || !stored.active) return null
    return toPanelUser(stored)
  }
}

// Solo lo que el panel necesita: nunca el hash de la clave.
function toPanelUser(stored: StoredPanelUser): PanelUser {
  return { userId: stored.userId, username: stored.username, name: stored.name, lastName: stored.lastName, role: stored.role }
}
