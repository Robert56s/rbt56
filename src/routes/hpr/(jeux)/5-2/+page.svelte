<div class="page">
    <img src="/hpr/page4.webp" alt="" class="car">
    <div class="text">
        Bonne réponse ! Léa recueille plus d’informations avant de cibler un suspect.
        <br>Une bonne enquête commence par les faits, pas par les suppositions.
    </div>
    <a href="/hpr/6/" class="continuer">
            Continuer
    </a>
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
        font-size: 1.5em;
        color: #000000;
        background-color: rgb(247, 180, 255);
        border-radius: 0.4em;
        padding: 0.5em;
        margin-top: 1em;
    }
</style>