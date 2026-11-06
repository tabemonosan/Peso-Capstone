import Modal from './Modal'
import PortfolioLinks from './PortfolioLinks'
import ApplicantResume from './ApplicantResume'
import { formatFullName } from '../../shared/nameFields.js'

function ProfileIcon({ type }) {
  const paths = {
    email: 'M3 5h18v14H3z M3 6l9 7 9-7',
    phone: 'M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5z',
    location: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v3',
  }
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[type]} /></svg>
}

export default function ApplicantProfileModal({ applicant, onClose }) {
  const profile = applicant.profile || {}
  const name = formatFullName(profile) || 'Applicant profile'
  const initials = [profile.firstName, profile.lastName].filter(Boolean).map((part) => part.trim().charAt(0)).join('') || name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('')
  const skills = [...new Set((Array.isArray(profile.skills) ? profile.skills : []).filter((skill) => typeof skill === 'string' && skill.trim()).map((skill) => skill.trim()))]
  const sections = [
    { key: 'education', title: 'Education', fields: ['level', 'school', 'course', 'year'] },
    { key: 'technicalTraining', title: 'Training', fields: ['name', 'provider', 'course', 'year'] },
    { key: 'workExperience', title: 'Work experience', fields: ['company', 'position', 'startDate', 'endDate'] },
  ]
  return <Modal onClose={onClose} labelledBy="candidate-profile-title" maxWidth="max-w-2xl">
    <div className="candidate-profile-cover" style={profile.bannerImage ? { backgroundImage: `url(${profile.bannerImage})` } : undefined}>
      {!profile.bannerImage && <><span className="candidate-profile-orbit orbit-one" /><span className="candidate-profile-orbit orbit-two" /><span className="candidate-profile-cover-label">PESO · Applicant overview</span></>}
      <button type="button" onClick={onClose} className="candidate-profile-close" aria-label="Close applicant profile"><span aria-hidden="true">×</span> Close</button>
    </div>
    <header className="candidate-profile-heading">
      <div className="candidate-profile-avatar">{profile.profileImage ? <img src={profile.profileImage} alt={name} /> : initials.toUpperCase()}</div>
      <div className="candidate-profile-heading-copy"><p className="candidate-profile-eyebrow">Applicant profile</p><h2 id="candidate-profile-title">{name}</h2><p className="candidate-profile-location"><ProfileIcon type="location" />{profile.location || 'Location not provided'}</p></div>
    </header>
    <div className="candidate-profile-contacts">
      {[{ label: 'Email address', type: 'email', value: applicant.email, href: applicant.email ? `mailto:${encodeURIComponent(applicant.email)}` : null }, { label: 'Mobile number', type: 'phone', value: applicant.phone, href: /\d/.test(applicant.phone || '') ? `tel:${applicant.phone.replace(/[^\d+]/g, '')}` : null }].map((contact) => <div className={`candidate-contact contact-${contact.type}`} key={contact.type}>
        <span className="candidate-contact-icon"><ProfileIcon type={contact.type} /></span><div><p>{contact.label}</p>{contact.href ? <a href={contact.href}>{contact.value}</a> : <span>Not provided</span>}</div>
      </div>)}
    </div>
    <section className="candidate-profile-section" aria-label="Applicant skills">
      <div className="candidate-profile-section-heading"><h3>Skills</h3><span>{skills.length} listed</span></div>
      {skills.length ? <ul className="candidate-profile-skills">{skills.map((skill, index) => <li className={`skill-tone-${index % 3}`} key={skill}>{skill}</li>)}</ul> : <p className="candidate-profile-empty">No skills listed yet.</p>}
    </section>
    <PortfolioLinks links={profile.portfolioLinks} />
    <ApplicantResume applicant={applicant} />
    {profile.summary && <section className="candidate-profile-section candidate-profile-summary"><h3>Profile summary</h3><p>{profile.summary}</p></section>}
    {profile.traits && <section className="candidate-profile-section"><h3>Personal strengths</h3><p className="candidate-profile-copy">{Array.isArray(profile.traits) ? profile.traits.join(' · ') : profile.traits}</p></section>}
    {sections.map(({ key, title, fields }) => Array.isArray(profile[key]) && profile[key].length > 0 && <section className="candidate-profile-section" key={key}><h3>{title}</h3><ul className="candidate-profile-records">{profile[key].map((entry, index) => <li key={index}>{fields.map((field) => entry[field]).filter(Boolean).join(' · ')}</li>)}</ul></section>)}
    <div className="candidate-profile-privacy"><ProfileIcon type="lock" /><p>The NSRP form and supporting verification documents are retained by PESO.</p></div>
  </Modal>
}
