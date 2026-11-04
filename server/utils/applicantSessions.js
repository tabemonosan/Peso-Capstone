import mongoose from 'mongoose'

// Bind current sessions to an account ID so reusing an email never revives
// tokens from a retired account. Legacy tokens work only on legacy accounts.
export function applicantSessionGuard({ Applicant, authenticate }) {
  return async (req, res, next) => {
    try {
      const decoded = authenticate(req)
      if (decoded?.role !== 'Applicant') return next()
      if (decoded.sub && !mongoose.isValidObjectId(decoded.sub)) return res.status(401).json({ code: 'SESSION_ENDED', error: 'Please sign in again.' })
      const account = await Applicant.findOne(decoded.sub ? { _id: decoded.sub } : { email: decoded.email }).select('email deletedAt sessionVersion verificationStatus').lean()
      if (!account || account.deletedAt || account.email !== decoded.email) return res.status(401).json({ code: 'SESSION_ENDED', error: 'This session has ended. Please sign in again.' })
      const version = account.sessionVersion || 0
      if ((decoded.sub && decoded.sessionVersion !== version) || (!decoded.sub && version !== 0)) return res.status(401).json({ code: 'SESSION_ENDED', error: 'Please sign in again.' })
      if (account.verificationStatus === 'waitlisted') {
        const allowed = /^(?:\/auth(?:\/|$)|\/login$|\/logout$|\/profile(?:$|\/(?:nsrp$|consistency$|verification-documents(?:\/|$)|document-explanations(?:\/|$)))|\/notifications(?:\/|$)|\/documents(?:\/|$)|\/nsrp\/(?:validate-signup|preview-signup)$|\/account-deletion(?:\/|$)|\/applicants\/[a-f\d]{24}\/verification-documents$)/i.test(req.path)
        if (!allowed) return res.status(403).json({ code: 'APPLICANT_WAITLISTED', error: 'Your account needs a review by PESO staff. Open My Documents to correct or explain a difference.' })
      }
      next()
    } catch { res.status(503).json({ error: 'Unable to verify your session. Try again.' }) }
  }
}
