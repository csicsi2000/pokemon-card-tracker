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
- **Wants** — the cards you are still hunting for, in as many lists as you like, with
  priority, notes and one tap to file them into a lot when they turn up
- **Trade binder** — the spares you would trade away, with one tap to take them out of the
  collection once they change hands
- **Folders** for decks and for lots, nested as deep as you like (2026 › eBay › july.2 lot)
- Import a PTCGL / Limitless decklist and see exactly what you own and what is missing
- Optional **sync** through your own Google Drive — no Cardex server — to use it on several
  devices (a WebDAV backend exists too, off by default; see Sync below)
- Installable PWA; card art and viewed cards are cached for offline browsing

## Getting started

```bash
npm install
npm run dev
```

That's it — no accounts, no keys, no database. Open <http://localhost:5173>.

To use it on your phone over the LAN, run `npm run dev -- --host` and open the network
address it prints.

## Install it as an app

Cardex is a PWA, so it can be installed instead of visited: its own icon, no browser
chrome, and it opens without a connection.

- **Chrome / Edge, desktop or Android** — **Install app** at the bottom of the sidebar
  (behind **More** on a phone), or the install icon in the address bar.
- **iPhone / iPad** — iOS installs only from the share sheet: Share → *Add to Home
  Screen*. Tapping **Install app** shows the steps for the browser you are in.
- **Safari on Mac** — File → *Add to Dock*.
- **Firefox on the desktop** cannot install web apps. It still caches and works offline
  in a normal tab.

Offline you keep the whole app: your collection, wants, lots, decks and formats, the 21,000-card
catalogue and the bundled rules text, plus every card image already seen. Live market
prices, art you have never opened and sync need the network and pick up again by
themselves. Deep links work offline too — reopening the installed app on `/decks/<id>`
serves the cached shell rather than a browser error page.

When a new version is deployed the app says so and waits for you to press **Reload**,
rather than refreshing mid-edit. Your data is local either way, so an update never
touches it.

## Where your data lives

Everything you enter — collection, wants, lots, decks, folders, formats — is stored under the
`cardex:data:v2` key in localStorage (older builds used `cardex:data:v1`; it is migrated on
first load and left in place). That means:

- it is **per browser and per device** unless you turn on sync;
- clearing site data, or using a private window, loses it.

So **use Import / Export → Backup** now and then. It downloads a single JSON file, and
Restore reads it back — old v1 backup files still restore. Or turn on sync (below) and let
the app keep a copy in your own Google Drive.

## Adding cards

Three ways, all ending in the same collection:

- **Quick add** (Collection page, any lot page, and the deck builder's search box): type what
  the card says — set code and collector number. `MEG 21` is Mega Evolution #021. Leading
  zeros and case do not matter. `3 PAL 188 rh` adds three reverse holos; `x2` after the
  number works too. Finish markers: `rh`/`r` reverse, `h` holo, `1st`, `promo`. Promo sets
  use their PTCGL code (`PR-SW 92`); a raw TCGdex set id (`sv03 125`) is accepted as well.
  Paste several lines and you get a review list with one "Add all" button. On a lot page a
  **Set** picker beside the box pins a set, so a stack that is all one set needs only the
  numbers typed — `21`, `3 188 rh` — while a line that names its own set still goes there.
  The pinned set is remembered per lot in this browser.
- **Browse** the Cards or Sets pages and use the +/− buttons on a card.
- **Import** a decklist on the Import / Export page — name-less lines like `3 MEG 21` work
  there too.

## Lots

A lot is a batch of cards acquired together — an eBay bulk buy, a booster box, a trade.
Every card row belongs to exactly one lot (or to **Unsorted**), so the collection is always
the sum of its lots and a lot page shows exactly what came in it. Add cards straight into a
lot with quick add, move copies between lots from a lot's **List & move** tab or from any
card's **Across your lots** panel (open a card anywhere, set how many copies and pick the lot
they go to — including a brand-new one), and filter the Collection page by lot. Deleting a
lot asks whether its cards should go to Unsorted or be removed too.

