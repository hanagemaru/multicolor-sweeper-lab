import test from "node:test";
import assert from "node:assert/strict";
import {
  GRID_SIZE,
  checkWin,
  countFlags,
  createEmptyBoard,
  generateBoard,
  getFirstClickExclusions,
  minePositions,
  recomputeAdjacentCounts,
  revealCell,
  toggleFlag,
} from "../src/game-core.js";

test("同じSeed・初手なら同じ盤面になる", () => {
  const options = { seed: "SAME-SEED", mineCount: 25, colorCount: 4, firstRow: 4, firstCol: 4 };
  assert.deepEqual(generateBoard(options), generateBoard(options));
});

test("3色と4色で爆弾の位置は共通になる", () => {
  const common = { seed: "COMPARE", mineCount: 30, firstRow: 2, firstCol: 6 };
  const threeColors = generateBoard({ ...common, colorCount: 3 });
  const fourColors = generateBoard({ ...common, colorCount: 4 });
  assert.deepEqual(minePositions(threeColors), minePositions(fourColors));
});

test("爆弾数を増やすと同じSeedの配置に追加される", () => {
  const common = { seed: "DENSITY", colorCount: 4, firstRow: 4, firstCol: 4 };
  const low = new Set(minePositions(generateBoard({ ...common, mineCount: 15 })));
  const high = new Set(minePositions(generateBoard({ ...common, mineCount: 40 })));
  assert.equal([...low].every((position) => high.has(position)), true);
});

test("初手と周囲8マスには爆弾がない", () => {
  const board = generateBoard({ seed: "SAFE", mineCount: 40, colorCount: 4, firstRow: 4, firstCol: 4 });
  const excluded = getFirstClickExclusions(4, 4);
  for (const position of excluded) {
    const row = Math.floor(position / GRID_SIZE);
    const col = position % GRID_SIZE;
    assert.equal(board.cells[row][col].mineColor, null);
  }
});

test("各色の爆弾数は最大1個差で均等になる", () => {
  for (const colorCount of [3, 4]) {
    const board = generateBoard({ seed: "BALANCED", mineCount: 25, colorCount, firstRow: 0, firstCol: 0 });
    const counts = Array(colorCount).fill(0);
    for (const cell of board.cells.flat()) {
      if (cell.mineColor !== null) counts[cell.mineColor] += 1;
    }
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  }
});

test("色別の隣接数を正しく数える", () => {
  const board = createEmptyBoard(4, 4, "manual");
  board.cells[0][0].mineColor = 0;
  board.cells[0][1].mineColor = 1;
  board.cells[1][0].mineColor = 2;
  board.cells[1][1].mineColor = 3;
  recomputeAdjacentCounts(board);
  assert.deepEqual(board.cells[2][2].adjacentCounts, [0, 0, 0, 1]);
  assert.deepEqual(board.cells[0][2].adjacentCounts, [0, 1, 0, 1]);
});

test("0マスの連鎖開放は旗を開かない", () => {
  const board = createEmptyBoard(3, 1, "chain");
  board.generated = true;
  board.cells[8][8].mineColor = 0;
  recomputeAdjacentCounts(board);
  toggleFlag(board, 4, 4);
  const result = revealCell(board, 0, 0);
  assert.equal(result.type, "reveal");
  assert.equal(board.cells[4][4].state, "flagged");
  assert.equal(countFlags(board), 1);
});

test("安全マスをすべて開くと勝利になる", () => {
  const board = createEmptyBoard(3, 1, "win");
  board.generated = true;
  board.cells[8][8].mineColor = 0;
  recomputeAdjacentCounts(board);
  revealCell(board, 0, 0);
  assert.equal(checkWin(board), true);
});
