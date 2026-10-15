import type { Prisma } from '../generated/prisma/client.js'

// Tomar, cerrar y sacar del silencio, compartido por las decisiones de Trámites y la Bandeja
// de Atención (change bandeja-atender-casos, decisión 4).

type CaseClient = Pick<Prisma.TransactionClient, 'usuario'>

// Quién actúa desde el panel mientras no haya autenticación: el usuario de prueba operador.
export async function findTestOperatorId(client: CaseClient): Promise<number> {
  const operator = await client.usuario.findFirst({
    where: { nombre_usuario: 'operador', activo: true, rol: { is: { nombre: 'operador' } } },
    select: { id_usuario: true },
  })
  if (!operator) throw new Error('No está configurado el usuario de prueba operador.')
  return operator.id_usuario
}

// El responsable pasa a ser userId; fecha_toma registra la primera toma y no cambia.
export async function takeCase(
  transaction: Prisma.TransactionClient,
  caseRecord: { id_caso: number; fecha_toma: Date | null },
  userId: number,
  takenAt: Date,
): Promise<void> {
  await transaction.caso.update({
    where: { id_caso: caseRecord.id_caso },
    data: { id_usuario_asignado: userId, fecha_toma: caseRecord.fecha_toma ?? takenAt },
  })
}

export async function closeCase(
  transaction: Prisma.TransactionClient,
  caseRecord: { id_caso: number; fecha_toma: Date | null },
  userId: number,
  closedAt: Date,
): Promise<void> {
  await transaction.caso.update({
    where: { id_caso: caseRecord.id_caso },
    data: {
      id_usuario_asignado: userId,
      fecha_toma: caseRecord.fecha_toma ?? closedAt,
      fecha_cierre: closedAt,
    },
  })
}

// Contrato del cierre de casos: al cerrar un caso, la conversación abierta deja de estar en
// silencio, siempre (decisión de Santiago del 15/10/2026). Mientras hay un caso derivado
// abierto el asistente no deriva otro, así que no queda otro derivado sin cerrar.
export async function releaseSilence(transaction: Prisma.TransactionClient, conversationId: number): Promise<void> {
  await transaction.conversacion.updateMany({
    where: { id_conversacion: conversationId, fecha_fin: null },
    data: { asistente_suspendido: false },
  })
}
