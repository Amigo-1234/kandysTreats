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
  where,        // 👈 ADD THIS
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

import { getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}

// Local keys (cart stays localStorage for speed)
const CART_KEY = "kandys_cart";
const ORDERS_KEY = "kandys_orders";
const MENU_CACHE_KEY = "kandys_menu_cache_v1";
const ORDER_STATUSES = ["New", "Preparing", "Out", "Completed"];
const DRAFT_ORDERS_KEY = "kandys_draft_orders";
 // no longer used by admin, but left for now

// Mock menu data
// TODO: Firestore: fetch menu
let MENU_ITEMS = []; // will be filled from Firestore
//  // for inline tracking unsubscribe

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

const showLoader = () => {
  const loader = document.getElementById("app-loader");
  if (loader) loader.classList.remove("is-hidden");
};

const hideLoader = () => {
  const loader = document.getElementById("app-loader");
  if (!loader) return;

  // small delay = smoother UX
  setTimeout(() => {
    loader.classList.add("is-hidden");
  }, 300);
};

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

const PAYSTACK_FEE_RATE = 0.02;

function calculatePaystackFee(amount) {
  return Math.round(Number(amount) * PAYSTACK_FEE_RATE);
}

const syncCartBadge = (cart = readCart()) => {
  const totalQty = Object.values(cart).reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll(".js-cart-count").forEach((el) => {
    el.textContent = totalQty;
    el.style.opacity = totalQty > 0 ? "1" : "0";
  });
};

const syncReviewBadge = () => {
  const drafts = readDraftOrders();
  const badge = document.getElementById("review-count");
  if (!badge) return;

  const count = drafts.length;
  badge.textContent = count;

  badge.classList.toggle("is-visible", count > 0);
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

  let p = phone.replace(/\D/g, "");

  // Nigerian local number → add country code
  if (p.startsWith("0")) {
    p = "234" + p.slice(1);
  }

  // Already Nigerian international
  if (p.startsWith("234")) {
    return p;
  }

  // Fallback (already international)
  return p;
}

function formatOrderDate(ts) {
  if (!ts) return "—";

  const date = ts.toDate(); // Firestore Timestamp → JS Date

  return date.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ===============================
// ANNOUNCEMENT BAR + MARQUEE
// ===============================

// ---- KEYS ----
const ANNOUNCEMENT_CACHE_KEY = "kandys_announcements_v1";
const TICKER_KEY = "kandys_announcement_offset";

// ---- DOM ----
const bar = document.getElementById("announcement-bar");
const items = document.querySelectorAll(".announcement-content");
const track = document.querySelector(".announcement-track");

// ==================================================
// 1️⃣ INSTANT RENDER (CACHE-FIRST, 0ms)
// ==================================================
if (bar && items.length) {
  const cached = localStorage.getItem(ANNOUNCEMENT_CACHE_KEY);

  if (cached) {
    items.forEach(el => {
      el.textContent = cached;
    });
  }

  // Always show immediately — never wait for Firebase
  bar.hidden = false;
  document.body.classList.add("has-announcement");
}

// ==================================================
// 2️⃣ FIREBASE (BACKGROUND SYNC ONLY)
// ==================================================
if (bar && items.length) {
  const q = query(
    collection(db, "announcements"),
    where("active", "==", true),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, (snap) => {
    if (snap.empty) return;

    const messages = snap.docs
      .map(d => d.data().text)
      .filter(Boolean);

    if (!messages.length) return;

    const base = messages.join("  |  ");
    const finalText = `${base}   |   ${base}`;

    // Cache for instant load on next page
    localStorage.setItem(ANNOUNCEMENT_CACHE_KEY, finalText);

    // Update UI silently
    items.forEach(el => {
      el.textContent = finalText;
    });
  });
}

// ==================================================
// 3️⃣ JS-DRIVEN MARQUEE (NO RESET EVER)
// ==================================================
let tickerOffset = Number(sessionStorage.getItem(TICKER_KEY)) || 0;
let rafId = null;

function startTicker(track) {
  const speed = window.innerWidth > 768 ? 0.4 : 0.32; // 👈 slower = calmer

  function step() {
    tickerOffset -= speed;

    // Seamless loop
    if (Math.abs(tickerOffset) >= track.scrollWidth / 2) {
      tickerOffset = 0;
    }

    track.style.transform = `translateX(${tickerOffset}px)`;
    rafId = requestAnimationFrame(step);
  }

  step();
}

function stopTicker() {
  if (rafId) cancelAnimationFrame(rafId);
  sessionStorage.setItem(TICKER_KEY, tickerOffset);
}

if (track) {
  startTicker(track);
  window.addEventListener("pagehide", stopTicker);
}

// Menu rendering
const initMenuPage = () => {

  showLoader();

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
  collection(window.db, "menus"),
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

  hideLoader();
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

  // ===============================
// DELIVERY / PICKUP TOGGLE LOGIC
// ===============================

const addressInput = document.getElementById("customer-address");

fulfilmentButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    // Toggle active button
    fulfilmentButtons.forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const mode = btn.dataset.fulfilment;

    if (mode === "pickup") {
      addressField.style.display = "none";
      addressInput.removeAttribute("required"); // 🔑 IMPORTANT
      addressInput.value = "";                  // clean state
    } else {
      addressField.style.display = "block";
      addressInput.setAttribute("required", "required");
    }

    render();
  });
});

  const placeBtn = document.getElementById("pay-now-btn");
  const payNowBtn = document.getElementById("pay-now-btn");


  const reviewBtn = document.getElementById("view-orders-btn");

