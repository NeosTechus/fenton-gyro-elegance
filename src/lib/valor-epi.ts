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

// Pre-configured Fenton Gyro terminals (Valor production credentials)
const DEFAULT_EPIS: ValorEPI[] = [
  {
    id: "2501439074",
    label: "VP550E #1",
    wsUrl: "",
    appKey: "9Ylv%RiKeQi7Cge$qL6zsNr4EOK8P84B",
    online: false,
  },
  {
    id: "2501439077",
    label: "VP550E #2",
    wsUrl: "",
    appKey: "MJQw6u0KCN6SxjvybMYi5jBdo1D@xDW7",
    online: false,
  },
  {
    id: "2501439078",
    label: "VP550E #3",
    wsUrl: "",
    appKey: "WtTsq9lXlEZ5ji4tw1DJPKFjAasSioY3",
    online: false,
  },
];

export function getEPIs(): ValorEPI[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // First-run: seed with the configured Fenton Gyro terminals
    saveEPIs(DEFAULT_EPIS);
    return DEFAULT_EPIS;
  } catch {
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
 * Check if a terminal is online by attempting a WebSocket connection.
 * Returns true if the connection opens within 5 seconds.
 */
export function checkDeviceStatus(wsUrl: string): Promise<boolean> {
  if (!wsUrl) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Check status of all EPIs and return updated list.
 */
export async function refreshAllStatuses(): Promise<ValorEPI[]> {
  const epis = getEPIs();
  const results = await Promise.all(
    epis.map(async (epi) => ({
      ...epi,
      online: await checkDeviceStatus(epi.wsUrl),
    }))
  );
  saveEPIs(results);
  return results;
}
