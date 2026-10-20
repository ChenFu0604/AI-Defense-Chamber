import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import { attachmentSchema, MAX_DOCUMENT_TEXT, MAX_OCR_PAGES, OCR_TIMEOUT_MS } from '@defense/shared'
import { AppError } from '../middleware/app-error.js'

const resultSchema = z.strictObject({
  text: z.string().max(MAX_DOCUMENT_TEXT),
  pageCount: z.number().int().min(1).max(40).nullable(),
  truncated: z.boolean(),
  ocr: attachmentSchema.shape.ocr,
})
export type ExtractedMaterial = z.infer<typeof resultSchema>

// CPU work stays outside Express. All scripts, WASM and language data come
// from installed packages; OCR never downloads or transmits a user's file.
const source = String.raw`
const { parentPort, workerData: data } = require('node:worker_threads');
let recognizer, task;
(async () => {
  let text = '', truncated = false, pageCount = null;
  const pages = [], skippedPages = [], confidences = [];
  async function recognize(bytes, page) {
    if (!recognizer) {
      const { createWorker } = require(data.tesseract);
      recognizer = await createWorker('chi_sim+eng', 1, {
        langPath: data.languages, cacheMethod: 'none',
        errorHandler: () => {}, logger: () => {}
      // Only the two bundled horizontal language models are supported. Avoid
      // implicitly loading chi_sim_vert from the model's embedded config.
      }, { tessedit_load_sublangs: '' });
      await recognizer.setParameters({ tessedit_pageseg_mode: '6', user_defined_dpi: '200' });
    }
    const result = (await recognizer.recognize(bytes)).data;
    pages.push(page);
    confidences.push(Number.isFinite(result.confidence) ? result.confidence : 0);
    return result.text.replace(/\u0000/g, '').trim();
  }
  if (data.kind === 'image') {
    text = await recognize(Buffer.from(data.bytes), 1);
    if (!text) throw new Error('OCR_NO_TEXT');
  } else {
    const { getDocument } = await import(data.pdfModule);
    task = getDocument({ data: new Uint8Array(data.bytes), isEvalSupported: false,
      useSystemFonts: false, disableFontFace: true, stopAtErrors: true, verbosity: 0,
      standardFontDataUrl: data.fonts });
    const pdf = await task.promise;
    pageCount = pdf.numPages;
    if (pageCount > 40) throw new Error('TOO_MANY_PAGES');
    for (let page = 1; page <= pageCount; page++) {
      const current = await pdf.getPage(page);
      try {
        const content = await current.getTextContent();
        let value = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
        if (!value && data.ocr) {
          if (pages.length >= data.maxPages) {
            skippedPages.push(page); truncated = true; continue;
          }
          const base = current.getViewport({ scale: 1 });
          if (!Number.isFinite(base.width + base.height) || base.width <= 0 || base.height <= 0) throw new Error('BAD_PAGE');
          const viewport = current.getViewport({ scale: Math.min(3, 2200 / Math.max(base.width, base.height)) });
          const canvas = pdf.canvasFactory.create(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
          try {
            await current.render({ canvas: canvas.canvas, viewport, background: '#ffffff' }).promise;
            value = await recognize(canvas.canvas.toBuffer('image/png'), page);
          } finally { pdf.canvasFactory.destroy(canvas); }
        }
        if (value) text += '[第 ' + page + ' 页]\n' + value + '\n';
        if (text.length > data.maxText) { truncated = true; break; }
      } finally { current.cleanup(); }
    }
    if (!text.trim()) throw new Error(data.ocr ? 'OCR_NO_TEXT' : 'NO_TEXT');
  }
  if (text.length > data.maxText) truncated = true;
  const ocr = pages.length ? { pages, skippedPages,
    confidence: Math.max(0, Math.min(100, Math.round(confidences.reduce((a,b) => a+b, 0) / confidences.length))) } : undefined;
  return { text: text.slice(0, data.maxText).trim(), pageCount, truncated, ...(ocr ? { ocr } : {}) };
})().then(async result => {
  if (recognizer) await recognizer.terminate();
  if (task) await task.destroy();
  parentPort.postMessage(result);
}).catch(async error => {
  if (recognizer) await recognizer.terminate().catch(() => {});
  if (task) await task.destroy().catch(() => {});
  parentPort.postMessage({ error: error.name === 'PasswordException' ? 'PASSWORD' : error.message });
});
`

