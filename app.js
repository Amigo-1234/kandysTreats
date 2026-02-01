// app.js (FULL UPDATED)

// Firebase (CDN module imports)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
// Firestore
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  where,          // 👈 ADD THIS
  onSnapshot,
  updateDoc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Messaging
import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// Your Firebase config
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
const messaging = getMessaging(app);


window.db = db; // for debugging
window.auth = auth; // for debugging

// Local keys (cart stays localStorage for speed)
const CART_KEY = "kandys_cart";
const ORDERS_KEY = "kandys_orders";
const MENU_CACHE_KEY = "kandys_menu_cache_v1";
const ORDER_STATUSES = ["New", "Preparing", "Out", "Completed"];
 // no longer used by admin, but left for now

// Mock menu data
// TODO: Firestore: fetch menu
let MENU_ITEMS = []; // will be filled from Firestore
let inlineUnsub = null; // for inline tracking unsubscribe

async function requestNotificationToken() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const token = await getToken(messaging, {
      vapidKey: "BDOZiSxAx_7P0JoHWv_UQOW8xIdpez_4RTAwnYTE-QNJAPS6CRmM2XbbT3K409uwDoCu4ebxPjXFRqQoMyRcGwg",
    });

    return token;
  } catch (err) {
    console.error("Notification permission failed", err);
    return null;
  }
}


// Utilities
const formatPrice = (value) => `₦${Number(value || 0).toLocaleString("en-NG")}`;

const readCart = () => {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveCart = (cart) => {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  syncCartBadge(cart);
};

const readOrders = () => {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveOrders = (orders) => {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
};

const syncCartBadge = (cart = readCart()) => {
  const totalQty = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll(".js-cart-count").forEach((el) => {
    el.textContent = totalQty;
    el.style.opacity = totalQty > 0 ? "1" : "0";
  });
};

const showToast = (message) => {
  const container = document.querySelector(".toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.innerHTML = "";
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    setTimeout(() => toast.remove(), 200);
  }, 2000);
};

const spawnPlusOne = (x, y) => {
  const bubble = document.createElement("div");
  bubble.className = "plus-one-bubble";
  bubble.textContent = "+1";
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
  document.body.appendChild(bubble);
  setTimeout(() => bubble.remove(), 450);
};

const PLACEHOLDER_IMAGES = [
  "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg",
  "https://images.pexels.com/photos/70497/pexels-photo-70497.jpeg",
  "https://images.pexels.com/photos/461198/pexels-photo-461198.jpeg",
  "https://images.pexels.com/photos/958545/pexels-photo-958545.jpeg",
];

const getRandomImage = () =>
  PLACEHOLDER_IMAGES[Math.floor(Math.random() * PLACEHOLDER_IMAGES.length)];

function normalizePhone(phone) {
  if (!phone) return "";
  return phone.replace(/\D/g, ""); // removes +, spaces, etc
}


// Menu rendering
const initMenuPage = () => {
  const grid = document.getElementById("menu-grid");
  const tabsContainer = document.getElementById("menu-tabs");
  const searchInput = document.getElementById("menu-search");
  const clearBtn = document.getElementById("clear-search");
  if (!grid || !tabsContainer) return;

  let activeCategory = "All";
  let queryText = "";

  const getCategories = () => {
  const cats = MENU_ITEMS.map(i => i.category).filter(Boolean);
  return ["All", ...new Set(cats)];
};

const showMenuSkeletons = (count = 6) => {
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "menu-card skeleton-card";
    card.innerHTML = `
      <div class="skeleton-img"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    `;
    grid.appendChild(card);
  }
};

const initLazyImages = () => {
  const images = document.querySelectorAll(".lazy-img");

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        const src = el.dataset.src;

        if (src) {
          el.style.backgroundImage = `url("${src}")`;
          el.style.backgroundSize = "cover";
          el.style.backgroundPosition = "center";
        }

        el.classList.remove("lazy-img");
        obs.unobserve(el);
      });
    },
    { rootMargin: "120px" } // preload slightly before visible
  );

  images.forEach(img => observer.observe(img));
};



  // ⚡ Load menu instantly from cache (if available)
const cachedMenu = localStorage.getItem(MENU_CACHE_KEY);

if (cachedMenu) {
  try {
    MENU_ITEMS = JSON.parse(cachedMenu);
    renderTabs();
    renderGrid();
    initLazyImages();
  } catch {
    localStorage.removeItem(MENU_CACHE_KEY);
    showMenuSkeletons();
  }
} else {
  showMenuSkeletons(); // 👈 FIRST TIME VISIT
}


  const menusQuery = query(
  collection(db, "menus"),
  orderBy("createdAt", "asc")
);

