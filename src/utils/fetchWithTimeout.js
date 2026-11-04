// A timeout does not mean a server mutation was rolled back. Check current
// status before retrying an approval or acceptance.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  let timer
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('The request timed out. Refresh to check whether it completed before trying again.'))
        controller.abort()
      }, timeoutMs)
    })
    return await Promise.race([globalThis.fetch(url, { ...options, signal: controller.signal }), timeout])
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
