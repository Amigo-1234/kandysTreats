// ===============================
// ADMIN.JS — Kandys Treats (CLEAN)
// ===============================

// Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ===============================
// FIREBASE INIT
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCWDTVJgW5dqcBbnZRb6m_Yz-fB7flO9nU",
  authDomain: "kandystreat-840b1.firebaseapp.com",
  projectId: "kandystreat-840b1",
  storageBucket: "kandystreat-840b1.firebasestorage.app",
  messagingSenderId: "394965571986",
  appId: "1:394965571986:web:ce79a02096c2eb2f2b094b",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===============================
// DOM
// ===============================
const tbody = document.getElementById("orders-tbody");
const searchInput = document.getElementById("order-search");
const filters = document.getElementById("status-filters");
const logoutBtn = document.getElementById("admin-logout");

const statTotal = document.getElementById("stat-total");
const statNew = document.getElementById("stat-new");
const statPreparing = document.getElementById("stat-preparing");
const statCompleted = document.getElementById("stat-completed");
const statRevenue = document.getElementById("stat-revenue");

// ===============================
// STATE
// ===============================
const STATE = {
  orders: [],
  filter: "All",
  search: "",
  unsubscribe: null
};

// ===============================
// HELPERS
// ===============================
const formatPrice = (n) =>
  `₦${Number(n || 0).toLocaleString("en-NG")}`;

const formatDate = (ts) =>
  ts?.toDate().toLocaleString("en-NG") || "—";

const isToday = (ts) => {
  if (!ts) return false;
  const d = ts.toDate();
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};

// ===============================
// AUTH GATE (NO LOGIN UI HERE)
// ===============================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "admin-login.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = "admin-login.html";
    return;
  }

  const { role } = snap.data();
  if (role !== "staff" && role !== "superAdmin") {
    await signOut(auth);
    window.location.href = "admin-login.html";
    return;
  }

  // ✅ AUTH OK → START DATA
  startOrdersListener();
});

// ===============================
// LOGOUT
// ===============================
logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "admin-login.html";
});

// ===============================
// FIRESTORE LISTENER
// ===============================
function startOrdersListener() {
  if (STATE.unsubscribe) return;

  const q = query(
    collection(db, "orders"),
    where("paid", "==", true),
    orderBy("createdAt", "desc")
  );

  STATE.unsubscribe = onSnapshot(q, (snap) => {
    STATE.orders = snap.docs.map(d => d.data());
    render();
    updateStats();
  });
}

// ===============================
// FILTERS
// ===============================
filters?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;

  STATE.filter = btn.dataset.filter;

  [...filters.children].forEach(b =>
    b.classList.toggle("is-active", b === btn)
  );

  render();
});

searchInput?.addEventListener("input", (e) => {
  STATE.search = e.target.value.toLowerCase();
  render();
});

// ===============================
// RENDER
// ===============================
function getVisibleOrders() {
  let list = [...STATE.orders];

  if (STATE.filter !== "All") {
    list = list.filter(o => (o.status || "New") === STATE.filter);
  }

  if (STATE.search) {
    list = list.filter(o =>
      o.id.toLowerCase().includes(STATE.search) ||
      o.customer?.name?.toLowerCase().includes(STATE.search) ||
      o.customer?.phone?.includes(STATE.search)
    );
  }

  return list;
}

function render() {
  tbody.innerHTML = "";

  const list = getVisibleOrders();

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6">No orders</td></tr>`;
    return;
  }

  list.forEach(order => {
    const tr = document.createElement("tr");
    tr.dataset.id = order.id; // 🔑 important

    tr.innerHTML = `
      <td>${order.id}</td>
      <td>${order.createdAt.toDate().toLocaleString("en-NG")}</td>
      <td>${order.customer?.name || "-"}</td>
      <td>${formatPrice(order.total)}</td>
      <td>${order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</td>
      <td>${order.status || "New"}</td>
    `;

    // 👉 CLICK HANDLER
    tr.addEventListener("click", () => {
      STATE.selectedOrderId = order.id;

      // highlight row
      [...tbody.children].forEach(r => r.classList.remove("active"));
      tr.classList.add("active");

      renderOrderDetails(order);
    });

    tbody.appendChild(tr);

    // animation visibility
    requestAnimationFrame(() => tr.classList.add("visible"));
  });
}

function renderOrderDetails(order) {
  const empty = document.getElementById("order-detail-empty");
  const content = document.getElementById("order-detail-content");

  if (!content || !empty) return;

  empty.style.display = "none";
  content.hidden = false;

  content.querySelector("[data-detail-id]").textContent = order.id;
  content.querySelector("[data-detail-name]").textContent =
    order.customer?.name || "—";
  content.querySelector("[data-detail-phone]").textContent =
    order.customer?.phone || "—";
  content.querySelector("[data-detail-type]").textContent =
    order.fulfilment === "delivery" ? "Delivery" : "Pickup";
  content.querySelector("[data-detail-address]").textContent =
    order.fulfilment === "delivery"
      ? (order.customer?.address || "—")
      : "Pickup (no address)";
  content.querySelector("[data-detail-total]").textContent =
    formatPrice(order.total);

  // ITEMS
  const itemsWrap = content.querySelector("[data-detail-items]");
  itemsWrap.innerHTML = "";

  if (order.items?.length) {
    order.items.forEach(i => {
      const div = document.createElement("div");
      div.textContent = `${i.qty} × ${i.name}`;
      itemsWrap.appendChild(div);
    });
  } else {
    itemsWrap.textContent = "No items";
  }

  // STATUS
  const statusText = document.getElementById("current-status-text");
  if (statusText) statusText.textContent = order.status || "New";
}

// ===============================
// STATS
// ===============================
function updateStats() {
  const orders = STATE.orders;

  statTotal.textContent = orders.length;
  statNew.textContent = orders.filter(o => o.status === "New").length;
  statPreparing.textContent = orders.filter(o => o.status === "Preparing").length;
  statCompleted.textContent = orders.filter(o => o.status === "Completed").length;

  const todayRevenue = orders
    .filter(o => isToday(o.createdAt))
    .reduce((sum, o) => sum + (o.netAmount || 0), 0);

  statRevenue.textContent = formatPrice(todayRevenue);
}