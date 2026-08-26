import { GRID_SIZE, getFirstClickExclusions, totalAdjacent } from "./game-core.js";

const SAFE = 1;

function colorBit(color) {
  return 1 << (color + 1);
}

function mineMask(colorCount) {
  return ((1 << (colorCount + 1)) - 1) & ~SAFE;
}

function cellIndex(row, col) {
  return row * GRID_SIZE + col;
}

function coordinates(index) {
  return { row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE };
}

function adjacentIndices(index) {
  const { row, col } = coordinates(index);
  const result = [];
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) continue;
      const nextRow = row + rowOffset;
      const nextCol = col + colOffset;
      if (nextRow >= 0 && nextRow < GRID_SIZE && nextCol >= 0 && nextCol < GRID_SIZE) {
        result.push(cellIndex(nextRow, nextCol));
      }
    }
  }
  return result;
}

function isSingleton(mask) {
  return mask !== 0 && (mask & (mask - 1)) === 0;
}

function stateLabel(mask, colorCount) {
  if (mask === SAFE) return "safe";
  for (let color = 0; color < colorCount; color += 1) {
    if (mask === colorBit(color)) return ["red", "blue", "green", "yellow"][color];
  }
  return "unknown";
}

function clueValues(board, index, mode) {
  const cell = board.cells.flat()[index];
  return mode === "mono" ? [totalAdjacent(cell)] : [...cell.adjacentCounts];
}

export function createVisibleState({ colorCount, mineCount }) {
  const allStates = SAFE | mineMask(colorCount);
  return {
    colorCount,
    mineCount,
    domains: Array(GRID_SIZE * GRID_SIZE).fill(allStates),
    clues: Array(GRID_SIZE * GRID_SIZE).fill(null),
  };
}

function revealFromBoard(board, visible, startIndices, mode) {
  const queue = [...startIndices];
  const visited = new Set();
  const revealed = [];

  while (queue.length > 0) {
    const index = queue.shift();
    if (visited.has(index)) continue;
    visited.add(index);
    const cell = board.cells.flat()[index];
    if (cell.mineColor !== null) throw new Error(`Solver attempted to reveal a mine at ${index}`);
    if (visible.clues[index] !== null) continue;

    const clue = clueValues(board, index, mode);
    visible.domains[index] = SAFE;
    visible.clues[index] = clue;
    revealed.push({ ...coordinates(index), clue });
    if (clue.reduce((sum, value) => sum + value, 0) === 0) {
      queue.push(...adjacentIndices(index));
    }
  }
  return revealed;
}

function constraintKey(constraint) {
  return `${constraint.predicate}:${constraint.cells.join(",")}:${constraint.target}`;
}

function makeConstraint(visible, indices, predicate, target, metadata) {
  const color = predicate.startsWith("color:") ? Number(predicate.slice(6)) : null;
  let fixed = 0;
  const cells = [];
  for (const index of indices) {
    const domain = visible.domains[index];
    if (color !== null) {
      const bit = colorBit(color);
      if (domain === bit) fixed += 1;
      else if ((domain & bit) !== 0) cells.push(index);
    } else {
      const mines = domain & mineMask(visible.colorCount);
      if ((domain & SAFE) === 0 && mines !== 0) fixed += 1;
      else if ((domain & SAFE) !== 0 && mines !== 0) cells.push(index);
    }
  }
  return { predicate, cells, target: target - fixed, ...metadata };
}

function validateConstraint(constraint) {
  if (constraint.target < 0 || constraint.target > constraint.cells.length) {
    throw new Error(`Contradictory visible constraint: ${constraintKey(constraint)}`);
  }
}

function buildConstraints(visible) {
  const constraints = [];
  for (let clueIndex = 0; clueIndex < visible.clues.length; clueIndex += 1) {
    const clue = visible.clues[clueIndex];
    if (clue === null) continue;
    const neighbors = adjacentIndices(clueIndex);
    for (let color = 0; color < visible.colorCount; color += 1) {
      const constraint = makeConstraint(visible, neighbors, `color:${color}`, clue[color], {
        kind: "local-color",
        sourceClues: [clueIndex],
      });
      validateConstraint(constraint);
      constraints.push(constraint);
    }
    const totalConstraint = makeConstraint(
      visible,
      neighbors,
      "mine",
      clue.reduce((sum, value) => sum + value, 0),
      { kind: "local-total", sourceClues: [clueIndex] },
    );
    validateConstraint(totalConstraint);
    constraints.push(totalConstraint);
  }

  const globalConstraint = makeConstraint(
    visible,
    Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => index),
    "mine",
    visible.mineCount,
    { kind: "global-total", sourceClues: [] },
  );
  validateConstraint(globalConstraint);
  constraints.push(globalConstraint);
  return constraints;
}