onSnapshot(menusQuery, (snapshot) => {
  const freshMenu = snapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name,
    price: doc.data().price,
    category: doc.data().section,
    image: doc.data().image || "",
    soldOut: doc.data().status === "sold-out",
  }));

  // 🧠 Prevent unnecessary re-render
  const cached = localStorage.getItem(MENU_CACHE_KEY);
  const cachedParsed = cached ? JSON.parse(cached) : [];

  const hasChanged =
  JSON.stringify(freshMenu) !== JSON.stringify(cachedParsed);


  if (!hasChanged) return;

  MENU_ITEMS = freshMenu;

  // 💾 Save to cache
  localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(freshMenu));

  renderTabs();
  renderGrid();
});




  const renderTabs = () => {
  tabsContainer.innerHTML = "";

  getCategories().forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-tab" + (cat === activeCategory ? " is-active" : "");
    btn.textContent = cat;

    btn.onclick = () => {
      activeCategory = cat;
      document
        .querySelectorAll(".menu-tab")
        .forEach(el => el.classList.toggle("is-active", el === btn));
      renderGrid();
    };

    tabsContainer.appendChild(btn);
  });
};


  const renderGrid = () => {
    grid.innerHTML = "";

    initLazyImages();

    const filtered = MENU_ITEMS.filter((item) => {
      const matchesCat = activeCategory === "All" || item.category === activeCategory;
      const matchesQuery =
  !queryText ||
  item.name.toLowerCase().includes(queryText) ||
  (item.description || "").toLowerCase().includes(queryText);

      return matchesCat && matchesQuery;
    });

    if (!filtered.length) {
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = "No items match that search yet.";
      grid.appendChild(p);
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className = "menu-card glass-card interactive-card";
      if (item.soldOut) card.classList.add("sold-out");

      const img = document.createElement("div");
img.className = "menu-card-image lazy-img";

// ✅ SET IMAGE SOURCE HERE
img.dataset.src = item.image || getRandomImage();

      


      if (item.soldOut) {
        const badge = document.createElement("span");
        badge.className = "sold-out-badge";
        badge.textContent = "Sold out";
        img.appendChild(badge);
      }

      const body = document.createElement("div");
      body.className = "menu-card-body";

      const title = document.createElement("h3");
      title.textContent = item.name;

      const desc = document.createElement("p");
      desc.textContent = item.description || "";


      const meta = document.createElement("div");
      meta.className = "menu-card-meta";

      const price = document.createElement("span");
      price.className = "price";
      price.textContent = formatPrice(item.price);

      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = item.category;

      meta.append(price, chip);

      const qtyRow = document.createElement("div");
      qtyRow.className = "qty-row";

      const qtyGroup = document.createElement("div");
      qtyGroup.className = "qty-group";

      const minus = document.createElement("button");
      minus.type = "button";
      minus.className = "qty-btn";
      minus.textContent = "−";

      const value = document.createElement("span");
      value.className = "qty-value";
      value.textContent = "1";

      const plus = document.createElement("button");
      plus.type = "button";
      plus.className = "qty-btn";
      plus.textContent = "+";

      qtyGroup.append(minus, value, plus);

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-primary menu-add-btn";
      addBtn.textContent = item.soldOut ? "Unavailable" : "Add";

      plus.addEventListener("click", () => {
        value.textContent = String(Number(value.textContent) + 1);
      });
      minus.addEventListener("click", () => {
        const next = Math.max(1, Number(value.textContent) - 1);
        value.textContent = String(next);
      });

      if (!item.soldOut) {
        addBtn.addEventListener("click", (ev) => {
          const qty = Number(value.textContent) || 1;
          const curCart = readCart();
          const existing = curCart[item.id];
          curCart[item.id] = {
            id: item.id,
            name: item.name,
            price: item.price,
            qty: (existing?.qty || 0) + qty,
          };
          saveCart(curCart);
          showToast(`Added ${qty} × ${item.name} to cart`);
          const rect = ev.currentTarget.getBoundingClientRect();
          spawnPlusOne(rect.left + rect.width / 2, rect.top);
        });
      }

      qtyRow.append(qtyGroup, addBtn);
      body.append(title, desc, meta, qtyRow);
      card.append(img, body);
      grid.appendChild(card);
    });

    initLazyImages();
  };

  searchInput?.addEventListener("input", (e) => {
    queryText = e.target.value.toLowerCase().trim();
    renderGrid();
  });

  clearBtn?.addEventListener("click", () => {
    searchInput.value = "";
    queryText = "";
    renderGrid();
  });
};

