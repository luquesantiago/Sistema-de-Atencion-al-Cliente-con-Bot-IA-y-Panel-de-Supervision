import { describe, expect, it } from 'vitest'
import { LoginAttempts, loginLockMs, sessionDurationMs, signSession, verifySession } from './session.js'

const secret = 'secreto-de-prueba'
const now = new Date('2026-11-03T12:00:00Z')

describe('verifySession', () => {
  it('acepta un token válido', () => {
    const token = signSession({ userId: 7, exp: now.getTime() + sessionDurationMs }, secret)
    expect(verifySession(token, secret, now)).toEqual({ userId: 7, exp: now.getTime() + sessionDurationMs })
  })

  it('rechaza un token alterado', () => {
    const token = signSession({ userId: 7, exp: now.getTime() + sessionDurationMs }, secret)
    const [, firma] = token.split('.')
    const otroUsuario = Buffer.from(JSON.stringify({ userId: 1, exp: now.getTime() + sessionDurationMs })).toString('base64url')
    expect(verifySession(`${otroUsuario}.${firma}`, secret, now)).toBeNull()
  })

  it('rechaza un token vencido', () => {
    const token = signSession({ userId: 7, exp: now.getTime() }, secret)
    expect(verifySession(token, secret, now)).toBeNull()
  })

  it('rechaza un token firmado con otro secreto', () => {
    const token = signSession({ userId: 7, exp: now.getTime() + sessionDurationMs }, 'otro-secreto')
    expect(verifySession(token, secret, now)).toBeNull()
  })

  it.each(['', 'sin-punto', 'a.b.c', '.', 'e30.firma'])('rechaza el token mal formado %j', (token) => {
    expect(verifySession(token, secret, now)).toBeNull()
  })

  it('rechaza un payload firmado sin usuario válido', () => {
    const body = Buffer.from(JSON.stringify({ userId: '7', exp: now.getTime() + 1000 })).toString('base64url')
    const valido = signSession({ userId: 7, exp: now.getTime() + 1000 }, secret)
    // Misma forma de firma, pero el payload no es una sesión.
    const firma = valido.split('.')[1]
    expect(verifySession(`${body}.${firma}`, secret, now)).toBeNull()
  })
})

describe('LoginAttempts', () => {
  function attemptsAt(clock: { time: number }) {
    return new LoginAttempts(() => new Date(clock.time))
  }

  it('bloquea al quinto fallo seguido', () => {
    const clock = { time: now.getTime() }
    const attempts = attemptsAt(clock)
    for (let i = 0; i < 4; i += 1) attempts.recordFailure('graciela')
    expect(attempts.isLocked('graciela')).toBe(false)
    attempts.recordFailure('graciela')
    expect(attempts.isLocked('graciela')).toBe(true)
    // El bloqueo es por usuario.
    expect(attempts.isLocked('roberto')).toBe(false)
  })

  it('desbloquea a los 15 minutos y vuelve a dar los 5 intentos', () => {
    const clock = { time: now.getTime() }
    const attempts = attemptsAt(clock)
    for (let i = 0; i < 5; i += 1) attempts.recordFailure('graciela')
    clock.time += loginLockMs - 1
    expect(attempts.isLocked('graciela')).toBe(true)
    clock.time += 1
    expect(attempts.isLocked('graciela')).toBe(false)
    attempts.recordFailure('graciela')
    expect(attempts.isLocked('graciela')).toBe(false)
  })

  it('un acierto reinicia el contador', () => {
    const clock = { time: now.getTime() }
    const attempts = attemptsAt(clock)
    for (let i = 0; i < 4; i += 1) attempts.recordFailure('graciela')
    attempts.recordSuccess('graciela')
    for (let i = 0; i < 4; i += 1) attempts.recordFailure('graciela')
    expect(attempts.isLocked('graciela')).toBe(false)
  })
})
