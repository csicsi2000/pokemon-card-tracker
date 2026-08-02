<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly } from 'svelte/transition';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · Cardex</title></svelte:head>

<div class="grid min-h-svh place-items-center p-6">
	<div in:fly={{ y: 12, duration: 400 }} class="w-full max-w-sm">
		<div class="mb-8 flex flex-col items-center gap-3 text-center">
			<span class="bg-primary ring-primary/15 size-12 rounded-full ring-8"></span>
			<div>
				<h1 class="text-2xl font-semibold tracking-tight">Cardex</h1>
				<p class="text-muted-foreground text-sm">Your Pokémon collection and decks.</p>
			</div>
		</div>

		<Card.Root>
			<Card.Content class="pt-6">
				<form
					method="POST"
					action="?/login"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
					class="flex flex-col gap-4"
				>
					<div class="flex flex-col gap-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							value={form?.email ?? ''}
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="password">Password</Label>
						<Input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
						/>
					</div>

					{#if form?.message}
						<div in:fly={{ y: -6, duration: 200 }}>
							<Alert.Root variant="destructive">
								<CircleAlert class="size-4" />
								<Alert.Description>{form.message}</Alert.Description>
							</Alert.Root>
						</div>
					{/if}

					<Button type="submit" disabled={submitting} class="w-full">Sign in</Button>
					<Button
						type="submit"
						formaction="?/signup"
						variant="ghost"
						disabled={submitting}
						class="w-full"
					>
						Create account
					</Button>
				</form>
			</Card.Content>
		</Card.Root>

		<p class="text-muted-foreground mt-6 text-center text-xs">
			Single-user app — create your account once, then turn off signups in the Supabase dashboard.
		</p>
	</div>
</div>
