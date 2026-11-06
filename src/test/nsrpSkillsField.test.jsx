import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import NsrpSkillsField from '../components/NsrpSkillsField'

function Form() {
  const [answers, setAnswers] = useState({ skills: ['Computer Literate'], othersText: '' })
  return <><NsrpSkillsField {...answers} onChange={setAnswers} /><output data-testid="answers">{JSON.stringify(answers)}</output></>
}

it('reveals allowed job skills under Others and saves selections with the fixed skills', () => {
  render(<Form />)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Others'))
  const input = screen.getByRole('combobox', { name: 'Search or select skills' })
  fireEvent.focus(input)
  expect(screen.getByRole('option', { name: 'Welder' })).toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'Welder' } })
  fireEvent.click(screen.getByRole('option', { name: 'Welder' }))
  expect(JSON.parse(screen.getByTestId('answers').textContent).skills).toEqual(['Computer Literate', 'Others', 'Welder'])
  expect(screen.getByRole('button', { name: 'Remove Welder' })).toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'Unapproved example' } })
  expect(screen.getByText('No matching skills.')).toBeInTheDocument()
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByTestId('answers')).not.toHaveTextContent('Unapproved example')
  fireEvent.click(screen.getByLabelText('Others'))
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(JSON.parse(screen.getByTestId('answers').textContent).skills).toEqual(['Computer Literate'])
})