// Cart page (UPDATED: creates Firestore order)
const initCartPage = () => {
  const itemsContainer = document.getElementById("cart-items");
  const emptyLabel = document.getElementById("cart-empty");
  const clearBtn = document.getElementById("clear-cart");
  const subtotalEl = document.getElementById("summary-subtotal");
  const deliveryEl = document.getElementById("summary-delivery");
  const totalEl = document.getElementById("summary-total");
  const form = document.getElementById("checkout-form");
  const fulfilmentButtons = document.querySelectorAll(".toggle-option[data-fulfilment]");
  const addressField = document.getElementById("address-field");
  const placeBtn = document.getElementById("place-order-btn");
  const fulfilment =
  document.querySelector(".toggle-option.is-active")?.dataset.fulfilment ||
  "delivery";


  if (!itemsContainer || !subtotalEl) return;

  const DELIVERY_FEE = 500;

  /* ================= TAKEAWAY LOGIC ================= */
  function calculateTakeawayFee(cartItems) {
  let hasFood = false;
  let hasRice = false;
  let hasBeans = false;
  let hasOfada = false;

  cartItems.forEach(item => {
    const name = item.name.toLowerCase();

    // ✅ Explicitly IGNORE drinks & non-food
    if (
      name.includes("coke") ||
      name.includes("fanta") ||
      name.includes("pepsi") ||
      name.includes("soda") ||
      name.includes("juice") ||
      name.includes("chivita") ||
      name.includes("hollandia") ||
      name.includes("yogurt") ||
      name.includes("water")
    ) {
      return;
    }

    // ✅ Only real food reaches here
    if (
      name.includes("rice") ||
      name.includes("beans") ||
      name.includes("ofada") ||
      name.includes("amala") ||
      name.includes("swallow") ||
      name.includes("semo") ||
      name.includes("eba")
    ) {
      hasFood = true;
    }

    if (name.includes("rice")) hasRice = true;
    if (name.includes("beans")) hasBeans = true;
    if (name.includes("ofada")) hasOfada = true;
  });

  if (!hasFood) return 0;

  // ₦300 rules
  if (hasOfada || (hasRice && hasBeans)) {
    return 300;
  }

  // Any other food
  return 200;
}

  /* ================= RENDER CART ================= */
  const render = () => {
    const cart = readCart();
    const ids = Object.keys(cart);

    itemsContainer.innerHTML = "";
    emptyLabel.style.display = ids.length ? "none" : "block";

    let subtotal = 0;

   ids.forEach(id => {
  const item = cart[id];
  subtotal += item.price * item.qty;

  const row = document.createElement("div");
  row.className = "cart-item";

  const main = document.createElement("div");
  main.className = "cart-item-main";

  const title = document.createElement("div");
  title.className = "cart-item-title";
  title.textContent = item.name;

  const meta = document.createElement("div");
  meta.className = "cart-item-meta";
  meta.innerHTML = `
    <span>${item.qty} × ${formatPrice(item.price)}</span>
    <span>${formatPrice(item.price * item.qty)}</span>
  `;

  main.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "cart-item-actions";

  const qtyGroup = document.createElement("div");
  qtyGroup.className = "qty-group";

  const minus = document.createElement("button");
  minus.className = "qty-btn";
  minus.textContent = "−";

  const val = document.createElement("span");
  val.className = "qty-value";
  val.textContent = item.qty;

  const plus = document.createElement("button");
  plus.className = "qty-btn";
  plus.textContent = "+";

  qtyGroup.append(minus, val, plus);

  const remove = document.createElement("button");
  remove.className = "cart-item-remove";
  remove.textContent = "Remove";

  // ➕ increase
  plus.addEventListener("click", () => {
    const cartState = readCart();
    cartState[id].qty += 1;
    saveCart(cartState);
    render();
  });

  // ➖ decrease
  minus.addEventListener("click", () => {
    const cartState = readCart();
    cartState[id].qty -= 1;
    if (cartState[id].qty <= 0) delete cartState[id];
    saveCart(cartState);
    render();
  });

  // 🗑 remove
  remove.addEventListener("click", () => {
    const cartState = readCart();
    delete cartState[id];
    saveCart(cartState);
    render();
  });

  actions.append(qtyGroup, remove);
  row.append(main, actions);
  itemsContainer.appendChild(row);
});


    const fulfilment =
  document.querySelector(".toggle-option.is-active")?.dataset.fulfilment ||
  "delivery";

const cartItems = ids.map(id => cart[id]);
const takeawayFee =
  fulfilment === "delivery" ? calculateTakeawayFee(cartItems) : 0;



if (takeawayFee > 0) {
  const row = document.createElement("div");
  row.className = "cart-item cart-item-fee";

  row.innerHTML = `
    <div class="cart-item-main">
      <div class="cart-item-title">Takeaway Pack</div>
      <div class="cart-item-meta">
        <span>1 × ${formatPrice(takeawayFee)}</span>
        <span>${formatPrice(takeawayFee)}</span>
      </div>
    </div>
  `;

  itemsContainer.appendChild(row);
}

const deliveryFee =
  fulfilment === "delivery" && ids.length ? DELIVERY_FEE : 0;

const takeawayRow = document.getElementById("summary-takeaway-row");
const takeawayEl = document.getElementById("summary-takeaway");

subtotalEl.textContent = formatPrice(subtotal);

// Takeaway
if (takeawayFee > 0) {
  takeawayRow.style.display = "flex";
  takeawayEl.textContent = formatPrice(takeawayFee);
} else {
  takeawayRow.style.display = "none";
}

// Delivery ONLY
deliveryEl.textContent = formatPrice(deliveryFee);

// Total
totalEl.textContent = formatPrice(
  subtotal + deliveryFee + takeawayFee
);

  };

  function initFloatingTrackButton() {
  const btn = document.getElementById("floating-track-btn");
  if (!btn) return;

  const lastOrder = localStorage.getItem("kandys_last_order_code");
  if (!lastOrder) return;

  btn.hidden = false;

  btn.addEventListener("click", () => {
    window.location.href = "/track.html";
  });
}
  
initFloatingTrackButton();

  /* ================= SUBMIT ORDER ================= */
  form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("customer-name")?.value.trim();
  const phone = document.getElementById("customer-phone")?.value.trim();
  const email = document.getElementById("customer-email")?.value.trim();
  const notes = document.getElementById("order-notes")?.value.trim() || "";

  if (!name || !phone) {
    showToast("Please fill in name and phone number");
    return;
  }

  const cart = readCart();
  const ids = Object.keys(cart);
  if (!ids.length) {
    showToast("Your cart is empty");
    return;
  }

  placeBtn.disabled = true;

  const orderId = `KD-${Date.now().toString().slice(-6)}`;
  localStorage.setItem("kandys_last_order_code", orderId);

  const items = ids.map(id => cart[id]);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  const cartItems = ids.map(id => cart[id]);
const takeawayFee =
  fulfilment === "delivery" ? calculateTakeawayFee(cartItems) : 0;

  const deliveryFee = DELIVERY_FEE;
  const total = subtotal + deliveryFee;

  await setDoc(doc(db, "orders", orderId), {
  id: orderId,
  customer: { name, phone, email },
  fulfilment,
  items,
  subtotal,
  takeawayFee,
  deliveryFee,
  total: subtotal + deliveryFee + takeawayFee,
  notes,
  status: "New",
  createdAt: serverTimestamp(),
});

  saveCart({});
  showToast("Order placed successfully 🎉");

  // Hide checkout
document.getElementById("checkout-form").hidden = true;

// Show tracking
const trackSection = document.getElementById("inline-track");
trackSection.hidden = false;

// Start live tracking
startInlineTracking(orderId);
});



  clearBtn?.addEventListener("click", () => {
    saveCart({});
    render();
  });

  render();
};

