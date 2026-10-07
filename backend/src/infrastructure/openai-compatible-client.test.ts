import { describe, expect, it } from 'vitest'
import type { CustomerStatus } from '../domain/ai-client.js'
import { intents } from '../domain/intent.js'
import { OpenAiCompatibleClient } from './openai-compatible-client.js'

type RecordedRequest = { url: string; body: unknown }

function fakeFetch(status: number, payload: unknown, requests: RecordedRequest[] = []): typeof fetch {
  return async (input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify(payload), { status })
  }
}

function completion(content: unknown) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] }
}

function clientWith(fetchImpl: typeof fetch) {
  return new OpenAiCompatibleClient('https://api.groq.com/openai/v1/', 'clave-de-prueba', 'openai/gpt-oss-20b', fetchImpl)
}

describe('classifyIntent', () => {
  it('pide salida estructurada estricta con todas las intenciones', async () => {
    const requests: RecordedRequest[] = []
    const client = clientWith(fakeFetch(200, completion({ intencion: 'vencimiento' }), requests))

    await expect(client.classifyIntent('¿cuándo vence?')).resolves.toBe('vencimiento')

    expect(requests[0]?.url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(requests[0]?.body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema: {
            type: 'object',
            properties: { intencion: { type: 'string', enum: [...intents] } },
            required: ['intencion'],
            additionalProperties: false,
          },
        },
      },
    })
  })

  it('lanza si el valor no está en la lista', async () => {
    await expect(clientWith(fakeFetch(200, completion({ intencion: 'alta de conductor' }))).classifyIntent('x')).rejects.toThrow()
  })

  it('lanza con un 429', async () => {
    await expect(clientWith(fakeFetch(429, { error: 'rate limit' })).classifyIntent('x')).rejects.toThrow('HTTP 429')
  })

  it('lanza si la respuesta no trae choices', async () => {
    await expect(clientWith(fakeFetch(200, {})).classifyIntent('x')).rejects.toThrow()
  })
})

describe('classifyCustomerStatus', () => {
  it.each<[CustomerStatus, string]>([
    ['NEW_CUSTOMER', 'Soy nuevo cliente'],
    ['EXISTING_CUSTOMER', 'Sí, ya soy cliente'],
    ['UNRELATED', '¿a qué hora atienden?'],
  ])('devuelve %s en una salida estructurada y contextualizada', async (status, reply) => {
    const requests: RecordedRequest[] = []
    const client = clientWith(fakeFetch(200, completion({ tipo: status }), requests))

    await expect(client.classifyCustomerStatus(reply)).resolves.toBe(status)

    const body = requests[0]?.body as {
      messages: Array<{ role: string; content: string }>
      response_format: { json_schema: { schema: { properties: { tipo: { enum: string[] } } } } }
    }
    expect(body.messages[0]?.content).toContain('¿ya es cliente de Seguros Castaño o sería un cliente nuevo?')
    expect(body.messages[0]?.content).toContain('«soy nuevo» o «soy nuevo cliente»')
    expect(body.messages[0]?.content).toContain('una respuesta «sí» o «si» sola confirma')
    expect(body.response_format.json_schema.schema.properties.tipo.enum).toEqual([
      'NEW_CUSTOMER',
      'EXISTING_CUSTOMER',
      'UNRELATED',
    ])
  })

})

describe('rewrite', () => {
  it('pide no decir que es una persona y devuelve el texto', async () => {
    const requests: RecordedRequest[] = []
    const client = clientWith(fakeFetch(200, completion({ texto: 'Hola Ana.' }), requests))

    await expect(client.rewrite({ template: 'Ana.', question: null })).resolves.toBe('Hola Ana.')

    const body = requests[0]?.body as { messages: Array<{ role: string; content: string }> }
    expect(body.messages[0]?.content).toContain('no digas que sos una persona')
    expect(body).toMatchObject({ response_format: { json_schema: { strict: true } } })
  })

  it('lanza si el texto viene vacío', async () => {
    await expect(clientWith(fakeFetch(200, completion({ texto: ' ' }))).rewrite({ template: 'x', question: null })).rejects.toThrow()
  })
})
