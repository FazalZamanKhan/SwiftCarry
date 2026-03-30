from __future__ import annotations

import json
import math
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from starlette.responses import JSONResponse


app = FastAPI(title="Courier MVP API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "riders.json"
DB_PATH = BASE_DIR / "data" / "courier.db"

LOCATION_COORDS: dict[str, tuple[float, float]] = {
    "karachi": (24.8607, 67.0011),
    "lahore": (31.5204, 74.3587),
    "islamabad": (33.6844, 73.0479),
    "rawalpindi": (33.5651, 73.0169),
    "faisalabad": (31.4504, 73.1350),
    "multan": (30.1575, 71.5249),
    "peshawar": (34.0151, 71.5249),
    "quetta": (30.1798, 66.9750),
    "hyderabad": (25.3960, 68.3578),
    "sialkot": (32.4927, 74.5310),
}

HARD_CODED_USERS = [
    {"id": "U001", "name": "Ali Khan"},
    {"id": "U002", "name": "Sara Ahmed"},
]

DEFAULT_OFFER_WINDOW_MINUTES = 20
DEFAULT_NEGOTIATION_WINDOW_MINUTES = 45
DEFAULT_OFFER_EXPIRY_MINUTES = 15


class DeliveryRequest(BaseModel):
    pickup: str = Field(..., min_length=1)
    dropoff: str = Field(..., min_length=1)
    weight: float | None = Field(default=None, ge=0)
    urgency: str = Field(default="normal")

    @field_validator("pickup", "dropoff")
    @classmethod
    def strip_and_validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"normal", "urgent"}:
            raise ValueError("must be either 'normal' or 'urgent'")
        return normalized


class RiderSearchRequest(BaseModel):
    pickup: str = Field(..., min_length=1)
    dropoff: str = Field(..., min_length=1)
    weight: float | None = Field(default=None, ge=0)
    urgency: str = Field(default="normal")

    @field_validator("pickup", "dropoff")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be empty")
        return cleaned

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"normal", "urgent"}:
            raise ValueError("must be either 'normal' or 'urgent'")
        return normalized


class CreateOrderRequest(RiderSearchRequest):
    user_id: str = Field(..., min_length=1)
    notes: str | None = None


class RiderOfferRequest(BaseModel):
    rider_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    eta_minutes: int | None = Field(default=None, gt=0)
    message: str | None = None


class CounterOfferRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    target_rider_id: str | None = None
    message: str | None = None


class AcceptOfferRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    offer_id: int


