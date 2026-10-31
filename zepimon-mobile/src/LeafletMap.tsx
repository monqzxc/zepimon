'use dom'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { IS_DOM } from 'expo/dom'
import type { DOMProps } from 'expo/dom'
import * as L from 'leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import './LeafletMap.css'
import { decodePath } from './polyline'

// The map of src/RouteMap.tsx, as an Expo DOM component: on phones it runs in its own web view, and on the web it
// renders in the page. Leaflet draws the route over OpenFreeMap's street map, which MapLibre renders from vector tiles:
// free, with no key or request limit. (OpenStreetMap's own tile servers refuse requests without a Referer, which a
// web view's bundled page cannot send.) Without WebGL or a connection, the route still draws on a plain background.
// quiet maps use the same provider's muted, light Positron style, so a route on a card stands out from its streets.
const STYLES = { liberty: 'https://tiles.openfreemap.org/styles/liberty', positron: 'https://tiles.openfreemap.org/styles/positron' }
const ROUTE = '#1374B8'
const START = '#16B5A0'
const FINISH = '#1F2A36'
const FOLLOW_ZOOM = 16

type Props = {
  path: string,                           // the route, encoded (src/polyline.ts)
  here: [number, number, number] | null,  // live: the latest fix, as latitude, longitude and accuracy in metres
  stale: boolean,                         // live: no fix for a while, so the position dot greys out
  live: boolean,
  label: string,
  top?: number,                           // room kept clear above and below the route when it is fitted, for views laid over the map
  bottom?: number,
  zoomAt?: L.ControlPosition,             // the zoom buttons' corner, clear of buttons laid over the map
  quiet?: boolean,                        // muted streets
  openLink: (url: string) => Promise<void>,
  dom?: DOMProps
}
type Layers = { casing: L.Polyline, line: L.Polyline, start: L.CircleMarker, finish: L.CircleMarker, accuracy: L.Circle, here: L.Marker }

