import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import VerificationDocsReviewModal from '../components/VerificationDocsReviewModal'

const mockFetch = vi.fn()

const applicant = {
  id: 'app1',
  email: 'eliseo@example.com',
  emailVerified: true,
  profile: { firstName: 'Eliseo', middleName: 'Dajac', lastName: 'Dioneda', suffix: 'III' },
}

const docsResponse = {
  verificationStatus: 'under_review',
  documents: [
    {
      docKey: 'validId1',
      label: 'Valid ID #1',
      idType: 'SSS',
      status: 'pending',
      uploadsUsed: 1,
      required: true,
      latest: { version: 1, originalName: 'id.pdf', size: 1024, uploadedAt: '2026-10-26T00:00:00Z' },
    },
  ],
}

function setupFetch({ putImpl } = {}) {
  mockFetch.mockImplementation((url, options) => {
    if (options?.method === 'PUT') {
      return putImpl
        ? putImpl(url, options)
        : Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'app1', documents: docsResponse.documents }) })
    }
    return Promise.resolve({ ok: true, json: async () => docsResponse })
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  setupFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function renderModal(props = {}) {
  render(<VerificationDocsReviewModal applicant={{ ...applicant, ...props }} token="token" onClose={() => {}} onReviewed={() => {}} />)
  await screen.findByText(/Valid ID #1/)
}

describe('VerificationDocsReviewModal confirm step', () => {
  it('shows front/back controls only for uploaded Valid ID sides and opens the corresponding signed URLs', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const docs = [
      {
        docKey: 'validId1',
        label: 'Valid ID #1',
        idType: 'SSS',
        status: 'pending',
        latest: { version: 1, originalName: 'id.pdf', url: '/signed/id1-front', back: { url: '/signed/id1-back' } },
        history: [
          { version: 1, originalName: 'older-id.pdf', url: '/signed/id1-v1-front', back: { url: '/signed/id1-v1-back' } },
          { version: 2, originalName: 'id.pdf', url: '/signed/id1-front', back: { url: '/signed/id1-back' } },
        ],
      },
      {
        docKey: 'validId2',
        label: 'Valid ID #2',
        idType: 'Passport',
        status: 'pending',
        latest: { version: 1, originalName: 'passport.pdf', url: '/signed/id2-front' },
      },
      {
        docKey: 'nsrpForm',
        label: 'NSRP Registration Form',
        status: 'pending',
        latest: { version: 1, originalName: 'nsrp.pdf', url: '/signed/nsrp-front', back: { url: '/signed/nsrp-back' } },
      },
      {
        docKey: 'birthCertificate',
        label: 'Birth Certificate',
        status: 'pending',
        latest: { version: 1, originalName: 'birth.pdf', url: '/signed/birth-front', back: { url: '/signed/birth-back' } },
      },
    ]
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ...docsResponse, documents: docs }) })
    render(<VerificationDocsReviewModal applicant={applicant} token="token" onClose={() => {}} onReviewed={() => {}} />)

    await screen.findByText(/Valid ID #1/)
    for (const label of ['NSRP Registration Form', 'Birth Certificate']) {
      const row = screen.getByText(new RegExp(label)).closest('li')
      expect(within(row).getByRole('button', { name: 'View' })).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'View back' })).not.toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'View front' })).not.toBeInTheDocument()
    }

    const id1Row = screen.getByText(/Valid ID #1/).closest('li')
    const id1Group = within(id1Row).getByRole('group', { name: 'Valid ID #1 file views' })
    fireEvent.click(within(id1Group).getByRole('button', { name: 'View front' }))
    fireEvent.click(within(id1Group).getByRole('button', { name: 'View back' }))
    expect(open).toHaveBeenNthCalledWith(1, 'http://localhost:4000/signed/id1-front', '_blank')
    expect(open).toHaveBeenNthCalledWith(2, 'http://localhost:4000/signed/id1-back', '_blank')

    const id2Row = screen.getByText(/Valid ID #2/).closest('li')
    expect(within(id2Row).getByRole('button', { name: 'View front' })).toBeInTheDocument()
    expect(within(id2Row).queryByRole('button', { name: 'View back' })).not.toBeInTheDocument()

    fireEvent.click(within(id1Row).getByRole('button', { name: 'History (2)' }))
    const historyGroup = within(id1Row).getByRole('group', { name: 'Valid ID #1 version 1 file views' })
    expect(within(historyGroup).getByRole('button', { name: 'View front' })).toBeInTheDocument()
    fireEvent.click(within(historyGroup).getByRole('button', { name: 'View back' }))
    expect(open).toHaveBeenNthCalledWith(3, 'http://localhost:4000/signed/id1-v1-back', '_blank')
  })

  it('shows saved applicant details and NSRP source without claiming an existing NSRP is not submitted', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        verificationStatus: 'under_review',
        basic: {
          firstName: 'Maria',
          middleName: 'Santos',
          lastName: 'Dela Cruz',
          suffix: 'Jr.',
          phone: '09171234567',
          addressCity: 'Quezon City',
          addressProvince: 'Metro Manila',
          dob: '1998-04-12',
          location: 'Quezon City, Metro Manila',
        },
        nsrpData: { firstName: 'Maria', cellphone: '09171234567', addressCity: 'Quezon City' },
        documents: [{
          docKey: 'nsrpForm',
          label: 'NSRP Registration Form',
          status: 'pending',
          sourceType: 'generated',
          latest: { version: 1, originalName: 'nsrp.pdf', url: '/signed/nsrp' },
        }],
      }),
    })
    render(
      <VerificationDocsReviewModal
        applicant={{
          ...applicant,
          emailVerified: true,
          createdAt: '2026-10-01T00:00:00Z',
          profile: { skills: ['Accounting'] },
        }}
        token="token"
        onClose={() => {}}
        onReviewed={() => {}}
      />,
    )

    expect(await screen.findByText('Maria Santos Dela Cruz Jr.')).toBeInTheDocument()
    expect(screen.getByText('09171234567')).toBeInTheDocument()
    expect(screen.getByText('Quezon City, Metro Manila')).toBeInTheDocument()
    expect(screen.getByText('1998-04-12')).toBeInTheDocument()
    expect(screen.getByText('Generated from online answers')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2)
    expect(screen.queryByText('Not submitted')).not.toBeInTheDocument()
    expect(screen.getByText('Accounting')).toBeInTheDocument()
  })

  it('renders applicants with missing optional data without errors', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [], basic: {}, nsrpData: null }),
    })
    render(
      <VerificationDocsReviewModal
        applicant={{ id: 'legacy', email: 'legacy@example.com' }}
        token="token"
        onClose={() => {}}
        onReviewed={() => {}}
      />,
    )

    expect(await screen.findByText('Applicant details')).toBeInTheDocument()
    expect(screen.getAllByText('Not provided').length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText('Not submitted')).toBeInTheDocument()
    expect(screen.getByText('No verification documents found.')).toBeInTheDocument()
  })

  it('does not call the API until the confirm dialog is confirmed', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Approve Valid ID #1 (SSS) for Eliseo Dajac Dioneda III?' })
    expect(within(dialog).getByText('The applicant will be notified.')).toBeInTheDocument()
    expect(mockFetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    await waitFor(() => expect(mockFetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1))
    await screen.findByText('Valid ID #1 approved')
  })

  it('Cancel makes no request', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mockFetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)
    expect(screen.queryByRole('alertdialog', { name: /Approve Valid ID/ })).not.toBeInTheDocument()
  })

  it('Esc cancels the dialog without a request', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: /Approve Valid ID/ })).not.toBeInTheDocument()
    expect(mockFetch.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0)
  })

  it('double-clicking confirm sends exactly one request', async () => {
    let resolvePut
    const putCalls = []
    setupFetch({
      putImpl: (url, options) => {
        putCalls.push(options)
        return new Promise((resolve) => { resolvePut = () => resolve({ ok: true, status: 200, json: async () => ({ id: 'app1' }) }) })
      },
    })
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    const confirmButton = within(dialog).getByRole('button', { name: 'Yes, approve' })
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)
    await waitFor(() => expect(putCalls).toHaveLength(1))
    resolvePut()
  })

  it('shows an inline error with Retry when the request fails', async () => {
    setupFetch({
      putImpl: () => Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Storage unavailable' }) }),
    })
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    await within(dialog).findByText('Storage unavailable')
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    // Dialog stays open
    expect(dialog).toBeInTheDocument()
  })

  it('on a 409 the dialog closes and the list refreshes', async () => {
    setupFetch({
      putImpl: () => Promise.resolve({ ok: false, status: 409, json: async () => ({ code: 'NOT_PENDING', error: 'This document is not pending review.' }) }),
    })
    await renderModal()
    const getsBefore = mockFetch.mock.calls.filter(([, o]) => !o?.method).length
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, approve' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: /Approve Valid ID/ })).not.toBeInTheDocument())
    await waitFor(() => expect(mockFetch.mock.calls.filter(([, o]) => !o?.method).length).toBeGreaterThan(getsBefore))
  })

  it('Approve is always enabled and opens the dialog (no email-verification restriction)', async () => {
    await renderModal({ emailVerified: false })
    const approve = screen.getByRole('button', { name: 'Approve' })
    expect(approve).not.toBeDisabled()
    fireEvent.click(approve)
    expect(await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })).toBeInTheDocument()
  })

  it('uses role="alertdialog", focuses Cancel by default, and returns focus to the Approve button on close', async () => {
    await renderModal()
    const approve = screen.getByRole('button', { name: 'Approve' })
    approve.focus() // real browsers focus a button when it is clicked
    fireEvent.click(approve)
    const dialog = await screen.findByRole('alertdialog', { name: /Approve Valid ID/ })
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(approve).toHaveFocus()
  })

  it('reject requires a reason and quick-picks fill it', async () => {
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Reject Valid ID #1/ })
    const confirmReject = within(dialog).getByRole('button', { name: 'Confirm reject' })
    expect(confirmReject).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Blurry or unreadable' }))
    expect(confirmReject).not.toBeDisabled()
    fireEvent.click(confirmReject)
    await waitFor(() => {
      const put = mockFetch.mock.calls.find(([, options]) => options?.method === 'PUT')
      expect(JSON.parse(put[1].body)).toEqual({ status: 'rejected', reason: 'Blurry or unreadable' })
    })
  })

  it('offers Revert to pending for approved documents and requires a reason', async () => {
    setupFetch()
    mockFetch.mockImplementation((url, options) => {
      if (options?.method === 'PUT') {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'app1' }) })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ...docsResponse,
          documents: [{ ...docsResponse.documents[0], status: 'approved' }],
        }),
      })
    })
    await renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Revert to pending' }))
    const dialog = await screen.findByRole('alertdialog', { name: /Revert Valid ID #1/ })
    const confirmRevert = within(dialog).getByRole('button', { name: 'Confirm revert' })
    expect(confirmRevert).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Approved by mistake' } })
    fireEvent.click(confirmRevert)
    await waitFor(() => {
      const put = mockFetch.mock.calls.find(([, options]) => options?.method === 'PUT')
      expect(JSON.parse(put[1].body)).toEqual({ action: 'revert', reason: 'Approved by mistake' })
    })
  })
})
