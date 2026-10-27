import csv, json, re, urllib.request, concurrent.futures, time
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
ASSETS = ROOT / 'assets' / 'bip-5-unity' / 'pokemon'
ASSETS.mkdir(parents=True, exist_ok=True)
def rows(file):
    return list(csv.DictReader((DATA / file).open(encoding='utf-8')))
species = {int(r['id']): r for r in rows('pokemon_species.csv')}
names = {int(r['pokemon_species_id']): r['name'].replace(chr(0x2019), chr(39)) for r in rows('pokemon_species_names.csv') if r['local_language_id'] == '9'}
names[29], names[32] = 'Nidoran F', 'Nidoran M'
requested = '''Venusaur Charizard Blastoise Alakazam Gengar Kangaskhan Pinsir Gyarados Aerodactyl Mewtwo Ampharos Scizor Heracross Houndoom Tyranitar Blaziken Gardevoir Mawile Aggron Medicham Manectric Banette Absol Latias Latios Garchomp Lucario Abomasnow Beedrill Pidgeot Slowbro Steelix Sceptile Swampert Sableye Sharpedo Camerupt Altaria Glalie Salamence Metagross Rayquaza Lopunny Gallade Audino Diancie Clefable Victreebel Starmie Dragonite Meganium Feraligatr Skarmory Froslass Emboar Excadrill Scolipede Scrafty Eelektross Chandelure Chesnaught Delphox Greninja Pyroar Floette Malamar Barbaracle Dragalge Hawlucha Zygarde Drampa Falinks Raichu Chimecho Staraptor Heatran Darkrai Golurk Meowstic Crabominable Golisopod Magearna Zeraora Scovillain Glimmora Tatsugiri Baxcalibur'''.split()
requested_ids = {i for i,n in names.items() if n in requested}
assert len(requested_ids) == 87
allowed = set(range(1,494)) | requested_ids
for ident in list(allowed):
    while species[ident]['evolves_from_species_id']:
        ident = int(species[ident]['evolves_from_species_id'])
        allowed.add(ident)
children = {i:[] for i in allowed}
for ident in allowed:
    parent = species[ident]['evolves_from_species_id']
    if parent and int(parent) in allowed: children[int(parent)].append(ident)
def paths(ident):
    if not children[ident]: return [[ident]]
    return [[ident] + p for child in sorted(children[ident]) for p in paths(child)]
all_paths = [p for ident in sorted(allowed) if not species[ident]['evolves_from_species_id'] for p in paths(ident)]
legacy_file = DATA / 'legacy-routes.json'
if not legacy_file.exists():
    source = (ROOT / 'page/pokemon.js').read_text(encoding='utf-8').split('].map')[0]
    legacy = [match[1].split(',') for match in re.findall(r"(['\"])(.*?)\1", source)]
    legacy_file.write_text(json.dumps(legacy), encoding='utf-8')
legacy = json.loads(legacy_file.read_text())
lookup = {n:i for i,n in names.items()}
route_ids = []
for route in legacy:
    ids = [lookup[n] for n in route]
    matches = [p for p in all_paths if p[:len(ids)] == ids]
    route_ids.append(matches[0] if len(matches) == 1 else ids)
for path in all_paths:
    if path not in route_ids: route_ids.append(path)
catalog = [[names[i] for i in path] for path in route_ids]
meta = {names[i]: {'id':i, 'gen':int(species[i]['generation_id'])} for i in sorted(allowed)}
pokemon = rows('pokemon.csv')
megaf = {}
sprite_ids = {names[i]:i for i in allowed}
for row in pokemon:
    sid = int(row['species_id'])
    if sid not in requested_ids or '-mega' not in row['identifier']: continue
    base = names[sid]
    suffix = row['identifier'].split('-mega',1)[1].strip('-').upper()
    # Distinguish gender and Tatsugiri variants without adding duplicate form names.
    prefix = row['identifier'].split('-mega')[0]
    detail = prefix.removeprefix(species[sid]['identifier']).strip('-').replace('-', ' ').title()
    name = 'Mega ' + base + (' ' + detail if detail else '') + (' ' + suffix if suffix else '')
    megaf.setdefault(base,[]).append(name)
    sprite_ids[name] = int(row['id'])
assert set(megaf) == set(requested)

