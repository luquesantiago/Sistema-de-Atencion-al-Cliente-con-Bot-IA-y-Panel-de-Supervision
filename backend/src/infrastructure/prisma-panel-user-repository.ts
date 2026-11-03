import type { PrismaClient } from '../generated/prisma/client.js'
import { isPanelRole, type PanelUserRepository, type StoredPanelUser } from '../domain/session.js'

// Usuarios del panel (tabla usuario con su rol). Un rol que el panel no conoce no da acceso.

const userSelect = {
  id_usuario: true,
  nombre_usuario: true,
  nombre: true,
  apellido: true,
  activo: true,
  rol: { select: { nombre: true } },
} as const

type UserRow = {
  id_usuario: number
  nombre_usuario: string
  nombre: string
  apellido: string
  activo: boolean
  rol: { nombre: string }
}

export class PrismaPanelUserRepository implements PanelUserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findByUsername(username: string): Promise<(StoredPanelUser & { passwordHash: string }) | null> {
    const row = await this.prisma.usuario.findUnique({
      where: { nombre_usuario: username },
      select: { ...userSelect, contrasena_hash: true },
    })
    if (!row) return null
    const user = toStoredUser(row)
    return user && { ...user, passwordHash: row.contrasena_hash }
  }

  public async findById(userId: number): Promise<StoredPanelUser | null> {
    const row = await this.prisma.usuario.findUnique({ where: { id_usuario: userId }, select: userSelect })
    return row && toStoredUser(row)
  }
}

function toStoredUser(row: UserRow): StoredPanelUser | null {
  if (!isPanelRole(row.rol.nombre)) return null
  return {
    userId: row.id_usuario,
    username: row.nombre_usuario,
    name: row.nombre,
    lastName: row.apellido,
    role: row.rol.nombre,
    active: row.activo,
  }
}
