import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MyDocumentsModal from '../components/MyDocumentsModal'

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
