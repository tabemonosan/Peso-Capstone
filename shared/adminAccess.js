export const ADMIN_LEVELS = ['super_admin', 'admin', 'staff']
export const ADMIN_LABELS = { super_admin: 'Super Admin', admin: 'Admin', staff: 'Staff' }
export const adminLevel = user => ADMIN_LEVELS.includes(user?.adminLevel) ? user.adminLevel : 'admin'
export function adminCan(user, permission) {
  const level = adminLevel(user)
  if (level === 'super_admin') return true
  if (['accounts', 'settings', 'deleteAccounts'].includes(permission)) return false
  if (level === 'admin') return true
  return ['read', 'notes', 'refer', 'reports', 'ownLogs'].includes(permission)
}
export function adminViewAllowed(user, view) {
  if (view === 'internal-accounts') return adminCan(user, 'accounts')
  if (view === 'email-delivery') return adminCan(user, 'emailDelivery')
  if (view === 'account-deletions') return adminCan(user, 'decide')
  if (['verification-rules'].includes(view)) return adminLevel(user) !== 'staff'
  return true
}
