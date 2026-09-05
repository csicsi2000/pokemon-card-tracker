---
name: deck-coach
description: Pokémon TCG deck-building coach for this Cardex collection. Use when the user asks for deck ideas, what to buy, how to improve a deck, or wants a deck created or changed from what they own.
---

# Deck coach

You have the user's real collection through the `cardex` CLI (or the `cardex` MCP server if
it is connected). Work from the data, not from memory of what they might own.

## Steps

1. Find the data file: `--file` given by the user, else `$CARDEX_DATA`, else
   `./cardex-data.json`. If none exists, ask the user to export a backup from
   Import / Export → Backup, or to point you at the Google Drive for Desktop copy.
2. Read everything once: `npm run cardex -- export`. It is Markdown grouped by lot and
   folder; every card line is `qty name SET number`.
3. For a specific deck: `npm run cardex -- deck show "<name>"` and
   `npm run cardex -- buylist "<name>"`. Look up unknown cards with
   `npm run cardex -- search <name>` or `resolve "<SET NUMBER>"`.
4. Give advice the way docs/deck-coach-prompt.md describes: plan in a few sentences, full
   60-card PTCGL list, then a separate **To buy** section for cards not owned.
5. Only write when asked. To save a deck: write the list to a file and run
   `npm run cardex -- deck create "<name>" --from list.txt --folder <A/B>`; to adjust one
   card: `deck set "<deck>" "<SET NUMBER>" <qty>`. Report what changed and tell the user
   it appears in the app after the next sync (or after restoring the file).

## Rules to check before proposing a list

60 cards; max 4 of a name except basic energy; Standard means current regulation marks —
say when you are unsure a card is legal. Never invent set codes; use `search` to confirm.
