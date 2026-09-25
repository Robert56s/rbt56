<script>
	// The op-amp an LTspice download uses (src/lib/spice/opamps.js), as one
	// field about a grid column wide, set above the download buttons.
	import { OPAMP_MODELS } from '$lib/spice/opamps';

	let { id, value = $bindable(), label = 'Op-amp in the LTspice files' } = $props();
</script>

<div class="field picker">
	<label for={id}>{label}</label>
	<select {id} bind:value>
		{#each Object.values(OPAMP_MODELS) as m (m.id)}
			<option value={m.id}>{m.label}</option>
		{/each}
	</select>
</div>

<style>
	.picker {
		max-width: 260px;
		margin-bottom: 1.1rem;
	}
</style>