class CompleteOrderRequest(BaseModel):
    rider_id: str = Field(..., min_length=1)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def seconds_left(value: str | None) -> int | None:
    dt = parse_iso(value)
    if dt is None:
        return None
    remaining = int((dt - utc_now()).total_seconds())
    return max(0, remaining)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_riders_from_json() -> list[dict[str, Any]]:
    with DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def init_db() -> None:
    conn = get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS riders (
                id TEXT PRIMARY KEY,
                location TEXT NOT NULL,
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                available INTEGER NOT NULL,
                speed REAL NOT NULL,
                rating REAL NOT NULL,
                completed_deliveries INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orders (
                order_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                pickup TEXT NOT NULL,
                dropoff TEXT NOT NULL,
                weight REAL,
                urgency TEXT NOT NULL,
                notes TEXT,
                status TEXT NOT NULL,
                delivery_distance_km REAL NOT NULL,
                candidate_rider_ids TEXT NOT NULL,
                assigned_rider_id TEXT,
                accepted_offer_id INTEGER,
                offer_deadline_at TEXT,
                negotiation_deadline_at TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS offers (
                offer_id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                rider_id TEXT NOT NULL,
                amount REAL NOT NULL,
                eta_minutes INTEGER,
                message TEXT,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT,
                is_active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS negotiation_logs (
                log_id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                actor TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                target_rider_id TEXT,
                amount REAL,
                message TEXT,
                created_at TEXT NOT NULL
            );
            """
        )

        user_count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if user_count == 0:
            conn.executemany(
                "INSERT INTO users(id, name) VALUES (?, ?)",
                [(u["id"], u["name"]) for u in HARD_CODED_USERS],
            )

        # Keep rider city coordinates in sync with the latest intercity dataset.
        riders = load_riders_from_json()
        conn.execute("DELETE FROM riders")
        conn.executemany(
            """
            INSERT INTO riders(id, location, lat, lng, available, speed, rating, completed_deliveries)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    r["id"],
                    r["location"],
                    float(r["lat"]),
                    float(r["lng"]),
                    1 if r.get("available", False) else 0,
                    float(r.get("speed", 0)),
                    float(r.get("rating", 3.5)),
                    int(r.get("completed_deliveries", 0)),
                )
                for r in riders
            ],
        )

        order_count = conn.execute("SELECT COUNT(*) AS c FROM orders").fetchone()["c"]
        if order_count == 0:
            created = utc_now() - timedelta(days=1)
            completed = created + timedelta(hours=3)
            offer_ts = created + timedelta(minutes=20)
            conn.execute(
                """
                INSERT INTO orders(
                    user_id, pickup, dropoff, weight, urgency, notes, status, delivery_distance_km,
                    candidate_rider_ids, assigned_rider_id, offer_deadline_at, negotiation_deadline_at,
                    created_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "U001",
                    "Islamabad",
                    "Lahore",
                    1.5,
                    "normal",
                    "Books delivery",
                    "Completed",
                    13.37,
                    json.dumps(["R101", "R102", "R106"]),
                    "R101",
                    to_iso(created + timedelta(minutes=30)),
                    to_iso(created + timedelta(minutes=60)),
                    to_iso(created),
                    to_iso(completed),
                ),
            )
            order_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
            conn.execute(
                """
                INSERT INTO offers(order_id, rider_id, amount, eta_minutes, message, type, created_at, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    "R101",
                    700,
                    30,
                    "Safe same-day delivery",
                    "rider_offer",
                    to_iso(offer_ts),
                    to_iso(offer_ts + timedelta(minutes=30)),
                    0,
                ),
            )
            offer_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
            conn.execute("UPDATE orders SET accepted_offer_id = ? WHERE order_id = ?", (offer_id, order_id))
            conn.execute(
                """
                INSERT INTO negotiation_logs(order_id, actor, actor_id, target_rider_id, amount, message, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    "rider",
                    "R101",
                    None,
                    700,
                    "Safe same-day delivery",
                    to_iso(offer_ts),
                ),
            )

        conn.commit()
    finally:
        conn.close()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_km * c


def resolve_location(name: str) -> tuple[tuple[float, float], bool]:
    key = name.strip().lower()
    if key in LOCATION_COORDS:
        return LOCATION_COORDS[key], True
    # Intercity fallback around central Punjab to keep unknown city names operational.
    return (31.5204, 74.3587), False


def get_user(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT id, name FROM users WHERE id = ?", (user_id,)).fetchone()


def get_rider(conn: sqlite3.Connection, rider_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM riders WHERE id = ?", (rider_id,)).fetchone()


def get_order_row(conn: sqlite3.Connection, order_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()


def expire_entities(conn: sqlite3.Connection) -> None:
    now = to_iso(utc_now())
    conn.execute(
        "UPDATE offers SET is_active = 0 WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at < ?",
        (now,),
    )
    conn.execute(
        """
        UPDATE orders
        SET status = 'Expired'
        WHERE status IN ('Open for Offers', 'Negotiating')
          AND negotiation_deadline_at IS NOT NULL
          AND negotiation_deadline_at < ?
        """,
        (now,),
    )
    conn.commit()


def compute_rider_candidates(conn: sqlite3.Connection, payload: RiderSearchRequest) -> dict[str, Any]:
    riders = conn.execute(
        "SELECT id, location, lat, lng, speed, rating, available FROM riders WHERE available = 1"
    ).fetchall()

    if not riders:
        return {
            "candidates": [],
            "delivery_distance_km": 0.0,
            "warning": None,
        }

    (pickup_lat, pickup_lng), pickup_known = resolve_location(payload.pickup)
    (drop_lat, drop_lng), dropoff_known = resolve_location(payload.dropoff)
    delivery_distance = haversine_km(pickup_lat, pickup_lng, drop_lat, drop_lng)

    scored: list[dict[str, Any]] = []
    for rider in riders:
        speed = float(rider["speed"])
        rating = float(rider["rating"])
        if speed <= 0:
            continue

        pickup_distance = haversine_km(float(rider["lat"]), float(rider["lng"]), pickup_lat, pickup_lng)
        urgency_multiplier = 1.12 if payload.urgency == "urgent" else 1.0
        eta_minutes = ((pickup_distance + delivery_distance) / (speed * urgency_multiplier)) * 60

        rider_score = (
            100
            - pickup_distance * 3.4
            + speed * 0.5
            + rating * 8
            - (payload.weight or 0) * 0.7
        )

        scored.append(
            {
                "rider_id": rider["id"],
                "rider_location": rider["location"],
                "speed": speed,
                "rating": rating,
                "score": max(0, round(rider_score, 2)),
                "pickup_distance_km": round(pickup_distance, 2),
                "estimated_eta_minutes": round(eta_minutes + 5),
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    warning = None
    if not pickup_known or not dropoff_known:
        warning = "ETA may vary due to limited location data"

    return {
        "candidates": scored,
        "delivery_distance_km": round(delivery_distance, 2),
        "warning": warning,
    }


def serialize_offer(offer: sqlite3.Row) -> dict[str, Any]:
    return {
        "offer_id": offer["offer_id"],
        "order_id": offer["order_id"],
        "rider_id": offer["rider_id"],
        "amount": offer["amount"],
        "eta_minutes": offer["eta_minutes"],
        "message": offer["message"],
        "type": offer["type"],
        "timestamp": offer["created_at"],
        "expires_at": offer["expires_at"],
        "expires_in_seconds": seconds_left(offer["expires_at"]),
        "is_active": bool(offer["is_active"]),
    }


def serialize_order(conn: sqlite3.Connection, order_row: sqlite3.Row) -> dict[str, Any]:
    offers_rows = conn.execute(
        "SELECT * FROM offers WHERE order_id = ? ORDER BY created_at DESC", (order_row["order_id"],)
    ).fetchall()
    log_rows = conn.execute(
        "SELECT * FROM negotiation_logs WHERE order_id = ? ORDER BY created_at ASC", (order_row["order_id"],)
    ).fetchall()

    accepted_offer = None
    if order_row["accepted_offer_id"]:
        accepted_offer_row = conn.execute(
            "SELECT * FROM offers WHERE offer_id = ?", (order_row["accepted_offer_id"],)
        ).fetchone()
        if accepted_offer_row is not None:
            accepted_offer = serialize_offer(accepted_offer_row)

    offer_deadline = order_row["offer_deadline_at"]
    negotiation_deadline = order_row["negotiation_deadline_at"]

    return {
        "order_id": order_row["order_id"],
        "user_id": order_row["user_id"],
        "pickup": order_row["pickup"],
        "dropoff": order_row["dropoff"],
        "weight": order_row["weight"],
        "urgency": order_row["urgency"],
        "notes": order_row["notes"],
        "status": order_row["status"],
        "delivery_distance_km": order_row["delivery_distance_km"],
        "candidate_rider_ids": json.loads(order_row["candidate_rider_ids"] or "[]"),
        "offers": [serialize_offer(o) for o in offers_rows],
        "accepted_offer": accepted_offer,
        "assigned_rider_id": order_row["assigned_rider_id"],
        "offer_deadline_at": offer_deadline,
        "offer_deadline_in_seconds": seconds_left(offer_deadline),
        "negotiation_deadline_at": negotiation_deadline,
        "negotiation_deadline_in_seconds": seconds_left(negotiation_deadline),
        "negotiation_log": [
            {
                "actor": entry["actor"],
                "actor_id": entry["actor_id"],
                "target_rider_id": entry["target_rider_id"],
                "amount": entry["amount"],
                "message": entry["message"],
                "timestamp": entry["created_at"],
            }
            for entry in log_rows
        ],
        "created_at": order_row["created_at"],
        "completed_at": order_row["completed_at"],
    }


@app.on_event("startup")
def startup_event() -> None:
    init_db()


@app.get("/users")
def get_users():
    conn = get_conn()
    try:
        rows = conn.execute("SELECT id, name FROM users ORDER BY id").fetchall()
        return {"users": [{"id": r["id"], "name": r["name"]} for r in rows]}
    finally:
        conn.close()


@app.get("/locations")
def get_locations():
    names = [name.title() for name in LOCATION_COORDS.keys()]
    names.sort()
    return {"locations": names}


@app.get("/riders")
def list_riders():
    conn = get_conn()
    try:
        rows = conn.execute("SELECT * FROM riders ORDER BY id").fetchall()
        return {
            "riders": [
                {
                    "id": r["id"],
                    "location": r["location"],
                    "speed": r["speed"],
                    "rating": r["rating"],
                    "available": bool(r["available"]),
                    "completed_deliveries": r["completed_deliveries"],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.post("/riders/search")
def search_riders(payload: RiderSearchRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        result = compute_rider_candidates(conn, payload)
        if not result["candidates"]:
            return JSONResponse(status_code=404, content={"error": "No riders available nearby"})

        return {
            "delivery_distance_km": result["delivery_distance_km"],
            "urgency": payload.urgency,
            "riders": result["candidates"][:6],
            "warning": result["warning"],
            "pricing_mode": "Bargaining only (no automatic fare estimation)",
        }
    finally:
        conn.close()


@app.post("/orders")
def create_order(payload: CreateOrderRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        if get_user(conn, payload.user_id) is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        result = compute_rider_candidates(conn, payload)
        if not result["candidates"]:
            return JSONResponse(status_code=404, content={"error": "No riders available nearby"})

        created_at = utc_now()
        offer_deadline = created_at + timedelta(minutes=DEFAULT_OFFER_WINDOW_MINUTES)
        negotiation_deadline = created_at + timedelta(minutes=DEFAULT_NEGOTIATION_WINDOW_MINUTES)

        conn.execute(
            """
            INSERT INTO orders(
                user_id, pickup, dropoff, weight, urgency, notes, status, delivery_distance_km,
                candidate_rider_ids, assigned_rider_id, accepted_offer_id, offer_deadline_at,
                negotiation_deadline_at, created_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.user_id,
                payload.pickup,
                payload.dropoff,
                payload.weight,
                payload.urgency,
                payload.notes,
                "Open for Offers",
                result["delivery_distance_km"],
                json.dumps([r["rider_id"] for r in result["candidates"][:5]]),
                None,
                None,
                to_iso(offer_deadline),
                to_iso(negotiation_deadline),
                to_iso(created_at),
                None,
            ),
        )
        order_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]
        conn.commit()

        order_row = get_order_row(conn, int(order_id))
        order = serialize_order(conn, order_row)

        return {
            "message": "Delivery request posted. Riders can now place offers.",
            "order": order,
            "top_riders": result["candidates"][:3],
            "warning": result["warning"],
            "pricing_mode": "Bargaining only",
            "offer_window_minutes": DEFAULT_OFFER_WINDOW_MINUTES,
            "negotiation_window_minutes": DEFAULT_NEGOTIATION_WINDOW_MINUTES,
        }
    finally:
        conn.close()