Lots live in folders of their own, nested as deep as you like and separate from the deck
folders. The Lots page shows one folder at a time with a breadcrumb; **New folder** and
**New lot** create inside the folder you are looking at, a folder card counts the lots and
cards anywhere beneath it, and the ⋯ menu offers Rename, Edit description (free text shown
on the card), Customize, Move to… and Delete (deleting a folder moves its lots and
sub-folders up a level — no lot is ever lost with it). Customize gives a folder a colour and
an emoji, which front its card; lots take the same in the New lot dialog and on their own
page, and the emoji rides along in lot pickers and the lot's title. Tapping anywhere on a folder or lot card opens it. The
search box above the cards looks through every folder and lot at once — names, notes,
descriptions and the folder path — and shows where each match is filed. A lot's own page has
a **Folder** picker, so it can be filed while you are looking at what is in it.

## Wants

The **Wants** page is the other half of the collection: cards you do not own yet. A want is
one printing in one finish plus how many copies you are after, a priority (high / normal /
low) and a free note — where to look, the price you will pay. The heart on any card's detail
sheet puts one on the list without leaving the page you are on.

Each row shows how many of that finish you already own, so `2/4` means two still to find;
the counters and the **Cards to find** tile always count the gap rather than the wish. When
the cards arrive, **Got it** adds exactly the missing copies to the lot chosen in the panel
on the right and clears the want. **Copy list** puts everything still missing on the
clipboard as a decklist, ready to paste into a shop's mass-entry box or a trade thread.

**Several lists.** Wants that name no list sit on the **Main list**; make as many more as
you like — one per deck you are building, one for a trade night, one for a binder you are
completing. The picker at the top switches between them (and **All lists** shows the lot),
filters the stats and the Copy list button with it, and decides where new wants land. The
`⋯` on any row moves it to another list. Deleting a list keeps its wants, folding them back
onto the Main list. The same card can sit on two lists at once with a different count on
each — one hunt does not disturb the other.

**Three views**, switched top right and remembered per browser:

- **Cards** — the art in a grid, with what is still missing on the corner of each card. For
  recognising cards you have only ever seen in a binder.
- **Detailed** — a row each with notes, priority, counters and the lot to file them into.
  This is where you edit.
- **Compact** — one line per card, no art. What you want open on your phone at a shop.

## Trade binder

The **Trade binder** is the mirror of wants: copies you own but do not need. An entry is
one printing in one finish, how many of it are spare, and a free note — condition, what
you would take for it. The arrows beside the heart on any card's detail sheet put one spare
copy in the binder; the page's add panel searches only the cards you own and offers one
more copy per tap, in the chosen finish if you hold any, else the finish you hold most of.

The cards stay counted in your collection and in their lots until they actually change
hands. Each row shows `offered/owned`, and an entry offering more than you still hold is
flagged so it can be trimmed or cleared. **Traded** removes the offered copies from your
collection — from the lots holding the most of them, or from one lot chosen in the panel —
and clears the entry; the bin icon takes an entry out of the binder and leaves the cards
alone. **Copy list** puts the whole binder on the clipboard as a decklist for a trade
thread, and the same three views as wants (cards, detailed, compact) are a click away.

The binder syncs like everything else and appears in the readable export, so an AI
coach knows which copies not to build a keeper deck around.

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

### Battle logs and replays

The **Battles** page in the sidebar is every game you have saved: your overall record, which
archetype keeps beating you whatever you bring, a filter by deck, and the place to paste a log
when you have just finished a game and are not already looking at the deck you played (it asks
which deck that was). Each deck also has its own **Battles** tab with the same view scoped to
that build.

Paste a log out of Pokémon TCG Live's log panel and Cardex reads it: both handles, who went
first, who won, how long it ran, and every card each side put into play. Which side of the log
is yours is worked out by matching what each player played against the deck's own list, and
shown as a guess you can change. Add what the opponent was playing and you get a **matchup table**, worst first —
which is the question a pile of logs is kept to answer.

