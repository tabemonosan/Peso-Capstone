// @vitest-environment node
import { expect, it } from 'vitest'
import { describeAdminAction, isAdminBusinessAction } from '../services/adminActivity.js'

const id = '000000000000000000000001'
it.each([
  ['PUT', `/api/applicants/${id}/verification`, { status: 'approved' }, 'Approved applicant account'],
  ['PUT', `/api/employer-requests/${id}/status`, { status: 'approved' }, 'Approved employer registration'],
  ['PUT', `/api/account-deletion/requests/${id}`, { status: 'approved' }, 'Approved account deletion'],
  ['POST', '/api/admin/job-titles', { name: 'Clerk' }, 'Added job title: Clerk'],
])('describes the administrative action for %s %s', (method, path, body, label) => {
  expect(isAdminBusinessAction(method, path)).toBe(true)
  expect(describeAdminAction(method, path, body)).toBe(label)
})
it.each([
  ['GET', '/api/notifications'], ['GET', '/api/jobs'], ['HEAD', '/api/jobs'],
  ['PATCH', '/api/notifications/read-all'], ['POST', '/api/login'], ['POST', '/api/logout'],
  ['POST', '/api/nsrp/preview-signup'], ['POST', '/api/nsrp/validate-signup'], ['PATCH', '/api/profile/page-guides'],
])('does not record passive activity for %s %s', (method, path) => {
  expect(isAdminBusinessAction(method, path)).toBe(false)
})
