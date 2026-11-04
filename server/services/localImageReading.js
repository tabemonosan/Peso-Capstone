import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { IMAGE_LIMITS, qrSummary } from '../../shared/documentImage.js'
const require = createRequire(import.meta.url)
export async function readQr(buffer, consume = async () => {}) {
  return new Promise(resolve => {
    const worker = new Worker(new URL('./qrWorker.js', import.meta.url), { workerData: buffer })
    let done = false
    const finish = async text => {
      if (done) return; done = true; clearTimeout(timer); await worker.terminate()
      try { await consume(text) } catch { /* A reader error is inconclusive. */ }
      resolve(qrSummary(text))
    }
    const timer = setTimeout(() => finish(''), IMAGE_LIMITS.qrTimeout)
    worker.once('message', finish); worker.once('error', error => { console.error('[verification] QR worker unavailable (' + (error.code || 'worker error') + ')'); finish('') }); worker.once('exit', () => { if (!done) finish('') })
  })
}
let active = 0
let queue = Promise.resolve(), pending = 0
export function readOcr(buffer, compare, options) {
  if (pending >= 20) return Promise.resolve({ result: 'could_not_read' })
  pending++
  const work = queue.then(() => runOcr(buffer, compare, options)).finally(() => { pending-- })
  queue = work.catch(() => {})
  return work
}
async function runOcr(buffer, compare, { reserve = async () => true } = {}) {
  if (active >= IMAGE_LIMITS.ocrConcurrency || !await reserve()) return { result: 'could_not_read' }
  active++
  let worker, timer, expired = false
  try {
    const operation = (async () => {
      worker = await createWorker('eng', 1, { langPath: path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')), workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'), corePath: path.dirname(require.resolve('tesseract.js-core/package.json')), cacheMethod: 'none', logger: () => {}, errorHandler: () => {} })
      if (expired) { await worker.terminate(); return { result: 'could_not_read' } }
      const { data } = await worker.recognize(buffer)
      // The callback returns comparisons only. Recognized text never leaves this scope.
      return await compare(data.text || '', data.confidence)
    })()
    return await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve({ result: 'could_not_read' }), IMAGE_LIMITS.ocrTimeout) })])
  } catch { return { result: 'could_not_read' } }
  finally { expired = true; clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); active-- }
}
