<div class="page">
    <div class="section">
        <a class="sel" href="/hpr/5-1/">
            1. Aller interroger les pieuvres, elles sont sûrement coupables
        </a>
        <a class="sel" href="/hpr/5-2/">
            2. Continuer d'interroger les huîtres
        </a>
    </div>
    <img src="/hpr/a3.webp" alt="" class="car">
</div>

<style>
    .page {
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        background-image: url("/hpr/ocean4.avif");
        
    }
    .car {
        height: 30em;
        margin: -10em;
        user-select: none;
        -webkit-user-drag: none; /* For WebKit browsers (Chrome, Safari) */
        -moz-user-drag: none;    /* For Firefox */
        user-drag: none;         /* Standard property */
    }
    .continuer {
        all: unset;
        cursor: pointer;
        padding: 1em;
        border-radius: 1em;
        border: #2c3e50 solid 0.1em;
        background-color: #cde6ff;
        transition: 0.3s;
        margin-top: 1em;
    }
    .continuer:hover {
        background-color: #dfecf8;
    }
    .continuer:active {
        transform: scale(0.95);
    }

    .text {
        font-size: 2em;
        color: #000000;
        background-color: rgb(247, 180, 255);
        border-radius: 0.4em;
        padding: 0.5em;
        margin-top: 1em;
    }
    .section {
        background-color: plum;
        border: solid 1em pink;
        border-radius: 0.3em;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        margin-inline: 0.5em;
    }
    .sel {
        all: unset;
        cursor: pointer;
        margin: 1em;
        padding: 1em;
        background-color: pink;
        border-radius: 0.3em;
        z-index: 2;
        transition: 0.2s;
    }
    .sel:hover {
        background-color: rgb(255, 213, 220);
    }
    .sel:active {
        transform: scale(0.95);
    }
</style>