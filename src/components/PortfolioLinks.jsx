import { validatePortfolioLinks } from '../../shared/portfolioLinks.js'
import PortfolioLinkIcon from './PortfolioLinkIcon'
import './PortfolioLinks.css'

export default function PortfolioLinks({ links = [] }) {
  const safe = links.flatMap(link => validatePortfolioLinks([link]).links || [])
  if (!safe.length) return null
  return <section aria-label="Portfolio links" className="candidate-profile-section mt-4">
    <h3 className="text-sm font-semibold">Portfolio links</h3>
    <ul className="portfolio-links-list">{safe.map((link, index) => <li key={index}>
      <a href={link.url} target="_blank" rel="noopener noreferrer" className="portfolio-link"><PortfolioLinkIcon url={link.url} /><span className="portfolio-link-label">{link.label}</span></a>
    </li>)}</ul>
  </section>
}
