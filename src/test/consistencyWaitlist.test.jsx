import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, it, expect, vi } from 'vitest'
import ConsistencyWaitlistCard from '../components/ConsistencyWaitlistCard'
import AdminWaitlistActions from '../components/AdminWaitlistActions'
import CheckDocumentsButton from '../components/CheckDocumentsButton'
import MyDocumentsModal from '../components/MyDocumentsModal'
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const state = { waitlisted: true, status: 'waitlisted', contact: 'SAMPLE PESO contact', officeHours: 'SAMPLE office hours', issues: [{ document: 'validId1', label: 'Valid ID #1', fieldGroup: 'birth date', message: 'The date of birth we read may not match your NSRP.', chancesLeft: 0, canResubmit: false }] }
it('shows rate-limited verification without a flag or correction prompt', () => {
  render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'under_review', review: { documents: [{ docKey: 'validId1', needsReview: true, verificationDelayed: true, reason: 'Automatic verification has reached its daily limit. You do not need to upload it again.' }] }, documents: [{ docKey: 'validId1', label: 'Valid ID #1', status: 'pending', uploadsRemaining: 4, latest: { version: 1 } }] }} />)
  expect(screen.getByText('Awaiting verification')).toBeInTheDocument()
  expect(screen.getByText(/daily limit/)).toBeInTheDocument()
  expect(screen.queryByText('Flagged for review')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Explain a difference' })).not.toBeInTheDocument()
  expect(screen.queryByText('How to correct this submission')).not.toBeInTheDocument()
})
it('shows neutral reasons, chances, office details and approximate-reading guidance', () => {
  render(<ConsistencyWaitlistCard state={state} />)
  expect(screen.getByRole('heading', { name: 'Why is my account waitlisted?' })).toBeInTheDocument()
  expect(screen.getByText(/0 chances left/)).toHaveTextContent('Please contact the PESO office')
  expect(screen.getByText(/Text reading is approximate/)).toBeInTheDocument()
  expect(screen.getByText(/SAMPLE PESO contact/)).toHaveTextContent('SAMPLE office hours')
  expect(document.body.textContent).not.toMatch(/threshold|other account|fraud|critical|rules version/i)
})
it('shows checking status without telling an applicant they are waitlisted', () => {
  render(<ConsistencyWaitlistCard state={{ checking: true, waitlisted: false }} />)
  expect(screen.getByRole('status')).toHaveTextContent('Your documents are being checked')
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
})
it('keeps explanations available while upload chances are exhausted', () => {
  render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'waitlisted', consistency: state, documents: [{ docKey: 'validId1', label: 'Valid ID #1', status: 'pending', uploadsRemaining: 4, latest: { version: 1 } }] }} />)
  expect(screen.getByRole('button', { name: 'Explain a difference' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /Resubmit|Replace|Upload document/i })).not.toBeInTheDocument()
})
it('allows a pending birth certificate replacement when only the ID has an exhausted mismatch', () => {
  render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'waitlisted', consistency: { ...state, issues: [{ ...state.issues[0], document: 'validId1', label: 'Valid ID #1', fieldGroup: 'ID number' }] }, documents: [{ docKey: 'birthCertificate', label: 'Birth Certificate', status: 'pending', uploadsRemaining: 3, latest: { version: 2 } }] }} />)
  const birth = screen.getByText('Birth Certificate').closest('li')
  fireEvent.change(within(birth).getByLabelText(/^Birth certificate copy type/), { target: { value: 'PSA copy on security paper' } })
  fireEvent.change(within(birth).getByLabelText('Choose Birth Certificate file'), { target: { files: [new File(['sample'], 'clearer.png', { type: 'image/png' })] } })
  expect(within(birth).getByRole('button', { name: 'Upload', exact: true })).toBeEnabled()
})
it('does not request an explanation or admin review for a verified document', () => {
  render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'approved', documents: [{ docKey: 'validId1', label: 'Valid ID #1', status: 'approved', latest: { version: 1 } }] }} />)
  expect(screen.getByText('Verified')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Explain a difference' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Waiting for PESO review/)).not.toBeInTheDocument()
})
it('shows an unprocessed document as checking without requesting an explanation', () => {
  render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'under_review', documents: [{ docKey: 'validId1', label: 'Valid ID #1', status: 'pending', latest: { version: 1 } }] }} />)
  expect(screen.getByText('Checking')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Explain a difference' })).not.toBeInTheDocument()
})
it('requires a comparison checkbox and reason for admin release', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<AdminWaitlistActions token="sample" item={{ waitlisted: true, accountId: 'sample', docKey: 'birthCertificate', daysWaiting: 1, consistencyState: { token: 'sample-review-revision', waitlistedAt: new Date(), issues: [{ docKey: 'birthCertificate', fieldGroup: 'birth date', evidence: 'independent' }] } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Release from waitlist' }))
  const dialog = screen.getByRole('alertdialog')
  const confirm = within(dialog).getByRole('button', { name: 'Confirm' })
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Documents compared by staff.' } })
  expect(confirm).toBeDisabled()
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I compared the documents' }))
  fireEvent.click(confirm)
  await waitFor(() => expect(fetcher).toHaveBeenCalled())
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ action: 'release', compared: true, unresolved: 1, reason: 'Documents compared by staff.', token: 'sample-review-revision' })
})
it('preflight is advisory and sends only typed data and uploaded files', async () => {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ advisory: true, issues: [{ docKey: 'validId1', message: 'Please check the ID expiry.' }] }) }))
  vi.stubGlobal('fetch', fetcher)
  render(<CheckDocumentsButton docs={{ birthCertificate: null, id1: { type: 'SSS' }, id2: { type: '' } }} nsrp={{ gsisSss: 'SAMPLE' }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Check my documents' }))
  expect(await screen.findByText(/Please check the ID expiry/)).toBeInTheDocument()
  expect(screen.getByText(/does not read document text or block submission/)).toBeInTheDocument()
  expect(fetcher.mock.calls[0][0]).toMatch(/check-documents$/)
})

it.each(['pending', 'rejected', 'needs_resubmission', 'approved', 'received'])('shows a collected birth certificate as Received for legacy status %s', status => {
 render(<MyDocumentsModal token="sample" onClose={() => {}} info={{ verificationStatus: 'under_review', consistency: { checking: true }, review: { documents: [{ docKey: 'birthCertificate', needsReview: true, reason: 'Could not be read' }] }, documents: [{ docKey: 'birthCertificate', label: 'Birth Certificate', status, uploadsRemaining: 3, latest: { version: 1 } }] }} />)
 const card = screen.getByText('Birth Certificate').closest('li')
 expect(within(card).getByText('Received')).toBeInTheDocument()
 expect(within(card).getByText(/not verified or compared/)).toBeInTheDocument()
 expect(within(card).queryByText(/Could not be read|Checking|Flagged for review/)).not.toBeInTheDocument()
 expect(within(card).queryByRole('button', { name: 'Explain a difference' })).not.toBeInTheDocument()
 expect(within(card).queryByText('How to correct this submission')).not.toBeInTheDocument()
})
