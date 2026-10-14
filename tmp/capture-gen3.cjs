const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const project = path.resolve(__dirname, '../hatdog-app')
process.chdir(project)
let harness = fs.readFileSync('tests/adventure.cjs', 'utf8')
harness = harness.slice(0, harness.indexOf('page.build()\nconst click'))
if (harness.includes('page.build()')) throw new Error('Unexpected prefix')
harness = harness.replace('return { ...options, setProperty', 'return { _type: type, ...options, setProperty')
harness += `
const snapshots = []
const snapshot = name => snapshots.push({name, widgets: JSON.parse(JSON.stringify(page.widgets))})
page.build()
snapshot('Adventure menu')
page.show('new')
snapshot('New egg - generation')
page.show('choose')
snapshot('Choose a Pokemon')
page.start(0)
page.state.active.meters = 5520
page.state.active.steps = 7105
context.testNow += 3000000
page.refreshStats()
snapshot('Walking session')
page.show('finish')
snapshot('Finish confirmation')
page.state.dex.Bulbasaur = {meters: 5520, steps: 7105, finishedAt: '2026-10-14T00:00:00Z'}
page.openDex('Bulbasaur')
snapshot('Pokedex normal')
page.dexShiny = true
page.render()
snapshot('Pokedex locked shiny')
page.show('dex')
snapshot('Pokedex list')
const titleWidgets=[]
const titleContext = vm.createContext({
Page(page) {page.build()}, Distance,
widget:{TEXT:1,BUTTON:2,IMG:3,FILL_RECT:4},align:{CENTER_H:1},prop:{TEXT:1,MORE:2},text_style:{NONE:0,WRAP:1},
createWidget(type,options){const result={_type:type,...options,setProperty(prop,value){if(prop===1)this.text=value;else Object.assign(this,value)}};titleWidgets.push(result);return result},
push(){}, console
})
vm.runInContext(fs.readFileSync('page/index.js','utf8').replace(/^import .*\\r?\\n/gm,''),titleContext)
snapshots.unshift({name:'Start screen',widgets:JSON.parse(JSON.stringify(titleWidgets))})
fs.writeFileSync('../tmp/gen3-widgets.json',JSON.stringify(snapshots,null,2))
console.log(snapshots.map(s=>s.name+': '+s.widgets.length+' widgets').join('\\n'))
`
vm.runInNewContext(harness, {require,console}, {filename:'preview-harness.cjs'})
