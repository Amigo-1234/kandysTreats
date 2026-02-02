import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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

/* ================= ELEMENTS ================= */

const orderIdEl = document.getElementById("pay-order-id");
const amountEl = document.getElementById("pay-amount");
const paystackBtn = document.getElementById("pay-paystack");
const flutterwaveBtn = document.getElementById("pay-flutterwave");
const errorEl = document.getElementById("pay-error");

/* ================= HELPERS ================= */

const qs = new URLSearchParams(window.location.search);
const orderId = qs.get("order");

let orderData = null;

const showError = (msg) => {
  errorEl.textContent = msg;
  errorEl.hidden = false;
};

/* ================= LOAD ORDER ================= */

async function loadOrder() {
  if (!orderId) {
    showError("Invalid payment link.");
    return;
  }

  const snap = await getDoc(doc(db, "orders", orderId));

  if (!snap.exists()) {
    showError("Order not found.");
    return;
  }

  orderData = snap.data();

  if (orderData.paid) {
    window.location.href = `/track.html?code=${orderId}`;
    return;
  }

  orderIdEl.textContent = orderId;
  amountEl.textContent =
  Number(orderData.total).toLocaleString("en-NG");

  paystackBtn.disabled = false;
  flutterwaveBtn.disabled = false;
}

loadOrder();

/* ================= PAYSTACK ================= */

paystackBtn.addEventListener("click", () => {
  if (!orderData) {
    showError("Order not ready. Please refresh.");
    return;
  }

  window.startPaystackPayment({
    key: "pk_live_bd05647da5ae5885013df5fdbc07c7545d7adf70",
    email: orderData.customer?.email || "ads.kandystreats@gmail.com",
    amount: Math.round(orderData.total * 100),
    orderId,

    metadata: {
      custom_fields: [
        { display_name: "Customer", value: orderData.customer?.name || "" },
        { display_name: "Phone", value: orderData.customer?.phone || "" }
      ]
    },

    onSuccess: async (reference) => {
      await updateDoc(doc(db, "orders", orderId), {
        paid: true,
        paymentMethod: "paystack",
        paymentReference: reference,
        paidAt: serverTimestamp(),
      });

      window.location.href = `/track.html?code=${orderId}`;
    },

    onClose: () => {
      showError("Payment cancelled.");
    }
  });
});


/* ================= FLUTTERWAVE ================= */

flutterwaveBtn.onclick = () => {
  if (!window.FlutterwaveCheckout) {
    showError("Flutterwave failed to load.");
    return;
  }

  FlutterwaveCheckout({
    public_key: "FLWPUBK-3094f9362789db81b6b2afb5e7c1a080-X",
    tx_ref: orderId,
    amount: orderData.total,
    currency: "NGN",

    customer: {
      email: orderData.customer?.email || "ads.kandystreats@gmail.com",
      phone_number: orderData.customer?.phone,
      name: orderData.customer?.name,
    },

    callback: async (res) => {
      if (res.status === "successful") {
        await updateDoc(doc(db, "orders", orderId), {
          paid: true,
          paymentMethod: "flutterwave",
          paymentReference: res.transaction_id,
          paidAt: serverTimestamp(),
        });

        window.location.href = `/track.html?code=${orderId}`;
      }
    },

    onclose: () => {
      showError("Payment cancelled.");
    }
  });
};
// ================= DEV TEST HELPERS =================
// ⚠️ Dev only – remove before production if you want

window.__markPaid = async (orderId) => {
  if (!orderId) {
    console.error("Order ID required");
    return;
  }

  try {
    await updateDoc(doc(db, "orders", orderId), {
      paid: true,
      paymentMethod: "manual-test",
      paymentReference: "DEV_CONSOLE",
      paidAt: serverTimestamp(),
    });

    console.log("✅ Marked as paid:", orderId);

    // simulate real redirect
    window.location.href = `/track.html?code=${orderId}`;
  } catch (err) {
    console.error("❌ Failed to mark paid", err);
  }
};

document.getElementById("back-to-cart")?.addEventListener("click", () => {
  window.location.href = "/cart.html";
});