import random

from sqlalchemy.orm import Session

from .constants import FIRST_NAMES, ITALIAN_CITY_ANCHORS, LAST_NAMES, POLICY_TYPES
from .models import User


def create_test_users_batch(
    db: Session,
    count: int = 1000,
    reset_existing: bool = True,
) -> dict[str, int | bool | str]:
    total_users = max(1, min(count, 5000))

    if reset_existing:
        db.query(User).delete()
        db.commit()

    rng = random.Random(42)
    users: list[User] = []

    for index in range(total_users):
        city = ITALIAN_CITY_ANCHORS[index % len(ITALIAN_CITY_ANCHORS)]
        first_name = FIRST_NAMES[index % len(FIRST_NAMES)]
        last_name = LAST_NAMES[(index * 3) % len(LAST_NAMES)]
        latitude = city["latitude"] + rng.uniform(-0.18, 0.18)
        longitude = city["longitude"] + rng.uniform(-0.22, 0.22)
        policy_type = POLICY_TYPES[index % len(POLICY_TYPES)]
        risk_level = round(rng.uniform(0.85, 1.55), 2)

        users.append(
            User(
                full_name=f"{first_name} {last_name}",
                email=f"cliente{index + 1:04d}@demo-unipol.it",
                phone=f"+39 3{rng.randint(10, 49)}{rng.randint(1000000, 9999999)}",
                latitude=latitude,
                longitude=longitude,
                address=f"{city['city']}, {city['province']}, {city['region']}",
                policy_type=policy_type,
                policy_number=f"POL-{index + 1:05d}",
                risk_level=risk_level,
            )
        )

    db.add_all(users)
    db.commit()
    return {"status": "Utenti creati", "count": len(users), "reset_existing": reset_existing}
