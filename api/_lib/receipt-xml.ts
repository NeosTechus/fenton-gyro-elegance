/**
 * Builds an Epson ePOS-Print SOAP XML body for a customer receipt.
 * Targets the TM-m30III in Server Direct Print mode.
 */

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
  source?: string;
  masked_pan?: string;
  auth_code?: string;
}

const STORE_NAME = "Fenton Gyro";
const STORE_ADDRESS_LINES = ["Fenton, MO", "(636) 717-7700"];
const TAX_RATE = 0.08238;

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

const LINE_WIDTH = 42; // characters per line on TM-m30III at default font

function lineItem(qty: number, name: string, price: number): string {
  const left = `${qty} x ${name}`;
  const right = `$${price.toFixed(2)}`;
  const space = LINE_WIDTH - right.length;
  return pad(left, space, "left") + right;
}

function totalsLine(label: string, value: number): string {
  const right = `$${value.toFixed(2)}`;
  return pad(label, LINE_WIDTH - right.length, "left") + right;
}

export function buildReceiptXml(order: OrderForReceipt): string {
  const tag = order.id.slice(-4).toUpperCase();
  const subtotal = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })
    : new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });

  const body: string[] = [];
  // Header
  body.push(`<text align="center"/>`);
  body.push(`<text width="2" height="2"/>`);
  body.push(`<text>${escapeXml(STORE_NAME)}&#10;</text>`);
  body.push(`<text width="1" height="1"/>`);
  for (const ln of STORE_ADDRESS_LINES) {
    body.push(`<text>${escapeXml(ln)}&#10;</text>`);
  }
  body.push(`<feed line="1"/>`);
  body.push(`<text>${escapeXml(dateStr)}&#10;</text>`);
  body.push(`<text>Order #${escapeXml(tag)}&#10;</text>`);
  if (order.order_type) {
    body.push(`<text>${escapeXml(order.order_type.toUpperCase())}&#10;</text>`);
  }
  body.push(`<text align="left"/>`);
  body.push(`<text>${"-".repeat(LINE_WIDTH)}&#10;</text>`);

  // Items
  for (const it of order.items) {
    body.push(`<text>${escapeXml(lineItem(it.quantity, it.name, it.price * it.quantity))}&#10;</text>`);
    if (it.modifiers && it.modifiers.length) {
      for (const m of it.modifiers) {
        body.push(`<text>  + ${escapeXml(m)}&#10;</text>`);
      }
    }
  }

  if (order.notes) {
    body.push(`<feed line="1"/>`);
    body.push(`<text>Notes: ${escapeXml(order.notes)}&#10;</text>`);
  }

  body.push(`<text>${"-".repeat(LINE_WIDTH)}&#10;</text>`);

  // Totals
  body.push(`<text>${escapeXml(totalsLine("Subtotal", subtotal))}&#10;</text>`);
  body.push(`<text>${escapeXml(totalsLine("Tax", tax))}&#10;</text>`);
  body.push(`<text width="1" height="2"/>`);
  body.push(`<text>${escapeXml(totalsLine("TOTAL", order.total))}&#10;</text>`);
  body.push(`<text width="1" height="1"/>`);
  body.push(`<feed line="1"/>`);

  // Payment
  if (order.payment === "cash") {
    body.push(`<text>Paid: CASH&#10;</text>`);
  } else if (order.payment === "card") {
    const last4 = order.masked_pan ? order.masked_pan.slice(-4) : "";
    body.push(`<text>Paid: CARD${last4 ? ` ****${escapeXml(last4)}` : ""}&#10;</text>`);
    if (order.auth_code) body.push(`<text>Auth: ${escapeXml(order.auth_code)}&#10;</text>`);
  }

  // Footer
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
