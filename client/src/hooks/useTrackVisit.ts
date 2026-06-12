import { useEffect } from 'react'
import { visitsApi, type VisitPageType } from '../api/client'

/**
 * Logs a visit to a public page including how the visitor arrived
 * (document.referrer + UTM params). Fires once per page_ref per mount.
 */
export function useTrackVisit(pageType: VisitPageType, pageRef: string | undefined) {
  useEffect(() => {
    if (!pageRef) return

    const params = new URLSearchParams(window.location.search)
    const referrer = document.referrer || undefined
    // Skip internal navigation without UTM params — tells us nothing about origin,
    // and would overwrite nothing thanks to COALESCE server-side anyway
    const isInternal = referrer ? referrer.startsWith(window.location.origin) : false

    visitsApi.track({
      page_type: pageType,
      page_ref: pageRef,
      referrer: isInternal ? undefined : referrer,
      utm_source: params.get('utm_source') || params.get('ref') || undefined,
      utm_medium: params.get('utm_medium') || undefined,
      utm_campaign: params.get('utm_campaign') || undefined,
    }).catch(() => { /* tracking must never break the page */ })
  }, [pageType, pageRef])
}
