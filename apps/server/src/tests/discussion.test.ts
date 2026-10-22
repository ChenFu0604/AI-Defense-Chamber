import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { defenseSessionSchema, discussionSummary, type DefenseSession, type TopicStateRequest } from '@defense/shared'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'
import { analysisProject, analysisFixture } from '../../../../tests/fixtures/analysis.js'
import { defenseFixture } from '../../../../tests/fixtures/defense.js'
import { availableTopics, recordDiscussionAssessment, discussionPlan } from '../services/defense-discussion.js'
import { createDefenseModel } from '../services/defense-model.js'
import { createDefenseService } from '../services/defense-service.js'
import { createDefenseRepository } from '../services/defense-repository.js'
import type { AIClient } from '../services/ai-client.js'

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) {
    const root = resolve(directory)
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes('discussion-test-')) throw new Error('Unsafe cleanup')
    await rm(root, {recursive: true, force: true})
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'discussion-test-'))
  directories.push(directory)
  const fixture = createWorkflowFixture(directory), api = request(fixture.app)
  const analysis = (await api.post('/api/projects/analyze').send({project: analysisProject, mode: 'live'}).expect(200)).body.data
  const input = {requestId: crypto.randomUUID(), project: analysisProject, analysis, mode: 'live', judgeId: 'business',
    preferences: {style: 'guided', goal: 'users', questionLimit: 10}}
  await api.post('/api/defense/sessions').send(input).expect(201)
  const url = '/api/defense/sessions/' + input.requestId
  const session: DefenseSession = (await api.post(url + '/question').send({requestId: crypto.randomUUID()}).expect(200)).body.data
  return {...fixture, api, directory, url, session}
}
const answerInput = (session: DefenseSession, answer: string) => ({requestId: crypto.randomUUID(), questionId: session.currentQuestionId, answer})
const editInput = (session: DefenseSession, topicId: TopicStateRequest['topicId'], status: TopicStateRequest['status']): TopicStateRequest =>
  ({requestId: crypto.randomUUID(), expectedRevision: session.discussion!.revision, topicId, status, note: '用户更正：这部分先记录，稍后补充实际验证。'})
async function answer(env: Awaited<ReturnType<typeof setup>>, session: DefenseSession, content: string) {
  return (await env.api.post(env.url + '/answer').send(answerInput(session, content)).expect(200)).body.data as DefenseSession
}

