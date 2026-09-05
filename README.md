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
- **Quick add** by what is printed on the card: `MEG 21`, `3 PAL 188 rh`, or a pasted list
- **Lots** — the purchase or batch each card came in, so "what was in the july.2 lot?" has an answer
- **Deck folders**, nested as deep as you like (Standard › 2026 › Charizard builds)
- Import a PTCGL / Limitless decklist and see exactly what you own and what is missing
- Optional **Google Drive sync** — your own Drive, no Cardex server — to use it on several devices
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

Everything you enter — collection, lots, decks, folders, formats — is stored under the
`cardex:data:v2` key in localStorage (older builds used `cardex:data:v1`; it is migrated on
first load and left in place). That means:

- it is **per browser and per device** unless you turn on Google Drive sync;
- clearing site data, or using a private window, loses it.

So **use Import / Export → Backup** now and then. It downloads a single JSON file, and
Restore reads it back — old v1 backup files still restore. Or connect Google Drive (below)
and let the app keep a copy in your own Drive.

## Adding cards

Three ways, all ending in the same collection:

- **Quick add** (Collection page, any lot page, and the deck builder's search box): type what
  the card says — set code and collector number. `MEG 21` is Mega Evolution #021. Leading
  zeros and case do not matter. `3 PAL 188 rh` adds three reverse holos; `x2` after the
  number works too. Finish markers: `rh`/`r` reverse, `h` holo, `1st`, `promo`. Promo sets
  use their PTCGL code (`PR-SW 92`); a raw TCGdex set id (`sv03 125`) is accepted as well.
  Paste several lines and you get a review list with one "Add all" button.
- **Browse** the Cards or Sets pages and use the +/− buttons on a card.
- **Import** a decklist on the Import / Export page — name-less lines like `3 MEG 21` work
  there too.

## Lots

A lot is a batch of cards acquired together — an eBay bulk buy, a booster box, a trade.
Every card row belongs to exactly one lot (or to **Unsorted**), so the collection is always
the sum of its lots and a lot page shows exactly what came in it. Add cards straight into a
lot with quick add, move copies between lots from a lot's **List & move** tab, and filter the
Collection page by lot. Deleting a lot asks whether its cards should go to Unsorted or be
removed too.

## Decks and folders

Decks live in folders that nest arbitrarily. The Decks page shows one folder at a time with a
breadcrumb; **New folder** and **New deck** create inside the folder you are looking at, and
the ⋯ menu on a deck or folder offers Rename, Move to… and Delete (deleting a folder moves its
contents up one level). A deck's own page has a folder picker next to its format.

Every deck row shows **owned / needed**, counted by card name across every printing you own,
and the **Missing** tab lists what to buy with a "Copy missing as list" button. The Import
page shows the same have/missing summary for a pasted list *before* you save anything, and
can import into a new deck (in a chosen folder), into your collection (into a chosen lot), or
replace the list of an existing deck.

## Google Drive sync (optional)

Cardex has no server. If you want the same data on your phone and your laptop, it can keep a
copy in **your own Google Drive** — one file, `Cardex/cardex-data.json`, visible in My Drive —
and merge it with what each device has. Free, no card required; the Drive API's free quota is
far beyond what one person syncing a JSON file uses.

How merging works: every card row, lot, deck, folder and format carries the time it was last
changed; the newer change wins per record, and deletions are remembered (tombstones) so a
deleted deck does not come back from the other device. Two devices both editing the same lot
at the exact same moment can double-count that one edit — rare, and easy to fix by hand.

Google sign-ins last about an hour (the browser-only flow has no refresh tokens). When one
runs out the cloud icon in the sidebar turns amber; tap **Reconnect** and edits made in the
meantime are synced. Home-screen PWAs on iOS cannot complete Google's popup — connect once in
Safari instead.

### One-time setup

The app needs a Google OAuth **client id** (a public identifier, not a secret):

1. <https://console.cloud.google.com> → create a project (e.g. "Cardex").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External. App name "Cardex", your email as
   support and developer contact. Add scopes `…/auth/drive.file` and `…/auth/userinfo.email`.
   Add your own Google account as a **test user** and leave the app in Testing — no
   verification is needed for personal use.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized
   JavaScript origins: `https://<user>.github.io` and `http://localhost:5173`. No redirect URIs.
5. Put the client id where the build can see it:
   - locally: copy `.env.example` to `.env` and set `PUBLIC_GOOGLE_CLIENT_ID=…`;
   - on GitHub Pages: repo **Settings → Secrets and variables → Actions → Variables**, add
     `GOOGLE_CLIENT_ID`. The deploy workflow passes it to the build.

Leave it unset and the Sync page just shows these instructions; everything else works.

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
cards that have no art — and badge them "No art yet" on the Sets page. Currently 56 of
203 sets are in that state; they fall back to showing card names.

## Working with AI

Everything is built on the PTCGL text format that pkmn.gg, PTCGL and Limitless share, so
any model's answer pastes straight back into **Import**. Three levels, from chat to agent:

### 1. Chat assistants (Claude, Gemini, ChatGPT)

- **Import / Export → Export → Copy readable** gives one Markdown document with your
  collection by lot, every deck as a decklist plus what is missing, and your formats, using
  card names and set codes rather than ids. Paste it into a chat together with the
  coaching instructions in [docs/deck-coach-prompt.md](docs/deck-coach-prompt.md) (use them
  as a Claude Project, Gemini Gem or custom GPT).
- With Google Drive sync on, the same document is kept up to date as
  `Cardex/cardex-readable.md` in your Drive, so an assistant with a Drive connector can read
  it without you pasting anything.
- Paste the model's decklist into **Import**; it resolves every line to a real printing,
  shows what you own and what is missing, and can save it as a deck in a folder.
- A link can pre-fill the importer: `/import/?list=<url-encoded decklist>&target=deck&name=…`.

### 2. Coding agents (Claude Code, Codex, Gemini CLI)

`npm run cardex -- help` is a CLI over a data file: read the collection and decks, search
the catalogue, create and edit decks, quick-add cards, list what to buy. The data file is
either a backup you exported from **Import / Export → Backup**, or the live
`Cardex/cardex-data.json` that Google Drive for Desktop mirrors to disk — in which case an
edit made by the agent shows up in the app on its next sync. Every write goes through the
same timestamped mutations as the app, so it merges safely.

[AGENTS.md](AGENTS.md) (also read by Codex) and `CLAUDE.md` explain this to agents that
open the repo; `.claude/skills/deck-coach` teaches Claude Code the workflow.

### 3. MCP

`npm run mcp` runs the same operations as an MCP server over stdio (`CARDEX_DATA` points at
the data file). For Claude Code:

```bash
claude mcp add cardex -e CARDEX_DATA=/path/to/cardex-data.json -- npm run mcp --prefix /path/to/pokemon-card-tracker
```

Tools: `get_overview`, `get_collection`, `export_readable`, `get_decks`, `get_deck`,
`check_legality`, `search_cards`, `resolve_card`, `quick_add`, `create_deck`,
`replace_deck_list`, `set_deck_card`, `update_deck`, `delete_deck`, `create_lot`.

For agents that browse the deployed site, [static/llms.txt](static/llms.txt) describes the
public catalogue files, the text formats and the URLs.

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
| `npm test` | Vitest — parser, resolver, quick add, exporter, legality, buylist, migration, merge, sync engine |
| `npm run check` | `svelte-check` type checking |
| `npm run build:catalogue` | Refresh `static/catalogue.json` from TCGdex |

## Layout

```
src/lib/catalogue.ts        loads static/catalogue.json, indexes it, searches it
src/lib/card-details.ts     bundled rules text per set, plus live prices per card
src/lib/data/               user-data model, migration, pure mutations, repair, merge
src/lib/store.svelte.ts     holds the data as Svelte state, persists it, counts revisions
src/lib/sync/               Google sign-in, Drive client, sync engine (optional feature)
src/lib/tcg/                parser, resolver, quick add, exporter, legality, buylist, format rules
src/lib/components/         CardTile, CardImage, SetLogo, CardDetailSheet, QuickAddBar, …
src/routes/                 dashboard, cards, sets, collection, lots, decks, formats, import, sync
scripts/build-catalogue.ts  TCGdex → static/catalogue.json
tests/                      unit tests for the pure logic above
```

`/decks/[id]`, `/lots/[id]` and `/formats/[id]` cannot be prerendered — their ids only exist in your
own browser — so the build emits a `404.html` that GitHub Pages serves as an SPA
fallback for them.

## Not built yet

Camera scanning of physical cards. The groundwork is there (stable TCGdex ids on every
printing), but recognition itself is unimplemented.
