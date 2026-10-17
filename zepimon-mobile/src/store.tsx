import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { parseJournal } from './journal'
import type { Journal } from './journal'
import { emptyProgress, importProgress, restoreProgress } from './progress'
import type { Progress } from './progress'
import { restoreScores, saveBestScore } from './games/scores'
import type { ArcadeGame, ArcadeScores } from './games/scores'

const KEY = 'zepimon-mobile-v1'
type Saved = { journal: Journal | null, buddy: string | null, bestMoves: Record<string, number>, progress: Progress, arcadeScores: ArcadeScores }
type Store = Saved & { ready: boolean, error: string, importText: (text: string) => Promise<void>, chooseBuddy: (key: string) => Promise<void>, recordWin: (pairs: number, moves: number) => Promise<void>, recordArcadeScore: (game: ArcadeGame, score: number) => Promise<void> }
const empty: Saved = { journal: null, buddy: null, bestMoves: {}, progress: emptyProgress(), arcadeScores: {} }
const Context = createContext<Store | null>(null)

export function JournalProvider({ children }: React.PropsWithChildren) {
  const [saved, setSaved] = useState<Saved>(empty)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const latest = useRef(saved)
  const writes = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => {
    let mounted = true
    AsyncStorage.getItem(KEY).then(async raw => {
      if (!mounted || !raw) return
      const value = JSON.parse(raw)
      const journal = value.journal ? parseJournal(JSON.stringify(value.journal)) : null
      const bestMoves: Record<string, number> = {}
      for (let pairs = 2; pairs <= 6; pairs++) {
        const score = value.bestMoves?.[pairs]
        if (Number.isSafeInteger(score) && score >= pairs) bestMoves[pairs] = score
      }
      const buddy = typeof value.buddy === 'string' && journal?.snapshot.dex[value.buddy] ? value.buddy : null
      const restored = restoreProgress(value.progress)
      const progress = journal ? importProgress(restored, journal) : restored
      latest.current = { journal, buddy, bestMoves, progress, arcadeScores: restoreScores(value.arcadeScores) }
      setSaved(latest.current)
      if (JSON.stringify(value.progress) !== JSON.stringify(progress)) {
        try { await AsyncStorage.setItem(KEY, JSON.stringify(latest.current)) }
        catch { if (mounted) setError('Your journal opened, but mission updates could not be saved. Try importing again.') }
      }
    }).catch(() => { if (mounted) setError('Saved phone data could not be read. Import your Zepp export again to recover it.') })
      .finally(() => { if (mounted) setReady(true) })
    return () => { mounted = false }
  }, [])

  function persist(change: (current: Saved) => Saved): Promise<void> {
    if (!ready) return Promise.reject(new Error('Your journal is still loading.'))
    const next = writes.current.then(async () => {
      const value = change(latest.current)
      await AsyncStorage.setItem(KEY, JSON.stringify(value))
      latest.current = value
      setSaved(value)
      setError('')
    })
    writes.current = next.catch(() => {})
    return next
  }
  const importText = (text: string) => persist(current => {
    const journal = parseJournal(text, current.journal)
    return { ...current, journal, progress: importProgress(current.progress, journal),
      buddy: current.buddy && journal.snapshot.dex[current.buddy] ? current.buddy : null }
  })
  const chooseBuddy = (key: string) => persist(current => {
    if (!current.journal?.snapshot.dex[key]) throw new Error('Import this Pokemon before choosing it as your buddy.')
    return { ...current, buddy: key }
  })
  const recordWin = (pairs: number, moves: number) => persist(current => {
    if (!Number.isInteger(pairs) || pairs < 2 || pairs > 6 || !Number.isSafeInteger(moves) || moves < pairs) return current
    return { ...current, bestMoves: { ...current.bestMoves, [pairs]: Math.min(current.bestMoves[pairs] || Infinity, moves) } }
  })
  const recordArcadeScore = (game: ArcadeGame, score: number) => persist(current => ({
    ...current, arcadeScores: saveBestScore(current.arcadeScores, game, score)
  }))
  return <Context.Provider value={{ ...saved, ready, error, importText, chooseBuddy, recordWin, recordArcadeScore }}>{children}</Context.Provider>
}

export function useJournal() {
  const value = useContext(Context)
  if (!value) throw new Error('JournalProvider is missing')
  return value
}
