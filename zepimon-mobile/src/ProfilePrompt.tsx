import { useRef, useState } from 'react'
import { useJournal } from './store'
import { allAdventures } from './adventures'
import { runKey } from './delete-adventure'
import { bestTimes, checkRun, levelName, levelOffer, newBest, withArticle } from './profile'
import type { Best, Level } from './profile'
import type { PhoneRun } from './phone-adventure'
import { ConfirmDialog } from './ConfirmDialog'
import { clock } from './running'

// What the runner profile (src/profile.ts) has to say about an adventure just saved, as one dialog at most: "Was this
// really you?" when it is much faster than usual, otherwise the level-up its records have earned. What it says is decided
// once, from how things stood when the adventure was saved, so a later change in the store never reopens or changes it.
// A flagged adventure that is kept opens no offer in the same save. The adventure is saved before any of this.
type Stage = { kind: 'flag', note: string } | { kind: 'offer', level: Level, current: Level, best: Best, label: string } | { kind: 'problem', message: string } | null

export function ProfilePrompt({ run, onDeleted }: { run: PhoneRun, onDeleted: () => void }) {
  const { progress, phoneRuns, profile, deletePhoneRun, setLevel, declineOffer } = useJournal()
  const [stage, setStage] = useState<Stage>(() => {
    const adventures = allAdventures(progress, phoneRuns)
    const key = runKey(run.family, run.record.finishedAt)
    const mine = adventures.find(item => item.id === run.id || runKey(item.family, item.record.finishedAt) === key)
    if (!mine) return null
    const verdict = checkRun(mine, adventures.filter(item => item !== mine), profile.level)
    if (!verdict.ok) return { kind: 'flag', note: verdict.note }
    // A level-up is offered only after a run that set a new best, never for records it did not touch.
    const best = bestTimes(adventures)
    const improved = newBest(best, bestTimes(adventures.filter(item => item !== mine)))
    const level = improved ? levelOffer(profile, best) : null
    return level && improved && profile.level ? { kind: 'offer', level, current: profile.level, best, label: `${improved.label} best: ${clock(improved.seconds)}` } : null
  })
  const close = () => setStage(null)
  const deleting = useRef(false)
  if (!stage) return null
  if (stage.kind === 'flag') {
    return <ConfirmDialog visible title="Was this really you?" confirm="Delete" cancel="Keep it" onCancel={close}
      body={`${stage.note} If it was a ride or a glitch, deleting it takes back its records, Pokemon, badges, permits, trail distance and Gym progress. This cannot be undone.`}
      onConfirm={() => {
        if (deleting.current) return
        deleting.current = true
        deletePhoneRun(run.id).then(onDeleted, error => {
          deleting.current = false
          setStage({ kind: 'problem', message: error instanceof Error ? error.message : 'This adventure could not be deleted.' })
        })
      }} />
  }
  if (stage.kind === 'problem') return <ConfirmDialog visible title="Not deleted" body={stage.message} cancel="OK" onCancel={close} />
  return <ConfirmDialog visible title="New personal best" confirm="Move up" cancel="Not now"
    body={`New ${stage.label}. That is ${withArticle(stage.level)} pace. Move up from ${levelName[stage.current]}?`}
    onCancel={() => { close(); declineOffer(stage.best).catch(() => {}) }}
    onConfirm={() => { close(); setLevel(stage.level).catch(() => {}) }} />
}
