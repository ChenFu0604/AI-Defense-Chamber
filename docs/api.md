# API · v0.1.0（第三阶段）

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
答辩会话、回答、评分与报告接口仍未实现。
