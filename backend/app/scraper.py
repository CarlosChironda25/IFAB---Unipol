import os
import json
import re
import httpx
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from dotenv import load_dotenv
from urllib.parse import urlparse

from pathlib import Path

load_dotenv()
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

NEWS_API_KEY = os.getenv("NEWS_API_KEY")
NEWS_API_URL = "https://newsapi.org/v2/everything"
BRAVE_SEARCH_API_KEY = os.getenv("BRAVE_SEARCH_API_KEY")
BRAVE_SEARCH_API_URL = "https://api.search.brave.com/res/v1/web/search"
PREFERRED_DOMAINS = (
    "giornaledisicilia.it",
    "livesicilia.it",
    "ilrestodelcarlino.it",
    "bolognatoday.it",
    "rainews.it",
    "ilmattino.it",
    "gazzettadelsud.it",
)

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
    "danneggiato",
    "compromesso",
    "verifica",
    "sopralluogo",
    "messa in sicurezza",
)

LOCAL_DETAIL_KEYWORDS = (
    "via",
    "viale",
    "piazza",
    "quartiere",
    "frazione",
    "contrada",
    "ponte",
    "lungomare",
    "lungofiume",
    "porto",
    "stazione",
    "svincolo",
    "litorale",
    "sottopasso",
    "argine",
    "faro",
    "torrente",
    "cavalcavia",
    "galleria",
)

BROAD_SCOPE_KEYWORDS = (
    "intera regione",
    "in italia",
    "nel paese",
    "su tutto il territorio",
    "nel weekend",
    "nelle prossime ore",
    "allerta meteo",
    "bollettino",
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

PLACE_HINT_PATTERN = re.compile(
    r"\b(?:via|viale|piazza|quartiere|frazione|contrada|ponte|lungomare|lungofiume|porto|stazione|svincolo|"
    r"litorale|sottopasso|argine|faro|torrente|cavalcavia|galleria|parco|ospedale|scuola|palazzo|piazzale)\s+"
    r"[A-ZÀ-ÖØ-Ý0-9][^,;:.()\n]{1,90}",
    re.IGNORECASE,
)

LOCATION_NAME_KEYS = {
    "name",
    "headline",
    "articleSection",
    "keywords",
    "about",
    "mentions",
    "contentLocation",
    "locationCreated",
    "addressLocality",
    "addressRegion",
    "streetAddress",
    "description",
    "alternateName",
}


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def dedupe_strings(values: list[str], limit: int | None = None) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()

    for value in values:
        cleaned = clean_text(value)
        if not cleaned:
            continue

        key = cleaned.casefold()
        if key in seen:
            continue

        seen.add(key)
        deduped.append(cleaned)

        if limit is not None and len(deduped) >= limit:
            break

    return deduped


def extract_json_ld_strings(payload: object, collected: list[str], parent_key: str | None = None) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            key_name = str(key)
            if key_name in LOCATION_NAME_KEYS:
                if isinstance(value, str):
                    collected.append(value)
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, str):
                            collected.append(item)
                        else:
                            extract_json_ld_strings(item, collected, key_name)
                else:
                    extract_json_ld_strings(value, collected, key_name)
            else:
                extract_json_ld_strings(value, collected, key_name)
        return

    if isinstance(payload, list):
        for item in payload:
            extract_json_ld_strings(item, collected, parent_key)
        return

    if parent_key in LOCATION_NAME_KEYS and isinstance(payload, str):
        collected.append(payload)


def extract_place_hints(text_chunks: list[str]) -> list[str]:
    hints: list[str] = []

    for chunk in text_chunks:
        if not chunk:
            continue
        for match in PLACE_HINT_PATTERN.findall(chunk):
            hints.append(match)

    return dedupe_strings(hints, limit=24)

def is_relevant_weather_article(article: dict) -> bool:
    url = (article.get("url") or "").strip().lower()
    hostname = urlparse(url).hostname or ""
    preferred_source = any(domain in hostname for domain in PREFERRED_DOMAINS)

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
    has_local_detail = any(keyword in haystack for keyword in LOCAL_DETAIL_KEYWORDS)
    is_broad_scope = any(keyword in haystack for keyword in BROAD_SCOPE_KEYWORDS)

    score = 0
    score += 2 if has_event_keyword else 0
    score += 2 if has_impact_keyword else 0
    score += 2 if has_local_detail else 0
    score += 1 if preferred_source else 0
    score -= 2 if is_broad_scope else 0

    return score >= 4

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

def derive_source_name(url: str) -> str:
    hostname = urlparse(url).hostname or ""
    return hostname.replace("www.", "")

def build_domain_clause(domains: tuple[str, ...]) -> str:
    return "(" + " OR ".join(f"site:{domain}" for domain in domains) + ")"

def fetch_newsapi_articles(params: dict) -> list[dict]:
    with httpx.Client() as client:
        response = client.get(NEWS_API_URL, params=params)
        if response.status_code != 200:
            print(f"Errore NewsAPI: {response.status_code}")
            return []

        return response.json().get("articles", [])

