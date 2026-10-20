import { createServer, type Server } from 'node:http'
import { connect } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createModelTransport, modelConnectionHint } from '../services/model-transport.js'
import { fetchModelList } from '../services/model-list-client.js'
import { createAIClient } from '../services/ai-client.js'
import { z } from 'zod'

const servers: Server[] = []
const transports: ReturnType<typeof createModelTransport>[] = []
async function listen(server: Server) {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return (server.address() as { port: number }).port
}
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const transport of transports.splice(0)) await transport.close()
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
})
describe('model proxy transport', () => {
  it('routes listing and structured completion through the configured proxy', async () => {
    const calls: string[] = [],
      credentials: string[] = []
    const destination = await listen(
      createServer(async (request, response) => {
        calls.push(request.url ?? '')
        credentials.push(request.headers.authorization ?? '')
        for await (const _chunk of request) {
          /* Drain request body. */
        }
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify(
            request.url === '/v1/models'
              ? { data: [{ id: 'proxy-fixture' }] }
              : {
                  model: 'proxy-fixture',
                  choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
                },
          ),
        )
      }),
    )
    let tunnels = 0
    const proxy = createServer()
    proxy.on('connect', (_request, client, head) => {
      tunnels++
      const upstream = connect(destination, '127.0.0.1', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) upstream.write(head)
        client.pipe(upstream)
        upstream.pipe(client)
      })
      client.on('error', () => upstream.destroy())
      upstream.on('error', () => client.destroy())
      client.on('close', () => upstream.destroy())
      upstream.on('close', () => client.destroy())
    })
    const proxyPort = await listen(proxy)
    const transport = createModelTransport(() => ({
      HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
      HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
    }))
    transports.push(transport)
    const config = {
      baseUrl: 'http://models.fixture.invalid/v1',
      apiKey: 'proxy-test-key',
      timeoutMs: 2000,
      model: 'proxy-fixture',
      responseFormat: 'json_schema' as const,
    }
    expect(await fetchModelList(config, transport.fetch)).toEqual({ models: ['proxy-fixture'] })
    expect(
      (
        await createAIClient(config, transport.fetch).generate({
          name: 'proxy_test',
          system: 'JSON',
          user: 'test',
          schema: z.object({ ok: z.literal(true) }),
        })
      ).data.ok,
    ).toBe(true)
    expect(tunnels).toBeGreaterThan(0)
    expect(calls).toEqual(['/v1/models', '/v1/chat/completions'])
    expect(credentials).toEqual(['Bearer proxy-test-key', 'Bearer proxy-test-key'])
  })
  it('bypasses proxies for loopback compatible model services', async () => {
    const port = await listen(createServer((_request, response) => response.end('local-direct')))
    const transport = createModelTransport(() => ({
      HTTP_PROXY: 'http://127.0.0.1:1',
      HTTPS_PROXY: 'http://127.0.0.1:1',
    }))
    transports.push(transport)
    const response = await transport.fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(2000),
    })
    expect(await response.text()).toBe('local-direct')
  })
  it('honors NO_PROXY for destinations outside the explicit loopback shortcuts', async () => {
    const port = await listen(createServer((_request, response) => response.end('no-proxy')))
    const transport = createModelTransport(() => ({
      HTTP_PROXY: 'http://127.0.0.1:1',
      NO_PROXY: '*',
    }))
    transports.push(transport)
    const response = await transport.fetch(`http://[::ffff:127.0.0.1]:${port}`, {
      signal: AbortSignal.timeout(2000),
    })
    expect(await response.text()).toBe('no-proxy')
  })
  it('keeps direct requests unchanged when no proxy is configured', async () => {
    const mocked = vi.fn<typeof fetch>().mockResolvedValue(new Response('direct'))
    vi.stubGlobal('fetch', mocked)
    const transport = createModelTransport(() => ({}))
    transports.push(transport)
    await transport.fetch('https://fixture.invalid/v1/models', { redirect: 'error' })
    expect(mocked).toHaveBeenCalledWith('https://fixture.invalid/v1/models', { redirect: 'error' })
  })
  it('returns safe, actionable network diagnostics without raw upstream secrets', () => {
    expect(
      modelConnectionHint(
        new TypeError('raw-secret', { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }),
      ),
    ).toContain('HTTPS_PROXY')
    expect(modelConnectionHint({ cause: { code: 'ENOTFOUND' } })).toContain('域名')
    expect(modelConnectionHint({ cause: { code: 'ECONNREFUSED' } })).toContain('拒绝连接')
    expect(modelConnectionHint({ cause: { code: 'CERT_HAS_EXPIRED' } })).toContain('证书')
    expect(modelConnectionHint(new Error('raw-secret'))).not.toContain('raw-secret')
  })
})
