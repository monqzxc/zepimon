// The themes' colors, as plain data so tests can check them (tests/palettes.test.js). src/theme.ts picks the active one.
//
// Three themes, each in light and dark: Gengar (ghostly violet, with its red eyes as the second accent), Deoxys
// (orange-red and teal, from space) and Pikachu (electric yellow, red cheeks, brown stripes).
// Every text color keeps 4.5:1 on the page, cards, sunken areas and its accent tint, and on every type tint; the
// test lists the exact pairs. edge is the theme's accent, for text and fills (the name comes from the first, teal
// theme), with onEdge on it, and mint is its soft tint. alt is the second accent, which sets one thing apart from the
// first, like the Expeditions tile. brand is the gradient on banners and main buttons, with onBrand on it. The tab*
// colors are the floating tab bar's. star is for large glyphs only.

export type Mode = 'light' | 'dark'
export type ThemeName = 'gengar' | 'deoxys' | 'pikachu'
export const themeNames: ThemeName[] = ['gengar', 'deoxys', 'pikachu']

// Official type colors, darkened where needed so white badge text stays readable (4.5:1).
export const typeColors: Record<string, string> = {
  normal: '#747674', fire: '#e42829', water: '#2574d9', electric: '#937100', grass: '#358722', ice: '#268097',
  fighting: '#ba5d00', poison: '#9141cb', ground: '#915121', flying: '#557a9e', psychic: '#d53a6c', bug: '#707c13',
  rock: '#7a765a', ghost: '#704170', dragon: '#5060e1', dark: '#624d4e', steel: '#4a7c8e', fairy: '#ae52ae'
}

type Colors = {
  bg: string, panel: string, sunken: string, line: string, mint: string, mintLine: string, track: string,
  ink: string, muted: string, edge: string, onEdge: string, alt: string, gold: string, star: string, danger: string, success: string,
  altTint: string, goldTint: string, dangerTint: string, brandFrom: string, brandTo: string, onBrand: string, glow: string, scrim: string,
  tabTop: string, tabBottom: string, tabHalo: string, tabRim: string, tabPill: string, tabShadow: string, tabInk: string, tabActive: string, tabMark: string
}
export type Palette = Colors & { brand: string }
const palette = (colors: Colors): Palette => ({ ...colors, brand: `linear-gradient(135deg, ${colors.brandFrom} 0%, ${colors.brandTo} 100%)` })

// Shared by every theme: notices, stars, errors and success read the same everywhere, tuned once per mode.
const lightStatus = { gold: '#9A5800', star: '#C27C00', danger: '#B83232', success: '#1B6E33', goldTint: '#FFF1D6', dangerTint: '#FBE4E4' }
const darkStatus = { gold: '#E9A84A', star: '#F2B630', danger: '#F27878', success: '#5FD07E', goldTint: '#3A2C14', dangerTint: '#3A1E22' }
const darkTab = { tabHalo: 'rgba(0, 0, 0, 0.35)', tabRim: 'rgba(255, 255, 255, 0.1)', tabShadow: 'rgba(0, 0, 0, 0.45)', glow: 'rgba(0, 0, 0, 0.45)', scrim: 'rgba(0, 0, 0, 0.6)' }

