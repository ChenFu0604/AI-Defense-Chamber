# 第九阶段：全项目整合与 UI 优化

日期：2026-10-20。保留现有 Vue / Pinia / Express / Zod 架构，没有替换依赖或重写业务模块。

## 发现并修复的问题

1. 手机导航通过子元素位置隐藏了历史入口；改为保留历史与答辩准备，答辩子页面也有导航高亮。
2. 首页将已实现的问答和报告标成“规划中”；创建页和难度说明也有过期文案，现与实际能力一致。
3. 报告曾读取成功后，同场重新读取返回不存在或来源损坏，仍会保留旧结果；现在清除不可用结果，网络临时失败仍保留已有结果并显示错误。
4. 离开报告后旧错误和归档警告残留；准备页可能显示上一场操作错误。增加清理入口及离开时的请求代际保护，保留已有草稿和创建请求 ID。
5. 会话/报告页读取完成后可能在已经离开的页面继续生成首问或请求报告；增加生命周期与会话标识检查。
6. 刷新失败会话后，消息和重试操作恢复了，但服务端错误原因未显示；现从保存的会话恢复错误信息。
7. 360px 窄屏因强制最小宽度产生横向溢出；移除移动端 360px 强制规则，最低支持 320px。
8. 工作区卡片存在多套间距、背景、圆角；集中统一工作区令牌，保留风险边框及评委颜色。普通禁用按钮使用不可操作光标，busy 状态单独表达，支持减少动效偏好。
9. 评分对比页在路由查询变化时未更新选项，且仅比较项目简介判断资料变化；现同步查询参数并比较统一项目输入快照。

## 完整流程实测

浏览器使用独立 5174 来源及临时文件服务，所有模型响应与评分均明确标记为固定测试数据。没有将用户现有资料发送到第三方，没有修改正式 5173 项目、会话和模型配置。该来源已有上阶段固定测试记录，本次另建新项目与两场会话，比较仅选本次生成的两份报告。

| 步骤 | 实际结果 |
| --- | --- |
| 首页 | 产品、四角色、功能、空状态与创建入口可见 |
| 创建项目 | 空提交显示六个缺失文本字段；填写八项资料后保存、跳转详情 |
| 项目分析 | 调用测试模型适配器，校验结构和资料引用；刷新后从本地恢复 |
| 选择评委开始答辩 | 确认项目后创建新会话，商业评委生成首问 |
| 多轮回答与追问 | 注入一次 503，保留回答；刷新后原请求恢复并重试成功；切技术评委后继续回答 |
| 结束答辩 | 结束状态与完整记录保留，进入报告 |
| 评分报告 | 生成并保存，五维 71/52/64/59/66，代码等权计算 62.4；刷新读取原报告 |
| 漏洞地图 | 4 个节点、1 条共同依据关联；打开原文详情；筛选低风险显示空状态；页面返回重建、缩放/适应画布正常 |
| 本地历史 | 归档项目、画像、结束会话与报告；历史详情读取原快照 |
| 二次训练 | 从原报告弱点创建新 ID，会话显示训练重点，魔鬼评委首问，回答后结束生成新报告 |
| 评分对比 | 两份保存的测试报告均 62.4，各维度变化均为 0，不添加虚构进步 |

桌面约 1280px 及手机 390px/360px 视口检查：报告、雷达图、风险地图、历史/比较、首页、表单与设置；390px 报告/地图无横向溢出，360px 首页/表单/设置修复后 document.scrollWidth 等于 clientWidth。窄屏地图语义按钮点击曾遇到浏览器自动化定位错误，改用其键盘 Enter 成功打开详情；桌面点击正常。检查到的浏览器 console warn/error 为空。没有执行所有浏览器/设备组合，也未自动记录浏览器网络瀑布；重复调用由接口及 store 测试验证。

## 实际测试与构建

- 修改前：`npm test`，30 个文件、302 项通过。
- 新增接口贯穿测试：`node node_modules/vitest/vitest.mjs run apps/server/src/tests/workflow.test.ts`，2 项通过。
- 最终 `npm test`：32 个文件、309 项通过，包括 Vitest、Supertest、Pinia 状态、SSR 组件、ECharts SVG 与持久化恢复测试。
- `npm run typecheck`：shared、server、web 类型检查通过。
- `npm run build`：shared、server、web 生产构建通过。
- `git diff --check`：通过。

新接口测试经过实际 Express 路由、真实 AI JSON 客户端与 Zod 校验、文件仓库，模型 transport 使用固定响应。覆盖分析→首问→两轮回答→切评委→幂等重发→结束→并发报告去重→新服务实例读取磁盘→漏洞关联→二次训练→保存报告比较；另覆盖空回答、上游失败、同请求重试、非法报告不保存和恢复。

