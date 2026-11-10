export function employerSessionGuard({ Employer, authenticate }) {
  return async (req, res, next) => {
    const actor = authenticate(req)
    if (actor?.role !== 'Employer') return next()
    try {
      const account = await Employer.findOne({ email: actor.email }).select('sessionVersion').lean()
      if (!account || (actor.sessionVersion || 0) !== (account.sessionVersion || 0)) return res.status(401).json({ code: 'SESSION_ENDED', error: 'Your session has ended. Please sign in again.' })
      next()
    } catch (error) { next(error) }
  }
}
