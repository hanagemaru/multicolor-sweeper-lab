import { generateBoard } from "./game-core.js";
import { solveBoard } from "./solver.js";

export const FILTERS = {
  A: "both-no-guess",
  B: "color-essential",
  C: "four-colors-no-worse",
  D: "four-colors-one-round-better",
};

export function attemptSeed(baseSeed, attempt) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("attempt must be a non-negative integer");
  return `${baseSeed}|attempt:${attempt}`;
}

export function evaluateCandidate({
  baseSeed,
  attempt,
  mineCount = 20,
  firstRow,
  firstCol,
  includeTrace = false,
}) {
  const seed = attemptSeed(baseSeed, attempt);
  const common = { seed, mineCount, firstRow, firstCol };
  const board3 = generateBoard({ ...common, colorCount: 3 });
  const board4 = generateBoard({ ...common, colorCount: 4 });
  const three = solveBoard(board3, { includeTrace });
  const four = solveBoard(board4, { includeTrace });
  const bothNoGuess = three.noGuess && four.noGuess;

  let mono = null;
  if (bothNoGuess) mono = solveBoard(board3, { mode: "mono", includeTrace });
  const colorEssential = bothNoGuess && mono !== null && !mono.noGuess;
  const rounds3 = three.stats.reasoningRounds;
  const rounds4 = four.stats.reasoningRounds;

  return {
    baseSeed,
    attempt,
    seed,
    firstClick: { row: firstRow, col: firstCol },
    mineCount,
    board3,
    board4,
    results: { three, four, mono },
    flags: {
      A: bothNoGuess,
      B: colorEssential,
      C: colorEssential && rounds4 <= rounds3,
      D: colorEssential && rounds4 + 1 <= rounds3,
    },
  };
}

export function candidateSummary(candidate) {
  const summarize = (result) => result && ({
    noGuess: result.noGuess,
    status: result.status,
    stats: result.stats,
  });
  return {
    baseSeed: candidate.baseSeed,
    attempt: candidate.attempt,
    seed: candidate.seed,
    firstClick: candidate.firstClick,
    mineCount: candidate.mineCount,
    flags: candidate.flags,
    results: {
      three: summarize(candidate.results.three),
      four: summarize(candidate.results.four),
      mono: summarize(candidate.results.mono),
    },
  };
}

export function generateNoGuess({
  baseSeed,
  filter = "A",
  maxAttempts = 10_000,
  mineCount = 20,
  firstRow,
  firstCol,
  includeTrace = true,
}) {
  if (!(filter in FILTERS)) throw new Error(`Unknown filter ${filter}`);
  const startedAt = performance.now();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = evaluateCandidate({
      baseSeed,
      attempt,
      mineCount,
      firstRow,
      firstCol,
      includeTrace: false,
    });
    if (!candidate.flags[filter]) continue;
    const elapsedMs = performance.now() - startedAt;
    if (!includeTrace) return { ...candidateSummary(candidate), elapsedMs, attempts: attempt + 1 };
    const traced = evaluateCandidate({
      baseSeed,
      attempt,
      mineCount,
      firstRow,
      firstCol,
      includeTrace: true,
    });
    return { ...traced, elapsedMs, attempts: attempt + 1 };
  }
  return {
    baseSeed,
    filter,
    firstClick: { row: firstRow, col: firstCol },
    mineCount,
    attempts: maxAttempts,
    elapsedMs: performance.now() - startedAt,
    failed: true,
  };
}

