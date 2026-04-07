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
ALLOWED_DOMAINS = ("ansa.it",)
ALLOWED_SOURCES = ("ansa", "ansa.it")

EVENT_KEYWORDS = (
    "alluvione",
    "allagamento",
    "grandine",
    "grandinata",
    "tempesta",
    "temporale",
    "tromba d'aria",
    "esondazione",
    "nubifragio",
    "maltempo",
    "incendio boschivo",
    "rogo",
)

IMPACT_KEYWORDS = (
    "danni",
    "allagata",
    "allagati",
    "allagamenti",
    "evacuati",
    "evacuate",
    "chiusa",
    "chiuse",
    "chiusi",
    "frana",
    "soccorso",
    "vigili del fuoco",
    "protezione civile",
    "intervento",
    "crollo",
    "smottamento",
    "esondato",
    "esondazione",
)

EXCLUDED_KEYWORDS = (
    "polizza",
    "polizze",
    "assicurazione",
    "assicurazioni",
    "premi",
    "premio",
    "imprese",
    "obbligatoria",
    "costo",
    "simulazioni",
    "studio",
    "studi",
    "report",
    "rapporto",
    "analisi",
    "dati",
    "osservatorio",
    "previsioni",
    "previsione",
    "climatologo",
    "scenario",
    "mercato",
    "trend",
)

def is_relevant_weather_article(article: dict) -> bool:
    source_name = (article.get("source", {}).get("name") or "").strip().lower()
    url = (article.get("url") or "").strip().lower()

    if source_name not in ALLOWED_SOURCES and not any(domain in url for domain in ALLOWED_DOMAINS):
        return False

    haystack = " ".join(
        [
            article.get("title") or "",
            article.get("description") or "",
        ]
    ).lower()

    if any(keyword in haystack for keyword in EXCLUDED_KEYWORDS):
        return False

    has_event_keyword = any(keyword in haystack for keyword in EVENT_KEYWORDS)
    has_impact_keyword = any(keyword in haystack for keyword in IMPACT_KEYWORDS)
    return has_event_keyword and (has_impact_keyword or "maltempo" in haystack or "nubifragio" in haystack)

def merge_unique_articles(*collections: list[dict]) -> list[dict]:
    unique_articles: list[dict] = []
    seen_urls: set[str] = set()

    for collection in collections:
        for article in collection:
            url = article.get("url")
            if not url or url in seen_urls:
                continue
            seen_urls.add(url)
            unique_articles.append(article)

    return unique_articles

def fetch_newsapi_articles(params: dict) -> list[dict]:
    with httpx.Client() as client:
        response = client.get(NEWS_API_URL, params=params)
        if response.status_code != 200:
            print(f"Errore NewsAPI: {response.status_code}")
            return []

        return response.json().get("articles", [])

def fetch_weather_news(days_back: int = 7, page_size: int = 20):
    """Recupera i link delle notizie recenti su eventi climatici in Italia."""
    yesterday = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')

    base_params = {
        "from": yesterday,
        "sortBy": "publishedAt",
        "language": "it",
        "domains": ",".join(ALLOWED_DOMAINS),
        "searchIn": "title,description",
        "pageSize": page_size,
        "apiKey": NEWS_API_KEY,
    }

    strict_query_params = {
        **base_params,
        "q": '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR "temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR "incendio boschivo" OR "rogo") AND (Italia OR comune OR provincia OR regione OR quartiere OR via) AND (danni OR allagamenti OR evacuati OR chiusure OR "protezione civile" OR "vigili del fuoco" OR frana OR smottamento) -polizza -polizze -assicurazione -assicurazioni -premi -premio -imprese -obbligatoria -simulazioni -borsa -studio -studi -report -rapporto -analisi -dati -mercato -trend',
    }
    broad_query_params = {
        **base_params,
        "q": '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR "temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR "incendio boschivo" OR "rogo") AND (Italia OR comune OR provincia OR regione) -polizza -polizze -assicurazione -assicurazioni -studio -studi -report -rapporto -analisi -dati',
    }

    strict_articles = fetch_newsapi_articles(strict_query_params)
    broad_articles = fetch_newsapi_articles(broad_query_params) if len(strict_articles) < max(3, page_size // 4) else []

    merged_articles = merge_unique_articles(strict_articles, broad_articles)
    filtered_articles = [article for article in merged_articles if is_relevant_weather_article(article)]

    return filtered_articles[:page_size]

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
            
            paragraphs = []

            if "ansa.it" in url:
                selectors = [
                    "article p",
                    "[data-testid='article-body'] p",
                    ".news-article p",
                    ".text p",
                    ".article__content p",
                ]
                for selector in selectors:
                    selected = soup.select(selector)
                    if selected:
                        paragraphs = selected
                        break

            if not paragraphs:
                paragraphs = soup.find_all('p')

            article_text = " ".join([p.get_text() for p in paragraphs])
            
            return article_text.strip() if len(article_text) > 200 else None
            
    except Exception as e:
        print(f"Errore scraping {url}: {e}")
        return None
