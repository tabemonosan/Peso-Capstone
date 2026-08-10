;(async () => {
  try {
    const base = 'http://localhost:4000'
    const email = `testuser_${Date.now()}@example.com`
    const password = 'TestPass123!'
    const profile = { name: 'E2E Tester', location: 'Testville', skills: 'testing', traits: 'reliable', summary: 'Automated test account' }

    console.log('Signing up:', email)
    let res = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ...profile }),
    })
    let data = await res.json()
    if (!res.ok) throw new Error('Signup failed: ' + JSON.stringify(data))
    console.log('Signup response ok')

    console.log('Logging in')
    res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    data = await res.json()
    if (!res.ok) throw new Error('Login failed: ' + JSON.stringify(data))
    console.log('Login response ok')

    console.log('Fetching profile')
    res = await fetch(`${base}/api/profile?email=${encodeURIComponent(email)}`)
    data = await res.json()
    if (!res.ok) throw new Error('Fetch profile failed: ' + JSON.stringify(data))
    console.log('Profile fetched:', data.profile)

    console.log('Updating profile')
    const updated = { ...data.profile, location: 'UpdatedTown' }
    res = await fetch(`${base}/api/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, profile: updated }),
    })
    data = await res.json()
    if (!res.ok) throw new Error('Update profile failed: ' + JSON.stringify(data))
    console.log('Profile updated:', data.profile)

    console.log('Verifying update')
    res = await fetch(`${base}/api/profile?email=${encodeURIComponent(email)}`)
    data = await res.json()
    if (!res.ok) throw new Error('Fetch after update failed: ' + JSON.stringify(data))
    console.log('Final profile:', data.profile)

    if (data.profile.location !== 'UpdatedTown') throw new Error('Profile update not persisted')

    console.log('E2E test passed')
    process.exit(0)
  } catch (err) {
    console.error('E2E test failed:', err.message)
    process.exit(2)
  }
})()
