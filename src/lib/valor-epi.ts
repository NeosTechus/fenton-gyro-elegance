/**
 * Valor EPI (Endpoint Identifier) management.
 *
 * EPIs identify payment terminals. This module manages
 * the list of EPIs and checks device online/offline status.
 */

export interface ValorEPI {
  id: string;          // EPI / device identifier (e.g. "2501439074")
  label: string;       // friendly name (e.g. "VP550E #1")
  wsUrl: string;       // local WebSocket URL (e.g. "ws://192.168.1.10:5000")
  appKey?: string;     // per-terminal Valor APP KEY (for cloud API)
  online: boolean;
}

const STORAGE_KEY = "valor_epis";

// Pre-configured Fenton Gyro terminals. Only the non-secret EPI (device id) +
// label live in the client bundle. The terminal's secret APP KEY is held
// SERVER-SIDE in the VALOR_TERMINAL_KEYS env allow-list (keyed by EPI) and is
// resolved by the /api/valor-terminal-* endpoints — it must never ship to the
// browser.
const DEFAULT_EPIS: ValorEPI[] = [
  {
    id: "2501439074",
    label: "VP550E #1",
    wsUrl: "",
    online: false,
  },
  {
    id: "2501439077",
    label: "VP550E #2",
    wsUrl: "",
    online: false,
  },
  {
    id: "2501439078",
    label: "VP550E #3",
    wsUrl: "",
    online: false,
  },
];

export function getEPIs(): ValorEPI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // First-run or empty: seed with the configured Fenton Gyro terminals
    saveEPIs(DEFAULT_EPIS);
    return DEFAULT_EPIS;
  } catch {
    saveEPIs(DEFAULT_EPIS);
    return DEFAULT_EPIS;
  }
}

export function saveEPIs(epis: ValorEPI[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(epis));
}

export function addEPI(epi: Omit<ValorEPI, "online">): ValorEPI[] {
  const epis = getEPIs();
  epis.push({ ...epi, online: false });
  saveEPIs(epis);
  return epis;
}

/**
 * Reset to the default Fenton Gyro terminals.
 */
export function resetToDefaults(): ValorEPI[] {
  saveEPIs(DEFAULT_EPIS);
  return DEFAULT_EPIS;
}

export function removeEPI(id: string): ValorEPI[] {
  const epis = getEPIs().filter((e) => e.id !== id);
  saveEPIs(epis);
  return epis;
}

export function updateEPI(id: string, updates: Partial<ValorEPI>): ValorEPI[] {
  const epis = getEPIs().map((e) => (e.id === id ? { ...e, ...updates } : e));
  saveEPIs(epis);
  return epis;
}

/**
 * Check if a terminal is online via Valor Connect cloud.
 * Sends a harmless status ping (vc_status with a dummy req_txn_id) and
 * infers reachability from the response.
 */
export async function checkDeviceStatus(epi: string): Promise<boolean> {
  if (!epi) return false;
  try {
    const res = await fetch("/api/valor-terminal-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // appKey is resolved server-side from the EPI allow-list — never sent.
      body: JSON.stringify({ epi, reqTxnId: `PING${Date.now()}` }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    // Valor reachable if we got any JSON response without a network/auth error
    return res.ok && !data.error;
  } catch {
    return false;
  }
}

/**
 * Check status of all EPIs and return updated list.
 */
export async function refreshAllStatuses(): Promise<ValorEPI[]> {
  const epis = getEPIs();
  const results = await Promise.all(
    epis.map(async (epi) => ({
      ...epi,
      online: await checkDeviceStatus(epi.id),
    }))
  );
  saveEPIs(results);
  return results;
}
