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
    // 1️⃣ Verify Flutterwave signature
    const signature = req.headers["verif-hash"];
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;

    if (!signature || signature !== secretHash) {
      console.error("❌ Invalid Flutterwave signature");
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    // 2️⃣ Only handle successful payments
    if (event.event !== "charge.completed") {
      return res.status(200).send("Ignored");
    }

    const data = event.data;

    // 3️⃣ Ensure payment is successful
    if (data.status !== "successful") {
      return res.status(200).send("Payment not successful");
    }

    // 4️⃣ tx_ref === orderId (your checkout already enforces this)
    const orderId = data.tx_ref;

    if (!orderId) {
      console.error("❌ Missing tx_ref");
      return res.status(200).send("Missing tx_ref");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      console.error("❌ Order not found:", orderId);
      return res.status(200).send("Order not found");
    }

    if (snap.data().paid === true) {
      return res.status(200).send("Already processed");
    }

    // 5️⃣ Mark order as paid
    await orderRef.update({
      paid: true,
      paymentProvider: "flutterwave",
      paymentRef: data.flw_ref || data.id,
      paymentStatus: "confirmed",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Flutterwave payment confirmed:", orderId);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Flutterwave webhook error:", err);
    return res.status(500).send("Webhook error");
  }
}