<script lang="ts">
	import { enhance } from '$app/forms';
	import { runAction } from '$lib/actions';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardSearchPanel from '$lib/components/CardSearchPanel.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Alert from '$lib/components/ui/alert';
	import { cardImage } from '$lib/tcg/queries';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { CardWithSet } from '$lib/database.types';

	let { data, form } = $props();

	let name = $state(data.format.name);
	let deckMin = $state(data.rules.deckSize.min);
	let deckMax = $state(data.rules.deckSize.max);
	let maxCopies = $state(data.rules.maxCopiesPerName);
	let basicEnergyExempt = $state(data.rules.basicEnergyExempt);
	let singleton = $state(data.rules.singleton);
	let poolType = $state(data.rules.pool.type);
	let poolSetIds = $state(data.rules.pool.setIds);
	let bannedNames = $state(data.rules.bannedNames.join('\n'));
	let poolText = $state('');

	const POOL_LABELS: Record<string, string> = {
		all: 'Every card ever printed',
		standard: 'Standard-legal sets',
		expanded: 'Expanded-legal sets',
		sets: 'Chosen sets',
		explicit: 'A hand-picked pool (Cube)'
	};

	$effect(() => {
		if (form && 'added' in form && form.added) {
			toast.success(
				`Added ${form.added} cards${'unmatched' in form && form.unmatched ? `, ${form.unmatched} unmatched` : ''}`
			);
		}
	});

	async function addToPool(card: CardWithSet) {
		try {
			await runAction('?/addCard', { cardId: card.id, quantity: 1 });
		} catch (error) {
			toast.error((error as Error).message);
		}
	}
</script>

<svelte:head><title>{data.format.name} · Cardex</title></svelte:head>

<PageHeader title={data.format.name} subtitle={data.format.description ?? 'Custom format'} />

