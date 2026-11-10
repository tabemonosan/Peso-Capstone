import { createContext, useCallback, useContext } from 'react'
import { adminCan, adminLevel, ADMIN_LABELS } from '../../shared/adminAccess.js'
export const AdminAccessContext = createContext({ adminLevel: 'admin' })
export function useAdminAccess() {
  const user = useContext(AdminAccessContext)
  const level = adminLevel(user)
  const can = useCallback(permission => adminCan({ adminLevel: level }, permission), [level])
  return { level, label: ADMIN_LABELS[level], can }
}