@app.get("/dashboard/user/{user_id}")
def user_dashboard(user_id: str):
    conn = get_conn()
    try:
        expire_entities(conn)
        user = get_user(conn, user_id)
        if user is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})

        rows = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
        ).fetchall()

        active_orders = []
        past_orders = []
        expired_orders = []

        for row in rows:
            order = serialize_order(conn, row)
            if row["status"] in {"Open for Offers", "Negotiating", "Assigned"}:
                active_orders.append(order)
            elif row["status"] == "Expired":
                expired_orders.append(order)
            else:
                past_orders.append(order)

        return {
            "user": {"id": user["id"], "name": user["name"]},
            "active_orders": active_orders,
            "past_orders": past_orders,
            "expired_orders": expired_orders,
            "pricing_mode": "Bargaining only (riders place offers, user negotiates)",
        }
    finally:
        conn.close()


@app.get("/dashboard/rider/{rider_id}")
def rider_dashboard(rider_id: str):
    conn = get_conn()
    try:
        expire_entities(conn)
        rider = get_rider(conn, rider_id)
        if rider is None:
            return JSONResponse(status_code=404, content={"error": "Rider not found"})

        rows = conn.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
        open_orders = []
        assigned_orders = []
        past_orders = []

        for row in rows:
            order = serialize_order(conn, row)
            candidates = order["candidate_rider_ids"]
            if row["status"] in {"Open for Offers", "Negotiating"} and rider_id in candidates:
                order["can_offer"] = order["offer_deadline_in_seconds"] is None or order["offer_deadline_in_seconds"] > 0
                open_orders.append(order)
            elif row["status"] == "Assigned" and row["assigned_rider_id"] == rider_id:
                assigned_orders.append(order)
            elif row["status"] == "Completed" and row["assigned_rider_id"] == rider_id:
                past_orders.append(order)

        return {
            "rider": {
                "id": rider["id"],
                "location": rider["location"],
                "speed": rider["speed"],
                "rating": rider["rating"],
                "available": bool(rider["available"]),
                "completed_deliveries": rider["completed_deliveries"],
            },
            "open_orders": open_orders,
            "assigned_orders": assigned_orders,
            "past_orders": past_orders,
        }
    finally:
        conn.close()


