import { describe, expect, it } from "vitest";
import { hasSubscriberAccess, isAuthProtectedPath, isSubscriberOnlyPath } from "@/lib/access-control";

describe("subscriber-only route access", () => {
  it.each([
    "/document-checklists",
    "/unique-products",
    "/unique-products/jumbo-aus",
  ])("requires authentication for %s", (pathname) => {
    expect(isAuthProtectedPath(pathname)).toBe(true);
  });

  it.each([
    "/document-checklists",
    "/unique-products",
    "/unique-products/jumbo-aus",
  ])("requires active subscriber access for %s", (pathname) => {
    expect(isSubscriberOnlyPath(pathname)).toBe(true);
  });

  it("does not accidentally protect similarly named public paths", () => {
    expect(isAuthProtectedPath("/unique-products-preview")).toBe(false);
    expect(isSubscriberOnlyPath("/document-checklists-preview")).toBe(false);
  });

  it("grants subscriber access only to a positive effective tier", () => {
    expect(hasSubscriberAccess(undefined)).toBe(false);
    expect(hasSubscriberAccess(null)).toBe(false);
    expect(hasSubscriberAccess(0)).toBe(false);
    expect(hasSubscriberAccess(1)).toBe(true);
    expect(hasSubscriberAccess(3)).toBe(true);
  });
});
