import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { AppState } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { cloudClient } from './cloud-client'
import { useJournal } from './store'

type Cloud = { session: Session | null; ready: boolean; syncing: boolean; message: string;
  linked: boolean; updatedAt: string | null; sync: () => Promise<void> }
const Context = createContext<Cloud | null>(null)

export function CloudProvider({ children }: PropsWithChildren) {
  const journal = useJournal()
  const store = useRef(journal)
  useEffect(() => { store.current = journal }, [journal])
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!cloudClient)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [linked, setLinked] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const user = useRef<string | undefined>(undefined)
  const pending = useRef(false)

  useEffect(() => {
    if (!cloudClient) return
    const { data: { subscription } } = cloudClient.auth.onAuthStateChange((_event, value) => {
      if (user.current !== value?.user.id) { setLinked(false); setUpdatedAt(null); setMessage('') }
      user.current = value?.user.id
      setSession(value)
      setReady(true)
    })
    cloudClient.auth.getSession().then(({ error }) => {
      if (error) setMessage('Could not restore sign-in. Your offline journal is still available.')
      setReady(true)
    }).catch(() => { setMessage('Sign-in unavailable. Your offline journal is still available.'); setReady(true) })
    return () => subscription.unsubscribe()
  }, [])

  const sync = useCallback(async () => {
    const owner = user.current
    if (!cloudClient || !owner || !store.current.ready || pending.current) return
    pending.current = true
    setSyncing(true)
    try {
      if (store.current.cloudOwner && store.current.cloudOwner !== owner) {
        throw new Error('This phone journal belongs to another account. Sign in with that account to keep your records separate.')
      }
      const { data, error } = await cloudClient.rpc('zepimon_pull')
      if (error) throw new Error('Could not reach your cloud journal. Check your connection and try Sync now again.')
      if (user.current !== owner) return
      if (!data || typeof data.linked !== 'boolean' || !Object.hasOwn(data, 'journal')) throw new Error('Could not read the cloud journal.')
      setLinked(data.linked)
      setUpdatedAt(typeof data.updatedAt === 'string' ? data.updatedAt : null)
      if (!data.journal) {
        setMessage(data.linked ? 'Linked. Open Zepimon on your watch and tap Sync from watch in Zepp.' : 'Create a linking code to connect your watch through Zepp.')
        return
      }
      const older = store.current.journal && data.journal.snapshot?.capturedAt < store.current.journal.snapshot.capturedAt
      await store.current.importCloud(JSON.stringify(data.journal), owner)
      if (user.current === owner) setMessage(older ? 'Your phone already has a newer journal. Sync the latest watch progress through Zepp.' : 'Your watch progress is up to date on this phone.')
    } catch (error) {
      if (user.current === owner) setMessage(error instanceof Error ? error.message : 'Sync failed. Your offline journal is safe.')
    } finally { pending.current = false; setSyncing(false) }
  }, [])

  useEffect(() => {
    if (!session?.user.id || !journal.ready) return
    const timer = setTimeout(() => { void sync() }, 0)
    return () => clearTimeout(timer)
  }, [session?.user.id, journal.ready, sync])

  useEffect(() => {
    if (!cloudClient) return
    function foreground(state: string) {
      if (state === 'active') { cloudClient!.auth.startAutoRefresh(); void sync() }
      else cloudClient!.auth.stopAutoRefresh()
    }
    foreground(AppState.currentState)
    const subscription = AppState.addEventListener('change', foreground)
    // Poll only while the app is visible; Zepp uploads do not wake this app.
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync() }, 60000)
    return () => { subscription.remove(); clearInterval(timer); cloudClient!.auth.stopAutoRefresh() }
  }, [sync])

  return <Context.Provider value={{ session, ready, syncing, message, linked, updatedAt, sync }}>{children}</Context.Provider>
}

export function useCloud() {
  const value = useContext(Context)
  if (!value) throw new Error('CloudProvider is missing')
  return value
}
