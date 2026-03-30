import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = "http://127.0.0.1:8000";

const initialOrderForm = {
  pickup: "",
  dropoff: "",
  weight: "",
  urgency: "normal",
  notes: "",
};

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) {
    return "N/A";
  }
  if (seconds <= 0) {
    return "Expired";
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getErrorMessage(error) {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.detail ||
    "Unable to complete the request. Please try again."
  );
}

function App() {
  const [activeView, setActiveView] = useState("user");

  const [users, setUsers] = useState([]);
  const [riders, setRiders] = useState([]);
  const [locations, setLocations] = useState([]);

  const [selectedUserId, setSelectedUserId] = useState("U001");
  const [selectedRiderId, setSelectedRiderId] = useState("R101");
  const [selectedBoardOrderId, setSelectedBoardOrderId] = useState("");

  const [orderForm, setOrderForm] = useState(initialOrderForm);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [globalMessage, setGlobalMessage] = useState("");

  const [searching, setSearching] = useState(false);
  const [posting, setPosting] = useState(false);
  const [submittingOfferId, setSubmittingOfferId] = useState(null);
  const [submittingCounterId, setSubmittingCounterId] = useState(null);

  const [searchResult, setSearchResult] = useState(null);
  const [userDashboard, setUserDashboard] = useState({
    active_orders: [],
    past_orders: [],
    expired_orders: [],
  });
  const [riderDashboard, setRiderDashboard] = useState({
    open_orders: [],
    assigned_orders: [],
    past_orders: [],
  });
  const [offerBoard, setOfferBoard] = useState(null);

  const [offerInputs, setOfferInputs] = useState({});
  const [counterInputs, setCounterInputs] = useState({});
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [usersRes, ridersRes, locationsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/users`),
          axios.get(`${API_BASE_URL}/riders`),
          axios.get(`${API_BASE_URL}/locations`),
        ]);

        const fetchedUsers = usersRes.data.users || [];
        const fetchedRiders = ridersRes.data.riders || [];

        setUsers(fetchedUsers);
        setRiders(fetchedRiders);
        setLocations(locationsRes.data.locations || []);

        const defaultUser = fetchedUsers[0]?.id || "U001";
        const defaultRider = fetchedRiders[0]?.id || "R101";
        setSelectedUserId(defaultUser);
        setSelectedRiderId(defaultRider);

        await Promise.all([refreshUserDashboard(defaultUser), refreshRiderDashboard(defaultRider)]);
      } catch (error) {
        setApiError(getErrorMessage(error));
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick((v) => v + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (activeView === "user" && selectedUserId) {
          await refreshUserDashboard(selectedUserId);
          if (selectedBoardOrderId) {
            await refreshOfferBoard(selectedBoardOrderId);
          }
        }
        if (activeView === "rider" && selectedRiderId) {
          await refreshRiderDashboard(selectedRiderId);
        }
      } catch {
        // Keep auto-refresh resilient; explicit actions still show full errors.
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeView, selectedUserId, selectedRiderId, selectedBoardOrderId]);

  async function refreshUserDashboard(userId = selectedUserId) {
    if (!userId) {
      return;
    }
    const response = await axios.get(`${API_BASE_URL}/dashboard/user/${userId}`);
    const data = response.data;
    setUserDashboard(data);

    if (!selectedBoardOrderId && data.active_orders?.length > 0) {
      setSelectedBoardOrderId(String(data.active_orders[0].order_id));
    }
  }

  async function refreshRiderDashboard(riderId = selectedRiderId) {
    if (!riderId) {
      return;
    }
    const response = await axios.get(`${API_BASE_URL}/dashboard/rider/${riderId}`);
    setRiderDashboard(response.data);
  }

  async function refreshOfferBoard(orderId = selectedBoardOrderId) {
    if (!orderId) {
      setOfferBoard(null);
      return;
    }
    const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/offer-board`);
    setOfferBoard(response.data);
  }

  useEffect(() => {
    if (selectedBoardOrderId) {
      refreshOfferBoard(selectedBoardOrderId).catch(() => {
        setOfferBoard(null);
      });
    }
  }, [selectedBoardOrderId]);

  function validateOrderForm() {
    const nextErrors = {};
    if (!orderForm.pickup.trim()) {
      nextErrors.pickup = "Pickup location is required.";
    }
    if (!orderForm.dropoff.trim()) {
      nextErrors.dropoff = "Drop-off location is required.";
    }
    if (orderForm.weight !== "" && Number(orderForm.weight) < 0) {
      nextErrors.weight = "Weight must be 0 or greater.";
    }
    return nextErrors;
  }

  function handleOrderFormChange(event) {
    const { name, value } = event.target;
    setOrderForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetOrderFlow() {
    setOrderForm(initialOrderForm);
    setSearchResult(null);
    setErrors({});
    setApiError("");
    setGlobalMessage("");
  }

  async function handleSearchRiders() {
    setApiError("");
    setGlobalMessage("");

    const nextErrors = validateOrderForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload = {
      pickup: orderForm.pickup.trim(),
      dropoff: orderForm.dropoff.trim(),
      urgency: orderForm.urgency,
    };
    if (orderForm.weight !== "") {
      payload.weight = Number(orderForm.weight);
    }

    try {
      setSearching(true);
      const response = await axios.post(`${API_BASE_URL}/riders/search`, payload);
      setSearchResult(response.data);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setSearching(false);
    }
  }

  async function handleCreateOrder() {
    setApiError("");
    setGlobalMessage("");

    const nextErrors = validateOrderForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload = {
      user_id: selectedUserId,
      pickup: orderForm.pickup.trim(),
      dropoff: orderForm.dropoff.trim(),
      urgency: orderForm.urgency,
      notes: orderForm.notes.trim() || null,
    };

    if (orderForm.weight !== "") {
      payload.weight = Number(orderForm.weight);
    }

    try {
      setPosting(true);
      const response = await axios.post(`${API_BASE_URL}/orders`, payload);
      setGlobalMessage(response.data.message || "Order created.");
      await Promise.all([refreshUserDashboard(), refreshRiderDashboard()]);
      if (response.data?.order?.order_id) {
        setSelectedBoardOrderId(String(response.data.order.order_id));
      }
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setPosting(false);
    }
  }

  async function handleAcceptOffer(orderId, offerId) {
    try {
      setSubmittingOfferId(orderId);
      await axios.post(`${API_BASE_URL}/orders/${orderId}/accept`, {
        user_id: selectedUserId,
        offer_id: offerId,
      });
      setGlobalMessage(`Offer #${offerId} accepted for order #${orderId}.`);
      await Promise.all([refreshUserDashboard(), refreshRiderDashboard(), refreshOfferBoard(String(orderId))]);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setSubmittingOfferId(null);
    }
  }

  async function handleCounterOffer(orderId) {
    const entry = counterInputs[orderId] || {};
    if (!entry.amount || Number(entry.amount) <= 0) {
      setApiError("Enter a valid counter amount.");
      return;
    }

    try {
      setSubmittingCounterId(orderId);
      await axios.post(`${API_BASE_URL}/orders/${orderId}/counter`, {
        user_id: selectedUserId,
        amount: Number(entry.amount),
        target_rider_id: entry.target_rider_id || null,
        message: entry.message || null,
      });
      setGlobalMessage(`Counter-offer posted on order #${orderId}.`);
      setCounterInputs((prev) => ({ ...prev, [orderId]: { amount: "", target_rider_id: "", message: "" } }));
      await Promise.all([refreshUserDashboard(), refreshRiderDashboard(), refreshOfferBoard(String(orderId))]);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setSubmittingCounterId(null);
    }
  }

  async function handleRiderOffer(orderId) {
    const entry = offerInputs[orderId] || {};
    if (!entry.amount || Number(entry.amount) <= 0) {
      setApiError("Enter a valid offer amount.");
      return;
    }

    try {
      setSubmittingOfferId(orderId);
      await axios.post(`${API_BASE_URL}/orders/${orderId}/offer`, {
        rider_id: selectedRiderId,
        amount: Number(entry.amount),
        eta_minutes: entry.eta_minutes ? Number(entry.eta_minutes) : null,
        message: entry.message || null,
      });
      setGlobalMessage(`Offer submitted for order #${orderId}.`);
      setOfferInputs((prev) => ({ ...prev, [orderId]: { amount: "", eta_minutes: "", message: "" } }));
      await Promise.all([refreshRiderDashboard(), refreshUserDashboard(), refreshOfferBoard(String(orderId))]);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setSubmittingOfferId(null);
    }
  }

  async function handleMarkComplete(orderId) {
    try {
      setSubmittingOfferId(orderId);
      await axios.post(`${API_BASE_URL}/orders/${orderId}/complete`, { rider_id: selectedRiderId });
      setGlobalMessage(`Order #${orderId} marked completed.`);
      await Promise.all([refreshRiderDashboard(), refreshUserDashboard(), refreshOfferBoard(String(orderId))]);
    } catch (error) {
      setApiError(getErrorMessage(error));
    } finally {
      setSubmittingOfferId(null);
    }
  }

  const activeOrderOptions = useMemo(() => userDashboard.active_orders || [], [userDashboard.active_orders, clockTick]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>SwiftCarry Operations Dashboard</h1>
        <p className="muted">Live offer board auto-refresh: every 5 seconds. Fare is negotiation-only.</p>
      </header>

      <div className="tabs">
        <button type="button" className={activeView === "user" ? "tab active" : "tab"} onClick={() => setActiveView("user")}>
          User Dashboard
        </button>
        <button type="button" className={activeView === "rider" ? "tab active" : "tab"} onClick={() => setActiveView("rider")}>
          Rider Dashboard
        </button>
      </div>

      {(apiError || globalMessage) && (
        <section className="banner-wrap">
          {apiError && <p className="error banner">{apiError}</p>}
          {globalMessage && <p className="success banner">{globalMessage}</p>}
        </section>
      )}

      {activeView === "user" && (
        <main className="grid-layout">
          <section className="card">
            <h2>User Context</h2>
            <label>User</label>
            <select
              value={selectedUserId}
              onChange={async (e) => {
                const nextId = e.target.value;
                setSelectedUserId(nextId);
                await refreshUserDashboard(nextId);
              }}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.id})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => refreshUserDashboard()}>
              Refresh User Data
            </button>
          </section>

          <section className="card">
            <h2>Create Delivery Request</h2>
            <label>Pickup Location</label>
            <input name="pickup" value={orderForm.pickup} onChange={handleOrderFormChange} list="location-options" />
            {errors.pickup && <p className="error">{errors.pickup}</p>}

            <label>Drop-off Location</label>
            <input name="dropoff" value={orderForm.dropoff} onChange={handleOrderFormChange} list="location-options" />
            {errors.dropoff && <p className="error">{errors.dropoff}</p>}

            <label>Weight (kg)</label>
            <input name="weight" type="number" min="0" step="0.1" value={orderForm.weight} onChange={handleOrderFormChange} />
            {errors.weight && <p className="error">{errors.weight}</p>}

            <label>Urgency</label>
            <select name="urgency" value={orderForm.urgency} onChange={handleOrderFormChange}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>

            <label>Notes</label>
            <input name="notes" value={orderForm.notes} onChange={handleOrderFormChange} />

            <div className="row-actions">
              <button type="button" onClick={handleSearchRiders} disabled={searching}>
                {searching ? "Searching..." : "Search Riders"}
              </button>
              <button type="button" onClick={handleCreateOrder} disabled={posting}>
                {posting ? "Posting..." : "Post Request"}
              </button>
              <button type="button" onClick={resetOrderFlow}>Reset</button>
            </div>

            <datalist id="location-options">
              {locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </section>

          <section className="card full-width">
            <h2>Rider Discovery</h2>
            {!searchResult && <p className="muted">Search riders to view score and ETA ranking.</p>}
            {searchResult && (
              <>
                <p>
                  <strong>Estimated Distance:</strong> {searchResult.delivery_distance_km} km
                </p>
                <p className="muted">{searchResult.pricing_mode}</p>
                {searchResult.warning && <p className="warning">{searchResult.warning}</p>}
                <div className="cards-grid">
                  {searchResult.riders.map((rider) => (
                    <article key={rider.rider_id} className="mini-card">
                      <h3>{rider.rider_id} • {rider.rider_location}</h3>
                      <p>Score: {rider.score}</p>
                      <p>Rating: {rider.rating}</p>
                      <p>Speed: {rider.speed} km/h</p>
                      <p>Distance to Pickup: {rider.pickup_distance_km} km</p>
                      <p>ETA: {rider.estimated_eta_minutes} min</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card full-width">
            <h2>Live Multi-Rider Offer Board</h2>
            <div className="row-actions">
              <select value={selectedBoardOrderId} onChange={(e) => setSelectedBoardOrderId(e.target.value)}>
                <option value="">Select active order</option>
                {activeOrderOptions.map((order) => (
                  <option key={order.order_id} value={String(order.order_id)}>
                    #{order.order_id} {order.pickup} to {order.dropoff}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => refreshOfferBoard()} disabled={!selectedBoardOrderId}>Refresh Board</button>
            </div>

            {!offerBoard && <p className="muted">Select an active order to track live offers.</p>}
            {offerBoard && (
              <>
                <p>
                  Order #{offerBoard.order_id} • {offerBoard.pickup} to {offerBoard.dropoff} • {offerBoard.status}
                </p>
                <p className="timer">Offer window: {formatCountdown(offerBoard.offer_deadline_in_seconds)}</p>
                <p className="timer">Negotiation deadline: {formatCountdown(offerBoard.negotiation_deadline_in_seconds)}</p>
                <div className="cards-grid">
                  {offerBoard.offers.length === 0 && <p className="muted">No active offers.</p>}
                  {offerBoard.offers.map((offer) => (
                    <article key={offer.offer_id} className="mini-card">
                      <h3>{offer.rider_id} • Offer #{offer.offer_id}</h3>
                      <p>Fare: PKR {offer.amount}</p>
                      <p>ETA: {offer.eta_minutes || "N/A"} min</p>
                      <p className="timer">Offer expires in: {formatCountdown(offer.expires_in_seconds)}</p>
                      {offer.message && <p>{offer.message}</p>}
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card full-width">
            <h2>Active Orders and Negotiations</h2>
            {userDashboard.active_orders?.length === 0 && <p className="muted">No active orders.</p>}
            {userDashboard.active_orders?.map((order) => (
              <article key={order.order_id} className="order-card">
                <h3>Order #{order.order_id} • {order.status}</h3>
                <p>{order.pickup} to {order.dropoff} • {order.delivery_distance_km} km • {order.urgency}</p>
                <p className="timer">Offer window: {formatCountdown(order.offer_deadline_in_seconds)}</p>
                <p className="timer">Negotiation deadline: {formatCountdown(order.negotiation_deadline_in_seconds)}</p>

                <div className="negotiation-panel">
                  <h4>Rider Offers</h4>
                  {order.offers.filter((o) => o.type === "rider_offer").length === 0 && <p className="muted">No offers yet.</p>}
                  {order.offers
                    .filter((o) => o.type === "rider_offer")
                    .map((offer) => (
                      <div key={offer.offer_id} className="offer-row">
                        <span>
                          {offer.rider_id} offered PKR {offer.amount} • expires in {formatCountdown(offer.expires_in_seconds)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAcceptOffer(order.order_id, offer.offer_id)}
                          disabled={submittingOfferId === order.order_id || !offer.is_active || order.status === "Assigned"}
                        >
                          Accept
                        </button>
                      </div>
                    ))}
                </div>

                <div className="negotiation-panel">
                  <h4>Send Counter-offer</h4>
                  <input
                    type="number"
                    placeholder="Counter amount (PKR)"
                    value={counterInputs[order.order_id]?.amount || ""}
                    onChange={(e) =>
                      setCounterInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), amount: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Target rider id (optional)"
                    value={counterInputs[order.order_id]?.target_rider_id || ""}
                    onChange={(e) =>
                      setCounterInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), target_rider_id: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Message"
                    value={counterInputs[order.order_id]?.message || ""}
                    onChange={(e) =>
                      setCounterInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), message: e.target.value },
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => handleCounterOffer(order.order_id)}
                    disabled={submittingCounterId === order.order_id || order.negotiation_deadline_in_seconds <= 0}
                  >
                    {submittingCounterId === order.order_id ? "Sending..." : "Send Counter"}
                  </button>
                </div>

                <div className="negotiation-panel">
                  <h4>Negotiation Log</h4>
                  {order.negotiation_log.length === 0 && <p className="muted">No negotiation entries yet.</p>}
                  {order.negotiation_log.map((entry, idx) => (
                    <p key={idx}>
                      {entry.actor} ({entry.actor_id}) {entry.amount ? `PKR ${entry.amount}` : ""} {entry.message || ""}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="card full-width">
            <h2>Past Orders</h2>
            {userDashboard.past_orders?.length === 0 && <p className="muted">No past orders yet.</p>}
            {userDashboard.past_orders?.map((order) => (
              <article key={order.order_id} className="mini-card">
                <h3>Order #{order.order_id}</h3>
                <p>{order.pickup} to {order.dropoff} • {order.delivery_distance_km} km</p>
                {order.accepted_offer && <p>Final Fare: PKR {order.accepted_offer.amount}</p>}
                <p>Rider: {order.assigned_rider_id || "N/A"}</p>
              </article>
            ))}
          </section>

          <section className="card full-width">
            <h2>Expired Orders</h2>
            {userDashboard.expired_orders?.length === 0 && <p className="muted">No expired orders.</p>}
            {userDashboard.expired_orders?.map((order) => (
              <article key={order.order_id} className="mini-card">
                <h3>Order #{order.order_id}</h3>
                <p>{order.pickup} to {order.dropoff}</p>
                <p>Status: {order.status}</p>
              </article>
            ))}
          </section>
        </main>
      )}

      {activeView === "rider" && (
        <main className="grid-layout">
          <section className="card">
            <h2>Rider Context</h2>
            <label>Rider</label>
            <select
              value={selectedRiderId}
              onChange={async (e) => {
                const nextId = e.target.value;
                setSelectedRiderId(nextId);
                await refreshRiderDashboard(nextId);
              }}
            >
              {riders.map((rider) => (
                <option key={rider.id} value={rider.id}>
                  {rider.id} ({rider.location})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => refreshRiderDashboard()}>Refresh Rider Data</button>
          </section>

          <section className="card">
            <h2>Rider Profile</h2>
            {riderDashboard.rider ? (
              <>
                <p>Location: {riderDashboard.rider.location}</p>
                <p>Rating: {riderDashboard.rider.rating}</p>
                <p>Speed: {riderDashboard.rider.speed} km/h</p>
                <p>Completed Deliveries: {riderDashboard.rider.completed_deliveries || 0}</p>
                <p>Status: {riderDashboard.rider.available ? "Available" : "Unavailable"}</p>
              </>
            ) : (
              <p className="muted">Select a rider to view details.</p>
            )}
          </section>

          <section className="card full-width">
            <h2>Open Delivery Requests</h2>
            {riderDashboard.open_orders?.length === 0 && <p className="muted">No open orders available for this rider.</p>}
            {riderDashboard.open_orders?.map((order) => (
              <article key={order.order_id} className="order-card">
                <h3>Order #{order.order_id} • {order.pickup} to {order.dropoff}</h3>
                <p>Urgency: {order.urgency} • Weight: {order.weight || "N/A"} kg • Distance: {order.delivery_distance_km} km</p>
                <p className="timer">Offer window: {formatCountdown(order.offer_deadline_in_seconds)}</p>
                <p className="timer">Negotiation deadline: {formatCountdown(order.negotiation_deadline_in_seconds)}</p>

                <div className="row-actions">
                  <input
                    type="number"
                    placeholder="Your fare offer (PKR)"
                    value={offerInputs[order.order_id]?.amount || ""}
                    onChange={(e) =>
                      setOfferInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), amount: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="ETA minutes"
                    value={offerInputs[order.order_id]?.eta_minutes || ""}
                    onChange={(e) =>
                      setOfferInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), eta_minutes: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Offer message"
                    value={offerInputs[order.order_id]?.message || ""}
                    onChange={(e) =>
                      setOfferInputs((prev) => ({
                        ...prev,
                        [order.order_id]: { ...(prev[order.order_id] || {}), message: e.target.value },
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => handleRiderOffer(order.order_id)}
                    disabled={submittingOfferId === order.order_id || !order.can_offer}
                  >
                    {submittingOfferId === order.order_id ? "Submitting..." : "Submit Offer"}
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section className="card full-width">
            <h2>Assigned Orders</h2>
            {riderDashboard.assigned_orders?.length === 0 && <p className="muted">No assigned orders yet.</p>}
            {riderDashboard.assigned_orders?.map((order) => (
              <article key={order.order_id} className="mini-card">
                <h3>Order #{order.order_id}</h3>
                <p>{order.pickup} to {order.dropoff} • {order.delivery_distance_km} km</p>
                {order.accepted_offer && <p>Accepted Fare: PKR {order.accepted_offer.amount}</p>}
                <button
                  type="button"
                  onClick={() => handleMarkComplete(order.order_id)}
                  disabled={submittingOfferId === order.order_id}
                >
                  Mark Completed
                </button>
              </article>
            ))}
          </section>

          <section className="card full-width">
            <h2>Completed Orders</h2>
            {riderDashboard.past_orders?.length === 0 && <p className="muted">No completed orders yet.</p>}
            {riderDashboard.past_orders?.map((order) => (
              <article key={order.order_id} className="mini-card">
                <h3>Order #{order.order_id}</h3>
                <p>{order.pickup} to {order.dropoff} • Completed</p>
                {order.accepted_offer && <p>Final Fare: PKR {order.accepted_offer.amount}</p>}
              </article>
            ))}
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
