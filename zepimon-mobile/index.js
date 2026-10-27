// The app entry. The adventure tracker defines its background location task here, before Expo Router: Android can
// start the app in the background just to deliver locations, and then no screen (and no layout) ever loads.
import './src/tracker'

// Expo Router's entry goes last.
import 'expo-router/entry'
