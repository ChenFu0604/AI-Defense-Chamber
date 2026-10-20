# 当前架构（第三阶段）

保留 Vue / Express / npm workspaces 结构，在第二阶段项目流程上增加项目画像与统一 AI 服务。

```text
apps/web/src/
  components/analysis/          分析操作、结果、依据卡片
  services/analysis-api.ts      请求、客户端超时、错误与返回契约校验
  services/analysis-storage.ts  分析记录版本与回读确认
  stores/analysis.ts            按项目管理请求、模式、取消与保存状态
  views/ProjectDetailView.vue   组合资料与分析区，不直接调用模型
apps/server/src/
  config/ai.ts                 服务端模型配置校验与状态
  controllers/                 HTTP 输入校验、请求取消和响应
  routes/projects.ts           两个等价分析路径
  middleware/                  统一安全错误响应
  services/ai-client.ts         通用结构化模型调用接口
  services/project-analysis-service.ts  画像业务与引用校验
  services/demo-analysis.ts     明确标记的模板示例，不调用模型
  prompts/project-analysis.ts  独立业务提示词
  schemas/project-analysis.ts  请求和输出契约入口
packages/shared/src/analysis.ts  项目分析输入、输出、来源与持久化 schema
tests/fixtures/analysis.ts       测试夹具，不用于生产模拟结果
```

真实流程：详情页 → Pinia → /api/v1/projects/analyze → 参数校验 → 分析服务 →
统一客户端 → 服务端配置的 Chat Completions 地址 → 协议和 Zod 校验 →
引用片段校验 → 响应 → 前端再次校验 → 独立 LocalStorage 记录。

演示流程只在用户主动请求 demo 时使用预置服务；响应与本地记录始终携带 demo 和 model:null。
不会把 API 失败替换为演示成功，演示也不覆盖已经保存的真实画像。

客户端使用 Node.js 原生 fetch，无需新增 SDK 依赖。通用 AIClient.generate 接收任务提示词、
Zod 输出约束和取消信号；HTTP、业务逻辑、提示词与页面分离，后续答辩可以复用。
默认使用 strict JSON Schema；兼容服务可显式配置 JSON object，但始终执行 Zod 和业务校验。
不发送 temperature 等可选模型特有参数；未声称支持所有 OpenAI 兼容服务或所有模型。

安全与状态：
- 密钥只从服务端环境变量读取，不返回前端、不放进提示词或日志。
- 上游重定向禁止自动跟随，避免凭据被转发至意外地址。
- 后端超时默认 45 秒，可设为 1～120 秒；前端 130 秒；响应上限 512 KiB。
- 项目材料只作为 JSON 数据放入用户消息，system prompt 明确禁止遵从材料中的指令。
- 所有模型文本均通过 Vue 文本绑定显示，不渲染为任意 HTML。
- 区分材料、推测与证据不足；片段校验不等于事实或推理有效性证明。
- 取消与迟到响应使用每项目请求令牌控制，旧响应不能覆盖新结果。
- 已有画像在失败和重试时保留；保存失败显示警告，不冒充持久化成功。
- 请求健康状态只说明 API 与配置情况，不探测外部服务可用性。

共享包继续独立编译；开发、测试和构建均先构建共享包。
健康检查前端超时仍为 8 秒，分析请求使用单独的时限与错误类型。
已有项目存储键、后端监听地址、Vite 代理和启动脚本保持兼容。
