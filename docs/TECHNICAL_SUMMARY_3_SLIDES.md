# Technical Summary (2-3 Slides)

Use the following directly in your presentation.

## Slide 1: Product Scope and MVP Outcome

### Problem
Users and riders need a clear, fast way to negotiate courier delivery pricing and assignment.

### What We Built
- Two-role courier marketplace MVP (User and Rider dashboards)
- Delivery request creation with rider discovery and ranking
- Bargaining workflow: rider offers, user counter-offers, accept flow
- End-to-end order lifecycle through completion

### Main Value Delivered
- Transparent negotiation instead of opaque fixed quote
- Faster decision-making with visible latest offers/counters
- Complete request-to-completion flow in one lightweight product

### Realistic Usage Scenario
- U001 posts Islamabad -> Lahore request
- R101 offers PKR 750
- User counters PKR 680
- User accepts best offer
- Rider completes order

## Slide 2: System Overview and Technical Decisions

### High-Level System Overview
- Frontend: React + Vite single-page app
- Backend: FastAPI REST API
- Storage: SQLite (`courier.db`)
- Seed data: `riders.json` + hardcoded demo users

### Core Components
- Matching and scoring engine (rule-based ranking)
- Negotiation engine (offers, counters, accept)
- Order lifecycle manager (open, negotiating, assigned, completed, expired)

### Key Technical Decisions and Trade-offs
- Rule-based ranking over ML:
  Faster to implement and explain, less adaptive than learned models.
- SQLite for persistence:
  Reliable demo persistence, not ideal for high-scale production.
- City-level Haversine approximation:
  Lightweight and deterministic, less accurate than map routing engines.
- Single-service architecture:
  Simpler debugging and delivery, fewer production boundaries.

## Slide 3: Scope Boundaries, Risks, and MVP Assumptions

### What We Intentionally Did Not Build
- Authentication and role security
- Payments and settlement
- Real-time GPS tracking
- Advanced dispatch optimization
- Notifications and trust/safety operations

### Known Limitations and Risks
- ETA is approximate, not traffic-aware
- Static rider dataset limits realism
- SQLite can be a concurrency bottleneck
- No auth creates security limitations

### Assumptions This MVP Is Testing
- Users prefer transparent bargaining over opaque fare generation
- Riders can respond effectively to live customer counters
- Simple explainable matching can deliver early-stage value

### Next Step if Validated
- Add authentication and role control
- Integrate payment flow
- Replace approximate ETA with route engine
- Add production-grade eventing/notifications
