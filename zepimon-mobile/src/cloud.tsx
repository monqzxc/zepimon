import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { AppState } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { cloudClient } from './cloud-client'
import { useJournal } from './store'
import { runsToShare } from './phone-adventure'
import { restoreShared } from './shared-adventure'
import { receiveShared } from './tracker'

type Cloud = { session: Session | null; ready: boolean; syncing: boolean; message: string;
  linked: boolean; updatedAt: string | null; sync: () => Promise<void> }
const Context = createContext<Cloud | null>(null)
// How often the open app checks the adventure shared with the watch.
const SHARED_CHECK_MS = 15000

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
  // The newest plan the cloud has accepted from this phone (see src/plan.ts).
  const sentPlan = useRef(0)
  // Adventures recorded here that the cloud has, for the watch to add to its journal. After a restart they are sent
  // again, which the cloud ignores.
  const sentRuns = useRef(new Set<string>())
  const sendingRuns = useRef(false)

  // Shares the chosen egg and any phone adventure with the watch. A plan the cloud already has newer counts as sent;
  // the next sync brings the newer one here.
  const sendPlan = useCallback(async () => {
    const plan = store.current.plan
    if (!cloudClient || !user.current || !plan || plan.updatedAt <= sentPlan.current) return
    const { data, error } = await cloudClient.rpc('zepimon_set_plan', { plan })
    if (!error && data && (data.accepted === true || data.reason === 'not_newer')) sentPlan.current = Math.max(sentPlan.current, plan.updatedAt)
  }, [])

  // Shares the adventures recorded on this phone, so the watch adds their Pokemon and records to its own journal.
  const sendRuns = useCallback(async () => {
    const owner = user.current
    if (!cloudClient || !owner || sendingRuns.current) return
    sendingRuns.current = true
    try {
      for (let batch = runsToShare(store.current.phoneRuns, sentRuns.current); batch.length;
        batch = runsToShare(store.current.phoneRuns, sentRuns.current)) {
        const { error } = await cloudClient.rpc('zepimon_add_phone_runs', { runs: batch })
        if (error || user.current !== owner) return
        batch.forEach(run => sentRuns.current.add(run.id))
      }
    } finally { sendingRuns.current = false }
  }, [])

  useEffect(() => {
    if (!cloudClient) return
    const { data: { subscription } } = cloudClient.auth.onAuthStateChange((_event, value) => {
      if (user.current !== value?.user.id) { setLinked(false); setUpdatedAt(null); setMessage(''); sentPlan.current = 0; sentRuns.current = new Set() }
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
      if (data.plan) await store.current.receivePlan(data.plan)
      // The adventure shared with the watch: shown in the Adventure tab, and it stops recording here if the watch took
      // it over. Once an adventure starts with the chosen egg, neither device offers that egg again.
      void receiveShared(data.adventure ?? null)
      const shared = restoreShared(data.adventure)
      const plan = store.current.plan
      if (shared && plan?.egg && shared.startedAt >= plan.eggAt && shared.family.join('>') === plan.egg.family.join('>')) await store.current.dropEgg()
      void sendPlan()
      void sendRuns()
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
  }, [sendPlan, sendRuns])

  const planAt = journal.plan?.updatedAt ?? 0
  useEffect(() => {
    if (session?.user.id && planAt) void sendPlan()
  }, [planAt, session?.user.id, sendPlan])

  // A newly saved adventure goes up right away, so the watch can pick it up the next time Zepimon opens there.
  const runCount = journal.phoneRuns.length
  useEffect(() => {
    if (session?.user.id && runCount) void sendRuns()
  }, [runCount, session?.user.id, sendRuns])

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

  // Between syncs, a quick look at just the shared adventure and plan, so an adventure started (or taken over) on the
  // watch shows here within seconds. Before zepimon_get_shared is installed the cloud refuses it and the minute's
  // sync still catches up.
  const signedIn = !!session?.user.id
  useEffect(() => {
    if (!cloudClient || !signedIn) return
    let busy = false
    const check = async () => {
      if (busy || AppState.currentState !== 'active' || !store.current.ready) return
      busy = true
      try {
        const { data, error } = await cloudClient!.rpc('zepimon_get_shared')
        if (error || !data) return
        await receiveShared((data as { adventure?: unknown }).adventure ?? null)
        if ((data as { plan?: unknown }).plan) await store.current.receivePlan((data as { plan: unknown }).plan)
      } catch { /* offline: the next check tries again */ } finally { busy = false }
    }
    const timer = setInterval(() => { void check() }, SHARED_CHECK_MS)
    return () => clearInterval(timer)
  }, [signedIn])

  return <Context.Provider value={{ session, ready, syncing, message, linked, updatedAt, sync }}>{children}</Context.Provider>
}

export function useCloud() {
  const value = useContext(Context)
  if (!value) throw new Error('CloudProvider is missing')
  return value
}
