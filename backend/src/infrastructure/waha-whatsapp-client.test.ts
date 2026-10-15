import { describe, expect, it } from 'vitest'
import { maxImageBytes, WahaWhatsAppClient } from './waha-whatsapp-client.js'

const phone = '5491100000000'
const ref = 'false_99000000000000@lid_ABC123'
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

type Step = { status: number; json?: unknown; body?: Uint8Array; headers?: Record<string, string> }

// Responde en orden: primero el mensaje con media.url, después el archivo.
function fakeFetch(steps: Step[], urls: string[] = []): typeof fetch {
  return async (input) => {
    urls.push(String(input))
    const step = steps.shift()
    if (!step) throw new Error('pedido inesperado')
    const body = step.json === undefined ? step.body ?? null : JSON.stringify(step.json)
    return new Response(body, { status: step.status, ...(step.headers ? { headers: step.headers } : {}) })
  }
}

function message(url = 'http://localhost:3000/api/files/seguros-castano/ABC123.jpeg') {
  return { status: 200, json: { id: ref, hasMedia: true, media: { mimetype: 'image/jpeg', url } } }
}

function clientWith(fetchImpl: typeof fetch) {
  return new WahaWhatsAppClient('http://waha:3000/', 'clave-de-prueba', fetchImpl)
}

describe('downloadImage', () => {
  it('pide el mensaje con downloadMedia y lee el archivo desde la URL de WAHA configurada', async () => {
    const urls: string[] = []
    const client = clientWith(fakeFetch([message(), { status: 200, body: jpeg, headers: { 'content-type': 'image/jpeg' } }], urls))

    const image = await client.downloadImage(ref, phone)

    expect(image?.mimeType).toBe('image/jpeg')
    expect(Array.from(image?.data ?? [])).toEqual(Array.from(jpeg))
    expect(urls).toEqual([
      `http://waha:3000/api/seguros-castano/chats/${encodeURIComponent(`${phone}@c.us`)}/messages/${encodeURIComponent(ref)}?downloadMedia=true`,
      'http://waha:3000/api/files/seguros-castano/ABC123.jpeg',
    ])
  })

  it('un mensaje que WAHA no encuentra da null', async () => {
    await expect(clientWith(fakeFetch([{ status: 404, json: {} }])).downloadImage(ref, phone)).resolves.toBeNull()
  })

  it('un mensaje sin media da null sin pedir ningún archivo', async () => {
    const urls: string[] = []
    const client = clientWith(fakeFetch([{ status: 200, json: { id: ref, hasMedia: false, media: null } }], urls))
    await expect(client.downloadImage(ref, phone)).resolves.toBeNull()
    expect(urls).toHaveLength(1)
  })

  it('una media.url fuera de /api/files da null', async () => {
    const urls: string[] = []
    const client = clientWith(fakeFetch([message('http://otro-host/secreto')], urls))
    await expect(client.downloadImage(ref, phone)).resolves.toBeNull()
    expect(urls).toHaveLength(1)
  })

  it('un archivo que ya se borró da null', async () => {
    const client = clientWith(fakeFetch([message(), { status: 404, body: new Uint8Array() }]))
    await expect(client.downloadImage(ref, phone)).resolves.toBeNull()
  })

  it('un archivo que no es una imagen aceptada da null', async () => {
    const client = clientWith(fakeFetch([message(), { status: 200, body: jpeg, headers: { 'content-type': 'application/pdf' } }]))
    await expect(client.downloadImage(ref, phone)).resolves.toBeNull()
  })

  it('una imagen de más de 10 MB da null', async () => {
    const big = new Uint8Array(maxImageBytes + 1)
    const client = clientWith(fakeFetch([message(), { status: 200, body: big, headers: { 'content-type': 'image/png' } }]))
    await expect(client.downloadImage(ref, phone)).resolves.toBeNull()
  })

  it('el 500 de GOWS por un mensaje que ya no está da null', async () => {
    const gone = { statusCode: 500, exception: { details: 'error getting message by id ABC123: not found' } }
    await expect(clientWith(fakeFetch([{ status: 500, json: gone }])).downloadImage(ref, phone)).resolves.toBeNull()
  })

  it('un error de WAHA lanza', async () => {
    await expect(clientWith(fakeFetch([{ status: 500, json: {} }])).downloadImage(ref, phone)).rejects.toThrow('HTTP 500')
  })
})
