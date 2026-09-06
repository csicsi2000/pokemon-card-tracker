<script lang="ts">
	/**
	 * Create a lot — a named group of cards acquired together, with the date you got them.
	 * Shared by the Lots page and by anywhere a lot can be made inline (LotPicker, the
	 * Collection page), so a group always gets its date and note, not just a name.
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import Package from '@lucide/svelte/icons/package';
	import AppearancePicker from './AppearancePicker.svelte';
	import { store } from '$lib/store.svelte';
	import type { Lot } from '$lib/data/model';
	import type { AppearanceColor } from '$lib/data/appearance';

	let {
		open = $bindable(false),
		folderId = null,
		oncreate
	}: {
		open?: boolean;
		/** Lot folder the new lot is filed in; `null` is the top level. */
		folderId?: string | null;
		/** Fires once the lot exists, with the new lot. */
		oncreate?: (lot: Lot) => void;
	} = $props();

	const today = () => new Date().toISOString().slice(0, 10);

	let name = $state('');
	let acquiredOn = $state(today());
	let note = $state('');
	let color = $state<AppearanceColor | null>(null);
	let icon = $state<string | null>(null);

	// Every opening starts from a clean form, with today's date pre-filled.
	$effect(() => {
		if (open) {
			name = '';
			acquiredOn = today();
			note = '';
			color = null;
			icon = null;
		}
	});

	function create(event: SubmitEvent) {
		event.preventDefault();
		const lot = store.createLot({
			name: name.trim() || 'New lot',
			acquiredOn: acquiredOn || null,
			note: note.trim() || null,
			folderId,
			color,
			icon
		});
		open = false;
		oncreate?.(lot);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New lot</Dialog.Title>
			<Dialog.Description>
				A batch of cards you got together. Name it after the purchase, and date it so your
				collection can be grouped by when things arrived.
			</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={create} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="lot-name">Name</Label>
				<!-- svelte-ignore a11y_autofocus -->
				<Input id="lot-name" bind:value={name} required autofocus placeholder="july.2 lot" />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="lot-date">Acquired on</Label>
				<Input id="lot-date" type="date" bind:value={acquiredOn} />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="lot-note">Note</Label>
				<Input id="lot-note" bind:value={note} placeholder="eBay bulk lot, 300 cards, CHF 45" />
			</div>
			<AppearancePicker bind:color bind:icon id="new-lot">
				{#snippet fallback()}<Package class="size-4" />{/snippet}
			</AppearancePicker>
			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
