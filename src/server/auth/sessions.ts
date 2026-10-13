/**
 * Session-version helpers ("log out everywhere", D-124). Pure so they can be
 * unit-tested and imported from the edge config.
 *
 * Every JWT carries `sv` = `User.sessionVersion` at sign-in. The periodic DB
 * re-check in the jwt callback compares them: a mismatch ends the session.
 */

/** True when a token minted at `tokenVersion` is still valid for a user at `currentVersion`. */
export function sessionVersionValid(tokenVersion: unknown, currentVersion: number): boolean {
  // Tokens issued before this feature shipped carry no `sv`; treat them as version 0.
  const tv = typeof tokenVersion === "number" && Number.isFinite(tokenVersion) ? tokenVersion : 0;
  return tv === currentVersion;
}