reviewBtn?.addEventListener("click", () => {
  const drafts = readDraftOrders();

  if (!drafts.length) {
    showToast("No saved orders yet");
    return;
  }

  window.location.href = "orders-preview.html";
});
  

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
      name.includes("eba") ||
      name.includes("spaghetti") ||
      name.includes("pepper soup") ||
      name.includes("pounded yam") ||
      name.includes("ewa agoyin")
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
const takeawayFee = calculateTakeawayFee(cartItems);



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

  form.addEventListener("submit", (e) => {
  e.preventDefault();

  const cart = readCart();
  const ids = Object.keys(cart);

  if (!ids.length) {
    showToast("Your cart is empty");
    return;
  }

  const name = document.getElementById("customer-name").value.trim();
  const phone = document.getElementById("customer-phone").value.trim();
  const email = document.getElementById("customer-email").value.trim();
  const address = document.getElementById("customer-address")?.value.trim() || "";

  if (!name || !phone) {
    showToast("Please fill in name and phone");
    return;
  }

  const items = ids.map(id => cart[id]);
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  const fulfilment =
    document.querySelector(".toggle-option.is-active")?.dataset.fulfilment ||
    "delivery";

  const cartItems = items;
const takeawayFee = calculateTakeawayFee(cartItems);

  const deliveryFee =
  fulfilment === "delivery" && ids.length ? DELIVERY_FEE : 0;

  const draftOrder = {
  id: `draft-${Date.now()}`,
  customer: {
    name,
    phone,
    email,
    address: fulfilment === "delivery" ? address : ""
  },
  items,
  fulfilment,
  subtotal,
  takeawayFee,
  deliveryFee,
  total: subtotal + takeawayFee + deliveryFee,
  createdAt: Date.now()
};

  const drafts = readDraftOrders();
  drafts.push(draftOrder);
  saveDraftOrders(drafts);

  // ✅ clear cart ONLY AFTER draft is saved
  saveCart({});
  render();

  showToast("Order saved. You can add another order.");
  syncReviewBadge();
});




  clearBtn?.addEventListener("click", () => {
    saveCart({});
    render();
  });

  render();
};




const readDraftOrders = () => {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_ORDERS_KEY)) || [];
  } catch {
    return [];
  }
};

const saveDraftOrders = (orders) => {
  localStorage.setItem(DRAFT_ORDERS_KEY, JSON.stringify(orders));
};


// =====================
// PREVIEW PAGE (DRAFT ORDERS)
// =====================

