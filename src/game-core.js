export const GRID_SIZE = 9;

export const COLORS = [
  { id: "red", label: "赤", hex: "#d64252" },
  { id: "blue", label: "青", hex: "#2d65d8" },
  { id: "green", label: "緑", hex: "#17845a" },
  { id: "yellow", label: "黄", hex: "#a86f00" },
];

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function hashSeed(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function createEmptyBoard(colorCount = 4, mineCount = 25, seed = "") {
  return {
    colorCount,
    mineCount,
    seed,
    generated: false,
    firstClick: null,
    cells: Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, col) => ({
        row,
        col,
        state: "hidden",
        mineColor: null,
        adjacentCounts: Array(colorCount).fill(0),
      })),
    ),
  };
}

export function getAdjacentCells(board, row, col) {
  return DIRECTIONS
    .map(([rowOffset, colOffset]) => [row + rowOffset, col + colOffset])
    .filter(([nextRow, nextCol]) =>
      nextRow >= 0 && nextRow < GRID_SIZE && nextCol >= 0 && nextCol < GRID_SIZE,
    )
    .map(([nextRow, nextCol]) => board.cells[nextRow][nextCol]);
}

export function getFirstClickExclusions(row, col) {
  const excluded = new Set();
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < GRID_SIZE && nextCol >= 0 && nextCol < GRID_SIZE) {
        excluded.add(nextRow * GRID_SIZE + nextCol);
      }
    }
  }
  return excluded;
}

export function recomputeAdjacentCounts(board) {
  for (const row of board.cells) {
    for (const cell of row) {
      const counts = Array(board.colorCount).fill(0);
      for (const adjacent of getAdjacentCells(board, cell.row, cell.col)) {
        if (adjacent.mineColor !== null) counts[adjacent.mineColor] += 1;
      }
      cell.adjacentCounts = counts;
    }
  }
  return board;
}

export function generateBoard({ seed, mineCount, colorCount, firstRow, firstCol }) {
  if (![3, 4].includes(colorCount)) throw new Error("colorCount must be 3 or 4");
  if (mineCount < 1 || mineCount > 40) throw new Error("mineCount must be between 1 and 40");

  const board = createEmptyBoard(colorCount, mineCount, seed);
  board.generated = true;
  board.firstClick = { row: firstRow, col: firstCol };

  const excluded = getFirstClickExclusions(firstRow, firstCol);
  const candidates = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index)
    .filter((index) => !excluded.has(index));

  // 色数や爆弾数を変えても比較しやすいよう、位置の並びはSeedと初手だけで決める。
  const positionOrder = shuffle(candidates, createRandom(`${seed}|position|${firstRow},${firstCol}`));
  const minePositions = positionOrder.slice(0, mineCount);

  // 各色の個数差が最大1になる袋を作ってから、Seedで順番を混ぜる。
  const colorBag = Array.from({ length: mineCount }, (_, index) => index % colorCount);
  const colorOrder = shuffle(
    colorBag,
    createRandom(`${seed}|color|${colorCount}|${mineCount}|${firstRow},${firstCol}`),
  );

  minePositions.forEach((position, index) => {
    const row = Math.floor(position / GRID_SIZE);
    const col = position % GRID_SIZE;
    board.cells[row][col].mineColor = colorOrder[index];
  });

  return recomputeAdjacentCounts(board);
}

export function totalAdjacent(cell) {
  return cell.adjacentCounts.reduce((sum, count) => sum + count, 0);
}

export function revealCell(board, row, col) {
  const cell = board.cells[row][col];
  if (cell.state !== "hidden") return { type: "noop", cells: [] };

  if (cell.mineColor !== null) {
    cell.state = "exploded";
    return { type: "mine", cells: [cell] };
  }

  const revealed = [];
  const queue = [cell];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.row},${current.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (current.state !== "hidden" || current.mineColor !== null) continue;
    current.state = "revealed";
    revealed.push(current);

    if (totalAdjacent(current) === 0) {
      queue.push(...getAdjacentCells(board, current.row, current.col));
    }
  }

  return { type: "reveal", cells: revealed };
}

export function toggleFlag(board, row, col) {
  const cell = board.cells[row][col];
  if (cell.state === "hidden") cell.state = "flagged";
  else if (cell.state === "flagged") cell.state = "hidden";
}

export function checkWin(board) {
  return board.cells.flat().every((cell) => cell.mineColor !== null || cell.state === "revealed");
}

export function countFlags(board) {
  return board.cells.flat().filter((cell) => cell.state === "flagged").length;
}

export function revealedSafeCount(board) {
  return board.cells.flat().filter((cell) => cell.mineColor === null && cell.state === "revealed").length;
}

export function progressPercent(board) {
  const safeCount = GRID_SIZE * GRID_SIZE - board.mineCount;
  return safeCount > 0 ? Math.round((revealedSafeCount(board) / safeCount) * 100) : 0;
}

export function minePositions(board) {
  return board.cells.flat()
    .filter((cell) => cell.mineColor !== null)
    .map((cell) => cell.row * GRID_SIZE + cell.col)
    .sort((left, right) => left - right);
}
