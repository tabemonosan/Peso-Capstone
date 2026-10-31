import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import CsmQuestionnaireForm from '../components/CsmQuestionnaireForm'
import ReviewQuestionnaires from '../components/ReviewQuestionnaires'
import AdminCsmFeedbackModal from '../components/AdminCsmFeedbackModal'
import { CSM_TEXT, CSM_QUESTION_KEYS, validateCsmResponse } from '../../shared/csmQuestionnaire.js'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const valid = () => ({ language: 'en', clientType: 'citizen', sex: 'female', date: '2026-01-01', age: 25, cc1: '4', ratings: Object.fromEntries(CSM_QUESTION_KEYS.map((key) => [key, 'agree'])) })

describe('CSM validation', () => {
  it('validates all required answers and safely handles malformed bodies', () => {
    expect(Object.keys(validateCsmResponse(null).fieldErrors)).toContain('ratings.SQD8')
    const result = validateCsmResponse({ ...valid(), age: 121, date: '2026-02-30', ratings: { SQD0: 'invalid' } })
    expect(result.fieldErrors).toHaveProperty('age')
    expect(result.fieldErrors).toHaveProperty('date')
    expect(Object.keys(result.fieldErrors)).toContain('ratings.SQD0')
  })
  it('normalizes skipped charter answers, permits blank optional fields, and strips extra fields', () => {
    const { values, fieldErrors } = validateCsmResponse({ ...valid(), cc2: '1', cc3: '1', submitterRole: 'Admin' })
    expect(fieldErrors).toEqual({})
    expect(values).toMatchObject({ cc2: '5', cc3: '4', name: '', email: '' })
    expect(values.submitterRole).toBeUndefined()
    expect(validateCsmResponse({ ...valid(), email: 'bad', suggestions: 'a'.repeat(2001) }).fieldErrors).toHaveProperty('email')
  })
  it('retains the distinct source language questions', () => {
    expect(CSM_TEXT.en.questions[6]).toContain('secure')
    expect(CSM_TEXT.tl.questions[6]).toContain('walang palakasan')
  })
})

describe('online CSM form', () => {
  it('offers both online languages alongside the original PDFs', () => {
    render(<ReviewQuestionnaires token="token" />)
    expect(screen.getAllByRole('link', { name: /Open.*PDF/i })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Fill online.*Tagalog/i }))
    expect(screen.getByRole('button', { name: CSM_TEXT.tl.submit })).toBeTruthy()
    expect(screen.getByText(/walang palakasan/)).toBeTruthy()
  })
  it('blocks empty submission, applies charter skipping, preserves failed answers, and retries with the same key', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Please retry' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ reference: 'CSM-12345678', submittedAt: '2026-10-31T01:00:00Z' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<CsmQuestionnaireForm language="en" token="token" onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: CSM_TEXT.en.submit }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Citizen' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))
    fireEvent.change(screen.getByLabelText(/Age/), { target: { value: '25' } })
    fireEvent.click(within(screen.getByRole('group', { name: CSM_TEXT.en.cc1 })).getAllByRole('radio')[3])
    expect(within(screen.getByRole('group', { name: CSM_TEXT.en.cc2 })).getAllByRole('radio').every((radio) => radio.disabled || radio.closest('fieldset').disabled)).toBe(true)
    for (const key of CSM_QUESTION_KEYS) fireEvent.click(within(screen.getByRole('group', { name: new RegExp(`^${key}\\.`) })).getByRole('radio', { name: 'Agree', exact: true }))
    fireEvent.click(screen.getByRole('button', { name: CSM_TEXT.en.submit }))
    await screen.findByText('Please retry')
    expect(screen.getByLabelText(/Age/).value).toBe('25')
    fireEvent.click(screen.getByRole('button', { name: CSM_TEXT.en.submit }))
    await screen.findByText('CSM-12345678')
    expect(screen.queryByRole('button', { name: CSM_TEXT.en.submit })).toBeNull()
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetchMock.mock.calls[1][1].headers['Idempotency-Key'])
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ cc2: '5', cc3: '4' })
  })
  it('shows submitted answers to administrators using the selected language', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ _id: '123456781234567812345678', submitterRole: 'Employer', language: 'en', createdAt: '2026-10-31', answers: validateCsmResponse(valid()).values }], total: 1 }) }))
    render(<AdminCsmFeedbackModal token="admin-token" onClose={vi.fn()} />)
    await screen.findByText('Employer · English')
    expect(screen.getByText(/SQD6\. I am confident/)).toBeTruthy()
    expect(screen.getByText('CSM-12345678', { exact: false })).toBeTruthy()
  })
})
