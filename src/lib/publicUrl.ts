/**
 * Public student URL for a survey slug. Uses VITE_PUBLIC_SITE_URL when set, so
 * QR codes point at the production domain even if the instructor opened the
 * app from another address; otherwise falls back to the current origin.
 */
export function publicSurveyUrl(slug: string): string {
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/+$/, '')
  return `${base}/s/${slug}`
}

/** The URL without its protocol, for display ("example.com/s/x7kf2q"). */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}