export const themes: Record<ThemeName, Record<Mode, Palette>> = {
  gengar: {
    light: palette({ ...lightStatus,
      bg: '#F2EFF8', panel: '#FFFFFF', sunken: '#F7F5FB', line: '#E0DAEC', mint: '#EEE7FB', mintLine: '#D9CCF4', track: '#E6E0F0',
      ink: '#211A33', muted: '#5E5672', edge: '#6A3FC8', onEdge: '#FFFFFF', alt: '#B32D55', altTint: '#FBE3EA',
      brandFrom: '#7B4FD6', brandTo: '#45269A', onBrand: '#FFFFFF', glow: 'rgba(98, 66, 200, 0.3)', scrim: 'rgba(20, 12, 36, 0.45)',
      tabTop: '#F7F4FF', tabBottom: '#E7E0FB', tabHalo: 'rgba(118, 92, 205, 0.18)', tabRim: 'rgba(255, 255, 255, 0.95)', tabPill: 'rgba(98, 66, 200, 0.16)',
      tabShadow: 'rgba(94, 66, 180, 0.16)', tabInk: '#6B5F8E', tabActive: '#4527A8', tabMark: '#8A6FD0' }),
    dark: palette({ ...darkStatus, ...darkTab,
      bg: '#110D1A', panel: '#1C1628', sunken: '#151020', line: '#302845', mint: '#2A1F45', mintLine: '#3D2E63', track: '#2C2440',
      ink: '#EEEAF7', muted: '#A99FC0', edge: '#B59CFF', onEdge: '#1A0B33', alt: '#FF85A8', altTint: '#3D1A2A',
      brandFrom: '#6A3FC8', brandTo: '#3A1F80', onBrand: '#FFFFFF',
      tabTop: '#262040', tabBottom: '#1C1730', tabPill: 'rgba(187, 166, 255, 0.2)', tabInk: '#A99DD3', tabActive: '#D9CCFF', tabMark: '#A98EF0' })
  },
  deoxys: {
    light: palette({ ...lightStatus,
      bg: '#F4F1EF', panel: '#FFFFFF', sunken: '#F9F6F4', line: '#E6DEDA', mint: '#FCE8E1', mintLine: '#F5CDBF', track: '#ECE4E0',
      ink: '#2A1D1A', muted: '#6A5953', edge: '#B03A1C', onEdge: '#FFFFFF', alt: '#11707F', altTint: '#DDF1F4',
      brandFrom: '#C2401F', brandTo: '#14707F', onBrand: '#FFFFFF', glow: 'rgba(176, 58, 28, 0.28)', scrim: 'rgba(30, 14, 10, 0.45)',
      tabTop: '#FFF6F2', tabBottom: '#FBE2D8', tabHalo: 'rgba(176, 58, 28, 0.16)', tabRim: 'rgba(255, 255, 255, 0.95)', tabPill: 'rgba(194, 64, 31, 0.14)',
      tabShadow: 'rgba(150, 50, 20, 0.16)', tabInk: '#7A4A3E', tabActive: '#86260F', tabMark: '#E06A45' }),
    dark: palette({ ...darkStatus, ...darkTab,
      bg: '#0B0F17', panel: '#151B26', sunken: '#10151E', line: '#26303F', mint: '#3A1E16', mintLine: '#5A2E20', track: '#232C3A',
      ink: '#ECEFF5', muted: '#A2AABA', edge: '#FF8A5C', onEdge: '#2A0E04', alt: '#4FD3E3', altTint: '#123540',
      brandFrom: '#C2401F', brandTo: '#14687A', onBrand: '#FFFFFF',
      tabTop: '#1D2433', tabBottom: '#151A26', tabPill: 'rgba(255, 138, 92, 0.2)', tabInk: '#A9B0C2', tabActive: '#FFB08F', tabMark: '#FF8A5C' })
  },
  pikachu: {
    light: palette({ ...lightStatus,
      bg: '#FBF7EA', panel: '#FFFFFF', sunken: '#FDFAF1', line: '#EDE4C8', mint: '#FFF3C4', mintLine: '#F5DF8A', track: '#F1E9CF',
      ink: '#2B2410', muted: '#675C3E', edge: '#8A5A00', onEdge: '#FFFFFF', alt: '#B3322A', altTint: '#FCE3E0',
      brandFrom: '#FFD84A', brandTo: '#F5A524', onBrand: '#2B2000', glow: 'rgba(230, 160, 0, 0.35)', scrim: 'rgba(40, 30, 0, 0.4)',
      tabTop: '#FFFCEE', tabBottom: '#FCEFBF', tabHalo: 'rgba(214, 160, 0, 0.22)', tabRim: 'rgba(255, 255, 255, 0.95)', tabPill: 'rgba(240, 190, 0, 0.28)',
      tabShadow: 'rgba(170, 120, 0, 0.18)', tabInk: '#6E5B22', tabActive: '#4F3B00', tabMark: '#E0A800' }),
    dark: palette({ ...darkStatus, ...darkTab, gold: '#F0B050', star: '#FFD43B', success: '#6BD889',
      bg: '#14120A', panel: '#201C10', sunken: '#18150C', line: '#383120', mint: '#3A3112', mintLine: '#55471A', track: '#332C18',
      ink: '#F5F0DE', muted: '#B5AB8C', edge: '#FFD43B', onEdge: '#2B2000', alt: '#FF8A7A', altTint: '#3E1E1A',
      brandFrom: '#FFD84A', brandTo: '#F5A524', onBrand: '#2B2000',
      tabTop: '#2B2614', tabBottom: '#1F1B0E', tabPill: 'rgba(255, 212, 59, 0.18)', tabInk: '#C9BC8E', tabActive: '#FFE27A', tabMark: '#FFD43B' })
  }
}

// Card backgrounds in each type's color. Light: the same pale tints in every theme. Dark: a quarter of the type color
// over the theme's dark panel.
export const lightTints: Record<string, string> = {
  normal: '#f0f0f0', fire: '#fbdddd', water: '#ddebfc', electric: '#fef5d6', grass: '#e0f0dd', ice: '#e0f7fd',
  fighting: '#ffebd6', poison: '#ede1f7', ground: '#ede3db', flying: '#ebf4fc', psychic: '#fce1ea', bug: '#edf0da',
  rock: '#f2f1eb', ghost: '#e8e1e8', dragon: '#e3e6fa', dark: '#e6e3e3', steel: '#e6f0f4', fairy: '#fce8fc'
}
const mix = (from: string, to: string, amount: number) => '#' + [1, 3, 5].map(i =>
  Math.round(parseInt(from.slice(i, i + 2), 16) * (1 - amount) + parseInt(to.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('')
export function typeTintsFor(palette: Palette, mode: Mode): Record<string, string> {
  if (mode === 'light') return lightTints
  return Object.fromEntries(Object.entries(typeColors).map(([type, color]) => [type, mix(palette.panel, color, 0.26)]))
}
