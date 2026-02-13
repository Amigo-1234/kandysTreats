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
    const signature = req.headers["x-paystack-signature"];

    const hash = crypto
      .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;

    if (event.event !== "charge.success") {
      return res.status(200).send("Ignored");
    }

    // ✅ ALWAYS USE METADATA FIRST
    const orderId =
      event.data.metadata?.orderId ||
      event.data.metadata?.custom_fields?.find(f => f.variable_name === "orderId")?.value;

    if (!orderId) {
      console.error("❌ Missing orderId in metadata", event.data.reference);
      return res.status(200).send("Missing orderId");
    }

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();

    if (!snap.exists) {
      console.error("❌ Order not found:", orderId);
      return res.status(200).send("Order not found");
    }

    if (snap.data().paid === true) {
      return res.status(200).send("Already processed");
    }

    await ref.update({
      paid: true,
      paymentProvider: "paystack",
      paymentRef: event.data.reference, // store Paystack ref separately
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