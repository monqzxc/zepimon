import { useCallback, useEffect, useRef } from 'react'
import type { Direction } from './safari-zone'
import { STEP_MS, followPath, noInput, pressDirection, releaseDirection, stepDelay, takeInput } from './safari-view'
import type { Input } from './safari-view'

// Turns D-pad presses, held keys and tap routes into one walkOnce call at a time, at most once per STEP_MS. The screen
// keeps the game: walkOnce takes one step and says whether the trainer moved and whether a tap route should stop there.
export function useStepWalker(walkOnce: (direction: Direction) => { moved: boolean, stop: boolean }, walking: boolean) {
  const input = useRef<Input>(noInput)
  const lastStep = useRef(0)
  const latest = useRef(walkOnce)
  useEffect(() => { latest.current = walkOnce })

  // One step from the input queue. A press calls it straight away, so a fresh press moves at once.
  const step = useCallback(() => {
    if (performance.now() - lastStep.current < STEP_MS) return
    const taken = takeInput(input.current)
    input.current = taken.input
    if (!taken.direction) return
    const { moved, stop } = latest.current(taken.direction)
    if (stop) input.current = { ...input.current, path: [] }
    if (moved) lastStep.current = performance.now()
  }, [])
  // Whatever was held or planned when walking stopped (an encounter, the gate prompt, a pause) is dropped: the D-pad
  // unmounts mid-press and a key can be let go while nothing listens, so a release could otherwise be missed.
  useEffect(() => {
    if (!walking) { input.current = noInput; return }
    // While something is held or planned, the next step is timed to land right as the last glide ends, so walking is
    // even; with nothing to do it looks again every 50 ms.
    let timer: ReturnType<typeof setTimeout>
    const loop = () => {
      step()
      const { held, queued, path } = input.current
      timer = setTimeout(loop, held || queued || path.length ? Math.max(4, stepDelay(performance.now(), lastStep.current)) : 50)
    }
    timer = setTimeout(loop, 50)
    return () => clearTimeout(timer)
  }, [walking, step])

  return {
    press(direction: Direction) {
      if (!walking) return
      input.current = pressDirection(input.current, direction)
      step()
    },
    release(direction: Direction) { input.current = releaseDirection(input.current, direction) },
    follow(path: Direction[]) {
      input.current = followPath(input.current, path)
      step()
    },
    drop() { input.current = noInput }
  }
}