**Replay** steps through the whole game with the board reconstructed at every line: active and
benched Pokémon with their evolution stacks, damage counters against printed HP, attached
energy and tools, prizes left, the stadium in play. Arrow keys step and change turn, space
plays it back, the slider scrubs, and clicking any line in the log jumps to it. TCG Live emits
a line every time a stadium ability checks a benched Pokémon — about a third of a real game —
so those are folded away by default, with a switch to show every line.

Logs are stored **gzipped**. A game is about 25,000 characters, which localStorage bills at
~49 KB and which rides along in every sync of your whole collection; compressed it costs
about 6 KB, so a few hundred games fit where a hundred would not. Nothing else is derived and
stored: the board is parsed out of the log text each time, so the log you saved today replays
better as the parser improves. Two things the log itself limits — it
attributes effect targets to whoever is acting, even for the opponent's Pokémon (Cardex looks
up the real owner on the board instead), and it never reveals both hands, so hands and deck
counts are not tracked at all rather than shown wrong.

### Comparing two decks

**Compare** (on the Decks page, on a deck, or in a deck's ⋯ menu) puts two lists side by
side — the screen for "I keep two versions of this archetype, what is actually different?".
It reports how much of the list the two share, which cards came in and which went out, the
Pokémon / Trainer / Energy counts of each, and what you would still have to buy to switch
from the left deck to the right one. Both decks are in the URL (`?a=…&b=…`), so a
comparison can be bookmarked or sent to someone.

Cards are matched **by name**, so a different printing of the same card is not a change —
those are called out separately as reprint swaps, since the regulation mark can differ. Pair
it with **Duplicate**: copy a deck, change the copy, then compare the two.

## Sync (optional)

Cardex has no server. If you want the same data on your phone and your laptop, it can keep a
copy in storage **you** control and merge it with what each device has. Two kinds of storage
are supported, chosen on the Settings page:

- **Google Drive** — one file, `Cardex/cardex-data.json`, visible in My Drive. Free, no card
  required; the Drive API's free quota is far beyond what one person syncing a JSON file uses.
  Needs a one-time setup by whoever hosts the app (below).
- **WebDAV** — a folder on a WebDAV server you run: Nextcloud, ownCloud, a Synology or QNAP
  NAS, a Hetzner Storage Box, `rclone serve webdav`, Apache/nginx with the DAV module. You
  type the folder URL, username and password on the Settings page. **Hidden by default**, and
  only usable against a server you can configure — see below.

How merging works: every card row, lot, deck, folder and format carries the time it was last
changed; the newer change wins per record, and deletions are remembered (tombstones) so a
deleted deck does not come back from the other device. Two devices both editing the same lot
at the exact same moment can double-count that one edit — rare, and easy to fix by hand.

### Google Drive

Google sign-ins last about an hour (the browser-only flow has no refresh tokens), but you
should rarely notice: the token is kept on the device, and when it runs out Cardex asks
Google again in a hidden frame with no popup. That works while you are signed in to Google in
the same browser and it allows third-party cookies in frames — Chrome, Edge and Android do;
Safari and Firefox do not. Where it cannot, the cloud icon in the sidebar turns amber; tap
**Reconnect** and edits made in the meantime are synced. Home-screen PWAs on iOS cannot
complete Google's popup — connect once in Safari instead.

One-time setup: the app needs a Google OAuth **client id** (a public identifier, not a secret):

1. <https://console.cloud.google.com> → create a project (e.g. "Cardex").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External. App name "Cardex", your email as
   support and developer contact. Add scopes `…/auth/drive.file` and `…/auth/userinfo.email`.
   Add your own Google account as a **test user** and leave the app in Testing — no
   verification is needed for personal use.
4. **Credentials → Create credentials → OAuth client ID → Web application**. Authorized
   JavaScript origins: `https://<user>.github.io` and `http://localhost:5173`. Authorized
   redirect URIs: `https://<user>.github.io/<repo>/google-callback.html` and
   `http://localhost:5173/google-callback.html` — the page the hourly token refresh lands
   on.

   Be realistic about that refresh: Google only renews a token silently when it has nothing
   to show the user, and it shows a "make sure you trust this app" screen for every app it
   has not reviewed. Google does not review apps for personal use (its own verification
   questionnaire says so), so with a personal client the refresh cannot be silent. What
   Cardex does instead is make it one tap: the amber cloud icon opens the sign-in popup
   directly, and **Continue** in the popup finishes it. Edits made in between are kept
   locally and synced afterwards.
5. Put the client id where the build can see it:
   - locally: copy `.env.example` to `.env` and set `PUBLIC_GOOGLE_CLIENT_ID=…`;
   - on GitHub Pages: repo **Settings → Secrets and variables → Actions → Variables**, add
     `GOOGLE_CLIENT_ID`. The deploy workflow passes it to the build.

Leave it unset and the Settings page just shows these instructions; everything else still
works.

### WebDAV

**Off by default.** Set `PUBLIC_ENABLE_WEBDAV=true` (in `.env`, or as the GitHub Actions
variable used by the deploy workflow) to make the option appear on the Settings page.

It is hidden because of the CORS requirement below: a **hosted** service that speaks WebDAV —
Koofr, pCloud, Box, 4shared, Fastmail — sends no `Access-Control-Allow-Origin` header and
gives you no way to add one. Those endpoints are built for desktop clients, which have no CORS
rules; from a browser the preflight is blocked and the request never leaves the machine. No
change in Cardex can work around that. So WebDAV here is for a server you control, and turning
the flag on without one only produces a confusing failure. If your storage is hosted, use
Google Drive instead.

Cardex writes two plain files into the folder you give it: `cardex-data.json` (the data) and
`cardex-readable.md` (the Markdown export, for you or an AI assistant to read). The login is
kept in that browser's localStorage only and sent straight to your server with HTTP Basic
auth, so use HTTPS and, where the server offers them, an **app password** rather than your
main one. Change detection uses the server's ETag, falling back to `Last-Modified` and then
to hashing the file when the server exposes neither.

Because Cardex runs in the browser on a different origin than your server, the server has to
answer **CORS** requests from the site Cardex is served from (for the public build,
`https://<user>.github.io`; for development, `http://localhost:5173`). Most WebDAV servers do
not do this out of the box — Nextcloud and ownCloud, for instance, need a reverse proxy in
front of them. What has to be allowed:

- methods `OPTIONS, HEAD, GET, PUT, MKCOL`;
- request headers `Authorization, Content-Type`;
- exposed response headers `ETag, Last-Modified` (optional, but saves a download per check).

An nginx snippet for the WebDAV location, with the origin filled in:

```nginx
location /remote.php/dav/ {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin  "https://<user>.github.io";
        add_header Access-Control-Allow-Methods "OPTIONS, HEAD, GET, PUT, MKCOL";
        add_header Access-Control-Allow-Headers "Authorization, Content-Type";
        add_header Access-Control-Max-Age 86400;
        return 204;
    }
    add_header Access-Control-Allow-Origin   "https://<user>.github.io" always;
    add_header Access-Control-Expose-Headers "ETag, Last-Modified" always;
    proxy_pass http://nextcloud;
}
```

`rclone serve webdav` and Caddy (`header` directive) can add the same headers directly. A
wrong URL or missing CORS header shows up as "Could not reach …" when you press Connect; a
wrong password as "Login rejected".

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
| The nine basic energy cards TCGdex never scanned | Hotlinked to `images.pokemontcg.io` | Nine files, cached on first sight like any other scan |

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
203 sets are in that state; they fall back to showing card names. A couple of hundred
cards in otherwise scanned sets (mostly promo sets) have no image on TCGdex at all and show
their name for good.

Basic energy is the exception, because it is the whole point of an energy card that you
recognise it by its face. TCGdex has no scan for 161 basic energy printings — every
Scarlet & Violet one included — so those show the type's card borrowed from
pokemontcg.io, which does publish them: the current Scarlet & Violet printing of each
type, plus the Sun & Moon Fairy Energy. It is the type's card rather than that exact
printing, so a 2010 Trainer Kit Fire Energy shows *a* Basic Fire Energy; a printing
TCGdex *has* scanned always keeps its own. Dragon and Colorless were never printed as a
basic energy, so those (and any energy whose name points at no single type, like Rainbow
Energy) fall through to a drawn card: the type's colour and a big pip. See
[tcg/energy.ts](src/lib/tcg/energy.ts) and
[EnergyCardArt.svelte](src/lib/components/EnergyCardArt.svelte).

A card that *used* to show its name and now has art is a different story. The CDN marks
its 404s cacheable for a year, so a browser that asked for a scan before it existed keeps
that miss in its HTTP cache. The service worker therefore revalidates every art request
it does not already hold, and an image that fails to load is fetched once more past the
HTTP cache before the name fallback is accepted — which also rides out the odd rate-limit
error when a big grid loads at once.

## Working with AI

Everything is built on the PTCGL text format that pkmn.gg, PTCGL and Limitless share, so
any model's answer pastes straight back into **Import**. Three levels, from chat to agent:

### 1. Chat assistants (Claude, Gemini, ChatGPT)

- **Import / Export → Export → Copy readable** gives one Markdown document with your
  collection by lot, every deck as a decklist plus what is missing, and your formats, using
  card names and set codes rather than ids. Paste it into a chat together with the
  coaching instructions in [docs/deck-coach-prompt.md](docs/deck-coach-prompt.md) (use them
  as a Claude Project, Gemini Gem or custom GPT).
- With sync on, the same document is kept up to date as `cardex-readable.md` next to the data
  file (in `Cardex/` on Drive, or in your WebDAV folder), so an assistant with a Drive or
  file connector can read it without you pasting anything.
- Paste the model's decklist into **Import**; it resolves every line to a real printing,
  shows what you own and what is missing, and can save it as a deck in a folder.
- A link can pre-fill the importer: `/import/?list=<url-encoded decklist>&target=deck&name=…`.

### 2. Coding agents (Claude Code, Codex, Gemini CLI)

`npm run cardex -- help` is a CLI over a data file: read the collection and decks, search
the catalogue, create and edit decks, quick-add cards, list what to buy. The data file is
either a backup you exported from **Import / Export → Backup**, or the live
`cardex-data.json` that Google Drive for Desktop or a synced WebDAV folder mirrors to disk —
in which case an edit made by the agent shows up in the app on its next sync. Every write goes through the
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
`diff_decks`, `check_legality`, `search_cards`, `resolve_card`, `quick_add`, `create_deck`,
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
| `npm test` | Vitest — parser, resolver, quick add, exporter, legality, buylist, deck diff, migration, merge, sync engine |
| `npm run check` | `svelte-check` type checking |
| `npm run build:catalogue` | Refresh `static/catalogue.json` from TCGdex |

## Layout

```
src/lib/catalogue.ts        loads static/catalogue.json, indexes it, searches it
src/lib/card-details.ts     bundled rules text per set, plus live prices per card
src/lib/data/               user-data model, migration, pure mutations, repair, merge
src/lib/store.svelte.ts     holds the data as Svelte state, persists it, counts revisions
src/lib/sync/               sync engine, Google sign-in + Drive backend, WebDAV backend (flagged off)
src/lib/tcg/                parser, resolver, quick add, exporter, legality, buylist, deck stats & diff, energy types, format rules
src/lib/tcg/battle-log/     TCG Live log parser, board replay, match summary and record
src/lib/components/         CardTile, CardImage, SetLogo, CardDetailSheet, QuickAddBar, …
src/routes/                 dashboard, cards, sets, collection, wants, trades, lots, decks, battles, formats, import, settings
scripts/build-catalogue.ts  TCGdex → static/catalogue.json
tests/                      unit tests for the pure logic above
```

`/decks/[id]`, `/decks/[id]/battles/[logId]`, `/lots/[id]` and `/formats/[id]` cannot be prerendered — their ids only exist in your
own browser — so the build emits a `404.html` that GitHub Pages serves as an SPA
fallback for them.

## Not built yet

Camera scanning of physical cards. The groundwork is there (stable TCGdex ids on every
printing), but recognition itself is unimplemented.