const initPreviewPage = () => {
  const wrap = document.getElementById("draft-orders");
  const empty = document.getElementById("no-drafts");
  const totalEl = document.getElementById("preview-total");
  const payBtn = document.getElementById("proceed-payment");

  if (!wrap || !totalEl || !payBtn) return;

  const drafts = readDraftOrders();

  if (!drafts.length) {
    empty.hidden = false;
    payBtn.disabled = true;
    return;
  }

  empty.hidden = true;
  wrap.innerHTML = "";

  let grandTotal = 0;

  drafts.forEach((order, index) => {
    grandTotal += order.total;

    const card = document.createElement("div");
    card.className = "draft-order";

    card.innerHTML = `
      <h3>Order ${index + 1}</h3>
      <p><strong>${order.customer.name}</strong> — ${order.customer.phone}</p>

      <ul>
        ${order.items.map(i =>
          `<li>${i.qty} × ${i.name}</li>`
        ).join("")}
      </ul>

      <strong>${formatPrice(order.total)}</strong>

      <button class="remove-draft" data-id="${order.id}">
        Remove
      </button>
    `;

    wrap.appendChild(card);
  });

  totalEl.textContent = formatPrice(grandTotal);

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove-draft");
    if (!btn) return;

    const id = btn.dataset.id;
    const next = drafts.filter(d => d.id !== id);
    saveDraftOrders(next);
    location.reload();
  });

  payBtn.onclick = async () => {
  const drafts = readDraftOrders();
  if (!drafts.length) return;

  const orderId = `KD-${Date.now()}`;

  const baseSubtotal = drafts.reduce((s, o) => s + o.subtotal, 0);
const baseTakeaway = drafts.reduce((s, o) => s + o.takeawayFee, 0);
const baseDelivery = drafts.reduce((s, o) => s + o.deliveryFee, 0);

const baseTotal = baseSubtotal + baseTakeaway + baseDelivery;

const vat = calculatePaystackFee(baseTotal); // 2%
const totalToPay = baseTotal + vat;           // CUSTOMER PAYS THIS
const order = {
  id: orderId,

  subOrders: drafts.map((d, index) => ({
    index: index + 1,
    items: d.items,
    takeawayFee: d.takeawayFee,
    deliveryFee: d.deliveryFee
  })),

  customer: drafts[0].customer,
  fulfilment: drafts[0].fulfilment,

  // ✅ SAFE ENOUGH FOR NOW
  subtotal: baseTotal,
  vat: vat,
  total: totalToPay,
  netAmount: baseTotal,

  paymentRef: null,
  paid: false,
  status: "New",

  createdAt: serverTimestamp()
};

  await setDoc(doc(window.db, "orders", orderId), order);

  // 🚨 DO NOT CLEAR DRAFTS YET
  window.location.href = `/pay.html?order=${orderId}`;
};
};




// Listen for order status changes to send notifications

function sendLocalNotification(order) {
  new Notification("Your order is on the way 🚴‍♂️", {
    body: `Order ${order.id} is out for delivery`,
    icon: "/icon.png",
  });
}

let orderAudio;

