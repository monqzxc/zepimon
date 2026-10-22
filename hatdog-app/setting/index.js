import { SNAPSHOT_KEY, SYNC_KEY, STATUS_KEY, validateSnapshot } from '../shared/companion'
import { routes } from '../page/catalog'
import { CLOUD_TOKEN_KEY, CLOUD_REQUEST_KEY, CLOUD_STATUS_KEY } from '../shared/cloud'
import { cloudConfig } from '../shared/cloud-config'

const palette = { ink: '#f4ebcf', muted: '#9abfcd', edge: '#54c7c4' }
const label = (value, size = 14, color = palette.ink) => Text({
  style: { display: 'block', fontSize: size + 'px', color, lineHeight: '1.5', overflowWrap: 'anywhere' }
}, value)
const button = (text, onClick) => View({ style: { marginTop: '16px' } }, Button({
  label: text, onClick, style: { minHeight: '44px', padding: '10px 14px', borderRadius: '3px',
    border: '2px solid ' + palette.edge, background: '#135b89', color: '#ffffff', fontWeight: 'bold', fontSize: '14px' }
}))
const screen = children => View({ style: { padding: '22px 16px 36px', minHeight: '100vh', background: '#061b2c',
  color: palette.ink, fontFamily: 'monospace', boxSizing: 'border-box' } }, children)

AppSettingsPage({
  build({ settingsStorage: storage }) {
    if (this.exportText && storage.getItem('zepimon-ui-export') === '1') {
      return screen([
        label('ZEPIMON / MANUAL TRANSFER', 12, palette.edge),
        label('Export JSON', 25),
        label('Tap the JSON field, then long-press the text and choose Select all > Copy.'),
        label('In Zepimon, open Sync > Manual JSON import. Paste the text, tap Check pasted JSON, then Use this export.'),
        label(this.exportText.length + ' characters. Copy the entire text.', 13, palette.muted),
        View({ style: { marginTop: '16px', background: '#e8efd8', color: '#102d42',
          border: '2px solid ' + palette.edge, borderRadius: '4px', padding: '12px' } }, TextInput({
          label: 'JSON export - tap to copy', multiline: true, rows: 12, value: this.exportText,
          onChange: () => {}, labelStyle: { color: '#102d42', fontSize: '16px' },
          subStyle: { color: '#102d42', fontSize: '12px' }
        })),
        label('This copy stays unchanged while you copy it. Go back and export again after a newer watch sync.', 13, palette.muted),
        button('Back to sync', () => {
          this.exportText = null
          storage.setItem('zepimon-ui-export', '0')
        })
      ])
    }
    const request = (action, code) => storage.setItem(CLOUD_REQUEST_KEY, JSON.stringify({ action, code, at: Date.now() }))
    const linked = !!storage.getItem(CLOUD_TOKEN_KEY)
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
    return screen([
      label('ZEPIMON / WATCH BRIDGE', 12, palette.edge),
      label('Connect your adventure', 25),
      label('View your Dex and journeys in the standalone Zepimon app. Zepp connects your watch to your account.'),
      label(linked ? 'Account linked on this phone.' : 'Link your Zepimon account below.', 15, palette.edge),
      ...(cloudConfig.url ? [
        label('In Zepimon, open Sync, sign in and create a linking code. Paste it below within 10 minutes.'),
        View({ style: { marginTop: '16px', background: '#e8efd8', color: '#102d42',
          border: '2px solid ' + palette.edge, borderRadius: '4px', padding: '12px' } }, TextInput({
          label: 'One-time linking code', labelStyle: { color: '#102d42', fontSize: '16px' },
          placeholder: 'Enter one-time linking code', value: storage.getItem('zepimon-ui-link-code') || '',
          onChange: value => storage.setItem('zepimon-ui-link-code', value), subStyle: { color: '#102d42', fontSize: '16px' }
        })),
        button('Link account', () => {
          request('link', storage.getItem('zepimon-ui-link-code') || '')
          storage.setItem('zepimon-ui-link-code', '')
        })
      ] : [label('Cloud sync is not configured in this build.', 15)]),
      button('Sync from watch', () => storage.setItem(SYNC_KEY, String(Date.now()))),
      label('Keep your watch connected and open Zepimon on it when syncing manually.', 13, palette.muted),
      label(storage.getItem(STATUS_KEY) || 'Waiting for watch progress.', 13, palette.muted),
      ...(receivedAt ? [label('Last received: ' + new Date(receivedAt).toLocaleString(), 13, palette.muted)] : []),
      ...(snapshot ? [button('Export JSON', () => {
        this.exportText = JSON.stringify({ exportVersion: 1, app: 'Zepimon', exportedAt: new Date().toISOString(),
          receivedAt, snapshot, routes }, null, 2)
        storage.setItem('zepimon-ui-export', '1')
      }), label('Copy the last synced watch progress into Zepimon manually. No cloud login is needed.', 13, palette.muted)]
        : [label(exportHint, 13, palette.muted)]),
      ...(linked ? [button('Retry upload', () => request('retry')),
        button('Stop uploads on this phone', () => request('stop'))] : []),
      label(storage.getItem(CLOUD_STATUS_KEY) || 'Link your account to upload progress to Supabase.', 13, palette.muted),
      label('Progress stays saved on your watch when offline. Open Zepimon on your phone after uploading.', 13, palette.muted)
    ])
  }
})
