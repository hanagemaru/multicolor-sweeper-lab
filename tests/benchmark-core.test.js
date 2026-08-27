import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_DIFFICULTY_MINE_COUNTS,
  runDifficultyBenchmark,
} from "../src/benchmark-core.js";

test("製品候補の15/20/25爆弾を条件Cで一括測定できる", async () => {
  assert.deepEqual(PRODUCT_DIFFICULTY_MINE_COUNTS, [15, 20, 25]);

  const progress = [];
  const result = await runDifficultyBenchmark({
    mineCounts: [15, 25],
    filters: ["C"],
    runs: 1,
    scenarios: ["center"],
    suiteSeed: "suite-0",
    maxAttempts: 100,
    yieldEvery: 0,
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(result.metadata.mineCounts, [15, 25]);
  assert.equal(progress.length, 2);
  assert.deepEqual(progress.map(({ completed, total, mineCount }) => ({ completed, total, mineCount })), [
    { completed: 1, total: 2, mineCount: 15 },
    { completed: 2, total: 2, mineCount: 25 },
  ]);

  for (const mineCount of [15, 25]) {
    const benchmark = result.byMineCount[mineCount];
    assert.equal(benchmark.metadata.mineCount, mineCount);
    assert.equal(benchmark.overall.C.successes, 1);
    assert.equal(benchmark.rows[0].filter, "C");
  }
});
