from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    url = Column(String, unique=True)
    source = Column(String)
    content = Column(String)
    published_at = Column(DateTime)
   # da aggiungere 
    #linked_event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    # Relazione con l'evento consolidato
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    event = relationship("Event", back_populates="articles")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String)  # flood, storm, hail, etc.
    main_location = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    start_date = Column(DateTime, default=datetime.datetime.utcnow)
    last_update = Column(DateTime, onupdate=datetime.datetime.utcnow)
    
    # Dati strutturati estratti dall'AI (danni, persone coinvolte)
    damage_info = Column(JSON) 
    confidence_score = Column(Float) # affidabilità delle info (0.0 a 1.0) da calcolare in base alla quantità e qualità delle fonti
    status = Column(String, default="new") # new, updated, confirmed
    
    articles = relationship("Article", back_populates="event")
    print("definizione tabelle DB e schemi Pydantic")
