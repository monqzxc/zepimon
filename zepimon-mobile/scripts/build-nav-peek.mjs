// Draws the Pokemon that peek over the tab bar (src/TabBar.tsx) and the theme cards (src/app/settings/theme.tsx):
// Gengar, Pikachu, Deoxys and Rayquaza, all in one cartoon style: a wide head with a thick dark outline, gradient skin,
// a shine on the forehead, and two paws gripping the edge at the sides of the head.
//
// Usage: node scripts/build-nav-peek.mjs   (needs Chrome or Edge; set CHROME to its path if it is not found)
//
// Writes transparent PNGs at two pixels per grid unit. Each Pokemon's four layers share a 120 x 100 grid so they stack
// exactly: three faces of the head (drawn behind the edge) and the paws (drawn in front of it). Row 72 of that grid is
// where the edge meets the art; below the cheeks the head tapers so the bar's rounded shoulders hide it. Gengar's go
// to assets/nav/ (body-grin, body-blink, body-boo, paws), the others' to assets/nav/<pokemon>/ (head-idle, head-blink,
// head-boo, paws). The Pokemon floating over the Adventure button are cut from illustrations instead; see
// scripts/build-nav-poses.py.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const NAV = fileURLToPath(new URL('../assets/nav/', import.meta.url))
const WIDTH = 240
const ROWS = 100

