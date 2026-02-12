// /api/paystack-webhook.js
import crypto from "crypto";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  // 🔐 Verify signature
  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;

  if (event.event !== "charge.success") {
    return res.status(200).send("Ignored");
  }

  const orderId = event.data.reference; // your KD-xxxx

  const ref = db.collection("orders").doc(orderId);
  const snap = await ref.get();

  if (!snap.exists) {
    return res.status(404).send("Order not found");
  }

  // 🛑 DO NOT double-mark
  if (snap.data().paid) {
    return res.status(200).send("Already processed");
  }

  await ref.update({
    paid: true,
    paymentStatus: "confirmed",
    paymentProvider: "paystack",
    paymentRef: event.data.reference,
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return res.status(200).send("OK");
}