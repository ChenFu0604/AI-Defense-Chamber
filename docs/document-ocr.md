# 项目文档导入与本地 OCR

## 使用方式

- 创建页顶部的“导入项目文档”与“载入示例”并列。导入按钮打开 PDF/TXT 文件选择，同时展开表单前的材料区并开启 OCR。图片仍可使用材料区的上传或拖拽入口。
- 文档文字或 OCR 结果可预览、编辑，选择字段后追加；不会自动覆盖已填写内容，也不调用模型猜测八个字段。
- 图片和答辩回答区也可勾选“OCR 识别扫描件和图片文字”；仅作为图片附件时可关闭 OCR。识别无文字会明确报错，不能把失败当作导入成功。
- 侧栏原“了解开发进度”整块提示卡及按钮已移除。

## 识别行为与限制

使用 [Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) 和 npm 安装的中英文语言数据，全部在本机后端运行；不使用模型密钥，不向外部 OCR 服务发送文件，运行时不下载语言数据。扫描 PDF 使用现有 [PDF.js Node 渲染接口](https://github.com/mozilla/pdf.js/blob/master/examples/node/pdf2png/pdf2png.mjs) 转为像素后识别。

- 支持简体中文、英文横排印刷文字。手写、竖排、复杂表格和版面不保证准确；输出是待核对的识别文本，不是已验证事实。
- PDF 先逐页提取原生文字，仅对无文字层页面尝试 OCR。含少量文字层的混合页面不会再对图片区域重复识别。
- PDF 最多 40 页，其中最多 3 页进行 OCR。超出 OCR 上限的页码保存在 `ocr.skippedPages` 并显示拆分提示，不用虚构文字补齐。
- 扫描页最长边限制为 2200 像素，OCR 最长 90 秒；普通 PDF 解析保持 15 秒限制。文件大小和每次 4 个附件的限制不变。
- 最多保存 12000 字；发生页数或文字截断时标记“仅保留部分”。OCR 元信息包含识别页码和引擎置信度，置信度不等于事实准确率。
- 上传中禁止重复操作；超时、空白识别、损坏文档或依赖不可用返回明确错误。失败不写入成功附件。
- 已有附件、项目和历史记录不自动修改；新增 `ocr` 为可选字段。OCR 创建在上传阶段完成，避免事后修改附件元信息使历史快照失效。
- 扫描 PDF 的提取文字可直接作为后续文本上下文。图片仍保留原有视觉输入，使用图片理解时所选模型需要支持视觉。

## 接口与部署

`POST /api/v1/attachments?ocr=true`（兼容 `/api/attachments`）。省略参数或 `ocr=false` 保持原上传行为；无效 OCR 参数返回 400。前端及后端复用共享 Zod 类型，响应通过同一附件 Schema 校验。

新增后端依赖 `tesseract.js`、`@tesseract.js-data/chi_sim`、`@tesseract.js-data/eng`；已有 PDF.js 的可选依赖 `@napi-rs/canvas` 提升为直接依赖，确保部署时包含 PDF 渲染支持。根目录运行 `npm install` 后重启后端，无需增加环境变量。语言数据及 WASM 由依赖提供，不提交到仓库。

识别在独立 worker 中运行；继续沿用最多两个附件处理任务的限流，超时终止 worker，结束后清理临时语言数据。提交给模型的 OCR 文字有明确的可能错漏说明，并沿用上下文长度限制。

## 验证边界

后端使用测试生成的固定中英文图片（`tests/fixtures/ocr-sample.png`，不含用户资料），实际通过 OCR 识别；扫描 PDF 测试将该图片嵌入无隐藏文字层的 PDF，实际渲染和识别。覆盖 HTTP OCR 参数、图片识别与保存恢复、OCR 引文、文字版 PDF、扫描页数截断、空白失败和超时。前端测试覆盖顶部导入入口、OCR 参数发送、元信息校验和识别遗漏提示。

浏览器检查创建页按钮位置、材料区展开和 OCR 开关，以及桌面与 390px 窄屏布局。未执行浏览器文件选择器或拖拽上传端到端验证；实际文件识别通过后端接口测试验证，不将它描述为浏览器上传验证通过。没有调用真实 AI 模型。

本轮最终检查：`npm test` 为 36 个文件、329 项通过；`npm run typecheck` 前后端及 shared 通过；`npm run build` 前后端构建通过，仍有两条既有 Zod 注释位置警告。

构建后单独调用 `apps/server/dist/services/material-text.js` 识别测试图片，中英文断言均为 `true`，识别页码为 `[1]`。

主要修改位置：

| 文件 | 作用 |
| --- | --- |
| `apps/web/src/components/ProjectForm.vue` | 顶部导入按钮、材料区前移、保留原文字追加流程 |
| `apps/web/src/components/attachments/AttachmentUploader.vue` | 文档选择入口、OCR 选项、处理中状态 |
| `apps/web/src/components/attachments/AttachmentGallery.vue` | OCR 结果、部分识别和待核对提示 |
| `apps/web/src/layouts/WorkspaceLayout.vue` | 移除侧栏开发进度提示卡与按钮 |
| `apps/server/src/services/material-text.ts`、`pdf-text.ts` | 本地 OCR、PDF 逐页提取与渲染、时限与清理 |
| `apps/server/src/services/attachment-service.ts`、`routes/attachments.ts` | 校验参数、上传识别、持久化及模型材料上下文 |
| `packages/shared/src/attachments.ts`、`analysis.ts` | 跨端 OCR 元信息、校验及引文规则 |
| `apps/server/src/tests/ocr.test.ts`、`apps/web/src/tests/attachments.test.ts` | OCR 实测、上传与界面回归 |
