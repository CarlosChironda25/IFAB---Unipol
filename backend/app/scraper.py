import os
import httpx
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dotenv import load_dotenv

from pathlib import Path

load_dotenv()
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)




NEWS_API_KEY = os.getenv("NEWS_API_KEY")
NEWS_API_URL = "https://newsapi.org/v2/everything"

def fetch_weather_news():
    """Recupera i link delle notizie recenti su eventi climatici in Italia."""
    # Cerchiamo parole chiave specifiche per l'Italia nelle ultime 24 ore
    #yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    #per test prendiamo notizie degli ultimi 7 giorni
    yesterday = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')

    
    params = {
        "q": "(alluvione OR grandine OR tempesta OR 'tromba d'aria' OR esondazione OR incendio OR esondazione) AND Italia -calcio -sport -musica -spettacolo",
        "from": yesterday,
        "sortBy": "publishedAt",
        "language": "it",
        "apiKey": NEWS_API_KEY
    }
    
    with httpx.Client() as client:
        response = client.get(NEWS_API_URL, params=params)
        if response.status_code == 200:
            return response.json().get("articles", [])
        else:
            print(f"Errore NewsAPI: {response.status_code}")
            return []

def scrape_article_content(url: str):
    """Estrae il testo principale da un URL di una testata giornalistica."""
    try:
        with httpx.Client(follow_redirects=True) as client:
            # User-agent per evitare blocchi base
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            response = client.get(url, headers=headers, timeout=10.0)
            
            if response.status_code != 200:
                return None
                
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Pulizia: rimuoviamo script e stili
            for script in soup(["script", "style", "nav", "footer", "header"]):
                script.decompose()
            
            # Tentativo di prendere il corpo centrale (funziona su molti siti di news)
            # Solitamente il testo è in tag <p>
            paragraphs = soup.find_all('p')
            article_text = " ".join([p.get_text() for p in paragraphs])
            
            return article_text.strip() if len(article_text) > 200 else None
            
    except Exception as e:
        print(f"Errore scraping {url}: {e}")
        return None