import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import request from 'supertest'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'
import { textPdf } from '../../../../tests/fixtures/files.js'
import { analysisProject } from '../../../../tests/fixtures/analysis.js'
import { attachmentSchema, analysisEvidenceIsValid } from '@defense/shared'
import { createAIClient } from '../services/ai-client.js'
import { z } from 'zod'
const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'defense-attachments-'))
  directories.push(directory)
  return { ...createWorkflowFixture(directory), directory }
}
const image = () =>
  sharp({ create: { width: 120, height: 80, channels: 3, background: '#bca3ff' } })
    .png()
    .toBuffer()
describe('real local attachment storage and parsers', () => {
  it('uploads an actual PNG, normalizes it, reads it after restart and rejects corrupt/unsupported files', async () => {
    const env = await setup(),
      api = request(env.app)
    const response = await api
      .post('/api/v1/attachments')
      .set('X-File-Name', encodeURIComponent('架构图.png'))
      .set('Content-Type', 'application/octet-stream')
      .send(await image())
      .expect(201)
    const file = attachmentSchema.parse(response.body.data)
    expect(file.mimeType).toBe('image/jpeg')
    expect(file.name).toBe('架构图.jpg')
    const content = await api.get(`/api/v1/attachments/${file.id}/content`).expect(200)
    expect(content.headers['x-content-type-options']).toBe('nosniff')
    expect((await sharp(content.body).metadata()).format).toBe('jpeg')
    expect(
      (await createWorkflowFixture(env.directory).attachments.read(file.id)).attachment,
    ).toEqual(file)
    await api
      .post('/api/attachments')
      .set('X-File-Name', 'bad.png')
      .send(Buffer.from('not a png'))
      .expect(422)
    await api
      .post('/api/attachments')
      .set('X-File-Name', 'test.svg')
      .send(Buffer.from('<svg/>'))
      .expect(422)
    await api
      .post('/api/attachments')
      .set('X-File-Name', 'empty.txt')
      .send(Buffer.alloc(0))
      .expect(413)
    await api.get('/api/attachments/unknown/content').expect(400)
    await api.get(`/api/attachments/${crypto.randomUUID()}/content`).expect(404)
    expect(env.calls.project_analysis).toBe(0)
  })
  it('extracts actual PDF text, reports scanned/corrupt/oversized page sets, truncates TXT visibly', async () => {
    const env = await setup()
    const uploaded = await request(env.app)
      .post('/api/v1/attachments')
      .set('X-File-Name', 'project.pdf')
      .set('Content-Type', 'application/octet-stream')
      .send(textPdf())
      .expect(201)
    const pdf = attachmentSchema.parse(uploaded.body.data)
    expect(pdf.text).toContain('12 anonymous interviews')
    expect(pdf.pageCount).toBe(1)
    expect(pdf.truncated).toBe(false)
    await expect(env.attachments.upload(textPdf(''), 'scan.pdf')).rejects.toThrow('OCR')
    await expect(env.attachments.upload(textPdf('text', 41), 'long.pdf')).rejects.toThrow('40 页')
    await expect(
      env.attachments.upload(Buffer.from('%PDF-1.7\nbroken'), 'broken.pdf'),
    ).rejects.toMatchObject({ code: 'DOCUMENT_PARSE_FAILED' })
    const txt = await env.attachments.upload(Buffer.from('文'.repeat(13000)), 'notes.txt')
    expect(txt.text).toHaveLength(12000)
    expect(txt.truncated).toBe(true)
    await expect(
      env.attachments.upload(Buffer.alloc(8 * 1024 * 1024 + 1), 'big.pdf'),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  }, 20000)
  it('rejects forged document text and detects missing or modified binary data', async () => {
    const env = await setup(),
      file = await env.attachments.upload(Buffer.from('original evidence'), 'evidence.txt')
    await expect(
      env.attachments.materials([{ ...file, text: 'forged claim' }]),
    ).rejects.toMatchObject({ code: 'ATTACHMENT_MISMATCH' })
    const forged = { ...analysisProject, attachments: [{ ...file, text: 'forged claim' }] }
    const result = await request(env.app)
      .post('/api/v1/projects/analyze')
      .send({ project: forged, mode: 'live' })
      .expect(400)
    expect(result.body.error.code).toBe('ATTACHMENT_MISMATCH')
    await writeFile(join(env.directory, 'attachments', file.id + '.bin'), 'tampered')
    await expect(env.attachments.read(file.id)).rejects.toMatchObject({
      code: 'ATTACHMENT_STORAGE_ERROR',
    })
  })
  it('persists project and answer attachments through failure, exact retry, report and new training', async () => {
    const env = await setup(),
      api = request(env.app)
    const projectImage = await env.attachments.upload(await image(), 'project.png')
    const answerImage = await env.attachments.upload(await image(), 'answer.png')
    const document = await env.attachments.upload(
      Buffer.from('Prototype needs an accuracy study.'),
      'evidence.txt',
    )
    const project = { ...analysisProject, attachments: [projectImage, document] }
    const analysis = (
      await api.post('/api/v1/projects/analyze').send({ project, mode: 'live' }).expect(200)
    ).body.data
    expect(env.modelInputs[0]!.images).toBe(1)
    expect(JSON.stringify(env.modelInputs[0]!.context.materials)).toContain('accuracy study')
    const output = structuredClone(analysis.output)
    output.coreValue.evidence = [{ field: 'materials', quote: 'accuracy study' }]
    expect(analysisEvidenceIsValid(output, project)).toBe(true)
    output.coreValue.evidence[0].quote = 'invented outcome'
    expect(analysisEvidenceIsValid(output, project)).toBe(false)
    const created = (
      await api
        .post('/api/v1/defense/sessions')
        .send({
          requestId: crypto.randomUUID(),
          project,
          analysis,
          mode: 'live',
          judgeId: 'technical',
        })
        .expect(201)
    ).body.data
    const url = '/api/v1/defense/sessions/' + created.id
    const first = (
      await api
        .post(url + '/question')
        .send({ requestId: crypto.randomUUID() })
        .expect(200)
    ).body.data
    expect(env.modelInputs.at(-1)!.images).toBe(1)
    const answer = {
      requestId: crypto.randomUUID(),
      questionId: first.currentQuestionId,
      answer: '[测试失败一次]图中为原型，测量准确性待验证。',
      attachments: [document, answerImage],
    }
    await api
      .post(url + '/answer')
      .send(answer)
      .expect(502)
    const restored = (await api.get(url).expect(200)).body.data
    expect(restored.messages.at(-1).attachments).toEqual([document, answerImage])
    const success = await api
      .post(url + '/answer')
      .send(answer)
      .expect(200)
    expect(env.modelInputs.at(-1)!.images).toBe(2)
    expect(
      success.body.data.messages.filter((m: { sender: string }) => m.sender === 'user'),
    ).toHaveLength(1)
    await api
      .post(url + '/answer')
      .send(answer)
      .expect(200)
    await api
      .post(url + '/end')
      .send({})
      .expect(200)
    await api
      .post(url + '/report')
      .send({})
      .expect(200)
    expect(env.modelInputs.at(-1)!.images).toBe(2)
    const training = await api
      .post(url + '/retrain')
      .send({ requestId: crypto.randomUUID(), judgeId: 'devil' })
      .expect(201)
    expect(training.body.data.project.attachments).toEqual(project.attachments)
  })
  it('sends real image content parts and surfaces vision rejection without a text-only fallback', async () => {
    let calls = 0
    const client = createAIClient(
      {
        apiKey: 'fixture-only',
        baseUrl: 'http://fixture.invalid',
        model: 'text-only-test',
        timeoutMs: 1000,
        responseFormat: 'json_schema',
      },
      async (_url, init) => {
        calls++
        const body = JSON.parse(String(init?.body))
        expect(body.messages[1].content[2]).toMatchObject({
          type: 'image_url',
          image_url: { url: 'data:image/jpeg;base64,Zml4dHVyZQ==' },
        })
        return new Response('{}', { status: 400 })
      },
    )
    await expect(
      client.generate({
        name: 'test',
        system: 'test',
        user: 'use image',
        schema: z.object({ ok: z.boolean() }),
        images: [{ name: 'test.jpg', url: 'data:image/jpeg;base64,Zml4dHVyZQ==' }],
      }),
    ).rejects.toThrow('支持图片理解')
    expect(calls).toBe(1)
  })
  it('accepts bounded document snapshots over 256 KiB while retaining the 1 MiB creation limit', async () => {
    const env = await setup(),
      api = request(env.app)
    const documents = []
    for (let index = 0; index < 4; index++)
      documents.push(
        await env.attachments.upload(Buffer.from('文'.repeat(12000)), `evidence-${index}.txt`),
      )
    const project = { ...analysisProject, attachments: documents }
    const analysis = (
      await api.post('/api/v1/projects/analyze').send({ project, mode: 'live' }).expect(200)
    ).body.data
    const body = {
      requestId: crypto.randomUUID(),
      project,
      analysis,
      mode: 'live',
      judgeId: 'technical',
    }
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(256 * 1024)
    await api.post('/api/v1/defense/sessions').send(body).expect(201)
    const tooLarge = await api
      .post('/api/v1/defense/sessions')
      .send({ text: 'x'.repeat(1024 * 1024) })
      .expect(413)
    expect(tooLarge.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
