function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseHost: requiredEnvironment('DATABASE_HOST'),
  databasePort: Number(requiredEnvironment('DATABASE_PORT')),
  databaseUser: requiredEnvironment('DATABASE_USER'),
  databasePassword: requiredEnvironment('DATABASE_PASSWORD'),
  databaseName: requiredEnvironment('DATABASE_NAME'),
  aiApiUrl: requiredEnvironment('AI_API_URL'),
  aiApiKey: requiredEnvironment('AI_API_KEY'),
  aiModel: requiredEnvironment('AI_MODEL'),
  whatsappApiUrl: requiredEnvironment('WHATSAPP_API_URL'),
  whatsappApiKey: requiredEnvironment('WHATSAPP_API_KEY'),
  whatsappWebhookSecret: requiredEnvironment('WHATSAPP_WEBHOOK_SECRET'),
  panelSessionSecret: requiredEnvironment('PANEL_SESSION_SECRET'),
  // La cookie de sesión lleva Secure solo en producción: en desarrollo el panel corre por HTTP.
  secureCookies: process.env.NODE_ENV === 'production',
}
