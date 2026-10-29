import { useEffect, useState } from 'react'
import type { ImageSourcePropType } from 'react-native'
import { trailWalkers } from '../generated/trail-walkers.js'
import type { Direction } from './safari-zone'
import { buddyFrame } from './safari-view'
import { Frame } from './TileWorld'
import { PixelSprite } from './TeamPicker'
import { useReducedMotion } from './hooks'

const walkers = trailWalkers as Record<string, ImageSourcePropType>
const STEP_EVERY = 500

// A Pokemon's Emerald overworld sprite, the pixel art your buddy walks with: two steps in place facing south (toward
// you), north, west or east, from its strip in assets/trail (scripts/build-trail-walkers.py). still holds the first step,
// as reduced motion does. tint draws it as a solid silhouette. A form without overworld art (an egg, a Mega form) shows
// its PixelSprite instead.
export function OverworldSprite({ name, shiny = false, size, facing = 'south', still = false, tint }: {
  name: string, shiny?: boolean, size: number, facing?: Direction, still?: boolean, tint?: string
}) {
  const reduced = useReducedMotion()
  const moving = !still && !reduced
  const [step, setStep] = useState<0 | 1>(0)
  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => setStep(value => value ? 0 : 1), STEP_EVERY)
    return () => clearInterval(timer)
  }, [moving])
  const strip = walkers[(shiny ? 'Shiny ' : '') + name]
  if (!strip) return <PixelSprite name={name} shiny={shiny} size={size} tint={tint} />
  return <Frame strip={{ source: strip, frames: 8, width: 44, height: 44 }} frame={buddyFrame(facing, moving ? step : 0)} width={size} height={size} tint={tint} />
}
