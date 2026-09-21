import { beforeEach, describe, expect, it } from "vitest";
import { forgetStoredIdentity } from "../../src/app/forgetStoredIdentity.ts";

describe("forgetting a stored identity", () => {
  beforeEach(() => window.localStorage.clear());

  it("removes the name and club older versions saved", () => {
    window.localStorage.setItem("startvind-editor-name", "Edvin Buregren");
    window.localStorage.setItem("startvind-editor-club", "Club Parapente Syd");

    forgetStoredIdentity(window.localStorage);

    expect(window.localStorage.getItem("startvind-editor-name")).toBeNull();
    expect(window.localStorage.getItem("startvind-editor-club")).toBeNull();
  });

  it("leaves everything else alone", () => {
    // The admin flag and any other preference are none of its business.
    window.localStorage.setItem("startvind-admin", "1");
    forgetStoredIdentity(window.localStorage);
    expect(window.localStorage.getItem("startvind-admin")).toBe("1");
  });

  it("does not throw where storage is unavailable", () => {
    // Private windows and blocked site data throw on access rather than
    // returning null.
    const hostile = {
      removeItem() {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => forgetStoredIdentity(hostile)).not.toThrow();
    expect(() => forgetStoredIdentity(undefined)).not.toThrow();
  });
});
