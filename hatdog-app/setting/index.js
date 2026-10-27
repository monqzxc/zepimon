import { SNAPSHOT_KEY, SYNC_KEY, STATUS_KEY, SYNC_FRAME_KEY, SHARED_KEY, SHARED_REQUEST_KEY, sharedName, validateAdventure, validatePlan, validateSnapshot } from '../shared/companion'
import { routes } from '../page/catalog'
import { CLOUD_TOKEN_KEY, CLOUD_REQUEST_KEY, CLOUD_STATUS_KEY, CLOUD_SENT_KEY, CLOUD_LINKED_KEY } from '../shared/cloud'
import { cloudConfig } from '../shared/cloud-config'

// Pokedex-styled bridge page. Everything is drawn with View/Text/Button: Zepp settings pages load no images here.
const theme = {
  bg: '#061b2c', panel: '#102d42', ink: '#f4ebcf', muted: '#9abfcd', edge: '#54c7c4', navy: '#135b89', outline: '#02101b',
  red: '#b8332a', redLight: '#ff8a80', card: '#f4ebcf', cardInk: '#102d42', cardMuted: '#3f5a68',
  lens: '#3fa9f5', green: '#7ddc6b', yellow: '#ffd75e', alert: '#ff6b5b'
}
const pixel = (color = theme.outline) => ({ border: '3px solid ' + color, boxShadow: '0 4px 0 ' + color, borderRadius: '2px' })
const label = (value, size = 14, color = theme.ink, extra = {}) => Text({
  style: { display: 'block', fontSize: size + 'px', color, lineHeight: '1.5', overflowWrap: 'anywhere', ...extra }
}, value)
const eyebrow = (value, color = theme.edge) => label(value, 12, color, { letterSpacing: '1.5px', fontWeight: 'bold' })
const title = (value, color = theme.ink) => label(value, 24, color, { fontWeight: 'bold', lineHeight: '1.3', margin: '4px 0 6px' })
const dot = (color, size = 12) => View({ style: { display: 'inline-block', width: size + 'px', height: size + 'px', borderRadius: '50%',
  background: color, border: '2px solid ' + theme.outline, verticalAlign: 'middle', marginRight: '8px', flexShrink: '0' } })

// A status line pairs a colored light with words, so meaning never relies on color alone. Work in progress spins a Pokeball.
const status = (message, tone, color = theme.ink, spin = null) => View({ style: { display: 'flex', alignItems: 'flex-start', marginTop: '10px' } }, [
  View({ style: { paddingTop: '3px' } }, spin === null ? dot(tone) : pokeball(16, spin)), label(message, 13, color)
])
const working = text => /^(Syncing|Uploading|Linking)/.test(text)
const toneOf = text => /^(Synced|Uploaded|Account linked)/.test(text) ? theme.green
  : /^(Syncing|Uploading|Linking)/.test(text) ? theme.yellow
    : /(Could not|failed|unavailable|timed out|Invalid|expired|interrupted|Open Zepimon on your connected)/i.test(text) ? theme.alert : theme.lens

// One red primary action per screen; navy for secondary, outline for low-priority, red outline for unlinking.
const kinds = {
  primary: { background: theme.red, color: '#ffffff', ...pixel() },
  secondary: { background: theme.navy, color: theme.ink, ...pixel(theme.edge) },
  ghost: { background: 'transparent', color: theme.edge, border: '2px solid ' + theme.edge, borderRadius: '2px' },
  danger: { background: 'transparent', color: theme.redLight, border: '2px solid ' + theme.redLight, borderRadius: '2px' }
}
const button = (text, onClick, kind = 'secondary') => View({ style: { marginTop: '14px' } }, Button({
  label: text, onClick, style: { display: 'block', width: '100%', minHeight: '48px', padding: '12px 14px', fontFamily: 'monospace',
    fontWeight: 'bold', fontSize: '15px', letterSpacing: '0.5px', boxSizing: 'border-box', ...kinds[kind] }
}))

