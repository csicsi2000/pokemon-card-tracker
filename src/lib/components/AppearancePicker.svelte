<script lang="ts">
	/**
	 * Pick the colour and emoji for a lot or folder. A row of palette swatches, a row of
	 * suggested emoji, and a small box for typing any other character. Both values are
	 * bindable; `onchange` fires after either one moves, for pages that save as you go.
	 */
	import type { Snippet } from 'svelte';
	import Ban from '@lucide/svelte/icons/ban';
	import { Input } from '$lib/components/ui/input';
	import {
		APPEARANCE_COLORS,
		SUGGESTED_ICONS,
		normalizeIcon,
		type AppearanceColor
	} from '$lib/data/appearance';
	import { cn } from '$lib/utils';
	import AppearanceTile from './AppearanceTile.svelte';
	import { COLOR_LABELS, SWATCH } from './appearance-classes';

	let {
		color = $bindable(null),
		icon = $bindable(null),
		fallback,
		onchange,
		id = 'appearance'
	}: {
		color?: AppearanceColor | null;
		icon?: string | null;
		/** Default icon shown in the preview when no emoji is chosen. */
		fallback?: Snippet;
		onchange?: (appearance: { color: AppearanceColor | null; icon: string | null }) => void;
		/** Prefix for the field ids, so two pickers on one page do not collide. */
		id?: string;
	} = $props();

	function setColor(next: AppearanceColor | null) {
		color = next;
		onchange?.({ color, icon });
	}

	function setIcon(next: string | null) {
		icon = next;
		onchange?.({ color, icon });
	}

	/** Typing into the custom box keeps only the first character, so a stray word cannot become the icon. */
	function onCustomInput(event: Event & { currentTarget: HTMLInputElement }) {
		const next = normalizeIcon(event.currentTarget.value);
		event.currentTarget.value = next ?? '';
		setIcon(next);
	}

	const custom = $derived(icon && !(SUGGESTED_ICONS as readonly string[]).includes(icon) ? icon : '');
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-3">
		<span class="text-sm font-medium">Appearance</span>
		<AppearanceTile appearance={{ color, icon }} {fallback} />
	</div>

	<div class="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
		<button
			type="button"
			role="radio"
			aria-checked={color === null}
			aria-label="No colour"
			class={cn(
				'bg-muted text-muted-foreground grid size-7 place-items-center rounded-full transition-transform hover:scale-110',
				color === null && 'ring-foreground ring-offset-background ring-2 ring-offset-2'
			)}
			onclick={() => setColor(null)}
		>
			<Ban class="size-3.5" />
		</button>
		{#each APPEARANCE_COLORS as option (option)}
			<button
				type="button"
				role="radio"
				aria-checked={color === option}
				aria-label={COLOR_LABELS[option]}
				class={cn(
					'size-7 rounded-full transition-transform hover:scale-110',
					SWATCH[option],
					color === option && 'ring-foreground ring-offset-background ring-2 ring-offset-2'
				)}
				onclick={() => setColor(option)}
			></button>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Emoji">
		<button
			type="button"
			aria-pressed={icon === null}
			aria-label="No emoji"
			class={cn(
				'text-muted-foreground hover:bg-accent grid size-8 place-items-center rounded-lg',
				icon === null && 'bg-accent ring-foreground/30 ring-1'
			)}
			onclick={() => setIcon(null)}
		>
			<Ban class="size-3.5" />
		</button>
		{#each SUGGESTED_ICONS as option (option)}
			<button
				type="button"
				aria-pressed={icon === option}
				aria-label={option}
				class={cn(
					'hover:bg-accent grid size-8 place-items-center rounded-lg text-base leading-none',
					icon === option && 'bg-accent ring-foreground/30 ring-1'
				)}
				onclick={() => setIcon(option)}
			>
				{option}
			</button>
		{/each}
		<Input
			id="{id}-icon"
			value={custom}
			oninput={onCustomInput}
			placeholder="Other…"
			aria-label="Any other emoji"
			autocomplete="off"
			class={cn('h-8 w-20 text-center', custom && 'ring-foreground/30 ring-1')}
		/>
	</div>
</div>
