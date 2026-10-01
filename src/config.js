// Central API base URL. In production set VITE_API_URL (e.g. https://your-api.onrender.com).
// Locally it falls back to the dev server on port 4000.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
