/**
 * Epson TM-m30III Server Direct Print endpoint.
 *
 * The printer is configured (in Epson WebConfig) to POST this URL on a polling
 * interval. Two kinds of requests arrive on the same endpoint:
 *
 *   1. Poll request — no `If-Match` header. We respond with a SOAP envelope
 *      containing the next paid, unprinted POS order's receipt XML, and set
 *      an `ETag` header carrying the order id so the printer can ack it.
 *
 *   2. Ack request — has `If-Match: "<orderId>"`. We mark that order as
 *      printed in Firestore. Body is the printer's success/failure result.
 *
 * If there's nothing to print, we reply 200 with an empty SOAP body — the
 * printer treats that as "no job".
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDb } from "../_lib/firebase-admin";
import { buildReceiptXml } from "../_lib/receipt-xml";
import { FieldValue } from "firebase-admin/firestore";

const EMPTY_SOAP =
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body/></s:Envelope>`;

function stripQuotes(v: string | string[] | undefined): string | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s.replace(/^"|"$/g, "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Server Direct Print only POSTs. Reject anything else but allow GET for a
  // quick browser sanity check.
  if (req.method === "GET") {
    res.status(200).send("Epson Server Direct Print endpoint is live.");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  res.setHeader("Content-Type", 'text/xml; charset="utf-8"');

  const ifMatch = stripQuotes(req.headers["if-match"]);

  // ── Ack path ──────────────────────────────────────────────────────────
  if (ifMatch) {
    try {
      await adminDb.collection("orders").doc(ifMatch).update({
        receipt_printed_at: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error("ack update failed", ifMatch, e);
    }
    res.status(200).send(EMPTY_SOAP);
    return;
  }

  // ── Poll path ─────────────────────────────────────────────────────────
  try {
    // Pick the oldest paid POS order that hasn't been printed yet.
    const snap = await adminDb
      .collection("orders")
      .where("source", "==", "pos")
      .where("payment_status", "==", "paid")
      .where("receipt_printed_at", "==", null)
      .orderBy("created_at", "asc")
      .limit(1)
      .get();

    if (snap.empty) {
      // Fallback: some old orders won't have receipt_printed_at field at all.
      // Skip them by not querying without the field check above. (Firestore
      // returns docs where the field is exactly null; missing field is not
      // matched. Backfill via a one-time script if needed.)
      res.status(200).send(EMPTY_SOAP);
      return;
    }

    const doc = snap.docs[0];
    const data = doc.data();
    const created = data.created_at?.toDate?.()?.toISOString() ?? new Date().toISOString();

    const xml = buildReceiptXml({
      id: doc.id,
      customer_name: data.customer_name,
      items: data.items || [],
      total: data.total || 0,
      order_type: data.order_type,
      payment: data.payment,
      notes: data.notes,
      created_at: created,
      source: data.source,
      masked_pan: data.masked_pan,
      auth_code: data.auth_code,
    });

    res.setHeader("ETag", `"${doc.id}"`);
    res.status(200).send(xml);
  } catch (e) {
    console.error("poll failed", e);
    res.status(200).send(EMPTY_SOAP);
  }
}
