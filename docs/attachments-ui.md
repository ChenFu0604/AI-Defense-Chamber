# 附件支持与 UI 卡片优化

日期：2026-10-20。本轮在现有架构上增量修改，保留原项目、画像、历史会话及报告。

## UI 与使用方式

- 修复固定侧栏子元素被 flex 压缩、开发说明卡片内容裁切的问题。侧栏空间不足时可滚动，不再压扁卡片。
- 历史答辩中的“当时的项目资料与分析”、历史项目档案使用统一 ProjectSnapshot：项目简介独占一行，其余四项桌面双列卡片，手机单列。
- “继续已有会话”改为有来源、会话短 ID、操作说明和箭头的可点击卡片，不增加虚构的会话状态。
- 项目创建页和答辩回答区新增共用附件组件，支持按钮选择、多文件、拖拽目标区、上传/解析中、错误、缩略图、文字预览、移除。上传中阻止创建、提交、切评委、结束或刷新会话。
- PDF/TXT 解析后可选取文字、编辑并追加到指定表单字段；超出字段上限时提示删减，不覆盖原文、不静默截掉填写内容。当前没有调用模型自动补齐八个字段。
- 项目详情、答辩中的项目附件、已提交消息、历史记录均可显示附件。历史图片从本机后端加载，文字和元信息来自保存快照。

| 支持项 | 限制 |
| --- | --- |
| PNG / JPEG / WebP | 单张最多 4 MiB、1600 万像素；只支持静态图片 |
| 图片保存 | 实际解码，自动旋转、压缩到最长 1600px、转为 JPEG，默认去除 EXIF 等元数据；透明背景转换为白色 |
| PDF | 单文件最多 8 MiB、40 页；在独立 worker 提取文字，15 秒超时，中止超限解析 |
| TXT | 最多 8 MiB，UTF-8 编码 |
| 数量 | 每个项目或每次回答最多 4 个附件 |
| 文本保存 | 每份最多 12000 字，保留页标识并明确显示截断 |
| 模型上下文 | 项目分析附件文字合计最多 12000 字；答辩/报告合计最多 6000 字，显式标注部分读取 |

尚不支持：扫描 PDF 的 OCR、DOCX/PPTX 解析、完整 PDF 版面/表格理解或将 PDF 页面渲染成视觉输入。没有文字的扫描版、加密或损坏的 PDF 显示失败原因，不假装解析成功。

## 数据与 API

新增 `packages/shared/src/attachments.ts`：统一附件类型、Zod Schema、数量与大小限制、内容 URL。项目输入、消息、回答和草稿增加可选 attachments 字段；没有附件的旧记录结构和序列化保持兼容，不强制迁移或重写原有历史。

- `POST /api/v1/attachments`：原始文件二进制 body，`X-File-Name` 为编码文件名；成功返回统一附件元信息和提取文字。
- `GET /api/v1/attachments/:id/content`：校验 UUID、文件大小与 SHA-256 后返回内容；设置明确 MIME、nosniff、sandbox CSP 和 no-store。
- 同时支持 `/api` 别名，与现有接口一致。
- 文件与元信息保存在 `apps/server/.data/attachments/`，不加入 Git。浏览器只保存附件引用与提取文字，不保存图片 Base64 或密钥。
- 服务端确认文件写入和回读成功后才返回成功；请求中的附件元数据必须与后端保存记录一致，拒绝伪造提取文字。失败不伪造成功记录。
- 创建会话的快照可能包含两份有界文档文字，因此只对项目分析及 defense 路径开放 1 MiB JSON body，其他接口仍为 256 KiB；上传单独限制 8 MiB。解析同时最多处理两个上传。
- 已提交附件随消息持久化，失败/刷新后使用同一 requestId 和相同附件重试；成功确认后清空草稿附件。二次训练沿用原项目附件，但不复制旧回答为新回答。

移除按钮只移除当前表单引用，不删除后端文件，以免破坏已保存的历史。上传取消、网络响应丢失、放弃表单可能留下未引用文件；本轮尚无垃圾回收、图形化清理或总存储配额。备份时需要同时保留浏览器项目/历史和后端 `.data/attachments/`，JSON 归档不包含图片二进制。现有 LocalStorage 3 MiB 历史归档限制仍然有效，较多 PDF 会更快达到容量上限，并明确提示归档失败。

## 真实模型接入边界

统一 AI 客户端支持 Chat Completions 的 text + image_url 消息，图片内容由服务端已校验文件生成 data URL，不允许模型从用户任意远程 URL 取图。使用所配置模型的真实调用路径，未新增模拟模型到正式产品中。

