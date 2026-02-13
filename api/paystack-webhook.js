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
    // 1️⃣ Verify Paystack signature
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

    // 2️⃣ Only handle successful payments
    if (event.event !== "charge.success") {
      return res.status(200).send("Ignored");
    }

    // 🔑 CORRECT: get Firestore order ID from metadata
    const orderId = event.data.metadata?.orderId;

    if (!orderId) {
      console.error("❌ Missing orderId in metadata");
      return res.status(200).send("Missing orderId");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      console.error("❌ Order not found:", orderId);
      return res.status(200).send("Order not found");
    }

    // 3️⃣ Prevent double processing
    if (snap.data().paid === true) {
      return res.status(200).send("Already processed");
    }

    // 4️⃣ Mark order as paid
    await orderRef.update({
      paid: true,
      paymentProvider: "paystack",
      paymentRef: event.data.reference, // Paystack ref (for records)
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