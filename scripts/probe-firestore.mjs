import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
const sa = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
try {
  const snap = await db.collection("orders").limit(1).get();
  console.log("OK,", snap.size, "doc fetched.");
} catch (e) {
  console.log("ERROR:", e.code, "—", e.details || e.message);
}
process.exit(0);
