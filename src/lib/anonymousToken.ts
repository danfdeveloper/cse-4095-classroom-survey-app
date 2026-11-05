/**
 * Anonymous browser token for duplicate-submission protection (Phase 8).
 * Stored in localStorage so it survives reloads. This stops accidental double
 * submissions; it is not a security boundary (clearing site data resets it).
 */
const TOKEN_KEY = 'classroom-survey:token'
const submittedKey = (surveyId: string) => `classroom-survey:submitted:${surveyId}`

// Fallback when storage is unavailable (e.g. some private-browsing modes):
// the token lasts for this page load only.
let memoryToken: string | null = null

function randomToken(): string {
  // getRandomValues works on plain-http LAN addresses, unlike crypto.randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getAnonymousToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      token = randomToken()
      localStorage.setItem(TOKEN_KEY, token)
    }
    return token
  } catch {
    memoryToken ??= randomToken()
    return memoryToken
  }
}

export function hasSubmitted(surveyId: string): boolean {
  try {
    return localStorage.getItem(submittedKey(surveyId)) !== null
  } catch {
    return false
  }
}

export function markSubmitted(surveyId: string): void {
  try {
    localStorage.setItem(submittedKey(surveyId), new Date().toISOString())
  } catch {
    // Storage unavailable; the database uniqueness check still applies.
  }
}
