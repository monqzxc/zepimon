import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve('zepimon-mobile')
const out = resolve('tmp/arcade-check')
mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9233', `--user-data-dir=${out}/chrome-${Date.now()}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let target
  for (let i = 0; i < 60; i++) {
    try { target = await (await fetch('http://127.0.0.1:9233/json/new?about:blank', { method: 'PUT' })).json(); break } catch { await pause(250) }
  }
  assert.ok(target, 'Chrome debugger started')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let sequence = 0
  const pending = new Map()
  const errors = []
  let fileChooser
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.method === 'Page.fileChooserOpened') fileChooser = message.params
    if (message.id) {
      const waiting = pending.get(message.id)
      pending.delete(message.id)
      message.error ? waiting?.reject(message.error) : waiting?.resolve(message.result)
    }
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result?.value
  }
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100) }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText'))
  }
  const body = () => evaluate('document.body.innerText')
  const visible = `e => e.getClientRects().length > 0`
  const click = async title => {
    const selector = `[...document.querySelectorAll('[role="button"]')].filter(${visible}).find(e=>e.innerText.trim()===${JSON.stringify(title)})`
    await waitFor(`!!(${selector})`)
    await evaluate(`(${selector}).click()`); await pause(100)
  }
  const tab = async title => {
    await evaluate(`([...document.querySelectorAll('[role="tab"]')].find(e=>e.innerText.trim().endsWith(${JSON.stringify(title)}))).click()`)
    await pause(250)
  }
  const input = async (label, value) => {
    await evaluate(`(()=>{ const e=document.querySelector('[aria-label="${label}"]');
      Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    await pause(100)
  }
  const screenshot = async name => {
    await pause(250)
    const result = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(resolve(out, name + '.png'), Buffer.from(result.data, 'base64'))
  }

  const { species } = await import('../zepimon-mobile/src/generated/catalog.js')
  const stored = () => evaluate(`JSON.parse(localStorage.getItem('zepimon-mobile-v1'))`)
  const scrollTo = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`)
    await pause(100)
  }
  await call('Runtime.enable'); await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await call('Page.navigate', { url: 'http://127.0.0.1:8092/' })
  await waitFor(`document.body.innerText.includes('A fresh page')`)
  await tab('Play'); await screenshot('arcade')
  await click('Play Pokemon Quiz'); await click('Start quiz')
  await screenshot('quiz')
  for (let question = 0; question < 10; question++) {
    const src = await evaluate(`document.querySelector('[aria-label="Mystery Pokemon silhouette"] img')?.src`)
    assert.ok(src, 'Quiz sprite is present')
    const id = Number(src.match(/pokemon\/(\d+)\./)?.[1])
    const answer = Object.keys(species).find(name => species[name].id === id)
    assert.ok(answer, 'Quiz uses a bundled Pokemon image')
    await click(answer)
    assert.ok((await body()).includes('You got it!'))
    await click(question === 9 ? 'See quiz results' : 'Next Pokemon')
  }
  await waitFor(`document.body.innerText.includes('Your best score is saved')`)
  assert.equal((await stored()).arcadeScores.quiz, 10)
  assert.equal((await stored()).journal, null, 'Quiz works without importing or changing the Dex')
  await screenshot('quiz-complete')
  await click('Back to arcade'); await click('Play Berry Catch')
  await screenshot('berries-ready')
  await click('Start Berry Catch')
  await scrollTo('[aria-label^="Garden plot 5,"]')
  await screenshot('berries-playing')
  await click('Pause game')
  const pausedText = await body()
  await pause(800)
  assert.equal(await body(), pausedText, 'Paused timer is frozen')
  await click('Resume Berry Catch')
  await tab('Dex'); await pause(500); await tab('Play')
  assert.ok((await body()).includes('Resume Berry Catch'), 'Switching tabs pauses the timer')
  await click('Resume Berry Catch')
  await evaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange'))`)
  await waitFor(`document.body.innerText.includes('Resume Berry Catch')`)
  await evaluate(`delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'))`)
  await click('Resume Berry Catch')
  for (let tick = 0; tick < 280; tick++) {
    if ((await body()).includes('Basket complete!')) break
    await evaluate(`document.querySelector('[aria-label$=", berry ready"]')?.click()`)
    await pause(120)
  }
  assert.ok((await body()).includes('Basket complete!'))
  const score = (await stored()).arcadeScores.berries
  assert.ok(score > 10 && score <= 20, 'Berry Catch finishes and saves catches')
  await screenshot('berries-complete')
  await click('Back to arcade')
  await tab('Journal'); await call('Page.reload')
  await waitFor(`document.body.innerText.includes('A fresh page')`)
  await tab('Play')
  assert.equal((await stored()).arcadeScores.quiz, 10)
  assert.equal((await stored()).arcadeScores.berries, score)
  await click('Play Memory Match')
  assert.ok((await body()).includes('at least two acquired'), 'Memory Match retains its import requirement')
  await click('Back to arcade')
  await tab('Import')
  await input('Paste Zepimon export JSON', readFileSync(resolve(root, 'examples/demo-export.json'), 'utf8'))
  await click('Check pasted JSON'); await click('Use this export')
  await waitFor(`document.body.innerText.includes('Journal imported.')`)
  assert.equal((await stored()).arcadeScores.quiz, 10)
  assert.equal((await stored()).arcadeScores.berries, score)
  assert.equal((await stored()).progress.runs.length, 4)
  await tab('Play'); await click('Play Memory Match')
  assert.ok((await body()).includes('Tap a card to begin'))
  await click('Back to arcade')
  await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 700, deviceScaleFactor: 1, mobile: true })
  await click('Play Berry Catch'); await scrollTo('[aria-label^="Garden plot 5,"]')
  await screenshot('berries-small')
  assert.ok(await evaluate('document.documentElement.scrollWidth <= 320'), 'Garden fits a small phone')
  assert.ok(await evaluate(`[...document.querySelectorAll('[aria-label^="Garden plot "]')].every(e=>e.getBoundingClientRect().width>=48&&e.getBoundingClientRect().height>=48)`), 'Garden plots are comfortable touch targets')
  assert.deepEqual(errors, [], 'No JavaScript runtime errors')
  console.log('PASS: complete quiz and Berry Catch; manual/tab/background pause; reload/import score persistence; Memory Match availability; 320px garden. Screenshots: tmp/arcade-check')
} finally {
  socket?.close()
  chrome.kill()
}

