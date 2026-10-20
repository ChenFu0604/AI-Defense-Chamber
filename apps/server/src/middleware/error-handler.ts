import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { ApiErrorResponse } from '@defense/shared'
import { AppError } from './app-error.js'

export const notFound: RequestHandler = (_request, response) => {
  const body: ApiErrorResponse = {
    success: false,
    error: { code: 'NOT_FOUND', message: '请求的接口不存在。' },
  }
  response.status(404).json(body)
}
export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    next(error)
    return
  }
  if (response.destroyed) return
  if (error instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: { code: error.code, message: error.message },
    }
    response.status(error.status).json(body)
    return
  }
  const status =
    typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500
  const isBadRequest = status === 400
  const tooLarge = status === 413
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: isBadRequest ? 'INVALID_JSON' : tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
      message: isBadRequest
        ? '请求内容不是有效的 JSON。'
        : tooLarge
          ? '请求内容过大。'
          : '服务暂时不可用，请稍后重试。',
    },
  }
  response.status(isBadRequest ? 400 : tooLarge ? 413 : 500).json(body)
}
