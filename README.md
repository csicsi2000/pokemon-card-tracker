# Cardex — Pokémon TCG collection & deck tracker

A single-user PWA for tracking a physical Pokémon card collection, building decks,
defining custom formats (Cube, house rules), and working out what still needs buying.
Designed to hand its data to an AI and take decklists back.

- **SvelteKit 2 + Svelte 5** with Tailwind v4 and shadcn-svelte
- **Supabase** for Postgres + auth, with row level security on all user tables
- **TCGdex** as the card catalogue — ~21,000 English printings, synced locally
- Installable PWA with offline card images

## Getting started

```bash
npm install
cp .env.example .env   # fill in from Supabase → Project settings → API Keys
npm run dev
```

Then open the app, click **Create account** once, and — in the Supabase dashboard
under Authentication → Sign In / Providers — turn **Allow new users to sign up** off.
This app is built for one user.

### Seed the card catalogue

```bash
npm run sync:cards
```

Pulls every English set and card from TCGdex into `sets` and `cards`. Idempotent, so
re-run it when a new set releases. Pass set ids to sync a subset: `npm run sync:cards sv03 swshp`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :5173 |
| `npm run build` | Production build |
| `npm test` | Vitest — parser, exporter, legality, buylist |
| `npm run check` | `svelte-check` type checking |
| `npm run check:db` | Runs every PostgREST query the app uses, plus the import pipeline, against the real database |
| `npm run sync:cards` | Sync the card catalogue from TCGdex |

> On Windows, `npm run build` finishes the SvelteKit and PWA steps but the Vercel
> adapter's last step needs symlink permission — turn on Developer Mode, or just let
> Vercel build it.

## How the pieces fit

### Card data

`scripts/seed-cards.ts` reads two TCGdex surfaces, because neither alone is complete:
REST `/sets/{id}` for the PTCGL set code (`OBF`, `PR-SW`) and legality, GraphQL for all
cards of a set in one request. Images are hotlinked to `assets.tcgdex.net` rather than
stored. Prices are not seeded — that would mean ~21k REST calls.

### Printings vs. names

The collection tracks **printings and variants** (normal / reverse / holo / 1st edition),
because that is what sits in a binder. Deck legality and buylists count by **card name**,
because that is how the rules work — four Charmander from four different sets is still
four Charmander.

### Import and export

`src/lib/tcg/` holds pure, dependency-free modules:

- `parser.ts` reads the pkmn.gg / PTCGL / Limitless text format
- `resolver.ts` turns parsed lines into card ids: set code + number first, then
  `set-code-overrides.ts` for promo codes TCGdex lacks, then name, then energy aliases
  (`Basic {R} Energy` → `Fire Energy`)
- `exporter.ts` writes the same format back, plus compact JSON for AI
- `legality.ts` and `buylist.ts` check decks against formats and compute shortfalls

The import screen shows every line with how it was matched and lets you switch printing
before anything is written.

### The AI loop

Import → **Export for AI** copies a JSON snapshot with a preamble telling the model to
answer in PTCGL format. Paste the answer back into the Import tab and it becomes a deck.
No extra infrastructure — the importer is the ingestion path.

Worth asking: *"build five decks from this collection that are balanced against each
other"*, or *"what do I need to buy to run this Cube for four players?"*

A stdio MCP server exposing `get_collection` / `get_buylist` / `create_deck` is the
natural next step, reusing `src/lib/tcg/*` directly.

## Deployment

Push to GitHub and import the repo on Vercel. Set `PUBLIC_SUPABASE_URL` and
`PUBLIC_SUPABASE_ANON_KEY` as environment variables (the secret key is only needed
locally for the sync script).

`.github/workflows/keepalive.yml` pings the database weekly so Supabase does not pause
the free project. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as repository secrets to
enable it.

## Not built yet

Camera card scanning. The schema is ready for it — every card keeps its full TCGdex
payload in `cards.raw`, so a recogniser only has to produce a card id.
