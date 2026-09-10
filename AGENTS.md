# Working in this repo as an agent

Cardex is a SvelteKit 2 / Svelte 5 static app (TypeScript, Tailwind, vitest). No server.
The user's data is a single JSON document (`UserData`, see `src/lib/data/model.ts`) kept
in the browser and optionally synced to Google Drive as `Cardex/cardex-data.json` or to a
folder on the user's WebDAV server as `cardex-data.json`. The WebDAV option is hidden unless
the build sets `PUBLIC_ENABLE_WEBDAV=true`; it only works against a server whose CORS headers
the user controls, so in practice Drive is the sync backend in use.

## If the user wants deck-building help

Use the CLI or the MCP server below; do not hand-edit the JSON. Every write goes through
`src/lib/data/mutations.ts`, which stamps timestamps and tombstones so the app merges the
change cleanly on its next sync.

The data file is chosen by `--file PATH`, the `CARDEX_DATA` env var, or `./cardex-data.json`:

- a backup the user exported (Import / Export → Backup → Download backup), or
- the live file mirrored to disk by Google Drive for Desktop
  (`G:\My Drive\Cardex\cardex-data.json` or similar) or by a mounted / synced WebDAV folder
  (Nextcloud desktop client, a mapped network drive, `rclone mount`) — edits then reach every
  device on its next sync.

```bash
npm run cardex -- help
npm run cardex -- export            # whole collection as readable Markdown — read this first
npm run cardex -- decks
npm run cardex -- deck show "Zard test"
npm run cardex -- deck diff "Zard test" "Zard test copy"   # two versions side by side
npm run cardex -- buylist "Zard test"
npm run cardex -- battles "Zard test"                      # record, matchups, saved games
npm run cardex -- battle show "Zard test"                  # the latest game as a transcript
npm run cardex -- battle add "Zard test" --from log.txt --opponent-deck "Grimmsnarl ex"
npm run cardex -- deck create "Lost Box" --from list.txt --folder Standard/2026
npm run cardex -- deck set "Lost Box" "SVI 166" 4
npm run cardex -- add "3 MEG 21 rh" --lot "july.2 lot" --create-lot
npm run cardex -- lot create "august box" --folder 2026/eBay
npm run cardex -- lot move "july.2 lot" --folder 2026
```

`list.txt` is a PTCGL decklist: `4 Charizard ex OBF 125` per line, optional
`Pokémon:`/`Trainer:`/`Energy:` headers. Name-less lines like `3 MEG 21` work too.

MCP (stdio), same operations: `CARDEX_DATA=/path/to/cardex-data.json npm run mcp`.
For Claude Code: `claude mcp add cardex -e CARDEX_DATA=<path> -- npm run mcp --prefix <repo>`.

Battle logs are pasted TCG Live text saved against a deck; everything a replay shows is parsed
from that text on demand by `src/lib/tcg/battle-log/` (parse → replay → summary), never stored.
Read a deck's record before advising on it — `cardex export` includes it. The text itself is
gzipped at rest (`battle-log/storage.ts`), so never read `log.text` directly: it is only the
log when `log.encoding` is `'plain'`. Use `unpackLogText`, or `logTexts` in a component.

Coaching guidance (formats, rules to check, how to answer): `docs/deck-coach-prompt.md`.
Card facts: `static/catalogue.json` (schema in `src/lib/catalogue-format.ts`) and
`static/details/<setId>.json`; `npm run cardex -- search <name>` is the quick way in.

## If the user wants code changes

- `npm test` (vitest), `npm run check` (svelte-check), `npm run build` (static build). CI runs
  test + build on push to `master` and deploys to GitHub Pages.
- Pure logic lives in `src/lib/data` (model, migrate, mutations, repair, merge),
  `src/lib/tcg` (parser, resolver, quick-add, card-query, buylist, legality, exporter,
  battle-log) and
  `src/lib/agent` (readable export, agent API). Test those with plain vitest; Svelte
  components are not unit-tested.
- Display choices that describe the browser rather than the collection (which shell a card
  opens in, say) go in `src/lib/prefs.svelte.ts` — its own localStorage key, never synced.
- The store (`src/lib/store.svelte.ts`) is a thin wrapper: call a reducer, then persist.
  Add new writes as reducers first.
- Keep `updatedAt` stamping and tombstones intact in any new mutation, or sync breaks.
- Do not edit `static/catalogue.json` by hand; `npm run build:catalogue` regenerates it.
- PWA: the manifest, worker and caching rules are the `SvelteKitPWA` block in
  `vite.config.ts`; install detection is `src/lib/pwa/`. Two traps: the app renders
  client-side (`ssr = false`), so anything a browser must see before hydration — manifest
  link, icons, Apple meta — belongs in `src/app.html`, not a `<svelte:head>`; and
  `navigateFallback` must name a *precached* file, which `404.html` is not (the adapter
  writes it after the worker is generated), or every offline deep link fails.
