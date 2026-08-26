import test from "node:test";
import assert from "node:assert/strict";
import { generateBoard, minePositions } from "../src/game-core.js";
import { createVisibleState, reasonFromVisible, solveBoard } from "../src/solver.js";

test("直接推論は見えているClueだけからsafeを確定する", () => {
  const visible = createVisibleState({ colorCount: 3, mineCount: 20 });
  // Center clue [0,0,0] makes all eight neighbors safe. No hidden board is supplied.
  visible.clues[40] = [0, 0, 0];
  visible.domains[40] = 1;
  const result = reasonFromVisible(visible);
  const neighborIndices = [30, 31, 32, 39, 41, 48, 49, 50];
  assert.equal(neighborIndices.every((index) => visible.domains[index] === 1), true);
  assert.ok(result.changes.length > 0);
});

test("既存の人手比較Seedを3色・4色ともNo-Guessで解ける", () => {
  for (const seed of ["set2-000050", "set2-000179", "set2-000302"]) {
    for (const colorCount of [3, 4]) {
      const board = generateBoard({ seed, mineCount: 20, colorCount, firstRow: 4, firstCol: 4 });
      const result = solveBoard(board);
      assert.equal(result.noGuess, true, `${seed}/${colorCount} colors stalled`);
      assert.equal(result.trace[0].type, "initial-reveal");
      assert.ok(result.trace.some((step) => step.type === "reasoning-round"));
    }
  }
});

test("推論トレースの各ラウンドは見えていた情報と根拠を残す", () => {
  const board = generateBoard({ seed: "set2-000050", mineCount: 20, colorCount: 4, firstRow: 4, firstCol: 4 });
  const result = solveBoard(board);
  for (const step of result.trace.filter((entry) => entry.type === "reasoning-round")) {
    assert.ok(Number.isInteger(step.visibleBefore));
    assert.ok(Number.isInteger(step.visibleAfter));
    for (const deduction of step.deductions) {
      assert.ok(deduction.rule);
      assert.ok(Array.isArray(deduction.evidence.clues));
      assert.ok(Array.isArray(deduction.evidence.cells));
      assert.ok(Number.isInteger(deduction.evidence.target));
    }
  }
});

test("多色で解けても単色化すると詰まるcolor-essential盤面を識別する", () => {
  const board = generateBoard({ seed: "set2-000050", mineCount: 20, colorCount: 3, firstRow: 4, firstCol: 4 });
  assert.equal(solveBoard(board, { mode: "color" }).noGuess, true);
  assert.equal(solveBoard(board, { mode: "mono" }).noGuess, false);
});

test("Solverの実行は盤面の爆弾配置を変更しない", () => {
  const board = generateBoard({ seed: "immutable-truth", mineCount: 20, colorCount: 4, firstRow: 0, firstCol: 0 });
  const before = minePositions(board);
  solveBoard(board);
  assert.deepEqual(minePositions(board), before);
});

test("多数Seedで確定手が正解と矛盾しない", () => {
  for (let sample = 0; sample < 100; sample += 1) {
    const colorCount = sample % 2 === 0 ? 3 : 4;
    const board = generateBoard({
      seed: `soundness-${sample}`,
      mineCount: 20,
      colorCount,
      firstRow: sample % 9,
      firstCol: Math.floor(sample / 9) % 9,
    });
    assert.doesNotThrow(() => solveBoard(board, { includeTrace: false }));
  }
});

