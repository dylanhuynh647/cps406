/**
 * Frontend sanitization utilities for XSS prevention
 * Note: Backend sanitization is authoritative, this is for defense in depth
 */

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Sanitize text for display (React already does this, but this is extra safety)
 */
export function sanitizeForDisplay(text: string | null | undefined): string {
  if (!text) return ''
  // React automatically escapes content, but we'll do it explicitly for safety
  return escapeHtml(text)
}
