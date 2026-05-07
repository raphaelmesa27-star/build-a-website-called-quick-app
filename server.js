const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const seed = {
  users: [
    { id: "u-100", name: "Customer Demo", email: "customer@quick.app", phone: "+254700123456", password: "", role: "customer" },
    { id: "u-200", name: "Amina Rider", idNumber: "12345678", email: "driver@quick.app", phone: "+254722456789", password: "demo123", role: "driver", vehicle: "Bodaboda", numberPlate: "KDA 123B", vehicleColor: "Green", passportPhoto: "", location: { lat: -1.2648, lng: 36.8024, label: "Westlands" }, approved: true },
    { id: "u-300", name: "Admin Demo", email: "admin@quick.app", password: "demo123", role: "admin" },
    { id: "u-301", name: "Raphael Mesa", email: "raphaelmesa27@gmail.com", password: "demo123", role: "admin" }
  ],
  bookings: [
    {
      id: "BK-1001",
      customerId: "u-100",
      customerName: "Customer Demo",
      customerEmail: "customer@quick.app",
      customerPhone: "+254700123456",
      driverId: "u-200",
      driverName: "Amina Rider",
      driverPhone: "+254722456789",
      driverVehicle: "Bodaboda",
      driverNumberPlate: "KDA 123B",
      driverVehicleColor: "Green",
      driverPassportPhoto: "",
      service: "boda",
      pickup: "Kilimani",
      pickupLocation: { lat: -1.2921, lng: 36.7856, label: "Kilimani" },
      destination: "Upper Hill",
      time: "Now",
      price: 210,
      status: "accepted",
      createdAt: new Date().toISOString()
    },
    {
      id: "BK-1002",
      customerId: "u-100",
      customerName: "Customer Demo",
      customerEmail: "customer@quick.app",
      customerPhone: "+254700123456",
      driverId: null,
      driverName: "",
      driverPhone: "",
      driverVehicle: "",
      driverNumberPlate: "",
      driverVehicleColor: "",
      driverPassportPhoto: "",
      service: "courier",
      pickup: "Westlands",
      pickupLocation: { lat: -1.2648, lng: 36.8024, label: "Westlands" },
      destination: "Industrial Area",
      time: "In 30 minutes",
      price: 340,
      status: "pending",
      createdAt: new Date().toISOString()
    }
  ],
  sessions: {}
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 6_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getUser(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = db.sessions[token];
  return userId ? db.users.find((user) => user.id === userId) : null;
}

function requireUser(req, res, db) {
  const user = getUser(req, db);
  if (!user) send(res, 401, { error: "Please login first." });
  return user;
}

function requireRole(req, res, db, roles) {
  const user = requireUser(req, res, db);
  if (!user) return null;
  if (!roles.includes(user.role)) {
    send(res, 403, { error: "You do not have access to this area." });
    return null;
  }
  return user;
}

function estimatePrice(service) {
  return { taxi: 680, boda: 210, courier: 340 }[service] || 250;
}

const knownLocations = [
  ["westlands", -1.2648, 36.8024],
  ["kilimani", -1.2921, 36.7856],
  ["cbd", -1.2864, 36.8172],
  ["tom mboya", -1.2836, 36.8241],
  ["upper hill", -1.3006, 36.8126],
  ["industrial area", -1.3133, 36.8517],
  ["nairobi", -1.2864, 36.8172],
  ["jomo kenyatta", -1.3192, 36.9278],
  ["airport", -1.3192, 36.9278]
];

function locationFromText(text = "") {
  const normalized = text.toLowerCase();
  const known = knownLocations.find(([name]) => normalized.includes(name));
  if (known) return { lat: known[1], lng: known[2], label: text };
  const hash = [...normalized].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return {
    lat: -1.2864 + ((hash % 80) - 40) / 1000,
    lng: 36.8172 + (((hash * 7) % 80) - 40) / 1000,
    label: text || "Pickup"
  };
}

function distanceKm(from, to) {
  if (!from || !to) return null;
  const radius = 6371;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function trackingFor(booking, driver) {
  if (!driver || !booking.pickupLocation || !["accepted", "in-progress"].includes(booking.status)) return null;
  const driverLocation = booking.driverLocation || driver.location;
  const km = distanceKm(driverLocation, booking.pickupLocation);
  if (km === null) return null;
  const speed = booking.service === "boda" ? 26 : booking.service === "courier" ? 22 : 18;
  const minutes = Math.max(2, Math.ceil((km / speed) * 60));
  const progress = Math.max(8, Math.min(92, 100 - (km / 8) * 100));
  return {
    distanceKm: Number(km.toFixed(1)),
    etaMinutes: minutes,
    driverLocation,
    pickupLocation: booking.pickupLocation,
    progress: Number(progress.toFixed(0)),
    updatedAt: booking.locationUpdatedAt || new Date().toISOString()
  };
}

function enrichBooking(db, booking) {
  const customer = db.users.find((user) => user.id === booking.customerId);
  const driver = db.users.find((user) => user.id === booking.driverId);
  return {
    ...booking,
    customerName: booking.customerName || customer?.name || "",
    customerEmail: booking.customerEmail || customer?.email || "",
    customerPhone: booking.customerPhone || customer?.phone || "",
    driverName: booking.driverName || driver?.name || "",
    driverPhone: booking.driverPhone || driver?.phone || "",
    driverVehicle: booking.driverVehicle || driver?.vehicle || "",
    driverNumberPlate: booking.driverNumberPlate || driver?.numberPlate || "",
    driverVehicleColor: booking.driverVehicleColor || driver?.vehicleColor || "",
    driverPassportPhoto: booking.driverPassportPhoto || driver?.passportPhoto || "",
    driverLocation: booking.driverLocation || driver?.location || null,
    pickupLocation: booking.pickupLocation || locationFromText(booking.pickup),
    tracking: trackingFor({ ...booking, pickupLocation: booking.pickupLocation || locationFromText(booking.pickup) }, driver),
    price: `KES ${booking.price}`
  };
}

async function handleApi(req, res, url) {
  const db = readDb();

  if (req.method === "GET" && url.pathname === "/api/health") {
    const activeBookings = db.bookings.filter((booking) => !["completed", "cancelled"].includes(booking.status)).length;
    return send(res, 200, { ok: true, activeBookings });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await parseBody(req);
    if (body.role === "customer") {
      if (!body.email || !body.phone) return send(res, 400, { error: "Email and phone number are required for customers." });
      let user = db.users.find((item) => item.email === body.email && item.role === "customer");
      if (!user && db.users.some((item) => item.email === body.email)) return send(res, 409, { error: "That email belongs to a staff account. Use driver or admin login." });
      if (!user) {
        user = { id: `u-${Date.now()}`, name: body.email.split("@")[0], email: body.email, phone: body.phone, password: "", role: "customer" };
        db.users.push(user);
      } else {
        user.phone = body.phone;
      }
      const token = createToken();
      db.sessions[token] = user.id;
      writeDb(db);
      return send(res, 200, { token, user: publicUser(user) });
    }
    const user = db.users.find((item) => item.email === body.email && item.password === body.password && item.role === body.role);
    if (!user) return send(res, 401, { error: "Invalid email or password." });
    if (user.role === "driver" && !user.approved) return send(res, 403, { error: "Your driver account is waiting for admin approval." });
    const token = createToken();
    db.sessions[token] = user.id;
    writeDb(db);
    return send(res, 200, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await parseBody(req);
    if (!body.name || !body.email || !body.phone) return send(res, 400, { error: "Name, email, and phone number are required." });
    if (body.role === "driver" && !body.password) return send(res, 400, { error: "Drivers need a password." });
    if (db.users.some((user) => user.email === body.email)) return send(res, 409, { error: "Email is already registered." });
    const isDriver = body.role === "driver";
    const user = { id: `u-${Date.now()}`, name: body.name, email: body.email, phone: body.phone, password: body.password || "", role: isDriver ? "driver" : "customer", vehicle: isDriver ? body.vehicle || "Driver" : undefined, approved: !isDriver };
    db.users.push(user);
    if (isDriver) {
      writeDb(db);
      return send(res, 201, { user: publicUser(user), message: "Driver registration submitted. Wait for admin approval before logging in." });
    }
    const token = createToken();
    db.sessions[token] = user.id;
    writeDb(db);
    return send(res, 201, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && url.pathname === "/api/drivers/register") {
    const body = await parseBody(req);
    if (!body.name || !body.idNumber || !body.email || !body.phone || !body.password || !body.vehicle || !body.numberPlate || !body.vehicleColor || !body.passportPhoto) {
      return send(res, 400, { error: "Name, ID number, email, phone, passport photo, vehicle type, number plate, color, and password are required." });
    }
    if (db.users.some((user) => user.email === body.email)) return send(res, 409, { error: "Email is already registered." });
    const user = {
      id: `u-${Date.now()}`,
      name: body.name,
      idNumber: body.idNumber,
      email: body.email,
      phone: body.phone,
      password: body.password,
      role: "driver",
      vehicle: body.vehicle,
      numberPlate: body.numberPlate,
      vehicleColor: body.vehicleColor,
      passportPhoto: body.passportPhoto,
      location: locationFromText(body.location || "Westlands"),
      approved: false,
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    writeDb(db);
    return send(res, 201, { user: publicUser(user), message: "Driver registration submitted. Wait for admin approval before logging in." });
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    const user = requireUser(req, res, db);
    if (!user) return;
    const bookings = user.role === "admin" ? db.bookings : db.bookings.filter((booking) => booking.customerId === user.id);
    return send(res, 200, { bookings: bookings.map((booking) => enrichBooking(db, booking)) });
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const user = requireRole(req, res, db, ["customer", "admin"]);
    if (!user) return;
    const body = await parseBody(req);
    if (!body.pickup || !body.destination || !body.service) return send(res, 400, { error: "Pickup, destination, and service are required." });
    if (!body.fareApproved) return send(res, 400, { error: "Approve the cash fare before searching for a rider." });
    const approvedFare = Number(body.quotedFare) || estimatePrice(body.service);
    const booking = {
      id: `BK-${Date.now().toString().slice(-6)}`,
      customerId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone || "",
      driverId: null,
      driverName: "",
      driverPhone: "",
      driverVehicle: "",
      driverNumberPlate: "",
      driverVehicleColor: "",
      driverPassportPhoto: "",
      service: body.service,
      pickup: body.pickup,
      pickupLocation: locationFromText(body.pickup),
      destination: body.destination,
      time: body.time || "Now",
      price: approvedFare,
      paymentMethod: "cash",
      fareApproved: true,
      dispatchStatus: "searching-nearest-rider",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    db.bookings.unshift(booking);
    writeDb(db);
    return send(res, 201, { booking: enrichBooking(db, booking) });
  }

  if (req.method === "GET" && url.pathname === "/api/driver/jobs") {
    const user = requireRole(req, res, db, ["driver", "admin"]);
    if (!user) return;
    if (user.role === "driver" && !user.approved) return send(res, 403, { error: "Your driver account is waiting for admin approval." });
    const bookings = db.bookings.filter((booking) => booking.status === "pending" || booking.driverId === user.id || user.role === "admin");
    return send(res, 200, { bookings: bookings.map((booking) => enrichBooking(db, booking)) });
  }

  const statusMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const user = requireRole(req, res, db, ["driver", "admin"]);
    if (!user) return;
    if (user.role === "driver" && !user.approved) return send(res, 403, { error: "Your driver account is waiting for admin approval." });
    const body = await parseBody(req);
    const booking = db.bookings.find((item) => item.id === statusMatch[1]);
    if (!booking) return send(res, 404, { error: "Booking not found." });
    const allowed = ["accepted", "in-progress", "completed", "cancelled"];
    if (!allowed.includes(body.status)) return send(res, 400, { error: "Unsupported status." });
    if (user.role === "driver" && booking.driverId && booking.driverId !== user.id) return send(res, 403, { error: "This job is assigned to another driver." });
    if (user.role === "driver" && body.status === "accepted") {
      booking.driverId = user.id;
      booking.driverName = user.name;
      booking.driverPhone = user.phone || "";
      booking.driverVehicle = user.vehicle || "";
      booking.driverNumberPlate = user.numberPlate || "";
      booking.driverVehicleColor = user.vehicleColor || "";
      booking.driverPassportPhoto = user.passportPhoto || "";
      booking.driverLocation = user.location || locationFromText("Westlands");
      booking.locationUpdatedAt = new Date().toISOString();
    }
    if (user.role === "admin" && body.status === "accepted" && !booking.driverId) {
      const driver = db.users.find((item) => item.role === "driver" && item.approved);
      booking.driverId = driver?.id || null;
      booking.driverName = driver?.name || "";
      booking.driverPhone = driver?.phone || "";
      booking.driverVehicle = driver?.vehicle || "";
      booking.driverNumberPlate = driver?.numberPlate || "";
      booking.driverVehicleColor = driver?.vehicleColor || "";
      booking.driverPassportPhoto = driver?.passportPhoto || "";
      booking.driverLocation = driver?.location || locationFromText("Westlands");
      booking.locationUpdatedAt = new Date().toISOString();
    }
    booking.status = body.status;
    writeDb(db);
    return send(res, 200, { booking: enrichBooking(db, booking) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/summary") {
    const user = requireRole(req, res, db, ["admin"]);
    if (!user) return;
    const completed = db.bookings.filter((booking) => booking.status === "completed");
    const metrics = {
      users: db.users.length,
      drivers: db.users.filter((item) => item.role === "driver" && item.approved).length,
      pendingDrivers: db.users.filter((item) => item.role === "driver" && !item.approved).length,
      bookings: db.bookings.length,
      revenue: completed.reduce((sum, booking) => sum + booking.price, 0)
    };
    return send(res, 200, {
      metrics,
      drivers: db.users.filter((item) => item.role === "driver").map((driver) => publicUser(driver)),
      bookings: db.bookings.map((booking) => enrichBooking(db, booking))
    });
  }

  const driverApprovalMatch = url.pathname.match(/^\/api\/admin\/drivers\/([^/]+)\/approve$/);
  if (req.method === "PATCH" && driverApprovalMatch) {
    const user = requireRole(req, res, db, ["admin"]);
    if (!user) return;
    const driver = db.users.find((item) => item.id === driverApprovalMatch[1] && item.role === "driver");
    if (!driver) return send(res, 404, { error: "Driver not found." });
    driver.approved = true;
    driver.approvedAt = new Date().toISOString();
    driver.approvedBy = user.id;
    writeDb(db);
    return send(res, 200, { driver: publicUser(driver) });
  }

  send(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(__dirname, requested));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": PUBLIC_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    serveStatic(req, res, url);
  } catch (error) {
    send(res, 500, { error: error.message || "Server error" });
  }
});

ensureDb();
server.listen(PORT, () => {
  console.log(`Quick App running at http://localhost:${PORT}`);
});
