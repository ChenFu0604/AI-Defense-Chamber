// Run manually: node node_modules/tsx/dist/cli.mjs tests/preview.local.ts
// Dedicated origin and temporary disk only. No external model or user configuration access.
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer, mergeConfig } from 'vite'
import webConfig from '../apps/web/vite.config.js'
import express from 'express'
import sharp from 'sharp'
import { textPdf } from './fixtures/files.js'
import { createWorkflowFixture } from './fixtures/workflow.js'
const directory = await mkdtemp(join(tmpdir(), 'defense-ui-check-'))
await writeFile(
  join(directory, 'sample-project.pdf'),
  textPdf('Prototype study plan: 12 anonymous interviews. Accuracy remains unverified.'),
)
await sharp(
  Buffer.from(
    '<svg width="720" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="720" height="360" fill="#141824"/><text x="36" y="55" fill="#c7b6ff" font-size="25">TEST EVIDENCE / Prototype architecture</text><g fill="#26243b" stroke="#9d88d5"><rect x="40" y="120" width="160" height="100" rx="16"/><rect x="280" y="120" width="160" height="100" rx="16"/><rect x="520" y="120" width="160" height="100" rx="16"/></g><path d="M200 170H280 M440 170H520" stroke="#8fd5c9" stroke-width="3"/><g fill="#e3e6f2" font-size="20"><text x="75" y="178">Vue UI</text><text x="300" y="178">Node API</text><text x="545" y="178">Storage</text></g><text x="40" y="295" fill="#b7c0d2" font-size="17">Fixed test diagram. This is not externally verified evidence.</text></svg>',
  ),
)
  .png()
  .toFile(join(directory, 'sample-project.png'))
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
