import { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import path from 'node:path'
import sharp from 'sharp'
import { isCombinedNameHeader, compareName } from '../../shared/crossChecks.js'
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
async function runOcr(buffer, compare, { reserve = async () => true, nameOnly = false } = {}) {
  if (active >= IMAGE_LIMITS.ocrConcurrency || !await reserve()) return { result: 'could_not_read' }
  active++
  let worker, timer, expired = false
  try {
    const operation = (async () => {
      worker = await createWorker('eng', 1, { langPath: path.dirname(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')), workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'), corePath: path.dirname(require.resolve('tesseract.js-core/package.json')), cacheMethod: 'none', logger: () => {}, errorHandler: () => {} })
      if (expired) { await worker.terminate(); return { result: 'could_not_read' } }
      const { data } = await worker.recognize(buffer, {}, { blocks: true })
      // The callback returns comparisons only. Recognized text never leaves this scope.
      const rawLines = (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || [])
      let text = data.text || ''
      const lines = rawLines.map(line => ({ text: line.text, confidence: line.confidence }))
      // A license's security pattern and unrelated columns can lower page confidence.
      // Re-read the name row itself at a larger size, without guessing its contents.
      const header = nameOnly ? rawLines.findIndex(line => isCombinedNameHeader(line.text)) : -1
      const nameLine = header >= 0 ? rawLines[header + 1] : null
      if (nameLine?.bbox) try {
        const size = await sharp(buffer).metadata(), box = nameLine.bbox
        const surnameLabel = rawLines[header].words?.find(word => ['match', 'minor'].includes(compareName(word.text.replace(/[^a-z]/gi, ''), 'last')))
        const left = Math.max(0, box.x0 - 8, (surnameLabel?.bbox?.x0 || 0) - 8), top = Math.max(0, box.y0 - 8)
        const width = Math.min(size.width - left, box.x1 - left + 8), height = Math.min(size.height - top, box.y1 - top + 8)
        const crop = await sharp(buffer).extract({ left, top, width, height }).resize({ height: 120 }).greyscale().normalize().png().toBuffer()
        await worker.setParameters({ tessedit_pageseg_mode: '7' })
        const retry = (await worker.recognize(crop)).data
        if (retry.text?.trim() && retry.confidence > nameLine.confidence) {
          text = text.replace(nameLine.text.trim(), retry.text.trim())
          lines[header + 1] = { text: retry.text, confidence: retry.confidence }
        }
      }
      catch { /* Keep the original name reading when the crop cannot be read. */ }
      return await compare(text, data.confidence, { lines })
    })()
    return await Promise.race([operation, new Promise(resolve => { timer = setTimeout(() => resolve({ result: 'could_not_read' }), IMAGE_LIMITS.ocrTimeout) })])
  } catch { return { result: 'could_not_read' } }
  finally { expired = true; clearTimeout(timer); if (worker) await worker.terminate().catch(() => {}); active-- }
}
