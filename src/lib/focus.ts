/** Focuses an element by id after React has committed the next render. */
export function focusSoon(id: string) {
  requestAnimationFrame(() => document.getElementById(id)?.focus())
}
