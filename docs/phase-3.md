# 第三阶段交付与验证记录

日期：2026-10-20（Asia/Shanghai）。

## 已完成

- 项目详情新增八类画像、分析与重新分析、等待与取消、错误与重试、风险及证据缺口强调。
- 实现 POST /api/projects/analyze，并保留 /api/v1/projects/analyze 作为前端默认路径。
- 统一 AIClient、服务端环境变量校验、JSON Schema / JSON object 两种显式兼容设置。
- 模型协议、JSON 输出、Zod 结构、原文引用与来源元数据分别校验。
- 无配置、认证失败、限流、网络错误、超时、拒答、截断和无效输出使用统一错误码。
- 用户主动选择的模拟示例与真实调用分离，不自动兜底；两类结果分别保存。
- 分析记录独立存储并保留输入快照，刷新恢复时核对材料是否一致。
- 取消或切换项目后，迟到结果不会覆盖新状态；存储失败仍可查看已生成结果并显示保存警告。
- 更新健康接口配置状态、环境模板、README 和当前架构/API 文档。没有新增依赖。

## 实际验证与真实性

- npm test：9 个测试文件，113 项通过（第二阶段 49 项保留，新增 64 项）。
- npm run typecheck：前端、后端与共享包通过。一处测试替身的泛型声明错误已修正后复查。
- npm run build：共享包、后端与前端生产构建均通过。前端产物约 252 kB JavaScript、51 kB CSS；保留既有两条 Zod 依赖注释警告，构建退出码为 0。
- 使用本地 HTTP 模型协议测试服务，实际走通 HTTP 请求、服务端鉴权头、结构化约束、API 返回与校验；该服务返回测试夹具，不是大模型。
- 浏览器已验证：真实模式未配置时显示具体配置提示、没有伪造成功；主动请求模拟结果显示八类内容和“模拟数据 · 未调用模型”；刷新恢复来源；可展开原文依据。1280px 桌面与 390px 窄屏均无横向溢出，风险与证据缺口有独立视觉强调。
- 服务端目录没有 .env，进程也没有 OPENAI_API_KEY / OPENAI_MODEL。没有调用或实测任何外部付费大模型，没有读取其他页面的密钥。

真实接入的准确口径：生产代码已提供可调用的 OpenAI 兼容 HTTP 适配器和分析流程，但本次缺少配置，
尚未完成真实服务商与真实模型的端到端验证。当前浏览器展示的是主动选择的模拟模板，绝非真实 AI 结果。

## 修改文件

共享：packages/shared/src/analysis.ts、index.ts、schemas.ts。
后端：app、config/ai、controllers/project-analysis-controller、routes/projects、schemas/project-analysis、
middleware/app-error 与 error-handler、services/ai-client、project-analysis-service、demo-analysis、
health-service、prompts/project-analysis，以及对应测试。
前端：components/analysis 三个组件、services/analysis-api 与 analysis-storage、stores/analysis、
styles/analysis.css、main.ts、ProjectDetailView、DefensePrepareView、HomeView、ProjectForm、公共布局和阶段说明。
文档：两个 .env.example、README、docs/api.md、docs/architecture.md、本记录。
测试夹具：tests/fixtures/analysis.ts。

## 测试覆盖

模型配置、参数缺失/空白/枚举、模型协议异常、无效 JSON 与缺字段、认证/限流/HTTP 失败、超时、拒答、
截断、预先取消、超大响应、错误引用、真实与模拟隔离、请求失败保留旧结果、重复提交、取消后迟到响应、
新结果不被旧请求覆盖、客户端超时、浏览器保存失败、损坏记录保护、材料变化后不复用旧画像。

所有外部请求在单元测试中被替换；唯一真实传输测试只访问本机临时端口。测试数据不证明模型分析质量。

## 配置及限制

复制 apps/server/.env.example 为 apps/server/.env，填写服务商实际地址、密钥与模型名称后重启后端。
模型地址是 base URL，客户端会追加 /chat/completions；不能填写完整方法地址或查询密钥。
默认 response_format 为 json_schema；不支持的兼容服务可显式改 AI_RESPONSE_FORMAT=json_object。
默认超时 45000ms。缺少配置时演示可用，真实模式返回 503。

引用检查仅保证片段来自提交材料，不证明材料真实或模型结论可靠。用户仍需核对风险、缺口和建议。
后续答辩会话、评委连续追问、评分、报告与风险地图不在本轮范围。

## 官方资料

统一客户端的格式实现参考 [OpenAI Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)：
使用 Chat Completions response_format；支持时使用 strict JSON Schema；处理拒答和未完成响应。
兼容服务的具体支持情况必须通过真实配置后验证。
