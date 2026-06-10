import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
const sa = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
try {
  const ref = db.collection("_health").doc("probe");
  await ref.set({ at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  console.log("WRITE OK");
} catch (e) {
  console.log("WRITE ERROR:", e.code, "—", e.details || e.message);
}
process.exit(0);
