# Live Demo Runbook (Mandatory Deliverable)

This runbook is designed to deliver a reliable 5-8 minute end-to-end demo.

## Demo Objective

Demonstrate:

1. Core user flow
2. Main value delivered
3. One realistic usage scenario
4. End-to-end completion

## Pre-Demo Checklist (2 minutes)

1. Start backend:

```bash
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

2. Start frontend:

```bash
cd frontend
npm start
```

3. Verify health API in browser or terminal:

```bash
curl http://127.0.0.1:8000/health
```

4. Open app at `http://127.0.0.1:3000`.

## Live Demo Script (Suggested)

## Part A: User Side (Core Problem)

1. Select User `U001`.
2. Create request:
   Pickup: Islamabad
   Drop-off: Lahore
   Weight: 2.5
   Urgency: Normal
3. Click Find Riders.
4. Explain value:
   - Rider ranking
   - ETA visibility
   - Transparent bidding flow
5. Click Post Request.

What to say:

"The user can quickly create a request and immediately see riders and negotiation options instead of waiting for a fixed black-box quote."

## Part B: Rider Side (Two-Sided Flow)

1. Switch to Rider Side.
2. Select rider `R101`.
3. In Open Requests, submit offer:
   Amount: 750
   ETA: 30
   Message: Can deliver same day
4. Optionally submit a second rider offer from another rider (`R102`) to show competition.

What to say:

"Riders can bid dynamically, which creates a marketplace effect and improves matching flexibility."

## Part C: Negotiation Loop (Main Value)

1. Switch back to User Side.
2. Open Active Requests and show:
   - Last Rider Offer
   - Last Counter by You
   - Negotiation Timeline
3. Send counter-offer:
   Amount: 680
   Target rider: R101
   Message: Can you do 680?
4. Switch to Rider Side and show customer counter visible in Open Requests.

What to say:

"Both parties see the latest negotiation state, reducing confusion and improving decision speed."

## Part D: Completion (End-to-End)

1. User accepts best rider offer.
2. Switch to Rider Side.
3. In Assigned Orders, click Mark Completed.
4. Show order moved to history/completed section.

What to say:

"The lifecycle is complete: request -> offer -> counter -> accept -> complete."

## Backup Plan (If UI Demo Fails)

Use API calls to prove end-to-end functionality:

1. Create order: `POST /orders`
2. Rider offer: `POST /orders/{id}/offer`
3. Counter: `POST /orders/{id}/counter`
4. Accept: `POST /orders/{id}/accept`
5. Complete: `POST /orders/{id}/complete`
6. Verify dashboards: `GET /dashboard/user/U001`, `GET /dashboard/rider/R101`

## Demo Risks and Mitigation

- Risk: stale UI state after inactivity
  Mitigation: use Refresh buttons before each major step.
- Risk: old DB data makes flow noisy
  Mitigation: restart backend with fresh DB if needed.
- Risk: typing mistakes in IDs
  Mitigation: use seeded IDs (`U001`, `R101`, `R102`) only.

## Demo Success Criteria

1. One full request completed without manual DB edits.
2. Counter-offer visibly appears on both user and rider sides.
3. At least one clear value statement tied to user pain point.
