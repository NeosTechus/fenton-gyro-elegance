// Audit recent orders for "stuck unpaid" state — what we'd expect if web
// checkout broke during the no-confirm window between a69f4d5 and f6b9a0d.
// Read-only.

import admin from "firebase-admin";
import { readFile } from "node:fs/promises";

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const sa = JSON.parse(await readFile(saPath, "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const db = admin.firestore();
const hoursAgo = Number(process.argv[2] ?? 24);
const since = new Date(Date.now() - hoursAgo * 3600_000);

const snap = await db
  .collection("orders")
  .where("created_at", ">=", since)
  .orderBy("created_at", "desc")
  .get();

const buckets = {
  webPaid: [],
  webUnpaid: [],
  webOther: [],
  posPaid: [],
  posUnpaid: [],
  kioskPaid: [],
  kioskUnpaid: [],
  cancelled: [],
};

for (const doc of snap.docs) {
  const o = doc.data();
  const id = doc.id;
  const slim = {
    id,
    source: o.source,
    status: o.status,
    payment_status: o.payment_status,
    payment: o.payment,
    total: o.total,
    created_at: o.created_at?.toDate?.()?.toISOString() ?? o.created_at,
    paid_at: o.paid_at?.toDate?.()?.toISOString() ?? null,
    paid_via: o.paid_via ?? null,
    has_valor_refs: Boolean(o.rrn || o.auth_code),
    customer: o.customer_name,
  };
  if (o.status === "cancelled") buckets.cancelled.push(slim);
  else if (o.source === "web" && o.payment_status === "paid") buckets.webPaid.push(slim);
  else if (o.source === "web" && o.payment_status === "unpaid") buckets.webUnpaid.push(slim);
  else if (o.source === "web") buckets.webOther.push(slim);
  else if (o.source === "pos" && o.payment_status === "paid") buckets.posPaid.push(slim);
  else if (o.source === "pos" && o.payment_status === "unpaid") buckets.posUnpaid.push(slim);
  else if (o.source === "kiosk" && o.payment_status === "paid") buckets.kioskPaid.push(slim);
  else if (o.source === "kiosk" && o.payment_status === "unpaid") buckets.kioskUnpaid.push(slim);
}

console.log(`\n=== Orders in the last ${hoursAgo}h: ${snap.size} total ===`);
console.log(`web   paid:     ${buckets.webPaid.length}`);
console.log(`web   unpaid:   ${buckets.webUnpaid.length}   ← these would be stuck if any`);
console.log(`pos   paid:     ${buckets.posPaid.length}`);
console.log(`pos   unpaid:   ${buckets.posUnpaid.length}`);
console.log(`kiosk paid:     ${buckets.kioskPaid.length}`);
console.log(`kiosk unpaid:   ${buckets.kioskUnpaid.length}`);
console.log(`cancelled:      ${buckets.cancelled.length}`);

if (buckets.webUnpaid.length) {
  console.log(`\n--- STUCK UNPAID WEB ORDERS ---`);
  for (const o of buckets.webUnpaid) {
    console.log(JSON.stringify(o, null, 2));
  }
}

if (buckets.webPaid.length) {
  console.log(`\n--- Last 3 paid web orders (sanity) ---`);
  for (const o of buckets.webPaid.slice(0, 3)) {
    console.log(JSON.stringify(o, null, 2));
  }
}

process.exit(0);
