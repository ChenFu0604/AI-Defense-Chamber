import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { AppError } from '../middleware/app-error.js'

// Isolate parser CPU/memory and terminate on timeout; never render or execute PDF JavaScript.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { getDocument } = await import(workerData.module);
  const task = getDocument({ data: new Uint8Array(workerData.bytes), isEvalSupported: false,
    useSystemFonts: false, disableFontFace: true, stopAtErrors: true, verbosity: 0,
    standardFontDataUrl: new URL('../../standard_fonts/', workerData.module).href });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 40) throw new Error('TOO_MANY_PAGES');
    let text = '', truncated = false;
    for (let page = 1; page <= pdf.numPages; page++) {
      const current = await pdf.getPage(page);
      const content = await current.getTextContent();
      text += '[第 ' + page + ' 页]\n' + content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n';
      current.cleanup();
      if (text.length > 12000) { text = text.slice(0, 12000); truncated = true; break; }
    }
    // Page labels alone are not extracted evidence.
    if (!text.replace(/\[第 \d+ 页\]/g, '').trim()) throw new Error('NO_TEXT');
    parentPort.postMessage({ text: text.trim(), pageCount: pdf.numPages, truncated });
  } finally { await task.destroy(); }
})().catch(error => parentPort.postMessage({ error: error.name === 'PasswordException' ? 'PASSWORD' : error.message }));
`
export function extractPdfText(
  bytes: Buffer,
): Promise<{ text: string; pageCount: number; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        module: pathToFileURL(
          createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs'),
        ).href,
        bytes,
      },
      resourceLimits: { maxOldGenerationSizeMb: 192 },
    })
    let settled = false
    function finish(
      error?: Error,
      result?: { text: string; pageCount: number; truncated: boolean },
    ) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      if (error) reject(error)
      else resolve(result!)
    }
    const timer = setTimeout(
      () => finish(new AppError(408, 'DOCUMENT_TIMEOUT', 'PDF 解析超过 15 秒，请缩小文件后重试。')),
      15000,
    )
    worker.once('message', (result) => {
      if (!result.error) {
        finish(undefined, result)
        return
      }
      const messages: Record<string, string> = {
        PASSWORD: 'PDF 已加密，请先解密后上传。',
        TOO_MANY_PAGES: 'PDF 最多支持 40 页，请拆分后上传。',
        NO_TEXT:
          '没有提取到文字，可能是扫描版 PDF；当前未接入 OCR，请上传文字版或把关键页作为图片上传。',
      }
      finish(
        new AppError(
          422,
          'DOCUMENT_PARSE_FAILED',
          messages[result.error] ?? 'PDF 损坏或无法解析，请检查文件后重试。',
        ),
      )
    })
    worker.once('error', () =>
      finish(new AppError(422, 'DOCUMENT_PARSE_FAILED', 'PDF 解析失败，请检查文件或缩小后重试。')),
    )
    worker.once('exit', () => {
      if (!settled) finish(new AppError(422, 'DOCUMENT_PARSE_FAILED', 'PDF 解析进程异常退出。'))
    })
  })
}
