import { app } from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.PORT, env.HOST, () => {
  console.info(`AI 答辩压力舱 API: http://${env.HOST}:${env.PORT}`)
})

server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `端口 ${env.PORT} 已被占用。请修改 apps/server/.env 中的 PORT。`
      : '服务启动失败，请检查主机和端口配置。',
  )
  process.exitCode = 1
})

function shutdown() {
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