- 项目分析：发送项目字段、最多 4 个附件以及有界提取文字。新增 `materials` 引用来源，引用必须属于某一份已保存文档的连续原文；图片观察仅能作为待验证推断，不编造可校验的引文。
- 四角色预览与答辩：项目附件进入模型；答辩还加入最近一次回答附件，较早图片仅保留元信息，并在上下文说明该限制。最新文字回答仍完整保留，原有 32000 字符上下文上限有效。
- 评分报告：从保存回答附件与项目附件选择最多 8 个独立附件，保留读取限制；评分引用仍必须来自实际回答原文，五维等权综合分算法不变。存在历史报告时直接读取，新增附件能力不会触发重生成。
- 模型拒绝含图请求时，提示检查视觉及结构化输出支持，不偷偷忽略图片后返回文字结果。
- 设置页提醒连接测试仅测试短文本及结构化输出，不能证明模型具备图片理解能力。无需新增环境变量，继续使用原有服务端模型配置。

本轮模型测试使用明确固定的测试 transport，没有把用户资料或截图传给第三方模型，也没有测量真实服务商视觉理解质量。

## 实际验证

新增附件测试覆盖：真实 PNG 上传与解码转换、读取重启恢复、损坏/不支持文件、PDF 正文提取、无文字 PDF、41 页 PDF、损坏 PDF、TXT 截断、大小限制、元数据伪造及二进制损坏、文档引文、项目与回答图片进入模型请求、模型拒绝视觉输入、附件答辩失败恢复/重试/报告/二次训练、较大快照 body 限制、前端上传错误、草稿刷新恢复、历史附件与卡片 SSR。还增加 ProjectForm 编译渲染测试，防止模板表达式错误逃过纯类型检查。

浏览器实查：桌面侧栏卡片 scrollHeight 与 clientHeight 相等，无内部内容裁切；历史五项资料分卡正常；已有会话双列卡片及链接正常；390px 视口下已有会话转为单列、创建上传区没有横向溢出。使用的是隔离 5174 测试来源中的既有固定测试记录，没有改动正式 5173 数据。

浏览器文件选择器上传被权限检查拒绝（未获得向 5174 发送文件的权限），没有绕过限制。因此本轮**未完成浏览器文件选择器和实际拖拽上传的端到端验证**；后端 API 使用真实文件测试，前端通过组件/服务测试与页面布局检查。不能把接口测试描述为浏览器上传已验证。

格式化期间曾出现开发热更新失败；生产构建进一步发现表单多语句事件模板问题，已改成命名方法并加编译渲染回归。最终重新启动测试页面后，创建页正常编译，所检查的 console warn/error 为空。

实际命令与结果：

- `npm test`：34 个文件、320 项通过（含 Vitest、Supertest、Pinia、组件 SSR）。
- 最后附件专项复验：`node node_modules/vitest/vitest.mjs run apps/server/src/tests/attachments.test.ts apps/web/src/tests/attachments.test.ts`，2 个文件、11 项通过。
- `npm run typecheck`：前端、后端及 shared 类型检查通过。
- `npm run build`：前端、后端及 shared 生产构建通过；仍有原 Zod 依赖中的两条 Rollup 注释位置警告。
- `git diff --check`：通过。开发中的失败已修复，没有用测试结果或模拟反馈掩盖失败。

## 主要修改位置

| 模块 | 文件 |
| --- | --- |
| 跨端合同 | `packages/shared/src/attachments.ts`、`project.ts`、`defense.ts`、`analysis.ts`、`risk-map-build.ts`、`index.ts` |
| 后端上传与解析 | `apps/server/src/routes/attachments.ts`、`services/attachment-service.ts`、`services/pdf-text.ts`、`app.ts` |
| 模型与上下文 | `services/ai-client.ts`、`project-analysis-service.ts`、`judge-service.ts`、`defense-service.ts`、`defense-model.ts`、`defense-context.ts`、`report-service.ts`、`report-context.ts`、`prompts/project-analysis.ts` |
| 共用 UI | `apps/web/src/components/attachments/AttachmentUploader.vue`、`AttachmentGallery.vue`、`components/ProjectSnapshot.vue`、`styles/attachments.css`、`styles/workspace.css`、`main.ts` |
| 页面与状态 | `components/ProjectForm.vue`、`components/defense/DefenseMessages.vue`、`DefenseStartPanel.vue`、`components/analysis/AnalysisFindingCard.vue`、`components/risk/RiskNodeDetails.vue`、`components/settings/ModelConfigCard.vue`、`composables/useProjectForm.ts`、`services/attachments-api.ts`、`services/defense-storage.ts`、`stores/defense.ts`、`views/DefenseSessionView.vue`、`ProjectDetailView.vue`、`HistoryDetailView.vue`、`HistoryProjectView.vue` |
| 测试与预览 | `apps/server/src/tests/attachments.test.ts`、`apps/web/src/tests/attachments.test.ts`、`tests/fixtures/files.ts`、`workflow.ts`、`tests/preview.local.ts` |
| 依赖与说明 | `apps/server/package.json`、根 `package-lock.json`、`README.md`、本记录 |

新增生产依赖仅 sharp 与 pdfjs-dist，使用项目现有 npm workspace 安装；未升级其他直接依赖。解析实现参考 [PDF.js 官方示例](https://mozilla.github.io/pdf.js/examples/)，图片解码限制参考 [sharp 官方文档](https://sharp.pixelplumbing.com/api-constructor/)。
