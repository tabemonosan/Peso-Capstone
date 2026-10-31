import '@testing-library/jest-dom'

// A refreshed signup intentionally persists in sessionStorage. Each test must
// start with a fresh browser session; rerenders within a test retain storage.
beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.clear()
  if (typeof sessionStorage !== 'undefined') sessionStorage.clear()
})
