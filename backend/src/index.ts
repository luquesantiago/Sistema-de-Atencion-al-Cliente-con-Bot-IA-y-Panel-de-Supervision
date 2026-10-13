import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from './generated/prisma/client.js'
import { ProcessIncomingMessage } from './application/process-incoming-message.js'
import { ManageCustomers } from './application/manage-customers.js'
import { ManageRequests } from './application/manage-requests.js'
import { createApp } from './http/app.js'
import { config } from './infrastructure/config.js'
import { OpenAiCompatibleClient } from './infrastructure/openai-compatible-client.js'
import { PrismaAgencyInfoSource } from './infrastructure/prisma-agency-info.js'
import { PrismaConversationStore } from './infrastructure/prisma-conversation-store.js'
import { PrismaCustomerRepository } from './infrastructure/prisma-customer-repository.js'
import { PrismaRequestManagementRepository } from './infrastructure/prisma-request-management-repository.js'
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
const processIncomingMessage = new ProcessIncomingMessage(
 customerRepository,
  new PrismaConversationStore(prisma),
  new PrismaAgencyInfoSource(prisma),
  new OpenAiCompatibleClient(config.aiApiUrl, config.aiApiKey, config.aiModel),
  whatsapp,
  () => new Date(),
)
const manageRequests = new ManageRequests(new PrismaRequestManagementRepository(prisma), whatsapp)
const manageCustomers = new ManageCustomers(customerRepository)

createApp(processIncomingMessage, {
  secret: config.whatsappWebhookSecret,
  findPhoneByLid: (lid) => whatsapp.findPhoneByLid(lid),
}, manageRequests, manageCustomers).listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`)
})