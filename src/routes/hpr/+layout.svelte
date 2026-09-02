<script>
	let { children } = $props();
</script>

<svelte:head>
	<title>Qui a volé les perles ?</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}
	</style>
</svelte:head>

{@render children()}