function isSubset(left, right) {
  if (left.length > right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function cluesAreAdjacent(left, right) {
  if (left.sourceClues.length !== 1 || right.sourceClues.length !== 1) return false;
  const a = coordinates(left.sourceClues[0]);
  const b = coordinates(right.sourceClues[0]);
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col)) <= 1;
}

function differenceConstraint(left, right, kind) {
  if (left.predicate !== right.predicate) return null;
  if (!isSubset(left.cells, right.cells) || left.cells.length === right.cells.length) return null;
  const leftSet = new Set(left.cells);
  const constraint = {
    predicate: left.predicate,
    cells: right.cells.filter((value) => !leftSet.has(value)),
    target: right.target - left.target,
    kind,
    sourceClues: [...new Set([...left.sourceClues, ...right.sourceClues])],
  };
  validateConstraint(constraint);
  // This solver does not recursively combine derived constraints. A non-extreme
  // difference cannot produce a domain change yet, so retaining it only adds work.
  if (constraint.target !== 0 && constraint.target !== constraint.cells.length) return null;
  return constraint;
}

function deriveSubsetConstraints(baseConstraints) {
  const derived = [];
  const seen = new Set();
  const localsByClue = new Map();
  const global = baseConstraints.find((constraint) => constraint.kind === "global-total");
  for (const constraint of baseConstraints) {
    if (constraint.sourceClues.length !== 1) continue;
    const clue = constraint.sourceClues[0];
    if (!localsByClue.has(clue)) localsByClue.set(clue, new Map());
    localsByClue.get(clue).set(constraint.predicate, constraint);
  }

  const append = (constraint) => {
    if (constraint === null) return;
    const key = constraintKey(constraint);
    if (!seen.has(key)) {
      seen.add(key);
      derived.push(constraint);
    }
  };

  for (const [clue, predicates] of localsByClue) {
    for (const adjacent of adjacentIndices(clue)) {
      if (adjacent <= clue || !localsByClue.has(adjacent)) continue;
      const otherPredicates = localsByClue.get(adjacent);
      for (const [predicate, left] of predicates) {
        const right = otherPredicates.get(predicate);
        if (!right || !cluesAreAdjacent(left, right)) continue;
        append(differenceConstraint(left, right, "subset-difference"));
        append(differenceConstraint(right, left, "subset-difference"));
      }
    }
    const localTotal = predicates.get("mine");
    if (global && localTotal) {
      append(differenceConstraint(localTotal, global, "global-difference"));
    }
  }
  return derived;
}

function deductionFor(constraint, index, action) {
  const predicate = constraint.predicate;
  const color = predicate.startsWith("color:") ? Number(predicate.slice(6)) : null;
  let allowedMask;
  if (predicate === "mine") {
    allowedMask = action === "force" ? null : SAFE;
  } else {
    allowedMask = action === "force" ? colorBit(color) : null;
  }
  return {
    index,
    action,
    predicate,
    allowedMask,
    rule: constraint.kind,
    evidence: {
      clues: constraint.sourceClues.map(coordinates),
      cells: constraint.cells.map(coordinates),
      target: constraint.target,
    },
  };
}

function deductionsFromConstraint(constraint) {
  if (constraint.cells.length === 0) return [];
  if (constraint.target === 0) {
    return constraint.cells.map((index) => deductionFor(constraint, index, "exclude"));
  }
  if (constraint.target === constraint.cells.length) {
    return constraint.cells.map((index) => deductionFor(constraint, index, "force"));
  }
  return [];
}

function applyDeduction(visible, deduction) {
  const before = visible.domains[deduction.index];
  let after = before;
  if (deduction.predicate === "mine") {
    after = deduction.action === "force" ? before & ~SAFE : before & SAFE;
  } else {
    const color = Number(deduction.predicate.slice(6));
    after = deduction.action === "force" ? before & colorBit(color) : before & ~colorBit(color);
  }
  if (after === 0) throw new Error(`Domain contradiction at ${deduction.index}`);
  visible.domains[deduction.index] = after;
  return before !== after;
}

export function reasonFromVisible(visible) {
  const changes = [];
  const seenChanges = new Set();
  const ruleUsage = {};
  let passes = 0;

  while (true) {
    passes += 1;
    const base = buildConstraints(visible);
    const constraints = [...base, ...deriveSubsetConstraints(base)];
    const pending = [];
    for (const constraint of constraints) {
      for (const deduction of deductionsFromConstraint(constraint)) {
        pending.push(deduction);
      }
    }
    let changed = false;
    for (const deduction of pending) {
      const before = visible.domains[deduction.index];
      if (!applyDeduction(visible, deduction)) continue;
      changed = true;
        const after = visible.domains[deduction.index];
        const key = `${deduction.index}:${before}:${after}`;
        if (!seenChanges.has(key)) {
          seenChanges.add(key);
          changes.push({
            cell: coordinates(deduction.index),
            before,
            after,
            result: stateLabel(after, visible.colorCount),
            rule: deduction.rule,
            predicate: deduction.predicate,
            evidence: deduction.evidence,
          });
          ruleUsage[deduction.rule] = (ruleUsage[deduction.rule] ?? 0) + 1;
      }
    }
    if (!changed) break;
    if (passes > GRID_SIZE * GRID_SIZE * (visible.colorCount + 1)) {
      throw new Error("Domain propagation did not converge");
    }
  }
  return { changes, passes, ruleUsage };
}

