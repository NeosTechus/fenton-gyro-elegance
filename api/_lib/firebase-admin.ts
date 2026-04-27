import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function loadCredentials(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  const parsed = JSON.parse(raw);
  // Vercel UI sometimes mangles \n inside private_key — restore real newlines.
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed as ServiceAccount;
}

if (!getApps().length) {
  initializeApp({ credential: cert(loadCredentials()) });
}

export const adminDb = getFirestore();
