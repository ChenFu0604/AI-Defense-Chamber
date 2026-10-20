import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import {
  buildRiskGraph,
  compareHistoryReports,
  defenseReportSchema,
  defenseSessionSchema,
} from '@defense/shared'
import { analysisProject } from '../../../../tests/fixtures/analysis.js'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'

const directories: string[] = []
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'defense-workflow-'))
  directories.push(directory)
  const fixture = createWorkflowFixture(directory)
  const api = request(fixture.app)
  const analyzed = await api
    .post('/api/v1/projects/analyze')
    .send({ project: analysisProject, mode: 'live' })
    .expect(200)
  const created = await api
    .post('/api/v1/defense/sessions')
    .send({
      requestId: crypto.randomUUID(),
      project: analysisProject,
      analysis: analyzed.body.data,
      mode: 'live',
      judgeId: 'business',
    })
    .expect(201)
  const url = '/api/v1/defense/sessions/' + created.body.data.id
  const first = await api
    .post(url + '/question')
    .send({ requestId: crypto.randomUUID() })
    .expect(200)
  return { ...fixture, directory, api, url, first: first.body.data }
}
describe('integrated HTTP workflow with explicit fixed test responses', () => {
  it('persists analysis, multiple answers, judge switch, report, risk map and independent retraining', async () => {
    const env = await setup()
    const answer = {
      requestId: crypto.randomUUID(),
      questionId: env.first.currentQuestionId,
      answer: '计划访谈二十名学生，尚无试点结果。',
    }
    await env.api
      .post(env.url + '/answer')
      .send(answer)
      .expect(200)
    const repeated = await env.api
      .post(env.url + '/answer')
      .send(answer)
      .expect(200)
    expect(env.calls.defense_turn).toBe(2)
    const switched = await env.api
      .post(env.url + '/judge')
      .send({
        requestId: crypto.randomUUID(),
        questionId: repeated.body.data.currentQuestionId,
        judgeId: 'technical',
      })
      .expect(200)
    const next = await env.api
      .post(env.url + '/answer')
      .send({
        requestId: crypto.randomUUID(),
        questionId: switched.body.data.currentQuestionId,
        answer: '采集准确性待验证，计划测试离线和重复上报。',
      })
      .expect(200)
    expect(next.body.data.messages.at(-1).content).toContain('采集准确性待验证')
    const ended = await env.api
      .post(env.url + '/end')
      .send({})
      .expect(200)
    await env.api
      .post(env.url + '/end')
      .send({})
      .expect(200)
    await env.api
      .post(env.url + '/answer')
      .send({ ...answer, requestId: crypto.randomUUID() })
      .expect(409)
    const generated = await Promise.all([
      env.api.post(env.url + '/report').send({}),
      env.api.post(env.url + '/report').send({}),
    ])
    expect(generated.map((r) => r.status)).toEqual([200, 200])
    const report = defenseReportSchema.parse(generated[0]!.body.data)
    expect(env.calls.defense_report).toBe(1)
    expect(report.overallScore).toBe(62.4)
    const session = defenseSessionSchema.parse(ended.body.data)
    const graph = buildRiskGraph({
      project: session.project,
      analysis: session.analysis,
      session,
      report,
    })
    expect(graph.nodes.length).toBeGreaterThan(0)
    expect(
      graph.edges.every(
        (e) =>
          graph.nodes.some((n) => n.id === e.source) && graph.nodes.some((n) => n.id === e.target),
      ),
    ).toBe(true)
    // A new service instance reads disk snapshots without invoking a model.
    const reopened = createWorkflowFixture(env.directory)
    const read = await request(reopened.app)
      .get(env.url + '/report')
      .expect(200)
    expect(read.body.data).toEqual(report)
    expect((await request(reopened.app).get(env.url).expect(200)).body.data).toEqual(session)
    expect(reopened.calls.defense_report).toBe(0)
    const trained = await env.api
      .post(env.url + '/retrain')
      .send({ requestId: crypto.randomUUID(), judgeId: 'devil' })
      .expect(201)
    expect(trained.body.data.training.sourceReportId).toBe(report.id)
    const trainingUrl = '/api/v1/defense/sessions/' + trained.body.data.id
    const initial = await env.api
      .post(trainingUrl + '/question')
      .send({ requestId: crypto.randomUUID() })
      .expect(200)
    await env.api
      .post(trainingUrl + '/answer')
      .send({
        requestId: crypto.randomUUID(),
        questionId: initial.body.data.currentQuestionId,
        answer: '本轮补充了匿名访谈提纲，尚未验证用户留存。',
      })
      .expect(200)
    await env.api
      .post(trainingUrl + '/end')
      .send({})
      .expect(200)
    const second = await env.api
      .post(trainingUrl + '/report')
      .send({})
      .expect(200)
    expect(compareHistoryReports(report, second.body.data).overall).toBe(0)
    expect((await env.api.get(env.url + '/report').expect(200)).body.data).toEqual(report)
  })
  it('keeps one failed answer, retries idempotently, rejects invalid reports and recovers', async () => {
    const env = await setup()
    const answer = {
      requestId: crypto.randomUUID(),
      questionId: env.first.currentQuestionId,
      answer: '[测试失败一次]目前缺少原始访谈记录。',
    }
    await env.api
      .post(env.url + '/answer')
      .send({ ...answer, answer: ' ' })
      .expect(400)
    await env.api
      .post(env.url + '/answer')
      .send(answer)
      .expect(502)
    const failed = await env.api.get(env.url).expect(200)
    expect(failed.body.data.status).toBe('failed')
    expect(
      failed.body.data.messages.filter((m: { sender: string }) => m.sender === 'user'),
    ).toHaveLength(1)
    await env.api
      .post(env.url + '/answer')
      .send(answer)
      .expect(200)
    await env.api
      .post(env.url + '/end')
      .send({})
      .expect(200)
    env.failures.set('defense_report', 'invalid')
    const invalid = await env.api
      .post(env.url + '/report')
      .send({})
      .expect(502)
    expect(invalid.body.error.code).toBe('AI_INVALID_OUTPUT')
    await env.api.get(env.url + '/report').expect(404)
    env.failures.set('defense_report', 'http')
    await env.api
      .post(env.url + '/report')
      .send({})
      .expect(502)
    await env.api
      .post(env.url + '/report')
      .send({})
      .expect(200)
  })
})
