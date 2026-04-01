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

function getOrderStatusTagClass(status) {
  if (status === "Assigned") return "tag tag--blue";
  if (status === "Negotiating") return "tag tag--amber";
  if (status === "Open for Offers") return "tag tag--green";
  if (status === "Completed") return "tag tag--teal";
  if (status === "Expired") return "tag tag--red";
  return "tag";
}

function SummaryCard({ label, value, hint }) {
  return (
    <article className="summary-card">
      <p className="summary-label">{label}</p>
      <p className="summary-value">{value}</p>
      {hint && <p className="summary-hint">{hint}</p>}
    </article>
  );
}

function NegotiationLog({ entries }) {
  return (
    <div className="timeline">
      {entries.length === 0 && <p className="muted">No negotiation activity yet.</p>}
      {entries.map((entry, index) => {
        const roleLabel = entry.actor === "user" ? "Customer" : "Rider";
        return (
          <div className="timeline-item" key={`${entry.timestamp}-${index}`}>
            <p>
              <strong>{roleLabel}</strong> ({entry.actor_id})
            </p>
            <p>
              {entry.amount ? `PKR ${entry.amount}` : "No amount specified"}
              {entry.target_rider_id ? ` -> ${entry.target_rider_id}` : ""}
            </p>
            {entry.message && <p className="muted">{entry.message}</p>}
          </div>
        );
      })}
    </div>
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
        // Silent for periodic refresh; action handlers show explicit errors.
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [activeView, selectedUserId, selectedRiderId, selectedBoardOrderId]);

  async function refreshUserDashboard(userId = selectedUserId) {
    if (!userId) return;
    const response = await axios.get(`${API_BASE_URL}/dashboard/user/${userId}`);
    const data = response.data;
    setUserDashboard(data);

    if (!selectedBoardOrderId && data.active_orders?.length > 0) {
      setSelectedBoardOrderId(String(data.active_orders[0].order_id));
    }
  }

  async function refreshRiderDashboard(riderId = selectedRiderId) {
    if (!riderId) return;
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
    if (Object.keys(nextErrors).length > 0) return;

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
    if (Object.keys(nextErrors).length > 0) return;

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
      <header className="hero">
        <div>
          <p className="eyebrow">Live Dispatch Control</p>
          <h1>SwiftCarry Request Hub</h1>
          <p className="muted">Cleaner rider negotiation flow with live counters and faster decision making.</p>
        </div>
        <div className="tabs">
          <button type="button" className={activeView === "user" ? "tab active" : "tab"} onClick={() => setActiveView("user")}>
            User Side
          </button>
          <button type="button" className={activeView === "rider" ? "tab active" : "tab"} onClick={() => setActiveView("rider")}>
            Rider Side
          </button>
        </div>
      </header>

      {(apiError || globalMessage) && (
        <section className="banner-wrap">
          {apiError && <p className="banner banner--error">{apiError}</p>}
          {globalMessage && <p className="banner banner--success">{globalMessage}</p>}
        </section>
      )}

      {activeView === "user" && (
        <main className="layout">
          <section className="panel panel--compact">
            <h2>Customer Context</h2>
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
            <button type="button" className="ghost" onClick={() => refreshUserDashboard()}>
              Refresh Dashboard
            </button>
          </section>

          <section className="panel panel--wide">
            <h2>Create Delivery Request</h2>
            <div className="form-grid">
              <div>
                <label>Pickup</label>
                <input name="pickup" value={orderForm.pickup} onChange={handleOrderFormChange} list="location-options" />
                {errors.pickup && <p className="error">{errors.pickup}</p>}
              </div>

              <div>
                <label>Drop-off</label>
                <input name="dropoff" value={orderForm.dropoff} onChange={handleOrderFormChange} list="location-options" />
                {errors.dropoff && <p className="error">{errors.dropoff}</p>}
              </div>

              <div>
                <label>Weight (kg)</label>
                <input name="weight" type="number" min="0" step="0.1" value={orderForm.weight} onChange={handleOrderFormChange} />
                {errors.weight && <p className="error">{errors.weight}</p>}
              </div>

              <div>
                <label>Urgency</label>
                <select name="urgency" value={orderForm.urgency} onChange={handleOrderFormChange}>
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="full">
                <label>Notes</label>
                <input name="notes" value={orderForm.notes} onChange={handleOrderFormChange} placeholder="Optional handling details" />
              </div>
            </div>

            <div className="row-actions">
              <button type="button" className="ghost" onClick={handleSearchRiders} disabled={searching}>
                {searching ? "Searching..." : "Find Riders"}
              </button>
              <button type="button" onClick={handleCreateOrder} disabled={posting}>
                {posting ? "Posting..." : "Post Request"}
              </button>
              <button type="button" className="ghost" onClick={resetOrderFlow}>
                Reset
              </button>
            </div>

            <datalist id="location-options">
              {locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </section>

          {searchResult && (
            <section className="panel full-row">
              <h2>Top Rider Matches</h2>
              <div className="summary-grid">
                <SummaryCard label="Estimated Distance" value={`${searchResult.delivery_distance_km} km`} />
                <SummaryCard label="Urgency" value={orderForm.urgency} />
                <SummaryCard label="Pricing" value="Bargaining" hint="No auto fare estimation" />
              </div>
              {searchResult.warning && <p className="warning">{searchResult.warning}</p>}
              <div className="cards-grid">
                {searchResult.riders.map((rider) => (
                  <article key={rider.rider_id} className="mini-card">
                    <h3>{rider.rider_id}</h3>
                    <p>{rider.rider_location}</p>
                    <p>Score {rider.score}</p>
                    <p>Rating {rider.rating}</p>
                    <p>ETA {rider.estimated_eta_minutes} min</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="panel full-row">
            <div className="section-head">
              <h2>Live Offer Board</h2>
              <div className="row-actions">
                <select value={selectedBoardOrderId} onChange={(e) => setSelectedBoardOrderId(e.target.value)}>
                  <option value="">Select active order</option>
                  {activeOrderOptions.map((order) => (
                    <option key={order.order_id} value={String(order.order_id)}>
                      #{order.order_id} {order.pickup} to {order.dropoff}
                    </option>
                  ))}
                </select>
                <button type="button" className="ghost" onClick={() => refreshOfferBoard()} disabled={!selectedBoardOrderId}>
                  Refresh
                </button>
              </div>
            </div>

            {!offerBoard && <p className="muted">Select an active order to monitor live rider offers.</p>}
            {offerBoard && (
              <>
                <div className="summary-grid">
                  <SummaryCard label="Order" value={`#${offerBoard.order_id}`} hint={`${offerBoard.pickup} to ${offerBoard.dropoff}`} />
                  <SummaryCard label="Status" value={offerBoard.status} />
                  <SummaryCard label="Offer Window" value={formatCountdown(offerBoard.offer_deadline_in_seconds)} />
                  <SummaryCard label="Negotiation Time" value={formatCountdown(offerBoard.negotiation_deadline_in_seconds)} />
                </div>

                <div className="cards-grid">
                  {offerBoard.offers.length === 0 && <p className="muted">No active rider offers yet.</p>}
                  {offerBoard.offers.map((offer) => (
                    <article key={offer.offer_id} className="mini-card">
                      <h3>{offer.rider_id}</h3>
                      <p className="price">PKR {offer.amount}</p>
                      <p>ETA {offer.eta_minutes || "N/A"} min</p>
                      <p className="timer">Expires in {formatCountdown(offer.expires_in_seconds)}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel full-row">
            <h2>Active Requests</h2>
            {userDashboard.active_orders?.length === 0 && <p className="muted">No active requests.</p>}
            <div className="stacked-list">
              {userDashboard.active_orders?.map((order) => {
                const riderOffers = order.offers.filter((entry) => entry.type === "rider_offer");
                return (
                  <article key={order.order_id} className="order-card">
                    <div className="section-head">
                      <h3>
                        Order #{order.order_id} {order.pickup} to {order.dropoff}
                      </h3>
                      <span className={getOrderStatusTagClass(order.status)}>{order.status}</span>
                    </div>

                    <div className="summary-grid">
                      <SummaryCard label="Last Rider Offer" value={order.latest_rider_offer ? `PKR ${order.latest_rider_offer.amount}` : "No offer"} />
                      <SummaryCard label="Last Counter by You" value={order.latest_user_counter ? `PKR ${order.latest_user_counter.amount}` : "No counter"} />
                      <SummaryCard label="Offer Window" value={formatCountdown(order.offer_deadline_in_seconds)} />
                      <SummaryCard label="Negotiation" value={formatCountdown(order.negotiation_deadline_in_seconds)} />
                    </div>

                    <div className="split">
                      <div>
                        <h4>Incoming Rider Offers</h4>
                        {riderOffers.length === 0 && <p className="muted">No rider offers yet.</p>}
                        {riderOffers.map((offer) => (
                          <div key={offer.offer_id} className="offer-row">
                            <div>
                              <p>
                                <strong>{offer.rider_id}</strong> offered <strong>PKR {offer.amount}</strong>
                              </p>
                              <p className="muted">Expires in {formatCountdown(offer.expires_in_seconds)}</p>
                            </div>
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

                      <div>
                        <h4>Send Counter Offer</h4>
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
                    </div>

                    <div>
                      <h4>Negotiation Timeline</h4>
                      <NegotiationLog entries={order.negotiation_log} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="panel full-row">
            <h2>Request History</h2>
            <div className="cards-grid">
              {userDashboard.past_orders?.map((order) => (
                <article key={order.order_id} className="mini-card">
                  <h3>Order #{order.order_id}</h3>
                  <p>{order.pickup} to {order.dropoff}</p>
                  <p>{order.accepted_offer ? `Final Fare PKR ${order.accepted_offer.amount}` : "No accepted fare"}</p>
                  <p>Rider {order.assigned_rider_id || "N/A"}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}

      {activeView === "rider" && (
        <main className="layout">
          <section className="panel panel--compact">
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
            <button type="button" className="ghost" onClick={() => refreshRiderDashboard()}>
              Refresh Dashboard
            </button>
          </section>

          <section className="panel panel--wide">
            <h2>Rider Profile</h2>
            {riderDashboard.rider ? (
              <div className="summary-grid">
                <SummaryCard label="City" value={riderDashboard.rider.location} />
                <SummaryCard label="Rating" value={riderDashboard.rider.rating} />
                <SummaryCard label="Speed" value={`${riderDashboard.rider.speed} km/h`} />
                <SummaryCard label="Completed" value={riderDashboard.rider.completed_deliveries || 0} />
              </div>
            ) : (
              <p className="muted">Select a rider to view details.</p>
            )}
          </section>

          <section className="panel full-row">
            <h2>Open Requests You Can Bid On</h2>
            {riderDashboard.open_orders?.length === 0 && <p className="muted">No open orders available for this rider.</p>}
            <div className="stacked-list">
              {riderDashboard.open_orders?.map((order) => (
                <article key={order.order_id} className="order-card">
                  <div className="section-head">
                    <h3>
                      Order #{order.order_id} {order.pickup} to {order.dropoff}
                    </h3>
                    <span className={getOrderStatusTagClass(order.status)}>{order.status}</span>
                  </div>

                  <div className="summary-grid">
                    <SummaryCard label="Weight" value={order.weight || "N/A"} hint="kg" />
                    <SummaryCard label="Distance" value={`${order.delivery_distance_km} km`} />
                    <SummaryCard label="Customer Counter" value={order.latest_user_counter ? `PKR ${order.latest_user_counter.amount}` : "No counter"} />
                    <SummaryCard label="Offer Time Left" value={formatCountdown(order.offer_deadline_in_seconds)} />
                  </div>

                  <div className="split">
                    <div>
                      <h4>Submit Your Offer</h4>
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

                    <div>
                      <h4>Negotiation Timeline</h4>
                      <NegotiationLog entries={order.negotiation_log} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel full-row">
            <h2>Assigned Orders</h2>
            <div className="cards-grid">
              {riderDashboard.assigned_orders?.map((order) => (
                <article key={order.order_id} className="mini-card">
                  <h3>Order #{order.order_id}</h3>
                  <p>{order.pickup} to {order.dropoff}</p>
                  <p>{order.accepted_offer ? `Accepted PKR ${order.accepted_offer.amount}` : "Fare pending"}</p>
                  <button
                    type="button"
                    onClick={() => handleMarkComplete(order.order_id)}
                    disabled={submittingOfferId === order.order_id}
                  >
                    Mark Completed
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel full-row">
            <h2>Completed Orders</h2>
            <div className="cards-grid">
              {riderDashboard.past_orders?.map((order) => (
                <article key={order.order_id} className="mini-card">
                  <h3>Order #{order.order_id}</h3>
                  <p>{order.pickup} to {order.dropoff}</p>
                  <p>{order.accepted_offer ? `Final Fare PKR ${order.accepted_offer.amount}` : "No final fare"}</p>
                </article>
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

export default App;
