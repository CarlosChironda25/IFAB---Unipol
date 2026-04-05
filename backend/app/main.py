import os
from pathlib import Path
import time
from dotenv import load_dotenv
# Caricamento ENV in cima a tutto
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

from fastapi import FastAPI, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from .database import SessionLocal, init_db, get_db
from .scraper import fetch_weather_news, scrape_article_content
from .ai_processor import extract_event_data, get_coordinates
from .models import Article, Event
import uvicorn

app = FastAPI(title="Extreme Weather Intelligence Platform")

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/")
def read_root():
    return {"message": "API is running", "status": "ok"}

@app.post("/run-ingestion")
def run_ingestion(db: Session = Depends(get_db)):
    articles_metadata = fetch_weather_news()
    print(f"DEBUG: Trovati {len(articles_metadata)} articoli da NewsAPI.")
    
    count = 0
    for meta in articles_metadata[:3]:# limitiamo a 3 essendo che siamo in fase dii test.
        url = meta.get("url")
        
        # Salta se già presente
        if db.query(Article).filter(Article.url == url).first():
            continue

        full_text = scrape_article_content(url)
        
        if full_text:
            extracted_data = extract_event_data(full_text)
            time.sleep(12)
            # PROTEZIONE: Verifichiamo che i dati esistano prima di usarli
            if extracted_data and isinstance(extracted_data, dict) and 'location' in extracted_data:
                lat, lon = get_coordinates(extracted_data['location'])
                
                if lat and lon:
                    new_event = Event(
                        event_type=extracted_data.get('event_type', 'unknown'),
                        main_location=extracted_data.get('location'),
                        latitude=lat,
                        longitude=lon,
                        damage_info={"description": extracted_data.get('damage_description')},
                        confidence_score=extracted_data.get('confidence_score', 0.0)
                    )
                    db.add(new_event)
                    db.commit()
                    db.refresh(new_event)
                    
                    new_article = Article(
                        title=meta.get("title"),
                        url=url,
                        source=meta.get("source", {}).get("name"),
                        content=full_text,
                        event_id=new_event.id
                    )
                    db.add(new_article)
                    db.commit()
                    count += 1
                    print(f"SUCCESSO: Creato evento a {extracted_data['location']}")
            else:
                print(f"SKIP: Articolo non rilevante o errore AI per {url}")

    return {"status": "completed", "events_created": count}

@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    return db.query(Event).all()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)