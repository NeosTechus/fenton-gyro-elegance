import admin from 'firebase-admin';
import fs from 'fs';

const sa = JSON.parse(fs.readFileSync('/Users/harshakolla/Downloads/fenton-gyro-firebase-adminsdk-fbsvc-3ebb01025c.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const doc = await db.collection('orders').doc('hNBQp02vf35FHEV2O093').get();
const data = doc.data();
console.log('Order #581 current state:');
console.log('  receipt_printed_at:', data.receipt_printed_at?.toDate?.()?.toISOString() ?? data.receipt_printed_at ?? 'MISSING');
console.log('  payment_status:', data.payment_status);
console.log('  source:', data.source);
console.log('  status:', data.status);
console.log('  total:', data.total);

const stuck = await db.collection('orders').where('receipt_printed_at', '==', null).get();
console.log(`\nCurrently ${stuck.size} orders queued for print:`);
stuck.docs.forEach(d => console.log(`  - ${d.id}`));
