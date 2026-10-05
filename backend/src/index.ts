import { ProcessIncomingMessage } from './application/process-incoming-message.js'
import { createApp } from './http/app.js'
import { config } from './infrastructure/config.js'
import { customerRepositoryFromFixtures } from './infrastructure/in-memory-customer-repository.js'
import { OpenAiCompatibleClient } from './infrastructure/openai-compatible-client.js'
import { WahaWhatsAppClient } from './infrastructure/waha-whatsapp-client.js'

const whatsapp = new WahaWhatsAppClient(config.whatsappApiUrl, config.whatsappApiKey)
const processIncomingMessage = new ProcessIncomingMessage(
  customerRepositoryFromFixtures(),
  new OpenAiCompatibleClient(config.aiApiUrl, config.aiApiKey, config.aiModel),
  whatsapp,
  () => new Date(),
)

createApp(processIncomingMessage, {
  secret: config.whatsappWebhookSecret,
  findPhoneByLid: (lid) => whatsapp.findPhoneByLid(lid),
}).listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`)
})