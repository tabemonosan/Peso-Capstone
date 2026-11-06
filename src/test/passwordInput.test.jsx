import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PasswordInput from '../components/PasswordInput'

describe('password visibility icons', () => {
  it('reveals and hides each field independently without submitting the form', () => {
    const submit = vi.fn(event => event.preventDefault())
    render(<form onSubmit={submit}>
      <label>Password<PasswordInput id="test-password" defaultValue="Example123!" /></label>
      <label>Confirm password<PasswordInput id="test-confirm" visibilityLabel="confirm password" defaultValue="Example123!" /></label>
    </form>)
    const password = screen.getByLabelText('Password', { selector: 'input' })
    const confirmation = screen.getByLabelText('Confirm password', { selector: 'input' })
    expect(password).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show password', exact: true }))
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('Example123!')
    expect(confirmation).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Hide password', exact: true })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }))
    expect(confirmation).toHaveAttribute('type', 'text')
    fireEvent.click(screen.getByRole('button', { name: 'Hide password', exact: true }))
    expect(password).toHaveAttribute('type', 'password')
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps disabled fields hidden and preserves validation attributes', () => {
    render(<label>Password<PasswordInput disabled required aria-invalid="true" aria-describedby="password-error" /></label>)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
    const input = screen.getByLabelText('Password', { selector: 'input' })
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'password-error')
    expect(input).toBeRequired()
  })
})
