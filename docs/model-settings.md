# 系统设置与模型配置

日期：2026-10-20。沿用现有 Vue / Express / TypeScript / Zod 和 AIClient，没有新增依赖。

## 使用

侧栏“系统设置”或手机右上角齿轮进入 `/settings`。

1. 填写 OpenAI 兼容 API Base URL、实际模型 ID 与密钥；系统追加 `/chat/completions`，不要填写完整方法地址。
2. 默认使用 JSON Schema；不支持时可显式切换 JSON Object，返回内容仍需通过 Zod 校验。
3. “测试连接”实际使用当前表单配置调用模型，验证固定 `{ok:true}` 响应。只发送固定测试文本，不发送项目和答辩资料；可能消耗少量模型额度。
4. “保存到后端”原子写入 `apps/server/.data/model-config.json`，保存成功且确认回读后才显示成功。测试不保存，保存也不代表连接已经验证。
5. 保存配置优先于环境变量；统一 AIClient 每次新请求读取配置，无需重启。重启后继续使用保存文件；未保存时沿用 `.env`。

已配置密钥时输入框保持空白，留空保留原密钥。更换 API 地址必须重新输入新地址对应的密钥，测试和保存均不会自动转发原密钥到新地址。

接口只返回 hasApiKey，不回传密钥或掩码占位值。密钥不进入 LocalStorage，保存成功或离开页面后从表单内存清除。后端本地文件不是加密保险库，保密性依赖本机文件权限；POSIX 新文件为 0600，Windows 使用项目目录 ACL。`.data/` 已被 Git 忽略。

## 实现文件

- packages/shared/src/settings.ts、index.ts：统一输入、公开配置及测试返回契约。
- apps/server/src/config/model-settings-file.ts：校验读取与损坏保护。
- apps/server/src/config/ai.ts：读取已保存配置并回退环境变量，缺配置提示设置入口。
- apps/server/src/services/model-settings-service.ts：密钥保留、目标变更保护、原子保存、真实连接测试。
- apps/server/src/routes/settings.ts、app.ts：配置 API、取消测试、本机来源与应用头校验。
- apps/web/src/services/model-settings-api.ts：请求、超时及响应校验。
- apps/web/src/composables/useModelSettings.ts：表单校验、提交状态、测试结果失效、失败保留和密钥清理。
- apps/web/src/components/settings/ModelConfigCard.vue、views/SystemSettingsView.vue、styles/settings.css：复用 AppButton 和 FormField 的深色设置页。
- apps/web/src/router/index.ts、layouts/WorkspaceLayout.vue、main.ts：路由、桌面和手机导航与样式接入。
- apps/server/src/tests/model-settings.test.ts、apps/web/src/tests/model-settings.test.ts、model-settings-api.test.ts：新增测试。
- README、两个 .env.example、docs/api.md、docs/architecture.md、本文：配置优先级和使用说明。

## 验证

- npm test：18 个文件、200 项通过，保留先前 175 项并新增 25 项。
- npm run typecheck：共享包、服务端和 Vue 前端通过。
- npm run build：全部通过，仍有两条既有 Zod 依赖注释警告。
- 后端测试覆盖保存与回读、重新创建服务后恢复、运行时加载器读取、空密钥保留、换地址禁止自动转发、环境变量导入、错误 URL、敏感 URL 信息脱敏、文件损坏、真实写入失败、来源限制、认证/限流/服务失败、格式异常、超时及响应不泄露密钥。
- 使用本机临时 HTTP 协议服务实际走通测试连接请求、鉴权头和结构化响应。服务返回受控夹具，不是大模型，也未保存到用户的实际配置目录。
- 前端测试覆盖校验、防重复提交、测试不保存、编辑后测试结果失效、保存后清空密钥、失败保留输入、卸载取消、禁止浏览器持久化与响应契约。
- 浏览器已确认手机入口、设置卡片、默认配置读取、缺少模型和密钥的错误提示。没有为验证页面而保存虚假生产配置，也没有调用外部真实模型。

接口说明见 [API 文档](api.md)。当前设置接口按本机应用设计，并未增加远程管理员账号体系。

## 获取模型列表（2026-10-20）

在模型名称旁点击“获取模型”，后端根据当前 Base URL 与密钥请求 GET /models，无需先填写模型名称。返回结果去重排序后显示为下拉选项；保留手动输入入口及未在列表中的当前值。选择后仍需测试连接并保存，获取列表不会保存配置，也不会自动选择第一个模型。

地址或密钥变化会清空旧列表。空列表、格式异常、认证失败、不支持列表接口和超时均明确显示，不编造模型。不按名称猜测模型能力；列表中可能包含不支持 Chat Completions 的模型，需由测试连接验证。

新增 POST /api/v1/settings/model/models（兼容 /api/settings/model/models），请求 `{baseUrl,apiKey?,timeoutMs}`，返回 `{success:true,data:{models:string[]}}`。沿用本机来源限制、原密钥保留和更换地址必须重新填写密钥的规则，响应体最大 512 KiB，列表最多 5000 项；不会将密钥放入 URL 或返回给前端。

核心改动：shared/settings、model-list-client、model-settings-service、settings 路由、model-settings-api、useModelSettings 和 ModelConfigCard，以及对应测试。没有新增依赖。

本轮 npm test：19 文件、221 项通过，新增 21 项。类型检查及生产构建通过，仍有既有 Zod 注释警告。测试覆盖格式、去重、空列表、错误状态、超时、取消、响应上限、密钥保护、不需要模型名、源变化后丢弃旧列表、选择后保存及手动值保留。浏览器已通过本机临时协议服务实际验证获取、下拉选择和手动输入切换；测试模型 ID 以 ui-fixture- 开头，没有保存到实际配置，也没有调用外部服务商。

协议依据：[OpenAI Docs — List models](https://developers.openai.com/api/reference/resources/models/methods/list)。

## 连接失败修复：后端代理

本机 Node 22.15 原生 fetch 未自动使用已配置的 HTTP_PROXY / HTTPS_PROXY，直连 OpenAI 出现 UND_ERR_CONNECT_TIMEOUT。相同地址通过现有代理能正常返回 401 未认证响应，确认问题位于网络传输而非模型列表格式。

新增 undici ^7.30.1（兼容项目 Node 22.15），以请求级 EnvHttpProxyAgent 适配模型网络请求。获取模型、测试连接、画像和答辩使用同一传输；遵循 HTTP_PROXY / HTTPS_PROXY / NO_PROXY 及小写环境变量，不修改全局 dispatcher，不改系统代理，不关闭 TLS 证书校验。localhost、127.* 和 ::1 本地服务直接访问。变量可以由启动终端继承，或填入 apps/server/.env 后重启；Windows 系统代理设置本身不被自动读取。

获取模型列表和模型生成请求的连接错误现区分连接超时、域名解析、连接拒绝和证书问题，只返回固定诊断文案，不回传底层错误中的地址、令牌或密钥。

验证：新增本地 CONNECT 代理测试覆盖模型列表与结构化生成、本机服务直连、NO_PROXY、无代理路径和脱敏错误诊断。实际运行传输适配器访问 OpenAI /v1/models 返回 HTTP 401；通过运行中的设置接口使用明确无效的诊断 key，也返回 AI_AUTH_ERROR，证明代理链路通畅。没有使用用户密钥，没有调用生成模型，没有把诊断配置保存到后端。协议依据：[Undici EnvHttpProxyAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/EnvHttpProxyAgent.md)。
