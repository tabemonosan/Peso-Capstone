import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { assessApplicantSuitability, rankJobApplicants, applicantQualifications } from '../../shared/applicantSuitability.js'
import ApplicantSuitability from '../components/ApplicantSuitability'

const now = new Date('2026-11-02T04:00:00Z')
const job = { title: 'Office Clerk', skills: ['Excel', 'Administration'], experience: '1–3 years', requirements: 'Office Clerk experience, Excel certification and English proficiency.' }
const candidate = (nsrp = {}, skills = ['Excel', 'Administration']) => ({ profile: { skills, nsrp } })
const strong = () => candidate({
  technicalTraining: [{ course: 'Excel for Office Clerks', institution: 'Training Center', certificate: 'Excel', fromDate: '2022-01-01', toDate: '2022-04-01' }],
  eligibility: [{ eligibility: 'Excel certification', validUntil: '2027-12-31' }],
  languages: [{ name: 'English', read: true, write: true, speak: true, understand: true }],
  workExperience: [{ position: 'Office Clerk', company: 'Company', fromDate: '2023-01-01', toDate: 'Present' }],
  willingImmediately: 'Yes',
})

describe('job-specific applicant suitability', () => {
  it('puts the strongest applicant first and explains every component', () => {
    const ranked = rankJobApplicants(job, [{ id: 'less', ...candidate() }, { id: 'best', ...strong() }], undefined, { now })
    expect(ranked[0].id).toBe('best')
    expect(ranked[0].suitability.rank).toBe(1)
    expect(ranked[0].suitability.score).toBe(100)
    expect(ranked[0].suitability.components.every((component) => component.points === component.maximum)).toBe(true)
    expect(ranked[1].suitability.score).toBeLessThan(ranked[0].suitability.score)
  })
  it('does not award points for unrelated training, eligibility or work', () => {
    const result = assessApplicantSuitability(job, candidate({ technicalTraining: [{ course: 'Welding' }], eligibility: [{ eligibility: 'Welding certification' }], workExperience: [{ position: 'Welder', fromDate: '2010-01-01', toDate: 'Present' }] }), { now })
    for (const key of ['workExperience', 'technicalTraining', 'eligibility']) expect(result.components.find((component) => component.key === key).points).toBe(0)
  })
  it('does not award language points when the job states no language requirement', () => {
    const result = assessApplicantSuitability({ ...job, requirements: '' }, strong(), { now })
    expect(result.components.find((component) => component.key === 'languages').maximum).toBe(0)
    expect(result.components.find((component) => component.key === 'eligibility').maximum).toBe(0)
  })
  it('does not reward expired eligibility or future training and does not double-count overlapping work', () => {
    const result = assessApplicantSuitability(job, candidate({
      technicalTraining: [{ course: 'Excel', fromDate: '2030-01-01' }],
      eligibility: [{ eligibility: 'Excel certification', validUntil: '2020-01-01' }],
      workExperience: [1, 2].map(() => ({ position: 'Office Clerk', fromDate: '2024-01-01', toDate: '2025-01-01' })),
    }), { now })
    expect(result.components.find((component) => component.key === 'eligibility').points).toBe(0)
    expect(result.components.find((component) => component.key === 'technicalTraining').points).toBe(0)
    expect(result.components.find((component) => component.key === 'workExperience').detail).toContain('1 recorded years')
  })
  it('allows eligibility valid through today and supports NSRP other-language names', () => {
    const result = assessApplicantSuitability({ ...job, requirements: 'Excel certification and Bikol proficiency' }, candidate({
      eligibility: [{ eligibility: 'Excel certification', validUntil: '2026-11-02' }],
      languages: [{ name: 'Others', otherName: 'Bicol', read: true, write: true, speak: true, understand: true }],
    }), { now })
    expect(result.components.find((component) => component.key === 'eligibility').points).toBe(10)
    expect(result.components.find((component) => component.key === 'languages').points).toBe(5)
  })
  it('supports older profile training/work fields and preserves stable ties', () => {
    const record = { profile: { technicalTraining: [{ name: 'Excel', provider: 'Center' }], workExperience: [{ position: 'Office Clerk', startDate: '2022-01-01', endDate: '2024-01-01' }] } }
    expect(applicantQualifications(record).technicalTraining[0]).toMatchObject({ course: 'Excel', institution: 'Center' })
    const tied = rankJobApplicants(job, [{ id: 'first', ...record }, { id: 'second', ...record }], undefined, { now })
    expect(tied.map((entry) => entry.id)).toEqual(['first', 'second'])
  })
  it('does not use demographics or disclose identity numbers and home addresses in ranking evidence', () => {
    const normal = strong()
    const extra = strong()
    Object.assign(extra.profile.nsrp, { sex: 'Different', religion: 'Different', civilStatus: 'Different', disability: 'Different', dob: '2001-01-01', tin: 'PRIVATE-TIN', addressStreet: 'PRIVATE-ADDRESS' })
    extra.profile.nsrp.eligibility[0].license = 'PRIVATE-LICENSE'
    extra.profile.nsrp.workExperience[0].address = 'PRIVATE-WORK-ADDRESS'
    expect(assessApplicantSuitability(job, extra, { now })).toEqual(assessApplicantSuitability(job, normal, { now }))
    expect(JSON.stringify(assessApplicantSuitability(job, extra, { now }))).not.toMatch(/PRIVATE/)
  })
  it('handles missing NSRP data and only shows immediate availability for Yes', () => {
    for (const value of ['No', '', undefined]) {
      const suitability = assessApplicantSuitability(job, candidate({ willingImmediately: value }), { now })
      const view = render(<ApplicantSuitability suitability={{ ...suitability, rank: 1 }} />)
      expect(screen.queryByText('Available immediately')).not.toBeInTheDocument()
      expect(screen.queryByText(/Immediate availability not confirmed/)).not.toBeInTheDocument()
      view.unmount()
    }
    const suitability = assessApplicantSuitability(job, strong(), { now })
    render(<ApplicantSuitability suitability={{ ...suitability, rank: 1 }} />)
    expect(screen.getByText('Available immediately')).toBeInTheDocument()
    expect(screen.getByText('Top match')).toBeInTheDocument()
    expect(screen.getByText('Technical training', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Eligibility', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Language / dialect proficiency', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('Work experience', { selector: 'dt' })).toBeInTheDocument()
  })
})
