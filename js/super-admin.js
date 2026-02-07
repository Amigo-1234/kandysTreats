// super-admin.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  getDoc,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

/* ================= FIREBASE INIT ================= */

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

/* ================= ELEMENTS ================= */

const loginForm = document.getElementById("owner-login-form");
const loginSection = document.getElementById("owner-login");
const panel = document.getElementById("super-admin-panel");
const logoutBtn = document.getElementById("owner-logout");

const totalRevenueEl = document.getElementById("stat-total-revenue");
const todayRevenueEl = document.getElementById("stat-today-revenue");
const ordersCountEl = document.getElementById("stat-total-orders");

const tableBody = document.getElementById("transactions-body");

/* ================= HELPERS ================= */

const formatPrice = n =>
  `₦${Number(n || 0).toLocaleString("en-NG")}`;

const isToday = ts => {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

/* ================= LOGIN ================= */

loginForm?.addEventListener("submit", async e => {
  e.preventDefault();

  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    alert(err.message);
  }
});

/* ================= AUTH GATE ================= */

onAuthStateChanged(auth, async user => {
  if (!user) {
    panel.hidden = true;
    loginSection.hidden = false;
    return;
  }

  // 🔒 SUPER ADMIN CHECK
  let snap;

try {
  snap = await getDoc(doc(db, "superAdmins", user.uid));
} catch (err) {
  alert("Permission error. Check Firestore rules.");
  await signOut(auth);
  return;
}

if (!snap.exists()) {
  alert("Not authorized as owner");
  await signOut(auth);
  return;
}

  loginSection.hidden = true;
  panel.hidden = false;

  startFinanceListener();
});

/* ================= LOGOUT ================= */

document.querySelectorAll("#super-logout, #owner-logout")
  .forEach(btn => {
    btn?.addEventListener("click", async () => {
      await signOut(auth);
    });
  });
// ================= GLOBAL STATE =================
let allTransactions = [];

// ================= HELPERS =================
const formatDate = ts => {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-GB");
};

const isWithinDays = (ts, days) => {
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  return (now - date) <= days * 24 * 60 * 60 * 1000;
};


const msgInput = document.getElementById("announcement-input");
const activeToggle = document.getElementById("announcement-active");
const saveBtn = document.getElementById("save-announcement");

saveBtn?.addEventListener("click", async () => {
  await setDoc(doc(db, "siteConfig", "announcement"), {
    message: msgInput.value.trim(),
    active: activeToggle.checked,
    speed: 30, // slower = calmer
  });

  alert("Announcement updated");
});

// ================= RENDER =================
function renderTransactions(transactions) {
  tableBody.innerHTML = "";

  transactions.forEach(o => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${formatDate(o.createdAt)}</td>
      <td>${o.customer?.name || "-"}</td>
      <td>${formatPrice(o.total)}</td>
      <td>${o.status || "—"}</td>
      <td>
        <span class="badge ${o.paid ? "paid" : "unpaid"}">
          ${o.paid ? "Paid" : "Unpaid"}
        </span>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// ================= FIRESTORE LISTENER =================
function startFinanceListener() {
  const q = query(
    collection(db, "orders"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(q, snap => {
    let totalRevenue = 0;
    let todayRevenue = 0;

    allTransactions = [];

    snap.forEach(docSnap => {
      const o = docSnap.data();
      if (!o.paid) return;

      totalRevenue += o.total || 0;
      if (isWithinDays(o.createdAt, 1)) {
        todayRevenue += o.total || 0;
      }

      allTransactions.push({
        id: o.id,
        createdAt: o.createdAt,
        customer: o.customer,
        total: o.total,
        status: o.status,
        paid: o.paid
      });
    });

    totalRevenueEl.textContent = formatPrice(totalRevenue);
    todayRevenueEl.textContent = formatPrice(todayRevenue);
    ordersCountEl.textContent = allTransactions.length;

    renderTransactions(allTransactions);
  });
}

// ================= DATE FILTERS =================
document.querySelectorAll(".date-filters button").forEach(btn => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".date-filters button")
      .forEach(b => b.classList.remove("is-active"));

    btn.classList.add("is-active");

    const range = btn.dataset.range;
    let filtered = allTransactions;

    if (range === "today") {
      filtered = allTransactions.filter(t => isWithinDays(t.createdAt, 1));
    }

    if (range === "7") {
      filtered = allTransactions.filter(t => isWithinDays(t.createdAt, 7));
    }

    if (range === "30") {
      filtered = allTransactions.filter(t => isWithinDays(t.createdAt, 30));
    }

    renderTransactions(filtered);
  });
});

// ================= CSV EXPORT =================
document.getElementById("export-csv").onclick = () => {
  const headers = [
    "Order ID",
    "Date",
    "Customer",
    "Amount (NGN)",
    "Status",
    "Paid"
  ];

  const rows = allTransactions.map(t => [
    t.id,
    formatDate(t.createdAt),
    t.customer?.name || "",
    t.total,
    t.status || "",
    t.paid ? "Yes" : "No"
  ]);

  const csv = [headers, ...rows]
    .map(r => r.join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `kandys-transactions-${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
};

// ================= PRINT =================
document.getElementById("print-transactions").onclick = () => {
  window.print();
};