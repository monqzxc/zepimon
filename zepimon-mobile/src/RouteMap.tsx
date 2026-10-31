import { memo } from 'react'
import { Linking, Text, View } from 'react-native'
import LeafletMap from './LeafletMap'
import type { Fix } from './phone-adventure'
import { colors, fonts, useTheme } from './ui'

// A route on a real street map (src/LeafletMap.tsx). live follows here, the latest GPS fix, with its accuracy, and
// stale greys it out when GPS is lost; otherwise the map fits the route, with a finish dot. path is the route encoded
// (src/polyline.ts), so a long one stays small on its way into the map's web view. Lists draw small routes with
// src/RouteView.tsx instead, which needs no web view. bare drops the rounded frame and mutes the streets, for a map that
// heads a card; top and bottom keep the route and the map's credits clear of views laid over it, and zoomAt moves the
// zoom buttons out of their way. fit hands recentering to a button outside the map: each new value fits the route again. Memoized: the map gets its props again on every render.
const openLink = async (url: string) => { await Linking.openURL(url) }

export const RouteMap = memo(function RouteMap({ path, here = null, stale = false, live = false, height, label, bare = false, top, bottom, zoomAt, fit }: {
  path: string, here?: Fix | null, stale?: boolean, live?: boolean, height: number, label: string, bare?: boolean, top?: number, bottom?: number,
  zoomAt?: 'topleft' | 'topright' | 'bottomleft' | 'bottomright', fit?: number
}) {
  useTheme()
  const waiting = live ? !here && !path : !path
  return <View style={[{ height, overflow: 'hidden', backgroundColor: colors.sunken },
    !bare && { borderRadius: 18, borderWidth: 1, borderColor: colors.line }]}>
    {(live || !!path) && <LeafletMap path={path} here={here ? [here.lat, here.lng, here.accuracy ?? 0] : null} stale={stale} live={live}
      label={label} top={top} bottom={bottom} zoomAt={zoomAt} quiet={bare} fit={fit} openLink={openLink} dom={{ style: { flex: 1 }, scrollEnabled: false, bounces: false }} />}
    {waiting && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center',
      justifyContent: 'center', backgroundColor: colors.sunken, pointerEvents: 'none' }}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.muted }}>{live ? 'Waiting for GPS…' : 'No route recorded'}</Text>
    </View>}
  </View>
})
