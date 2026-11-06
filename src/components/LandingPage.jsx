import { useEffect, useRef, useState } from 'react'
import './LandingPage.css'

const seekerSteps = [
  ['Make it yours.', 'Create your account and complete your NSRP. Add your skills, resume, and portfolio to tell your story.'],
  ['Find your fit.', 'Explore job opportunities that match your skills and see what employers are looking for.'],
  ['Take the next step.', 'Apply, follow your progress, and respond to interview invitations in one place.'],
]
const employerSteps = [
  ['Introduce your business.', 'Register your establishment and submit your employer details for PESO verification.'],
  ['Share your opportunity.', 'Create a job posting with the skills, experience, and language proficiency your role needs.'],
  ['Meet your next teammate.', 'Review referred applicants, send interview invitations, and record your hiring outcome.'],
]

function Arrow({ diagonal = false }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h15m-6-6 6 6-6 6'} /></svg>
}

export default function LandingPage({ children, onApplicantSignup, onEmployerSignup, onApplicantForm, onEmployerForm }) {
  const root = useRef(null)
  const menuToggle = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerHidden, setHeaderHidden] = useState(false)
  const [audience, setAudience] = useState('seeker')
  const [activeStep, setActiveStep] = useState(0)
  const steps = audience === 'seeker' ? seekerSteps : employerSteps
  useEffect(() => {
    let lastScroll = Math.max(0, window.scrollY)
    const updateHeader = () => {
      const currentScroll = Math.max(0, window.scrollY)
      if (currentScroll <= 100) {
        setHeaderHidden(false)
        lastScroll = currentScroll
      } else if (Math.abs(currentScroll - lastScroll) >= 8) {
        setHeaderHidden(currentScroll > lastScroll)
        lastScroll = currentScroll
      }
    }
    window.addEventListener('scroll', updateHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateHeader)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const dismissMenu = event => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuToggle.current?.focus()
      }
    }
    document.addEventListener('keydown', dismissMenu)
    return () => document.removeEventListener('keydown', dismissMenu)
  }, [menuOpen])
  useEffect(() => {
    if (!globalThis.IntersectionObserver || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const page = root.current
    page.classList.add('landing-has-motion')
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); observer.unobserve(entry.target) }
    }), { threshold: 0.12 })
    page.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    return () => { observer.disconnect(); page.classList.remove('landing-has-motion') }
  }, [])
  const closeMenu = () => setMenuOpen(false)
  const focusSignIn = event => {
    event.preventDefault()
    closeMenu()
    root.current?.querySelector('#sign-in')?.scrollIntoView?.({ block: 'start' })
    root.current?.querySelector('#email')?.focus({ preventScroll: true })
  }
  return <div className="peso-landing" ref={root}>
    <a href="#landing-content" className="landing-skip">Skip to content</a>
    <header className={`landing-header${headerHidden && !menuOpen ? ' is-hidden' : ''}`}>
      <a href="#" className="landing-brand" aria-label="PESO Albay home"><img src="/peso-logo.png" width="48" height="48" alt="" /><span>PESO<span className="landing-brand-caption">ALBAY · EMPLOYMENT PORTAL</span></span></a>
      <button ref={menuToggle} className="landing-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? 'Close menu' : 'Menu'}<span aria-hidden="true">{menuOpen ? '−' : '+'}</span></button>
      <nav id="landing-navigation" aria-label="Main navigation" className={menuOpen ? 'is-open' : ''}>
        <a href="#how-it-works" onClick={closeMenu}>How it works</a><a href="#for-employers" onClick={closeMenu}>For employers</a><a href="#resources" onClick={closeMenu}>NSRP forms</a>
        <a href="#sign-in" className="landing-nav-signin" onClick={focusSignIn}>Sign in <Arrow /></a>
        <button type="button" className="landing-button landing-button-primary" onClick={() => { closeMenu(); onApplicantSignup() }}>Get started <Arrow /></button>
      </nav>
    </header>
    <main id="landing-content">
      <section className="landing-hero landing-container" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><span className="landing-status-dot" />LOCAL TALENT. SHARED OPPORTUNITY.</p>
          <h1 id="landing-title">Good work.<br />Closer to <em>home.</em></h1>
          <p className="landing-hero-description">Your skills have a place here. Connect with employers, discover opportunities, and take your next step with PESO Albay.</p>
          <div className="landing-hero-actions"><button type="button" className="landing-button landing-button-primary" onClick={onApplicantSignup}>Find my next opportunity <Arrow /></button><button type="button" className="landing-button landing-button-secondary" onClick={onEmployerSignup}>I’m hiring <Arrow diagonal /></button></div>
          <p className="landing-hero-note"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 12 4 4L19 6" /></svg>For job seekers and employers across Albay.</p>
        </div>
        <figure className="landing-hero-visual">
          <div className="landing-photo-frame"><img src="/images/gus.avif" alt="A man wearing glasses and a blazer holding up a small object in a classroom" width="640" height="639" fetchPriority="high" /></div>

          <div className="landing-photo-note"><span className="landing-note-icon" aria-hidden="true">↗</span><span>A little closer to<br /><strong>your next chapter.</strong></span></div>
          <figcaption>Possibility starts with people.</figcaption>
        </figure>
      </section>
      <div className="landing-promises landing-container" aria-label="Your PESO journey">
        {['Your experience, brought together.', 'Opportunities that fit your skills.', 'A next step you can follow.'].map((text, index) => <div key={text}><span>0{index + 1}</span><p>{text}</p></div>)}
      </div>
      <section id="how-it-works" className="landing-how" aria-labelledby="landing-how-title">
        <div className="landing-container landing-how-grid" data-reveal>
          <div className="landing-how-intro"><p className="landing-eyebrow">A CLEARER WAY FORWARD</p><h2 id="landing-how-title">From first step<br />to fresh start.</h2><p>A few purposeful steps. One place to keep everything moving.</p><div className="landing-audience-switch" role="group" aria-label="Choose your journey"><button type="button" aria-pressed={audience === 'seeker'} onClick={() => { setAudience('seeker'); setActiveStep(0) }}>I’m looking for work</button><button type="button" aria-pressed={audience === 'employer'} onClick={() => { setAudience('employer'); setActiveStep(0) }}>I’m looking to hire</button></div><button type="button" className="landing-journey-action" onClick={audience === 'seeker' ? onApplicantSignup : onEmployerSignup}>{audience === 'seeker' ? 'Create my applicant profile' : 'Register my business'}<Arrow /></button></div>
          <div className="landing-steps">{steps.map(([title, description], index) => <div className={`landing-step ${activeStep === index ? 'is-active' : ''}`} key={title}><button type="button" aria-expanded={activeStep === index} aria-controls={`landing-step-${index}`} onClick={() => setActiveStep(index)}><span className="landing-step-number">0{index + 1}</span><span>{title}</span><span className="landing-step-expand" aria-hidden="true">{activeStep === index ? '−' : '+'}</span></button><div id={`landing-step-${index}`} hidden={activeStep !== index}><p>{description}</p></div></div>)}</div>
        </div>
      </section>
      <section id="for-employers" className="landing-employers landing-container" aria-labelledby="landing-employers-title" data-reveal>
        <div className="landing-profile-preview" aria-label="Illustration of the qualifications employers can review">
          <p className="landing-preview-label"><span className="landing-status-dot" /> THE PERSON BEHIND THE PROFILE</p>
          <div className="landing-preview-person"><span className="landing-preview-avatar" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="24" cy="16" r="8" /><path d="M8 43v-5c0-8 7-12 16-12s16 4 16 12v5" /></svg></span><div><strong>More than a name.</strong><span>A fuller picture of every applicant.</span></div></div>
          {[['01', 'Skills & experience', 'What they know. What they’ve done.'], ['02', 'Language proficiency', 'The ways they communicate.'], ['03', 'Resume & portfolio', 'Their work, in their own words.']].map(([number, title, text]) => <div className="landing-preview-row" key={number}><span>{number}</span><div><strong>{title}</strong><p>{text}</p></div><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 12 4 4L19 6" /></svg></div>)}
          <p className="landing-preview-footnote">An illustration of the applicant profile experience.</p>
        </div>
        <div className="landing-employer-copy"><p className="landing-eyebrow">FOR LOCAL EMPLOYERS</p><h2 id="landing-employers-title">Local talent.<br /><em>Real possibility.</em></h2><p>The right person brings more than a skill set. Share your opening, review applicants’ qualifications, and move from introductions to interviews through PESO.</p><button type="button" className="landing-button landing-button-secondary" onClick={onEmployerSignup}>Bring your next teammate on board <Arrow diagonal /></button><p className="landing-small-note">Employer registration and verification come first.</p></div>
      </section>
      <section id="resources" className="landing-resources" aria-labelledby="landing-resources-title"><div className="landing-container" data-reveal>
        <div className="landing-section-heading"><div><p className="landing-eyebrow">A LITTLE PREPARATION GOES A LONG WAY</p><h2 id="landing-resources-title">Fill out an NSRP form online</h2></div><p>Prepare and download your completed PDF.<br />No account needed.</p></div>
        <div className="landing-resource-grid"><button type="button" className="landing-resource-card" aria-label="Applicant · Form 1" onClick={onApplicantForm}><span className="landing-resource-top">FOR JOB SEEKERS <Arrow diagonal /></span><span className="landing-resource-number">01</span><strong>Tell your story.</strong><span>Complete your NSRP Jobseeker Registration Form and download your PDF.</span><span className="landing-resource-link">Applicant · Form 1 <Arrow /></span></button><button type="button" className="landing-resource-card" aria-label="Employer · Form 2" onClick={onEmployerForm}><span className="landing-resource-top">FOR EMPLOYERS <Arrow diagonal /></span><span className="landing-resource-number">02</span><strong>Introduce your business.</strong><span>Prepare your NSRP Employer Registration Form before taking the next step.</span><span className="landing-resource-link">Employer · Form 2 <Arrow /></span></button></div>
      </div></section>
      <section id="questions" className="landing-faq landing-container" aria-labelledby="landing-faq-title" data-reveal><div><p className="landing-eyebrow">GOOD TO KNOW</p><h2 id="landing-faq-title">Before you<br />take the leap.</h2></div><div className="landing-faq-list">
        <details><summary>Do I need an account to prepare an NSRP form?<span aria-hidden="true">+</span></summary><p>You can complete and download an NSRP form without an account. Downloading a form does not create an account or submit a registration. Your answers are cleared when you leave or refresh the form.</p></details>
        <details><summary>Can I include my resume and portfolio?<span aria-hidden="true">+</span></summary><p>Yes. Applicants can add an optional resume during registration or upload it later. Portfolio links can also be added from the Profile menu.</p></details>
        <details><summary>What happens after I apply?<span aria-hidden="true">+</span></summary><p>Follow the application in your account. When an employer sends an interview invitation, you can review the details and respond. Your application timeline keeps the next steps together.</p></details>
        <details><summary>When can employers start posting jobs?<span aria-hidden="true">+</span></summary><p>Register your business and submit your NSRP Form 2 for PESO review. Once your employer account is approved, you can post vacancies and manage referred applicants.</p></details>
      </div></section>
      <section id="sign-in" className="landing-signin landing-container" aria-label="Sign in to PESO"><div className="landing-signin-copy"><p className="landing-eyebrow">ALREADY PART OF THE COMMUNITY?</p><h2>Pick up where<br /><em>you left off.</em></h2><p>Your profile, applications, and next steps are waiting in your account.</p><a href="#landing-title" className="landing-back-top">Back to the beginning <span aria-hidden="true">↑</span></a></div>{children}</section>
      <section className="landing-final-cta landing-container" aria-labelledby="landing-final-title" data-reveal><div><p className="landing-eyebrow">YOUR NEXT CHAPTER</p><h2 id="landing-final-title">There’s a next step<br />with your name on it.</h2></div><button type="button" className="landing-button" onClick={onApplicantSignup}>Start your profile <Arrow /></button></section>
    </main>
    <footer className="landing-footer"><div className="landing-container"><div className="landing-footer-top"><a href="#" className="landing-brand"><img src="/peso-logo.png" width="44" height="44" alt="" /><span>PESO<span className="landing-brand-caption">PUBLIC EMPLOYMENT SERVICE OFFICE</span></span></a><p>Local talent.<br />Shared opportunity.</p><nav aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="#resources">NSRP forms</a><a href="#questions">Questions</a><a href="#sign-in" onClick={focusSignIn}>Access your account</a></nav></div><div className="landing-footer-bottom"><span>PESO Employment Portal · Albay, Philippines</span><span>Built around people. Connected by possibility.</span></div></div></footer>
  </div>
}
