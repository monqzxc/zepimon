const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
process.chdir(path.resolve(__dirname, '../hatdog-app'))
let harness = fs.readFileSync('tests/adventure.cjs', 'utf8').replace(/\r\n/g, '\n')
harness = harness.slice(0, harness.indexOf('page.build()\nconst click'))
harness = harness.replace('return { ...options, setProperty', 'return { _type: type, ...options, setProperty')
harness += `
const snapshots = []
const snapshot = name => snapshots.push({ name, widgets: JSON.parse(JSON.stringify(page.widgets)) })
page.build()
page.state = JSON.parse(JSON.stringify(historyState))
page.show('history')
snapshot('History menu')
for (const metric of ['distance', 'elapsed', 'hatch']) {
  page.historyMetric = metric
  page.show('history-detail')
  snapshot(metric + ' personal best')
}
page.state.personalBests = {}
page.show('history-detail')
snapshot('No hatch record yet')
const longestName = Object.values(context.catalog.megaForms).flat().sort((a,b) => b.length-a.length)[0]
const longestRoute = routes.findIndex((r,i) => context.logic.megaChoices(i).includes(longestName))
page.historyMetric = 'elapsed'
page.state.personalBests.elapsed = { route: longestRoute, form: longestName, shiny: true, meters: 21000, elapsedSeconds: 360061, finishedAt: '2026-10-16T00:00:00Z' }
page.show('history-detail')
snapshot('Long name / over 99 hours')
fs.writeFileSync('../tmp/history-widgets.json', JSON.stringify(snapshots, null, 2))
`
vm.runInNewContext(harness, { require, console })
