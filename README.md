# Courier MVP (Phase 3)

## 1. Project Overview

This MVP demonstrates a richer AI-assisted courier platform prototype for same-day delivery.

The routing model is designed for intercity (city-to-city) delivery across Pakistan.

- User Dashboard: choose locations, search riders, view rider scores, post delivery requests, negotiate fares, accept offers, and track active/past orders.
- Rider Dashboard: view open requests, submit fare offers, monitor assigned jobs, and mark completed deliveries.
- Backend validates input, scores riders for ranking, estimates ETA and distance, and supports full bargaining workflow.

This implementation is intentionally rule-based and lightweight to validate value quickly.

## 2. Setup Instructions

## Backend (FastAPI)

```bash
cd backend
pip install fastapi uvicorn
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at `http://127.0.0.1:8000`.

## Frontend (React)

```bash
cd frontend
npm install
npm start
```

Frontend runs at `http://127.0.0.1:3000`.

## 3. Key API Endpoints

- `POST /riders/search`
- `POST /orders`
- `GET /dashboard/user/{user_id}`
- `GET /dashboard/rider/{rider_id}`
- `POST /orders/{order_id}/offer`
- `POST /orders/{order_id}/counter`
- `POST /orders/{order_id}/accept`
- `POST /orders/{order_id}/complete`

## 4. Sample API Requests

### Rider Search

Endpoint:

`POST /riders/search`

Sample JSON:

```json
{
  "pickup": "Islamabad",
  "dropoff": "Lahore",
  "weight": 2.5,
  "urgency": "normal"
}
```

### Create Bargaining Order

Endpoint:

`POST /orders`

Sample JSON:

```json
{
  "user_id": "U001",
  "pickup": "Islamabad",
  "dropoff": "Lahore",
  "weight": 2.5,
  "urgency": "normal",
  "notes": "Handle with care"
}
```

### Rider Offer

Endpoint:

`POST /orders/2/offer`

Sample JSON:

```json
{
  "rider_id": "R101",
  "amount": 750,
  "eta_minutes": 30,
  "message": "Can deliver same day"
}
```

### User Counter-offer

Endpoint:

`POST /orders/2/counter`

Sample JSON:

```json
{
  "user_id": "U001",
  "amount": 680,
  "target_rider_id": "R101",
  "message": "Can you do 680?"
}
```

### Accept Offer

Endpoint:

`POST /orders/2/accept`

Sample JSON:

```json
{
  "user_id": "U001",
  "offer_id": 3
}
```

### Legacy Compatibility Endpoint

Endpoint:

`POST /request-delivery`

Sample JSON:

```json
{
  "pickup": "Islamabad",
  "dropoff": "Lahore",
  "weight": 2.5,
  "urgency": "normal"
}
```

Sample success response:

```json
{
  "rider_id": "R101",
  "rider_location": "Saddar",
  "distance_km": 13.33,
  "eta_minutes": 26,
  "status": "Assigned",
  "warning": null
}
```

Sample failure response:

```json
{
  "error": "No riders available nearby"
}
```

## 5. Assumptions

- Users and riders are hardcoded (no login/authentication).
- Riders are simulated via a static JSON file.
- Known locations use a city-level coordinate map for intercity routes.
- Unknown location names fallback to a default area coordinate.
- No real-time traffic, weather, or road closure data is used.
- Fare is not auto-estimated. Pricing is only through rider offers and negotiation.

## 6. Limitations

- No live tracking.
- Approximate straight-line distances (Haversine), not road distance.
- SQLite storage for riders/orders/offers/logs.
- Static rider availability, speed, and ratings.
- No authentication, payment, or advanced trust verification workflows.

## Demo Scenario

Use this test case from frontend or API client:

- User `U001` posts request: Islamabad to Lahore, 2.5kg, normal
- Rider `R101` offers PKR 750
- User counters PKR 680
- User accepts best rider offer
- Rider marks order completed

## Key Assumptions This MVP Tests

- Users value fast rider discovery and transparent rider scoring.
- Bargaining-based pricing can work without fixed fare estimation.
- Same-day assignment remains feasible with rule-based ranking + negotiation.

## Technical Trade-offs Made

- Used rule-based rider scoring instead of ML for speed and explainability.
- Used static location mapping for deterministic behavior.
- Used one FastAPI app + one React app (no microservices) for simplicity.
- Stored orders in memory to keep development fast and simple.

## What Is Intentionally NOT Built

- Authentication and user accounts.
- Payment gateway and settlement.
- Production-grade route optimization and traffic intelligence.
- Real-time GPS tracking and notification system.
- Persistent database and admin tooling.
