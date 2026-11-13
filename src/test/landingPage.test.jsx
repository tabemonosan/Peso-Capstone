import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LandingPage from '../components/LandingPage'

describe('landing page navigation', () => {
  it('resets the steps and sends visitors to the selected registration flow', () => {
    const onApplicantSignup = vi.fn()
    const onEmployerSignup = vi.fn()
    render(<LandingPage onApplicantSignup={onApplicantSignup} onEmployerSignup={onEmployerSignup} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create my applicant profile' }))
    expect(onApplicantSignup).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /Find your fit/ }))
    fireEvent.click(screen.getByRole('button', { name: /looking to hire/ }))
    const journey = within(screen.getByRole('region', { name: /From first step/ }))
    expect(journey.getByRole('button', { name: /Introduce your business/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /looking to hire/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Register my business' }))
    expect(onEmployerSignup).toHaveBeenCalledOnce()
  })

  it('dismisses the mobile navigation with Escape and restores toggle focus', () => {
    render(<LandingPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus()
  })

  it('closes the menu and opens sign in', () => {
    const onSignIn = vi.fn()
    render(<LandingPage onSignIn={onSignIn} />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute('aria-expanded', 'false')
    expect(onSignIn).toHaveBeenCalledOnce()
  })
})
