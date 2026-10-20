# 第四阶段：四角色 AI 评委

日期：2026-10-20（Asia/Shanghai）。在第三阶段代码上增量实现，没有新增依赖。

## 已实现

- 商业、技术、用户和魔鬼评委使用统一 ID：business / technical / user / devil。修正首页旧 technology 标识，图标标识仍兼容原组件。
- 公开配置包含角色介绍、图标、颜色、评价维度、提问策略、追问规则与初始状态。完整 System Prompt 仅保存在服务端。
- POST /api/v1/judges/question 和 /api/judges/question 共用业务服务，复用既有 AIClient、环境配置、结构化响应与错误处理中间件。
- 单次生成一个角色问题；工作台支持四角色顺序调用。传入项目画像、资料、难度及本轮已有问题。不使用多 Agent 框架，也未实现并行多 Agent 编排。
- 发言包含角色、问题、类型、风险等级、关注点、理由和来源元数据；前后端均进行 Zod 校验并核对角色、模式和画像标识。
- 真实提问只接受匹配当前资料的真实画像；模拟提问只接受模拟画像。错误不会自动降级为模拟成功。
- 通过标准化和二元字符重叠拒绝文字重复或近似的问题；System Prompt 同时要求避开历史已涉及的主题。
- 工作台可切换评委详情，展示活跃角色及等待、分析中、提问中、完成、失败状态。完成表示用户已阅问题，不代表完成答辩或获得评分。
- 分析中显示适度脉冲动效，支持减少动态效果设置。支持取消、重试、清空本轮；项目、模式或画像变化后清空旧上下文，取消后的迟到结果被丢弃。
- 当前问题仅保留在 Pinia 内存中。刷新会清空；项目和画像的既有 LocalStorage 保存逻辑保持不变。
- 模拟模式每位评委提供三个不同模板，使用项目字段及画像生成示例；用完返回明确提示。标签和正文均标注模拟，不调用模型。

## 使用

1. 创建项目并进入项目详情，生成真实画像或主动选择模拟画像。
2. 从“开始答辩”进入 /defense，选择该项目。
3. 查看四位评委的维度和策略，选择与画像一致的提问来源。
4. 点击单角色提问，或“依次生成四位问题”；点击评委切换查看对应问题。
5. “标记该评委提问已阅”切换为完成；可继续生成新问题，或清空本轮。

真实调用沿用 apps/server/.env：OPENAI_BASE_URL、OPENAI_API_KEY、OPENAI_MODEL、AI_TIMEOUT_MS、AI_RESPONSE_FORMAT。前端无需且不能填写密钥。详情见 README。

## 修改位置

- packages/shared/src/judges.ts、index.ts：公开配置、类型、Zod 契约、重复问题判定。
- apps/server/src/config/judges.ts：四套独立 System Prompt，与 Vue 页面分离。
- apps/server/src/services/judge-service.ts、routes/judges.ts、app.ts：角色调用、模拟模板、业务校验与 API。
- apps/server/src/services/ai-client.ts：将画像专用错误文案调整为通用模型任务文案，沿用原来的错误码与处理。
- apps/web/src/components/judges/JudgeSeat.vue、JudgeDetails.vue、JudgeWorkbench.vue：可复用评委席、角色详情与工作台。
- apps/web/src/stores/judges.ts、services/judges-api.ts、styles/judges.css、main.ts：状态、取消、顺序请求、返回校验及响应式样式。
- apps/web/src/views/DefensePrepareView.vue、data/judges.ts、types/judge.ts：复用现有准备路由与首页角色展示。
- apps/web/src/components/StageDialog.vue、layouts/WorkspaceLayout.vue：阶段说明。
- apps/server/src/tests/judges.test.ts、apps/web/src/tests/judges-api.test.ts、judges-store.test.ts：本阶段测试。
- README.md、docs/api.md、docs/architecture.md、本文：当前使用方式、协议和限制。

## 实际验证

- npm test：12 个测试文件，149 项通过。原有 113 项保留，新增 36 项。
- npm run typecheck：服务端、Vue 前端与共享包通过。
- npm run build：共享包、服务端、前端生产构建通过；前端 JavaScript 264.51 kB，CSS 53.75 kB。仍有两条既有 Zod 注释警告，不影响构建。
- 测试覆盖角色完整性、实质性提示词差异、请求和输出结构、画像/模式匹配、错误角色、重复与近似问题、模拟模板耗尽、无配置、异常 JSON、模型失败与超时错误、客户端超时和取消、前端切换、顺序调用、失败保留、重试及迟到响应。
- 浏览器实际验证：项目选择、缺少真实画像时的引导、主动切换模拟模式、四角色顺序生成、不同角色详情与问题切换、标记完成。390px 窄屏无横向溢出，评委卡片使用两列；桌面继续四列展示。

## 真实接入与限制

生产代码已接入可调用的统一模型适配器和四角色提示词；测试中的模型输出均为受控夹具，浏览器展示为主动选择的模拟模板。当前没有真实模型配置，本阶段没有调用外部模型，不能据此宣称真实模型质量已经验证。

画像和历史由客户端提供，来源字段是协议约定，不是服务端签名。风险标签表示问题涉及风险的程度，不代表已证实项目存在该问题。

文字去重不能保证语义完全不重复，且只覆盖请求传入的本轮历史；每轮最多保留 32 个问题。模型输出质量与语义重复程度仍需在真实模型配置后评估。

追问规则已作为角色配置及提示词的一部分使用；当前未提供回答输入、连续对话、根据回答追问、评分或报告。下一阶段建议实现回答与会话记录、可追溯的追问链，以及对应的持久化和端到端测试。
