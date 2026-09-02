<div class="book-cover">
    <div class="content">
        <h1 class="main-title">
            <span class="title-line">QUI A VOLÉ</span>
            <span class="title-line">LES PERLES ?</span>
        </h1>
        
        <div class="subtitle">
            <p class="subtitle-line">une histoire sur l'équité ,</p>
            <p class="subtitle-line">la diversité et l'inclusion.</p>
        </div>
        
        <div class="decorative-flourish">
            <svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 30 Q50 10, 80 30 T140 30 Q160 20, 180 30" 
                    stroke="#2c3e50" 
                    stroke-width="2" 
                    fill="none" 
                    stroke-linecap="round"/>
            <circle cx="90" cy="30" r="8" stroke="#2c3e50" stroke-width="2" fill="none"/>
            <circle cx="110" cy="30" r="6" stroke="#2c3e50" stroke-width="2" fill="none"/>
            </svg>
        </div>
        
        <div class="authors">
            <p class="authors-line">écrit par Minh Beaulieu , Ahmed Elsamadouny, Yann Fofana,</p>
            <p class="authors-line">Malcolm Fokou, Mohamed Reda Mifdal, Robert Nelea et Margot Tremblay</p>
        </div>
        
        <div class="illustrator">
            <p>Illustré par Minh Beaulieu</p>
        </div>
        <a href="/hpr/1/" class="continuer">
            Continuer
        </a>
    </div>
</div>

<svelte:head>
    <style>
        * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    }

    body {
    font-family: 'Times New Roman', sans-serif;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: linear-gradient(135deg, #a8e6cf 0%, #dcedc1 25%, #ffd3a5 50%, #fd9853 75%, #a8e6cf 100%);
    background-size: 400% 400%;
    }
    </style>
</svelte:head>

<style>

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

    .book-cover {
    width: 100%;
    max-width: 768px;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    }

    .content {
    text-align: center;
    color: #2c3e50;
    width: 100%;
    max-width: 600px;
    }

    .main-title {
    font-size: 3.5rem;
    font-weight: bold;
    letter-spacing: 0.1em;
    margin-bottom: 2rem;
    line-height: 1.1;
    }

    .title-line {
    display: block;
    }

    .subtitle {
    font-size: 1.8rem;
    font-style: italic;
    margin-bottom: 3rem;
    line-height: 1.4;
    font-weight: 300;
    }

    .subtitle-line {
    margin-bottom: 0.5rem;
    }

    .decorative-flourish {
    margin: 3rem 0;
    display: flex;
    justify-content: center;
    }

    .decorative-flourish svg {
    width: 200px;
    height: 60px;
    opacity: 0.8;
    }

    .authors {
    font-size: 1rem;
    font-style: italic;
    margin-bottom: 2rem;
    line-height: 1.5;
    opacity: 0.9;
    }

    .authors-line {
    margin-bottom: 0.3rem;
    }

    .illustrator {
    font-size: 1.2rem;
    font-style: italic;
    font-weight: 500;
    opacity: 0.9;
    margin-bottom: 2rem;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
    .book-cover {
        padding: 20px;
    }
    
    .main-title {
        font-size: 2.5rem;
    }
    
    .subtitle {
        font-size: 1.4rem;
    }
    
    .authors {
        font-size: 0.9rem;
    }
    
    .illustrator {
        font-size: 1rem;
    }
    
    .decorative-flourish svg {
        width: 150px;
        height: 45px;
    }
    }

    @media (max-width: 480px) {
    .main-title {
        font-size: 2rem;
    }
    
    .subtitle {
        font-size: 1.2rem;
    }
    
    .authors {
        font-size: 0.8rem;
    }
    
    .decorative-flourish svg {
        width: 120px;
        height: 36px;
    }
    }

    /* Subtle animation for text elements */
    .content > * {
    opacity: 0;
    transform: translateY(20px);
    animation: fadeInUp 1s ease-out forwards;
    }

    .main-title {
    animation-delay: 0.2s;
    }

    .subtitle {
    animation-delay: 0.4s;
    }

    .decorative-flourish {
    animation-delay: 0.6s;
    }

    .authors {
    animation-delay: 0.8s;
    }

    .illustrator {
    animation-delay: 1s;
    }

    @keyframes fadeInUp {
    to {
        opacity: 1;
        transform: translateY(0);
    }
    }
</style>