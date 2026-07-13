import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBill, computeSplit } from "../components/session/bill";
import type { SessionItem } from "../lib/types";

// ---------------------------------------------------------------------------
// computeBill — timeAdjustmentSeconds
// ---------------------------------------------------------------------------

describe("computeBill with timeAdjustmentSeconds", () => {
  const openedAt = "2026-07-13T10:00:00.000Z";
  const now = new Date("2026-07-13T11:00:00.000Z").getTime(); // 60 min elapsed
  const items: SessionItem[] = [
    { productId: "p1", name: "Coffee", price: 3, qty: 2 },
  ];

  it("positive adjustment adds to elapsed time", () => {
    const bill = computeBill(items, openedAt, now, 10, 600); // +600s = +10 min
    assert.equal(bill.elapsedMinutes, 70); // 60 + 10
    assert.equal(bill.timeCost, Math.round((70 / 60) * 10 * 100) / 100);
    assert.equal(bill.timeAdjustmentSeconds, 600);
    assert.equal(bill.productsTotal, 6);
    assert.equal(bill.total, 6 + bill.timeCost);
  });

  it("negative adjustment subtracts from elapsed time clamped at zero", () => {
    const bill = computeBill(items, openedAt, now, 10, -900); // -900s = -15 min
    // 60 - 15 = 45 min
    assert.equal(bill.elapsedMinutes, 45);
    assert.equal(bill.timeCost, Math.round((45 / 60) * 10 * 100) / 100);
    assert.equal(bill.timeAdjustmentSeconds, -900);
  });

  it("large negative adjustment clamps elapsed to zero", () => {
    const bill = computeBill(items, openedAt, now, 10, -7200); // -7200s = -2h
    // 60 - 120 = -60 → clamped to 0
    assert.equal(bill.elapsedMinutes, 0);
    assert.equal(bill.timeCost, 0);
  });

  it("zero adjustment is a no-op", () => {
    const bill = computeBill(items, openedAt, now, 10, 0);
    assert.equal(bill.elapsedMinutes, 60);
    assert.equal(bill.timeCost, Math.round((60 / 60) * 10 * 100) / 100);
    assert.equal(bill.timeAdjustmentSeconds, 0);
  });

  it("defaults timeAdjustmentSeconds to 0 when omitted", () => {
    const bill = computeBill(items, openedAt, now, 10);
    assert.equal(bill.elapsedMinutes, 60);
    assert.equal(bill.timeAdjustmentSeconds, 0);
  });
});

// ---------------------------------------------------------------------------
// computeSplit
// ---------------------------------------------------------------------------

