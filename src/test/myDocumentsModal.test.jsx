import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MyDocumentsModal from '../components/MyDocumentsModal'
import MyDocumentsPage from '../components/MyDocumentsPage'

const docs = [
  {
    docKey: 'nsrpForm',
    label: 'NSRP Registration Form',
    status: 'pending',
    latest: { url: '/signed/nsrp-front', back: { url: '/signed/nsrp-back' } },
  },
  {
    docKey: 'birthCertificate',
    label: 'Birth Certificate',
    status: 'pending',
    latest: { url: '/signed/birth-front', back: { url: '/signed/birth-back' } },
  },
  {
    docKey: 'validId1',
    label: 'Valid ID #1',
    idType: 'SSS',
    status: 'pending',
    latest: { url: '/signed/id1-front', back: { url: '/signed/id1-back' } },
  },
  {
    docKey: 'validId2',
    label: 'Valid ID #2',
    idType: 'Passport',
    status: 'pending',
    latest: { url: '/signed/id2-front' },
  },
]

describe('MyDocumentsModal file viewers', () => {
  it('shows automatic scanning instead of stale review flags during a recheck', () => {
    render(<MyDocumentsModal token="token" onClose={() => {}} info={{
      verificationStatus: 'waitlisted', consistency: { checking: true, waitlisted: true, issues: [{ document: 'birthCertificate', chancesLeft: 2 }] },
      documents: [{ ...docs[1], status: 'pending' }], review: { documents: [{ docKey: 'birthCertificate', needsReview: true, reason: 'Old review message' }] },
    }} />)
    const row = screen.getByText('Birth Certificate').closest('li')
    expect(within(row).getByText('Checking')).toBeInTheDocument()
    expect(within(row).getByText(/Scanning your upload/)).toBeInTheDocument()
    expect(screen.queryByText('Old review message')).not.toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Explain a difference' })).not.toBeInTheDocument()
  })
  it.each([2, 3])('requires both ID sides and sends them together with the saved type for document %s', async index => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    const doc = docs[index]
    render(<MyDocumentsModal token="token" onClose={() => {}} info={{ verificationStatus: 'under_review', documents: [{ ...doc, uploadsRemaining: 4 }] }} />)
    const row = screen.getByText(new RegExp(doc.label)).closest('li')
    expect(within(row).getByRole('combobox', { name: 'ID type' })).toHaveValue(doc.idType)
    expect(within(row).queryByLabelText('ID number')).not.toBeInTheDocument()
    const file = new File(['sample'], 'replacement.png', { type: 'image/png' })
    const back = new File(['sample back'], 'replacement-back.png', { type: 'image/png' })
    fireEvent.change(within(row).getByLabelText(`Choose ${doc.label} front file`), { target: { files: [file] } })
    expect(within(row).getByText('replacement.png')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Upload', exact: true })).toBeDisabled()
    fireEvent.change(within(row).getByLabelText(`Choose ${doc.label} back file`), { target: { files: [back] } })
    expect(within(row).getByRole('button', { name: 'Upload', exact: true })).toBeEnabled()
    fireEvent.click(within(row).getByRole('button', { name: 'Upload', exact: true }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const payload = fetchMock.mock.calls[0][1].body
    expect(payload.get('document')).toBe(file)
    expect(payload.get('documentBack')).toBe(back)
    expect(payload.get('idType')).toBe(doc.idType)
    expect(JSON.parse(payload.get('verificationDetails'))).toEqual({})
    fetchMock.mockRestore()
  })

  it('lets under-review applicants edit pending NSRP details and replace pending documents', () => {
    render(<MyDocumentsModal token="token" onClose={() => {}} info={{ verificationStatus: 'under_review', nsrpData: { firstName: 'Sample', surname: 'Example' }, documents: docs.map(doc => ({ ...doc, uploadsRemaining: 4 })) }} />)
    expect(screen.getByRole('button', { name: 'Update NSRP' })).toBeEnabled()
    const birth = screen.getByText('Birth Certificate').closest('li')
    expect(within(birth).getByRole('button', { name: 'Upload', exact: true })).toBeInTheDocument()
    expect(within(birth).getByLabelText(/^Birth certificate copy type/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Update NSRP' }))
    expect(screen.getByRole('heading', { name: 'Update NSRP' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Surname/i)).toHaveValue('Example')
  })

  it('keeps document cards closed until the applicant opens them', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ verificationStatus: 'under_review', documents: docs }) })
    render(<MyDocumentsPage applicantId="applicant1" token="token" />)
    await screen.findByText('Submitted to PESO')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Birth Certificate')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Manage my documents' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Birth Certificate')).toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('waits for pending review, allows rejected resubmissions, and requests corrections for approved documents', async () => {
    const onUpdated = vi.fn()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
    render(<MyDocumentsModal token="token" onClose={() => {}} onUpdated={onUpdated} info={{ documents: [
      { ...docs[0], required: true, status: 'approved' },
      { ...docs[1], required: true, status: 'rejected', uploadsRemaining: 3, latest: { ...docs[1].latest, reviewReason: 'Please upload a clear copy' } },
      { ...docs[2], required: true, status: 'pending' },
    ] }} />)
    const pending = screen.getByText(/Valid ID #1/).closest('li')
    expect(within(pending).queryByRole('button', { name: /Upload|Replace|Resubmit/ })).not.toBeInTheDocument()
    expect(screen.getByText(/PESO feedback: Please upload a clear copy/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resubmit', exact: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }))
    fireEvent.change(screen.getByLabelText('What needs to be corrected?'), { target: { value: 'My phone number has changed.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request to PESO' }))
    await screen.findByText(/Your correction request was sent to PESO/)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/profile/verification-documents/nsrpForm/correction-request', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'My phone number has changed.' }) }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalled())
    fetchMock.mockRestore()
  })

  it('shows grouped front/back controls only for uploaded Valid ID sides and opens their signed URLs', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(
      <MyDocumentsModal
        info={{ documents: docs }}
        token="token"
        onClose={() => {}}
      />,
    )

    for (const label of ['NSRP Registration Form', 'Birth Certificate']) {
      const row = screen.getByText(label).closest('li')
      expect(within(row).getByRole('button', { name: 'View' })).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'View back' })).not.toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'View front' })).not.toBeInTheDocument()
    }

    const id1Row = screen.getByText(/Valid ID #1/).closest('li')
    const id1Group = within(id1Row).getByRole('group', { name: 'Valid ID #1 file views' })
    fireEvent.click(within(id1Group).getByRole('button', { name: 'View front' }))
    fireEvent.click(within(id1Group).getByRole('button', { name: 'View back' }))

    const id2Row = screen.getByText(/Valid ID #2/).closest('li')
    const id2Group = within(id2Row).getByRole('group', { name: 'Valid ID #2 file views' })
    expect(within(id2Group).getByRole('button', { name: 'View front' })).toBeInTheDocument()
    expect(within(id2Group).queryByRole('button', { name: 'View back' })).not.toBeInTheDocument()

    expect(open).toHaveBeenNthCalledWith(1, 'http://localhost:4000/signed/id1-front', '_blank')
    expect(open).toHaveBeenNthCalledWith(2, 'http://localhost:4000/signed/id1-back', '_blank')
  })
})