export async function extractMaterialText(
  bytes: Buffer,
  kind: 'pdf' | 'image',
  options: { ocr?: boolean; timeoutMs?: number } = {},
): Promise<ExtractedMaterial> {
  const require = createRequire(import.meta.url)
  const ocr = kind === 'image' || !!options.ocr
  let languages: string | undefined
  try {
    if (ocr) {
      languages = await mkdtemp(join(tmpdir(), 'defense-ocr-'))
      for (const language of ['chi_sim', 'eng'])
        await copyFile(
          require.resolve(
            `@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`,
          ),
          join(languages, language + '.traineddata.gz'),
        )
    }
    return await new Promise((resolve, reject) => {
      const pdfModule = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href
      const worker = new Worker(source, {
        eval: true,
        workerData: {
          bytes,
          kind,
          ocr,
          languages,
          pdfModule,
          // PDF.js Node APIs accept filesystem paths for bundled fonts.
          fonts:
            join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts').replaceAll(
              '\\',
              '/',
            ) + '/',
          tesseract: ocr ? require.resolve('tesseract.js') : undefined,
          maxPages: MAX_OCR_PAGES,
          maxText: MAX_DOCUMENT_TEXT,
        },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      })
      let settled = false
      function finish(error?: Error, result?: ExtractedMaterial) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // Wait for termination before removing temporary language files.
        void worker.terminate().then(() => {
          if (error) reject(error)
          else resolve(result!)
        })
      }
      const timer = setTimeout(
        () =>
          finish(
            new AppError(
              408,
              ocr ? 'OCR_TIMEOUT' : 'DOCUMENT_TIMEOUT',
              ocr
                ? 'OCR 超过 90 秒，请拆分扫描页或关闭 OCR 后重试。'
                : 'PDF 解析超过 15 秒，请缩小文件后重试。',
            ),
          ),
        options.timeoutMs ?? (ocr ? OCR_TIMEOUT_MS : 15000),
      )
      worker.once('message', (result) => {
        if (!result.error) {
          const parsed = resultSchema.safeParse(result)
          finish(
            parsed.success
              ? undefined
              : new AppError(422, 'DOCUMENT_PARSE_FAILED', '文字解析结果无效，未保存附件。'),
            parsed.success ? parsed.data : undefined,
          )
          return
        }
        const messages: Record<string, string> = {
          PASSWORD: 'PDF 已加密，请先解密后上传。',
          TOO_MANY_PAGES: 'PDF 最多支持 40 页，请拆分后上传。',
          NO_TEXT: '未提取到文字，请开启 OCR 识别扫描版 PDF。',
          OCR_NO_TEXT: 'OCR 未识别到可用文字，请上传更清晰的扫描件，或关闭 OCR 仅添加图片附件。',
        }
        finish(
          new AppError(
            422,
            result.error === 'OCR_NO_TEXT' ? 'OCR_NO_TEXT' : 'DOCUMENT_PARSE_FAILED',
            messages[result.error] ?? '文档或 OCR 处理失败，请检查文件后重试。',
          ),
        )
      })
      worker.once('error', () =>
        finish(
          new AppError(
            422,
            'DOCUMENT_PARSE_FAILED',
            '文字识别进程失败，请检查 OCR 依赖或文件后重试。',
          ),
        ),
      )
      worker.once('exit', () => {
        if (!settled) finish(new AppError(422, 'DOCUMENT_PARSE_FAILED', '文字识别进程异常退出。'))
      })
    })
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      503,
      'OCR_UNAVAILABLE',
      '本地 OCR 组件或语言数据不可用，请在项目根目录运行 npm install 并重启后端。',
    )
  } finally {
    if (languages) await rm(languages, { recursive: true, force: true }).catch(() => {})
  }
}
