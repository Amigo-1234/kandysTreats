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
  const receivedAt = admin.firestore.FieldValue.serverTimestamp();
  let logRef;

  try {
    // 🧾 Create log FIRST (always)
    logRef = await db.collection("payment_logs").add({
      provider: "flutterwave",
      verified: false,
      receivedAt,
      payload: req.body,
    });

    const signature = req.headers["verif-hash"];

    if (!signature || signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
      await logRef.update({
        verified: false,
        reason: "Invalid or missing signature",
      });
      return res.status(401).send("Unauthorized");
    }

    const event = req.body;

    await logRef.update({
      verified: true,
      event: event.event,
      status: event.data?.status || "unknown",
    });

    // ❌ Ignore non-success
    if (event.event !== "charge.completed") {
      await logRef.update({ reason: "Ignored event type" });
      return res.status(200).send("Ignored");
    }

    if (event.data?.status !== "successful") {
      await logRef.update({ reason: "Payment not successful" });
      return res.status(200).send("Not successful");
    }

    const orderId = event.data.tx_ref;

    if (!orderId) {
      await logRef.update({ reason: "Missing tx_ref" });
      return res.status(200).send("Missing tx_ref");
    }

    await logRef.update({ orderId });

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      await logRef.update({ reason: "Order not found" });
      return res.status(200).send("Order not found");
    }

    if (snap.data().paid === true) {
      await logRef.update({ reason: "Already processed" });
      return res.status(200).send("Already processed");
    }

    // ✅ CONFIRM PAYMENT
    await orderRef.update({
      paid: true,
      paymentProvider: "flutterwave",
      paymentRef: event.data.id,
      paymentStatus: "confirmed",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logRef.update({
      success: true,
      reason: null,
    });

    console.log("✅ Flutterwave payment confirmed:", orderId);
    return res.status(200).send("OK");
  } catch (err) {
    console.error("🔥 Flutterwave webhook error:", err);

    if (logRef) {
      await logRef.update({
        success: false,
        reason: err.message,
      });
    }

    return res.status(500).send("Webhook error");
  }
}