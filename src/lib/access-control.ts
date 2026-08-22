export const SUBSCRIBER_ONLY_ROUTE_PREFIXES = ["/document-checklists", "/unique-products", "/ae-directory"] as const;

const AUTH_PROTECTED_ROUTE_PREFIXES = [
  "/scenarios",
  "/toolkit",
  "/lenders",
  "/programs",
  ...SUBSCRIBER_ONLY_ROUTE_PREFIXES,
  "/admin",
  "/account",
] as const;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function hasSubscriberAccess(tierLevel: number | null | undefined): boolean {
  return typeof tierLevel === "number" && tierLevel > 0;
}

export function isAuthProtectedPath(pathname: string): boolean {
  return AUTH_PROTECTED_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function isSubscriberOnlyPath(pathname: string): boolean {
  return SUBSCRIBER_ONLY_ROUTE_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}
