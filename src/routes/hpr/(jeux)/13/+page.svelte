<div class="page">
    <img src="/hpr/page13.webp" alt="" class="car">
    <div class="text">
        Jean-Michel n'a toujours rien trouvé et se sent inutile.
    </div>
    <div class="container">
        <a href="/hpr/14-1/" class="continuer">
            L'exclure
        </a>
        <a href="/hpr/14-2/" class="continuer">
            Rappeler à Jean-Michel qu'il est important
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