import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { healthResponseSchema } from '../../../../packages/shared/src/schemas.js'
import { app } from '../app.js'

describe('HTTP API contract', () => {
  it.each(['/api/v1/health', '/api/health'])(
    'returns validated health data at %s',
    async (path) => {
      const response = await request(app).get(path).expect(200)
      expect(healthResponseSchema.safeParse(response.body).success).toBe(true)
      expect(response.headers['cache-control']).toBe('no-store')
      expect(['configured', 'not_configured', 'configuration_error']).toContain(
        response.body.data.ai,
      )
    },
  )

  it('returns a structured 404 without echoing arbitrary input', async () => {
    const response = await request(app).get('/api/unknown').expect(404)
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: '请求的接口不存在。' },
    })
  })

  it('handles invalid JSON without exposing implementation details', async () => {
    const response = await request(app)
      .post('/api/unknown')
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400)
    expect(response.body.error.code).toBe('INVALID_JSON')
    expect(response.body).not.toHaveProperty('stack')
  })

  it('rejects oversized request bodies with a structured response', async () => {
    const response = await request(app)
      .post('/api/unknown')
      .send({ text: 'x'.repeat(300_000) })
      .expect(413)
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