function playNewOrderSound(soundOn) {
  if (!soundOn) return;

  try {
    if (!orderAudio) {
      orderAudio = new Audio("/sounds/order-alert.mp3");
      orderAudio.volume = 0.9;
    }

    orderAudio.currentTime = 0;
    orderAudio.play().catch(() => {});
  } catch (e) {
    console.warn("Order sound failed", e);
  }
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
  let authReady = false;
  const loginSection = document.getElementById("admin-login");
  const panel = document.getElementById("admin-panel");
  const loginForm = document.getElementById("admin-login-form");
  const logoutBtn = document.getElementById("admin-logout");
  const tbody = document.getElementById("orders-tbody");
  const detailPanel = document.getElementById("order-detail-panel");
  const emptyDetail = document.getElementById("order-detail-empty");
  const detailContent = document.getElementById("order-detail-content");

  // 🔒 LOCK UI until auth resolves (NOW SAFE)
loginSection.hidden = true;
panel.hidden = true;

  document.addEventListener(
  "click",
  () => {
    if (orderAudio) {
      orderAudio.play().then(() => {
        orderAudio.pause();
        orderAudio.currentTime = 0;
      }).catch(() => {});
    }
  },
  { once: true }
);

  // ⛔ STOP if this is not the admin page
  if (!panel) return;

  if (!loginSection || !panel || !tbody || !detailPanel) return;

  const STATE = { selectedOrderId: null, orders: [] };
  let unsubscribeOrders = null;
  let isUpdatingStatus = false;

const renderTable = () => {
  const ordersToShow = getFilteredOrders();
  tbody.innerHTML = "";

  if (!ordersToShow.length) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td colspan="5" style="opacity:.7;padding:14px;">
      No orders match this view.
    </td>
  `;
  tbody.appendChild(tr);
  return;
}

  ordersToShow.forEach((order, index) => {
    const tr = document.createElement("tr");
tr.dataset.id = order.id; // ✅ ADD THIS
    const status = order.status || "New";

    tr.innerHTML = `
  <td>${order.id}</td>

  <!-- DATE -->
  <td class="muted">
    ${formatOrderDate(order.createdAt)}
  </td>

  <!-- CUSTOMER -->
  <td>${order.customer?.name || "-"}</td>

  <!-- TOTAL -->
  <td>
    ${formatPrice(order.total || 0)}
    <small class="muted">VAT: ${formatPrice(order.vat || 0)}</small>
  </td>

  <!-- TYPE -->
  <td>${order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</td>

  <!-- STATUS -->
  <td>
    <span class="status-pill status-${toStatusClass(status)}">
      ${status}
    </span>
  </td>
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

  // 🔁 restore selected row after re-render
if (STATE.selectedOrderId) {
  const row = tbody.querySelector(
    `tr[data-id="${STATE.selectedOrderId}"]`
  );

  if (row) {
    row.classList.add("active");

    const order = STATE.orders.find(
      o => o.id === STATE.selectedOrderId
    );

    if (order) {
      renderDetail(order);
    }
  }
}

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

  el = detailContent.querySelector("[data-detail-address]");
if (el) {
  el.textContent =
    order.fulfilment === "delivery"
      ? (order.customer?.address || "—")
      : "Pickup (no address)";
}

  el = detailContent.querySelector("[data-detail-type]");
  if (el) {
    el.textContent =
      order.fulfilment === "delivery" ? "Delivery" : "Pickup";
  }

  el = detailContent.querySelector("[data-detail-total]");
  if (el) el.textContent = formatPrice(order.total || 0);

  el = detailContent.querySelector("[data-detail-notes]");
  if (el) el.textContent = order.notes || "None";

  el = detailContent.querySelector("[data-detail-time]");
if (el && order.createdAt) {
  const d = order.createdAt.toDate
    ? order.createdAt.toDate()
    : new Date(order.createdAt);
  el.textContent = d.toLocaleString("en-NG");
}

const itemsWrap = detailContent.querySelector("[data-detail-items]");

const vatEl = detailContent.querySelector("#detail-vat");
const netEl = detailContent.querySelector("#detail-net");

if (vatEl) {
  vatEl.textContent = formatPrice(order.paystackFee || 0);
}

if (netEl) {
  netEl.textContent = formatPrice(
    order.netAmount || (order.total - (order.paystackFee || 0))
  );
}
// -------- ITEMS --------
itemsWrap.innerHTML = "";

if (order.subOrders && order.subOrders.length) {
  order.subOrders.forEach((sub, i) => {
    const section = document.createElement("div");
    section.className = "admin-suborder";

    section.innerHTML = `
      <div class="suborder-title">Order ${i + 1}</div>
      <ul class="suborder-list">
  ${sub.items.map(item =>
    `
    <li class="order-item">
      <span class="qty">${item.qty}×</span>
      <span class="name">${item.name}</span>
    </li>
    `
  ).join("")}
</ul>
    `;

    itemsWrap.appendChild(section);
  });
}
else if (order.items && order.items.length) {
  const ul = document.createElement("ul");
  order.items.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.qty} × ${item.name}`;
    ul.appendChild(li);
  });
  itemsWrap.appendChild(ul);
}
else {
  itemsWrap.textContent = "No items found";
}

// -------- STATUS UI (MUST ALWAYS RUN) --------
detailPanel.querySelectorAll(".chip-status").forEach((btn) => {
  const isActive = btn.dataset.status === order.status;
  btn.classList.toggle("is-current", isActive);
});

const statusText = detailContent.querySelector("#current-status-text");
if (statusText) {
  statusText.textContent = order.status;
}

};

detailPanel.addEventListener("click", async (e) => {
  const btn = e.target.closest(".chip-status");
  if (!btn) return;

  // ✅ OPEN TAB IMMEDIATELY (USER CLICK = NOT BLOCKED)
  const waTab = window.open("", "_blank");

  const id = STATE.selectedOrderId;
  if (!id || isUpdatingStatus) {
    waTab?.close();
    return;
  }

  const newStatus = btn.dataset.status;
  const order = STATE.orders.find(o => o.id === id);
  if (!order) {
    waTab?.close();
    return;
  }

  if (order.status === newStatus) {
    waTab?.close();
    showToast(`Order already ${newStatus}`);
    return;
  }

  isUpdatingStatus = true;

  try {
    // 🔄 Update Firestore
    await updateDoc(doc(window.db, "orders", id), {
      status: newStatus,
      lastStatusUpdateAt: serverTimestamp()
    });

    // 📧 Optional email
    if (order.customer?.email && window.emailjs) {
      await emailjs.send(
        "service_b42kpvg",
        "template_wgethvr",
        {
          customer_name: order.customer.name,
          order_id: order.id,
          status: newStatus,
          customer_email: order.customer.email,
        }
      ).catch(() => {});
    }

    // 📲 WhatsApp (NEW TAB – SAFE)
    const phone = normalizePhone(order.customer.phone);
    const msg = buildWhatsAppMessage(order, newStatus);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    waTab.location.href = url;

    showToast(`Order ${id} marked as ${newStatus}`);
  } catch (err) {
    console.error(err);
    waTab?.close();
    showToast("Failed to update order");
  } finally {
    setTimeout(() => {
      isUpdatingStatus = false;
    }, 500);
  }
});

function buildWhatsAppMessage(order, status) {
  const allItems = order.subOrders
    ? order.subOrders.flatMap(sub => sub.items)
    : [];

  return `
Hello ${order.customer.name},

Your order (${order.id}) is now *${status}*.

Items:
${allItems.length
  ? allItems.map(i => `• ${i.qty} × ${i.name}`).join("\n")
  : "No items"}

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

  // ✅ NOT blocked by popup blockers
  window.location.href = url;
}





const startOrdersListener = () => {
  const qy = query(
  collection(window.db, "orders"),
  where("paid", "==", true),
  orderBy("createdAt", "desc")
);
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
        playNewOrderSound(soundOn);
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
      await signInWithEmailAndPassword(window.auth, email, password);
      showToast("Signed in");
    } catch (err) {
      showToast(err.message || "Login failed");
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async () => {
    await signOut(window.auth);
  });

  // Auth state + admin role gate
onAuthStateChanged(window.auth, async (user) => {
  // 🔐 Auth resolved — now we decide UI
  if (!user) {
    loginSection.hidden = false;
    panel.hidden = true;
    return;
  }

  try {
    const ref = doc(window.db, "users", user.uid);
const snap = await getDoc(ref);

if (!snap.exists()) {
  showToast("No role assigned");
  await signOut(window.auth);
  return;
}

const { role } = snap.data();

if (role !== "staff" && role !== "superAdmin") {
  showToast("Access denied");
  await signOut(window.auth);
  return;
}

    // ✅ AUTH + ROLE CONFIRMED
    loginSection.hidden = true;
    panel.hidden = false;

    startOrdersListener();
  } catch (err) {
    console.error("Admin auth error:", err);
    showToast("Permission check failed");
    await signOut(window.auth);
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
  .reduce((sum, o) => sum + Number(o.netAmount || 0), 0);

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

  let unsubscribe = null;

  form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const code = input.value.trim().toUpperCase();
  if (!code) return;

  try {
    // stop previous listener if any
if (unsubscribe) unsubscribe();

setState({ isLoading: true });

unsubscribe = onSnapshot(
  doc(window.db, "orders", code),
  (snap) => {
    setState({ isLoading: false });

    if (!snap.exists()) {
      setState({ error: "Order not found" });
      return;
    }

    setState({ showResult: true });
    renderOrder(snap.data());
  },
  () => {
    setState({ error: "Failed to listen to order" });
  }
);
  } catch (err) {
    errBox.hidden = false;
    errBox.textContent = "Failed to load order";
  }
});

  const ORDER_STATUSES = ["New", "Preparing", "Out", "Completed"];


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

  // -------- ITEMS --------
  tItems.innerHTML = "";

  if (order.subOrders && order.subOrders.length) {
    order.subOrders.forEach((sub, i) => {
      const section = document.createElement("div");
      section.className = "track-suborder";

      section.innerHTML = `
        <div class="suborder-title">Order ${i + 1}</div>
        <ul class="suborder-list">
  ${sub.items.map(item => `
    <li class="order-item">
      <span class="qty">${item.qty}×</span>
      <span class="name">${item.name}</span>
    </li>
  `).join("")}
</ul>
      `;

      tItems.appendChild(section);
    });
  } else if (order.items && order.items.length) {
    const ul = document.createElement("ul");
    order.items.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.qty} × ${item.name}`;
      ul.appendChild(li);
    });
    tItems.appendChild(ul);
  } else {
    tItems.innerHTML = "<p>No items found</p>";
  }

  // -------- TOTALS --------
// -------- TOTALS (DISPLAY ONLY) --------

// Subtotal
tSubtotal.textContent = formatPrice(order.subtotal || 0);

// Dispatch & Takeaway rows
const dispatchRow = document.getElementById("dispatch-row");
const takeawayRow = document.getElementById("takeaway-row");

const dispatchEl = document.getElementById("t-dispatch");
const takeawayEl = document.getElementById("t-takeaway");

// Reset rows
dispatchRow.hidden = true;
takeawayRow.hidden = true;

// Dispatch fee (₦500)
if (order.deliveryFee && order.deliveryFee > 0) {
  dispatchRow.hidden = false;
  dispatchEl.textContent = formatPrice(order.deliveryFee);
}

// Takeaway pack (₦200 / ₦300)
if (order.takeawayFee && order.takeawayFee > 0) {
  takeawayRow.hidden = false;
  takeawayEl.textContent = formatPrice(order.takeawayFee);
}

// ===== VAT =====
const existingVat = document.querySelector(".track-vat");
if (existingVat) existingVat.remove();

if (order.vat && order.vat > 0) {
  const vatRow = document.createElement("div");
  vatRow.className = "row track-vat";
  vatRow.innerHTML = `
    <span>V.A.T (2%)</span>
    <span>${formatPrice(order.vat)}</span>
  `;

  // Insert VAT just before total
  tTotal.closest(".row").before(vatRow);
}

// Final Total (already includes everything)
tTotal.textContent = formatPrice(order.total || 0);

  // -------- TIMELINE --------
  renderTimeline(order.status || "New");
  applyTimelineStatus(order.status || "New");

    const waBtn = document.getElementById("wa-support");
if (waBtn) {
  const msg = `Hello, I need help with my order ${order.id}`;
  waBtn.href = `https://wa.me/+2348134641796?text=${encodeURIComponent(msg)}`;
}
};


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


function startQuickPicksAutoScroll(row) {
  if (!row) return;

  // Respect accessibility
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  

  // Desktop grid → no auto scroll
  if (window.innerWidth >= 900 || /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)) {
  return;
}

  // No overflow → no scroll
  if (row.scrollWidth <= row.clientWidth) return;

  let rafId;
  let paused = false;
  const speed = 0.35;

  function step() {
    if (!paused) {
      row.scrollLeft += speed;

      if (row.scrollLeft >= row.scrollWidth - row.clientWidth - 1) {
        row.scrollLeft = 0;
      }
    }
    rafId = requestAnimationFrame(step);
  }

  const pause = () => {
    paused = true;
    row.classList.remove("is-auto-scrolling");
  };

  const resume = () => {
    paused = false;
    row.classList.add("is-auto-scrolling");
  };

  ["mouseenter", "touchstart", "wheel", "mousedown"].forEach(evt =>
    row.addEventListener(evt, pause, { passive: true })
  );

  ["mouseleave", "touchend"].forEach(evt =>
    row.addEventListener(evt, resume)
  );

  row.classList.add("is-auto-scrolling");
  step();
}


