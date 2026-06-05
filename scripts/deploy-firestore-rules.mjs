// Deploy firestore.rules using a Google service account.
// Bypasses `firebase deploy` (which requires interactive OAuth) by hitting
// the Firebase Rules REST API directly with a service-account access token.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
//     node scripts/deploy-firestore-rules.mjs
//
// The service account needs roles/firebaserules.admin (or roles/firebase.admin
// / roles/owner).

import admin from "firebase-admin";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!saPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS not set");
  process.exit(1);
}
const sa = JSON.parse(await readFile(saPath, "utf-8"));
const projectId = sa.project_id;

admin.initializeApp({ credential: admin.credential.cert(sa) });

const rulesPath = resolve("firestore.rules");
const rulesContent = await readFile(rulesPath, "utf-8");
console.log(`Read ${rulesPath} (${rulesContent.length} bytes)`);

const token = await admin.app().options.credential.getAccessToken();
const accessToken = token.access_token;

// 1. Create the ruleset
const createUrl = `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`;
const createRes = await fetch(createUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source: {
      files: [{ name: "firestore.rules", content: rulesContent }],
    },
  }),
});
const createJson = await createRes.json();
if (!createRes.ok) {
  console.error("❌ Create ruleset failed:", JSON.stringify(createJson, null, 2));
  process.exit(1);
}
console.log(`✓ Created ruleset: ${createJson.name}`);

// 2. Release the ruleset to the cloud.firestore release channel
const releaseName = `projects/${projectId}/releases/cloud.firestore`;
const releaseUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;

const releaseRes = await fetch(releaseUrl, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    release: {
      name: releaseName,
      rulesetName: createJson.name,
    },
  }),
});
const releaseJson = await releaseRes.json();
if (!releaseRes.ok) {
  console.error("❌ Release failed:", JSON.stringify(releaseJson, null, 2));
  process.exit(1);
}
console.log(`✓ Released to cloud.firestore`);
console.log(`  ruleset: ${releaseJson.rulesetName}`);
console.log(`  updated: ${releaseJson.updateTime}`);

process.exit(0);
