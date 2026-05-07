const serviceData = {
  taxi: { title: "Taxi cash fare", amount: 680, price: "KES 680", meta: "Comfort car - 18 min - 4 seats" },
  boda: { title: "Bodaboda cash fare", amount: 210, price: "KES 210", meta: "Helmet included - 11 min - 1 passenger" },
  courier: { title: "Courier cash fare", amount: 340, price: "KES 340", meta: "Small parcel - 27 min - proof of delivery" }
};

const state = {
  activeService: "taxi",
  fareApproved: false,
  quotedFare: null,
  token: localStorage.getItem("quickToken") || "",
  user: JSON.parse(localStorage.getItem("quickUser") || "null")
};
const API_BASE = window.location.protocol === "file:" ? "http://localhost:4173" : "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const api = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read passport photo.")));
    reader.readAsDataURL(file);
  });
}

async function formToPayload(form) {
  const data = Object.fromEntries(new FormData(form));
  const photoInput = form.querySelector('input[name="passportPhoto"]');
  if (photoInput?.files?.[0]) {
    data.passportPhoto = await fileToDataUrl(photoInput.files[0]);
  }
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  window.setTimeout(() => node.classList.remove("show"), 2600);
}

function setService(service) {
  state.activeService = service;
  resetFareApproval();
  const data = serviceData[service];
  $$(".mode-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.service === service));
  $("#estimateTitle").textContent = data.title;
  $("#estimatePrice").textContent = data.price;
  $("#estimateMeta").textContent = data.meta;
}

function resetFareApproval() {
  state.fareApproved = false;
  state.quotedFare = null;
  const submit = $("#bookingSubmit");
  if (submit) submit.textContent = "Get cash fare";
  $(".estimate")?.classList.remove("approved");
}

function quoteCashFare(form) {
  const data = Object.fromEntries(new FormData(form));
  const service = serviceData[state.activeService];
  const destinationBoost = Math.min(260, Math.max(0, (data.destination.length - 12) * 8));
  const pickupBoost = Math.min(140, Math.max(0, (data.pickup.length - 10) * 4));
  const amount = service.amount + destinationBoost + pickupBoost;
  state.quotedFare = amount;
  state.fareApproved = true;
  $("#estimateTitle").textContent = `${service.title} to pay in cash`;
  $("#estimatePrice").textContent = `KES ${amount}`;
  $("#estimateMeta").textContent = "Approve this fare to search for the nearest available rider.";
  $("#bookingSubmit").textContent = "Approve fare & search rider";
  $(".estimate")?.classList.add("approved");
}

function setSession(user, token) {
  state.user = user;
  state.token = token;
  if (user && token) {
    localStorage.setItem("quickUser", JSON.stringify(user));
    localStorage.setItem("quickToken", token);
  } else {
    localStorage.removeItem("quickUser");
    localStorage.removeItem("quickToken");
  }
  renderSession();
}

function renderSession() {
  $("#sessionName").textContent = state.user ? `${state.user.name} (${state.user.role})` : "Guest";
  $("#bookingRole").textContent = state.user ? `${state.user.role} access` : "Login required";
}

function bookingRow(booking, actions = "") {
  const contact = booking.customerPhone || booking.customerEmail
    ? ` - Contact: ${booking.customerPhone || "No phone"} / ${booking.customerEmail || "No email"}`
    : "";
  const driverContact = booking.driverPhone ? ` - Driver phone: ${booking.driverPhone}` : "";
  const vehicleDetails = booking.driverId
    ? `
        <div class="driver-assignment">
          ${booking.driverPassportPhoto ? `<img class="passport-thumb" src="${booking.driverPassportPhoto}" alt="${booking.driverName || "Driver"} passport photo" />` : ""}
          <div>
            <strong>${booking.driverName || "Assigned driver"}</strong>
            <span>${booking.driverVehicle || "Vehicle"} - ${booking.driverNumberPlate || "No plate"} - ${booking.driverVehicleColor || "No color"}</span>
          </div>
        </div>
      `
    : "";
  const tracking = booking.tracking
    ? `
        <div class="tracking-panel" aria-label="Driver live tracking">
          <div class="tracking-map">
            <span class="track-line"></span>
            <span class="track-dot driver-dot" style="left:${booking.tracking.progress}%">Driver</span>
            <span class="track-dot pickup-dot">Pickup</span>
          </div>
          <div class="tracking-copy">
            <strong>${booking.tracking.distanceKm} km away</strong>
            <span>Approx. ${booking.tracking.etaMinutes} min to pickup through map tracking</span>
          </div>
        </div>
      `
    : "";
  return `
    <article class="job-row">
      <div>
        <div class="job-title">
          <span>${booking.pickup} to ${booking.destination}</span>
          <span class="badge">${booking.service}</span>
          <span class="badge">${booking.status}</span>
        </div>
        <div class="job-meta">
          ${booking.time} - ${booking.price} cash - ${booking.fareApproved ? "Fare approved" : "Fare pending"} - Customer: ${booking.customerName || "Pending"}${contact} - Driver: ${booking.driverName || "Unassigned"}${driverContact}
        </div>
        ${vehicleDetails}
        ${tracking}
      </div>
      <div class="row-actions">${actions}</div>
    </article>
  `;
}

function driverRow(driver, actions = "") {
  return `
    <article class="job-row">
      <div>
        ${driver.passportPhoto ? `<img class="passport-thumb driver-thumb" src="${driver.passportPhoto}" alt="${driver.name} passport photo" />` : ""}
        <div class="job-title">
          <span>${driver.name}</span>
          <span class="badge">ID ${driver.idNumber || "missing"}</span>
          <span class="badge">${driver.vehicle || "Driver"}</span>
          <span class="badge">${driver.numberPlate || "No plate"}</span>
          <span class="badge">${driver.approved ? "approved" : "pending"}</span>
        </div>
        <div class="job-meta">
          ${driver.phone || "No phone"} - ${driver.email} - ${driver.vehicleColor || "No color"}
        </div>
      </div>
      <div class="row-actions">${actions}</div>
    </article>
  `;
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

async function loadHealth() {
  try {
    const data = await api("/api/health");
    $("#apiStatus").textContent = "API online";
    $("#activeCount").textContent = data.activeBookings;
  } catch (error) {
    $("#apiStatus").textContent = "Open via server";
    toast("Start the backend server to use APIs.");
  }
}

async function loadCustomerBookings() {
  const target = $("#customerBookings");
  if (!state.user) {
    target.innerHTML = emptyState("Login as a customer to see your bookings.");
    return;
  }
  try {
    const { bookings } = await api("/api/bookings");
    target.innerHTML = bookings.length
      ? bookings.map((booking) => {
          const callAction = booking.driverPhone && ["accepted", "in-progress"].includes(booking.status)
            ? `<a class="mini-button call-button" href="tel:${booking.driverPhone}">Call driver</a>`
            : "<span class='job-meta'>Driver contact appears after acceptance</span>";
          return bookingRow(booking, callAction);
        }).join("")
      : emptyState("No bookings yet.");
  } catch (error) {
    target.innerHTML = emptyState(error.message);
  }
}

async function loadDriverJobs() {
  const target = $("#driverJobs");
  if (!state.user || !["driver", "admin"].includes(state.user.role)) {
    target.innerHTML = emptyState("Login as a driver to accept and update jobs.");
    return;
  }
  if (state.user.role === "driver" && !state.user.approved) {
    target.innerHTML = emptyState("Your driver account is waiting for admin approval.");
    return;
  }
  try {
    const { bookings } = await api("/api/driver/jobs");
    target.innerHTML = bookings.length
      ? bookings.map((booking) => {
          const canAccept = booking.status === "pending";
          const canPickup = booking.status === "accepted";
          const canComplete = booking.status === "in-progress";
          const actions = [
            canAccept ? `<button class="mini-button" data-action="accept" data-id="${booking.id}">Accept</button>` : "",
            canPickup ? `<button class="mini-button neutral" data-action="pickup" data-id="${booking.id}">Pick up</button>` : "",
            canComplete ? `<button class="mini-button" data-action="complete" data-id="${booking.id}">Complete</button>` : ""
          ].join("");
          return bookingRow(booking, actions || "<span class='job-meta'>No action</span>");
        }).join("")
      : emptyState("No driver jobs available.");
  } catch (error) {
    target.innerHTML = emptyState(error.message);
  }
}

async function loadAdmin() {
  const metrics = $("#adminMetrics");
  const bookings = $("#adminBookings");
  const drivers = $("#adminDrivers");
  if (!state.user || state.user.role !== "admin") {
    metrics.innerHTML = "";
    drivers.innerHTML = "";
    bookings.innerHTML = emptyState("Login as admin to manage the platform.");
    return;
  }
  try {
    const data = await api("/api/admin/summary");
    metrics.innerHTML = `
      <div class="metric"><strong>${data.metrics.users}</strong><span>Users</span></div>
      <div class="metric"><strong>${data.metrics.drivers}</strong><span>Drivers</span></div>
      <div class="metric"><strong>${data.metrics.pendingDrivers}</strong><span>Pending drivers</span></div>
      <div class="metric"><strong>${data.metrics.bookings}</strong><span>Bookings</span></div>
      <div class="metric"><strong>KES ${data.metrics.revenue}</strong><span>Revenue</span></div>
    `;
    drivers.innerHTML = data.drivers.length
      ? data.drivers.map((driver) => {
          const actions = driver.approved
            ? "<span class='job-meta'>Can accept jobs</span>"
            : `<button class="mini-button" data-action="approve-driver" data-id="${driver.id}">Approve driver</button>`;
          return driverRow(driver, actions);
        }).join("")
      : emptyState("No driver registrations yet.");
    bookings.innerHTML = data.bookings.map((booking) => {
      const actions = `
        <button class="mini-button neutral" data-action="admin-accepted" data-id="${booking.id}">Approve</button>
        <button class="mini-button danger" data-action="admin-cancelled" data-id="${booking.id}">Cancel</button>
      `;
      return bookingRow(booking, actions);
    }).join("");
  } catch (error) {
    bookings.innerHTML = emptyState(error.message);
  }
}

async function refreshAll() {
  renderSession();
  await Promise.allSettled([loadHealth(), loadCustomerBookings(), loadDriverJobs(), loadAdmin()]);
}

async function handleAuth(path, form) {
  const body = await formToPayload(form);
  const data = await api(path, { method: "POST", body: JSON.stringify(body) });
  if (!data.token) {
    toast(data.message || "Submitted.");
    await refreshAll();
    return;
  }
  setSession(data.user, data.token);
  toast(`Signed in as ${data.user.role}.`);
  await refreshAll();
}

async function updateBooking(id, status) {
  await api(`/api/bookings/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  toast(`Booking moved to ${status}.`);
  await refreshAll();
}

async function approveDriver(id) {
  await api(`/api/admin/drivers/${id}/approve`, { method: "PATCH", body: JSON.stringify({ approved: true }) });
  toast("Driver approved and added to the system.");
  await refreshAll();
}

$$(".mode-tab").forEach((tab) => tab.addEventListener("click", () => setService(tab.dataset.service)));
$("#bookingForm").addEventListener("input", (event) => {
  if (["pickup", "destination"].includes(event.target.name)) {
    resetFareApproval();
    setService(state.activeService);
  }
});
$("#loginRole").addEventListener("change", (event) => {
  const isCustomer = event.target.value === "customer";
  $(".customer-login-field").style.display = isCustomer ? "grid" : "none";
  $(".customer-login-field input").required = isCustomer;
  $(".staff-login-field input").required = !isCustomer;
});
$("#refreshButton").addEventListener("click", refreshAll);
$("#customerRefresh").addEventListener("click", loadCustomerBookings);
$("#driverRefresh").addEventListener("click", loadDriverJobs);
$("#adminRefresh").addEventListener("click", loadAdmin);

$("#logoutButton").addEventListener("click", () => {
  setSession(null, "");
  toast("Logged out.");
  refreshAll();
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await handleAuth("/api/auth/login", event.currentTarget); } catch (error) { toast(error.message); }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await handleAuth("/api/auth/register", event.currentTarget); } catch (error) { toast(error.message); }
});

$("#driverRegisterForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await handleAuth("/api/drivers/register", event.currentTarget); } catch (error) { toast(error.message); }
});

$("#driverLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { await handleAuth("/api/auth/login", event.currentTarget); } catch (error) { toast(error.message); }
});

$("#bookingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.user) {
    toast("Login with your email and phone before booking.");
    return;
  }
  if (!state.fareApproved) {
    quoteCashFare(event.currentTarget);
    return;
  }
  const body = Object.fromEntries(new FormData(event.currentTarget));
  body.service = state.activeService;
  body.fareApproved = true;
  body.paymentMethod = "cash";
  body.quotedFare = state.quotedFare;
  try {
    const { booking } = await api("/api/bookings", { method: "POST", body: JSON.stringify(body) });
    toast(`Fare approved. Searching nearest rider for ${booking.id}.`);
    resetFareApproval();
    await refreshAll();
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const statusMap = {
    accept: "accepted",
    pickup: "in-progress",
    complete: "completed",
    "admin-accepted": "accepted",
    "admin-cancelled": "cancelled"
  };
  try {
    if (action === "approve-driver") await approveDriver(id);
    else await updateBooking(id, statusMap[action]);
  } catch (error) { toast(error.message); }
});

setService("taxi");
$("#loginRole").dispatchEvent(new Event("change"));
refreshAll();
