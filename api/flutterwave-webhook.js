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
  try {
    // 🔐 Verify Flutterwave signature
    const signature = req.headers["verif-hash"];
    if (signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
      console.error("❌ Invalid Flutterwave signature");
      return res.status(401).send("Unauthorized");
    }

    const event = req.body;
    const data = event?.data;

    // ✅ Only process successful payments (card, transfer, etc.)
    if (!data || data.status !== "successful") {
      return res.status(200).send("Not successful");
    }

    // 🔑 tx_ref is YOUR order ID
    const orderId = data.tx_ref;
    if (!orderId) {
      console.error("❌ Missing tx_ref", data);
      return res.status(200).send("Missing tx_ref");
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      console.error("❌ Order not found:", orderId);
      return res.status(200).send("Order not found");
    }

    // 🛑 Idempotency: prevent double updates
    if (snap.data().paid === true) {
      return res.status(200).send("Already processed");
    }

    // ✅ Mark order as paid
    await orderRef.update({
      paid: true,
      paymentProvider: "flutterwave",
      paymentRef: String(data.id || data.flw_ref),
      paymentType: data.payment_type || data.payment_options || "unknown",
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