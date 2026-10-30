import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import App from '../App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})
afterEach(() => vi.unstubAllGlobals())

describe('signup refresh', () => {
  it('stays on applicant signup after remount, restores the email, and resets passwords', () => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Create an account (Applicant)' }))
    expect(screen.queryByText('Your signup draft has been restored.')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Email$/), { target: { value: 'draft@example.com' } })
    fireEvent.change(screen.getByLabelText(/^Password$/), { target: { value: 'Password123!' } })
    expect(sessionStorage.getItem('peso-auth-view')).toBe('signup')
    first.unmount()

    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sign Up', exact: true })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email$/)).toHaveValue('draft@example.com')
    expect(screen.getByLabelText(/^Password$/)).toHaveValue('')
    expect(screen.getByText('Your signup draft has been restored.')).toBeInTheDocument()
    expect(screen.getByText(/Passwords, email verification, uploaded files, and signatures are not saved/)).toBeInTheDocument()
    expect(localStorage.getItem('peso-applicant-signup-draft')).not.toContain('Password123!')
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument()
  })

  it('restores the saved step and answers and allows reviewing account details', () => {
    sessionStorage.setItem('peso-auth-view', 'signup')
    localStorage.setItem('peso-applicant-signup-draft', JSON.stringify({ email: 'saved@example.com', step: 4, nsrpMode: 'online', answers: { surname: 'Cruz', languages: [{ name: 'Others', otherName: 'Bikol', speak: true }] } }))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Work & skills' })).toBeInTheDocument()
    expect(screen.getByLabelText('Other language')).toHaveValue('Bikol')
    fireEvent.click(screen.getByRole('button', { name: /^1\. Account/ }))
    expect(screen.getByLabelText(/^Email$/)).toHaveValue('saved@example.com')
    expect(screen.getByLabelText(/^Password$/)).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(screen.queryByText('Your signup draft has been restored.')).not.toBeInTheDocument()
  })

  it('returns to Login after explicitly leaving signup, including after refresh', () => {
    sessionStorage.setItem('peso-auth-view', 'signup')
    const first = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Discard and start over' }))
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeInTheDocument()
    expect(sessionStorage.getItem('peso-auth-view')).toBe('login')
    first.unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeInTheDocument()
    expect(screen.queryByText('Your signup draft has been restored.')).not.toBeInTheDocument()
  })

  it('also restores the employer signup screen without restoring its password', () => {
    sessionStorage.setItem('peso-auth-view', 'employer')
    localStorage.setItem('peso-employer-signup-draft', JSON.stringify({ email: 'company@example.com', step: 'account' }))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Employer Sign Up', exact: true })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email/)).toHaveValue('company@example.com')
    expect(screen.getByLabelText(/^Password/)).toHaveValue('')
    expect(screen.getByText('Your signup draft has been restored.')).toBeInTheDocument()
  })
})
