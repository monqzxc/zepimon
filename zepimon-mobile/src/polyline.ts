// Routes as Google's encoded polyline format at 5 decimals (about a metre): a long route takes a few kilobytes. Kept
// apart from src/phone-adventure.ts so the map's web view (src/LeafletMap.tsx) can decode routes without the catalog.

export function encodePath(points: [number, number][]): string {
  let text = '', lastLat = 0, lastLng = 0
  const write = (value: number) => {
    let bits = value < 0 ? ~(value << 1) : value << 1
    while (bits >= 0x20) { text += String.fromCharCode((0x20 | (bits & 0x1f)) + 63); bits >>= 5 }
    text += String.fromCharCode(bits + 63)
  }
  for (const [lat, lng] of points) {
    const y = Math.round(lat * 1e5), x = Math.round(lng * 1e5)
    write(y - lastLat); write(x - lastLng)
    lastLat = y; lastLng = x
  }
  return text
}

export function decodePath(text: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0, lat = 0, lng = 0
  const read = () => {
    let result = 0, shift = 0, byte: number
    do {
      if (index >= text.length) throw new Error('Invalid route')
      byte = text.charCodeAt(index++) - 63
      if (byte < 0 || byte > 63) throw new Error('Invalid route')
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && shift < 35)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < text.length) {
    lat += read(); lng += read()
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}