def fetch_brave_articles(query: str, count: int, freshness: str = "pw") -> list[dict]:
    if not BRAVE_SEARCH_API_KEY:
        return []

    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": BRAVE_SEARCH_API_KEY,
    }
    params = {
        "q": query,
        "count": count,
        "country": "IT",
        "search_lang": "it",
        "spellcheck": 0,
        "safesearch": "off",
        "freshness": freshness,
    }

    with httpx.Client() as client:
        response = client.get(BRAVE_SEARCH_API_URL, headers=headers, params=params, timeout=20.0)
        if response.status_code != 200:
            print(f"Errore Brave Search API: {response.status_code}")
            return []

        payload = response.json()
        results = payload.get("web", {}).get("results", [])
        articles: list[dict] = []

        for index, result in enumerate(results):
            url = result.get("url")
            if not url:
                continue

            articles.append(
                {
                    "title": result.get("title"),
                    "description": result.get("description"),
                    "url": url,
                    "publishedAt": result.get("page_age"),
                    "source": {"name": derive_source_name(url)},
                    "id": f"brave-{index}",
                }
            )

        return articles

def get_brave_freshness(days_back: int) -> str:
    if days_back <= 1:
        return "pd"
    if days_back <= 7:
        return "pw"
    if days_back <= 31:
        return "pm"
    if days_back <= 365:
        return "py"
    return "py"

