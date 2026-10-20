# 第二阶段交付与验证

日期：2026-10-20。范围：在现有 Vue / Express / shared 工作区上增加项目创建、本地保存、详情和首页交互。

## 可用流程

1. 首页点击“创建项目”，进入 `/projects/new`。
2. 填写八项资料，或载入明确标记的示例。覆盖已有输入前会要求确认替换。
3. 提交时校验所有必填字段、枚举与长度；错误摘要可定位字段。
4. 写入 LocalStorage 并回读确认，成功后跳转 `/projects/:id`。
5. 刷新详情仍可读取；首页显示最近三个项目。
6. “开始答辩”进入 `/defense`，可选择项目；从详情进入时携带项目 ID 并展示保存的难度。

答辩入口本轮提供的是项目选择和准备，AI 问答、项目画像、评分与报告均未接入。首页规划功能有明确标记。

## 主要文件

| 范围 | 文件 |
| --- | --- |
| 共享数据契约 | `packages/shared/src/project.ts`、`packages/shared/src/index.ts` |
| 存储与状态 | `services/project-storage.ts`、`stores/projects.ts` |
| 表单逻辑 | `composables/useProjectForm.ts`、`data/project-form.ts` |
| 多标签页同步 | `composables/useProjectSync.ts` |
| 公共布局 | `layouts/WorkspaceLayout.vue` |
| 组件 | `ProjectForm.vue`、`ProjectCard.vue`、`RecentProjects.vue`、`StorageNotice.vue`、`ui/FormField.vue` |
| 页面 | `HomeView.vue`、`ProjectCreateView.vue`、`ProjectDetailView.vue`、`DefensePrepareView.vue` |
| 路由与样式 | `router/index.ts`、`main.ts`、`styles/projects.css` |
| 现有组件复用 | `AppButton`、`BrandMark`、`HealthStatus`、`JudgeCard`；`StageDialog` 更新为当前阶段说明 |
| 测试 | `tests/project-validation.test.ts`、`tests/project-storage.test.ts`、`tests/projects-store.test.ts`、测试 fixtures |

除共享包文件外，表中路径相对于 `apps/web/src`。后端业务代码、API 密钥处理和既有健康接口未改动。没有增加依赖或改写原始产品方案。

## 数据和失败处理

- 共用 Zod schema 派生 `ProjectInput` / `Project`，覆盖八项输入、UUID、创建与更新时间。
- 字符串去除首尾空白，空白内容不视为有效填写；所有字段必填。
- 文本长度上限：名称 80、简介 4000、目标用户 1000、核心功能 3000、技术方案 3000、价值说明 2000。
- 项目类型和难度使用固定枚举；时间按 ISO UTC 保存，在浏览器本地时间显示。
- 存储键：`defense-chamber.projects.v1`；结构为 `{ version: 1, projects: Project[] }`。
- 只有缺少存储键才按新工作区处理；损坏 JSON、非法记录、重复 ID 和未知版本会报错，不能静默置空再覆盖。
- 保存先读取持久化的最新列表，成功写入并回读一致后才更新 Pinia 并跳转。
- 写入失败、空间不足、权限错误或结果无法确认时保留表单，不显示成功；结果不确定时再次提交同一资料复用原记录 ID，减少重试重复创建。
- 提交期间禁用字段和按钮，store 也阻止重复提交。
- 浏览器 storage 事件触发重新加载。数据仅属于当前浏览器来源；不同浏览器、端口和设备不会共享。
- 所有用户内容通过 Vue 文本绑定展示，不作为 HTML 执行。

## 验证

- `npm run typecheck`：前端、后端与共享包通过。
- `npm test`：4 个测试文件，49 项通过（含既有健康接口 5 项）。
- `npm run build`：共享包、后端和前端生产构建均通过。

新增 44 项测试覆盖表单空值与空白、类型和难度、长度限制、记录元数据、存储版本与数据损坏、读写失败、静默丢弃写入、刷新恢复、保存前读取新记录、重复提交、保存失败保留输入，以及不确定保存的幂等重试。

浏览器已实际完成：空项目入口与空状态、空表单错误与焦点、示例替换确认、创建示例项目、类型和高压难度选择、自动进入详情、刷新恢复、首页最近项目、答辩项目选择和切换。
已检查 1280 × 900 桌面与 390 × 844 窄屏：创建页、详情页和主要控件布局正常，390px 创建页无横向溢出。构建预览 4173 可直接访问 `/projects/new`；不同来源中缺失的项目显示友好提示和返回入口。

构建仍有与第一阶段相同的两条 Zod 依赖注释警告，构建退出码为 0；没有新增依赖或隐藏警告。浏览器验证中保留了一条名称含“示例”的项目记录，未接入真实模型。

## 后续

下一阶段先接入服务端项目画像分析：统一模型客户端、环境变量校验、结构化输出及失败重试，再推进独立评委提示词和答辩会话。当前不生成任何伪装为模型结果的内容。