function startInlineTracking(orderId) {
  if (inlineUnsub) inlineUnsub();
  const ref = doc(db, "orders", orderId);

  inlineUnsub = onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;

    const order = snap.data();

    document.getElementById("t-id").textContent = order.id;
    document.getElementById("t-status").textContent = order.status || "New";
    document.getElementById("t-name").textContent = order.customer?.name || "—";
    document.getElementById("t-phone").textContent = order.customer?.phone || "—";
    document.getElementById("t-type").textContent =
      order.fulfilment === "pickup" ? "Pickup" : "Delivery";

    const d = order.createdAt?.toDate
      ? order.createdAt.toDate()
      : new Date();
    document.getElementById("t-time").textContent = d.toLocaleString("en-NG");

    // Items
    const itemsWrap = document.getElementById("t-items");
    itemsWrap.innerHTML = "";
    (order.items || []).forEach(i => {
      const row = document.createElement("div");
      row.className = "track-item-row";
      row.innerHTML = `
        <div><strong>${i.name}</strong><br>${i.qty} × ₦${i.price}</div>
        <div>₦${i.price * i.qty}</div>
      `;
      itemsWrap.appendChild(row);
    });

    document.getElementById("t-subtotal").textContent = formatPrice(order.subtotal);
    document.getElementById("t-delivery").textContent =
      formatPrice((order.deliveryFee || 0) + (order.takeawayFee || 0));
    document.getElementById("t-total").textContent = formatPrice(order.total);

    renderTimeline(order.status || "New");
  });
  trackSection.scrollIntoView({ behavior: "smooth" });
}





