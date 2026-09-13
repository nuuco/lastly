export type GemmaConsent = "accepted" | "declined" | null;

const CONSENT_KEY = "lastly.gemmaConsent";

export function getGemmaConsent(): GemmaConsent {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw === "accepted" || raw === "declined") return raw;
  } catch {
    // ignore
  }
  return null;
}

export function setGemmaConsent(value: Exclude<GemmaConsent, null> | null) {
  try {
    if (value == null) localStorage.removeItem(CONSENT_KEY);
    else localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // ignore
  }
}

export type GemmaNetworkHint = "wifi" | "cellular" | "unknown";

export function gemmaNetworkHint(
  connection?: {
    type?: string;
    effectiveType?: string;
    saveData?: boolean;
  } | null,
): GemmaNetworkHint {
  if (!connection) return "unknown";
  if (connection.saveData) return "cellular";
  const type = (connection.type ?? "").toLowerCase();
  if (type === "wifi" || type === "ethernet") return "wifi";
  if (type === "cellular" || type === "wimax") return "cellular";
  const effective = (connection.effectiveType ?? "").toLowerCase();
  if (effective === "slow-2g" || effective === "2g" || effective === "3g") {
    return "cellular";
  }
  return "unknown";
}

export function readNavigatorConnection() {
  return (
    (navigator as Navigator & {
      connection?: {
        type?: string;
        effectiveType?: string;
        saveData?: boolean;
      };
    }).connection ?? null
  );
}