describe("computeSplit", () => {
  const openedAt = "2026-07-13T10:00:00.000Z";
  const now = new Date("2026-07-13T11:00:00.000Z").getTime(); // 60 min, time cost = 10

  const baseItems: SessionItem[] = [
    { productId: "p1", name: "Coffee", price: 3, qty: 2 }, // 6
    { productId: "p2", name: "Tea", price: 2, qty: 1 },    // 2
  ];
  const bill = computeBill(baseItems, openedAt, now, 10);
  // productsTotal = 8, timeCost = 10, total = 18

  it("even division across playerCount", () => {
    const split = computeSplit(bill, baseItems, 2);
    assert.equal(split.playerCount, 2);
    assert.equal(split.evenPoolTotal, 18);
    assert.equal(split.perPlayerBase, 9);
    assert.equal(split.remainder, 0);
    assert.equal(split.shares.length, 2);
    assert.equal(split.shares[0].total, 9);
    assert.equal(split.shares[1].total, 9);
  });

  it("division with remainder lands on shares[0]", () => {
    // total=20 (products=10, timeCost=10), split 3 ways
    // 20/3 = 6.666... → floor to 2dp = 6.66, remainder = 0.02
    const threeWayItems: SessionItem[] = [
      { productId: "p1", name: "Coffee", price: 5, qty: 2 }, // 10
    ];
    const b = computeBill(threeWayItems, openedAt, now, 10);
    // total = 10 + 10 = 20
    const split = computeSplit(b, threeWayItems, 3);
    assert.equal(split.perPlayerBase, 6.66);
    assert.equal(split.remainder, 0.02);
    assert.equal(split.shares[0].total, 6.68);  // 6.66 + 0.02
    assert.equal(split.shares[1].total, 6.66);
    assert.equal(split.shares[2].total, 6.66);
    // sum(slices) = 20 = total
    assert.equal(Math.round(split.shares.reduce((s, sh) => s + sh.total, 0) * 100), 2000);
  });

  it("assignedPlayer items are excluded from evenPoolTotal", () => {
    const itemsWithAssignment: SessionItem[] = [
      { productId: "p1", name: "Coffee", price: 3, qty: 2, assignedPlayer: "Ahmed" }, // 6
      { productId: "p2", name: "Tea", price: 2, qty: 1 },                            // 2 → even pool
    ];
    const b = computeBill(itemsWithAssignment, openedAt, now, 10);
    // total = 6 + 2 + 10 = 18

    const split = computeSplit(b, itemsWithAssignment, 2, ["Ahmed", "Sami"]);
    assert.equal(split.individualItemsTotal, 6);  // only Coffee
    assert.equal(split.evenPoolTotal, 12);         // 18 - 6 = 12
    assert.equal(split.perPlayerBase, 6);
    assert.equal(split.shares.length, 2);

    // Ahmed: 6 (individual) + 6 (even) = 12
    assert.equal(split.shares[0].label, "Ahmed");
    assert.equal(split.shares[0].individualTotal, 6);
    assert.equal(split.shares[0].evenShare, 6);
    assert.equal(split.shares[0].total, 12);

    // Sami: 0 (individual) + 6 (even) = 6
    assert.equal(split.shares[1].label, "Sami");
    assert.equal(split.shares[1].individualTotal, 0);
    assert.equal(split.shares[1].evenShare, 6);
    assert.equal(split.shares[1].total, 6);

    assert.equal(split.shares.reduce((s, sh) => s + sh.total, 0), 18);
  });

  it("mismatched assignedPlayer name still excludes from evenPoolTotal", () => {
    const itemsWithMismatch: SessionItem[] = [
      { productId: "p1", name: "Coffee", price: 3, qty: 2, assignedPlayer: "Ghost" }, // 6, excluded
      { productId: "p2", name: "Tea", price: 2, qty: 1 },                            // 2
    ];
    const b = computeBill(itemsWithMismatch, openedAt, now, 10);
    // total = 18, individualItemsTotal = 6 (Ghost item's cost)

    const split = computeSplit(b, itemsWithMismatch, 2, ["Ahmed", "Sami"]);
    // Ghost item's cost still reduced evenPoolTotal
    assert.equal(split.individualItemsTotal, 6);
    assert.equal(split.evenPoolTotal, 12);
    // But Ghost doesn't match any label, so no share.individualTotal picks it up
    assert.equal(split.shares[0].individualTotal, 0);
    assert.equal(split.shares[1].individualTotal, 0);
    // Each gets evenShare of 6
    assert.equal(split.shares[0].total, 6);
    assert.equal(split.shares[1].total, 6);
  });

  it("falls back to default labels when playerNames is empty", () => {
    const split = computeSplit(bill, baseItems, 2);
    assert.equal(split.shares[0].label, "لاعب 1");
    assert.equal(split.shares[1].label, "لاعب 2");
  });

  it("handles playerCount of 1 gracefully", () => {
    const split = computeSplit(bill, baseItems, 1);
    assert.equal(split.playerCount, 1);
    assert.equal(split.shares.length, 1);
    assert.equal(split.shares[0].total, 18);
  });

  it("clamps playerCount to at least 1 when 0 or negative", () => {
    const splitZero = computeSplit(bill, baseItems, 0);
    assert.equal(splitZero.playerCount, 1);

    const splitNeg = computeSplit(bill, baseItems, -1);
    assert.equal(splitNeg.playerCount, 1);
  });

  it("preserves integer currency precision — sum of shares equals total exactly", () => {
    // Use a total that produces a remainder
    const awkwardItems: SessionItem[] = [
      { productId: "p1", name: "Water", price: 1, qty: 1 }, // 1
    ];
    const b = computeBill(awkwardItems, openedAt, now, 10);
    // total = 1 + 10 = 11, split 3 ways
    const split = computeSplit(b, awkwardItems, 3);
    const sumShares = split.shares.reduce((s, sh) => s + Math.round(sh.total * 100), 0);
    const expectedTotal = Math.round(b.total * 100);
    assert.equal(sumShares, expectedTotal);
  });
});