async function initQuickPicks() {
  showLoader();
  const wrap = document.getElementById("quick-picks");
  if (!wrap) return;

  // Skeletons first (instant feedback)
  wrap.innerHTML = `
    <article class="menu-card skeleton-card"></article>
    <article class="menu-card skeleton-card"></article>
  `;

  const q = query(
    collection(window.db, "quickPicks"),
    where("active", "==", true),
    orderBy("priority", "desc")
  );

  try {
    const snap = await getDocs(q);

    wrap.innerHTML = "";

    if (snap.empty) {
      wrap.innerHTML = `<p class="muted">No quick picks yet.</p>`;
      return;
    }

    snap.forEach(docSnap => {
      wrap.appendChild(renderQuickPickCard(docSnap.id, docSnap.data()));
    });

    // 🚀 Start auto scroll AFTER cards exist
    requestAnimationFrame(() => {
      startQuickPicksAutoScroll(wrap);
    });

  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<p class="muted">Failed to load quick picks</p>`;
  }
  hideLoader();
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
  syncReviewBadge();
  const page = document.documentElement.dataset.page;

  if (page === "menu") initMenuPage();
  if (page === "cart") initCartPage();
  if (page === "admin") initAdminPage();
  if (page === "track") initTrackPage();
  if (page === "contact") initContactForm();
  if (page === "home") initQuickPicks();
  if (page === "preview") initPreviewPage();
});


// ===============================
// PWA INSTALL POPUP (CALM VERSION)
// ===============================

let deferredPrompt = null;

// Capture install event but DO NOT show anything yet
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

// Show popup (only when we decide to)
function showInstallPopup() {
  if (!deferredPrompt) return;

  // Prevent duplicate popup
  if (document.querySelector(".install-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "install-overlay";

  overlay.innerHTML = `
    <div class="install-popup glass-card">
      <h3>Install Kandys Treats</h3>
      <p>
        Get faster access, offline support, and a smoother ordering experience.
      </p>
      <div class="popup-actions">
        <button class="btn btn-outline" id="install-later">
          Not now
        </button>
        <button class="btn btn-primary" id="install-now">
          Install
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Close popup
  document.getElementById("install-later").onclick = () => {
    overlay.remove();
  };

  // Trigger install
  document.getElementById("install-now").onclick = async () => {
    overlay.remove();
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  };
}

// Decide WHEN to show it
document.addEventListener("DOMContentLoaded", () => {
  const page = document.documentElement.dataset.page;

  // Only show on non-sensitive pages
  const allowedPages = ["home", "menu"];

  if (!allowedPages.includes(page)) return;
  if (localStorage.getItem("install_popup_seen")) return;

  setTimeout(() => {
    showInstallPopup();
    localStorage.setItem("install_popup_seen", "1");
  }, 12000); // calm delay
});

function initHeroSlider() {
  const slides = document.querySelectorAll(".hero-slide");
  if (!slides.length) return;

  let index = 0;

  setInterval(() => {
    slides[index].classList.remove("is-active");
    index = (index + 1) % slides.length;
    slides[index].classList.add("is-active");
  }, 5000); // calm 5s rotation
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.documentElement.dataset.page;
  if (page === "home") initHeroSlider();
});

