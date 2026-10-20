import { extractMaterialText } from './material-text.js'

export function extractPdfText(bytes: Buffer, options: { ocr?: boolean } = {}) {
  return extractMaterialText(bytes, 'pdf', options)
}
