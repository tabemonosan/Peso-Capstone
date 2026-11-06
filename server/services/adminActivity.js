import { redactPath, redactString } from '../utils/redact.js'

const verbs = { GET: 'Viewed', POST: 'Submitted', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' }
const decisions = new Set(['approve', 'approved', 'decline', 'declined', 'reject', 'rejected', 'pending', 'under_review', 'needs_resubmission', 'restrict', 'restricted', 'unrestrict', 'release', 'resolve', 'grant', 'request', 'hold', 'release-hold', 'revoke', 'resubmit', 'checked', 'explain', 'suspend', 'resume', 'confirm', 'confirmed', 'dismiss', 'dismissed', 'reverse', 'keep', 'reduce', 'publish', 'close', 'cancel', 'cancelled', 'withdraw', 'accept', 'accepted'])
const safeDecision = value => decisions.has(value) ? value : ''
export const ADMIN_ACTION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE']
export const PASSIVE_ADMIN_PATH = /^\/api\/(?:login\/?$|logout\/?$|admin\/activity-logs(?:\/|$)|notifications(?:\/|$)|profile\/page-guides(?:\/|$)|nsrp\/(?:validate-signup|preview-signup|preview|generate)(?:\/|$)|employer-registration\/preview(?:\/|$)|signup\/(?:email-code|check-documents|nsrp-import)(?:\/|$)|profile\/nsrp-import\/preview(?:\/|$)|applications\/validate-email(?:\/|$))/
export const isAdminBusinessAction = (method, path) => ADMIN_ACTION_METHODS.includes(method) && !PASSIVE_ADMIN_PATH.test(path)

export function describeAdminAction(method, path, body = {}) {
  const decision = safeDecision(body.action) || safeDecision(body.decision) || safeDecision(body.status)
  const decisionLabel = { approve: 'Approved', approved: 'Approved', decline: 'Declined', declined: 'Declined', restrict: 'Restricted', restricted: 'Restricted', unrestrict: 'Removed restriction from', revoke: 'Revoked approval for', resubmit: 'Requested resubmission of', resolve: 'Resolved flags for', checked: 'Confirmed automatic approval of', hold: 'Held automatic approval for', 'release-hold': 'Released automatic approval hold for' }[decision] || 'Updated'
  if (/^\/api\/applicants\/[^/]+\/verification$/.test(path)) return `${decisionLabel} applicant account`
  if (/^\/api\/employer-requests\/[^/]+\/status$/.test(path)) return `${decisionLabel} employer registration`
  if (/^\/api\/account-deletion\/requests\/[^/]+$/.test(path)) return decision === 'approved' ? 'Approved account deletion' : decision === 'declined' ? 'Declined account deletion' : 'Updated account deletion request'
  if (path === '/api/admin/job-titles' && method === 'POST') return `Added job title${typeof body.name === 'string' && body.name.trim() ? `: ${redactString(body.name.trim().slice(0, 80))}` : ''}`
  if (/^\/api\/admin\/job-titles\/[^/]+$/.test(path) && method === 'DELETE') return 'Deleted job title'
  if (path === '/api/admin/document-verification/action') {
    const document = { birthCertificate: 'birth certificate', validId1: 'Valid ID #1', validId2: 'Valid ID #2', nsrpForm: 'NSRP reference', employerNsrpForm: 'employer NSRP form' }[body.docKey] || 'verification document'
    return `${decisionLabel} ${document}`
  }
  if (path === '/api/admin/nsrp-automation/settings') return 'Updated document verification settings'
  if (/^\/api\/jobs\/[^/]+\/status$/.test(path)) return `${decisionLabel} job posting`
  if (/\/suspension$/.test(path)) return `${body.suspended === true ? 'Suspended' : body.suspended === false ? 'Resumed' : 'Updated suspension for'} ${path.includes('/employers/') ? 'employer' : 'applicant'} account`
  const resource = path.replace(/^\/api\//, '').split('/').filter(part => part !== 'admin' && !/^[a-f\d]{24}$/i.test(part) && !/^\d+$/.test(part)).join(' / ').replaceAll('-', ' ')
  return `${verbs[method] || method} ${resource}${decision ? ` (${decision.replaceAll('_', ' ')})` : ''}`.slice(0, 300)
}

// Audit metadata only: no request bodies, query strings, credentials or file data.
// Delay response completion until its activity entry has been persisted.
export function adminActivityMiddleware({ ActivityLog, Admin, authenticate }) {
  return async (req, res, next) => {
    const path = redactPath(req.originalUrl).slice(0, 500)
    if (!isAdminBusinessAction(req.method, path)) return next()
    let actor
    try {
      const decoded = authenticate(req)
      if (decoded?.role === 'Admin') actor = await Admin.findOne({ email: decoded.email }).select('_id email').lean()
    } catch { /* Authentication errors are handled by the destination route. */ }
    const end = res.end
    let recorded = false
    const record = async interrupted => {
      const by = actor
      if (recorded || !by) return
      recorded = true
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const targetId = res.locals.activityTargetId || path.match(/\b[a-f\d]{24}\b/i)?.[0] || ([body.accountId, body.applicantId, body.jobId].find(value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)))
      try {
        await ActivityLog.create({ actorId: by._id, actorEmail: by.email, action: res.locals.activityAction || describeAdminAction(req.method, path, body), method: req.method,
          path, targetId, statusCode: res.statusCode, outcome: interrupted ? 'interrupted' : res.statusCode < 400 ? 'success' : 'failed' })
      } catch { console.error('[admin activity] Unable to save activity entry') }
    }
    res.end = function (...args) {
      res.end = end
      if (!actor) return end.apply(this, args)
      void record(false).finally(() => end.apply(this, args))
      return this
    }
    res.once('close', () => { if (!res.writableFinished) void record(true) })
    next()
  }
}