@app.get("/orders/{order_id}/offer-board")
def offer_board(order_id: int):
    conn = get_conn()
    try:
        expire_entities(conn)
        order = get_order_row(conn, order_id)
        if order is None:
            return JSONResponse(status_code=404, content={"error": "Order not found"})

        order_payload = serialize_order(conn, order)
        live_offers = [offer for offer in order_payload["offers"] if offer["is_active"] and offer["type"] == "rider_offer"]
        live_offers.sort(key=lambda x: (x["amount"], x["timestamp"]))

        return {
            "order_id": order_id,
            "status": order_payload["status"],
            "pickup": order_payload["pickup"],
            "dropoff": order_payload["dropoff"],
            "offer_deadline_at": order_payload["offer_deadline_at"],
            "offer_deadline_in_seconds": order_payload["offer_deadline_in_seconds"],
            "negotiation_deadline_at": order_payload["negotiation_deadline_at"],
            "negotiation_deadline_in_seconds": order_payload["negotiation_deadline_in_seconds"],
            "offers": live_offers,
            "message": "Live board refresh recommended every 5 seconds",
        }
    finally:
        conn.close()


@app.post("/orders/{order_id}/offer")
def place_rider_offer(order_id: int, payload: RiderOfferRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        order = get_order_row(conn, order_id)
        rider = get_rider(conn, payload.rider_id)

        if order is None:
            return JSONResponse(status_code=404, content={"error": "Order not found"})
        if rider is None:
            return JSONResponse(status_code=404, content={"error": "Rider not found"})
        if order["status"] not in {"Open for Offers", "Negotiating"}:
            return JSONResponse(status_code=400, content={"error": "Order is not open for offers"})

        candidates = json.loads(order["candidate_rider_ids"] or "[]")
        if payload.rider_id not in candidates:
            return JSONResponse(status_code=403, content={"error": "Rider not shortlisted for this order"})

        offer_deadline = parse_iso(order["offer_deadline_at"])
        if offer_deadline is not None and utc_now() > offer_deadline:
            return JSONResponse(status_code=400, content={"error": "Offer window has expired"})

        created = utc_now()
        expires = created + timedelta(minutes=DEFAULT_OFFER_EXPIRY_MINUTES)

        conn.execute(
            """
            INSERT INTO offers(order_id, rider_id, amount, eta_minutes, message, type, created_at, expires_at, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                order_id,
                payload.rider_id,
                payload.amount,
                payload.eta_minutes,
                payload.message,
                "rider_offer",
                to_iso(created),
                to_iso(expires),
            ),
        )
        offer_id = conn.execute("SELECT last_insert_rowid() AS id").fetchone()["id"]

        conn.execute(
            """
            INSERT INTO negotiation_logs(order_id, actor, actor_id, target_rider_id, amount, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (order_id, "rider", payload.rider_id, None, payload.amount, payload.message, to_iso(created)),
        )
        conn.execute("UPDATE orders SET status = 'Negotiating' WHERE order_id = ?", (order_id,))
        conn.commit()

        offer_row = conn.execute("SELECT * FROM offers WHERE offer_id = ?", (offer_id,)).fetchone()
        return {
            "message": "Offer submitted",
            "offer": serialize_offer(offer_row),
            "order_status": "Negotiating",
        }
    finally:
        conn.close()


@app.post("/orders/{order_id}/counter")
def place_counter_offer(order_id: int, payload: CounterOfferRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        order = get_order_row(conn, order_id)
        if order is None:
            return JSONResponse(status_code=404, content={"error": "Order not found"})
        if get_user(conn, payload.user_id) is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        if order["user_id"] != payload.user_id:
            return JSONResponse(status_code=403, content={"error": "User does not own this order"})
        if order["status"] not in {"Open for Offers", "Negotiating"}:
            return JSONResponse(status_code=400, content={"error": "Order cannot be negotiated"})

        deadline = parse_iso(order["negotiation_deadline_at"])
        if deadline is not None and utc_now() > deadline:
            return JSONResponse(status_code=400, content={"error": "Negotiation deadline has passed"})

        conn.execute(
            """
            INSERT INTO negotiation_logs(order_id, actor, actor_id, target_rider_id, amount, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                "user",
                payload.user_id,
                payload.target_rider_id,
                payload.amount,
                payload.message,
                to_iso(utc_now()),
            ),
        )
        conn.execute("UPDATE orders SET status = 'Negotiating' WHERE order_id = ?", (order_id,))
        conn.commit()

        return {"message": "Counter-offer posted", "order_status": "Negotiating"}
    finally:
        conn.close()


@app.post("/orders/{order_id}/accept")
def accept_offer(order_id: int, payload: AcceptOfferRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        order = get_order_row(conn, order_id)
        if order is None:
            return JSONResponse(status_code=404, content={"error": "Order not found"})
        if get_user(conn, payload.user_id) is None:
            return JSONResponse(status_code=404, content={"error": "User not found"})
        if order["user_id"] != payload.user_id:
            return JSONResponse(status_code=403, content={"error": "User does not own this order"})

        deadline = parse_iso(order["negotiation_deadline_at"])
        if deadline is not None and utc_now() > deadline:
            return JSONResponse(status_code=400, content={"error": "Negotiation deadline has passed"})

        selected_offer = conn.execute(
            "SELECT * FROM offers WHERE offer_id = ? AND order_id = ? AND type = 'rider_offer'",
            (payload.offer_id, order_id),
        ).fetchone()
        if selected_offer is None:
            return JSONResponse(status_code=404, content={"error": "Offer not found"})
        if not bool(selected_offer["is_active"]):
            return JSONResponse(status_code=400, content={"error": "Offer expired"})

        conn.execute(
            "UPDATE orders SET accepted_offer_id = ?, assigned_rider_id = ?, status = 'Assigned' WHERE order_id = ?",
            (payload.offer_id, selected_offer["rider_id"], order_id),
        )
        conn.execute(
            """
            INSERT INTO negotiation_logs(order_id, actor, actor_id, target_rider_id, amount, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                "user",
                payload.user_id,
                selected_offer["rider_id"],
                selected_offer["amount"],
                f"Accepted offer #{payload.offer_id}",
                to_iso(utc_now()),
            ),
        )
        conn.commit()

        return {
            "message": "Offer accepted. Rider assigned.",
            "assigned_rider_id": selected_offer["rider_id"],
            "status": "Assigned",
        }
    finally:
        conn.close()


@app.post("/orders/{order_id}/complete")
def complete_order(order_id: int, payload: CompleteOrderRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        order = get_order_row(conn, order_id)
        if order is None:
            return JSONResponse(status_code=404, content={"error": "Order not found"})
        if order["assigned_rider_id"] != payload.rider_id:
            return JSONResponse(status_code=403, content={"error": "Rider is not assigned to this order"})
        if order["status"] != "Assigned":
            return JSONResponse(status_code=400, content={"error": "Order is not in assigned state"})

        conn.execute(
            "UPDATE orders SET status = 'Completed', completed_at = ? WHERE order_id = ?",
            (to_iso(utc_now()), order_id),
        )
        conn.execute(
            "UPDATE riders SET completed_deliveries = completed_deliveries + 1 WHERE id = ?",
            (payload.rider_id,),
        )
        conn.commit()

        return {"message": "Order marked as completed", "status": "Completed"}
    finally:
        conn.close()


@app.post("/request-delivery")
def request_delivery(payload: DeliveryRequest):
    conn = get_conn()
    try:
        expire_entities(conn)
        result = compute_rider_candidates(conn, payload)
        if not result["candidates"]:
            return JSONResponse(status_code=404, content={"error": "No riders available nearby"})

        top = result["candidates"][0]
        return {
            "rider_id": top["rider_id"],
            "rider_location": top["rider_location"],
            "distance_km": result["delivery_distance_km"],
            "eta_minutes": top["estimated_eta_minutes"],
            "status": "Assigned",
            "warning": result["warning"],
        }
    finally:
        conn.close()


@app.get("/health")
def health_check():
    return {"status": "ok", "storage": f"sqlite://{DB_PATH.name}"}
