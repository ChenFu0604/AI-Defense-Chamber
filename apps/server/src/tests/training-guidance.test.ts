import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import {
  defenseSessionSchema, createDefenseRequestSchema, trainingSettings,
  assistanceRequestSchema, type DefenseSession, type AssistanceRequest,
} from '@defense/shared'
import { analysisProject } from '../../../../tests/fixtures/analysis.js'
import { defenseFixture } from '../../../../tests/fixtures/defense.js'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'
import { createDefenseRepository } from '../services/defense-repository.js'
import { createAssistanceModel, createClosingAssessmentModel } from '../services/defense-guidance.js'
import { buildReportContext, reportSourceFingerprint } from '../services/report-context.js'
import { type AIClient } from '../services/ai-client.js'
import { readAIConfig } from '../config/ai.js'
import { createDefenseService } from '../services/defense-service.js'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const root = resolve(directory)
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes('defense-guidance-')) throw new Error('Unsafe test cleanup path')
    await rm(root, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'defense-guidance-'))
  directories.push(directory)
  const fixture = createWorkflowFixture(directory), api = request(fixture.app)
  const analysis = (await api.post('/api/projects/analyze').send({project: analysisProject, mode: 'live'}).expect(200)).body.data
  const input = {requestId: crypto.randomUUID(), project: analysisProject, analysis, mode: 'live', judgeId: 'business',
    preferences: {style: 'guided', goal: 'users', questionLimit: 5}}
  await api.post('/api/defense/sessions').send(input).expect(201)
  const url = '/api/defense/sessions/' + input.requestId
  const session: DefenseSession = (await api.post(url + '/question').send({requestId: crypto.randomUUID()}).expect(200)).body.data
  return {...fixture, api, directory, url, input, session}
}
const helpInput = (session: DefenseSession, kind: AssistanceRequest['kind'] = 'hint'): AssistanceRequest =>
  ({requestId: crypto.randomUUID(), questionId: session.currentQuestionId!, kind})

