import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import JobTitlePicker from '../components/JobTitlePicker'

const categories = [
  {
    category: 'IT',
    titles: [
      { id: 'developer', name: 'Software Developer' },
      { id: 'support', name: 'IT Support Specialist' },
    ],
  },
  {
    category: 'Sales',
    titles: [{ id: 'sales', name: 'Sales Representative' }],
  },
]

describe('JobTitlePicker', () => {
  it('filters catalog options as the user types', () => {
    render(<JobTitlePicker categories={categories} title="" customTitle="" onChange={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox', { name: /search job titles/i }), { target: { value: 'support' } })
    expect(screen.getByRole('option', { name: 'IT Support Specialist' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Sales Representative' })).not.toBeInTheDocument()
  })

  it('reveals a required custom title field for Other', () => {
    const onChange = vi.fn()
    render(<JobTitlePicker categories={categories} title="Other" customTitle="" onChange={onChange} />)
    expect(screen.getByLabelText(/Enter job title/i)).toBeRequired()
    fireEvent.change(screen.getByLabelText(/Enter job title/i), { target: { value: 'Custom Role' } })
    expect(onChange).toHaveBeenCalledWith({ title: 'Other', customTitle: 'Custom Role' })
  })
})
