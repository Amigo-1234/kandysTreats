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

    const reference = event.data.reference;
    const orderId = event.data.metadata?.orderId;

    if (!orderId) {
      return res.status(400).send("Missing orderId");
    }

    await db.collection("orders").doc(orderId).update({
      paid: true,
      paymentProvider: "paystack",
      paymentRef: reference,
      paymentStatus: "confirmed",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).send("OK");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Webhook error");
  }
}