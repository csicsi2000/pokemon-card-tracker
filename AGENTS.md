# Working in this repo as an agent

Cardex is a SvelteKit 2 / Svelte 5 static app (TypeScript, Tailwind, vitest). No server.
The user's data is a single JSON document (`UserData`, see `src/lib/data/model.ts`) kept
in the browser and optionally synced to Google Drive as `Cardex/cardex-data.json`.

## If the user wants deck-building help

Use the CLI or the MCP server below; do not hand-edit the JSON. Every write goes through
`src/lib/data/mutations.ts`, which stamps timestamps and tombstones so the app merges the
change cleanly on its next sync.

The data file is chosen by `--file PATH`, the `CARDEX_DATA` env var, or `./cardex-data.json`:

- a backup the user exported (Import / Export → Backup → Download backup), or
- the live file mirrored to disk by Google Drive for Desktop
  (`G:\My Drive\Cardex\cardex-data.json` or similar) — edits then reach every device.

```bash
npm run cardex -- help
npm run cardex -- export            # whole collection as readable Markdown — read this first
npm run cardex -- decks
npm run cardex -- deck show "Zard test"
npm run cardex -- buylist "Zard test"
npm run cardex -- deck create "Lost Box" --from list.txt --folder Standard/2026
npm run cardex -- deck set "Lost Box" "SVI 166" 4
npm run cardex -- add "3 MEG 21 rh" --lot "july.2 lot" --create-lot
```

`list.txt` is a PTCGL decklist: `4 Charizard ex OBF 125` per line, optional
`Pokémon:`/`Trainer:`/`Energy:` headers. Name-less lines like `3 MEG 21` work too.

MCP (stdio), same operations: `CARDEX_DATA=/path/to/cardex-data.json npm run mcp`.
For Claude Code: `claude mcp add cardex -e CARDEX_DATA=<path> -- npm run mcp --prefix <repo>`.

Coaching guidance (formats, rules to check, how to answer): `docs/deck-coach-prompt.md`.
Card facts: `static/catalogue.json` (schema in `src/lib/catalogue-format.ts`) and
`static/details/<setId>.json`; `npm run cardex -- search <name>` is the quick way in.

## If the user wants code changes

- `npm test` (vitest), `npm run check` (svelte-check), `npm run build` (static build). CI runs
  test + build on push to `master` and deploys to GitHub Pages.
- Pure logic lives in `src/lib/data` (model, migrate, mutations, repair, merge),
  `src/lib/tcg` (parser, resolver, quick-add, buylist, legality, exporter) and
  `src/lib/agent` (readable export, agent API). Test those with plain vitest; Svelte
  components are not unit-tested.
- The store (`src/lib/store.svelte.ts`) is a thin wrapper: call a reducer, then persist.
  Add new writes as reducers first.
- Keep `updatedAt` stamping and tombstones intact in any new mutation, or sync breaks.
- Do not edit `static/catalogue.json` by hand; `npm run build:catalogue` regenerates it.
