import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import NsrpWarningPanel from '../components/NsrpWarningPanel.jsx'

afterEach(cleanup)

const makeWarnings = (count) =>
  Array.from({ length: count }, (_, index) => ({
    field: index % 2 === 0 ? `technicalTraining[${index}].institution` : `workExperience[${index}].company`,
    reason: index % 2 === 0 ? 'truncated' : 'minimum-font-size',
    length: 40 + index,
    limit: 40,
  }))

describe('NsrpWarningPanel', () => {
  it('renders nothing when there are no warnings', () => {
    const { container } = render(<NsrpWarningPanel warnings={[]} onFix={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('collapses the list by default with more than 3 warnings, showing a severity summary', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(8)} onFix={vi.fn()} />)
    expect(screen.getByText('8 entries need attention: 4 will be cut off, 4 printed small')).toBeInTheDocument()
    expect(screen.queryByText('Training #1: Institution')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
  })

  it('expands on Show details', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(8)} onFix={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText('Training #1: Institution')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
  })

  it('shows details immediately with 3 or fewer warnings', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(3)} onFix={vi.fn()} />)
    expect(screen.getByText('Training #1: Institution')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show details' })).not.toBeInTheDocument()
  })

  it('groups by form section in form order with counts', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(2)} onFix={vi.fn()} />)
    const headings = screen.getAllByText(/\(\d+ entr(y|ies)\)/).map((node) => node.textContent)
    expect(headings).toEqual(['Technical/Vocational Training (1 entry)', 'Work Experience (1 entry)'])
  })

  it('shows one compact row per entry with a status chip and a working Fix button', () => {
    const onFix = vi.fn()
    render(<NsrpWarningPanel warnings={makeWarnings(2)} onFix={onFix} />)
    expect(screen.getByText('Cut off')).toBeInTheDocument()
    expect(screen.getByText('Small')).toBeInTheDocument()
    // Explanation shown once per group, not repeated per row
    expect(screen.getAllByText(/Too long, so the end will be cut off/)).toHaveLength(1)
    const fixButtons = screen.getAllByRole('button', { name: 'Fix' })
    expect(fixButtons).toHaveLength(2)
    fireEvent.click(fixButtons[0])
    expect(onFix).toHaveBeenCalledWith('technicalTraining[0].institution')
  })

  it('offers the Fix all cut-off entries shortcut only when cut-off warnings exist', () => {
    const onFixAll = vi.fn()
    const { rerender } = render(<NsrpWarningPanel warnings={makeWarnings(2)} onFix={vi.fn()} onFixAllCutOff={onFixAll} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fix all cut-off entries' }))
    expect(onFixAll).toHaveBeenCalledTimes(1)
    rerender(<NsrpWarningPanel warnings={[{ field: 'workExperience[0].company', reason: 'minimum-font-size' }]} onFix={vi.fn()} onFixAllCutOff={onFixAll} />)
    expect(screen.queryByRole('button', { name: /Fix all cut-off/ })).not.toBeInTheDocument()
  })

  it('shows remaining count while walking through cut-off fixes', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(2)} onFix={vi.fn()} onFixAllCutOff={vi.fn()} cutOffRemaining={2} />)
    expect(screen.getByRole('button', { name: 'Fix next cut-off entry (2 left)' })).toBeInTheDocument()
  })

  it('never shows raw field paths in the rendered output', () => {
    render(<NsrpWarningPanel warnings={makeWarnings(3)} onFix={vi.fn()} />)
    const panel = screen.getByRole('status')
    expect(within(panel).queryByText(/\[[0-9]+\]/)).toBeNull()
  })
})