describe('discussion memory and topic workflow', () => {
  it('gives explicit next-topic branches matching post-assessment validation', async () => {
    const env = await setup(), s = env.session
    s.pending = {type: 'answer', requestId: crypto.randomUUID(), fingerprint: 'x'.repeat(64), questionId: s.currentQuestionId, judgeId: 'business', answerMessageId: crypto.randomUUID()}
    const assessment = {answerQuote: '回答', evaluation: 'sufficient' as const, feedback: '已说清', nextStrategy: 'test_boundary' as const, risks: []}
    const plan = discussionPlan(s)!
    expect(plan.recommendedTopicId).toBe('needs')
    expect(plan.afterSufficientOrChangeDirection.availableTopicIds).toEqual(availableTopics(s, assessment))
    expect(plan.afterSufficientOrChangeDirection.availableTopicIds).not.toContain(plan.currentTopicId)
    s.discussion!.topics.slice(1).forEach(t => {t.status = 'paused'})
    expect(discussionPlan(s)!.afterSufficientOrChangeDirection).toMatchObject({availableTopicIds: [], recommendedTopicId: null, endIfEmpty: true})
  })
  it('carries a rejected topic into retry guidance and saves a valid replacement once', async () => {
    const env = await setup(), payload = {requestId: crypto.randomUUID(), questionId: env.session.currentQuestionId!, answer: '先用一个具体场景把需求说明白，再核对是否真的省时。'}
    const generate = vi.fn().mockResolvedValueOnce({model: 'test', data: {
      question: env.session.messages[0]!.question, topicId: 'needs',
      assessment: {answerQuote: payload.answer, evaluation: 'sufficient', feedback: '场景已澄清。', nextStrategy: 'change_direction', risks: []},
    }}).mockImplementationOnce(async (task: {system: string; user: string}) => {
      expect(task.system).toContain('上次结果因议题选择不符合规则被拒绝')
      expect(JSON.parse(task.user).discussion.afterSufficientOrChangeDirection.availableTopicIds).not.toContain('needs')
      return {model: 'test', data: {topicId: 'solution', question: {...env.session.messages[0]!.question, question: '原型出错时准备怎样恢复刚才的操作？'},
        assessment: {answerQuote: payload.answer, evaluation: 'sufficient', feedback: '场景已澄清。', nextStrategy: 'change_direction', risks: []}}}
    })
    const service = createDefenseService(env.repository, createDefenseModel({generate} as AIClient, env.attachments))
    await expect(service.answer(env.session.id, payload)).rejects.toMatchObject({code: 'AI_INVALID_TOPIC'})
    const restored = await service.answer(env.session.id, payload)
    expect(restored.error).toBeNull()
    expect(restored.discussion?.currentTopicId).toBe('solution')
    expect(restored.messages.filter(m => m.sender === 'user')).toHaveLength(1)
    await service.answer(env.session.id, payload)
    expect(generate).toHaveBeenCalledTimes(2)
  })
  it('does not persist an impossible judge switch when all topics are closed and allows an explicit reopen', async () => {
    const env = await setup()
    let session = env.session
    for (const topic of session.discussion!.topics)
      session = (await env.api.post(env.url + '/topic-state').send(editInput(session, topic.id, 'paused')).expect(200)).body.data
    const switched = await env.api.post(env.url + '/judge').send({requestId: crypto.randomUUID(), questionId: session.currentQuestionId, judgeId: 'technical'}).expect(409)
    expect(switched.body.error.code).toBe('TOPIC_REOPEN_REQUIRED')
    const saved = (await env.api.get(env.url).expect(200)).body.data
    expect(saved.pending).toBeNull()
    expect(saved.status).toBe('awaiting_answer')
    await env.api.post(env.url + '/topic').send({requestId: crypto.randomUUID(), questionId: session.currentQuestionId, topicId: 'solution', expectedRevision: session.discussion!.revision}).expect(200)
  })

  it('labels demo progress as program templates and can revisit a topic without calling the model adapter', async () => {
    const env = await setup(), id = crypto.randomUUID(), url = '/api/defense/sessions/' + id
    await env.api.post('/api/defense/sessions').send({requestId: id, project: analysisProject, analysis: analysisFixture('demo'), mode: 'demo', judgeId: 'business', preferences: {style: 'guided', goal: 'users', questionLimit: 10}}).expect(201)
    let session: DefenseSession = (await env.api.post(url + '/question').send({requestId: crypto.randomUUID()}).expect(200)).body.data
    for (const content of ['先列一份试用步骤，暂时没有实际观察。', '重新检查一次预约流程，之后再安排小范围访谈。'])
      session = (await env.api.post(url + '/answer').send(answerInput(session, content)).expect(200)).body.data
    expect(session.discussion!.currentTopicId).not.toBe('needs')
    expect(session.discussion!.topics[0]).toMatchObject({source: 'program', status: 'paused'})
    expect(session.discussion!.topics[0]!.note).toContain('模拟演示')
    session = (await env.api.post(url + '/topic').send({requestId: crypto.randomUUID(), questionId: session.currentQuestionId, topicId: 'needs', expectedRevision: session.discussion!.revision}).expect(200)).body.data
    expect(session.discussion!.topics[0]!.questionIds).toHaveLength(3)
    expect(session.messages.at(-1)?.content).toContain('【模拟')
    expect(session.messages.at(-1)?.model).toBeNull()
    expect(env.calls.defense_turn).toBe(1) // Only the live setup's first question.
  })
  it('stops automatic pursuit after two questions and shares grounded memory when another judge takes over', async () => {
    const env = await setup()
    expect(env.session.discussion?.topics).toHaveLength(4)
    expect(env.session.discussion?.currentTopicId).toBe('needs')
    let session = await answer(env, env.session, '先访谈实验室管理员，目前只是计划，还没有实际预约冲突记录。')
    expect(session.discussion?.currentTopicId).toBe('needs')
    session = await answer(env, session, '目标是减少学生来回询问空闲时间，我准备观察一次完整预约流程。')
    expect(session.discussion?.currentTopicId).not.toBe('needs')
    expect(session.discussion?.topics[0]?.questionIds).toHaveLength(2)
    const observations = session.discussion!.topics[0]!.observations
    expect(observations).toHaveLength(2)
    session = (await env.api.post(env.url + '/judge').send({requestId: crypto.randomUUID(), questionId: session.currentQuestionId, judgeId: 'technical'}).expect(200)).body.data
    const context = env.modelInputs.filter(v => v.task === 'defense_turn').at(-1)!.context as any
    expect(context.latestAnswer).toBeNull()
    expect(context.discussion.topics[0].observations).toEqual(observations.map(o => ({answerId: o.answerId, quote: o.quote, summary: o.summary})))
    expect(session.discussion!.topics[0]!.observations).toEqual(observations)
    expect(session.messages.at(-1)?.assessment).toBeNull()
    expect(await createDefenseRepository(join(env.directory, 'sessions')).get(session.id)).toEqual(session)
  })

  it('moves to another topic after no-evidence help without fabricating a clarified conclusion', async () => {
    const env = await setup()
    await env.api.post(env.url + '/help').send({requestId: crypto.randomUUID(), questionId: env.session.currentQuestionId, kind: 'no_evidence'}).expect(200)
    const session = await answer(env, env.session, '目前没有访谈数据，先把学生的预约步骤列出来，再找人试用。')
    expect(session.discussion?.currentTopicId).not.toBe('needs')
    expect(session.discussion?.topics[0]).toMatchObject({status: 'awaiting_evidence', source: 'ai'})
    expect(session.discussion?.topics[0]?.note).toContain('用户表示暂时没有数据')
  })

  it('preserves explicit corrections, checks revisions, and replays an edit without another model call', async () => {
    const env = await setup(), input = editInput(env.session, 'needs', 'clarified')
    const corrected: DefenseSession = (await env.api.post(env.url + '/topic-state').send(input).expect(200)).body.data
    expect(env.calls.defense_turn).toBe(1)
    expect(corrected.discussion?.topics[0]).toMatchObject({status: 'clarified', source: 'user', note: input.note})
    expect((await env.api.post(env.url + '/topic-state').send(input).expect(200)).body.data).toEqual(corrected)
    await env.api.post(env.url + '/topic-state').send({...input, note: '同 ID 不能改变内容'}).expect(409)
    await env.api.post(env.url + '/topic-state').send({...input, requestId: crypto.randomUUID()}).expect(409)
    await env.api.post(env.url + '/topic-state').send({...editInput(corrected, 'value', 'paused'), note: ' '}).expect(400)
    const session = await answer(env, corrected, '我把使用场景缩小到一间实验室，是否省时间还要实际验证。')
    expect(session.discussion?.topics[0]).toMatchObject({status: 'clarified', source: 'user', note: input.note})
    expect(session.discussion?.currentTopicId).not.toBe('needs')
    expect(session.discussion?.edits).toHaveLength(1)
  })

  it('reopens a chosen topic with a new visit budget, retains its history and safely retries a failed selection', async () => {
    const env = await setup()
    let session = await answer(env, env.session, '预约冲突需要从管理员现有表格核对，先整理出现冲突的时段。')
    session = await answer(env, session, '下一步让三位学生试用预约表单，记录取消和修改预约时遇到的困难。')
    const input = {requestId: crypto.randomUUID(), questionId: session.currentQuestionId, topicId: 'needs', expectedRevision: session.discussion!.revision}
    env.failures.set('defense_turn', 'http')
    await env.api.post(env.url + '/topic').send(input).expect(502)
    const failed: DefenseSession = (await env.api.get(env.url).expect(200)).body.data
    expect(failed.pending).toMatchObject({type: 'topic', ...input})
    expect(failed.discussion!.topics[0]!.budgetStart).toBe(2)
    expect(failed.discussion!.topics[0]!.observations).toHaveLength(2)
    expect(failed.discussion!.revision).toBe(input.expectedRevision + 1)
    session = (await env.api.post(env.url + '/topic').send(input).expect(200)).body.data
    expect(session.discussion!.topics[0]!.questionIds).toHaveLength(3)
    expect(session.discussion!.topics[0]!.budgetStart).toBe(2)
    expect(session.messages.find(m => m.id === input.questionId)?.status).toBe('superseded')
    await env.api.post(env.url + '/topic').send(input).expect(200)
    expect(env.calls.defense_turn).toBe(5)
  })

  it('never exposes an unsaved correction or generated question as success', async () => {
    const env = await setup(), save = env.repository.save
    env.repository.save = vi.fn().mockRejectedValueOnce(new Error('test disk failure')).mockImplementation(save)
    const input = editInput(env.session, 'needs', 'paused')
    await env.api.post(env.url + '/topic-state').send(input).expect(500)
    expect((await env.api.get(env.url).expect(200)).body.data.discussion).toEqual(env.session.discussion)
    await env.api.post(env.url + '/topic-state').send(input).expect(200)
    const payload = answerInput(env.session, '先做一版可取消的预约表单，之后观察学生会在哪一步停下来。')
    env.repository.save = vi.fn().mockImplementationOnce(save).mockRejectedValueOnce(new Error('test final write failure')).mockImplementation(save)
    await env.api.post(env.url + '/answer').send(payload).expect(500)
    const failed: DefenseSession = (await env.api.get(env.url).expect(200)).body.data
    expect(failed.messages.filter(m => m.sender === 'judge')).toHaveLength(1)
    expect(failed.discussion!.topics[0]!.observations).toHaveLength(0)
    const restored: DefenseSession = (await env.api.post(env.url + '/answer').send(payload).expect(200)).body.data
    expect(restored.messages.filter(m => m.sender === 'user')).toHaveLength(1)
    expect(restored.discussion!.topics[0]!.observations).toHaveLength(1)
  })

  it('finishes early when no topic remains, saves the last feedback and reads a recap without another model call', async () => {
    const env = await setup()
    let session = env.session
    for (const id of ['solution', 'value', 'assumptions'] as const)
      session = (await env.api.post(env.url + '/topic-state').send(editInput(session, id, 'paused')).expect(200)).body.data
    session = await answer(env, session, '首轮访谈准备了解一位管理员处理预约的步骤，暂时还没有记录。')
    session = await answer(env, session, '试用时先观察是否能完成取消预约，不把试用计划当成已经验证的效果。')
    expect(session.status).toBe('ended')
    expect(session.messages.filter(m => m.sender === 'judge')).toHaveLength(2)
    expect(session.closingFeedback?.assessment.answerQuote).toContain('试用时先观察')
    const recap = discussionSummary(session)!
    expect(recap.evidence.map(t => t.id)).toEqual(['needs'])
    expect(recap.uncovered.map(t => t.id)).toEqual(['solution', 'value', 'assumptions'])
    expect(recap.unassessedAnswers).toEqual([])
    await env.api.get(env.url).expect(200)
    await env.api.post(env.url + '/end').send({}).expect(200)
    await env.api.post(env.url + '/topic-state').send(editInput(session, 'needs', 'pending')).expect(409)
    expect(env.calls.defense_turn).toBe(3)
    expect(env.calls.defense_assessment).toBe(0)
    const report = (await env.api.post(env.url + '/report').send({}).expect(200)).body.data
    expect((await env.api.get(env.url + '/report').expect(200)).body.data).toEqual(report)
    await env.api.post(env.url + '/report').send({}).expect(200)
    expect(env.calls.defense_report).toBe(1)
    const reportContext = env.modelInputs.find(v => v.task === 'defense_report')!.context as any
    expect(reportContext.discussionSummary.uncovered.map((t: {id: string}) => t.id)).toEqual(['solution', 'value', 'assumptions'])
  })

  it('keeps unevaluated failed answers in the recap after manual end', async () => {
    const env = await setup()
    env.failures.set('defense_turn', 'invalid')
    await env.api.post(env.url + '/answer').send(answerInput(env.session, '先写清取消预约的流程，之后再核对实际使用反馈。')).expect(502)
    const session: DefenseSession = (await env.api.post(env.url + '/end').send({}).expect(200)).body.data
    expect(discussionSummary(session)?.unassessedAnswers).toHaveLength(1)
    expect(discussionSummary(session)?.unfinished.map(t => t.id)).toContain('needs')
    expect(session.messages.find(m => m.sender === 'user')?.content).toContain('取消预约')
  })

  it('rejects invented references, duplicate topics and out-of-budget links', async () => {
    const env = await setup(), session = await answer(env, env.session, '想先观察一位管理员怎样找空闲时段，当前还只是试用安排。')
    for (const mutate of [
      (s: DefenseSession) => {s.discussion!.topics[1]!.id = 'needs'},
      (s: DefenseSession) => {s.discussion!.topics[0]!.observations[0]!.quote = '从未说过的依据'},
      (s: DefenseSession) => {s.discussion!.topics[0]!.observations[0]!.questionId = crypto.randomUUID()},
      (s: DefenseSession) => {s.discussion!.topics[0]!.questionIds.reverse()},
      (s: DefenseSession) => {s.messages.find(m => m.sender === 'user')!.topicId = 'value'},
      (s: DefenseSession) => {s.discussion!.currentTopicId = 'value'},
    ]) {
      const broken = structuredClone(session); mutate(broken)
      expect(defenseSessionSchema.safeParse(broken).success).toBe(false)
    }
  })

  it('excludes a sufficient answer from further automatic questions and never overwrites user evidence status', async () => {
    const env = await setup(), session = env.session
    session.pending = {type: 'answer', requestId: crypto.randomUUID(), fingerprint: 'x'.repeat(64), questionId: session.currentQuestionId, judgeId: 'business', answerMessageId: crypto.randomUUID()}
    const assessment = {answerQuote: '一个具体场景', evaluation: 'sufficient' as const, feedback: '场景已说明，接下来检查实现边界。', nextStrategy: 'test_boundary' as const, risks: []}
    expect(availableTopics(session, assessment)).not.toContain('needs')
    session.discussion!.topics[0]!.status = 'awaiting_evidence'
    session.discussion!.topics[0]!.source = 'user'
    recordDiscussionAssessment(session, {...session.messages[0]!, id: session.pending.answerMessageId!, sender: 'user', replyTo: session.currentQuestionId, content: '一个具体场景'}, assessment)
    expect(session.discussion!.topics[0]!.status).toBe('awaiting_evidence')
    expect(session.discussion!.topics[0]!.source).toBe('user')
  })

  it('rejects model topic violations and null questions with a non-null topic', async () => {
    const env = await setup(), session = env.session
    const generate = vi.fn(), model = createDefenseModel({generate} as AIClient, env.attachments)
    const first = session.messages[0]!.question!
    session.discussion!.topics[0]!.status = 'clarified'
    generate.mockResolvedValue({data: {question: first, topicId: 'needs', assessment: null}, model: 'test'})
    await expect(model(session, 'business', first, null)).rejects.toMatchObject({code: 'AI_INVALID_TOPIC'})
    session.discussion!.topics.forEach(t => {t.status = 'paused'})
    const latest = '用户实际回答'
    generate.mockResolvedValue({data: {question: null, topicId: 'needs', assessment: {answerQuote: latest, evaluation: 'unclear', feedback: '仍需澄清。', nextStrategy: 'change_direction', risks: []}}, model: 'test'})
    await expect(model(session, 'business', first, latest)).rejects.toMatchObject({code: 'AI_INVALID_TOPIC'})
    generate.mockResolvedValue({data: {}, model: 'test'})
    await expect(model(session, 'business', first, latest)).rejects.toMatchObject({code: 'AI_INVALID_OUTPUT'})
  })

  it('loads old sessions without backfilling discussion and rejects topic mutations explicitly', async () => {
    const env = await setup(), legacy = defenseFixture()
    await env.repository.save(legacy)
    const service = createDefenseService(env.repository)
    expect(await service.get(legacy.id)).toEqual(legacy)
    expect(defenseSessionSchema.parse(legacy)).not.toHaveProperty('discussion')
    await expect(service.changeTopic(legacy.id, {requestId: crypto.randomUUID(), questionId: crypto.randomUUID(), topicId: 'needs', expectedRevision: 0})).rejects.toMatchObject({code: 'TOPICS_UNAVAILABLE'})
  })
})
