# Courier MVP (Phase 3)

Courier MVP is a bargaining-first same-day courier prototype for intercity delivery in Pakistan.
It includes two live roles in one app:

- User side: create request, compare riders, negotiate fare, accept offer, track request state.
- Rider side: see eligible open requests, submit offers, react to customer counters, complete assigned jobs.

The product is intentionally scoped to prove end-to-end marketplace negotiation value, not to be production-complete.

## Submission Deliverables Coverage

This repository includes all mandatory deliverables:

1. Live demo flow (end-to-end): documented in `docs/DEMO_RUNBOOK.md`.
2. Code repository quality: clear structure, setup, sample data, and documentation in this README.
3. Technical summary (2-3 slides): ready content in `docs/TECHNICAL_SUMMARY_3_SLIDES.md`.

## Repository Structure

```text
courier-mvp/
  backend/
    main.py                # FastAPI app, APIs, matching, negotiation logic
    requirements.txt       # Backend dependencies
    data/
      riders.json          # Sample rider dataset (seed input)
      courier.db           # SQLite database (created at runtime)
  frontend/
    src/
      App.jsx              # User/Rider dashboards and flow logic
      styles.css           # UI styling
      main.jsx             # React entrypoint
    package.json           # Frontend scripts + dependencies
  docs/
    DEMO_RUNBOOK.md        # Live demo script and scenario
    TECHNICAL_SUMMARY_3_SLIDES.md
  README.md
```

## Core User Flow

1. User creates a delivery request.
2. System ranks candidate riders by rule-based scoring and ETA.
3. Riders submit fare offers.
4. User sends counter-offers and negotiates.
5. User accepts one rider offer.
6. Rider completes the job.

This is fully implemented across frontend and backend with persistent order/offer state in SQLite.

## Setup Instructions

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm

### Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend URL: `http://127.0.0.1:8000`

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm start
```

Frontend URL: `http://127.0.0.1:3000`

## Sample Data

- `backend/data/riders.json` seeds rider profiles and locations.
- Users are seeded in code (`U001`, `U002`) for demo speed.
- On first run, backend initializes `backend/data/courier.db` and inserts starter data.

## Main API Endpoints

- `POST /riders/search`
- `POST /orders`
- `GET /dashboard/user/{user_id}`
- `GET /dashboard/rider/{rider_id}`
- `GET /orders/{order_id}/offer-board`
- `POST /orders/{order_id}/offer`
- `POST /orders/{order_id}/counter`
- `POST /orders/{order_id}/accept`
- `POST /orders/{order_id}/complete`

## Realistic Demo Scenario

Use this scenario in live demo:

- User `U001` posts request: Islamabad -> Lahore, 2.5kg, normal.
- Rider `R101` offers PKR 750.
- User counters PKR 680.
- Rider updates bid and user accepts best available offer.
- Assigned rider marks order completed.

Expected value shown:

- Transparent offer comparison.
- Negotiation visibility on both sides.
- End-to-end completion without manual DB edits.

## Product Scope (What We Built)

- Two-role dashboard UI (user and rider).
- Rider discovery and shortlist generation.
- Bargaining-only pricing workflow.
- Live offer board and negotiation timeline.
- Counter-offer visibility in both user and rider views.
- Offer acceptance, rider assignment, and completion lifecycle.
- Automatic expiration handling for offers/orders.

## What We Intentionally Did NOT Build

- Authentication and account onboarding.
- Payments and wallet settlement.
- Real GPS tracking and push notifications.
- Production dispatch optimization/traffic integration.
- Fraud/risk scoring and trust/safety operations.

## Key Technical Decisions and Trade-offs

- Rule-based rider scoring over ML:
  Fast to explain and validate in MVP, less adaptive than trained models.
- SQLite persistence:
  Reliable local end-to-end demo with minimal ops overhead, limited horizontal scale.
- Single FastAPI + React architecture:
  Easy to reason about and demo, fewer boundaries than production microservices.
- City-level geospatial approximation (Haversine):
  Predictable and lightweight, but less accurate than road-network ETA models.

## Known Limitations and Risks

- ETA and distance are approximations, not route-engine accurate.
- Static rider availability and profile quality can reduce realism.
- No auth means role security is not production-safe.
- Single-node SQLite can become bottleneck at high concurrency.

## MVP Assumptions Being Tested

- Users value negotiation transparency over opaque fare estimation.
- Riders respond effectively to live counters in a two-sided workflow.
- A simple explainable ranking system is enough for early-stage matching value.

## Rubric Alignment Notes

- Alignment with prior phases: scope is centered on validated bargaining + dispatch problem.
- Core functionality: complete negotiation lifecycle works end-to-end.
- Completeness/coherence: no critical dead-end states in primary flow.
- Technical reasoning: trade-offs and intentional omissions are explicit.
- Demo clarity: step-by-step runbook provided in `docs/DEMO_RUNBOOK.md`.
- Code quality: modular frontend/backend, documented setup and sample data.
