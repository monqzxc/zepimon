import { useState } from 'react'
import { Text, TextInput } from 'react-native'
import { cloudClient } from './cloud-client'
import { useCloud } from './cloud'
import { useJournal } from './store'
import { Button, Copy, Panel, Title, colors, styles } from './ui'

// The Settings tab's account and watch sections. Account signs in with an email code; Watch links the watch through
// Zepp, syncs and disconnects. Both talk to the same Zepimon account (src/cloud.tsx).

// The running action's name, so only its button shows the loader, and what it last said.
function useAction() {
  const { ready, syncing } = useCloud()
  const [working, setWorking] = useState('')
  const [notice, setNotice] = useState('')
  const busy = !!working || syncing || !ready
  async function run(name: string, action: () => Promise<void>) {
    if (busy) return
    setWorking(name); setNotice('')
    try { await action() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not connect. Please try again.') }
    finally { setWorking('') }
  }
  return { working, notice, setNotice, busy, run }
}

export function AccountPanel() {
  const { session } = useCloud()
  const { working, notice, setNotice, busy, run } = useAction()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [otp, setOtp] = useState('')
  if (!cloudClient) return <Panel><Title>Offline mode</Title>
    <Copy>Cloud sync has not been configured in this build. You can still import a watch export under Your data.</Copy></Panel>

  return <Panel>
    {!session ? <>
      <Title>Sign in</Title>
      <Copy>Sign in with your email to link your Amazfit and keep your journal in your Zepimon account.</Copy>
      <TextInput accessibilityLabel="Email address" placeholder="Your email address" placeholderTextColor={colors.muted}
        value={email} onChangeText={value => { setEmail(value); setSentTo(''); setOtp('') }}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={styles.input} editable={!busy} />
      <Button title={working === 'email' ? 'Working…' : sentTo ? 'Resend email code' : 'Send sign-in code'} loading={working === 'email'}
        disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
        onPress={() => run('email', async () => {
          const address = email.trim().toLowerCase()
          const { error } = await cloudClient!.auth.signInWithOtp({ email: address })
          if (error) throw error
          setSentTo(address); setNotice('Check your email for the sign-in code. Allow a minute before requesting another.')
        })} />
      {!!sentTo && <>
        <TextInput accessibilityLabel="Email sign-in code" placeholder="Code from your email" placeholderTextColor={colors.muted}
          value={otp} onChangeText={setOtp} keyboardType="number-pad" autoComplete="one-time-code" style={styles.input} editable={!busy} />
        <Button title="Sign in" loading={working === 'sign-in'} disabled={busy || !/^\d{6,10}$/.test(otp.trim())} onPress={() => run('sign-in', async () => {
          const { error } = await cloudClient!.auth.verifyOtp({ email: sentTo, token: otp.trim(), type: 'email' })
          if (error) throw error
          setOtp(''); setSentTo(''); setNotice('Signed in. Link your watch under Watch.')
        })} />
      </>}
    </> : <>
      <Title>Signed in</Title>
      <Copy color={colors.ink}>{session.user.email}</Copy>
      <Button title="Sign out" secondary loading={working === 'sign-out'} disabled={busy} onPress={() => run('sign-out', async () => {
        const { error } = await cloudClient!.auth.signOut({ scope: 'local' })
        if (error) throw error
        setNotice('Signed out. Your downloaded journal remains on this phone.')
      })} />
    </>}
    {!!notice && <Copy color={colors.gold}>{notice}</Copy>}
  </Panel>
}

export function WatchPanel() {
  const { session, syncing, message, linked, updatedAt, sync } = useCloud()
  const { cloudOwner } = useJournal()
  const { working, notice, setNotice, busy, run } = useAction()
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const accountMismatch = !!session && !!cloudOwner && cloudOwner !== session.user.id
  if (!cloudClient) return null
  if (!session) return <Panel><Title>No watch linked</Title>
    <Copy>Sign in under Account, then link your watch through the Zepp app. Without an account, you can still import a watch export under Your data.</Copy></Panel>

  return <Panel>
    <Title>{linked ? 'Watch linked' : 'Link your watch'}</Title>
    <Copy>{linked ? 'Your watch uploads through Zepp, and adventures, eggs and the shared adventure go both ways.' : 'Create a linking code, then enter it in the Zepp app.'}</Copy>
    {updatedAt && <Copy small>Watch journal last updated: {new Date(updatedAt).toLocaleString()}</Copy>}
    <Button title={syncing ? 'Syncing…' : 'Sync now'} loading={syncing} disabled={busy || accountMismatch} onPress={() => { setNotice(''); void sync() }} />
    <Button title={linked ? 'Create replacement linking code' : 'Create linking code'} secondary loading={working === 'link'}
      disabled={busy || accountMismatch} onPress={() => run('link', async () => {
        const { data, error } = await cloudClient!.rpc('zepimon_create_link')
        if (error) throw new Error('Could not create a linking code. Check your connection and cloud setup.')
        if (!data || !/^[a-f0-9]{24}$/.test(data.code) || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('Invalid linking code response.')
        setCode(data)
      })} />
    {code && <>
      <Text selectable accessibilityLabel="One-time watch linking code" style={[styles.stat, { fontSize: 20 }]}>{code.code.match(/.{4}/g)?.join('-')}</Text>
      <Copy small>Expires at {new Date(code.expiresAt).toLocaleTimeString()}. Long-press to copy.</Copy>
      <Copy>In Zepp, open your watch’s Zepimon settings → Sync to Zepimon mobile. Paste this code and tap Link account, then Sync from watch.</Copy>
      {linked && <Copy small>Using this code replaces the previous watch upload link.</Copy>}
    </>}
    {linked && <Button title={confirmUnlink ? 'Confirm disconnect watch' : 'Disconnect watch'} secondary loading={working === 'unlink'}
      disabled={busy || accountMismatch} onPress={() => {
        if (!confirmUnlink) { setConfirmUnlink(true); return }
        void run('unlink', async () => {
          const { error } = await cloudClient!.rpc('zepimon_unlink')
          if (error) throw new Error('Could not disconnect. Try again while online.')
          setConfirmUnlink(false); setCode(null); await sync(); setNotice('Watch uploads disconnected. Saved records are kept.')
        })
      }} />}
    {!!notice && <Copy color={colors.gold}>{notice}</Copy>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    <Copy small>The app syncs when it opens and every minute while it is open, and checks the shared adventure every 15 seconds. Keep Zepp connected to your watch; offline progress stays saved. Adventures recorded on this phone go to your watch too, without their routes. Arcade scores stay on this phone.</Copy>
  </Panel>
}
