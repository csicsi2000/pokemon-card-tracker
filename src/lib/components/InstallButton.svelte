<script lang="ts">
	/**
	 * "Install app" row for the navigation. Renders nothing when the app is already
	 * installed, or when the browser has neither a prompt nor instructions to give.
	 */
	import { cn } from '$lib/utils';
	import { install } from '$lib/pwa/install.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import Download from '@lucide/svelte/icons/download';

	let { class: className }: { class?: string } = $props();

	let open = $state(false);

	async function click() {
		// Chromium: its own dialog. Everyone else: tell them which menu to use.
		if (install.prompts) await install.prompt();
		else open = true;
	}
</script>

{#if install.available}
	<button
		type="button"
		onclick={click}
		class={cn(
			'hover:bg-accent/60 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
			className
		)}
	>
		<Download class="text-muted-foreground size-4 shrink-0" />
		Install app
	</button>
{/if}

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Install Cardex</Dialog.Title>
			<Dialog.Description>
				It then opens from your home screen like a normal app, full screen and offline.
			</Dialog.Description>
		</Dialog.Header>

		{#if install.manual}
			<p class="text-sm font-medium">{install.manual.browser}</p>
			{#if install.manual.possible}
				<ol class="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
					{#each install.manual.steps as step (step)}
						<li>{step}</li>
					{/each}
				</ol>
			{:else}
				{#each install.manual.steps as line (line)}
					<p class="text-muted-foreground text-sm">{line}</p>
				{/each}
			{/if}
		{/if}

		<Dialog.Footer>
			<Button variant="secondary" onclick={() => (open = false)}>Got it</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