// Listen for order status changes to send notifications

onSnapshot(
  query(collection(db, "orders")),
  snap => {
    snap.docChanges().forEach(change => {
      if (change.type !== "modified") return;

      const data = change.doc.data();
      if (data.status === "Out" && data.notificationToken) {
        sendLocalNotification(data);
      }
    });
  }
);

function sendLocalNotification(order) {
  new Notification("Your order is on the way 🚴‍♂️", {
    body: `Order ${order.id} is out for delivery`,
    icon: "/icon.png",
  });
}

// Admin page (UPDATED: Firebase Auth + Firestore real-time)
const initAdminPage = () => {
  const searchInput = document.getElementById("order-search");
const filterWrap = document.getElementById("status-filters");
const soundBtn = document.getElementById("toggle-sound");
const printBtn = document.getElementById("print-receipt");

const statTotal = document.getElementById("stat-total");
const statNew = document.getElementById("stat-new");
const statPreparing = document.getElementById("stat-preparing");
const statCompleted = document.getElementById("stat-completed");
const statRevenue = document.getElementById("stat-revenue");


let activeFilter = "All";
let searchQuery = "";
let soundOn = true;

let lastSeenIds = new Set(); // for "new order" detection

  const loginSection = document.getElementById("admin-login");
  const panel = document.getElementById("admin-panel");
  const loginForm = document.getElementById("admin-login-form");
  const logoutBtn = document.getElementById("admin-logout");
  const tbody = document.getElementById("orders-tbody");
  const detailPanel = document.getElementById("order-detail-panel");
  const emptyDetail = document.getElementById("order-detail-empty");
  const detailContent = document.getElementById("order-detail-content");

  // ⛔ STOP if this is not the admin page
  if (!panel) return;

  if (!loginSection || !panel || !tbody || !detailPanel) return;

  const STATE = { selectedOrderId: null, orders: [] };
  let unsubscribeOrders = null;

const renderTable = () => {
  const ordersToShow = getFilteredOrders();
  tbody.innerHTML = "";

  if (!ordersToShow.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" style="opacity:.7;padding:14px;">No orders match this view.</td>`;
    tbody.appendChild(tr);
    return;
  }

  ordersToShow.forEach((order, index) => {
    const tr = document.createElement("tr");
    const status = order.status || "New";

    tr.innerHTML = `
      <td>${order.id}</td>
      <td>${order.customer?.name || "-"}</td>
      <td>${formatPrice(order.total || 0)}</td>
      <td>${order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</td>
      <td><span class="status-pill status-${toStatusClass(status)}">${status}</span></td>
    `;

    tr.addEventListener("click", () => {
      STATE.selectedOrderId = order.id;
      [...tbody.children].forEach((row) => row.classList.remove("active"));
      tr.classList.add("active");
      renderDetail(order);
    });

    tbody.appendChild(tr);
    setTimeout(() => tr.classList.add("visible"), 30 * index);
  });
};


  const renderDetail = (order) => {
  if (!detailContent || !emptyDetail) return;

  emptyDetail.style.display = "none";
  detailContent.hidden = false;

  let el;

  el = detailContent.querySelector("[data-detail-id]");
  if (el) el.textContent = order.id || "-";

  el = detailContent.querySelector("[data-detail-name]");
  if (el) el.textContent = order.customer?.name || "-";

  el = detailContent.querySelector("[data-detail-phone]");
  if (el) el.textContent = order.customer?.phone || "-";

  el = detailContent.querySelector("[data-detail-type]");
  if (el) {
    el.textContent =
      order.fulfilment === "delivery" ? "Delivery" : "Pickup";
  }

  el = detailContent.querySelector("[data-detail-total]");
  if (el) el.textContent = formatPrice(order.total || 0);

  el = detailContent.querySelector("[data-detail-notes]");
  if (el) el.textContent = order.notes || "None";

  const itemsList = detailContent.querySelector("[data-detail-items]");
  if (itemsList) {
    itemsList.innerHTML = "";
    (order.items || []).forEach((i) => {
      const li = document.createElement("li");
      li.textContent = `${i.qty} × ${i.name}`;
      itemsList.appendChild(li);
    });
  }

  detailPanel
    ?.querySelectorAll(".chip-status")
    .forEach((btn) => {
      btn.classList.toggle(
        "chip-glow",
        btn.dataset.status === order.status
      );
    });
};
function buildWhatsAppMessage(order, status) {
  return `
Hello ${order.customer.name},

Your order (${order.id}) is now *${status}*.

Items:
${order.items.map(i => `• ${i.qty} × ${i.name}`).join("\n")}

Thank you for ordering from Kandys Treats ❤️
`.trim();
}

function sendWhatsApp(order, status) {
  const phone = normalizePhone(order.customer?.phone);
  if (!phone) {
    showToast("Customer phone number missing");
    return;
  }

  const message = buildWhatsAppMessage(order, status);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  window.open(url, "_blank");
}


 const bindStatusButtons = () => {
  detailPanel.querySelectorAll(".chip-status").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = STATE.selectedOrderId;
      if (!id) return;

      const newStatus = btn.dataset.status;
      const order = STATE.orders.find(o => o.id === id);
      if (!order) return;

      // Prevent duplicate action
      if (order.status === newStatus) {
        showToast(`Order already marked as ${newStatus}`);
        return;
      }

      try {
        // 1️⃣ Update Firestore (ONCE)
        await updateDoc(doc(db, "orders", id), {
          status: newStatus,
        });

        // 2️⃣ Try EmailJS (best effort)
        if (order.customer?.email && window.emailjs) {
          emailjs.send(
            "service_b42kpvg",
            "template_wgethvr",
            {
              customer_name: order.customer.name,
              order_id: order.id,
              status: newStatus,
              customer_email: order.customer.email,
            }
          ).catch(err => {
            console.warn("EmailJS failed (ignored):", err);
          });
        }

        // 3️⃣ WhatsApp = always works
        sendWhatsApp(order, newStatus);

        showToast(`Order ${id} marked as ${newStatus}`);
      } catch (err) {
        console.error(err);
        showToast("Failed to update order status");
      }
    });
  });
};