构建仍有 Zod 依赖中两条 Rollup 注释位置警告，不影响构建。本项目没有单独 lint 脚本，未声称执行 lint。浏览器验证通过 CUA 实际操作，尚未提供可在 CI 自动播放的浏览器 E2E 脚本。

## 修改文件

| 文件 | 作用 |
| --- | --- |
| `apps/web/src/stores/defense.ts` | 恢复失败原因、准备页状态生命周期 |
| `apps/web/src/stores/report.ts` | 不可用报告清除及离开页错误清理 |
| `apps/web/src/components/defense/DefenseStartPanel.vue` | 创建请求离开保护、切项目清理、busy |
| `apps/web/src/views/DefenseSessionView.vue` | 首问异步生命周期防护 |
| `apps/web/src/views/DefenseReportView.vue` | 离开后停止后续报告读取 |
| `apps/web/src/views/HistoryTrainView.vue` | 训练准备重置、离开保护、busy |
| `apps/web/src/views/HistoryCompareView.vue` | 路由选项同步、完整资料变化提示 |
| `apps/web/src/components/ui/AppButton.vue` | 统一 busy 禁用与 aria-busy |
| `apps/web/src/styles/main.css` | 设计令牌、禁用反馈、窄屏宽度 |
| `apps/web/src/styles/projects.css` | 手机历史与答辩入口 |
| `apps/web/src/styles/workspace.css` | 卡片、标题、提示、表单焦点、移动端和减少动效 |
| `apps/web/src/main.ts` | 引入统一工作区样式 |
| `apps/web/src/layouts/WorkspaceLayout.vue` | 导航语义、高亮、阶段标记 |
| `apps/web/src/views/HomeView.vue` | 当前功能状态文案 |
| `apps/web/src/views/ProjectCreateView.vue` | 删除过期阶段说明 |
| `apps/web/src/components/ProjectForm.vue` | 难度说明同步 |
| `apps/web/src/components/StageDialog.vue` | 阶段九说明 |
| `apps/web/src/tests/defense-store.test.ts` | 离开创建页迟到响应及失败原因回归 |
| `apps/web/src/tests/report-store.test.ts` | 不存在/来源异常报告与路由错误回归 |
| `apps/web/src/tests/workspace-ui.test.ts` | 共享按钮 SSR busy 状态 |
| `apps/server/src/tests/workflow.test.ts` | 跨模块 Supertest 完整流程 |
| `tests/fixtures/workflow.ts` | 独立临时仓库和固定模型 transport |
| `tests/preview.local.ts` | 可重复的隔离浏览器测试环境 |
| `README.md`、`docs/phase-9.md` | 当前状态、验收方式及限制 |

## 模型配置与能力边界

生产功能：项目分析、四评委和多轮追问、报告均已接统一真实模型客户端，需要在设置页保存配置，或在 **apps/server/.env** 设置 `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_BASE_URL`。本阶段没有进行付费服务商真实模型验收，因此不能据固定响应的流程验证推断生成质量、延迟或服务商可用性。

可选：`AI_TIMEOUT_MS`（默认 120000，1000～300000）、`AI_RESPONSE_FORMAT`（json_schema / json_object）、`HOST`、`PORT`、`WEB_ORIGIN`，必要时 HTTP_PROXY / HTTPS_PROXY / NO_PROXY。设置页保存配置优先于环境变量；前端不保存密钥，不使用 VITE_ 密钥。

主动选择的 demo 分析/答辩是原有模拟模式；demo 会话不能生成真实评分。新测试 fixture 只用于验收，没有接入正式产品运行路径。

核心十二步均已有实现，仍有以下限制与未实现增强：

- 本地个人训练，无账号或云端同步；LocalStorage 归档 3 MiB，清除浏览器数据会丢本地项目与历史，只有导出备份，尚无导入/图形化清理。
- 会话和报告文件只在本机后端持久化；锁与报告去重限单服务实例，不适合多进程部署。
- 四个角色顺序复用一个模型；没有并行多 Agent 编排。普通 JSON 请求，无 SSE、语音或文件解析。
- 评分是受模型与样本影响的主观训练建议；风险关系只表示共同依据，未实现经过证实的因果推断。
- 引用校验只能证明原文存在，不能证明原文或模型解释真实。
- 当前界面支持空/错/加载与恢复，但仍需持续扩展可访问性审计、跨浏览器回归、实际服务商质量评估。

建议下一轮优先建立 CI 和可重放浏览器 E2E，再增加备份导入、容量管理与 SQLite；有实际并发需求后再扩展存储锁和身份权限。保持当前阶段范围，不在本轮提前实现这些增强。