const svg = (defs, ink, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 ${ROWS}" width="${WIDTH}" height="${ROWS * 2}"><defs>${defs}</defs>
<g stroke="${ink}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`
const mirror = body => `<g transform="translate(120 0) scale(-1 1)">${body}</g>`
const both = body => body + mirror(body)
const skin = (id, [top, middle, bottom]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".75" stop-color="${middle}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`
// Each paw tilts outward to follow the bar's shoulder, with two toe lines. at: how far in from the grid's sides
// (Gengar's sit at the very sides, under its wide cheeks).
const pawsOf = (fill, at = 0, shine = .22, extra = '') => {
  const paw = `<path fill="${fill}" d="M6.5,74.5 C4.5,67 9,61 16,61 C23,61 28,65 27.5,71.5 C27,75.5 24.5,77.5 21,77.5 L10,77.5 C8.2,77.5 7,76.4 6.5,74.5 Z"/>
  <ellipse cx="13" cy="65" rx="3.5" ry="1.6" fill="#fff" opacity="${shine}" stroke="none"/>
  <path fill="none" stroke-width="1.8" d="M13.5,73 L13.5,77.5 M20,72.5 L20,77.5"/>${extra}`
  return both(`<g transform="translate(${at} 0) rotate(-12 17 70)">${paw}</g>`)
}

// Gengar: ears, the spiky crest and the cheeks, narrowed red eyes under angry brows and a one-fang grin.
const gengarInk = '#36244E'
const gengarGrin = `<path fill="none" stroke-width="2" d="M52,67.5 Q60,72 68,67.5"/>
  <path fill="#fff" stroke-width="1.2" d="M55.2,68.9 L56.6,71.6 L58,69.8 Z"/>`
const gengar = {
  out: '', names: ['body-grin', 'body-blink', 'body-boo', 'paws'], ink: gengarInk,
  defs: `<linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C80CE"/><stop offset=".75" stop-color="#7457A6"/><stop offset="1" stop-color="#6A4F99"/></linearGradient>
  <radialGradient id="eye" cx="0.5" cy="0.25" r="0.85"><stop offset="0" stop-color="#FFA8A6"/><stop offset="1" stop-color="#E7506A"/></radialGradient>`,
  head: `<path fill="url(#skin)" d="M34,100 L30,81 C21,79 15,76 13.5,71 C12,64 13,57 18,52 C15,44 11,35 8.5,27.5 Q7.5,24 11,24.5 C20,26 31,28 39,30.5
    Q42.5,24 45.5,20.5 Q48.5,24 51,27 Q53.5,19 56.5,14 Q60,19.5 62.5,25 Q65.5,21 69,18 Q71,21.5 72.5,25 C81,20 91,14 98,9.5 Q101.5,7.5 101.5,11.5
    C102.5,24 103,37 103,49 C107.5,55 108,64 106.5,71 C105,76 99,79 90,81 L86,100 Z"/>
  <path fill="#5D4488" stroke="none" d="M12.5,28 C19,29.5 26,31 32,32.3 L23,45.5 C19.5,40 15.5,34 12.5,28 Z"/>
  <path fill="#5D4488" stroke="none" d="M98.8,13.5 C99.3,22 99.7,31 99.4,40 L86,25.5 C90,20.5 94.5,16.5 98.8,13.5 Z"/>
  <ellipse cx="46" cy="37.5" rx="8.5" ry="3.6" fill="#fff" opacity=".22" stroke="none" transform="rotate(-12 46 37.5)"/>`,
  faces: {
    grin: `<path fill="url(#eye)" stroke-width="2.2" d="M28,50 L47,55.5 C47,61 43,65 37.5,64.5 C32,64 28.5,58 28,50 Z"/>
  <path fill="url(#eye)" stroke-width="2.2" d="M92,50 L73,55.5 C73,61 77,65 82.5,64.5 C88,64 91.5,58 92,50 Z"/>
  <path fill="none" stroke-width="3.4" d="M26.5,48.4 L48.5,55 M93.5,48.4 L71.5,55"/>
  <ellipse cx="41" cy="59.6" rx="3.1" ry="3.7" fill="#2B1838" stroke="none"/><ellipse cx="79" cy="59.6" rx="3.1" ry="3.7" fill="#2B1838" stroke="none"/>
  <circle cx="39.8" cy="58" r="1.15" fill="#fff" stroke="none"/><circle cx="77.8" cy="58" r="1.15" fill="#fff" stroke="none"/>${gengarGrin}`,
    blink: `<path fill="${gengarInk}" stroke-width="2" d="M27.5,49.6 L48,55.6 C44.5,60 34,58.6 27.5,49.6 Z"/>
  <path fill="${gengarInk}" stroke-width="2" d="M92.5,49.6 L72,55.6 C75.5,60 86,58.6 92.5,49.6 Z"/>${gengarGrin}`,
    // Wide round eyes and an "o" mouth, shown as it pops up on a new tab.
    boo: `<ellipse cx="38" cy="55.5" rx="8" ry="8.6" fill="url(#eye)" stroke-width="2.2"/><ellipse cx="82" cy="55.5" rx="8" ry="8.6" fill="url(#eye)" stroke-width="2.2"/>
  <circle cx="38.6" cy="56.5" r="3.3" fill="#2B1838" stroke="none"/><circle cx="81.4" cy="56.5" r="3.3" fill="#2B1838" stroke="none"/>
  <circle cx="37.3" cy="54.9" r="1.3" fill="#fff" stroke="none"/><circle cx="80.1" cy="54.9" r="1.3" fill="#fff" stroke="none"/>
  <path fill="none" stroke-width="2.6" d="M28,44.5 Q33,41.5 39,43 M92,44.5 Q87,41.5 81,43"/>
  <ellipse cx="60" cy="69" rx="3.4" ry="3" fill="#4A1F3E" stroke-width="2"/>`
  },
  paws: pawsOf('url(#skin)')
}

// Pikachu, round and chibi: short ears pointing out with black tips, big shiny eyes, pink cheeks, a tiny nose and a
// "w" smile.
const pikachuInk = '#2E1C0C'
const pikachuEar = `<path fill="url(#skin)" d="M24,41 C16,35 8,27 4,15.5 Q2.8,11.4 7,12.4 C19,15 31,21 41,31.5 Z"/>
  <path fill="#24170E" stroke="none" d="M9,26 C6.6,22.6 5,19.2 4,15.5 Q2.8,11.4 7,12.4 C11.2,13.3 15.6,14.7 20,16.6 Z"/>
  <path fill="none" stroke-width="2.2" d="M9,26 L20,16.6"/>
  <path fill="none" d="M24,41 C16,35 8,27 4,15.5 Q2.8,11.4 7,12.4 C19,15 31,21 41,31.5"/>`
const pikachuCheeks = both(`<ellipse cx="25.5" cy="60" rx="6.6" ry="5.6" fill="#F26D8C" stroke-width="2"/>
  <ellipse cx="23.6" cy="58" rx="2.2" ry="1.3" fill="#fff" opacity=".45" stroke="none"/>`)
const pikachuNose = `<path fill="${pikachuInk}" stroke-width="1" d="M58.2,56.6 L61.8,56.6 L60,58.9 Z"/>`
const pikachuSmile = `<path fill="none" stroke-width="2" d="M52,60.8 Q56,65.6 60,61.2 Q64,65.6 68,60.8"/>`
const pikachuEye = (r = 1) => both(`<ellipse cx="40.5" cy="51.5" rx="${6.8 * r}" ry="${7.4 * r}" fill="#1A120B" stroke-width="1.6"/>
  <circle cx="${40.5 - 2.4 * r}" cy="${51.5 - 2.8 * r}" r="${2.8 * r}" fill="#fff" stroke="none"/>
  <circle cx="${40.5 + 2.6 * r}" cy="${51.5 + 3.2 * r}" r="${1.3 * r}" fill="#fff" stroke="none"/>`)
const pikachu = {
  out: 'pikachu/', names: ['head-idle', 'head-blink', 'head-boo', 'paws'], ink: pikachuInk,
  defs: skin('skin', ['#FFEA5C', '#FFD21F', '#F2BE10']),
  head: both(pikachuEar) + `<path fill="url(#skin)" d="M30,100 L28,84 C16,80 9.5,71 9.5,60 C9.5,42 31,28.5 60,28.5 C89,28.5 110.5,42 110.5,60
    C110.5,71 104,80 92,84 L90,100 Z"/>
  <ellipse cx="42" cy="35.5" rx="10" ry="3.6" fill="#fff" opacity=".4" stroke="none" transform="rotate(-10 42 35.5)"/>` + pikachuCheeks,
  faces: {
    grin: pikachuEye() + pikachuNose + pikachuSmile,
    // Happy shut eyes.
    blink: both(`<path fill="none" stroke-width="2.8" d="M34,53.5 Q40.5,46.5 47,53.5"/>`) + pikachuNose + pikachuSmile,
    // Bigger eyes and an open mouth with a tongue.
    boo: pikachuEye(1.12) + pikachuNose + `<path fill="#8A2A22" stroke-width="2" d="M54.5,61.5 Q60,60 65.5,61.5 Q65,69.5 60,69.5 Q55,69.5 54.5,61.5 Z"/>
  <path fill="#F27C82" stroke="none" d="M56.6,66.8 Q60,64.6 63.4,66.8 Q62,69 60,69 Q58,69 56.6,66.8 Z"/>`
  },
  paws: pawsOf('url(#skin)', 3, .45)
}

// Deoxys: the orange-red helmet sweeping out into two points, the teal face below it, a violet crystal down the middle
// and dark eye patches with pale pupils.
const deoxysInk = '#3A160E'
const deoxysCrystal = `<path fill="url(#gem)" stroke-width="2" d="M60,40 L65,53 L60,69 L55,53 Z"/>
  <path fill="#fff" opacity=".45" stroke="none" d="M60,43 L62.2,51 L60,52.6 Z"/>`
const deoxysEye = (open = 1) => both(`<path fill="#1C1420" stroke-width="2" d="M33,51 L51,56 C51,${60 + 3 * open} ${47 - open} ${64 + 2 * open} ${41 - open} ${63 + 2 * open} C35,${62 + open} 33,57 33,51 Z"/>`)
const deoxys = {
  out: 'deoxys/', names: ['head-idle', 'head-blink', 'head-boo', 'paws'], ink: deoxysInk,
  defs: skin('shell', ['#F58A5C', '#D9552F', '#BE4423']) + skin('face', ['#7FDCE4', '#45B4C2', '#3299A8']) +
    `<linearGradient id="gem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9A2F5"/><stop offset="1" stop-color="#7E4FC8"/></linearGradient>`,
  head: `<path fill="url(#shell)" d="M33,100 L31,82 C22,78 18,72 17,64 C12,60 6,52 4,45 Q3,41.5 7,42 C14,43 22,44 28,44.5
    C33,30 45,19 60,13 C75,19 87,30 92,44.5 C98,44 106,43 113,42 Q117,41.5 116,45 C114,52 108,60 103,64 C102,72 98,78 89,82 L87,100 Z"/>
  ${both('<path fill="none" stroke-width="2" opacity=".55" d="M9,46.5 C16,47.5 22,48 28,48.3"/>')}
  <path fill="url(#face)" d="M36,100 L35,80 C30,74 28,64 30,55 C32,48 40,43 50,41 Q60,39 70,41 C80,43 88,48 90,55 C92,64 90,74 85,80 L84,100 Z"/>
  <ellipse cx="46" cy="27.5" rx="7.5" ry="3.2" fill="#fff" opacity=".3" stroke="none" transform="rotate(-28 46 27.5)"/>` + deoxysCrystal,
  faces: {
    grin: deoxysEye() + both('<ellipse cx="44" cy="58.6" rx="2.5" ry="2.7" fill="#9BF0F5" stroke="none"/><circle cx="43.2" cy="57.6" r="1" fill="#fff" stroke="none"/>'),
    blink: both('<path fill="none" stroke-width="3" d="M34,54 Q42,59.5 51,57"/>'),
    boo: both(`<ellipse cx="42" cy="57" rx="8" ry="7.6" fill="#1C1420" stroke-width="2"/>
  <circle cx="42.8" cy="57.6" r="3.2" fill="#9BF0F5" stroke="none"/><circle cx="41.6" cy="56" r="1.2" fill="#fff" stroke="none"/>`)
  },
  paws: pawsOf('url(#shell)', 6, .3)
}

// Rayquaza, soft and chibi: tall leaf-shaped ears, a rounded head narrowing to its snout (below the edge), a big yellow
// ring on the forehead, and slanted black eye patches with yellow eyes.
const rayquazaInk = '#173A2E'
const rayquazaEye = (scale = 1) => both(`<path fill="#14221D" stroke-width="1.6" d="M24,48.5 C31,48.5 42,52 51,58 C52,64.5 48,69.6 41.2,69.6 C32.6,69.6 25.6,61.4 24,48.5 Z"/>
  <ellipse cx="41.4" cy="60.6" rx="${6.4 * scale}" ry="${7 * scale}" fill="url(#iris)" stroke-width="1.2"/>
  <ellipse cx="42.2" cy="61" rx="${2.6 / scale}" ry="${4.2 / scale}" fill="#101010" stroke="none"/>
  <circle cx="${39.8 - (scale - 1) * 4}" cy="${57.6 - (scale - 1) * 4}" r="1.7" fill="#fff" stroke="none"/>`)
const rayquazaClaws = `<g fill="#E9EDF5" stroke-width="1.5"><ellipse cx="10.5" cy="78.6" rx="2.3" ry="3.6"/><ellipse cx="16.4" cy="79.4" rx="2.3" ry="3.6"/>
  <ellipse cx="22.3" cy="78.6" rx="2.3" ry="3.6"/></g>`
const rayquaza = {
  out: 'rayquaza/', names: ['head-idle', 'head-blink', 'head-boo', 'paws'], ink: rayquazaInk,
  defs: skin('skin', ['#7DC4A6', '#529E80', '#43896C']) +
    `<linearGradient id="iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2D24E"/><stop offset="1" stop-color="#C99A1E"/></linearGradient>`,
  head: both(`<path fill="url(#skin)" d="M30,46 C24,34 21.6,18 24.6,4.4 Q25.6,1 28.6,2.8 C40,9.6 49,19.4 54,31 Z"/>
  <path fill="#3E8467" stroke="none" opacity=".55" d="M47.6,26 C42.6,18.6 36,12 29.4,7.6 C33,13 37,19.6 40,27.6 Z"/>`) +
    `<path fill="url(#skin)" d="M36,100 L38,86 C30,80 22,74 18,66 C12,55 14,42 26,35 C36,29.5 48,28 60,28 C72,28 84,29.5 94,35
    C106,42 108,55 102,66 C98,74 90,80 82,86 L84,100 Z"/>
  <ellipse cx="60" cy="43" rx="13.6" ry="12.6" fill="#EFCB45" stroke-width="1.6"/>
  <ellipse cx="60" cy="43.4" rx="9.6" ry="8.8" fill="url(#skin)" stroke-width="1.6"/>
  <ellipse cx="36" cy="38" rx="5.5" ry="2.2" fill="#fff" opacity=".3" stroke="none" transform="rotate(-28 36 38)"/>`,
  faces: {
    grin: rayquazaEye(),
    // The eye patches narrow to shut lids.
    blink: both('<path fill="#14221D" stroke-width="1.6" d="M24,53 C32,55 42,58.4 50.4,60.4 C45,64.4 31.6,62.6 24,53 Z"/>'),
    // Bigger eyes and a small round mouth just above the edge.
    boo: rayquazaEye(1.1) + '<ellipse cx="60" cy="68" rx="3.4" ry="3" fill="#2A1A1A" stroke-width="1.6"/>'
  },
  paws: pawsOf('url(#skin)', 6, .3, rayquazaClaws)
}

function chrome() {
  const candidates = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium']
  const found = candidates.find(path => path && existsSync(path))
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME to its path.')
  return found
}

const browser = chrome()
// Chrome refuses to run as root (as in a container) with its sandbox on.
const sandbox = process.getuid?.() === 0 ? ['--no-sandbox'] : []
const work = mkdtempSync(join(tmpdir(), 'nav-peek-'))
try {
  for (const pokemon of [gengar, pikachu, deoxys, rayquaza]) {
    const [grin, blink, boo, paws] = pokemon.names
    const layers = { [grin]: pokemon.head + pokemon.faces.grin, [blink]: pokemon.head + pokemon.faces.blink,
      [boo]: pokemon.head + pokemon.faces.boo, [paws]: pokemon.paws }
    mkdirSync(join(NAV, pokemon.out), { recursive: true })
    for (const [name, art] of Object.entries(layers)) {
      const page = join(work, `${name}.html`)
      writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${svg(pokemon.defs, pokemon.ink, art)}</body></html>`)
      const file = join(NAV, pokemon.out, `${name}.png`)
      execFileSync(browser, [...sandbox, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--default-background-color=00000000', `--window-size=${WIDTH},${ROWS * 2}`, `--screenshot=${file}`,
        pathToFileURL(page).href], { stdio: 'pipe' })
      console.log(`assets/nav/${pokemon.out}${name}.png`)
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