def fetch_weather_news(days_back: int = 7, page_size: int = 20) -> dict:
    """Recupera i link delle notizie recenti su eventi climatici in Italia."""
    yesterday = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')

    base_params = {
        "from": yesterday,
        "sortBy": "publishedAt",
        "language": "it",
        "searchIn": "title,description",
        "pageSize": page_size,
        "apiKey": NEWS_API_KEY,
    }

    strict_query_params = {
        **base_params,
        "q": '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR "temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR "forte vento" OR "raffiche di vento" OR "incendio boschivo" OR "rogo") AND ("via" OR "piazza" OR "quartiere" OR "frazione" OR "contrada" OR "ponte" OR "faro" OR "lungomare" OR "porto" OR "torrente") AND (danni OR chiusure OR "vigili del fuoco" OR "protezione civile" OR sopralluogo OR "messa in sicurezza") -polizza -polizze -assicurazione -assicurazioni -premi -premio -imprese -obbligatoria -simulazioni -borsa -studio -studi -report -rapporto -analisi -dati -mercato -trend -allerta',
    }
    broad_query_params = {
        **base_params,
        "q": '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR "temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR "forte vento" OR "raffiche di vento" OR "incendio boschivo" OR "rogo") AND (danni OR chiusure OR "vigili del fuoco" OR "protezione civile" OR intervento) -polizza -polizze -assicurazione -assicurazioni -studio -studi -report -rapporto -analisi -dati -allerta',
    }

    if BRAVE_SEARCH_API_KEY:
        freshness = get_brave_freshness(days_back)
        domain_clause = build_domain_clause(PREFERRED_DOMAINS)
        brave_strict_query = (
            f'{domain_clause} '
            '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR '
            '"temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR '
            '"forte vento" OR "raffiche di vento" OR "incendio boschivo" OR "rogo") '
            '("via" OR "viale" OR "piazza" OR "quartiere" OR "frazione" OR "contrada" OR '
            '"ponte" OR "lungomare" OR "porto" OR "faro" OR "argine" OR "torrente" OR "sottopasso") '
            '("danni" OR "crollo" OR "chiusura" OR "vigili del fuoco" OR "sopralluogo" OR '
            '"messa in sicurezza" OR "intervento") Italia -studio -studi -report -analisi -dati -previsioni -allerta'
        )
        brave_broad_query = (
            f'{domain_clause} '
            '("alluvione" OR "allagamento" OR "grandine" OR "grandinata" OR "tempesta" OR '
            '"temporale" OR "tromba d\'aria" OR "esondazione" OR "nubifragio" OR "maltempo" OR '
            '"forte vento" OR "raffiche di vento" OR "incendio boschivo" OR "rogo") '
            '("danni" OR "chiusure" OR "vigili del fuoco" OR "protezione civile" OR "intervento") '
            'Italia -studio -studi -report -analisi -dati -previsioni -allerta'
        )
        brave_queries = [
            brave_strict_query,
            brave_broad_query,
            f'{domain_clause} ("forte vento" OR "raffiche di vento" OR "tempesta" OR "temporale") ("faro" OR "porto" OR "lungomare" OR "ponte" OR "piazza" OR "via") ("danni" OR "compromesso" OR "sopralluogo" OR "messa in sicurezza") Italia -allerta -previsioni -studio',
            f'{domain_clause} ("alluvione" OR "allagamento" OR "nubifragio" OR "esondazione") ("via" OR "quartiere" OR "sottopasso" OR "argine" OR "torrente" OR "contrada" OR "ravone" OR "savena") ("chiusa" OR "allagata" OR "vigili del fuoco" OR "intervento" OR "evacuazioni") Italia -allerta -previsioni -studio',
            f'{domain_clause} ("grandine" OR "grandinata") ("via" OR "quartiere" OR "zona industriale" OR "capannone") ("danni" OR "vetri" OR "coperture" OR "vigili del fuoco") Italia -previsioni -studio',
        ]

        brave_batches = [fetch_brave_articles(query, page_size, freshness=freshness) for query in brave_queries]
        strict_articles = merge_unique_articles(*brave_batches)
        broad_articles = []
        provider = "brave"
    else:
        strict_articles = fetch_newsapi_articles(strict_query_params)
        broad_articles = fetch_newsapi_articles(broad_query_params) if len(strict_articles) < max(3, page_size // 4) else []
        provider = "newsapi"

    merged_articles = merge_unique_articles(strict_articles, broad_articles)
    filtered_articles = [article for article in merged_articles if is_relevant_weather_article(article)]

    return {
        "articles": filtered_articles[:page_size],
        "provider": provider,
        "raw_results": len(merged_articles),
        "filtered_results": len(filtered_articles),
        "strict_results": len(strict_articles),
        "broad_results": len(broad_articles),
    }

def scrape_article_content(url: str):
    """Estrae testo e segnali geografici secondari da un articolo."""
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
            headline = ""
            subheadline = ""
            breadcrumb_items: list[str] = []
            captions: list[str] = []
            image_alts: list[str] = []
            list_items: list[str] = []
            json_ld_fragments: list[str] = []

            title_tag = soup.find("h1")
            headline = clean_text(title_tag.get_text()) if title_tag else ""

            subheadline_selectors = [
                "h2",
                "[class*='subtitle']",
                "[class*='deck']",
                "[class*='summary']",
                "meta[name='description']",
            ]
            for selector in subheadline_selectors:
                if selector.startswith("meta"):
                    node = soup.select_one(selector)
                    content = clean_text(node.get("content")) if node else ""
                else:
                    node = soup.select_one(selector)
                    content = clean_text(node.get_text()) if node else ""
                if content:
                    subheadline = content
                    break

            breadcrumb_nodes = soup.select(
                "[class*='breadcrumb'] a, [class*='breadcrumb'] span, [aria-label*='breadcrumb'] a, "
                "[aria-label*='breadcrumb'] span, nav ol li, nav ul li"
            )
            breadcrumb_items = dedupe_strings([node.get_text() for node in breadcrumb_nodes], limit=12)

            caption_nodes = soup.select("figcaption, [class*='caption'], [class*='didascalia']")
            captions = dedupe_strings([node.get_text() for node in caption_nodes], limit=12)

            image_nodes = soup.select("img[alt], img[title]")
            image_alts = dedupe_strings(
                [node.get("alt", "") or node.get("title", "") for node in image_nodes],
                limit=12,
            )

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

            article_paragraphs = dedupe_strings([p.get_text(" ", strip=True) for p in paragraphs], limit=120)
            article_text = " ".join(article_paragraphs)

            list_nodes = soup.select("article li, main li, [class*='article'] li")
            list_items = dedupe_strings([node.get_text(" ", strip=True) for node in list_nodes], limit=20)

            for node in soup.select("script[type='application/ld+json']"):
                raw_json = clean_text(node.string or node.get_text())
                if not raw_json:
                    continue
                try:
                    parsed = json.loads(raw_json)
                except json.JSONDecodeError:
                    continue
                extract_json_ld_strings(parsed, json_ld_fragments)

            meta_candidates = dedupe_strings(
                [
                    soup.find("meta", attrs={"property": "og:title"}).get("content") if soup.find("meta", attrs={"property": "og:title"}) else "",
                    soup.find("meta", attrs={"property": "og:description"}).get("content") if soup.find("meta", attrs={"property": "og:description"}) else "",
                    soup.find("meta", attrs={"name": "keywords"}).get("content") if soup.find("meta", attrs={"name": "keywords"}) else "",
                ],
                limit=6,
            )

            structured_chunks = [
                headline,
                subheadline,
                *breadcrumb_items,
                *captions,
                *image_alts,
                *list_items,
                *json_ld_fragments,
                *meta_candidates,
                article_text,
            ]
            place_hints = extract_place_hints(structured_chunks)

            if len(article_text) <= 200:
                return None

            return {
                "text": article_text.strip(),
                "headline": headline,
                "subheadline": subheadline,
                "breadcrumbs": breadcrumb_items,
                "captions": captions,
                "image_alts": image_alts,
                "list_items": list_items,
                "json_ld_fragments": dedupe_strings(json_ld_fragments, limit=20),
                "meta_fragments": meta_candidates,
                "place_hints": place_hints,
            }
            
    except Exception as e:
        print(f"Errore scraping {url}: {e}")
        return None
