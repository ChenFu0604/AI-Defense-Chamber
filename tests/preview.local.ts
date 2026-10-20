// Run manually: node node_modules/tsx/dist/cli.mjs tests/preview.local.ts
// Dedicated origin and temporary disk only. No external model or user configuration access.
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, mergeConfig } from 'vite'
import webConfig from '../apps/web/vite.config.js'
import express from 'express'
import { createWorkflowFixture } from './fixtures/workflow.js'
const directory = await mkdtemp(join(tmpdir(), 'defense-ui-check-'))
const fixture = createWorkflowFixture(directory)
const app = express()
app.get(['/api/health', '/api/v1/health'], (_req, res) =>
  res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'ai-defense-chamber',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      ai: 'not_configured',
    },
  }),
)
app.use(fixture.app)
app.listen(3101, '127.0.0.1', () =>
  console.log('Isolated fixture API: 3101; storage: ' + directory),
)
const vite = await createServer(
  mergeConfig(webConfig, {
    root: resolve('apps/web'),
    configFile: false,
    server: {
      host: '127.0.0.1',
      port: 5174,
      proxy: { '/api': { target: 'http://127.0.0.1:3101', changeOrigin: true } },
    },
    plugins: [
      {
        name: 'test-data-banner',
        transformIndexHtml: () => [
          {
            tag: 'div',
            attrs: {
              style:
                'position:sticky;top:0;z-index:100;background:#61451d;color:#fff;text-align:center;font:13px sans-serif;padding:8px',
            },
            children: '隔离验收环境 · 所有 AI 响应与评分均为固定测试数据 · 未调用真实模型',
            injectTo: 'body-prepend',
          },
        ],
      },
    ],
  }),
)
await vite.listen()
console.log('UI acceptance: http://127.0.0.1:5174 (fixed test responses only)')
