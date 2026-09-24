function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  aiApiUrl: requiredEnvironment('AI_API_URL'),
  aiApiKey: requiredEnvironment('AI_API_KEY'),
  aiModel: requiredEnvironment('AI_MODEL'),
  whatsappApiUrl: requiredEnvironment('WHATSAPP_API_URL'),
  whatsappApiToken: requiredEnvironment('WHATSAPP_API_TOKEN'),
  whatsappPhoneNumberId: requiredEnvironment('WHATSAPP_PHONE_NUMBER_ID'),
}
