import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import SkillTagPicker from '../components/SkillTagPicker'

afterEach(cleanup)
function Picker({ initial = [] }) {
  const [skills, setSkills] = useState(initial)
  return <SkillTagPicker selected={skills} onChange={setSkills} theme="light" />
}
describe('profile skill coverage', () => {
  it('disables frontend and backend skills while full stack is selected, and re-enables them after removal', () => {
    render(<Picker initial={['Full-Stack Developer']} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: /Frontend Developer.*Covered by Full-Stack Developer/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: /Backend Developer.*Covered by Full-Stack Developer/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'React', exact: true })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Full-Stack Developer' }))
    expect(screen.getByRole('option', { name: 'Frontend Developer', exact: true })).toBeEnabled()
    expect(screen.getByRole('option', { name: 'Backend Developer', exact: true })).toBeEnabled()
  })
  it('replaces narrower selections when a broader skill is added without removing unrelated technologies', () => {
    render(<Picker initial={['Frontend Developer', 'Backend Developer', 'React']} />)
    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Full-Stack Developer', exact: true }))
    expect(screen.queryByRole('button', { name: 'Remove Frontend Developer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Backend Developer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Full-Stack Developer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove React' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Redundant selections were removed')
  })
  it('applies the same explicit hierarchy to office skills', () => {
    render(<Picker initial={['Microsoft Office']} />)
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: /Excel.*Covered by Microsoft Office/ })).toBeDisabled()
    expect(screen.getByRole('option', { name: /Word.*Covered by Microsoft Office/ })).toBeDisabled()
  })
})