function validateDomainsAgainstBoard(board, visible) {
  for (let index = 0; index < visible.domains.length; index += 1) {
    const truth = board.cells.flat()[index].mineColor;
    const truthBit = truth === null ? SAFE : colorBit(visible.colorCount === 1 ? 0 : truth);
    if ((visible.domains[index] & truthBit) === 0) {
      throw new Error(`Unsound deduction at cell ${index}`);
    }
  }
}

function statsFromTrace(trace) {
  const stats = {
    reasoningRounds: 0,
    propagationPasses: 0,
    deductions: 0,
    safeDeductions: 0,
    mineDeductions: 0,
    revealedCells: 0,
    subsetDifferenceUses: 0,
    ruleUsage: {},
  };
  for (const step of trace) {
    stats.revealedCells += step.revealed?.length ?? 0;
    if (step.type !== "reasoning-round") continue;
    stats.reasoningRounds += 1;
    stats.propagationPasses += step.propagationPasses;
    stats.deductions += step.deductions.length;
    stats.safeDeductions += step.deductions.filter((entry) => entry.result === "safe").length;
    stats.mineDeductions += step.deductions.filter((entry) => entry.result !== "safe" && entry.result !== "unknown").length;
    for (const [rule, count] of Object.entries(step.ruleUsage)) {
      stats.ruleUsage[rule] = (stats.ruleUsage[rule] ?? 0) + count;
      if (rule === "subset-difference" || rule === "global-difference") {
        stats.subsetDifferenceUses += count;
      }
    }
  }
  return stats;
}

export function solveBoard(board, { mode = "color", includeTrace = true } = {}) {
  if (!board.generated || board.firstClick === null) throw new Error("Board must be generated with a first click");
  if (!['color', 'mono'].includes(mode)) throw new Error("mode must be color or mono");
  const solverColorCount = mode === "mono" ? 1 : board.colorCount;
  const visible = createVisibleState({ colorCount: solverColorCount, mineCount: board.mineCount });
  const firstIndex = cellIndex(board.firstClick.row, board.firstClick.col);
  const trace = [];
  const initialRevealed = revealFromBoard(board, visible, [firstIndex], mode);
  trace.push({ type: "initial-reveal", firstClick: board.firstClick, revealed: initialRevealed });

  let status = "stalled";
  let stallReason = "no-logical-move";
  for (let round = 1; round <= GRID_SIZE * GRID_SIZE; round += 1) {
    const safeBefore = visible.clues.filter((clue) => clue !== null).length;
    if (safeBefore === GRID_SIZE * GRID_SIZE - board.mineCount) {
      status = "solved";
      stallReason = null;
      break;
    }

    const reasoned = reasonFromVisible(visible);
    validateDomainsAgainstBoard(board, visible);
    const safeToReveal = [];
    for (let index = 0; index < visible.domains.length; index += 1) {
      if (visible.domains[index] === SAFE && visible.clues[index] === null) safeToReveal.push(index);
    }
    const revealed = revealFromBoard(board, visible, safeToReveal, mode);
    const step = {
      type: "reasoning-round",
      round,
      visibleBefore: safeBefore,
      deductions: reasoned.changes,
      propagationPasses: reasoned.passes,
      ruleUsage: reasoned.ruleUsage,
      revealed,
      visibleAfter: visible.clues.filter((clue) => clue !== null).length,
    };
    trace.push(step);

    if (reasoned.changes.length === 0 && revealed.length === 0) break;
    if (revealed.length === 0) {
      // All domain consequences of the current clues were already propagated. If none is
      // safe, marking more flags cannot expose new information, so play is genuinely stuck.
      break;
    }
  }

  if (visible.clues.filter((clue) => clue !== null).length === GRID_SIZE * GRID_SIZE - board.mineCount) {
    status = "solved";
    stallReason = null;
  }
  const stats = statsFromTrace(trace);
  return {
    status,
    noGuess: status === "solved",
    stallReason,
    mode,
    stats,
    trace: includeTrace ? trace : undefined,
    finalDomains: includeTrace ? [...visible.domains] : undefined,
  };
}

export function firstClickSafetyIsVisible(board) {
  const excluded = getFirstClickExclusions(board.firstClick.row, board.firstClick.col);
  return [...excluded].every((index) => board.cells.flat()[index].mineColor === null);
}
