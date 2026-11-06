import { Resolver } from 'node:dns/promises'
import { validApplicationEmail } from '../../shared/jobApplication.js'

const resolver = new Resolver({ timeout: 2500, tries: 1 })
const cache = new Map()
const invalid = (error) => ({ valid: false, code: 'INVALID_APPLICATION_EMAIL', status: 403, error })

// Check the mail domain, never probe a person's mailbox or send an email.
export async function validateApplicationEmail(input, lookup = (domain) => resolver.resolveMx(domain)) {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (!validApplicationEmail(email)) return invalid('Enter a valid email address, such as name@gmail.com.')
  const domain = email.split('@')[1]
  const cached = cache.get(domain)
  if (cached && cached.expires > Date.now() && arguments.length < 2) return cached.result
  try {
    const records = await lookup(domain)
    const valid = records.some((record) => record.exchange && record.exchange !== '.')
    const result = valid ? { valid: true } : invalid('This domain does not accept email. Check the part after @.')
    if (arguments.length < 2) {
      if (cache.size >= 500) cache.delete(cache.keys().next().value)
      cache.set(domain, { result, expires: Date.now() + (valid ? 600000 : 60000) })
    }
    return result
  } catch (error) {
    if (['ENOTFOUND', 'ENODATA', 'ENONAME'].includes(error.code)) return invalid('This email domain was not found or does not accept email. Check for a typo, such as gmail.comsds instead of gmail.com.')
    return { valid: false, status: 409, code: 'EMAIL_CHECK_UNAVAILABLE', error: 'The email domain could not be checked right now. Please try again.' }
  }
}
