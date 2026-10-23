import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import request from 'supertest'
import { attachmentSchema, analysisEvidenceIsValid } from '@defense/shared'
import { createWorkflowFixture } from '../../../../tests/fixtures/workflow.js'
import { scannedPdf, textPdf } from '../../../../tests/fixtures/files.js'
import { analysisProject, validAnalysisOutput } from '../../../../tests/fixtures/analysis.js'
import { extractMaterialText } from '../services/material-text.js'
import { createKnowledgeService } from '../services/knowledge-service.js'

const directories: string[] = []
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true })
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'defense-ocr-test-'))
  directories.push(directory)
  return createWorkflowFixture(directory)
}
function textImage() {
  // Synthetic raster fixture generated for this test, without a hidden text
  // layer or customer data. Fixed pixels avoid depending on system CJK fonts.
  return readFileSync(new URL('../../../../tests/fixtures/ocr-sample.png', import.meta.url))
}
describe('local Chinese and English OCR using real pixels', () => {
  it('recognizes an image through HTTP, persists the result and includes unverified OCR text in model materials', async () => {
    const fixture = await setup()
    const result = await request(fixture.app)
      .post('/api/v1/attachments?ocr=true')
      .set('X-File-Name', 'project.png')
      .set('Content-Type', 'application/octet-stream')
      .send(textImage())
      .expect(201)
    const attachment = attachmentSchema.parse(result.body.data)
    expect(attachment.text.replace(/\s/g, '')).toContain('校园节能助手')
    expect(attachment.text).toContain('PROJECT EVIDENCE 2026')
    expect(attachment.ocr?.pages).toEqual([1])
    expect((await fixture.attachments.read(attachment.id)).attachment).toEqual(attachment)
    const materials = await fixture.attachments.materials([attachment], 80)
    expect(materials.images).toHaveLength(1)
    expect(materials.documents[0]!.text.length).toBeLessThanOrEqual(80)
    expect(materials.documents[0]!.extraction).toContain('可能错漏')
    const output = validAnalysisOutput()
    output.coreValue.evidence = [{ field: 'materials', quote: 'PROJECT EVIDENCE 2026' }]
    expect(analysisEvidenceIsValid(output, { ...analysisProject, attachments: [attachment] })).toBe(
      true,
    )
    expect(fixture.calls.project_analysis).toBe(0)
  }, 60000)
  it('renders image-only PDFs, respects the OCR page cap and skips OCR for normal PDF text', async () => {
    const fixture = await setup()
    const normal = await fixture.attachments.upload(textPdf(), 'text.pdf', { ocr: true })
    expect(normal.text).toContain('12 anonymous interviews')
    expect(normal.ocr).toBeUndefined()
    const jpeg = await sharp(textImage()).jpeg().toBuffer()
    const scan = await fixture.attachments.upload(scannedPdf(jpeg, 1400, 900, 4), 'scanned.pdf', {
      ocr: true,
    })
    expect(scan.text).toContain('PROJECT EVIDENCE 2026')
    expect(scan.ocr?.pages).toEqual([1, 2, 3])
    expect(scan.ocr?.skippedPages).toEqual([4])
    expect(scan.pageCount).toBe(4)
    expect(scan.truncated).toBe(true)
    expect((await fixture.attachments.read(scan.id)).attachment).toEqual(scan)
    const retrieval = await createKnowledgeService(fixture.attachments).search({project: {...analysisProject, attachments: [scan]}}, 'PROJECT EVIDENCE')
    expect(retrieval.sources[0]?.extraction).toBe('ocr')
    expect(retrieval.documents[0]!.status).toBe('partial')
    expect(retrieval.documents[0]!.skippedPages).toEqual([4])
  }, 90000)
  it('rejects invalid OCR options, empty recognition and an exceeded processing deadline', async () => {
    const fixture = await setup()
    await request(fixture.app)
      .post('/api/v1/attachments?ocr=perhaps')
      .set('X-File-Name', 'test.txt')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('evidence'))
      .expect(400)
    const blank = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer()
    await expect(
      fixture.attachments.upload(blank, 'blank.png', { ocr: true }),
    ).rejects.toMatchObject({ code: 'OCR_NO_TEXT' })
    await expect(extractMaterialText(textImage(), 'image', { timeoutMs: 1 })).rejects.toMatchObject(
      { code: 'OCR_TIMEOUT' },
    )
  }, 60000)
})