const startOrdersListener = () => {
  const qy = query(collection(db, "orders"), orderBy("createdAt", "desc"));

  unsubscribeOrders = onSnapshot(
    qy,
    (snap) => {
      const incoming = snap.docs.map((d) => d.data());
      STATE.orders = incoming;

      computeStats();

      // detect new order
      const newIds = new Set(incoming.map(o => o.id));
      let hasNew = false;
      for (const id of newIds) {
        if (!lastSeenIds.has(id)) {
          // ignore first load
          if (lastSeenIds.size > 0) hasNew = true;
        }
      }
      lastSeenIds = newIds;
      if (hasNew) {
        playNewOrderSound();
        showToast("New order received!");
      }

      renderTable();

      if (STATE.selectedOrderId) {
        const current = STATE.orders.find((o) => o.id === STATE.selectedOrderId);
        if (current) renderDetail(current);
      }
    },
    (err) => {
      console.error("Orders listener error:", err);
      showToast(err.message || "Orders listener failed");
    }
  );
  searchInput?.addEventListener("input", (e) => {
  searchQuery = e.target.value.trim();
  renderTable();
});

filterWrap?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;

  activeFilter = btn.dataset.filter;
  [...filterWrap.querySelectorAll(".chip-filter")].forEach(b =>
    b.classList.toggle("is-active", b === btn)
  );

  renderTable();
});

soundBtn?.addEventListener("click", () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? "Sound: On" : "Sound: Off";
  showToast(soundOn ? "Sound enabled" : "Sound muted");
});

printBtn?.addEventListener("click", () => {
  window.print();
});


  };



  const stopOrdersListener = () => {
    if (unsubscribeOrders) unsubscribeOrders();
    unsubscribeOrders = null;
  };

  // Login
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-email")?.value?.trim();
    const password = document.getElementById("admin-password")?.value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast("Signed in");
    } catch (err) {
      showToast(err.message || "Login failed");
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async () => {
    await signOut(auth);
  });

  // Auth state + admin role gate
  onAuthStateChanged(auth, async (user) => {
  stopOrdersListener();

  if (!user) {
    panel.hidden = true;
    loginSection.hidden = false;
    return;
  }

  const adminSnap = await getDoc(doc(db, "admins", user.uid));
  if (!adminSnap.exists()) {
    showToast("Not authorized as admin");
    await signOut(auth);
    return;
  }

  // ✅ AUTH CONFIRMED
  loginSection.hidden = true;
  panel.hidden = false;

  bindStatusButtons();
  startOrdersListener();

  // 🔥 START FOOD MANAGEMENT ONLY NOW
  if (window.initFoodManagement) {
    window.initFoodManagement();
  }
});


  const toStatusClass = (s) =>
  String(s || "New").toLowerCase().replace(/\s+/g, "-");

