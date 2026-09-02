<div class="page">
    <img src="/hpr/page9.webp" alt="" class="car">
    <div class="text">
        Hmm. Dophi est trop gros pour passer.
    </div>
    <div class="container">
        <a href="/hpr/10-1/" class="continuer">
                Laisser Dophi derrière <br> (Plus rapide)
        </a>
        <a href="/hpr/10-2/" class="continuer">
                Contourner par les algue <br> (Plus long)
        </a>
    </div>
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
        height: 70vh;
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
    .container {
        display: flex;
        gap: 1em;
    }
</style>