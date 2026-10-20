import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient, processLock } from '@supabase/supabase-js'
import { cloudConfig } from './generated/cloud-config'
import { chunkedSessionStorage } from './session-storage'

const secureStorage = chunkedSessionStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key)
})

export const cloudClient = cloudConfig.url && cloudConfig.key ? createClient(cloudConfig.url, cloudConfig.key, {
  auth: { ...(Platform.OS !== 'web' ? { storage: secureStorage } : {}),
    autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
  global: { fetch: async (input, init) => {
    const controller = new AbortController()
    const abort = () => controller.abort()
    const timer = setTimeout(abort, 20000)
    init?.signal?.addEventListener('abort', abort, { once: true })
    if (init?.signal?.aborted) abort()
    try { return await fetch(input, { ...init, signal: controller.signal }) }
    finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort) }
  } }
}) : null
