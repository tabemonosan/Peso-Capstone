import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Modal from '../components/Modal'
import OverlayModal from '../components/OverlayModal'
import ConfirmDialog from '../components/ConfirmDialog'

afterEach(() => { cleanup(); document.body.style.overflow = '' })
function Nested({ overlay = false }) {
  const [open, setOpen] = useState(true), [confirm, setConfirm] = useState(false)
  const Parent = overlay ? OverlayModal : Modal
  return open && <Parent onClose={() => setOpen(false)} labelledBy="parent-title" header={<h2 id="parent-title">Parent review</h2>}>
    {!overlay && <h2 id="parent-title">Parent review</h2>}
    <button onClick={() => setConfirm(true)}>Approve</button>
    {confirm && <ConfirmDialog title="Approve record?" onConfirm={() => setOpen(false)} onCancel={() => setConfirm(false)} />}
  </Parent>
}
describe('nested modal lifecycle', () => {
  it.each([false, true])('restores page scrolling when approval closes both layers (overlay %s)', overlay => {
    render(<Nested overlay={overlay} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm', exact: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })
  it.each([false, true])('Escape closes only the confirmation, leaving the parent usable (overlay %s)', overlay => {
    render(<Nested overlay={overlay} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
  })
  it('preserves a preexisting overflow style when independently mounted modals close out of order', () => {
    document.body.style.overflow = 'auto'
    const first = render(<Modal onClose={vi.fn()}><p>First</p></Modal>)
    const second = render(<OverlayModal onClose={vi.fn()}><p>Second</p></OverlayModal>)
    first.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    second.unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
