// Expo's preset, as without this file, except that MapLibre's prebuilt bundle (the map's streets, src/LeafletMap.tsx)
// is left untouched: MapLibre builds its map worker from the source text of its own functions, and Babel's helpers
// for classes live outside that text, so a release build's worker would fail. Metro parses ignored files as they are.
// The pattern is a function because Expo also loads this config without a filename, which Babel refuses for a RegExp.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    ignore: [filename => !!filename && /node_modules[\\/]maplibre-gl[\\/]dist[\\/]/.test(filename)]
  }
}
