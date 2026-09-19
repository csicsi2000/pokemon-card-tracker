<script lang="ts">
	/**
	 * "Copy list" wherever a set of cards can leave the app as text. Two destinations:
	 * PTCGL (deck sites, the importer here) and Cardmarket's wants-list box, which wants
	 * names rather than set codes and needs each Pokémon's ability and attack names with
	 * it. Those live in the per-set detail files, so that format is fetched on demand —
	 * the cheap PTCGL one stays instant.
	 */
	import { toast } from 'svelte-sonner';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import Copy from '@lucide/svelte/icons/copy';
	import { loadCardText } from '$lib/card-details';
	import { toCardmarketText, toPtcglText, type ExportLine } from '$lib/tcg/exporter';

	let {
		lines,
		label = 'List',
		text = 'Copy list',
		disabled = false,
		/** The deck page's actions row has no space for a word on a phone. */
		hideLabelOnPhone = false
	}: {
		lines: ExportLine[];
		/** What the toast calls what was copied. */
		label?: string;
		/** The button's own wording, where "Copy list" would read oddly. */
		text?: string;
		disabled?: boolean;
		hideLabelOnPhone?: boolean;
	} = $props();

	let busy = $state(false);

	async function write(payload: string, what: string) {
		try {
			await navigator.clipboard.writeText(payload);
			toast.success(`${what} copied`);
		} catch {
			toast.error('Could not copy — the browser blocked clipboard access.');
		}
	}

	/** Rules text for every distinct printing in the list; a set file is fetched once. */
	async function cardmarketText() {
		const cards = [...new Map(lines.map(({ card }) => [card.id, card])).values()];
		const texts = await Promise.all(cards.map((card) => loadCardText(card.set.id, card.localId)));
		const byId = new Map(cards.map((card, index) => [card.id, texts[index]]));
		return toCardmarketText(lines, (card) => byId.get(card.id));
	}

	async function copyCardmarket() {
		busy = true;
		try {
			await write(await cardmarketText(), `${label} for Cardmarket`);
		} finally {
			busy = false;
		}
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={buttonVariants({ variant: 'outline', size: 'sm' })}
		disabled={disabled || busy}
	>
		<Copy class="size-4" />
		<span class={hideLabelOnPhone ? 'sr-only sm:not-sr-only' : undefined}>{text}</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60">
		<DropdownMenu.Item onclick={() => write(toPtcglText(lines), label)}>
			<div class="flex flex-col">
				<span>PTCGL decklist</span>
				<span class="text-muted-foreground text-xs">Live, Limitless, this app’s importer</span>
			</div>
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={copyCardmarket}>
			<div class="flex flex-col">
				<span>Cardmarket wants</span>
				<span class="text-muted-foreground text-xs">Paste into “add a decklist to wants”</span>
			</div>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