const isToday = (ts) => {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const computeStats = () => {
  const orders = STATE.orders;

  const total = orders.length;
  const countNew = orders.filter(o => (o.status || "New") === "New").length;
  const countPrep = orders.filter(o => (o.status || "New") === "Preparing").length;
  const countComp = orders.filter(o => (o.status || "New") === "Completed").length;

  const revenueToday = orders
    .filter(o => isToday(o.createdAt))
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  if (statTotal) statTotal.textContent = total;
  if (statNew) statNew.textContent = countNew;
  if (statPreparing) statPreparing.textContent = countPrep;
  if (statCompleted) statCompleted.textContent = countComp;
  if (statRevenue) statRevenue.textContent = formatPrice(revenueToday);

};

const getFilteredOrders = () => {
  let list = [...STATE.orders];

  if (activeFilter !== "All") {
    list = list.filter(o => (o.status || "New") === activeFilter);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(o => {
      const id = String(o.id || "").toLowerCase();
      const name = String(o.customer?.name || "").toLowerCase();
      const phone = String(o.customer?.phone || "").toLowerCase();
      return id.includes(q) || name.includes(q) || phone.includes(q);
    });
  }

  return list;
};

const playNewOrderSound = () => {
  if (!soundOn) return;
  // tiny beep (no file needed)
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 140);
  } catch {}
};

};
// Track page (read order by code)
// Track page (READ ONLY — no reload)
const initTrackPage = () => {
  const form = document.getElementById("track-form");
  const input = document.getElementById("track-code");
  const btn = document.getElementById("track-btn");
  const loading = document.getElementById("track-loading");
  const errBox = document.getElementById("track-error");
  const result = document.getElementById("track-result");

  const tId = document.getElementById("t-id");
  const tStatus = document.getElementById("t-status");
  const tName = document.getElementById("t-name");
  const tPhone = document.getElementById("t-phone");
  const tType = document.getElementById("t-type");
  const tTime = document.getElementById("t-time");
  const tItems = document.getElementById("t-items");
  const tSubtotal = document.getElementById("t-subtotal");
  const tDelivery = document.getElementById("t-delivery");
  const tTotal = document.getElementById("t-total");
  const stepsWrap = document.getElementById("track-steps");

  if (!form || !input) return;

  const ORDER_STATUSES = ["New", "Preparing", "Out", "Completed"];
  let unsubscribe = null;

  const normalizeCode = (v) => String(v || "").trim().toUpperCase();

  const setState = ({ isLoading = false, error = "", showResult = false } = {}) => {
    if (loading) loading.hidden = !isLoading;
    if (btn) btn.disabled = isLoading;
    if (errBox) {
      errBox.hidden = !error;
      errBox.textContent = error;
    }
    if (result) result.hidden = !showResult;
  };


  const applyTimelineStatus = (status) => {
  const steps = document.querySelectorAll(".timeline-item");

  steps.forEach(step => {
    step.classList.remove("is-active");
    if (step.dataset.status === status) {
      step.classList.add("is-active");
    }
  });
};


  const renderOrder = (order) => {
  tId.textContent = order.id;
  tStatus.textContent = order.status || "New";
  tName.textContent = order.customer?.name || "—";
  tPhone.textContent = order.customer?.phone || "—";
  tType.textContent = order.fulfilment === "pickup" ? "Pickup" : "Delivery";

  const d = order.createdAt?.toDate
    ? order.createdAt.toDate()
    : new Date(order.createdAt);
  tTime.textContent = d.toLocaleString("en-NG");

  tItems.innerHTML = "";
  (order.items || []).forEach((i) => {
    const row = document.createElement("div");
    row.className = "track-item-row";
    row.innerHTML = `
      <div>
        <strong>${i.name}</strong><br>
        ${i.qty} × ${formatPrice(i.price)}
      </div>
      <div>${formatPrice(i.price * i.qty)}</div>
    `;
    tItems.appendChild(row);
  });

  tSubtotal.textContent = formatPrice(order.subtotal || 0);
  tDelivery.textContent = formatPrice(
  (order.deliveryFee || 0) + (order.takeawayFee || 0)
);

  tTotal.textContent = formatPrice(order.total || 0);

  // ✅ THIS LINE MAKES THE GREEN DOT MOVE
  renderTimeline(order.status || "New");

  applyTimelineStatus(order.status || "New");

};


  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const code = normalizeCode(input.value);
    if (!code) return;

    setState({ isLoading: true, error: "", showResult: false });

    // Stop previous listener
    if (unsubscribe) unsubscribe();

    try {
      const ref = doc(db, "orders", code);

      unsubscribe = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setState({ isLoading: false, error: "Order not found." });
            return;
          }

          renderOrder(snap.data());
          setState({ isLoading: false, showResult: true });
        },
        () => {
          setState({ isLoading: false, error: "Live update failed." });
        }
      );
    } catch (err) {
      console.error(err);
      setState({ isLoading: false, error: "Failed to fetch order." });
    }
  });

  // Auto-track from URL or last order
  const url = new URL(location.href);
  const codeFromUrl = normalizeCode(url.searchParams.get("code"));
  const saved = localStorage.getItem("kandys_last_order_code");

  if (codeFromUrl || saved) {
    input.value = codeFromUrl || saved;
    setTimeout(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    }, 120);
  }

  if (saved && !codeFromUrl) {
    form.hidden = true;
  }
};

