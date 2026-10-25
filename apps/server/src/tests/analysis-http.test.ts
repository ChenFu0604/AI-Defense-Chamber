import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { createAIClient } from '../services/ai-client.js'
import { createProjectAnalysisService } from '../services/project-analysis-service.js'
import { analysisProject, validAnalysisOutput } from '../../../../tests/fixtures/analysis.js'

it('exercises the real HTTP transport against a local model-protocol test server', async () => {
  let authorization = ''
  let receivedBody = ''
  const upstream = createServer(async (incoming, response) => {
    authorization = incoming.headers.authorization ?? ''
    const parts: Buffer[] = []
    for await (const part of incoming) parts.push(Buffer.from(part))
    receivedBody = Buffer.concat(parts).toString('utf8')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        model: 'local-protocol-fixture',
        choices: [
          { message: { content: JSON.stringify(validAnalysisOutput()) }, finish_reason: 'stop' },
        ],
      }),
    )
  })
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  try {
    const port = (upstream.address() as AddressInfo).port
    const client = createAIClient({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      model: 'test-model',
      apiKey: 'local-test-key',
      timeoutMs: 2000,
      responseFormat: 'json_schema',
    })
    const app = createApp({ workspace: false, analyzeProject: createProjectAnalysisService(client) })
    const result = await request(app)
      .post('/api/projects/analyze')
      .send({ project: analysisProject })
      .expect(200)
    expect(result.body.data.model).toBe('local-protocol-fixture')
    expect(authorization).toBe('Bearer local-test-key')
    expect(JSON.parse(receivedBody).response_format.json_schema.strict).toBe(true)
    expect(JSON.stringify(result.body)).not.toContain('local-test-key')
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  }
})
