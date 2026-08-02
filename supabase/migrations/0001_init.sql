-- Pokémon card tracker — initial schema
--
-- Modelling principle:
--   * `cards` rows are PRINTINGS (one row per card in one set).
--   * The collection tracks printings + variants (normal / reverse / holo / firstEdition).
--   * Deck legality and buylists aggregate by card NAME, because PTCG rules count
--     copies per name, not per printing.

create extension if not exists "unaccent";

-- ---------------------------------------------------------------------------
-- Reference data (seeded from TCGdex by scripts/seed-cards.ts, public read-only)
-- ---------------------------------------------------------------------------

create table if not exists sets (
	id             text primary key,          -- TCGdex set id, e.g. 'sv03', 'swshp'
	name           text not null,
	series         text,
	ptcgl_code     text,                      -- PTCGL / pkmn.gg abbreviation, e.g. 'OBF', 'PR-SW'
	release_date   date,
	card_count     int,
	logo_url       text,
	symbol_url     text,
	legal_standard boolean not null default false,
	legal_expanded boolean not null default false,
	updated_at     timestamptz not null default now()
);

create index if not exists sets_ptcgl_code_idx on sets (upper(ptcgl_code));
create index if not exists sets_release_date_idx on sets (release_date desc);

create table if not exists cards (
	id              text primary key,         -- TCGdex card id, e.g. 'sv03-125'
	set_id          text not null references sets (id) on delete cascade,
	local_id        text not null,            -- collector number; text because promos use 'SWSH050'
	name            text not null,
	name_normalized text not null,            -- lowercased, accent/punctuation stripped (computed in seed script)
	supertype       text not null,            -- 'Pokemon' | 'Trainer' | 'Energy'
	subtypes        text[] not null default '{}',
	rarity          text,
	regulation_mark text,
	hp              int,
	types           text[] not null default '{}',
	evolves_from    text,
	image_url       text,                     -- TCGdex asset base; append '/low.webp' or '/high.webp'
	variants        jsonb not null default '{}'::jsonb,
	pricing         jsonb,
	raw             jsonb,
	updated_at      timestamptz not null default now()
);

create index if not exists cards_name_normalized_idx on cards (name_normalized);
create index if not exists cards_name_trgm_idx on cards (name_normalized text_pattern_ops);
create index if not exists cards_set_local_idx on cards (set_id, local_id);
create index if not exists cards_supertype_idx on cards (supertype);

alter table sets enable row level security;
alter table cards enable row level security;

drop policy if exists "sets are readable by everyone" on sets;
create policy "sets are readable by everyone" on sets for select using (true);

drop policy if exists "cards are readable by everyone" on cards;
create policy "cards are readable by everyone" on cards for select using (true);
-- No insert/update/delete policies: only the seed script (service-role key) writes here.

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------

create table if not exists formats (
	id          uuid primary key default gen_random_uuid(),
	user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
	name        text not null,
	description text,
	-- rules shape (validated with zod in src/lib/tcg/format-rules.ts):
	-- { deckSize: {min,max}, maxCopiesPerName, basicEnergyExempt, singleton,
	--   pool: { type: 'all'|'standard'|'expanded'|'sets'|'explicit', setIds?: string[] },
	--   bannedNames: string[] }
	rules       jsonb not null default '{}'::jsonb,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);

create index if not exists formats_user_idx on formats (user_id);

-- Explicit card pool for a custom format (a Cube list: which cards exist and how many copies).
create table if not exists format_cards (
	format_id uuid not null references formats (id) on delete cascade,
	card_id   text not null references cards (id) on delete cascade,
	quantity  int check (quantity is null or quantity > 0),  -- null = unlimited copies
	primary key (format_id, card_id)
);

create table if not exists collection_items (
	id         uuid primary key default gen_random_uuid(),
	user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
	card_id    text not null references cards (id) on delete cascade,
	variant    text not null default 'normal'
		check (variant in ('normal', 'reverse', 'holo', 'firstEdition', 'promo')),
	quantity   int not null default 1 check (quantity >= 0),
	notes      text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, card_id, variant)
);

create index if not exists collection_items_user_idx on collection_items (user_id);
create index if not exists collection_items_card_idx on collection_items (card_id);

create table if not exists decks (
	id          uuid primary key default gen_random_uuid(),
	user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
	name        text not null,
	format_id   uuid references formats (id) on delete set null,
	description text,
	created_at  timestamptz not null default now(),
	updated_at  timestamptz not null default now()
);

create index if not exists decks_user_idx on decks (user_id);

create table if not exists deck_cards (
	deck_id  uuid not null references decks (id) on delete cascade,
	card_id  text not null references cards (id) on delete cascade,
	quantity int not null check (quantity > 0),
	primary key (deck_id, card_id)
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table formats enable row level security;
alter table format_cards enable row level security;
alter table collection_items enable row level security;
alter table decks enable row level security;
alter table deck_cards enable row level security;

drop policy if exists "own formats" on formats;
create policy "own formats" on formats
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own collection" on collection_items;
create policy "own collection" on collection_items
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own decks" on decks;
create policy "own decks" on decks
	for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Join tables inherit ownership from their parent row.
drop policy if exists "own deck cards" on deck_cards;
create policy "own deck cards" on deck_cards
	for all using (
		exists (select 1 from decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid())
	) with check (
		exists (select 1 from decks d where d.id = deck_cards.deck_id and d.user_id = auth.uid())
	);

drop policy if exists "own format cards" on format_cards;
create policy "own format cards" on format_cards
	for all using (
		exists (select 1 from formats f where f.id = format_cards.format_id and f.user_id = auth.uid())
	) with check (
		exists (select 1 from formats f where f.id = format_cards.format_id and f.user_id = auth.uid())
	);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

do $$
declare t text;
begin
	foreach t in array array['formats', 'collection_items', 'decks'] loop
		execute format('drop trigger if exists %I_set_updated_at on %I', t, t);
		execute format(
			'create trigger %I_set_updated_at before update on %I for each row execute function set_updated_at()',
			t, t
		);
	end loop;
end;
$$;
