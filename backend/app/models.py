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
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    
    event = relationship("Event", back_populates="articles")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String)
    main_location = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    start_date = Column(DateTime, default=datetime.datetime.utcnow)
    last_update = Column(DateTime, onupdate=datetime.datetime.utcnow)
    damage_info = Column(JSON) 
    # Usiamo 'confidence_score' come avevi scritto tu nel DB
    confidence_score = Column(Float) 
    status = Column(String, default="new")
    
    articles = relationship("Article", back_populates="event")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name= Column(String)
    email = Column(String, unique=True)
    phone = Column(String)

    #posizione dell'immobile e dell'assicurato
    latitude = Column(Float)
    longitude = Column(Float)
    address = Column(String)

    # Dettagli Polizza
    policy_type = Column(String) # es. "Auto", "Casa", "Agricola"
    policy_number = Column(String, unique=True)
    
    # Suggerimento Attributi Extra:
    risk_level = Column(Float, default=1.0) # Un moltiplicatore di rischio basato sulla vulnerabilità
    last_notified = Column(DateTime, nullable=True)
