<script>
	// One labelled range control with a live readout, for the small
	// interactive figures in the beginner sections.
	let { value = $bindable(), label, min, max, step = 0.01, fmt = (v) => String(v), log = false } = $props();

	// a log slider maps its own linear position onto the value
	const pos = $derived(log ? Math.log(value / min) / Math.log(max / min) : value);
	function onInput(e) {
		const raw = Number(e.currentTarget.value);
		value = log ? min * Math.pow(max / min, raw) : raw;
	}
</script>

<label class="ctl">
	<span class="name">{label}</span>
	<input type="range" min={log ? 0 : min} max={log ? 1 : max} step={log ? 0.001 : step} value={pos} oninput={onInput} />
	<output>{fmt(value)}</output>
</label>

<style>
	.ctl {
		display: grid;
		grid-template-columns: minmax(9rem, 14rem) 1fr 5.5rem;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.85rem;
	}

	.name {
		color: var(--textDim);
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--blue);
	}

	output {
		font-family: var(--mono);
		font-size: 0.82rem;
		text-align: right;
	}

	@media (max-width: 620px) {
		.ctl {
			grid-template-columns: 1fr 4.5rem;
		}

		.name {
			grid-column: 1 / -1;
		}
	}
</style>
