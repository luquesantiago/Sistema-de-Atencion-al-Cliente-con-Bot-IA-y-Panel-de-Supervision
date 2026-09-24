import { ProcessIncomingMessage } from './application/process-incoming-message.js'
import { createApp } from './http/app.js'
import { config } from './infrastructure/config.js'
import { customerRepositoryFromEnvironment } from './infrastructure/in-memory-customer-repository.js'
import { OpenAiCompatibleClient } from './infrastructure/openai-compatible-client.js'
import { MetaWhatsAppClient } from './infrastructure/meta-whatsapp-client.js'

const processIncomingMessage = new ProcessIncomingMessage(
  customerRepositoryFromEnvironment(),
  new OpenAiCompatibleClient(config.aiApiUrl, config.aiApiKey, config.aiModel),
  new MetaWhatsAppClient(config.whatsappApiUrl, config.whatsappApiToken, config.whatsappPhoneNumberId),
)

createApp(processIncomingMessage).listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`)
})