# 改进任务与当前版本复训

日期：2026-10-23。本轮完成“报告建议 → 保存改进任务 → 补充材料与进展 → 选择项目版本复训”。沿用现有 Vue/Pinia/Express/Zod 架构，没有新增生产依赖。

## 使用路径

1. 在当前或历史诊断报告的行动清单中点击“加入改进任务”。相同报告的同一建议重复添加不会产生新任务。
2. 从侧栏“改进任务”、项目详情或报告进入 `/tasks`，按项目和状态筛选。
3. 点击“记录进展与材料”，在弹窗中保存状态、最多 2000 字笔记和最多 4 份附件。复用原有图片/PDF/TXT 与 OCR 上传能力；关闭弹窗保留本页输入，刷新前需要保存。
4. 点击“针对这项复训”，默认选中这项任务。也可从历史报告进入二次训练，最多选择本报告 5 项已保存任务。不选任务时使用原报告薄弱点与建议。
5. 选择原答辩资料，或当前浏览器保存的项目版本。当前版本需要匹配的真实画像；缺少时经用户确认后先调用现有分析服务，再创建独立会话。分析或存储失败会显示原因，不切换模拟模式。
6. 本场问题获得旧报告重点、当前项目与所选任务进度/材料。结束后仍通过原报告服务生成独立评分，历史对比使用各场实际保存结果。

## 数据和兼容性

- `packages/shared/src/improvements.ts` 定义任务、进度与复训任务快照。任务保留源报告、源会话、建议索引、原始行动、完成标准及引用；来源建议不可由进度编辑覆盖。
- LocalStorage 独立键 `defense-chamber.improvements.v1`，上限 300 项、1 MiB；读取、写入与回读均校验。损坏/旧版本不覆盖，容量不足不提示成功。跨页/标签更新沿用 storage 事件，过期编辑不能覆盖其他页面的新记录。
- 任务导出 JSON 包含笔记、任务来源和附件引用/提取文字，不含附件原文件；不是完整工作区备份，当前没有提供任务备份导入。
- `POST /api/v1/defense/sessions/:id/retrain`（兼容 `/api`）保留原 `{requestId, judgeId}` 请求，增加可选 `current: {project, analysis}` 和 `taskUpdates`。
- `taskUpdates` 为最多 5 项 `{improvementIndex, status, note, attachments?}`，禁止重复索引。后端从原始报告读取行动与完成标准，校验项目 ID/版本、真实画像匹配和后端附件，不能伪造另一份任务建议。
- 新会话保存所选项目、画像及任务进度的快照，后续编辑任务不会改写该会话。旧会话可不含新增元数据；旧报告来源指纹计算保持兼容，新版复训报告指纹包含复训快照。
- 创建请求在发送前保存。网络/超时等不确定失败保留原 ID 和完整选定资料，可在刷新后安全重试；明确的参数/附件拒绝允许修正输入后重建。不同创建内容不能覆盖尚待确认的原创建。
- 笔记和 done 状态属于用户自行记录，模型上下文明确标为 `user_progress_not_verified`，不代表事实已验证。评分引用仍须属于本场真实回答，任务状态不会直接加分。
- 任务资料进入现有附件读取路径；仍有最多 8 份材料与默认 6000 字文档预算，可能省略内容。会话上下文只放有界笔记和附件元信息，避免把整份文档重复塞进上下文。

## 主要文件

- 共享类型：`packages/shared/src/improvements.ts`、`defense.ts`、`index.ts`。
- 后端：`services/retraining-plan.ts`、`defense-service.ts`、`defense-context.ts`、`defense-model.ts`、`defense-guidance.ts`、`report-service.ts`、`report-context.ts`。
- 前端：`services/improvement-storage.ts`、`stores/improvements.ts`、`composables/useRetrainingPreparation.ts`、`components/improvements/ImprovementTaskCard.vue`、`views/ImprovementTasksView.vue`、`views/HistoryTrainView.vue`。
- 入口与展示：`ReportResults.vue`、`TrainingSummary.vue`、报告/项目详情视图、路由、共享工作区导航、`useProjectSync.ts`、`styles/improvements.css` 与 `main.ts`。
- 测试：任务存储、当前版本复训准备、任务页面 SSR、后端复训 API/真实临时附件与现有报告页面回归。

上述后端路径相对 `apps/server/src`，前端路径相对 `apps/web/src`。

## 实际验证

- `npm run typecheck`：共享包、后端、前端通过。
- `npm run build`：共享包、后端、前端生产构建通过，前端构建包含最终版本的类型检查。保留依赖 Zod 的两处 PURE 注释位置警告，未阻塞构建。
- `node node_modules/vitest/vitest.mjs run --no-file-parallelism`：51 个文件、443 项通过。包含原完整流程回归，以及新增的任务持久化/去重/损坏与容量保护、过期编辑、当前版本复训、画像失败、重复点击、创建请求刷新恢复、明确拒绝后的修正、版本竞态、临时真实附件读取及任务页面 SSR。
- 开发中修正了报告页项目名称变量、测试画像引用仍指向旧文字的问题；组件回归定位并修复了任务深链接首次渲染没有选中的初始化顺序问题。没有放宽字段/引用校验。
- 全量回归发现旧导航测试的路由夹具缺少 `/tasks`；已补齐并单独复验导航测试。没有屏蔽 Vue Router 警告。
- 导航相关 12 项单独复验通过；`/tasks`、新增任务页/复训页的 Vite 模块及 `/api/v1/health` HTTP 检查均为 200。HTTP 可访问不等同于完成浏览器交互验收。
- 页面测试属于 SSR/状态测试，接口测试使用合成资料和受控模型响应，真实文件测试只读写新建临时目录；没有调用真实模型或读取用户业务数据，不能视为浏览器端到端视觉验收。

## RAG 后续范围

本轮没有实现 RAG 或 Agent。下一阶段可复用已关联的项目/任务附件，建立项目范围内的文档分块、版本与页码定位、检索服务，再让分析和评委根据当前问题读取相关原文。应测试后半段材料召回、无匹配时的空结果、引用存在性以及对文件内指令的隔离。

初版可以评估本地关键词检索，确有语义检索需求后再接入 embedding 与向量索引；模型服务配置需要独立验证 embedding 能力，不能只根据聊天接口兼容就默认支持。外部网页搜索不属于本地 RAG，需另行设计来源和资料发送范围。

当前任务、项目和部分历史仍依赖浏览器存储，附件依赖本机后端；未引入账号、云端同步或公共多用户部署。仍需在允许访问的真实浏览器中完成桌面和移动端交互验收。本轮未调用真实模型，协议/组件测试不能证明实际模型的追问质量。
