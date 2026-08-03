# Cardex — Pokémon TCG collection & deck tracker

**Live at <https://csicsi2000.github.io/pokemon-card-tracker/>** — open it on any
device and start tracking; your data stays in that browser's localStorage.

A single-user PWA for tracking a physical Pokémon card collection, building decks,
defining custom formats (Cube, house rules), and working out what still needs buying.
Designed to hand its data to an AI and take decklists back.

**No backend.** The card catalogue is a static JSON file and your own data lives in
your browser's localStorage, so the whole thing is a folder of static files — run it
locally with `npm run dev`, or host it free on GitHub Pages.

- **SvelteKit 2 + Svelte 5** with Tailwind v4 and shadcn-svelte
- **TCGdex** as the card catalogue — ~21,000 English printings in a 2 MB file
  (~330 KB gzipped over the wire), held in memory so search is instant
- Card art, set logos, attacks, abilities and live market prices
- Installable PWA; card art and viewed cards are cached for offline browsing

## Getting started

```bash
npm install
npm run dev
```

That's it — no accounts, no keys, no database. Open <http://localhost:5173>.

To use it on your phone over the LAN, run `npm run dev -- --host` and open the network
address it prints.

## Where your data lives

Everything you enter — collection, decks, formats — is stored under the
`cardex:data:v1` key in localStorage. That means:

- it is **per browser and per device**, and does not sync;
- clearing site data, or using a private window, loses it.

So **use Import / Export → Backup** now and then. It downloads a single JSON file, and
Restore reads it back. That file is also how you move a collection to another device.

## Deploying to GitHub Pages

Push to `main` (or `master`) and [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
builds and publishes it. One-time setup: in the repo's **Settings → Pages**, set
**Source** to **GitHub Actions**.

The workflow passes `BASE_PATH=/<repo-name>`, because project sites are served from a
sub-path. Local builds need no such variable. A user or organisation site
(`<user>.github.io`) is served from the root — drop the `env:` block if you use one.

## Updating the card catalogue

```bash
npm run build:catalogue
```

Rebuilds `static/catalogue.json` and `static/details/*.json` from TCGdex; run it when a
new set releases, then commit the files. They are checked in so a fresh clone works
without a network fetch — and so the app keeps working if TCGdex is down.

The script reads two TCGdex surfaces because neither alone is complete: REST
`/sets/{id}` for the PTCGL set code (`OBF`, `PR-SW`) and legality, GraphQL for every
card of a set in one request. Card images and set logos are hotlinked to
`assets.tcgdex.net`, never bundled — and new sets sometimes appear in the catalogue
before their artwork is published, in which case the app falls back to showing names.

### What ships with the app, and what does not

Three tiers, chosen by how often each thing changes and how much of it you need at once:

| Data | Where | Why |
|---|---|---|
| Names, sets, numbers, types, HP, rarity, finishes | `static/catalogue.json`, 1.9 MB, loaded on start | Needed for search and deck rules, so all of it is needed at once |
| Attacks, abilities, weaknesses, retreat, illustrator | `static/details/<setId>.json`, 7.3 MB total, one file fetched per set you open | Fixed once a set is printed. Split by set because ~13 KB gzipped per set beats 1.3 MB up front, and opening one card makes the rest of that set instant |
| Market prices | Live TCGdex call per card | Change daily; storing them would ship stale numbers |
| Card images and set logos | Hotlinked to `assets.tcgdex.net` | ~550 MB at low quality, 2.1 GB at high — GitHub Pages allows 1 GB per site |

Net effect: everything except prices works offline, and the first visit downloads
~2.6 MB rather than 10 MB. The service worker precaches the catalogue and app shell,
then caches detail files, card art and price responses as you encounter them.

The build script also repairs a TCGdex quirk on the way in: text for newer cards is
served as UTF-8 that was decoded as Latin-1, so "Pokémon" arrives as "PokÃ©mon". See
[text.ts](src/lib/tcg/text.ts), which is careful to leave genuine accented text alone.

### Sets without artwork

TCGdex lists a set's cards as soon as it is announced, sometimes weeks before the scans
exist, and some older promo sets and trainer kits have no images at all. The build
checks a few cards per set and records the answer, so the app can sort those sets to the
back of the card browser — otherwise a just-released set fills the opening screen with
cards that have no art — and badge them "No art yet" on the Sets page. Currently 55 of
203 sets are in that state; they fall back to showing card names.

## Working with AI

Two steps, both built on the PTCGL text format that pkmn.gg, PTCGL and Limitless share:

1. **Import / Export → Export → Copy for AI** copies your collection as compact JSON
   with a preamble telling the model to answer in PTCGL decklist format.
2. Paste its answer into **Import**, which resolves every line to a real printing and
   shows you the matches before saving anything.

That round trip covers requests like *"build five decks from what I own that are
balanced against each other"* or *"here is my Cube pool — what should I buy next?"*.
A deck's or a format's own **Copy for AI** button does the same for just that list.

A stdio MCP server exposing `get_collection` / `get_buylist` / `create_deck` is the
natural next step, reusing `src/lib/tcg/*` directly.

## How importing works

`src/lib/tcg/parser.ts` reads the standard format:

```
Pokémon: 2
1 Charizard null 1
2 Charmander PR-SW 92

Total Cards: 3
```

`src/lib/tcg/resolver.ts` then finds each real printing, in order of confidence: exact
set code + collector number; then `set-code-overrides.ts` for PTCGL codes TCGdex does
not publish (`PR-SW` → `swshp`); then name-only matching, which is what `null` set
codes get; then basic-energy aliases (`Basic {R} Energy` → `Fire Energy`). Anything it
cannot place is listed for you to fix by hand rather than guessed at.

### Printings vs. names

The collection tracks **printings and variants** (normal / reverse / holo / 1st
edition), because that is what sits in a binder. Copy limits and buylists count by
**card name**, because that is how the rules work — four Charmander from four different
sets is still four Charmander, and any printing you own counts toward what a deck needs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Static production build into `build/` |
| `npm run preview` | Serve the production build |
| `npm test` | Vitest — parser, resolver, exporter, legality, buylist |
| `npm run check` | `svelte-check` type checking |
| `npm run build:catalogue` | Refresh `static/catalogue.json` from TCGdex |

## Layout

```
src/lib/catalogue.ts        loads static/catalogue.json, indexes it, searches it
src/lib/card-details.ts     bundled rules text per set, plus live prices per card
src/lib/store.svelte.ts     all user data; reactive state mirrored to localStorage
src/lib/tcg/                parser, resolver, exporter, legality, buylist, format rules
src/lib/components/         CardTile, CardImage, SetLogo, CardDetailSheet, EnergyPip, …
src/routes/                 dashboard, cards, sets, collection, decks, formats, import
scripts/build-catalogue.ts  TCGdex → static/catalogue.json
tests/                      unit tests for the pure logic above
```

`/decks/[id]` and `/formats/[id]` cannot be prerendered — their ids only exist in your
own browser — so the build emits a `404.html` that GitHub Pages serves as an SPA
fallback for them.

## Not built yet

Camera scanning of physical cards. The groundwork is there (stable TCGdex ids on every
printing), but recognition itself is unimplemented.
