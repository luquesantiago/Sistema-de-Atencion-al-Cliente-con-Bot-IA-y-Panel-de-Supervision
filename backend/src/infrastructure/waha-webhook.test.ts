import { describe, expect, it } from 'vitest'
import { parseWahaWebhook } from './waha-webhook.js'

describe('parseWahaWebhook', () => {
  it('pasa una foto entrante al flujo sin almacenar ni descargar el archivo', () => {
    expect(parseWahaWebhook({
      event: 'message',
      payload: {
        id: 'false_5491123456789@c.us_ABC',
        from: '5491123456789@c.us',
        fromMe: false,
        body: '',
        hasMedia: true,
        mimetype: 'image/jpeg',
      },
    })).toMatchObject({
      kind: 'message',
      message: {
        phone: '5491123456789',
        text: '',
        media: 'image',
      },
    })
  })

  it('sigue ignorando medios que no son imágenes y no traen texto', () => {
    expect(parseWahaWebhook({
      event: 'message',
      payload: {
        id: 'false_5491123456789@c.us_DEF',
        from: '5491123456789@c.us',
        fromMe: false,
        body: '',
        hasMedia: true,
        mimetype: 'audio/ogg',
      },
    })).toMatchObject({ kind: 'ignored', reason: 'sin texto' })
  })
})