document.addEventListener("DOMContentLoaded", () => {
  const reviews = document.querySelectorAll('.review');
  const nextBtn = document.querySelector('[data-review-next]');
  const prevBtn = document.querySelector('[data-review-prev]');

  if (!reviews.length) return;

  let currentReview = 0;

  function showReview(index) {
    reviews.forEach((r, i) => {
      r.classList.toggle('active', i === index);
    });
  }

  nextBtn?.addEventListener('click', () => {
    currentReview = (currentReview + 1) % reviews.length;
    showReview(currentReview);
  });

  prevBtn?.addEventListener('click', () => {
    currentReview = (currentReview - 1 + reviews.length) % reviews.length;
    showReview(currentReview);
  });

  setInterval(() => {
    currentReview = (currentReview + 1) % reviews.length;
    showReview(currentReview);
  }, 6000);
});

(function setActiveBottomNav() {
  const page = document.documentElement.dataset.page;
  if (!page) return;

  document
    .querySelectorAll(".bottom-nav-item")
    .forEach((item) => {
      item.classList.toggle(
        "is-active",
        item.dataset.page === page
      );
    });
})();

(() => {
  const el = document.getElementById("today-hours");
  if (!el) return;

  const day = new Date().getDay(); // 0 = Sunday

  const hoursByDay = {
    0: "3:00 PM – 10:30 PM",  // Sunday
    1: "9:00 AM – 10:30 PM",  // Monday
    2: "9:00 AM – 10:30 PM",
    3: "9:00 AM – 10:30 PM",
    4: "9:00 AM – 10:30 PM",
    5: "9:00 AM – 10:30 PM",
    6: "9:00 AM – 10:30 PM"   // Saturday
  };

  el.textContent = hoursByDay[day] || "Closed";
})();