import { EnvHttpProxyAgent, type Dispatcher } from 'undici'

// Node 22.15 fetch does not automatically honor proxy environment variables.
// Scope the dispatcher to model traffic; never alter the global fetch dispatcher.
export function createModelTransport(source: () => NodeJS.ProcessEnv = () => process.env) {
  let agent: EnvHttpProxyAgent | null = null
  let signature = ''
  const request: typeof fetch = async (input, options) => {
    const env = source()
    const httpProxy = env.http_proxy ?? env.HTTP_PROXY ?? ''
    const httpsProxy = env.https_proxy ?? env.HTTPS_PROXY ?? ''
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    // Local compatible services must remain directly reachable even with a proxy configured.
    if (
      (!httpProxy && !httpsProxy) ||
      ['localhost', '[::1]', '::1'].includes(url.hostname) ||
      /^127\./.test(url.hostname)
    )
      return globalThis.fetch(input, options)
    const noProxy = env.no_proxy ?? env.NO_PROXY ?? ''
    const next = JSON.stringify([httpProxy, httpsProxy, noProxy])
    if (!agent || next !== signature) {
      const previous = agent
      agent = new EnvHttpProxyAgent({ httpProxy, httpsProxy, noProxy })
      signature = next
      if (previous) void previous.close().catch(() => undefined)
    }
    const init: RequestInit & { dispatcher: Dispatcher } = { ...options, dispatcher: agent }
    return globalThis.fetch(input, init)
  }
  return {
    fetch: request,
    async close() {
      const previous = agent
      agent = null
      signature = ''
      await previous?.close()
    },
  }
}
export const modelTransport = createModelTransport()

export function modelConnectionHint(failure: unknown): string {
  const error = failure as { cause?: { code?: string }; code?: string }
  const code = error?.cause?.code ?? error?.code
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT')
    return '连接服务超时，请检查网络及后端 HTTP_PROXY / HTTPS_PROXY 配置。'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return '无法解析服务域名，请检查 API 地址、DNS 或后端代理。'
  if (code === 'ECONNREFUSED') return '服务或代理拒绝连接，请检查地址、端口及代理是否运行。'
  if (
    [
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ].includes(code ?? '')
  )
    return '服务或代理的 HTTPS 证书校验失败，请检查证书和代理配置。'
  return '请检查网络、API 地址和后端代理配置。'
}
