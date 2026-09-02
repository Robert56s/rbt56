<script>
    import { setContext } from 'svelte';
    import { writable } from 'svelte/store';
	let { children } = $props();

    let size = writable(1);

    setContext("size", size)
    
</script>

<svelte:head>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100..900;1,100..900&display=swap');
		body {
			margin: 0;
			font-family: "Roboto", sans-serif;
			font-optical-sizing: auto;
			font-weight: <weight>;
			font-style: normal;
			font-variation-settings:
			"wdth" 100;
		}
    </style>
</svelte:head>

{@render children()}
<div class="barEdi">
    <div class="charge"> 
        <div class="content" style="width: {($size*88).toFixed(2)}%;">
            <span class="edi">
                EDI
            </span>
        </div>
    </div>
</div>
<style>
    .barEdi {
        position: absolute;
        top: 1em;
        right: 1em;
    }
    .charge {
        width: 6.25em; /* 200px / 2 = 100px -> 100 / 16 = 6.25em */
        height: 3.125em; /* 100px / 2 = 50px -> 50 / 16 = 3.125em */
        border: 0.375em solid plum; /* 12px / 2 = 6px -> 6 / 16 = 0.375em */
        position: relative;
        border-radius: 0.1875em; /* 6px / 2 = 3px -> 3 / 16 = 0.1875em */
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2;
    }
    .charge::before {
        content: '';
        position: absolute;
        width: 0.78125em; /* 25px / 2 = 12.5px -> 12.5 / 16 = 0.78125em */
        height: 1.875em; /* 60px / 2 = 30px -> 30 / 16 = 1.875em */
        background: plum;
        top: 10%;
        left: 100%;
        border-radius: 0.15625em; /* 5px / 2 = 2.5px -> 2.5 / 16 = 0.15625em */
    }
    .content {
        background: rgb(255, 192, 235);
        position: absolute;
        left: 6%;
        height: 80%; 
        display: flex;
        justify-content: center;
        align-items: center;
    }
    
</style>