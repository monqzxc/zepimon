type Storage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

// Keep each Keychain entry below 2 KB, including non-ASCII profile metadata.
// Commit the manifest last so interrupted token refreshes retain the old session.
export function chunkedSessionStorage(storage: Storage): Storage {
  async function parts(key: string): Promise<string[]> {
    const raw = await storage.getItem(key)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    const manifest = value as { revision?: unknown; count?: unknown }
    if (!manifest || typeof manifest.revision !== 'string' || !/^[a-z0-9]+$/.test(manifest.revision) ||
      typeof manifest.count !== 'number' || !Number.isInteger(manifest.count) || manifest.count < 0 || manifest.count > 512) {
      throw new Error('Saved sign-in could not be read. Please sign in again.')
    }
    return Array.from({ length: manifest.count }, (_, index) => `${key}.${manifest.revision}.${index}`)
  }
  async function clean(keys: string[]) {
    await Promise.all(keys.map(key => storage.removeItem(key).catch(() => {})))
  }
  return {
    async getItem(key) {
      const keys = await parts(key)
      if (!keys.length) return null
      const values = await Promise.all(keys.map(part => storage.getItem(part)))
      if (values.some(value => value === null)) throw new Error('Saved sign-in is incomplete. Please sign in again.')
      return values.join('')
    },
    async setItem(key, value) {
      if (value.length > 200000) throw new Error('Sign-in data is too large to save securely.')
      const old = await parts(key)
      const revision = Date.now().toString(36) + Math.random().toString(36).slice(2)
      const keys: string[] = []
      try {
        const characters = Array.from(value)
        for (let start = 0; start < characters.length; start += 400) {
          const part = `${key}.${revision}.${keys.length}`
          keys.push(part)
          await storage.setItem(part, characters.slice(start, start + 400).join(''))
        }
        await storage.setItem(key, JSON.stringify({ revision, count: keys.length }))
      } catch (error) { await clean(keys); throw error }
      await clean(old)
    },
    async removeItem(key) {
      const keys = await parts(key)
      await storage.removeItem(key)
      await clean(keys)
    }
  }
}
