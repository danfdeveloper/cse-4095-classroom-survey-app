import { useEffect } from 'react'

const APP = 'Classroom Survey'

/** Sets the browser tab title ("Dashboard · Classroom Survey"); WCAG 2.4.2. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : APP
  }, [title])
}
