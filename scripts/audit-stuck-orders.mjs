// Lean version: only fetch unpaid web orders (small set).
import admin from "firebase-admin";
import { readFile } from "node:fs/promises";

const sa = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const snap = await db
  .collection("orders")
  .where("source", "==", "web")
  .where("payment_status", "==", "unpaid")
  .limit(50)
  .get();

console.log(`Found ${snap.size} unpaid web orders (max 50 shown).\n`);
for (const doc of snap.docs) {
  const o = doc.data();
  console.log({
    id: doc.id,
    created_at: o.created_at?.toDate?.()?.toISOString() ?? o.created_at,
    customer: o.customer_name,
    total: o.total,
    status: o.status,
    has_valor_refs: Boolean(o.rrn || o.auth_code),
  });
}
process.exit(0);
