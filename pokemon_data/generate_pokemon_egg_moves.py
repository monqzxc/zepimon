#!/usr/bin/env python3
"""
Generate generation 1–4 Pokémon and egg-move JSON files from PokéAPI.

Usage:
    python generate_pokemon_egg_moves.py

Requires:
    pip install requests

The script fetches Pokémon #1–493, extracts egg moves recorded for Gen II–IV
version groups, and updates pokemon_moves_gen1_to_gen4.json with an `egg_move`
boolean indicating whether each move appears as an egg move for at least one
Pokémon in the generated dataset.
"""
import json
import time
from pathlib import Path

import requests

BASE = "https://pokeapi.co/api/v2"
POKEMON_OUT = Path("pokemon_egg_moves_gen1_to_gen4.json")
MOVES_FILE = Path("pokemon_moves_gen1_to_gen4.json")
POKEMON_COUNT = 493

# Egg moves were not a mechanic in Gen I. These groups cover games from Gens II–IV.
VERSION_GROUPS = {
    "gold-silver", "crystal",
    "ruby-sapphire", "emerald", "firered-leafgreen",
    "diamond-pearl", "platinum", "heartgold-soulsilver",
}

session = requests.Session()
session.headers.update({"User-Agent": "pokemon-egg-move-json-generator/1.0"})

def get_json(url, retries=4):
    for attempt in range(retries):
        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))

pokemon_records = []
all_egg_moves = set()

for pokemon_id in range(1, POKEMON_COUNT + 1):
    pokemon = get_json(f"{BASE}/pokemon/{pokemon_id}/")
    egg_moves = set()

    for move_entry in pokemon.get("moves", []):
        move_name = move_entry["move"]["name"]
        is_egg_move_in_target_gens = any(
            detail["move_learn_method"]["name"] == "egg"
            and detail["version_group"]["name"] in VERSION_GROUPS
            for detail in move_entry.get("version_group_details", [])
        )
        if is_egg_move_in_target_gens:
            egg_moves.add(move_name)

    pokemon_records.append({
        "id": pokemon_id,
        "name": pokemon["name"],
        "egg_moves": sorted(egg_moves),
    })
    all_egg_moves.update(egg_moves)

    if pokemon_id % 25 == 0:
        print(f"Fetched {pokemon_id}/{POKEMON_COUNT} Pokémon")

output = {
    "dataset": "Pokémon egg moves, species #1–493",
    "generations_covered": [1, 2, 3, 4],
    "method": (
        "Egg moves are collected from PokéAPI Pokémon move learnsets for "
        "the Gen II–IV version groups listed in this script. A move is included "
        "for a Pokémon if PokéAPI marks it as an egg move in at least one of "
        "those version groups."
    ),
    "source": "https://pokeapi.co/docs/v2",
    "pokemon_count": len(pokemon_records),
    "pokemon": pokemon_records,
}
POKEMON_OUT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Wrote {POKEMON_OUT}")

if MOVES_FILE.exists():
    moves_data = json.loads(MOVES_FILE.read_text(encoding="utf-8"))
    for move in moves_data.get("moves", []):
        normalized = move.get("name", "").strip().lower().replace(" ", "-").replace("_", "-")
        move["egg_move"] = normalized in all_egg_moves
    moves_data["egg_move_scope_note"] = (
        "`egg_move` is true if at least one Pokémon #1–493 can learn this move "
        "as an Egg Move in one or more Gen II–IV version groups listed in the "
        "generator script. It does not mean every Pokémon can inherit the move."
    )
    MOVES_FILE.write_text(json.dumps(moves_data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Updated `egg_move` flags in {MOVES_FILE}")
else:
    print(f"Skipped updating moves: {MOVES_FILE} not found in current directory.")
