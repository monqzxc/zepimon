import { useState } from 'react'
import { Text, TextInput } from 'react-native'
import { cloudClient } from './cloud-client'
import { useCloud } from './cloud'
import { useJournal } from './store'
import { Button, Copy, Eyebrow, Panel, colors, styles } from './ui'

export function CloudPanel() {
  const { session, ready, syncing, message, linked, updatedAt, sync } = useCloud()
  const { cloudOwner } = useJournal()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState(false)
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState(false)
  const busy = working || syncing || !ready
  const accountMismatch = !!session && !!cloudOwner && cloudOwner !== session.user.id

  async function run(action: () => Promise<void>) {
    if (busy) return
    setWorking(true); setNotice('')
    try { await action() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not connect. Please try again.') }
    finally { setWorking(false) }
  }
  if (!cloudClient) return <Panel><Eyebrow>WATCH SYNC</Eyebrow>
    <Copy>Cloud sync has not been configured in this build. You can still import a Zepp JSON export below.</Copy></Panel>

  return <Panel>
    <Eyebrow>WATCH → ZEPP → YOUR PHONE</Eyebrow>
    {!session ? <>
      <Copy>Sign in with your email to link your Amazfit and view its Zepimon progress here.</Copy>
      <TextInput accessibilityLabel="Email address" placeholder="Your email address" placeholderTextColor={colors.muted}
        value={email} onChangeText={value => { setEmail(value); setSentTo(''); setOtp('') }}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" style={styles.input} editable={!busy} />
      <Button title={working ? 'Working…' : sentTo ? 'Resend email code' : 'Send sign-in code'} disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
        onPress={() => run(async () => {
          const address = email.trim().toLowerCase()
          const { error } = await cloudClient!.auth.signInWithOtp({ email: address })
          if (error) throw error
          setSentTo(address); setNotice('Check your email for the sign-in code. Allow a minute before requesting another.')
        })} />
      {!!sentTo && <>
        <TextInput accessibilityLabel="Email sign-in code" placeholder="Code from your email" placeholderTextColor={colors.muted}
          value={otp} onChangeText={setOtp} keyboardType="number-pad" autoComplete="one-time-code" style={styles.input} editable={!busy} />
        <Button title="Sign in" disabled={busy || !/^\d{6,10}$/.test(otp.trim())} onPress={() => run(async () => {
          const { error } = await cloudClient!.auth.verifyOtp({ email: sentTo, token: otp.trim(), type: 'email' })
          if (error) throw error
          setOtp(''); setSentTo(''); setNotice('Signed in. Link your watch below.')
        })} />
      </>}
    </> : <>
      <Copy color={colors.ink}>{session.user.email}</Copy>
      <Copy>{linked ? 'Watch upload link connected.' : 'Link your watch through the Zepp app.'}</Copy>
      {updatedAt && <Copy small>Cloud journal updated: {new Date(updatedAt).toLocaleString()}</Copy>}
      <Button title={syncing ? 'Syncing…' : 'Sync now'} disabled={busy || accountMismatch} onPress={() => { setNotice(''); void sync() }} />
      <Button title={linked ? 'Create replacement linking code' : 'Create linking code'} secondary disabled={busy || accountMismatch} onPress={() => run(async () => {
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
      {linked && <Button title={confirmUnlink ? 'Confirm disconnect watch' : 'Disconnect watch'} secondary disabled={busy || accountMismatch} onPress={() => {
        if (!confirmUnlink) { setConfirmUnlink(true); return }
        void run(async () => {
          const { error } = await cloudClient!.rpc('zepimon_unlink')
          if (error) throw new Error('Could not disconnect. Try again while online.')
          setConfirmUnlink(false); setCode(null); await sync(); setNotice('Watch uploads disconnected. Saved records are kept.')
        })
      }} />}
      <Button title="Sign out" secondary disabled={busy} onPress={() => run(async () => {
        const { error } = await cloudClient!.auth.signOut({ scope: 'local' })
        if (error) throw error
        setCode(null); setConfirmUnlink(false); setNotice('Signed out. Your downloaded journal remains on this phone.')
      })} />
      <Copy small>Sync checks when you open this app and every minute while it is visible. Keep Zepp connected to your watch. Offline progress stays saved.</Copy>
    </>}
    {!!notice && <Copy color={colors.gold}>{notice}</Copy>}
    {!!message && <Copy color={colors.gold}>{message}</Copy>}
    <Copy small>This sync uploads your watch’s Dex and adventure records to your Zepimon account. Arcade scores and phone-only history stay on this phone.</Copy>
  </Panel>
}
