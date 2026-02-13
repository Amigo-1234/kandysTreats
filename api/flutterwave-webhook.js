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
    const signature = req.headers["verif-hash"];

    if (!signature) {
      console.error("❌ Missing Flutterwave signature");
      return res.status(401).send("Unauthorized");
    }

    if (signature !== process.env.FLUTTERWAVE_SECRET_HASH) {
      console.error("❌ Invalid Flutterwave signature");
      return res.status(401).send("Unauthorized");
    }

    const event = req.body;

    if (event.event !== "charge.completed") {
      return res.status(200).send("Ignored");
    }

    if (event.data?.status !== "successful") {
      return res.status(200).send("Not successful");
    }

    const orderId = event.data.tx_ref;

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

    await orderRef.update({
      paid: true,
      paymentProvider: "flutterwave",
      paymentRef: event.data.id,
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