# 第五阶段：动态答辩与多轮追问

日期：2026-10-20（Asia/Shanghai）。沿用 Vue 3、Pinia、Express、TypeScript、Zod 和统一 AIClient，没有新增依赖。采用普通 JSON 请求，未加入 SSE。

## 实现范围

- 准备页确认项目资料、选择真实或模拟来源及首位评委，创建会话后自动请求首问。
- 会话保留项目与画像快照、来源、当前评委与问题、完整消息、时间、状态和请求账本。
- 回答先原子写入服务端，再调用模型分析与生成追问。最新回答完整进入上下文，模型须引用最新回答中的真实连续原文，追问文本必须包含该引用。
- 根据当前角色、问题、最新回答、有限历史与已发现风险生成后续问题；提示词要求根据证据充分性选择补证、边界测试或转向。
- 切换评委保留先前回答，当前未作答问题标记为 superseded；新评委获得跨角色历史与最近回答。
- 每个请求使用 UUID 与 SHA-256 内容指纹。重复成功请求返回当前会话，不重复写入回答；失败重试复用原请求和原回答，不允许用不同内容覆盖已保存的待重试操作。
- 会话级单进程互斥阻止并发修改。服务重启后，遗留 generating 状态转为可重试 failed。
- 结束操作可重复执行；新回答和角色切换在结束后被拒绝。每轮最多 30 个问题（含切换），提交最后一个问题的回答后自动结束，不额外调用模型。
- 诊断页汇总实际保存的逐轮评价、引用与待验证风险，并展示完整问答。没有成功生成的评价不会补造评分或结论。
- Pinia 管理会话、输入、加载、重试与错误。支持草稿保存、刷新恢复、生成状态轮询及旧页面迟到响应丢弃。生成期间避免重复提交。
- 消息区域在接近底部时跟随新增消息，用户上翻阅读时不强制拉回。支持窄屏和减少动态效果设置。

## 数据与上下文

服务端目录：`apps/server/.data/defense-sessions/`。每会话一个 UUID JSON 文件，写入唯一临时文件后 rename；损坏记录保留原文件并报错，不伪装成功。`.data/` 已加入 Git 忽略规则。

浏览器保存最近 20 个会话入口、各会话草稿和待重试请求。浏览器保存失败会提示；服务端已提交记录仍可通过会话 URL 恢复。未提交草稿只保存在浏览器。不可读取的草稿在用户编辑新内容前不会被覆盖。

独立 defense-context 服务提供项目基本资料、画像摘要、当前问题、完整最新回答、最近八条有效消息、最多三十条问题摘要及最多八项风险。项目和历史的长字段会截断并标识；超过 32000 字符时先移除更早历史，仍超限则返回明确错误。完整记录和项目快照保持不变。

关闭页面或客户端超时不表示服务端操作撤销。应先获取会话，通过 pending/completed 恢复结果；本地草稿和原请求保留用于安全重试。

## 接口与页面

接口均支持 `/api` 和 `/api/v1` 前缀：

- POST /defense/sessions：创建，返回 ready 会话。
- GET /defense/sessions/:id：恢复完整会话。
- POST /defense/sessions/:id/question：生成或重试首问。
- POST /defense/sessions/:id/answer：提交回答并追问。
- POST /defense/sessions/:id/judge：切换角色并生成问题。
- POST /defense/sessions/:id/end：幂等结束。

请求和响应详见 [API 文档](api.md)。新页面为 `/defense/sessions/:id` 与 `/defense/sessions/:id/report`。原准备路由与单轮评委预览保留。

## 修改文件

- packages/shared/src/defense.ts、index.ts：所要求的统一类型、状态、消息关联、请求和返回契约。
- apps/server/src/services/defense-context.ts：有长度边界的上下文组装。
- apps/server/src/services/defense-model.ts、defense-demo.ts：真实模型结构化调用、引用和去重校验、明确标注的规则演示。
- apps/server/src/services/defense-service.ts：状态机、幂等、互斥、保存与恢复。
- apps/server/src/services/defense-repository.ts：原子文件存储、读取校验与损坏保护。
- apps/server/src/routes/defense.ts、app.ts：会话接口与统一错误返回。
- apps/web/src/services/defense-api.ts、defense-storage.ts：HTTP、超时、返回校验与浏览器恢复数据。
- apps/web/src/stores/defense.ts：跨组件状态、草稿、请求重试与恢复。
- apps/web/src/components/defense/DefenseStartPanel.vue、DefenseMessages.vue：确认开始与可滚动消息组件。
- apps/web/src/views/DefenseSessionView.vue、DefenseReportView.vue：动态答辩和诊断页。
- apps/web/src/router/index.ts、views/DefensePrepareView.vue、main.ts、styles/defense.css：路由与页面接入。
- StageDialog.vue、WorkspaceLayout.vue、JudgeWorkbench.vue：开发阶段及单轮预览说明。
- apps/server/src/tests/defense.test.ts、apps/web/src/tests/defense-api.test.ts、defense-store.test.ts、tests/fixtures/defense.ts：测试与夹具。
- .gitignore、README.md、docs/api.md、docs/architecture.md、本文：存储忽略、流程与交付说明。

## 实际验证

- npm test：15 个测试文件，175 项通过；保留原有 149 项，新增 26 项。
- npm run typecheck：共享包、服务端与 Vue 前端通过。
- npm run build：全部生产构建通过；前端 JavaScript 288.97 kB、CSS 56.65 kB。仍有两条既有 Zod 注释警告，构建退出码 0。
- 测试覆盖创建与重复创建、参数和来源校验、首问、连续回答、最新回答引用、跨角色历史、上下文边界、切换评委、幂等提交、过期问题、空回答、限额结束、重复结束、已结束拒绝、会话不存在、无配置、异常模型 JSON、超时失败保留与重试、并发互斥、保存失败、重启恢复、损坏文件保护、草稿恢复和迟到响应。
- 浏览器实际走通：选择示例项目、主动选择模拟模式、确认创建、首问、三次回答、切换技术及用户评委、刷新恢复未提交草稿、提交恢复草稿、结束并进入诊断页。会话保留三次回答及六个问题，均为模拟数据。
- 开发服务因热更新重启时出现过短暂连接失败；恢复后通过“重试读取会话”成功读取已保存问答，记录未丢失。
- 390px 诊断页检查未出现横向溢出。模拟来源、回答依据及完整记录均可见。

## 真实性与遗留限制

健康接口仍为 ai:not_configured。本轮没有调用外部真实模型、没有产生模型费用。真实调用路径已实现，模型错误与输出处理使用受控测试验证；浏览器演示是根据回答引用生成的显式规则模板，不代表真实模型理解或推理质量。

引用约束可拒绝脱离最新回答的输出，但不能证明语义相关或事实正确。去重检测主要针对文字相似度；跨角色提问质量和长期上下文策略需要真实模型评估。

当前是本机单进程文件存储，无账号鉴权、多进程共享锁、云数据库或自动数据清理；不能直接作为公网多用户服务。综合评分、完整诊断算法和 SSE 不在本轮范围。

下一阶段建议先接入真实模型评估追问质量，再基于已有逐轮分析实现可追溯的诊断与评分；多用户部署前补齐鉴权和数据库事务。
