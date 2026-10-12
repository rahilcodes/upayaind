/**
 * Messages are split into one JSON file per area (src/i18n/messages/<locale>/*.json)
 * and merged here, so features can own their copy without editing one huge file.
 * Each file's top-level keys are namespaces; files must not share namespaces.
 */
const FILES = ["core", "auth", "nav", "marketing", "billing", "workspace", "resume", "student", "work", "admin", "messaging", "cms", "emails"] as const;

export async function loadMessages(locale: string) {
  const merged: Record<string, unknown> = {};
  for (const f of FILES) {
    try {
      const mod = (await import(`./messages/${locale}/${f}.json`)).default as Record<string, unknown>;
      Object.assign(merged, mod);
    } catch {
      // file not present yet
    }
  }
  return merged;
}
