const fs = require('node:fs')
const path = require('node:path')
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'phone-preview.json'), 'utf8'))
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const css = style => Object.entries(style || {}).map(([key, value]) => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + ':' + value).join(';')
function render(node) {
  if (typeof node !== 'object') return escape(node)
  const props = node.props
  const style = ' style="' + escape(css(props.style)) + '"'
  const children = node.children.map(render).join('')
  if (node.component === 'Image') {
    let src = props.src
    if (src.startsWith('https:')) {
      const id = path.basename(src, '.png')
      const file = path.join(__dirname, '../hatdog-app/data/original-sprites', id + (src.includes('/shiny/') ? '-shiny' : '') + '.png')
      if (fs.existsSync(file)) src = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64')
    }
    return '<img' + style + ' src="' + escape(src) + '" width="' + props.width + '" height="' + props.height + '" alt="' + escape(props.alt) + '">'
  }
  if (node.component === 'Button') return '<button' + style + '>' + escape(props.label) + '</button>'
  if (node.component === 'TextInput') return '<label style="display:block;font:14px monospace">' + escape(props.label) + '<input style="display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:10px" placeholder="' + escape(props.placeholder) + '"></label>'
  return '<' + (node.component === 'Text' ? 'span' : 'div') + style + '>' + children + '</' + (node.component === 'Text' ? 'span' : 'div') + '>'
}
const panels = [['Pokedex · 390px', data.dex, 390], ['Pokedex · 320px', data.dex, 320], ['Journeys · 390px', data.journeys, 390]]
fs.writeFileSync(path.join(__dirname, 'phone-preview.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#c4d3d8;font-family:monospace}main{display:flex;gap:20px}section{flex-shrink:0}h2{font-size:16px}button{font-family:inherit;cursor:pointer}</style><p>Desktop layout preview · simulated data · Zepp rendering still requires device verification</p><main>' + panels.map(([title, tree, width]) => '<section style="width:' + width + 'px"><h2>' + title + '</h2>' + render(tree) + '</section>').join('') + '</main>')
