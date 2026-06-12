import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useSettingsStore } from '../../store/settingsStore'
import type { GeoJsonFeatureCollection } from '../../types'

// ISO-3166-1 alpha-2 → alpha-3 (same table as AtlasPage)
const A2_TO_A3: Record<string, string> = {"AF":"AFG","AL":"ALB","DZ":"DZA","AD":"AND","AO":"AGO","AG":"ATG","AR":"ARG","AM":"ARM","AU":"AUS","AT":"AUT","AZ":"AZE","BS":"BHS","BH":"BHR","BD":"BGD","BB":"BRB","BY":"BLR","BE":"BEL","BZ":"BLZ","BJ":"BEN","BT":"BTN","BO":"BOL","BA":"BIH","BW":"BWA","BR":"BRA","BN":"BRN","BG":"BGR","BF":"BFA","BI":"BDI","CV":"CPV","KH":"KHM","CM":"CMR","CA":"CAN","CF":"CAF","TD":"TCD","CL":"CHL","CN":"CHN","CO":"COL","KM":"COM","CG":"COG","CD":"COD","CR":"CRI","CI":"CIV","HR":"HRV","CU":"CUB","CY":"CYP","CZ":"CZE","DK":"DNK","DJ":"DJI","DM":"DMA","DO":"DOM","EC":"ECU","EG":"EGY","SV":"SLV","GQ":"GNQ","ER":"ERI","EE":"EST","SZ":"SWZ","ET":"ETH","FJ":"FJI","FI":"FIN","FR":"FRA","GA":"GAB","GM":"GMB","GE":"GEO","DE":"DEU","GH":"GHA","GR":"GRC","GD":"GRD","GT":"GTM","GN":"GIN","GW":"GNB","GY":"GUY","HT":"HTI","HN":"HND","HU":"HUN","IS":"ISL","IN":"IND","ID":"IDN","IR":"IRN","IQ":"IRQ","IE":"IRL","IL":"ISR","IT":"ITA","JM":"JAM","JP":"JPN","JO":"JOR","KZ":"KAZ","KE":"KEN","KI":"KIR","KP":"PRK","KR":"KOR","KW":"KWT","KG":"KGZ","LA":"LAO","LV":"LVA","LB":"LBN","LS":"LSO","LR":"LBR","LY":"LBY","LI":"LIE","LT":"LTU","LU":"LUX","MG":"MDG","MW":"MWI","MY":"MYS","MV":"MDV","ML":"MLI","MT":"MLT","MR":"MRT","MU":"MUS","MX":"MEX","MD":"MDA","MN":"MNG","ME":"MNE","MA":"MAR","MZ":"MOZ","MM":"MMR","NA":"NAM","NP":"NPL","NL":"NLD","NZ":"NZL","NI":"NIC","NE":"NER","NG":"NGA","MK":"MKD","NO":"NOR","OM":"OMN","PK":"PAK","PA":"PAN","PG":"PNG","PY":"PRY","PE":"PER","PH":"PHL","PL":"POL","PT":"PRT","QA":"QAT","RO":"ROU","RU":"RUS","RW":"RWA","SA":"SAU","SN":"SEN","RS":"SRB","SL":"SLE","SG":"SGP","SK":"SVK","SI":"SVN","SB":"SLB","SO":"SOM","ZA":"ZAF","SS":"SSD","ES":"ESP","LK":"LKA","SD":"SDN","SR":"SUR","SE":"SWE","CH":"CHE","SY":"SYR","TW":"TWN","TJ":"TJK","TZ":"TZA","TH":"THA","TL":"TLS","TG":"TGO","TT":"TTO","TN":"TUN","TR":"TUR","TM":"TKM","UG":"UGA","UA":"UKR","AE":"ARE","GB":"GBR","US":"USA","UY":"URY","UZ":"UZB","VU":"VUT","VE":"VEN","VN":"VNM","YE":"YEM","ZM":"ZMB","ZW":"ZWE"}

// Cached GeoJSON — shared across all GroupMap instances on the page
let geoCache: GeoJsonFeatureCollection | null = null
let geoFetchPromise: Promise<GeoJsonFeatureCollection> | null = null

function getGeoData(): Promise<GeoJsonFeatureCollection> {
  if (geoCache) return Promise.resolve(geoCache)
  if (geoFetchPromise) return geoFetchPromise
  geoFetchPromise = fetch(
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson'
  )
    .then(r => r.json())
    .then(data => { geoCache = data as GeoJsonFeatureCollection; return geoCache })
  return geoFetchPromise
}