// A small Pokeball: red top, dark band, white bottom and a center button. Pass the service's frame count to spin it:
// each frame turns it 45 degrees, eased by a short transition so it rolls smoothly between updates.
const pokeball = (size = 18, spin = null) => View({ style: { position: 'relative', display: 'inline-block', width: size + 'px', height: size + 'px',
  borderRadius: '50%', border: '2px solid ' + theme.outline, boxSizing: 'border-box', verticalAlign: 'middle', marginRight: '8px', flexShrink: '0',
  background: `linear-gradient(${theme.red} 0 42%, ${theme.outline} 42% 58%, #ffffff 58% 100%)`,
  ...(spin === null ? {} : { transform: `rotate(${spin * 45}deg)`, transition: 'transform 140ms linear' }) } }, View({ style: {
  position: 'absolute', left: '50%', top: '50%', width: Math.round(size * 0.36) + 'px', height: Math.round(size * 0.36) + 'px',
  marginLeft: -Math.round(size * 0.18) + 'px', marginTop: -Math.round(size * 0.18) + 'px', borderRadius: '50%', background: '#ffffff',
  border: '2px solid ' + theme.outline, boxSizing: 'border-box' } }))
const section = (heading, children, style = {}) => View({ style: { marginTop: '20px', padding: '16px', background: theme.panel, ...pixel(theme.edge), ...style } }, [
  View({ style: { display: 'flex', alignItems: 'center', marginBottom: '4px' } }, [pokeball(), eyebrow(heading)]),
  ...children
])
const screen = children => View({ style: { padding: '20px 16px 40px', minHeight: '100vh', background: theme.bg,
  color: theme.ink, fontFamily: 'monospace', boxSizing: 'border-box' } }, children)

// The Pokedex lid: one big lens and three small lights above the page title. While busy, the lights chase each other.
const light = (color, on) => View({ style: { display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', background: color,
  border: '2px solid ' + theme.outline, verticalAlign: 'middle', marginRight: '8px', flexShrink: '0', opacity: on ? '1' : '0.3' } })
const pokedex = (heading, intro, badge, busyFrame = null) => View({ style: { padding: '16px', background: theme.red, ...pixel() } }, [
  View({ style: { display: 'flex', alignItems: 'center', marginBottom: '12px' } }, [
    View({ style: { width: '40px', height: '40px', borderRadius: '50%', background: theme.lens, border: '4px solid #ffffff',
      boxShadow: '0 0 0 3px ' + theme.outline, marginRight: '14px', flexShrink: '0' } }),
    ...[theme.alert, theme.yellow, theme.green].map((color, index) => light(color, busyFrame === null || busyFrame % 3 === index))
  ]),
  eyebrow('ZEPIMON / WATCH BRIDGE', '#ffe3df'),
  title(heading, '#ffffff'),
  label(intro, 14, '#ffe9e6'),
  ...(badge ? [badge] : [])
])
const badge = (text, light) => View({ style: { display: 'inline-flex', alignItems: 'center', marginTop: '12px', padding: '6px 10px',
  background: theme.outline, borderRadius: '2px' } }, [dot(light, 10), label(text, 12, '#ffffff', { display: 'inline', fontWeight: 'bold', letterSpacing: '1px' })])
// A hard-to-miss banner while the phone talks to the watch or the cloud: spinning Pokeball plus a pixel progress bar.
const busyBanner = (heading, text, frame) => View({ style: { marginTop: '20px', padding: '14px', background: theme.yellow, color: theme.outline, ...pixel() } }, [
  View({ style: { display: 'flex', alignItems: 'center' } }, [
    pokeball(40, frame),
    View({ style: { marginLeft: '6px' } }, [label(heading, 13, theme.outline, { fontWeight: 'bold', letterSpacing: '1px' }), label(text, 13, theme.outline)])
  ]),
  View({ style: { display: 'flex', gap: '4px', marginTop: '12px' } }, Array.from({ length: 8 }, (_, cell) => {
    const lit = (frame - cell + 800) % 8
    return View({ style: { flex: '1', height: '10px', border: '2px solid ' + theme.outline,
      background: lit === 0 ? theme.red : lit === 1 ? '#e77a6f' : '#fff1b8' } })
  }))
])
const field = input => View({ style: { marginTop: '14px', background: theme.card, color: theme.cardInk, padding: '12px', ...pixel(theme.edge) } }, input)
const fact = (name, value) => View({ style: { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0',
  borderBottom: '2px dashed rgba(16, 45, 66, 0.25)' } }, [label(name, 13, theme.cardMuted), label(value, 13, theme.cardInk, { fontWeight: 'bold', textAlign: 'right' })])
