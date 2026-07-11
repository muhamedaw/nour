import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeBill } from "../lib/billing";
import type { AreaConfig, GroupSession } from "../lib/types";

describe("computeBill", () => {
  const baseSession: GroupSession = {
    id: "s1",
    area: "snooker",
    tableNumber: 1,
    openedAt: "2026-07-12T10:00:00.000Z",
    status: "open",
    items: [
      { productId: "p1", name: "Coffee", price: 2.5, qty: 2 },
      { productId: "p2", name: "Tea", price: 2, qty: 1 },
    ],
  };

  const cardsArea: AreaConfig = {
    area: "cards",
    label: "Cards",
    tableCount: 6,
    hourlyRate: null,
  };

  const snookerArea: AreaConfig = {
    area: "snooker",
    label: "Snooker",
    tableCount: 15,
    hourlyRate: 10,
  };

  it("returns timeCost=0 for an area with no hourlyRate", () => {
    const closedAt = new Date("2026-07-12T11:30:00.000Z");
    const result = computeBill(baseSession, cardsArea, closedAt);

    assert.equal(result.productsTotal, 7); // 2 * 2.5 + 1 * 2
    assert.equal(result.elapsedMinutes, 90);
    assert.equal(result.timeCost, 0);
    assert.equal(result.total, 7);
  });

  it("computes correct timeCost for an area with hourlyRate (1.5 hours)", () => {
    const closedAt = new Date("2026-07-12T11:30:00.000Z");
    const result = computeBill(baseSession, snookerArea, closedAt);

    assert.equal(result.productsTotal, 7);
    assert.equal(result.elapsedMinutes, 90);
    assert.equal(result.timeCost, 15); // (90 / 60) * 10
    assert.equal(result.total, 22);
  });

  it("defaults closedAt to now when not provided", () => {
    const result = computeBill(baseSession, snookerArea);

    assert.ok(result.elapsedMinutes >= 0);
    assert.equal(result.productsTotal, 7);
    assert.ok(typeof result.total === "number");
  });

  it("handles zero elapsed time gracefully", () => {
    const closedAt = new Date("2026-07-12T10:00:00.000Z");
    const result = computeBill(baseSession, snookerArea, closedAt);

    assert.equal(result.elapsedMinutes, 0);
    assert.equal(result.timeCost, 0);
    assert.equal(result.total, 7);
  });

  it("handles empty items array", () => {
    const session: GroupSession = { ...baseSession, items: [] };
    const closedAt = new Date("2026-07-12T11:00:00.000Z");
    const result = computeBill(session, snookerArea, closedAt);

    assert.equal(result.productsTotal, 0);
    assert.equal(result.elapsedMinutes, 60);
    assert.equal(result.timeCost, 10);
    assert.equal(result.total, 10);
  });
});
