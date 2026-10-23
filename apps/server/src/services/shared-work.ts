// A shared cold-index job owns its cancellation independently of each HTTP
// request. Cancel it only when no callers remain; every caller can leave early.
export interface SharedWork<T> {
  work: Promise<T>
  controller: AbortController
  waiters: number
  settled: boolean
}
export function createSharedWork<T>(run: (signal: AbortSignal) => Promise<T>): SharedWork<T> {
  const controller = new AbortController()
  const job: SharedWork<T> = {controller, waiters: 0, settled: false,
    work: Promise.resolve().then(() => run(controller.signal))}
  void job.work.then(() => { job.settled = true }, () => { job.settled = true })
  return job
}
export function waitForSharedWork<T>(job: SharedWork<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      if (!job.waiters && !job.settled) job.controller.abort()
      reject(signal.reason)
      return
    }
    job.waiters++
    let finished = false
    function finish(action: () => void) {
      if (finished) return
      finished = true
      signal?.removeEventListener('abort', cancel)
      job.waiters--
      if (!job.waiters && !job.settled) job.controller.abort()
      action()
    }
    const cancel = () => finish(() => reject(signal!.reason))
    signal?.addEventListener('abort', cancel, {once: true})
    void job.work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
  })
}
