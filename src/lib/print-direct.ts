/**
 * Direct LAN print to the in-store Epson TM-m30III.
 *
 * Bypasses the Server Direct Print poll/queue entirely — the POS browser
 * POSTs the receipt XML straight to the printer's ePOS-Print endpoint on
 * the local network. Receipt prints in <1 second, no cloud round-trip.
 *
 * Browser security: the POS site is HTTPS but the printer endpoint is
 * HTTP on a private IP. Chrome allows this under Private Network Access
 * because the printer returns Access-Control-Allow-Private-Network: true.
 *
 * Falls back gracefully: if the LAN request fails (printer offline,
 * wrong IP, cross-network), the cloud queue (queueReceiptPrint) still
 * has the order recorded and the printer can pick it up later if it
 * starts polling.
 */

import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

interface OrderLine {
  name: string;
  quantity: number;
  price: number;
  modifiers?: string[];
}

interface OrderForReceipt {
  id: string;
  customer_name?: string;
  items: OrderLine[];
  total: number;
  order_type?: string;
  payment?: "card" | "cash";
  notes?: string;
  created_at?: string;
  masked_pan?: string;
  auth_code?: string;
}

const STORE_NAME = "Fenton Gyro";
const STORE_ADDRESS_LINES = [
  "657 Gravois Rd",
  "Fenton, MO 63026",
  "(636) 600-1333",
];
const TAX_RATE = 0.08238;
const LINE_WIDTH = 42; // characters on TM-m30III at default font

const PRINTER_IP_KEY = "pos-printer-ip";
const DEFAULT_PRINTER_IP = "192.168.1.203";

export function getPrinterIp(): string {
  if (typeof window === "undefined") return DEFAULT_PRINTER_IP;
  return localStorage.getItem(PRINTER_IP_KEY) || DEFAULT_PRINTER_IP;
}

export function setPrinterIp(ip: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PRINTER_IP_KEY, ip);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  if (s.length >= width) return s.slice(0, width);
  const fill = " ".repeat(width - s.length);
  return align === "left" ? s + fill : fill + s;
}

function lineItem(qty: number, name: string, price: number): string {
  const left = `${qty} x ${name}`;
  const right = `$${price.toFixed(2)}`;
  return pad(left, LINE_WIDTH - right.length, "left") + right;
}

function totalsLine(label: string, value: number): string {
  const right = `$${value.toFixed(2)}`;
  return pad(label, LINE_WIDTH - right.length, "left") + right;
}

function buildReceiptSoapXml(order: OrderForReceipt): string {
  const tag = order.id.slice(-4).toUpperCase();
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })
    : new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  const body: string[] = [];
  body.push(`<text align="center"/>`);
  body.push(`<text width="2" height="2"/>`);
  body.push(`<text>${escapeXml(STORE_NAME)}&#10;</text>`);
  body.push(`<text width="1" height="1"/>`);
  for (const ln of STORE_ADDRESS_LINES) body.push(`<text>${escapeXml(ln)}&#10;</text>`);
  body.push(`<feed line="1"/>`);
  body.push(`<text>${escapeXml(dateStr)}&#10;</text>`);
  body.push(`<text>Order #${escapeXml(tag)}&#10;</text>`);
  if (order.order_type) body.push(`<text>${escapeXml(order.order_type.toUpperCase())}&#10;</text>`);
  body.push(`<text align="left"/>`);
  body.push(`<text>${"-".repeat(LINE_WIDTH)}&#10;</text>`);

  for (const it of order.items) {
    body.push(`<text>${escapeXml(lineItem(it.quantity, it.name, it.price * it.quantity))}&#10;</text>`);
    if (it.modifiers && it.modifiers.length) {
      for (const m of it.modifiers) body.push(`<text>  + ${escapeXml(m)}&#10;</text>`);
    }
  }

  if (order.notes) {
    body.push(`<feed line="1"/>`);
    body.push(`<text>Notes: ${escapeXml(order.notes)}&#10;</text>`);
  }
  body.push(`<text>${"-".repeat(LINE_WIDTH)}&#10;</text>`);
  body.push(`<text>${escapeXml(totalsLine("Subtotal", subtotal))}&#10;</text>`);
  body.push(`<text>${escapeXml(totalsLine("Tax", tax))}&#10;</text>`);
  body.push(`<text width="1" height="2"/>`);
  body.push(`<text>${escapeXml(totalsLine("TOTAL", order.total))}&#10;</text>`);
  body.push(`<text width="1" height="1"/>`);
  body.push(`<feed line="1"/>`);

  if (order.payment === "cash") {
    body.push(`<text>Paid: CASH&#10;</text>`);
  } else if (order.payment === "card") {
    const last4 = order.masked_pan ? order.masked_pan.slice(-4) : "";
    body.push(`<text>Paid: CARD${last4 ? ` ****${escapeXml(last4)}` : ""}&#10;</text>`);
    if (order.auth_code) body.push(`<text>Auth: ${escapeXml(order.auth_code)}&#10;</text>`);
  }

  body.push(`<feed line="2"/>`);
  body.push(`<text align="center"/>`);
  body.push(`<text>Thank you!&#10;</text>`);
  body.push(`<text>fentongyro.com&#10;</text>`);
  body.push(`<feed line="3"/>`);
  body.push(`<cut type="feed"/>`);

  const eposPrint =
    `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${body.join("")}</epos-print>`;
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Body>${eposPrint}</s:Body>` +
    `</s:Envelope>`
  );
}

/**
 * Print an order directly to the local printer.
 * Throws on any failure — caller decides whether to surface or swallow.
 */
export async function directPrintOrder(orderId: string, printerIp?: string): Promise<void> {
  if (!isFirebaseConfigured || !db) throw new Error("Firebase not configured");
  const snap = await getDoc(doc(db, "orders", orderId));
  if (!snap.exists()) throw new Error(`Order ${orderId} not found`);
  const data = snap.data();

  const createdAt =
    data.created_at instanceof Timestamp
      ? data.created_at.toDate().toISOString()
      : typeof data.created_at === "string"
        ? data.created_at
        : new Date().toISOString();

  const xml = buildReceiptSoapXml({
    id: orderId,
    customer_name: data.customer_name,
    items: data.items || [],
    total: data.total || 0,
    order_type: data.order_type,
    payment: data.payment,
    notes: data.notes,
    created_at: createdAt,
    masked_pan: data.masked_pan,
    auth_code: data.auth_code,
  });

  const ip = printerIp || getPrinterIp();
  const url = `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '""',
    },
    body: xml,
  });
  if (!resp.ok) throw new Error(`Printer HTTP ${resp.status}`);
  const text = await resp.text();
  if (!text.includes('success="true"')) {
    throw new Error(`Printer rejected: ${text.slice(0, 200)}`);
  }
}