function renderTimeline(status) {
  const steps = document.querySelectorAll(".timeline-item");

  steps.forEach(step => {
    step.classList.remove("is-active");

    if (step.dataset.status === status) {
      step.classList.add("is-active");
    }
  });
}



// Reviews slider on home page
const initReviewsSlider = () => {
  const reviews = Array.from(document.querySelectorAll(".review-slide"));
  const prevBtn = document.querySelector("[data-review-prev]");
  const nextBtn = document.querySelector("[data-review-next]");
  if (!reviews.length || !prevBtn || !nextBtn) return;

  let index = 0;
  const setActive = (i) => {
    reviews.forEach((r, idx) => r.classList.toggle("active", idx === i));
    index = i;
  };

  prevBtn.addEventListener("click", () => {
    setActive((index - 1 + reviews.length) % reviews.length);
  });
  nextBtn.addEventListener("click", () => {
    setActive((index + 1) % reviews.length);
  });

  setInterval(() => {
    setActive((index + 1) % reviews.length);
  }, 6000);
};

// Contact form
const initContactForm = () => {
  const form = document.getElementById("contact-form");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    form.reset();
    showToast("Message sent. We’ll get back shortly.");
  });
};



function initQuickPicks() {
  const wrap = document.getElementById("quick-picks");
  if (!wrap) return;

  const q = query(
    collection(db, "quickPicks"),
    where("active", "==", true),
    orderBy("priority", "desc")
  );

  onSnapshot(q, snap => {
    wrap.innerHTML = "";

    if (snap.empty) {
      wrap.innerHTML = `<p class="muted">No quick picks yet.</p>`;
      return;
    }

    snap.forEach(docSnap => {
      const data = docSnap.data();
      wrap.appendChild(renderQuickPickCard(docSnap.id, data));
    });
  });
}

function renderQuickPickCard(id, data) {
  const card = document.createElement("article");
  card.className = "menu-card glass-card interactive-card";

  card.innerHTML = `
    <div class="menu-card-image"
      style="background-image:url('${data.image || getRandomImage()}')">
    </div>

    <div class="menu-card-body">
      <h3>${data.title}</h3>
      <p>${data.description || ""}</p>

      <div class="menu-card-meta">
        <span class="chip">${data.items.length} items</span>
      </div>

      <button class="btn btn-primary quick-add">
        Add to cart
      </button>
    </div>
  `;

  card.querySelector("button").onclick = () => {
    const cart = readCart();

    data.items.forEach(i => {
      cart[i.menuId] = {
        id: i.menuId,
        name: i.name,
        price: i.price,
        qty: (cart[i.menuId]?.qty || 0) + i.qty
      };
    });

    saveCart(cart);
    showToast(`${data.title} added to cart`);
  };

  return card;
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  syncCartBadge();
  const page = document.documentElement.dataset.page;

  if (page === "menu") initMenuPage();
  if (page === "cart") initCartPage();
  if (page === "admin") initAdminPage();
  if (page === "track") initTrackPage();
  if (page === "home") initReviewsSlider();
  if (page === "contact") initContactForm();
  if (page === "home") initQuickPicks();
});

onSnapshot(q, snap => {
  wrap.innerHTML = "";

  const track = document.createElement("div");
  track.className = "quick-picks-track";

  snap.forEach(docSnap => {
    track.appendChild(renderQuickPickCard(docSnap.id, docSnap.data()));
  });

  // duplicate for seamless loop
  snap.forEach(docSnap => {
    track.appendChild(renderQuickPickCard(docSnap.id, docSnap.data()));
  });

  wrap.appendChild(track);
});