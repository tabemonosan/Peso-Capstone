import { adminCan, adminLevel } from '../../shared/adminAccess.js'

// Every internal session is checked against the live account, never a client tier.
export function adminAccessMiddleware({ Admin, authenticate }) {
  return async (req, res, next) => {
    try {
      const actor = authenticate(req)
      if (actor?.role !== 'Admin') return next()
      const account = await Admin.findOne({ email: actor.email }).select('_id email adminLevel disabled mustChangePassword sessionVersion').lean()
      if (!account || account.disabled) return res.status(401).json({ error: 'This internal account is unavailable. Please sign in again.' })
      if ((actor.sessionVersion || 0) !== (account.sessionVersion || 0)) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' })
      req.internalAccount = { ...account, adminLevel: adminLevel(account) }
      // Express routes are case-insensitive; authorization must match that behavior.
      const route = req.path.replace(/\/+$/, '').toLowerCase()
      if (account.mustChangePassword && !(route === '/profile' && req.method === 'GET') && !(route === '/admin/change-password' && req.method === 'POST')) return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', error: 'Choose your own password before using the portal.' })
      const read = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
      let permission = read ? 'read' : 'decide'
      if (route === '/admin/change-password' && req.method === 'POST') permission = 'notes'
      else if (/^\/admin\/internal-accounts(?:\/|$)/.test(route)) permission = 'accounts'
      else if (/^\/admin\/review-notes(?:\/|$)/.test(route)) permission = read ? 'notes' : 'writeNotes'
      else if (/^\/admin\/email-delivery(?:\/|$)/.test(route)) permission = 'emailDelivery'
      else if (/^\/account-deletion(?:\/|$)/.test(route)) permission = read ? 'decide' : 'deleteAccounts'
      else if (/\/settings$/.test(route) || route === '/admin/job-moderation') permission = read ? 'viewSettings' : 'settings'
      else if (route === '/referrals' && req.method === 'POST') permission = 'refer'
      else if (route === '/admin/activity-logs') permission = 'ownLogs'
      else if (route === '/admin/reports') permission = 'reports'
      else if (route === '/profile' && req.method === 'PUT') permission = 'notes'
      else if (/^\/notifications(?:\/|$)/.test(route)) permission = 'notes'
      if (!adminCan(req.internalAccount, permission)) return res.status(403).json({ error: 'Your account does not have permission for this action.' })
      next()
    } catch (error) { next(error) }
  }
}