const webgl = () => {
  try { const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl2') || canvas.getContext('webgl')) } catch { return false }
}

function place(map: L.Map, layer: L.CircleMarker | L.Circle | L.Marker, at: L.LatLngTuple | null | undefined) {
  if (!at) { layer.remove(); return }
  layer.setLatLng(at)
  if (!map.hasLayer(layer)) layer.addTo(map)
}

// Fits the route with room for views laid over the map; fitting is set until the map settles.
function fitRoute(map: L.Map, route: L.LatLngBounds, top: number, bottom: number, animate: boolean, fitting: { current: boolean }) {
  fitting.current = true
  map.once('moveend', () => { fitting.current = false })
  map.fitBounds(route, { paddingTopLeft: [28, 28 + top], paddingBottomRight: [28, 28 + bottom], maxZoom: 17, animate })
}

export default function LeafletMap({ path, here, stale, live, label, top = 0, bottom = 0, zoomAt = 'topleft', quiet = false, openLink }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const view = useRef<{ map: L.Map, layers: Layers } | null>(null)
  // A live map keeps the latest fix in view until it is dragged; Follow turns that back on. A finished route offers
  // Recenter instead once it is dragged or zoomed away from where it was fitted.
  const follow = useRef(true)
  const [following, setFollowing] = useState(true)
  const position = useRef<L.LatLngTuple | null>(null)
  // Whether the map has been placed on the route yet: the first fix zooms in, later ones only pan.
  const framed = useRef(false)
  const route = useRef<L.LatLngBounds | null>(null)
  // Set while the map moves itself, so only the person's own zooms count as moving away.
  const fitting = useRef(false)

  useEffect(() => {
    const container = box.current
    if (!container) return
    const map = L.map(container, { center: [20, 0], zoom: 2, maxZoom: 19, zoomControl: false })
    L.control.zoom({ position: zoomAt }).addTo(map)
    map.attributionControl.setPrefix(false)
    if (webgl()) {
      try {
        const streets = maplibreGL({ style: quiet ? STYLES.positron : STYLES.liberty }).addTo(map).getMaplibreMap()
        // The style names a few icons its sprite sheet lacks: blank ones keep the console quiet.
        streets.on('styleimagemissing', ({ id }) => { if (!streets.hasImage(id)) streets.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) }) })
      } catch { /* the route still draws on the plain background */ }
    }
    // The accuracy circle sits under the route.
    map.createPane('zepimon-accuracy').style.zIndex = '350'
    const line = (color: string, weight: number) => L.polyline([], { color, weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false })
    const dot = (color: string) => L.circleMarker([0, 0], { radius: 7, color: '#FFFFFF', weight: 3, fillColor: color, fillOpacity: 1, interactive: false })
    const layers: Layers = {
      casing: line('#FFFFFF', 9).addTo(map), line: line(ROUTE, 5).addTo(map), start: dot(START), finish: dot(FINISH),
      accuracy: L.circle([0, 0], { radius: 1, stroke: false, fillColor: ROUTE, fillOpacity: 0.12, interactive: false, pane: 'zepimon-accuracy' }),
      here: L.marker([0, 0], { icon: L.divIcon({ className: 'zepimon-here', iconSize: [26, 26] }), interactive: false, keyboard: false })
    }
    map.on('dragstart', () => { follow.current = false; setFollowing(false) })
    map.on('zoomstart', () => { if (route.current && !fitting.current) setFollowing(false) })
    const resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(container)
    view.current = { map, layers }
    return () => {
      resize.disconnect()
      map.remove()
      view.current = null
      framed.current = false
    }
  }, [zoomAt, quiet])

  // The bottom corners' controls (the map's credits) sit above whatever covers the map's lower edge.
  useEffect(() => {
    box.current?.querySelectorAll<HTMLElement>('.leaflet-bottom').forEach(corner => { corner.style.bottom = `${bottom}px` })
  }, [bottom, zoomAt, quiet])

  useEffect(() => {
    if (!view.current) return
    const { map, layers } = view.current
    let points: L.LatLngTuple[] = []
    try { points = decodePath(path) } catch { /* a damaged route draws nothing */ }
    layers.casing.setLatLngs(points)
    layers.line.setLatLngs(points)
    const at: L.LatLngTuple | null = live ? (here ? [here[0], here[1]] : points.at(-1) ?? null) : null
    place(map, layers.start, points[0])
    place(map, layers.finish, !live && points.length > 1 ? points.at(-1) : null)
    place(map, layers.accuracy, here && here[2] > 0 ? at : null)
    if (here) layers.accuracy.setRadius(here[2])
    place(map, layers.here, at)
    layers.here.getElement()?.classList.toggle('stale', stale)
    position.current = at
    if (live) {
      if (at && follow.current) {
        map.setView(at, framed.current ? map.getZoom() : FOLLOW_ZOOM, { animate: framed.current })
        framed.current = true
      }
    } else if (points.length && !framed.current) {
      route.current = L.latLngBounds(points)
      fitRoute(map, route.current, top, bottom, false, fitting)
      framed.current = true
    }
  }, [path, here, stale, live, top, bottom])

  function recenter() {
    follow.current = true
    setFollowing(true)
    if (!live) { if (view.current && route.current) fitRoute(view.current.map, route.current, top, bottom, true, fitting) }
    else if (view.current && position.current) view.current.map.setView(position.current, Math.max(view.current.map.getZoom(), 15))
  }

  // In the phone's web view a link would replace the map, so the credits open in the browser instead.
  function openOutside(event: MouseEvent) {
    const link = (event.target as Element).closest?.('a[href^="http"]') as HTMLAnchorElement | null
    if (!IS_DOM || !link) return
    event.preventDefault()
    void openLink(link.href)
  }

  return <div className="zepimon-map-frame" onClickCapture={openOutside}>
    <div ref={box} className="zepimon-map" role="region" aria-label={label} />
    {!following && <button type="button" className="zepimon-follow" style={{ bottom: 28 + bottom }} onClick={recenter}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2 4.5 20.3l.7.7L12 18l6.8 3 .7-.7z" /></svg>
      {live ? 'Follow me' : 'Recenter'}
    </button>}
  </div>
}
