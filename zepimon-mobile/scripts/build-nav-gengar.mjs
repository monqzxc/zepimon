// Draws the Gengar that peeks over the tab bar's active pill (src/TabBar.tsx).
//
// Usage: node scripts/build-nav-gengar.mjs   (needs Chrome or Edge; set CHROME to its path if it is not found)
//
// Writes transparent PNGs to assets/nav/ at two pixels per grid unit. Four share a 120 x 100 grid so they stack
// exactly: body-grin, body-blink and body-boo (the head, drawn behind the pill) and paws (drawn in front of it). Row 72
// of that grid is where the pill's top edge meets the art; below the cheeks the body tapers so the pill's rounded
// shoulders hide it. The Gengar floating over the Adventure button (float-grin, float-taunt) is cut from an illustration
// instead; see the note in src/TabBar.tsx.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const OUT = fileURLToPath(new URL('../assets/nav/', import.meta.url))
const WIDTH = 240
const ink = '#36244E'

const defs = `<defs>
  <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9C80CE"/><stop offset=".75" stop-color="#7457A6"/><stop offset="1" stop-color="#6A4F99"/></linearGradient>
  <radialGradient id="eye" cx="0.5" cy="0.25" r="0.85"><stop offset="0" stop-color="#FFA8A6"/><stop offset="1" stop-color="#E7506A"/></radialGradient>
</defs>`
const svg = (body, rows = 100) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 ${rows}" width="${WIDTH}" height="${rows * 2}">${defs}
<g stroke="${ink}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`

// Ears, the spiky crest and the cheeks, with a shine on the forehead.
const head = `<path fill="url(#skin)" d="M34,100 L30,81 C21,79 15,76 13.5,71 C12,64 13,57 18,52 C15,44 11,35 8.5,27.5 Q7.5,24 11,24.5 C20,26 31,28 39,30.5
    Q42.5,24 45.5,20.5 Q48.5,24 51,27 Q53.5,19 56.5,14 Q60,19.5 62.5,25 Q65.5,21 69,18 Q71,21.5 72.5,25 C81,20 91,14 98,9.5 Q101.5,7.5 101.5,11.5
    C102.5,24 103,37 103,49 C107.5,55 108,64 106.5,71 C105,76 99,79 90,81 L86,100 Z"/>
  <path fill="#5D4488" stroke="none" d="M12.5,28 C19,29.5 26,31 32,32.3 L23,45.5 C19.5,40 15.5,34 12.5,28 Z"/>
  <path fill="#5D4488" stroke="none" d="M98.8,13.5 C99.3,22 99.7,31 99.4,40 L86,25.5 C90,20.5 94.5,16.5 98.8,13.5 Z"/>
  <ellipse cx="46" cy="37.5" rx="8.5" ry="3.6" fill="#fff" opacity=".22" stroke="none" transform="rotate(-12 46 37.5)"/>`
const grin = `<path fill="none" stroke-width="2" d="M52,67.5 Q60,72 68,67.5"/>
  <path fill="#fff" stroke-width="1.2" d="M55.2,68.9 L56.6,71.6 L58,69.8 Z"/>`
const faces = {
  // Narrowed red eyes under angry brows, with a one-fang grin.
  grin: `<path fill="url(#eye)" stroke-width="2.2" d="M28,50 L47,55.5 C47,61 43,65 37.5,64.5 C32,64 28.5,58 28,50 Z"/>
  <path fill="url(#eye)" stroke-width="2.2" d="M92,50 L73,55.5 C73,61 77,65 82.5,64.5 C88,64 91.5,58 92,50 Z"/>
  <path fill="none" stroke-width="3.4" d="M26.5,48.4 L48.5,55 M93.5,48.4 L71.5,55"/>
  <ellipse cx="41" cy="59.6" rx="3.1" ry="3.7" fill="#2B1838" stroke="none"/><ellipse cx="79" cy="59.6" rx="3.1" ry="3.7" fill="#2B1838" stroke="none"/>
  <circle cx="39.8" cy="58" r="1.15" fill="#fff" stroke="none"/><circle cx="77.8" cy="58" r="1.15" fill="#fff" stroke="none"/>${grin}`,
  blink: `<path fill="${ink}" stroke-width="2" d="M27.5,49.6 L48,55.6 C44.5,60 34,58.6 27.5,49.6 Z"/>
  <path fill="${ink}" stroke-width="2" d="M92.5,49.6 L72,55.6 C75.5,60 86,58.6 92.5,49.6 Z"/>${grin}`,
  // Wide round eyes and an "o" mouth, shown as it pops up on a new tab.
  boo: `<ellipse cx="38" cy="55.5" rx="8" ry="8.6" fill="url(#eye)" stroke-width="2.2"/><ellipse cx="82" cy="55.5" rx="8" ry="8.6" fill="url(#eye)" stroke-width="2.2"/>
  <circle cx="38.6" cy="56.5" r="3.3" fill="#2B1838" stroke="none"/><circle cx="81.4" cy="56.5" r="3.3" fill="#2B1838" stroke="none"/>
  <circle cx="37.3" cy="54.9" r="1.3" fill="#fff" stroke="none"/><circle cx="80.1" cy="54.9" r="1.3" fill="#fff" stroke="none"/>
  <path fill="none" stroke-width="2.6" d="M28,44.5 Q33,41.5 39,43 M92,44.5 Q87,41.5 81,43"/>
  <ellipse cx="60" cy="69" rx="3.4" ry="3" fill="#4A1F3E" stroke-width="2"/>`
}
// Each paw tilts outward to follow the pill's shoulder, with two toe lines.
const paw = `<path fill="url(#skin)" d="M6.5,74.5 C4.5,67 9,61 16,61 C23,61 28,65 27.5,71.5 C27,75.5 24.5,77.5 21,77.5 L10,77.5 C8.2,77.5 7,76.4 6.5,74.5 Z"/>
  <ellipse cx="13" cy="65" rx="3.5" ry="1.6" fill="#fff" opacity=".22" stroke="none"/>
  <path fill="none" stroke-width="1.8" d="M13.5,73 L13.5,77.5 M20,72.5 L20,77.5"/>`
const paws = `<g transform="rotate(-12 17 70)">${paw}</g><g transform="translate(120 0) scale(-1 1) rotate(-12 17 70)">${paw}</g>`

function chrome() {
  const candidates = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium']
  const found = candidates.find(path => path && existsSync(path))
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME to its path.')
  return found
}

const browser = chrome()
const work = mkdtempSync(join(tmpdir(), 'nav-gengar-'))
mkdirSync(OUT, { recursive: true })
const layers = { ...Object.fromEntries(Object.entries(faces).map(([name, face]) => [`body-${name}`, [head + face, 100]])), paws: [paws, 100] }
try {
  for (const [name, [art, rows]] of Object.entries(layers)) {
    const page = join(work, `${name}.html`)
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${svg(art, rows)}</body></html>`)
    execFileSync(browser, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${WIDTH},${rows * 2}`, `--screenshot=${join(OUT, `${name}.png`)}`,
      pathToFileURL(page).href], { stdio: 'pipe' })
    console.log(`assets/nav/${name}.png`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
