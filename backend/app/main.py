from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.concurrency import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, selectinload
import uvicorn

from .database import get_db, init_db
from .demo_data import create_test_users_batch
from .event_logic import is_large_area_event, serialize_event
from .ingestion import build_manual_article_meta, ingest_article_metadata, run_ingestion_batch
from .models import Article, Event, User


env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Extreme Weather Intelligence Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "API is running", "status": "ok"}


@app.post("/run-ingestion")
def run_ingestion(
    days_back: int = 31,
    max_candidates: int = 12,
    max_new_events: int = 5,
    db: Session = Depends(get_db),
):
    return run_ingestion_batch(
        db=db,
        days_back=days_back,
        max_candidates=max_candidates,
        max_new_events=max_new_events,
    )


@app.post("/ingest-article")
def ingest_article(
    url: str,
    title: str | None = None,
    source: str | None = None,
    db: Session = Depends(get_db),
):
    meta = build_manual_article_meta(url=url, title=title, source=source)
    return ingest_article_metadata(meta, db)


@app.post("/purge-large-events")
def purge_large_events(
    max_radius_km: float = 3.5,
    dry_run: bool = True,
    db: Session = Depends(get_db),
):
    events = db.query(Event).options(selectinload(Event.articles)).all()
    matched = [event for event in events if is_large_area_event(event, max_radius_km)]

    payload = [
        {
            "id": event.id,
            "main_location": event.main_location,
            "event_type": event.event_type,
            "radius_km": event.damage_info.get("radius_km") if isinstance(event.damage_info, dict) else None,
            "geo_precision": event.damage_info.get("geo_precision") if isinstance(event.damage_info, dict) else None,
        }
        for event in matched
    ]

    if dry_run:
        return {"status": "dry-run", "matched": len(payload), "events": payload}

    for event in matched:
        db.query(Article).filter(Article.event_id == event.id).delete()
        db.delete(event)

    db.commit()
    return {"status": "deleted", "deleted": len(payload), "events": payload}


@app.post("/create-test-users")
def create_test_users(
    count: int = 1000,
    reset_existing: bool = True,
    db: Session = Depends(get_db),
):
    return create_test_users_batch(db=db, count=count, reset_existing=reset_existing)


@app.get("/customers")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    events = db.query(Event).options(selectinload(Event.articles)).all()
    return [serialize_event(event) for event in events]


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
