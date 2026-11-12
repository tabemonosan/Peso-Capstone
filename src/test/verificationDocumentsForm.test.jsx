import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import VerificationDocumentsForm, { emptyVerificationDocs, validateVerificationDocs } from '../components/VerificationDocumentsForm'

function Form() {
  const [docs, setDocs] = useState(emptyVerificationDocs)
  return <VerificationDocumentsForm docs={docs} setDocs={setDocs} />
}

it('offers the optional ID on demand and clears it when removed', () => {
  render(<Form />)
  expect(screen.queryByRole('combobox', { name: 'Valid ID #2 type' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add ID (optional)' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Valid ID #2 type' }), { target: { value: 'Passport' } })
  fireEvent.click(screen.getByRole('button', { name: 'Remove optional ID' }))
  expect(screen.queryByRole('combobox', { name: 'Valid ID #2 type' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Add ID (optional)' }))
  expect(screen.getByRole('combobox', { name: 'Valid ID #2 type' })).toHaveValue('')
})

it('collects document type and files without reference, authorization, ID number, or expiry fields', () => {
  render(<Form />)
  fireEvent.change(screen.getByLabelText(/Birth certificate copy type/), { target: { value: 'PSA e-Certificate' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Valid ID #1 type' }), { target: { value: 'Passport' } })
  for (const name of [/Reference number/i, /Authorization code/i, /^ID number/i, /Expiry date/i]) {
    expect(screen.queryByLabelText(name)).not.toBeInTheDocument()
  }
})

it('accepts required uploads with no ID type, including an optional second ID', () => {
 const file = new File(['sample'], 'sample.png', { type: 'image/png' })
 const docs = { birthCertificate: file, id1: { type: '', front: file }, id2: { type: '', front: null } }
 expect(validateVerificationDocs(docs)).toBe(true)
 expect(validateVerificationDocs({ ...docs, id2: { type: '', front: file } })).toBe(true)
 expect(validateVerificationDocs({ ...docs, id1: { type: '', front: null } })).toBe(false)
})
