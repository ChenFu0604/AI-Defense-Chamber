# 当前架构（第五阶段）

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
- 后端超时默认 120 秒，可设为 1～300 秒；前端 310 秒（预留 10 秒接收后端错误）；响应上限 512 KiB。
- 项目材料只作为 JSON 数据放入用户消息，system prompt 明确禁止遵从材料中的指令。
- 所有模型文本均通过 Vue 文本绑定显示，不渲染为任意 HTML。
- 区分材料、推测与证据不足；片段校验不等于事实或推理有效性证明。
- 取消与迟到响应使用每项目请求令牌控制，旧响应不能覆盖新结果。
- 已有画像在失败和重试时保留；保存失败显示警告，不冒充持久化成功。
- 请求健康状态只说明 API 与配置情况，不探测外部服务可用性。

共享包继续独立编译；开发、测试和构建均先构建共享包。
健康检查前端超时仍为 8 秒，分析请求使用单独的时限与错误类型。
已有项目存储键、后端监听地址、Vite 代理和启动脚本保持兼容。

## 四角色提问

共享 judges.ts 提供公开角色说明、统一 ID、状态与 Zod 契约。服务端 config/judges.ts 组合独立 System Prompt；前端构建不包含这些提示词。

答辩工作台 → judges Pinia store → /api/v1/judges/question → 请求及画像匹配校验 → judge-service → 既有 AIClient。角色逐次调用同一模型，前一角色问题作为后一角色的去重历史，不是并行多 Agent 框架。

服务端与前端均检查角色、来源和结构；问题执行标准化与二元字符重叠去重。模式或画像切换取消请求并清空本轮；迟到响应通过令牌丢弃。当前仅内存保留问题，不承诺刷新恢复，不接入回答驱动追问。

画像和历史来自客户端，属于用户提供上下文；来源字段是应用协议标识，不是不可伪造的服务端签名。去重可以拒绝文字近似问题，不能保证语义层面完全不重复。

## 动态会话与上下文

共享 defense.ts 定义 DefenseSession / DefenseMessage / JudgeRole / DefenseQuestion / DefenseStatus / AnswerRequest / AnswerResponse 与 Zod 契约。新增会话路由使用独立 defense-service 管理状态，既有单轮评委接口保留。

服务端以项目和画像快照创建 ready 会话。生成首问、提交回答及切换角色共用幂等执行路径：检查请求指纹和当前问题 → 原子保存 pending 及用户回答 → 独立 defense-context 组装有限上下文 → defense-model 使用当前角色提示词与通用 AIClient → 校验结构、角色、原文关联和重复问题 → 原子保存评委消息及完成账本。失败保留已确认记录，不返回未落盘结果。

上下文保留完整最新回答、当前问题、截断的项目及画像、最近八条已提交消息、最近问题摘要、最多八项历史风险；超过 32000 字符依次移除更早历史，仍超限则明确拒绝。完整记录保存在会话文件，截断只影响模型上下文，不改写资料或已保存消息。引用校验不等于语义相关性或事实核验。

会话文件位于 apps/server/.data/defense-sessions；先写唯一临时文件再 rename，读取时执行契约检查。服务重启遗留的 generating 状态在读取时转为可重试 failed。单进程会话互斥防止重复模型调用；不提供多进程分布式锁。关闭网页不会撤销服务端已保存的提交。

前端 defense Pinia store 负责请求、草稿、原请求重试、跨组件状态与迟到响应丢弃。URL 是恢复依据，LocalStorage 只保存草稿、待重试请求及最近入口。生成中通过普通 GET 轮询恢复状态；未引入 SSE。诊断页直接整理已保存的逐轮评价与完整记录，不生成虚构评分。

## 运行时模型设置

/settings 页面以可复用 ModelConfigCard 和 useModelSettings 组合式逻辑管理表单、验证、测试、保存和状态。密钥只存在于未保存表单内存，保存成功或页面卸载后清空，不进入 Pinia 持久化或 LocalStorage。

独立设置路由和 model-settings-service 负责后端脱敏读取、配置合并、测试与原子写入。config/model-settings-file 负责校验读取；readAIConfig 每次请求优先读取已保存配置，再回退环境变量。测试使用独立草稿客户端，既不更新运行配置，也不发项目上下文。

配置接口限制本机套接字、可信 Host/Origin，并要求应用专用头；不将本地模型密钥配置界面直接开放到公网。持久化文件不是加密保险库，保密性依赖本机文件权限；POSIX 新文件权限为 0600，Windows 使用项目目录的系统 ACL。

模型网络传输统一通过 model-transport.ts，使用 undici EnvHttpProxyAgent 在单次请求上应用环境代理；本机服务绕过代理。该依赖用于解决 Node 22.15 原生 fetch 不自动遵循代理变量的问题，未改全局调度器或 TLS 校验。
