import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/prisma/client.js'
import { ProcessIncomingMessage } from './application/process-incoming-message.js'
import { ManageCustomers } from './application/manage-customers.js'
import { ManageCustomerEdits } from './application/manage-customer-edits.js'
import { ManageInbox } from './application/manage-inbox.js'
import { ManageRequests } from './application/manage-requests.js'
import { createApp } from './http/app.js'
import { config } from './infrastructure/config.js'
import { OpenAiCompatibleClient } from './infrastructure/openai-compatible-client.js'
import { PrismaAgencyInfoSource } from './infrastructure/prisma-agency-info.js'
import { PrismaConversationStore } from './infrastructure/prisma-conversation-store.js'
import { PrismaCustomerRepository } from './infrastructure/prisma-customer-repository.js'
import { PrismaCustomerEditRepository } from './infrastructure/prisma-customer-edit-repository.js'
import { findTestOperatorId } from './infrastructure/prisma-case-closing.js'
import { PrismaInboxRepository } from './infrastructure/prisma-inbox-repository.js'
import { PrismaRequestManagementRepository } from './infrastructure/prisma-request-management-repository.js'
import { PrismaDashboardMetricsRepository } from './infrastructure/prisma-dashboard-metrics-repository.js'
import { WahaWhatsAppClient } from './infrastructure/waha-whatsapp-client.js'

const adapter = new PrismaMariaDb({
  host: config.databaseHost,
  port: config.databasePort,
  user: config.databaseUser,
  password: config.databasePassword,
  database: config.databaseName,
  allowPublicKeyRetrieval: true,
})
const prisma = new PrismaClient({ adapter })
const whatsapp = new WahaWhatsAppClient(config.whatsappApiUrl, config.whatsappApiKey)
const customerRepository = new PrismaCustomerRepository(prisma)
// Número bloqueado desde la bandeja: el asistente no atiende ni guarda sus mensajes.
const phoneBlocked = async (phone: string): Promise<boolean> => {
  const row = await prisma.telefono.findUnique({ where: { numero: phone }, select: { bloqueado: true } })
  return row?.bloqueado ?? false
}
const processIncomingMessage = new ProcessIncomingMessage(
 customerRepository,
  new PrismaConversationStore(prisma),
  new PrismaAgencyInfoSource(prisma),
  new OpenAiCompatibleClient(config.aiApiUrl, config.aiApiKey, config.aiModel),
  whatsapp,
  () => new Date(),
  phoneBlocked,
)
const manageRequests = new ManageRequests(new PrismaRequestManagementRepository(prisma), whatsapp)
const manageCustomers = new ManageCustomers(customerRepository)
const manageCustomerEdits = new ManageCustomerEdits(new PrismaCustomerEditRepository(prisma), customerRepository)
const manageInbox = new ManageInbox(new PrismaInboxRepository(prisma), whatsapp)
const dashboardMetricsRepository = new PrismaDashboardMetricsRepository(prisma)
// Quién actúa desde el panel: el usuario de prueba operador hasta el login del Parcial 2.
const resolvePanelActor = async () => ({ userId: await findTestOperatorId(prisma) })

createApp(processIncomingMessage, {
  secret: config.whatsappWebhookSecret,
  findPhoneByLid: (lid) => whatsapp.findPhoneByLid(lid),
}, manageRequests, manageCustomers, manageCustomerEdits, manageInbox, resolvePanelActor, dashboardMetricsRepository).listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`)
})