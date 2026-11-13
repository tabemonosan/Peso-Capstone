import CompanyProfilePage from './CompanyProfilePage'

export default function CompanyProfileWindow() {
  const jobId = window.location.hash.slice('#company-profile/'.length)
  const token = localStorage.getItem('peso-token')
  return <main className="mx-auto max-w-5xl p-4 sm:p-8">
    {token ? <CompanyProfilePage token={token} jobId={jobId} onBack={() => window.close()} backLabel="Close tab" /> : <section className="portal-card rounded-2xl p-6"><h1 className="text-xl font-semibold">Company profile</h1><p className="mt-3">Please sign in to the portal, then reopen the company profile.</p><a className="mt-4 inline-block underline" href={window.location.pathname}>Open portal</a></section>}
  </main>
}
