import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SavedRound } from './safari-save'

// Saved Safari Zone rounds on this phone, one per place a round starts (the arcade, or an Adventure Map stop), so
// continuing one never credits another. Writes run one after another, so a quick save followed by a clear can't land
// out of order.
const KEY = 'zepimon-safari-rounds-v1'
let queue: Promise<unknown> = Promise.resolve()

async function readAll(): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// The saved round for `slot` as stored (restoreRound checks it), or null.
export function loadRound(slot: string): Promise<unknown> {
  const read = queue.then(readAll).then(all => all[slot] ?? null)
  queue = read.catch(() => null)
  return read
}

// Saves the round for `slot`, or forgets it with null. Failures are ignored: the round plays on either way.
export function storeRound(slot: string, round: SavedRound | null): Promise<void> {
  const write = queue.then(async () => {
    const all = await readAll()
    if (round) all[slot] = round
    else delete all[slot]
    await AsyncStorage.setItem(KEY, JSON.stringify(all))
  }).catch(() => {})
  queue = write
  return write
}
