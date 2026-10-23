# 动态答辩对话布局

日期：2026-10-23。根据用户希望参考 Codex/ChatGPT 对话体验的要求，增量调整动态答辩页面；沿用简洁蓝白视觉，未更换后端 API、会话状态与存储格式。

## 实际变化

- 会话只展示一份连续消息流，保留评委身份、题型、原始问答、附件、辅助提示与评价依据。当前问题显示在消息流中，不再在页面上下重复展示。
- 对话区域独立滚动，输入区保持在对话底部。阅读旧消息时不强行滚动，提供“回到最新消息”入口。
- 根据后续截图反馈，仅在 `defense-session` 路由移除全局顶部栏和页脚，主内容使用全高 flex 布局分配剩余空间，不再减去固定高度；消息行与输入区加宽，输入框默认两行、随内容增高。移动端保留独立的模型设置入口，其他页面的顶部栏不变。
- 按用户最终标注，将项目标题放进白色对话框顶部中央；“切换评委”放在左侧当前评委名称与说明旁边，结束操作放在右侧会话来源和题数区域。窄屏分行显示，避免标题与操作重叠。
- 大型进度卡改为输入框底部的圆环按钮，点击打开轻量浮层，显示实际提问数、剩余题数、回答数、状态、评委和训练来源。这里只调整展示方式，没有新增 token、速度或成本统计。
- 根据用户最终反馈改为 Enter 发送、Shift + Enter 换行；保留 Ctrl/Cmd + Enter 发送兼容。输入法组字（含 keyCode 229）、长按重复、空回答、请求中与待重试状态不能再次发送。输入框内部移除重复焦点框与手动缩放角标，仅保留外层容器的焦点提示。
- 图片/文档、OCR 和回答求助改为独立弹窗，保留服务端保存、提示失败重试与“继续自己回答”。输入草稿继续使用原 Pinia/存储路径。
- 评委切换、议题、训练进度与项目附件集中到“评委与训练设置”弹窗。三个弹窗使用共享原生 `dialog.showModal()`，支持关闭按钮、Esc、点击背景关闭，利用原生模态行为管理焦点；背景对话不伸展、不变窄。弹窗内容保持挂载，关闭不会取消附件处理或提示请求，重开后可继续查看。
- 结束操作仍要求确认。结束后显示报告入口，可以在对话中查看讨论小结和保留的未提交草稿。
- 根据截图补齐报告“这次练习回顾”的内边距，将返回入口放在内容边距内；去掉内层讨论小结外框，将说明文字改为次要正文色，保留原始统计和结论边界。

## 修改位置

- `views/DefenseSessionView.vue`：消息流、输入与辅助面板的页面组织。
- `components/defense/DefenseChatComposer.vue`：独立回答表单、附件、求助与快捷发送。
- `components/defense/DefenseMessages.vue`：可复用的 chat/record 展示；报告与历史页继续使用 record 模式。
- `components/defense/DefenseProgressMenu.vue`：实际会话统计、圆环入口与原生 popover 浮层，不占输入区布局。
- `composables/useConversationScroll.ts`、`utils/defense-chat.ts`：滚动跟随与键盘规则。
- `layouts/WorkspaceLayout.vue`：仅在动态答辩路由移除顶部栏和页脚。
- `components/ui/AppDialog.vue`、`composables/useNativeDialog.ts`：共享模态弹窗与状态同步。
- `styles/defense-chat.css`、`styles/clean-workspace.css`、`styles/ui-dialog.css`、`main.ts`：对话布局、弹窗与回顾区修正。
- `tests/defense-chat.test.ts`、`session-ux.test.ts`、`blue-theme.test.ts`、`app-dialog.test.ts`：消息顺序、草稿/待重试状态、快捷键、滚动、路由外壳及原生弹窗状态回归。

## 验证

- `npm run typecheck`：共享包、后端与前端全部通过。
- `npm run build`：共享包、后端与前端生产构建通过。最后的 Enter/焦点框调整后再次执行 `npm run build --workspace @defense/web`，类型检查和生产构建通过。依赖 Zod 的两处 PURE 注释警告仍存在，未阻塞构建。
- `node node_modules/vitest/vitest.mjs run --no-file-parallelism`：48 个文件、425 项测试通过，覆盖会话恢复、接口流程、报告、附件/OCR、弹窗、滚动及真实题数展示。
- 最后调整 Enter 发送 / Shift+Enter 换行后，复跑 `defense-chat.test.ts`、`session-ux.test.ts`：2 个文件、10 项全部通过，包含输入法组字与长按防误发。
- 开发中修正了测试模拟对象的只读 `scrollHeight` 赋值、结束状态文案断言两处问题；没有放宽业务校验或删除测试。
- HTTP 检查首页、答辩入口、健康接口及最新会话/进度组件开发模块均返回 200；它们不能替代浏览器交互验收。
- `git diff --check`：通过。用户截图用于定位布局与焦点框问题，未声称完成浏览器自动化验收。

## 限制

- 本轮没有调用真实模型，也没有更改 Prompt。模拟会话仍明确标记，模拟数据不冒充真实模型反馈。
- 仍为普通 JSON 请求完成后展示完整消息，没有实现 SSE/token 流。
- 浏览器工具此前拒绝访问本地站点，本轮未绕过限制；自动测试与构建不能代替桌面和手机实屏验收。
