import type { Profile } from "../config.js";

/** Is this title plausibly a software engineering / development role?
 *  See profile.yaml's roleFilter comment for the two-tier rule this implements. */
export function isSoftwareRoleTitle(title: string, roleFilter: Profile["roleFilter"]): boolean {
  const t = title.toLowerCase();

  if (roleFilter.titleMustMatchAny.some((phrase) => t.includes(phrase.toLowerCase()))) {
    return true;
  }

  if (t.includes("engineer")) {
    return roleFilter.engineerQualifiers.some((q) => t.includes(q.toLowerCase()));
  }

  return false;
}