describe('guided training and assistance', () => {
  it('shares the session lock with answers and end requests while help is in flight', async () => {
    const env = await setup(), input = helpInput(env.session)
    let entered!: () => void, complete!: (value: {data: {content: string}; model: string}) => void
    const started = new Promise<void>(resolve => {entered = resolve})
    const service = createDefenseService(env.repository, undefined, env.reportRepository, env.attachments, {
      assistance: async () => {entered(); return new Promise(resolve => {complete = resolve})},
    })
    const pending = service.help(env.session.id, input)
    await started
    await expect(service.help(env.session.id, {...input, requestId: crypto.randomUUID()})).rejects.toMatchObject({code: 'SESSION_BUSY'})
    await expect(service.answer(env.session.id, {requestId: crypto.randomUUID(), questionId: input.questionId, answer: '不能在帮助生成时推进同一场会话'})).rejects.toMatchObject({code: 'SESSION_BUSY'})
    await expect(service.end(env.session.id)).rejects.toMatchObject({code: 'SESSION_BUSY'})
    complete({data: {content: '【测试】先说一个具体场景。'}, model: 'held-test'})
    expect((await pending).assistance).toHaveLength(1)
  })
  it('never exposes an unsaved hint as success and can retry after a disk error', async () => {
    const env = await setup(), input = helpInput(env.session), save = env.repository.save
    env.repository.save = vi.fn().mockRejectedValueOnce(new Error('Test disk failure')).mockImplementation(save)
    await env.api.post(env.url + '/help').send(input).expect(500)
    expect((await env.api.get(env.url).expect(200)).body.data.assistance).toEqual([])
    await env.api.post(env.url + '/help').send(input).expect(200)
    expect(env.calls.defense_assistance).toBe(2)
  })
  it('labels demo hints and closing feedback and never calls the real-model adapter', async () => {
    const env = await setup(), generate = vi.fn()
    const demo = {...env.session, mode: 'demo' as const}
    const result = await createAssistanceModel({generate} as AIClient)(demo, helpInput(demo))
    expect(result.model).toBeNull()
    expect(result.data.content).toContain('模拟提示 · 固定模板')
    const final = await createClosingAssessmentModel({generate} as AIClient)(demo, {...demo.messages[0]!, content: '模拟回答'})
    expect(final.data.feedback).toContain('未评价实际回答质量')
    expect(generate).not.toHaveBeenCalled()
  })
  it('keeps legacy session rules and rejects invalid training choices', () => {
    const legacy = defenseFixture()
    expect(defenseSessionSchema.parse(legacy)).toEqual(legacy)
    expect(trainingSettings(legacy).questionLimit).toBe(30)
    expect(createDefenseRequestSchema.safeParse({requestId: legacy.id, project: legacy.project, analysis: legacy.analysis, mode: 'live',
      preferences: {style: 'guided', goal: 'general', questionLimit: 0}}).success).toBe(false)
    expect(assistanceRequestSchema.safeParse({requestId: crypto.randomUUID(), questionId: legacy.id, kind: 'write_answer'}).success).toBe(false)
  })
  it('saves real model-path assistance separately, caches per question/kind and restores from disk', async () => {
    const env = await setup(), input = helpInput(env.session)
    const first = (await env.api.post(env.url + '/help').send(input).expect(200)).body.data as DefenseSession
    expect(first.messages).toEqual(env.session.messages)
    expect(first.status).toBe('awaiting_answer')
    expect(first.assistance?.[0]).toMatchObject({...input, mode: 'live', model: '测试固定响应-非真实模型'})
    await env.api.post(env.url + '/help').send(input).expect(200)
    await env.api.post(env.url + '/help').send({...input, requestId: crypto.randomUUID()}).expect(200)
    expect(env.calls.defense_assistance).toBe(1)
    expect(await createDefenseRepository(join(env.directory, 'sessions')).get(first.id)).toEqual(first)
    expect(env.modelInputs.find(v => v.task === 'defense_assistance')?.context).toMatchObject({kind: 'hint', context: {trainingPreferences: env.input.preferences}})
    await env.api.post(env.url + '/help').send({...input, kind: 'rephrase'}).expect(409)
    await env.api.post(env.url + '/answer').send({requestId: input.requestId, questionId: input.questionId, answer: '同一个请求 ID 不能提交为回答'}).expect(409)
  })
  it('rejects invalid, stale, missing, ended and conflicted help requests', async () => {
    const env = await setup(), input = helpInput(env.session)
    await env.api.post(env.url + '/help').send({...input, kind: 'invalid'}).expect(400)
    await env.api.post(env.url + '/help').send({...input, questionId: crypto.randomUUID()}).expect(409)
    await env.api.post('/api/defense/sessions/' + crypto.randomUUID() + '/help').send(input).expect(404)
    await env.api.post(env.url + '/end').send({}).expect(200)
    await env.api.post(env.url + '/help').send(input).expect(409)
    expect(env.calls.defense_assistance).toBe(0)
  })
  it('retains a usable question after provider failure or invalid output and allows the same request retry', async () => {
    const env = await setup(), input = helpInput(env.session)
    env.failures.set('defense_assistance', 'http')
    await env.api.post(env.url + '/help').send(input).expect(502)
    expect((await env.api.get(env.url).expect(200)).body.data.messages).toEqual(env.session.messages)
    env.failures.set('defense_assistance', 'invalid')
    await env.api.post(env.url + '/help').send(input).expect(502)
    expect((await env.api.get(env.url).expect(200)).body.data.assistance).toEqual([])
    await env.api.post(env.url + '/help').send(input).expect(200)
    expect(env.calls.defense_assistance).toBe(3)
  })
  it('rejects assistance with broken references, duplicate IDs or mixed live/demo metadata', async () => {
    const env = await setup()
    const session: DefenseSession = (await env.api.post(env.url + '/help').send(helpInput(env.session)).expect(200)).body.data
    const entry = session.assistance![0]!
    for (const invalid of [
      {...session, assistance: [entry, entry]},
      {...session, assistance: [{...entry, questionId: crypto.randomUUID()}]},
      {...session, assistance: [{...entry, model: null}]},
      {...session, assistance: [{...entry, judgeId: 'technical'}]},
    ]) expect(defenseSessionSchema.safeParse(invalid).success).toBe(false)
  })
  it('enforces short training, evaluates the last answer without another question and excludes hints from report answers', async () => {
    const env = await setup()
    let session = env.session
    session = (await env.api.post(env.url + '/help').send(helpInput(session)).expect(200)).body.data
    const answers = ['计划访谈实验室管理员，了解预约冲突是怎样产生的，尚无实际记录。', '提交预约时检查时间段重叠，保留审批日志，故障恢复还没有验证。', '先让学生试用可取消的预约表单，观察操作阻力，不预设他们会愿意使用。', '应用价值准备通过人工沟通次数与等待时间验证，目前没有节约时间的数据。']
    for (let index = 0; index < 4; index++) {
      session = (await env.api.post(env.url + '/answer').send({requestId: crypto.randomUUID(), questionId: session.currentQuestionId,
        answer: answers[index]}).expect(200)).body.data
    }
    expect(session.messages.filter(m => m.sender === 'judge')).toHaveLength(5)
    const finalInput = {requestId: crypto.randomUUID(), questionId: session.currentQuestionId, answer: '最后一轮：先访谈一位用户，再明确下一步要验证的问题。'}
    env.failures.set('defense_assessment', 'invalid')
    await env.api.post(env.url + '/answer').send(finalInput).expect(502)
    const failed = (await env.api.get(env.url).expect(200)).body.data
    expect(failed.status).toBe('failed')
    expect(failed.messages.filter((m: {sender: string}) => m.sender === 'user')).toHaveLength(5)
    session = (await env.api.post(env.url + '/answer').send(finalInput).expect(200)).body.data
    expect(session.status).toBe('ended')
    expect(session.messages.filter(m => m.sender === 'judge')).toHaveLength(5)
    expect(session.closingFeedback?.assessment.answerQuote).toBe(finalInput.answer)
    await env.api.post(env.url + '/answer').send(finalInput).expect(200)
    expect(env.calls.defense_assessment).toBe(2)
    expect(env.calls.defense_turn).toBe(5)
    const context = buildReportContext(session)
    expect(context.answerCount).toBe(5)
    expect(JSON.parse(context.serialized).training.assistanceCount).toBe(1)
    await env.api.post(env.url + '/report').send({}).expect(200)
    expect(env.calls.defense_report).toBe(1)
  })
  it('preserves old report fingerprints when new optional fields are absent', () => {
    const legacy = defenseFixture()
    expect(reportSourceFingerprint({...legacy, assistance: []})).toBe(reportSourceFingerprint(legacy))
  })
  it('does not convert unconfigured, timed-out or malformed model assistance into a successful hint', async () => {
    const env = await setup(), input = helpInput(env.session)
    const unconfigured = createAssistanceModel({generate: async () => { readAIConfig({}); throw new Error('Expected missing configuration') }})
    await expect(unconfigured(env.session, input)).rejects.toMatchObject({code: 'AI_NOT_CONFIGURED'})
    const generate = vi.fn().mockRejectedValue(Object.assign(new Error('模型超时'), {code: 'AI_TIMEOUT'}))
    await expect(createAssistanceModel({generate} as AIClient)(env.session, input)).rejects.toMatchObject({code: 'AI_TIMEOUT'})
    generate.mockResolvedValue({data: {content: ''}, model: 'test'})
    await expect(createAssistanceModel({generate} as AIClient)(env.session, input)).rejects.toMatchObject({code: 'AI_INVALID_OUTPUT'})
    generate.mockResolvedValue({data: {answerQuote: '并不存在的回答'}, model: 'test'})
    await expect(createClosingAssessmentModel({generate} as AIClient)(env.session, {...env.session.messages[0]!, replyTo: env.session.currentQuestionId, content: '真实回答'})).rejects.toBeTruthy()
  })
})
