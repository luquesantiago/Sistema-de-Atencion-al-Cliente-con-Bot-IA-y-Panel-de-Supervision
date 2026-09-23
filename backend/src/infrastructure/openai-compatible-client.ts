import type { AiClient, ClassificationContext, ResponseDraft } from '../domain/ai-client.js'
import { messageCategories, type Classification } from '../domain/message.js'

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>
}

const categoryInstructions = `
Clasificá la pregunta exactamente en una de estas categorías:
- UNRELATED: no relacionada con seguros ni la atención de la agencia.
- AUTOMATIC_RESPONSE: relacionada y puede responderse exclusivamente con los datos entregados.
- HUMAN_HANDOFF: relacionada, pero requiere una persona, por ejemplo siniestros, accidentes, cotizaciones, acciones contractuales, datos faltantes o cualquier duda.

Respondé únicamente JSON válido con este formato:
{"category":"UNRELATED|AUTOMATIC_RESPONSE|HUMAN_HANDOFF","intent":"...","confidence":0,"reason":"..."}
Ante la duda elegí HUMAN_HANDOFF.
`

export class OpenAiCompatibleClient implements AiClient {
  public constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  public async classify(context: ClassificationContext): Promise<Classification> {
    const content = await this.complete([
      { role: 'system', content: categoryInstructions },
      {
        role: 'user',
        content: JSON.stringify({
          businessContext: 'Seguros Castaño atiende consultas sobre clientes, pólizas, coberturas, vencimientos y situación de pago. No cotiza, no gestiona siniestros ni ejecuta acciones contractuales mediante el asistente.',
          customer: context.customer,
          question: context.question,
        }),
      },
    ])
    const parsed: unknown = JSON.parse(content)
    if (!isClassification(parsed)) throw new Error('The AI returned an invalid classification')
    return parsed
  }

  public async generateResponse(context: ClassificationContext & { intent: string }): Promise<ResponseDraft> {
    const content = await this.complete([
      { role: 'system', content: 'Redactá una respuesta breve, clara y cordial en español rioplatense. Usá exclusivamente la cartera entregada. No menciones bots ni inteligencia artificial. No inventes datos, no cotices, no informes siniestros y no prometas acciones. Respondé únicamente JSON válido con el formato {"text":"...","claims":["..."]}.' },
      {
        role: 'user',
        content: JSON.stringify({
          businessContext: 'La cartera es la única fuente de verdad.',
          customer: context.customer,
          intent: context.intent,
          question: context.question,
        }),
      },
    ])
    const parsed: unknown = JSON.parse(content)
    if (!isResponseDraft(parsed)) throw new Error('The AI returned an invalid response draft')
    return parsed
  }

  private async complete(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
    const response = await fetch(`${this.apiUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, temperature: 0, messages }),
    })
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const content = getCompletionContent(payload)
    if (!content) throw new Error('AI provider returned an empty response')
    return content
  }
}

function isClassification(value: unknown): value is Classification {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.category === 'string' && messageCategories.includes(candidate.category as Classification['category']) && typeof candidate.intent === 'string' && typeof candidate.confidence === 'number' && candidate.confidence >= 0 && candidate.confidence <= 1 && typeof candidate.reason === 'string'
}

function isResponseDraft(value: unknown): value is ResponseDraft {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.text === 'string' && candidate.text.trim().length > 0 && Array.isArray(candidate.claims) && candidate.claims.every((claim) => typeof claim === 'string')
}

function getCompletionContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const content = (payload as ChatCompletionResponse).choices?.[0]?.message?.content
  return typeof content === 'string' ? content : null
}
