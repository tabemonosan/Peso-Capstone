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
})

async function renderModal(props = {}) {
  render(<VerificationDocsReviewModal applicant={{ ...applicant, ...props }} token="token" onClose={() => {}} onReviewed={() => {}} />)
  await screen.findByText(/Valid ID #1/)
}

describe('VerificationDocsReviewModal confirm step', () => {
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