export interface GroupMapCountry {
  code: string   // ISO-3166-1 alpha-2
  place_count: number
}

interface Props {
  countries: GroupMapCountry[]
  height?: string
  accentColor?: string
}

export default function GroupMap({ countries, height = '260px', accentColor }: Props) {
  const { settings } = useSettingsStore()
  const dm = settings.dark_mode
  const dark = dm === true || dm === 'dark' || (dm === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const geoLayerRef = useRef<L.GeoJSON | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Resolve accent color from CSS var when not passed explicitly
  const resolvedAccent = accentColor
    ?? getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    ?? '#6366f1'

  // Init map
  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    const map = L.map(containerRef.current, {
      center: [20, 10],
      zoom: 2,
      minZoom: 1,
      maxZoom: 6,
      zoomControl: false,
      attributionControl: false,
      maxBounds: [[-90, -220], [90, 220]],
      maxBoundsViscosity: 1.0,
      fadeAnimation: false,
      preferCanvas: true,
      scrollWheelZoom: false,
    })

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    const tileUrl = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'

    L.tileLayer(tileUrl, { maxZoom: 6, keepBuffer: 10, preferCanvas: true, crossOrigin: true } as any).addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [dark])

  // Render countries layer
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    getGeoData().then(geoData => {
      if (!mapRef.current) return  // unmounted while fetching

      if (geoLayerRef.current) {
        map.removeLayer(geoLayerRef.current)
        geoLayerRef.current = null
      }

      // Build A3 set + place count map from A2 codes
      const visitedA3 = new Set<string>()
      const placeCountByA3 = new Map<string, number>()
      for (const c of countries) {
        const a3 = A2_TO_A3[c.code.toUpperCase()]
        if (a3) {
          visitedA3.add(a3)
          placeCountByA3.set(a3, c.place_count)
        }
      }

      const fillColor = resolvedAccent || '#6366f1'
      const unvisitedFill = dark ? '#2a2a3a' : '#e2e8f0'
      const unvisitedStroke = dark ? '#3a3a4a' : '#cbd5e1'

      const layer = L.geoJSON(geoData as any, {
        style: (feature) => {
          const a3 = feature?.properties?.ADM0_A3 as string | undefined
          const visited = a3 ? visitedA3.has(a3) : false
          return {
            fillColor: visited ? fillColor : unvisitedFill,
            fillOpacity: visited ? 0.75 : 0.6,
            color: visited ? fillColor : unvisitedStroke,
            weight: 0.5,
            opacity: 0.8,
          }
        },
        onEachFeature: (feature, featureLayer) => {
          const a3 = feature?.properties?.ADM0_A3 as string | undefined
          if (!a3 || !visitedA3.has(a3)) return
          const name = feature?.properties?.NAME as string | undefined
          const count = placeCountByA3.get(a3) ?? 0
          featureLayer.on('mouseover', (e) => {
            if (tooltipRef.current) {
              tooltipRef.current.style.display = 'block'
              tooltipRef.current.style.left = `${e.originalEvent.offsetX + 12}px`
              tooltipRef.current.style.top = `${e.originalEvent.offsetY + 8}px`
              tooltipRef.current.textContent = name ? `${name} (${count} places)` : `${count} places`
            }
            ;(featureLayer as L.Path).setStyle({ fillOpacity: 0.95 })
          })
          featureLayer.on('mousemove', (e) => {
            if (tooltipRef.current) {
              tooltipRef.current.style.left = `${e.originalEvent.offsetX + 12}px`
              tooltipRef.current.style.top = `${e.originalEvent.offsetY + 8}px`
            }
          })
          featureLayer.on('mouseout', () => {
            if (tooltipRef.current) tooltipRef.current.style.display = 'none'
            ;(featureLayer as L.Path).setStyle({ fillOpacity: 0.75 })
          })
        },
      })

      layer.addTo(map)
      geoLayerRef.current = layer
    }).catch(() => { /* network error — map still shows tiles */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, dark, resolvedAccent])

  return (
    <div style={{ position: 'relative', height, width: '100%', borderRadius: '0.5rem', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div
        ref={tooltipRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          fontSize: 11,
          padding: '3px 7px',
          borderRadius: 4,
          zIndex: 999,
          whiteSpace: 'nowrap',
        }}
      />
    </div>
  )
}
