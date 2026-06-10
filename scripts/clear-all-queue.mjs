import admin from 'firebase-admin';
import fs from 'fs';
const sa = JSON.parse(fs.readFileSync('/Users/harshakolla/Downloads/fenton-gyro-firebase-adminsdk-fbsvc-3ebb01025c.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const snap = await db.collection('orders').where('receipt_printed_at', '==', null).get();
console.log(`Clearing ${snap.size} stuck orders.`);
const batch = db.batch();
for (const doc of snap.docs) {
  batch.update(doc.ref, { receipt_printed_at: doc.data().created_at });
}
await batch.commit();
console.log('Queue empty.');
