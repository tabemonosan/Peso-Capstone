import { parentPort, workerData } from 'node:worker_threads'
import sharp from 'sharp'
import jsQR from 'jsqr'
try {
  const { data, info } = await sharp(Buffer.from(workerData)).resize({ width: 1600, withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const result = jsQR(new Uint8ClampedArray(data), info.width, info.height)
  parentPort.postMessage(result?.data || '')
} catch { parentPort.postMessage('') }
