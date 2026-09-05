<script lang="ts">
	/**
	 * Create a wants list — a named group of cards you are hunting for ("Trade targets",
	 * "Charizard binder"). Wants that name no list sit on the default Main list.
	 */
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { store } from '$lib/store.svelte';
	import type { WantList } from '$lib/data/model';

	let {
		open = $bindable(false),
		oncreate
	}: {
		open?: boolean;
		/** Fires once the list exists, with the new list. */
		oncreate?: (list: WantList) => void;
	} = $props();

	let name = $state('');
	let note = $state('');

	// Every opening starts from a clean form.
	$effect(() => {
		if (open) {
			name = '';
			note = '';
		}
	});

	function create(event: SubmitEvent) {
		event.preventDefault();
		const list = store.createWantList({
			name: name.trim() || 'New list',
			note: note.trim() || null
		});
		open = false;
		oncreate?.(list);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New wants list</Dialog.Title>
			<Dialog.Description>
				A separate hunt — cards for a deck you are building, targets for a trade, a binder you
				are completing. Wants can be moved between lists later.
			</Dialog.Description>
		</Dialog.Header>
		<form onsubmit={create} class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="want-list-name">Name</Label>
				<!-- svelte-ignore a11y_autofocus -->
				<Input id="want-list-name" bind:value={name} required autofocus placeholder="Trade targets" />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="want-list-note">Note</Label>
				<Input
					id="want-list-note"
					bind:value={note}
					placeholder="For the January trade night — nothing over CHF 20"
				/>
			</div>
			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
