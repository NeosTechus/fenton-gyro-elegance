import admin from 'firebase-admin';
import fs from 'fs';

const sa = JSON.parse(fs.readFileSync('/Users/harshakolla/Downloads/fenton-gyro-firebase-adminsdk-fbsvc-3ebb01025c.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Keep this one in queue so the printer picks it up
const KEEP_QUEUED = 'hNBQp02vf35FHEV2O093';

const snap = await db.collection('orders').where('receipt_printed_at', '==', null).get();
console.log(`Found ${snap.size} stuck orders. Backfilling all except ${KEEP_QUEUED}.`);

let backfilled = 0;
const batch = db.batch();
for (const doc of snap.docs) {
  if (doc.id === KEEP_QUEUED) {
    console.log(`  KEEP    ${doc.id}  (will go to printer next poll)`);
    continue;
  }
  const createdAt = doc.data().created_at;
  batch.update(doc.ref, { receipt_printed_at: createdAt });
  console.log(`  CLEARED ${doc.id}  marked printed at ${createdAt?.toDate?.()?.toISOString() ?? '?'}`);
  backfilled++;
}
await batch.commit();
console.log(`\nDone. Backfilled ${backfilled} orders.`);