const step = (number, text) => View({ style: { display: 'flex', alignItems: 'flex-start', marginTop: '10px' } }, [
  label(String(number), 13, theme.outline, { display: 'inline-block', minWidth: '24px', height: '24px', lineHeight: '24px', textAlign: 'center',
    background: theme.yellow, borderRadius: '50%', fontWeight: 'bold', marginRight: '10px', flexShrink: '0' }),
  label(text, 14)
])

AppSettingsPage({
  build({ settingsStorage: storage }) {
    if (this.exportText && storage.getItem('zepimon-ui-export') === '1') {
      return screen([
        pokedex('Export JSON', 'Copy your last synced watch progress into the Zepimon app by hand. No account is needed.'),
        section('MANUAL TRANSFER', [
          step(1, 'Tap the JSON field, then long-press the text and choose Select all > Copy.'),
          step(2, 'In Zepimon, open Sync > Manual JSON import and paste the text.'),
          step(3, 'Tap Check pasted JSON, then Use this export.'),
          label(this.exportText.length + ' characters. Copy the entire text.', 13, theme.muted, { marginTop: '10px' }),
          field(TextInput({
            label: 'JSON export - tap to copy', multiline: true, rows: 12, value: this.exportText,
            onChange: () => {}, labelStyle: { color: theme.cardInk, fontSize: '16px' },
            subStyle: { color: theme.cardInk, fontSize: '12px' }
          })),
          label('This copy stays unchanged while you copy it. Go back and export again after a newer watch sync.', 13, theme.muted, { marginTop: '10px' }),
          button('Back to sync', () => {
            this.exportText = null
            storage.setItem('zepimon-ui-export', '0')
          }, 'primary')
        ])
      ])
    }

    const request = (action, code) => storage.setItem(CLOUD_REQUEST_KEY, JSON.stringify({ action, code, at: Date.now() }))
    const linked = !!storage.getItem(CLOUD_TOKEN_KEY)
    const cloudMessage = storage.getItem(CLOUD_STATUS_KEY) || ''
    const syncMessage = storage.getItem(STATUS_KEY) || 'Waiting for watch progress.'
    const confirmingRemove = linked && storage.getItem('zepimon-ui-confirm-unlink') === '1'
    // "Change account" stays open until a new link succeeds after it was submitted; the old account keeps uploading meanwhile.
    const changeFlag = storage.getItem('zepimon-ui-change-account') || ''
    const linkedAt = Number(storage.getItem(CLOUD_LINKED_KEY)) || 0
    const changing = linked && !confirmingRemove && (changeFlag === '1' || (changeFlag.startsWith('pending:') && linkedAt < Number(changeFlag.slice(8))))
    const frame = Number(storage.getItem(SYNC_FRAME_KEY)) || 0
    const syncing = working(syncMessage)
    const busy = syncing || working(cloudMessage)
    const spinFor = text => working(text) ? frame : null
    let receivedAt = null
    let snapshot = null
    let exportHint = 'Sync from watch first to generate a JSON copy. No cloud login is needed.'
    try {
      const saved = JSON.parse(storage.getItem(SNAPSHOT_KEY) || 'null')
      if (saved) {
        snapshot = validateSnapshot(saved)
        if (Number.isFinite(saved.receivedAt) && saved.receivedAt >= 0 && saved.receivedAt <= 8.64e15) receivedAt = saved.receivedAt
      }
    } catch (_) { exportHint = 'Could not read the saved watch data. Sync from watch again before exporting.' }
    const entries = snapshot ? Object.keys(snapshot.dex) : []
    const shinies = entries.filter(key => key.startsWith('Shiny ')).length
    const sent = Number(storage.getItem(CLOUD_SENT_KEY)) || 0
    const uploadState = !snapshot ? 'Nothing to upload yet' : sent >= snapshot.capturedAt ? 'Up to date' : 'New progress waiting'
    const when = time => new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

    const trainerCard = View({ style: { marginTop: '20px', padding: '16px', background: theme.card, color: theme.cardInk, ...pixel(theme.edge) } }, [
      View({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } }, [
        View({ style: { display: 'flex', alignItems: 'center' } }, [pokeball(22), eyebrow('TRAINER CARD', theme.red)]),
        label('LINKED', 12, '#ffffff', { display: 'inline-block', padding: '3px 8px', background: '#2f7a3d', borderRadius: '2px', fontWeight: 'bold', letterSpacing: '1px' })
      ]),
      title(uploadState === 'Up to date' ? 'Your Dex is backed up' : snapshot ? 'New progress to upload' : 'Ready for your first sync', theme.cardInk),
      label('Account linked on this phone. Zepp uploads your watch journal to your Zepimon account after every sync.', 13, theme.cardMuted),
      View({ style: { marginTop: '10px' } }, [
        fact('Cloud uploads', uploadState),
        fact('Dex entries', snapshot ? entries.length + (shinies ? ' · ' + shinies + ' Shiny' : '') : '—'),
        fact('Last watch sync', receivedAt ? when(receivedAt) : 'Not yet'),
        ...(linkedAt ? [fact('Linked since', when(linkedAt))] : [])
      ]),
      ...(cloudMessage ? [status(cloudMessage, toneOf(cloudMessage), theme.cardInk, spinFor(cloudMessage))] : []),
      // Retrying only does something when newer watch progress has not reached the account yet.
      ...(uploadState === 'New progress waiting' ? [button('Retry upload', () => request('retry'), 'secondary')] : [])
    ])

    const codeField = () => field(TextInput({
      label: 'One-time linking code', labelStyle: { color: theme.cardInk, fontSize: '16px' },
      placeholder: 'Enter one-time linking code', value: storage.getItem('zepimon-ui-link-code') || '',
      onChange: value => storage.setItem('zepimon-ui-link-code', value), subStyle: { color: theme.cardInk, fontSize: '16px' }
    }))
    const linkCard = cloudConfig.url ? section('LINK YOUR ACCOUNT', [
      title('Bring your Dex to the Zepimon app'),
      step(1, 'Open the Zepimon app and tap Sync.'),
      step(2, 'Sign in and create a one-time linking code.'),
      step(3, 'Paste it below within 10 minutes and tap Link account.'),
      codeField(),
      button('Link account', () => {
        const code = (storage.getItem('zepimon-ui-link-code') || '').trim()
        if (!code) { storage.setItem(CLOUD_STATUS_KEY, 'Could not link: enter the code from the Zepimon app first.'); return }
        request('link', code)
        storage.setItem('zepimon-ui-link-code', '')
      }, 'primary'),
      ...(cloudMessage ? [status(cloudMessage, toneOf(cloudMessage), theme.ink, spinFor(cloudMessage))] : [])
    ]) : section('CLOUD SYNC', [label('Cloud sync is not configured in this build.', 15), label('You can still use Export JSON below.', 13, theme.muted)])

    // The egg and adventure the watch and the Zepimon app share. The page asks the Zepp service for a fresh copy when
    // it opens or shows again after a while, and on Refresh; meanwhile it shows the last one.
    const askShared = () => {
      this.sharedAskedAt = Date.now()
      storage.setItem(SHARED_REQUEST_KEY, String(this.sharedAskedAt))
    }
    if (linked && Date.now() - (this.sharedAskedAt || 0) > 20000) askShared()
    let shared = {}
    try { shared = JSON.parse(storage.getItem(SHARED_KEY) || '{}') || {} } catch (_) { shared = {} }
    const read = (check, value) => { try { return check(value) } catch (_) { return null } }
    const adventure = read(validateAdventure, shared.adventure)
    const plan = read(validatePlan, shared.plan)
    const live = adventure && !adventure.ended && Date.now() - adventure.at < 12 * 3600000 ? adventure : null
    // Until the watch shares its adventure (an older watch app, or before it reaches Zepp), the one in its last sync.
    const synced = !live && snapshot && snapshot.active && routes[snapshot.active.route] ? snapshot.active : null
    const problem = typeof shared.error === 'string' ? shared.error : ''
    const adventureCard = section('ADVENTURE', [...(live ? [
      title(sharedName(live)),
      label((live.activity === 'running' ? 'Running' : 'Walking') + ' · ' + (live.meters / 1000).toFixed(2) + ' km · recording on your ' + live.device, 14),
      label('Updated ' + when(live.at) + '. To switch devices, tap Continue here on your ' + (live.device === 'phone' ? 'watch' : 'phone') + '.', 13, theme.muted, { marginTop: '6px' })
    ] : synced ? [
      title(sharedName({ family: routes[synced.route], meters: synced.meters, mega: synced.mega || null, shiny: !!synced.shiny })),
      label((synced.activity === 'running' ? 'Running' : 'Walking') + ' · ' + (synced.meters / 1000).toFixed(2) + ' km · recording on your watch', 14),
      label('As of the last watch sync' + (receivedAt ? ', ' + when(receivedAt) : '') + '. Keep Zepimon open on your watch to share it with the app.', 13, theme.muted, { marginTop: '6px' })
    ] : [
      title(plan && plan.egg ? plan.egg.family[0] + ' egg' : 'No adventure in progress'),
      label(plan && plan.egg ? 'Chosen in the Zepimon app. Walk or Run on your watch, or Start in the app, to begin.'
        : 'Choose an egg in the Zepimon app, or start an adventure on your watch. Both show the same one.', 13, theme.muted)
    ]), ...(problem ? [status(problem, theme.alert)] : []),
    ...(Number.isFinite(shared.at) ? [label('Checked ' + when(shared.at) + '. Your watch checks whenever Zepimon is open on it.', 12, theme.muted, { marginTop: '8px' })] : []),
    button('Refresh', askShared, 'ghost')])

    const syncCard = section('WATCH SYNC', [
      label(linked ? 'Sync now to send your latest steps, hatches and Dex to your account.' : 'Pull the latest progress from your watch onto this phone.', 14),
      button(syncing ? 'Syncing…' : 'Sync from watch', () => storage.setItem(SYNC_KEY, String(Date.now())), linked && !changing ? 'primary' : 'secondary'),
      status(syncMessage, toneOf(syncMessage), theme.ink, spinFor(syncMessage)),
      ...(receivedAt ? [label('Last received: ' + when(receivedAt), 13, theme.muted, { marginTop: '6px' })] : []),
      ...(snapshot && snapshot.active ? [label('Adventure in progress: ' + (snapshot.active.meters / 1000).toFixed(2) + ' km', 13, theme.muted)] : []),
      label('Keep your watch connected and open Zepimon on it when syncing manually.', 13, theme.muted, { marginTop: '6px' })
    ])

    const transferCard = section('MANUAL TRANSFER', [
      label('No account? Copy your progress into the app by hand.', 14),
      ...(snapshot ? [button('Export JSON', () => {
        this.exportText = JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date().toISOString(),
          receivedAt, snapshot, routes }, null, 2)
        storage.setItem('zepimon-ui-export', '1')
      }, 'ghost'), label('Copy the last synced watch progress into Zepimon manually. No cloud login is needed.', 13, theme.muted, { marginTop: '8px' })]
        : [label(exportHint, 13, theme.muted, { marginTop: '8px' })])
    ])

    // Removing the account only stops uploads from this phone and asks once first. Changing links a new code while
    // the current account keeps working, so a typo never leaves the phone unlinked.
    const manageCard = section('MANAGE ACCOUNT', confirmingRemove ? [
      label('Remove this account from the phone?', 15, theme.ink, { fontWeight: 'bold' }),
      label('Uploads stop right away. Your Zepimon account, the progress already in the app and your watch records are not deleted. Link again any time with a new code.', 13, theme.muted),
      button('Yes, remove account', () => {
        storage.setItem('zepimon-ui-confirm-unlink', '0')
        storage.setItem('zepimon-ui-change-account', '0')
        request('stop')
      }, 'danger'),
      button('Keep account', () => storage.setItem('zepimon-ui-confirm-unlink', '0'), 'ghost')
    ] : changing ? [
      label('Link a different account', 15, theme.ink, { fontWeight: 'bold' }),
      step(1, 'In the Zepimon app, sign in with the other account.'),
      step(2, 'Tap Sync and create a one-time linking code.'),
      step(3, 'Paste it here. Your current account keeps uploading until the new code works.'),
      codeField(),
      button('Link new account', () => {
        const code = (storage.getItem('zepimon-ui-link-code') || '').trim()
        if (!code) { storage.setItem(CLOUD_STATUS_KEY, 'Could not link: enter the code from the Zepimon app first.'); return }
        storage.setItem('zepimon-ui-change-account', 'pending:' + Date.now())
        storage.setItem(CLOUD_STATUS_KEY, 'Linking your Zepimon account...')
        request('link', code)
        storage.setItem('zepimon-ui-link-code', '')
      }, 'primary'),
      ...(changeFlag.startsWith('pending:') && cloudMessage ? [status(cloudMessage, toneOf(cloudMessage), theme.ink, spinFor(cloudMessage))] : []),
      button('Cancel', () => { storage.setItem('zepimon-ui-change-account', '0'); storage.setItem('zepimon-ui-link-code', '') }, 'ghost')
    ] : [
      label('Switching trainers? Link a different Zepimon account, or remove the account from this phone.', 13, theme.muted),
      button('Change account', () => { storage.setItem('zepimon-ui-confirm-unlink', '0'); storage.setItem('zepimon-ui-change-account', '1') }, 'secondary'),
      button('Remove account', () => { storage.setItem('zepimon-ui-change-account', '0'); storage.setItem('zepimon-ui-confirm-unlink', '1') }, 'danger')
    ], { borderColor: theme.redLight, boxShadow: '0 4px 0 ' + theme.outline })

    const banner = !busy ? null : syncing
      ? busyBanner('SYNCING WITH YOUR WATCH', 'Keep Zepimon open on your watch. This takes a few seconds.', frame)
      : /^Linking/.test(cloudMessage) ? busyBanner('LINKING YOUR ACCOUNT', 'Checking your code with Zepimon…', frame)
        : busyBanner('UPLOADING YOUR JOURNAL', 'Sending your latest watch progress to your Zepimon account.', frame)

    return screen([
      pokedex('Connect your adventure', 'View your Dex and journeys in the standalone Zepimon app. Zepp connects your watch to your account.',
        linked ? badge('ACCOUNT LINKED', theme.green) : badge(cloudConfig.url ? 'NOT LINKED YET' : 'OFFLINE MODE', theme.yellow), busy ? frame : null),
      ...(banner ? [banner] : []),
      ...(linked ? [trainerCard, adventureCard, syncCard, transferCard, manageCard] : [linkCard, syncCard, transferCard]),
      label('Progress stays saved on your watch when offline. Open Zepimon on your phone after uploading.', 12, theme.muted, { marginTop: '20px', textAlign: 'center' }),
      // The version the watch reported at its last sync: version.name and, in brackets, its whole-number version.code.
      ...(snapshot && snapshot.appVersion ? [label('Watch app ' + snapshot.appVersion +
        (snapshot.appVersionCode !== undefined ? ' (build ' + snapshot.appVersionCode + ')' : ''), 12, theme.muted, { marginTop: '6px', textAlign: 'center' })] : [])
    ])
  }
})
