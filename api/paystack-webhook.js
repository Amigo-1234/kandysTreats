import admin from "firebase-admin";
import crypto from "crypto";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  try {
    // 1️⃣ Verify signature
    const signature = req.headers["x-paystack-signature"];

    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      console.error("❌ Invalid Paystack signature");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    // 2️⃣ Only accept successful charges
    if (event.event !== "charge.success") {
      return res.status(200).send("Ignored");
    }

    // 3️⃣ Paystack reference === Firestore order ID
    const orderId = event.data.reference;

    if (!orderId) {
      console.error("❌ Missing reference");
      return res.status(400).send("Missing reference");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      console.error("❌ Order not found:", orderId);
      return res.status(200).send("Order not found");
    }

    // 4️⃣ Prevent double-processing
    if (snap.data().paid === true) {
      console.log("ℹ️ Already paid:", orderId);
      return res.status(200).send("Already processed");
    }

    // 5️⃣ Mark as paid
    await orderRef.update({
      paid: true,
      paymentProvider: "paystack",
      paymentRef: orderId,
      paymentStatus: "confirmed",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Payment confirmed:", orderId);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}

// TEMP TEST MODE (REMOVE LATER)
if (req.query.test === "1") {
  const orderId = req.query.orderId;

  await db.collection("orders").doc(orderId).update({
    paid: true,
    paymentProvider: "paystack",
    paymentRef: "TEST_WEBHOOK",
    paymentStatus: "confirmed",
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.status(200).send("TEST OK");
}