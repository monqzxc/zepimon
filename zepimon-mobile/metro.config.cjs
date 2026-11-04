// Expo's config, as without this file, except that file reads take turns. A release bundle reads every image at once
// while it collects the assets (Metro's getAbsoluteAssetInfo, over 9000 sprites since Gen 5-9), and Node on Windows
// stops at about 8192 open files with EMFILE, failing createBundleReleaseJsAndAssets. Reads past LIMIT wait for one
// to finish; Metro looks fs.promises.readFile up on each call, so wrapping it here is enough.
const fs = require('fs')
const { getDefaultConfig } = require('expo/metro-config')

const LIMIT = 256
const readFile = fs.promises.readFile
const waiting = []
let active = 0
fs.promises.readFile = async function (...args) {
  // A finishing read hands its turn straight to the next one waiting, so active never passes LIMIT.
  if (active < LIMIT) active++
  else await new Promise(resolve => waiting.push(resolve))
  try {
    return await readFile.apply(this, args)
  } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}

module.exports = getDefaultConfig(__dirname)
