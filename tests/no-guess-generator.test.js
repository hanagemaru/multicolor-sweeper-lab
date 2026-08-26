import test from "node:test";
import assert from "node:assert/strict";
import { minePositions } from "../src/game-core.js";
import {
  attemptSeed,
  evaluateCandidate,
  generateNoGuess,
} from "../src/no-guess-generator.js";

test("attempt indexを含むSeedは決定論的", () => {
  assert.equal(attemptSeed("daily", 12), "daily|attempt:12");
  assert.equal(attemptSeed("daily", 12), attemptSeed("daily", 12));
  assert.notEqual(attemptSeed("daily", 11), attemptSeed("daily", 12));
});

test("同一候補の3色・4色は爆弾位置が共通", () => {
  const result = evaluateCandidate({ baseSeed: "positions", attempt: 3, firstRow: 4, firstCol: 4 });
  assert.deepEqual(minePositions(result.board3), minePositions(result.board4));
});

test("同一条件の生成結果は毎回同じ", () => {
  const options = {
    baseSeed: "reproducible-generation",
    filter: "B",
    maxAttempts: 500,
    firstRow: 0,
    firstCol: 4,
    includeTrace: false,
  };
  const first = generateNoGuess(options);
  const second = generateNoGuess(options);
  assert.equal(first.failed, undefined);
  assert.equal(first.seed, second.seed);
  assert.equal(first.attempt, second.attempt);
  assert.equal(first.attempts, second.attempts);
  assert.deepEqual(first.flags, second.flags);
});

test("条件A〜Dは段階的に厳しくなる", () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = evaluateCandidate({ baseSeed: "filter-nesting", attempt, firstRow: 4, firstCol: 4 });
    if (result.flags.D) assert.equal(result.flags.C, true);
    if (result.flags.C) assert.equal(result.flags.B, true);
    if (result.flags.B) assert.equal(result.flags.A, true);
  }
});

