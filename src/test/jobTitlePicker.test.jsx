import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import JobTitlePicker from '../components/JobTitlePicker'

const categories = [{ category: 'IT', titles: [{ id: 'developer', name: 'Software Developer' }, { id: 'support', name: 'IT Support Specialist' }] }, { category: 'Sales', titles: [{ id: 'sales', name: 'Sales Representative' }] }]
function Picker() {
  const [value, setValue] = useState({ title: '', customTitle: '' })
  return <JobTitlePicker categories={categories} {...value} onChange={setValue} />
}
describe('JobTitlePicker', () => {
  it('filters and selects catalog options with the keyboard in one input', () => {
    render(<Picker />)
    const input = screen.getByRole('combobox', { name: /job title/i })
    fireEvent.change(input, { target: { value: 'support' } })
    expect(screen.getByRole('option', { name: 'IT Support Specialist' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Sales Representative' })).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('IT Support Specialist')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })
  it('offers custom titles inline and retains the value after selection', () => {
    render(<Picker />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Custom Role' } })
    fireEvent.click(screen.getByRole('option', { name: "Add 'Custom Role' as new job title" }))
    expect(input).toHaveValue('Custom Role')
    expect(screen.getByText(/New titles are reviewed/)).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
