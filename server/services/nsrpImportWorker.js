import { parentPort, workerData } from 'node:worker_threads'
import { readNsrpPdf } from './nsrpImportReader.js'
try { parentPort.postMessage({ result: await readNsrpPdf(Buffer.from(workerData)) }) }
catch { parentPort.postMessage({ error: 'Could not read completed NSRP details. Try a clearer typed PDF, or enter your information manually.' }) }
