import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { RequestManagementError } from '../domain/request-management.js'
import { loginLockMs, sessionDurationMs, type PanelUserRepository, type StoredPanelUser } from '../domain/session.js'
import { ManageSession } from './manage-session.js'

const secret = 'secreto-de-prueba'
const now = new Date('2026-11-03T12:00:00Z')

// Usuarios de prueba, no reales: la clave de todos es «clave-correcta».
let passwordHash = ''
const users: StoredPanelUser[] = [
  { userId: 3, username: 'graciela', name: 'Graciela', lastName: 'Prueba', role: 'operador', active: true },
  { userId: 4, username: 'roberto', name: 'Roberto', lastName: 'Prueba', role: 'administrador', active: true },
  { userId: 5, username: 'baja', name: 'Usuario', lastName: 'De baja', role: 'operador', active: false },
]

class InMemoryPanelUsers implements PanelUserRepository {
  public readonly users = users.map((user) => ({ ...user }))

  public async findByUsername(username: string) {
    const user = this.users.find((candidate) => candidate.username === username)
    return user ? { ...user, passwordHash } : null
  }

  public async findById(userId: number) {
    return this.users.find((candidate) => candidate.userId === userId) ?? null
  }
}

beforeAll(async () => {
  // Costo bajo para que las pruebas no tarden: el de la base es 10.
  passwordHash = await bcrypt.hash('clave-correcta', 4)
})

function session(clock = { time: now.getTime() }) {
  const repository = new InMemoryPanelUsers()
  return { repository, clock, manage: new ManageSession(repository, secret, () => new Date(clock.time)) }
}

async function loginError(manage: ManageSession, username: string, password: string) {
  try {
    await manage.login(username, password)
  } catch (error) {
    if (error instanceof RequestManagementError) return { status: error.statusCode, code: error.code, message: error.message }
    throw error
  }
  throw new Error('El login no falló.')
}

describe('ManageSession.login', () => {
  it('con la clave correcta devuelve el usuario y una sesión de 8 horas', async () => {
    const { manage } = session()
    const result = await manage.login('  Graciela ', 'clave-correcta')
    expect(result.user).toEqual({ userId: 3, username: 'graciela', name: 'Graciela', lastName: 'Prueba', role: 'operador' })
    expect(result.expiresAt).toEqual(new Date(now.getTime() + sessionDurationMs))
    expect(await manage.currentUser(result.token)).toEqual(result.user)
  })

  it.each([
    ['clave incorrecta', 'graciela', 'otra-clave'],
    ['usuario inexistente', 'nadie', 'clave-correcta'],
    ['usuario dado de baja', 'baja', 'clave-correcta'],
    ['usuario vacío', '   ', 'clave-correcta'],
  ])('%s: el mismo error', async (_caso, username, password) => {
    const { manage } = session()
    expect(await loginError(manage, username, password)).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Usuario o clave incorrectos.',
    })
  })

  it('bloquea al usuario después de 5 fallos, aunque después ponga la clave correcta', async () => {
    const { manage, clock } = session()
    for (let i = 0; i < 5; i += 1) await loginError(manage, 'graciela', 'otra-clave')
    const blocked = await loginError(manage, 'graciela', 'clave-correcta')
    expect(blocked.status).toBe(429)
    expect(blocked.code).toBe('TOO_MANY_ATTEMPTS')
    // Otro usuario sigue pudiendo entrar.
    await expect(manage.login('roberto', 'clave-correcta')).resolves.toMatchObject({ user: { userId: 4 } })
    clock.time += loginLockMs
    await expect(manage.login('graciela', 'clave-correcta')).resolves.toMatchObject({ user: { userId: 3 } })
  })

  it('bloquea igual a un usuario que no existe, sin revelarlo', async () => {
    const { manage } = session()
    for (let i = 0; i < 5; i += 1) await loginError(manage, 'nadie', 'x')
    expect((await loginError(manage, 'nadie', 'x')).status).toBe(429)
  })
})

describe('ManageSession.currentUser', () => {
  it('sin token o con un token vencido no hay usuario', async () => {
    const { manage, clock } = session()
    const { token } = await manage.login('graciela', 'clave-correcta')
    expect(await manage.currentUser(undefined)).toBeNull()
    clock.time += sessionDurationMs
    expect(await manage.currentUser(token)).toBeNull()
  })

  it('lee el usuario de la base: una baja corta la sesión y un cambio de rol se aplica', async () => {
    const { manage, repository } = session()
    const { token } = await manage.login('graciela', 'clave-correcta')
    const graciela = repository.users.find((user) => user.username === 'graciela')
    if (!graciela) throw new Error('Falta el usuario de prueba.')
    graciela.role = 'administrador'
    expect(await manage.currentUser(token)).toMatchObject({ role: 'administrador' })
    graciela.active = false
    expect(await manage.currentUser(token)).toBeNull()
  })
})