<div class="grid gap-6 p-4 md:p-8 lg:grid-cols-[1fr_320px]">
	<div class="flex min-w-0 flex-col gap-5">
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<StatTile label="Cards in pool" value={data.pool.length} />
			<StatTile
				label="Copies in pool"
				value={data.pool.reduce((sum, row) => sum + row.quantity, 0)}
			/>
			<StatTile
				label="Owned"
				value={`${Math.round(data.buylist.coverage * 100)}%`}
				hint="of the pool"
			/>
			<StatTile label="To buy" value={data.buylist.totalMissing} />
		</div>

		<Tabs.Root value={data.rules.pool.type === 'explicit' ? 'pool' : 'rules'}>
			<Tabs.List>
				<Tabs.Trigger value="pool">
					Pool
					{#if data.pool.length}<Badge variant="secondary" class="ml-1.5">{data.pool.length}</Badge>{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="buy">
					Buylist
					{#if data.buylist.rows.length}
						<Badge variant="secondary" class="ml-1.5">{data.buylist.rows.length}</Badge>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger value="rules">Rules</Tabs.Trigger>
			</Tabs.List>

			<Tabs.Content value="pool" class="flex flex-col gap-4 pt-4">
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">Fill the pool</Card.Title>
						<Card.Description>
							Paste a list in pkmn.gg / PTCGL format, or pull in everything you own.
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3">
						<form method="POST" action="?/importPool" use:enhance class="flex flex-col gap-2">
							<Textarea
								name="text"
								bind:value={poolText}
								rows={5}
								spellcheck={false}
								placeholder={'1 Charizard ex OBF 125\n1 Iono PAL 185'}
								class="font-mono text-sm"
							/>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" size="sm">Add from list</Button>
							</div>
						</form>
						<form method="POST" action="?/importFromCollection" use:enhance>
							<Button type="submit" size="sm" variant="outline">Add everything I own</Button>
						</form>
					</Card.Content>
				</Card.Root>

				{#if data.pool.length === 0}
					<p class="text-muted-foreground py-10 text-center text-sm">
						The pool is empty. Search on the right or paste a list above.
					</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each data.pool as row (row.card.id)}
							<div
								animate:flip={{ duration: 200 }}
								in:fly|global={{ y: 6, duration: 180 }}
								class="flex items-center gap-3 rounded-lg border p-2"
							>
								{#if row.card.image_url}
									<img
										src={cardImage(row.card.image_url)}
										alt=""
										loading="lazy"
										class="h-12 w-9 shrink-0 rounded object-cover"
									/>
								{:else}
									<div class="bg-muted h-12 w-9 shrink-0 rounded"></div>
								{/if}
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{row.card.name}</p>
									<p class="text-muted-foreground truncate text-xs">
										{row.card.set?.ptcgl_code ?? row.card.set_id} · #{row.card.local_id}
									</p>
								</div>
								<Badge variant="outline">×{row.quantity}</Badge>
								<form method="POST" action="?/removeCard" use:enhance>
									<input type="hidden" name="cardId" value={row.card.id} />
									<Button
										type="submit"
										variant="ghost"
										size="icon"
										class="text-muted-foreground hover:text-destructive size-7"
										aria-label="Remove from pool"
									>
										<Trash2 class="size-3.5" />
									</Button>
								</form>
							</div>
						{/each}
					</div>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="buy" class="pt-4">
				{#if data.pool.length === 0}
					<p class="text-muted-foreground py-10 text-center text-sm">
						Add cards to the pool to see what you still need.
					</p>
				{:else if data.buylist.rows.length === 0}
					<Alert.Root>
						<CircleCheck class="size-4" />
						<Alert.Title>You already own everything in this pool.</Alert.Title>
					</Alert.Root>
				{:else}
					<Card.Root>
						<Card.Header>
							<Card.Title class="flex items-center gap-2">
								<ShoppingCart class="size-4" />
								{data.buylist.totalMissing} cards to buy
							</Card.Title>
							<Card.Description>
								What is missing between your collection and this pool.
							</Card.Description>
						</Card.Header>
						<Card.Content class="flex flex-col gap-1">
							{#each data.buylist.rows as row (row.name)}
								<div class="flex items-center justify-between gap-3 py-1.5">
									<div class="min-w-0">
										<p class="truncate text-sm">{row.name}</p>
										<p class="text-muted-foreground text-xs">
											own {row.owned} of {row.needed} · e.g. {row.suggestion.set?.ptcgl_code ??
												row.suggestion.set_id} #{row.suggestion.local_id}
										</p>
									</div>
									<Badge variant="destructive">+{row.missing}</Badge>
								</div>
								<Separator />
							{/each}
						</Card.Content>
					</Card.Root>
				{/if}
			</Tabs.Content>

			<Tabs.Content value="rules" class="pt-4">
				<Card.Root>
					<Card.Content class="pt-6">
						<form method="POST" action="?/saveRules" use:enhance class="flex flex-col gap-5">
							<div class="flex flex-col gap-2">
								<Label for="format-name">Name</Label>
								<Input id="format-name" name="name" bind:value={name} />
							</div>

							<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
								<div class="flex flex-col gap-2">
									<Label for="deckMin">Min deck size</Label>
									<Input id="deckMin" name="deckMin" type="number" min="1" bind:value={deckMin} />
								</div>
								<div class="flex flex-col gap-2">
									<Label for="deckMax">Max deck size</Label>
									<Input id="deckMax" name="deckMax" type="number" min="1" bind:value={deckMax} />
								</div>
								<div class="flex flex-col gap-2">
									<Label for="maxCopies">Copies per name</Label>
									<Input
										id="maxCopies"
										name="maxCopies"
										type="number"
										min="1"
										bind:value={maxCopies}
									/>
								</div>
							</div>

							<div class="flex flex-col gap-3">
								<div class="flex items-center justify-between gap-3">
									<Label for="singleton" class="font-normal">
										Singleton — one copy of each name
									</Label>
									<Switch id="singleton" name="singleton" bind:checked={singleton} />
								</div>
								<div class="flex items-center justify-between gap-3">
									<Label for="basicEnergyExempt" class="font-normal">
										Basic energy ignores copy limits
									</Label>
									<Switch
										id="basicEnergyExempt"
										name="basicEnergyExempt"
										bind:checked={basicEnergyExempt}
									/>
								</div>
							</div>

							<div class="flex flex-col gap-2">
								<Label>Card pool</Label>
								<Select.Root
									type="single"
									value={poolType}
									onValueChange={(value) => (poolType = (value ?? 'all') as typeof poolType)}
								>
									<Select.Trigger>{POOL_LABELS[poolType]}</Select.Trigger>
									<Select.Content>
										{#each Object.entries(POOL_LABELS) as [value, label] (value)}
											<Select.Item {value}>{label}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
								<input type="hidden" name="poolType" value={poolType} />
							</div>

							{#if poolType === 'sets'}
								<div class="flex flex-col gap-2" transition:fly={{ y: -6, duration: 150 }}>
									<Label>Allowed sets</Label>
									<div class="max-h-56 overflow-y-auto rounded-lg border p-2">
										{#each data.sets as set (set.id)}
											<label class="hover:bg-accent flex items-center gap-2 rounded p-1 text-sm">
												<input
													type="checkbox"
													value={set.id}
													bind:group={poolSetIds}
												/>
												{set.name}
												{#if set.ptcgl_code}
													<span class="text-muted-foreground text-xs">({set.ptcgl_code})</span>
												{/if}
											</label>
										{/each}
									</div>
									<input type="hidden" name="poolSetIds" value={poolSetIds.join(',')} />
								</div>
							{/if}

							<div class="flex flex-col gap-2">
								<Label for="bannedNames">Banned cards — one name per line</Label>
								<Textarea id="bannedNames" name="bannedNames" bind:value={bannedNames} rows={4} />
							</div>

							<div>
								<Button type="submit">Save rules</Button>
							</div>
						</form>
					</Card.Content>
				</Card.Root>
			</Tabs.Content>
		</Tabs.Root>
	</div>

	<aside class="lg:sticky lg:top-24 lg:h-[calc(100svh-8rem)]">
		<Card.Root class="flex h-full flex-col">
			<Card.Header>
				<Card.Title class="text-base">Add to pool</Card.Title>
			</Card.Header>
			<Card.Content class="flex min-h-0 flex-1 flex-col">
				<CardSearchPanel onadd={addToPool} placeholder="Search cards…" />
			</Card.Content>
		</Card.Root>
	</aside>
</div>
