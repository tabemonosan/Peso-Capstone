import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import OverlayModal from '../components/OverlayModal.jsx'

afterEach(cleanup)

const renderModal = (props = {}) =>
  render(
    <OverlayModal
      onClose={props.onClose || vi.fn()}
      labelledBy="test-modal-title"
      header={<h2 id="test-modal-title">Title</h2>}
      footer={<button type="button">Confirm and submit</button>}
      {...props}
    >
      <p>Body content</p>
    </OverlayModal>,
  )

describe('OverlayModal', () => {
  it('has a scrollable body as the only scrolling area, with fixed header and footer', () => {
    renderModal()
    const body = screen.getByTestId('overlay-modal-body')
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('min-h-0')
    expect(body.className).toContain('flex-1')
    // Header and footer are outside the scrolling body
    expect(screen.getByText('Title').closest('[data-testid="overlay-modal-body"]')).toBeNull()
    expect(screen.getByText('Confirm and submit').closest('[data-testid="overlay-modal-body"]')).toBeNull()
    expect(screen.getByTestId('overlay-modal-footer')).toBeInTheDocument()
  })

  it('top-aligns on small screens and caps the card height so the top is always reachable', () => {
    renderModal()
    const overlay = screen.getByTestId('overlay-modal-overlay')
    expect(overlay.className).toContain('items-start')
    expect(overlay.className).toContain('sm:items-center')
    const card = overlay.querySelector('[role="dialog"]')
    expect(card.className).toContain('max-h-[calc(100dvh-2rem)]')
    expect(card.className).toContain('flex-col')
  })

  it('Close controls and footer buttons stay rendered (visible) regardless of content length', () => {
    render(
      <OverlayModal onClose={vi.fn()} labelledBy="t" header={<h2 id="t">T</h2>} footer={<button type="button">Confirm and submit</button>}>
        {Array.from({ length: 100 }, (_, index) => <p key={index}>Warning row {index}</p>)}
      </OverlayModal>,
    )
    expect(screen.getByText('T')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm and submit' })).toBeInTheDocument()
  })

  it('body scrollTop can return to 0 with many warnings', () => {
    renderModal()
    const body = screen.getByTestId('overlay-modal-body')
    body.scrollTop = 200
    body.scrollTop = 0
    expect(body.scrollTop).toBe(0)
  })

  it('locks page scroll while open and restores it on unmount', () => {
    const { unmount } = renderModal()
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('Esc closes the modal', () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Esc does not close while closeDisabled (e.g. submitting)', () => {
    const onClose = vi.fn()
    renderModal({ onClose, closeDisabled: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus into the modal and traps Tab navigation within it', () => {
    render(
      <OverlayModal
        onClose={vi.fn()}
        labelledBy="focus-modal-title"
        header={<><h2 id="focus-modal-title">Focus title</h2><button type="button">Close</button></>}
        footer={<button type="button">Submit</button>}
      >
        <button type="button">Body action</button>
      </OverlayModal>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    const submit = screen.getByRole('button', { name: 'Submit' })

    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(submit)
    fireEvent.keyDown(submit, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })
})