def fetch_sprite(pair, shiny=False):
    name, ident = pair
    target = ASSETS / (str(ident)+('-shiny' if shiny else '')+'.png')
    if target.exists(): return name, 'pokemon/'+target.name, None
    urls = []
    if ident <= 493:
        urls.append(f'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iv/platinum/{"shiny/" if shiny else ""}{ident}.png')
    urls.append(f'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{"shiny/" if shiny else ""}{ident}.png')
    for url in urls:
        for attempt in range(2):
            try:
                payload = urllib.request.urlopen(url,timeout=25).read()
                import io
                image = Image.open(io.BytesIO(payload)).convert('RGBA')
                # Nearest-neighbor keeps the sprite pixel grid crisp on the watch.
                image.thumbnail((96,96),Image.Resampling.NEAREST)
                canvas = Image.new('RGBA',(96,96))
                canvas.paste(image,((96-image.width)//2,(96-image.height)//2))
                originals = DATA / 'original-sprites'
                originals.mkdir(parents=True,exist_ok=True)
                canvas.save(originals / target.name)
                canvas.resize((48,48),Image.Resampling.NEAREST).save(target)
                return name,'pokemon/'+target.name,None
            except Exception as e:
                if '404' in str(e): break
    return name,None,ident

sprites, missing = {}, []
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for name,path,failed in pool.map(fetch_sprite,sprite_ids.items()):
        if path: sprites[name] = path
        else: missing.append(name)
for name in missing:
    base = next((base for base,forms in megaf.items() if name in forms),None)
    if base: sprites[name] = sprites[base]
    else: raise RuntimeError('Missing base sprite: '+name)
# A small original pixel egg, drawn on a pixel grid and enlarged without smoothing.
egg=Image.new('RGBA',(24,24))
draw=ImageDraw.Draw(egg)
draw.polygon([(9,2),(14,2),(17,5),(20,11),(20,17),(17,21),(6,21),(3,17),(3,11),(6,5)],fill='#eee5cf',outline='#574869')
for box in [(8,6,10,8),(14,11,17,14),(6,15,9,17)]: draw.rectangle(box,fill='#9170cf')
egg.resize((48,48),Image.Resampling.NEAREST).save(ASSETS/'egg.png')
sprites['Egg']='pokemon/egg.png'
shinySprites, shinyMissing = {}, []
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    for name,path,failed in pool.map(lambda pair: fetch_sprite(pair,True),sprite_ids.items()):
        if path: shinySprites[name] = path
        else: shinyMissing.append(name)
for name in shinyMissing:
    base = next((base for base,forms in megaf.items() if name in forms),None)
    shinySprites[name] = shinySprites.get(base,sprites[name])
for box in [(8,6,10,8),(14,11,17,14),(6,15,9,17)]: draw.rectangle(box,fill='#efbd43')
egg.resize((48,48),Image.Resampling.NEAREST).save(ASSETS/'egg-shiny.png')
shinySprites['Egg']='pokemon/egg-shiny.png'
# The watch parses catalog.js every time the adventure screen opens, so it stores Dex numbers and builds the rest when
# it loads: the generation follows from the number, sprite files are named after it (other forms list their file), and
# shiny files add -shiny. The exports keep their names and values.
GENERATION_ENDS = [151,251,386,493,649,721,809,905,1025]
generation_of = lambda ident: next(i for i,end in enumerate(GENERATION_ENDS) if ident <= end) + 1
species_ids = {name:info['id'] for name,info in meta.items()}
assert all(generation_of(info['id']) == info['gen'] for info in meta.values()), 'A generation no longer follows its Dex numbers'
sprite_files = {name:re.fullmatch(r'pokemon/(.+)\.png',path).group(1) for name,path in sprites.items() if path != f'pokemon/{species_ids.get(name)}.png'}
built = {**{name:f'pokemon/{ident}.png' for name,ident in species_ids.items()}, **{name:f'pokemon/{file}.png' for name,file in sprite_files.items()}}
assert built == sprites, 'Sprite paths no longer follow the catalog rules'
shiny_files = {name:path for name,path in shinySprites.items() if path != built[name][:-4]+'-shiny.png'}
assert set(shinySprites) == set(sprites)
dumps = lambda value: json.dumps(value,ensure_ascii=False,separators=(',',':'))
output = f'''// Generated by tools/build_catalog.py from PokeAPI CSV data.
export const routes = {dumps(catalog)}
// Each species by National Dex number; its generation and sprite files follow from the number.
const speciesIds = {dumps(species_ids)}
export const megaForms = {dumps(megaf)}
// Forms with their own sprite file (PokeAPI form ids), and shiny files that do not just add -shiny.
const spriteFiles = {dumps(sprite_files)}
const shinyFiles = {dumps(shiny_files)}
export const spriteFallbacks = {dumps(missing)}
export const legacyRoutes = {dumps(legacy)}
const generationEnds = {dumps(GENERATION_ENDS)}
export const species = {{}}
export const sprites = {{}}
export const shinySprites = {{}}
for (const name in speciesIds) {{
  const id = speciesIds[name]
  species[name] = {{ id, gen: generationEnds.findIndex(end => id <= end) + 1 }}
  sprites[name] = 'pokemon/' + id + '.png'
}}
for (const name in spriteFiles) sprites[name] = 'pokemon/' + spriteFiles[name] + '.png'
for (const name in sprites) shinySprites[name] = shinyFiles[name] || sprites[name].replace(/\\.png$/, '-shiny.png')
'''
(ROOT / 'page/catalog.js').write_text(output,encoding='utf-8')
(DATA/'sprite-fallbacks.json').write_text(json.dumps(missing,indent=2))
(DATA/'shiny-sprite-fallbacks.json').write_text(json.dumps(shinyMissing,indent=2))
type_names = {row['id']:row['identifier'] for row in rows('types.csv')}
primary_types = {row['pokemon_id']:type_names[row['type_id']] for row in rows('pokemon_types.csv') if row['slot'] == '1'}
type_map = {name:primary_types.get(re.search(r'/(\d+)',src).group(1),'normal') for name,src in sprites.items() if name != 'Egg'}
(ROOT / 'page/types.js').write_text('export const pokemonTypes = '+json.dumps(type_map,separators=(',',':'))+'\n',encoding='utf-8')
print(f'Catalog: {len(meta)} species, {len(catalog)} routes, {sum(map(len,megaf.values()))} Mega variants, {len(missing)} sprite fallbacks',flush=True)

# The legacy default targets share the same bundled sprites.
import shutil
for target in ['default.r','default.s','default.b']:
    shutil.copytree(ASSETS, ROOT / 'assets' / target / 'pokemon', dirs_exist_ok=True)
