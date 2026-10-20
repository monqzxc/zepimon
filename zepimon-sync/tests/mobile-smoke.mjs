// Run from the repo root after serving zepimon-mobile/.expo/sync-export on 8093.
// Uses isolated, mocked auth/cloud responses; sends no email and touches no live records.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const out = resolve('zepimon-mobile/.expo/cloud-check')
mkdirSync(out, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9235',
  `--user-data-dir=${out}/browser-${Date.now()}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let target
  for (let i = 0; i < 60; i++) {
    try { target = await (await fetch('http://127.0.0.1:9235/json/new?about:blank', { method: 'PUT' })).json(); break }
    catch { await pause(200) }
  }
  assert.ok(target)
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let sequence = 0
  const pending = new Map()
  const errors = []
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.id) {
      const next = pending.get(message.id); pending.delete(message.id)
      message.error ? next?.reject(message.error) : next?.resolve(message.result)
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
  const click = async label => {
    const selector = `[...document.querySelectorAll('[role="button"]')].find(e => e.getClientRects().length && e.innerText.trim() === ${JSON.stringify(label)})`
    await waitFor(`!!(${selector}) && (${selector}).getAttribute('aria-disabled') !== 'true'`)
    await evaluate(`(${selector}).click()`)
  }
  const input = async (label, value) => {
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="${label}"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event('input',{bubbles:true}));})()`)
    await pause(100)
  }
  const demo = JSON.parse(readFileSync('zepimon-mobile/examples/demo-export.json', 'utf8'))
  await call('Runtime.enable'); await call('Page.enable')
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.testCloud = { offline:false, linked:false, journal:${JSON.stringify(demo)}, requests:[] };
    const realFetch = window.fetch.bind(window);
    window.fetch = async (url, options={}) => {
      if (!String(url).includes('.supabase.co')) return realFetch(url, options);
      const state = window.testCloud; state.requests.push(String(url));
      if (state.offline) throw new TypeError('Offline');
      const body = options.body ? JSON.parse(options.body) : {};
      let value;
      if (String(url).includes('/auth/v1/otp')) value = {};
      else if (String(url).includes('/auth/v1/verify')) {
        const id = body.email.startsWith('second') ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111';
        const exp = Math.floor(Date.now()/1000)+3600;
        const token = btoa(JSON.stringify({alg:'HS256',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:id,exp,role:'authenticated'}))+'.test';
        value = {access_token:token,refresh_token:'local-test-only',token_type:'bearer',expires_in:3600,expires_at:exp,
          user:{id,email:body.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}};
      } else if (String(url).includes('/auth/v1/logout')) return new Response(null,{status:204});
      else if (String(url).endsWith('/zepimon_pull')) value = {linked:state.linked,journal:state.linked?state.journal:null,updatedAt:new Date().toISOString()};
      else if (String(url).endsWith('/zepimon_create_link')) value = {code:'abcdef012345abcdef012345',expiresAt:new Date(Date.now()+600000).toISOString()};
      else if (String(url).endsWith('/zepimon_unlink')) {state.linked=false;value=null;}
      else throw new Error('Unexpected mocked request: '+url);
      return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
    };
  ` })
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await call('Page.navigate', { url: 'http://127.0.0.1:8093/' })
  await waitFor(`document.body.innerText.includes('A fresh page')`)
  await click('Sync my journal')
  await waitFor(`!!document.querySelector('[aria-label="Email address"]')`)
  await input('Email address', 'test@example.test'); await click('Send sign-in code')
  await waitFor(`!!document.querySelector('[aria-label="Email sign-in code"]')`)
  await input('Email sign-in code', '123456'); await click('Sign in')
  await waitFor(`document.body.innerText.includes('Create linking code')`)
  await click('Create linking code')
  await waitFor(`document.body.innerText.includes('abcd-ef01-2345-abcd-ef01-2345')`)
  const screenshot = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(resolve(out, 'link-account.png'), Buffer.from(screenshot.data, 'base64'))
  await evaluate('window.testCloud.linked=true')
  await click('Sync now')
  await waitFor(`document.body.innerText.includes('Your watch progress is up to date')`)
  const saved = () => evaluate(`JSON.parse(localStorage.getItem('zepimon-mobile-v1'))`)
  assert.equal((await saved()).progress.runs.length, 4)
  assert.ok((await saved()).journal.snapshot.dex['Shiny Bulbasaur'])
  await click('Sync now'); await pause(300)
  assert.equal((await saved()).progress.runs.length, 4)
  const good = JSON.stringify(await saved())
  await evaluate('window.testCloud.offline=true'); await click('Sync now')
  await waitFor(`document.body.innerText.includes('Could not reach your cloud journal')`)
  assert.equal(JSON.stringify(await saved()), good)
  await evaluate('window.testCloud.offline=false')
  await click('Sign out')
  await waitFor(`!!document.querySelector('[aria-label="Email address"]')`)
  await input('Email address', 'second@example.test'); await click('Send sign-in code')
  await waitFor(`!!document.querySelector('[aria-label="Email sign-in code"]')`)
  await input('Email sign-in code', '123456'); await click('Sign in')
  await waitFor(`document.body.innerText.includes('belongs to another account')`)
  assert.equal(JSON.stringify(await saved()), good)
  assert.deepEqual(errors, [])
  console.log('Cloud UI smoke passed: email-code flow, pairing display, normal/shiny download, run deduplication, offline retention and account isolation.')
} finally { socket?.close(); chrome.kill() }
