import test from 'node:test'
import assert from 'node:assert/strict'
import { chunkedSessionStorage } from '../src/session-storage.ts'

test('large sessions roundtrip securely; interrupted writes retain previous session; signout deletes parts', async () => {
  const values = new Map()
  let fail = false
  const storage = chunkedSessionStorage({
    async getItem(key) { return values.get(key) ?? null },
    async setItem(key, value) {
      if (fail && key.endsWith('.2')) throw new Error('Keychain unavailable')
      assert.ok(Buffer.byteLength(value) < 2000)
      values.set(key, value)
    },
    async removeItem(key) { values.delete(key) }
  })
  const original = JSON.stringify({ access_token: 'a'.repeat(3000), refresh_token: 'r'.repeat(50) })
  await storage.setItem('session', original)
  assert.equal(await storage.getItem('session'), original)
  const savedCount = values.size
  fail = true
  await assert.rejects(storage.setItem('session', 'b'.repeat(4000)), /Keychain unavailable/)
  assert.equal(await storage.getItem('session'), original)
  assert.equal(values.size, savedCount)
  fail = false
  await storage.setItem('session', '🐣'.repeat(1000))
  assert.equal(await storage.getItem('session'), '🐣'.repeat(1000))
  await storage.removeItem('session')
  assert.equal(values.size, 0)
  assert.equal(await storage.getItem('session'), null)
})
