# API · v0.1.0

第六阶段新增报告生成与历史读取接口，类型、错误码和去重规则见 [评分报告接口说明](phase-6.md#api)。

统一响应：成功为 `{ success: true, data }`，失败为 `{ success: false, error: { code, message } }`。
共享类型与 Zod schema 位于 `packages/shared/src`。

## GET /api/v1/health

兼容别名：`GET /api/health`。无需密钥，不调用模型；返回 HTTP 200，禁止缓存。

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "ai-defense-chamber",
    "version": "0.1.0",
    "timestamp": "2026-10-20T00:00:00.000Z",
    "ai": "not_configured"
  }
}
```

上例为格式示例。时间戳来自运行时。ai 值为：
- `configured`：配置格式已通过检查，不代表已验证服务商权限、网络或模型可用性。
- `not_configured`：缺少密钥或模型名称。
- `configuration_error`：地址、超时或输出格式设置无效。

## POST /api/v1/projects/analyze

兼容并完整实现用户指定路径：`POST /api/projects/analyze`。两个路径调用同一控制器和服务。

请求为 `{ project: Project, mode?: "live" | "demo" }`：
- project 包含第二阶段的八项资料、UUID、创建与更新时间。
- mode 默认 live；必须主动传 demo 才返回模板示例，真实调用失败不会切换到 demo。
- 请求体超过 256 KB 返回 413；字段通过共享 Zod schema 校验。

成功返回 HTTP 200，`Cache-Control: no-store`。data 为 AnalysisRecord：

| 字段 | 含义 |
| --- | --- |
| id | 服务端生成的本次分析 UUID |
| projectId | 关联项目 UUID |
| projectSnapshot | 本次分析所用的八项项目资料 |
| createdAt | 分析完成的 ISO UTC 时间 |
| mode | live / demo，服务端确定来源 |
| model | 真实调用的模型标识；demo 必须为 null |
| output | 八项结构化画像 |

output 包含 coreValue、targetUsersAndScenarios、strengths、technicalFeasibility、businessValue、risks、evidenceGaps、questionDirections。
核心结论使用 summary / reasoning / certainty / evidence。certainty 仅允许：
`provided`（材料中提及）、`inferred`（待验证推测）、`insufficient`（证据不足）。
provided 必须有原文引用，所有引用必须是对应资料字段中的连续片段。材料引用不等于外部事实验证。
风险包含严重程度和改进建议；证据缺口包含核对行动；问题方向标明评委视角。
完整约束见 `packages/shared/src/analysis.ts`。

## 错误码

| HTTP | code | 处理方向 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | 检查完整项目字段、元数据和模式 |
| 400 | INVALID_JSON | 修正 JSON 请求体 |
| 413 | PAYLOAD_TOO_LARGE | 缩短请求体 |
| 503 | AI_NOT_CONFIGURED | 在服务端配置密钥和模型，重启后端 |
| 503 | AI_CONFIG_INVALID | 检查模型地址、超时和输出格式 |
| 502 | AI_AUTH_ERROR | 检查服务商密钥与模型权限 |
| 429 | AI_RATE_LIMITED | 检查额度、限流，稍后手动重试 |
| 502 | AI_REQUEST_REJECTED | 检查模型及结构化输出兼容性 |
| 502 | AI_UNAVAILABLE / AI_CONNECTION_FAILED | 检查网络、模型与服务地址 |
| 504 | AI_TIMEOUT | 请求超过后端时限，已有资料保留 |
| 502 | AI_INVALID_OUTPUT | 输出 JSON、字段或响应结构无效 |
| 502 | AI_INVALID_EVIDENCE | 引用不存在于原材料，或材料结论缺少引用 |
| 502 | AI_INCOMPLETE_OUTPUT | 模型输出被截断 |
| 422 | AI_REFUSED | 模型未能处理该材料 |
| 404 | NOT_FOUND | 接口不存在 |
| 500 | INTERNAL_ERROR | 未处理异常，不返回堆栈或原始服务商错误 |

浏览器取消会中止连接并尝试取消上游请求，不以取消结果生成有效画像。没有自动重试或模拟兜底。

## 本地持久化

项目建档仍只保存在浏览器，不增加服务端项目数据库。
分析请求会发送所选资料；模型只收到八项必要资料，不包含浏览器存储的其他项目或历史记录。
画像保存在独立的 `defense-chamber.analyses.v1`，真实与演示结果分别保留。
答辩会话、回答、评分与报告接口见下方对应章节；此处仅说明项目画像的本地保存。

## 第四阶段：评委提问

`POST /api/v1/judges/question`，兼容 `POST /api/judges/question`。

请求 `{ project: Project, analysis: AnalysisRecord, judgeId, mode?: "live" | "demo", history?: JudgeQuestion[] }`。judgeId 为 business / technical / user / devil。mode 默认 live；history 默认空，最多 32 条，客户端须传入本轮已有的所有角色问题。analysis 必须与项目资料快照及 mode 一致，否则返回 400 VALIDATION_ERROR。

成功响应 `{ success: true, data: { id, projectId, analysisId, createdAt, mode, model, speech } }`。
speech 为 `{ judgeId, question, questionType, riskLevel, focus, rationale }`。questionType 为 clarification / evidence / feasibility / tradeoff / challenge；riskLevel 为 low / medium / high，表示讨论风险的程度，不是事实核验结果。

模拟返回 model:null，正文包含模拟标记；真实返回模型标识。复用统一 AI 配置、超时、取消与错误码。额外错误：AI_INVALID_OUTPUT（结构或角色错误）、422 DUPLICATE_QUESTION（问题文字近似）。请求失败不降级到模拟。响应均 no-store。重复校验仅覆盖本次提供的历史，不提供跨浏览器全局去重。

## 第五阶段：动态答辩会话

以下接口均支持 `/api` 与 `/api/v1` 前缀，成功结构 `{ success:true, data:DefenseSession }`，错误沿用统一 `{ success:false, error:{code,message} }`。均设置 `Cache-Control:no-store`。

| 方法及路径（省略前缀） | 请求 | 行为 |
| --- | --- | --- |
| POST /defense/sessions | `{requestId,project,analysis,mode?,judgeId?,preferences?}` | 创建并保存 ready 会话，201；会话 ID 为创建请求 UUID。项目为浏览器中的完整资料，画像必须匹配快照和来源。mode 默认 live，judgeId 默认 business |
| GET /defense/sessions/:id | 无 | 读取完整快照、消息、当前问题、评委、状态与待重试操作 |
| POST /defense/sessions/:id/question | `{requestId}` | 生成首问；失败可复用同一请求重试 |
| POST /defense/sessions/:id/answer | `{requestId,questionId,answer}` | 回答 trim 后 1～4000 字；先保存，再生成与回答关联的追问 |
| POST /defense/sessions/:id/help | `{requestId,questionId,kind}` | 对当前问题获取提示；kind 为 hint / rephrase / no_evidence；独立保存 assistance，不提交回答，不改变问题或题数 |
| POST /defense/sessions/:id/judge | `{requestId,questionId,judgeId}` | 保留历史，标记当前未答问题为 superseded，生成新评委问题 |
| POST /defense/sessions/:id/end | `{}` | 结束并保存，可重复调用；不存在返回 404 |

生成首问、提交回答与切换评委的请求必须使用独立 UUID；重试原操作必须使用相同 UUID 和相同内容。结束操作自身幂等，无需请求 UUID。成功请求重复发送不会重复写消息；同一 UUID 不同内容返回 409 IDEMPOTENCY_CONFLICT。并发操作返回 409 SESSION_BUSY，过期 questionId 返回 409 STALE_QUESTION。失败且已保存的 pending 操作必须先重试或结束会话，不能另提交不同回答覆盖它。结束后新回答和评委切换返回 409 SESSION_ENDED，已完成请求的原样重放只返回当前记录。

DefenseSession 保存项目、画像、mode、currentJudgeId、currentQuestionId、status、messages、pending、completed 和时间戳。状态为 ready / generating / awaiting_answer / failed / ended。消息包含 ID、sender（user/judge）、content、createdAt、judgeId、status、question、assessment、replyTo、requestId 和 model。用户消息 pending/failed 表示追问尚未完成，回答本身已保存。

assessment 包含最新回答连续原文 answerQuote、evaluation（evidence_missing/sufficient/unclear）、feedback、nextStrategy 与待验证风险。引用必须真实属于最新回答；缺少分析或引用不实返回 502 AI_UNGROUNDED_FOLLOWUP。追问文本允许用自然语言承接，不要求逐字复述引用；引用仍保存在分析依据中，rationale 按提示词说明追问与回答的联系。此检查只证明引用真实，不证明追问语义相关或模型推理正确；语义质量仍需真实对话验收。

额外错误：SESSION_NOT_FOUND（404）、SESSION_STORAGE_ERROR / SESSION_STORAGE_CORRUPT（500）、PENDING_ACTION（409）、DUPLICATE_QUESTION（422）、TURN_LIMIT（409）、CONTEXT_TOO_LARGE（413）。模型错误、超时、认证和配置错误复用既有 AIClient。网络超时不能视为服务端撤销，请先 GET 会话并依据 pending/completed 恢复。

当前单进程本地文件存储；未实现账号鉴权、多进程共享锁或云数据库。完整会话地址和本地数据目录应按项目资料保护，不能直接将该本地开发服务开放为公网多用户服务。

### 2A 训练设置与辅助记录

`preferences` 为 `{style:"guided"|"rehearsal",goal:"general"|"value"|"technical"|"users",questionLimit:5|10}`。训练方式与 live/demo 来源独立；guided 主动提供简短思考支点，rehearsal 在主动求助时提供提示。省略 preferences 保留旧会话规则（30 题），读取不会给旧记录补写默认字段。新二次训练继承原会话已保存设置。

`assistance` 是可选数组，每项保存 requestId、questionId、kind、judgeId、content、createdAt、mode 与 model。引用必须指向实际评委问题，角色/来源必须一致；真实提示含模型标识，模拟提示 model 为 null 且有模拟标记。同一问题同类成功提示复用，最多每题三份；同 requestId 不同内容或跨回答/求助复用返回 409。已结束会话只允许重放已完成的相同请求，不生成新提示。

求助与普通回答/结束操作共用会话锁；模型失败不会写入假提示或把会话推进一题。失败可以用原 UUID 重试；GET 会话读取已保存的提示，客户端本地保存未完成的 help 操作以便刷新重试。取消提示重试只撤下本地操作，不承诺取消服务端正在执行的模型请求。求助请求不包含输入框中尚未提交的草稿。

达到新训练的题数上限后，提交最后回答调用独立评价任务，不额外生成问题；结果保存到 `closingFeedback:{answerMessageId,assessment,model}`。失败保留同一回答与 pending，可重试，避免重复写回答。旧会话沿用原结束行为。报告、历史与漏洞地图支持最后回答反馈；评分上下文标注训练设置及求助次数，提示不作为用户证据或回答。

## 系统设置：OpenAI 兼容模型

均支持 /api 与 /api/v1 前缀；需要 X-Settings-Request:1 请求头，仅允许本机地址与可信应用来源，响应为 no-store。默认开发来源为 localhost:5173、127.0.0.1:5173 以及配置的 WEB_ORIGIN。

- GET /settings/model：返回 baseUrl、model、timeoutMs、responseFormat、hasApiKey、source、status、updatedAt，绝不返回 apiKey。source 为 saved / environment / default；status 仅表示配置完整性，不表示网络或认证已验证。
- PUT /settings/model：保存配置；请求 `{baseUrl,model,apiKey?,timeoutMs,responseFormat}`。密钥留空保留当前值，首次配置或更换地址时需重新输入。原子写入成功且确认可读取后返回脱敏配置；保存失败不返回 success:true。
- POST /settings/model/test：相同请求，测试当前草稿；不保存、不修改运行配置。使用所选模型和结构化格式请求 /chat/completions，验证固定 `{ok:true}` 返回，成功返回 `{success:true,data:{model,latencyMs,responseFormat}}`。可能消耗少量额度，不发送项目资料。

后端 .data/model-config.json 优先于 .env，保存后无需重启，统一 AIClient 下次调用即可使用；没有保存文件时沿用环境变量。文件损坏明确报错，不静默降级或覆盖原文件。实际密钥只保存在后端本地文件，.data 已被 Git 忽略。

额外错误码：SETTINGS_ACCESS_DENIED（403）、API_KEY_REQUIRED（400）、MODEL_SETTINGS_BUSY（409）、MODEL_SETTINGS_READ_FAILED / MODEL_SETTINGS_CORRUPT / MODEL_SETTINGS_SAVE_FAILED（500）。模型认证、限流、网络、超时和结构异常复用 AIClient 错误码，原始服务商错误不返回页面。

### 模型列表

POST /settings/model/models（同样支持 /api 与 /api/v1）。请求 `{baseUrl,apiKey?,timeoutMs}`，不要求 model 字段；后端以 Bearer 密钥请求 Base URL + /models，校验上游 `{data:[{id:string}]}`，仅返回去重排序的模型 ID：`{success:true,data:{models:string[]}}`。获取不保存，空列表返回空数组。接口不支持返回 MODEL_LIST_UNSUPPORTED；结构异常为 MODEL_LIST_INVALID_OUTPUT；连接失败为 MODEL_LIST_CONNECTION_FAILED。沿用设置访问限制、换地址密钥保护及超时处理。模型列表不构成对话能力或结构化输出能力的验证。

## 项目资料库与本地 RAG

新增 POST `/knowledge/library`、`/knowledge/index`、`/knowledge/search`、`/knowledge/answer`，支持 `/api/v1` 和 `/api` 前缀。响应和错误格式不变，请求体上限 2 MiB。

共同范围为 `{project: Project, extraAttachments?: Attachment[]}`。`/index` 增加 `{attachmentId,ocr?,mode?}`，必须属于该范围；`/search` 和 `/answer` 增加 1～600 字的 `query` 和可选 `mode:keyword|semantic|hybrid`。关键词搜索和原文索引不调用模型；语义/混合检索使用独立配置的 Embedding API。资料问答未命中时返回 `mode:local_no_match,model:null`，不调用回答模型（语义检索阶段可能已调用 Embedding）。

`RagRetrieval` 保存检索策略（keyword/overview/semantic/hybrid）、项目/版本范围指纹、实际片段、页码/字符位置和覆盖状态；语义结果另存 `embedding:{model,dimensions,minSimilarity}`，概览补充标记为 `overviewIncluded`。分析记录、评委发言、答辩消息、最后一答与报告新增可选 `retrieval`，兼容旧记录；历史读取不重检索。问答的 `{sourceId,quote}` 必须对应本轮原文，答辩参考资料仅表示实际提供给模型。

新增错误包括 `RAG_SCOPE_MISMATCH`、`RAG_INDEX_BUSY`、`RAG_INDEX_CORRUPT`、`RAG_STORAGE_ERROR`、`RAG_TIMEOUT`、`RAG_INVALID_CITATION`、`DOCUMENT_SOURCE_CORRUPT`；模型错误复用 AIClient。解析、索引和资料范围边界详见 [RAG 首版记录](rag-v1.md)。本机单用户范围校验不等于多租户访问控制。

`/index` 默认 `mode:keyword`，强制重建原文；`semantic/hybrid` 复用或建立原文，强制重建该文件向量。`/search`、`/answer` 未指定 mode 时，未启用 Embedding 使用关键词，启用则混合；界面默认明确发送 keyword。显式语义请求未配置时返回 503，不静默降级。每次最多 1200 个非空向量片段，超出返回 413；向量索引/搜索总处理期限为 150 秒。

`KnowledgeDocument.vector?` 提供 `status:not_indexed|ready|stale|not_configured|failed`、模型、片段数、更新时间和可选错误说明。不同地址、模型、维度、内容的缓存不会混用；损坏需显式重建。新增错误包括 `RAG_VECTOR_BUSY`、`RAG_VECTOR_CORRUPT`、`RAG_VECTOR_MISMATCH`、`RAG_VECTOR_STORAGE_ERROR`、`RAG_VECTOR_SCOPE_TOO_LARGE` 和 `EMBEDDING_*`，见 [向量语义检索记录](rag-semantic.md)。

## 独立向量模型设置

GET/PUT `/api/v1/settings/embedding`（兼容 `/api`）、POST `/api/v1/settings/embedding/test` 沿用 `{success:true,data}`。仅本机连接和本机 Host、可信 Origin、`X-Settings-Request:1` 可访问，响应 `Cache-Control:no-store`。

PUT/测试请求为 `{enabled,baseUrl,model,apiKey,timeoutMs,dimensions:null|1..4096,minSimilarity:0..1}`；后两项默认 null/0.35。禁用保存允许空模型和密钥；启用和测试需要有效模型及独立密钥。留空密钥可保留同地址已保存密钥，变更地址不能转发旧密钥。测试可在禁用时执行，不保存配置，只发送固定连接测试文本。公开配置只返回 `hasApiKey`，不返回真实密钥；测试返回 `{model,dimensions,latencyMs}`。

后端调用 `${baseUrl}/embeddings`，发送 `{model,input:string[],encoding_format:'float',dimensions?}`。每批最多 32 条非空、900 字符内文本，响应最多 8 MiB；向量数量、index、有限非零值、维度均校验。设置保存至被 Git 忽略的 `.data/embedding-config.json`；支持独立的 `EMBEDDING_*` 环境变量回退。未验证所选服务商的真实检索质量，连接测试不能代替召回质量验收。
