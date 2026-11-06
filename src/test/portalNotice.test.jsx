import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalNotice from '../components/PortalNotice'
import { showNotice } from '../utils/portalNotice'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
describe('portal notices', () => {
  it('shows an in-app success message without a browser popup or moving focus', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<><PortalNotice /><button onClick={() => showNotice('Profile saved.', 'success')}>Save profile</button></>)
    const button = screen.getByRole('button', { name: 'Save profile' })
    button.focus(); fireEvent.click(button)
    expect(screen.getByRole('status')).toHaveTextContent('Profile saved.')
    expect(button).toHaveFocus()
    expect(alert).not.toHaveBeenCalled()
  })
  it('dismisses success messages automatically but keeps errors available until dismissed', () => {
    vi.useFakeTimers()
    render(<PortalNotice />)
    act(() => { showNotice('Saved.', 'success'); showNotice('Please sign in again.', 'error') })
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in again.')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification: Please sign in again.' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('supports warning and information notices and keeps repeated messages from stacking', () => {
    render(<PortalNotice />)
    act(() => { showNotice('Select an item.', 'warning'); showNotice('Already referred.', 'info'); showNotice('Already referred.', 'info') })
    expect(screen.getByText('Please check')).toBeInTheDocument()
    expect(screen.getByText('Update')).toBeInTheDocument()
    expect(screen.getAllByText('Already referred.')).toHaveLength(1)
  })
  it('clears automatic-dismiss timers when the host unmounts', () => {
    vi.useFakeTimers()
    const { unmount } = render(<PortalNotice />)
    act(() => showNotice('Saved.', 'success'))
    expect(vi.getTimerCount()).toBe(1)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
