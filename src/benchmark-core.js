import { createRandom } from "./game-core.js";
import { generateNoGuess } from "./no-guess-generator.js";

export const CLICK_SCENARIOS = {
  center: () => ({ row: 4, col: 4 }),
  "near-center": () => ({ row: 3, col: 4 }),
  edge: () => ({ row: 0, col: 4 }),
  corner: () => ({ row: 0, col: 0 }),
  random: (run, suiteSeed) => {
    const random = createRandom(`${suiteSeed}|click|${run}`);
    return { row: Math.floor(random() * 9), col: Math.floor(random() * 9) };
  },
};

export const PRODUCT_DIFFICULTY_MINE_COUNTS = [15, 20, 25];

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function average(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resultMetrics(results) {
  const successes = results.filter((result) => !result.failed);
  const allAttempts = results.reduce((sum, result) => sum + result.attempts, 0);
  const stats = (mode, field) => successes
    .map((result) => result.results[mode]?.stats[field])
    .filter((value) => Number.isFinite(value));
  return {
    runs: results.length,
    successes: successes.length,
    failures: results.length - successes.length,
    adoptionRate: allAttempts === 0 ? 0 : successes.length / allAttempts,
    averageAttempts: average(successes.map((result) => result.attempts)),
    timingMs: {
      average: average(successes.map((result) => result.elapsedMs)),
      p50: percentile(successes.map((result) => result.elapsedMs), 0.5),
      p95: percentile(successes.map((result) => result.elapsedMs), 0.95),
      worst: successes.length ? Math.max(...successes.map((result) => result.elapsedMs)) : null,
    },
    inference: {
      three: {
        rounds: average(stats("three", "reasoningRounds")),
        deductions: average(stats("three", "deductions")),
        subsetDifferenceUses: average(stats("three", "subsetDifferenceUses")),
      },
      four: {
        rounds: average(stats("four", "reasoningRounds")),
        deductions: average(stats("four", "deductions")),
        subsetDifferenceUses: average(stats("four", "subsetDifferenceUses")),
      },
    },
  };
}

export async function runBenchmark({
  runs = 20,
  maxAttempts = 2_000,
  mineCount = 20,
  suiteSeed = "benchmark-v1",
  filters = ["A", "B", "C", "D"],
  scenarios = Object.keys(CLICK_SCENARIOS),
  yieldEvery = 1,
  onProgress = () => {},
  environment = {},
} = {}) {
  const rows = [];
  const raw = {};
  const total = filters.length * scenarios.length * runs;
  let completed = 0;

  for (const filter of filters) {
    raw[filter] = [];
    for (const scenario of scenarios) {
      const results = [];
      for (let run = 0; run < runs; run += 1) {
        const firstClick = CLICK_SCENARIOS[scenario](run, suiteSeed);
        const result = generateNoGuess({
          baseSeed: `${suiteSeed}|${filter}|${scenario}|run:${run}`,
          filter,
          maxAttempts,
          mineCount,
          firstRow: firstClick.row,
          firstCol: firstClick.col,
          includeTrace: false,
        });
        results.push(result);
        raw[filter].push(result);
        completed += 1;
        onProgress({ completed, total, mineCount, filter, scenario, run: run + 1 });
        if (yieldEvery > 0 && completed % yieldEvery === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      rows.push({ filter, scenario, ...resultMetrics(results) });
    }
  }

  const overall = Object.fromEntries(filters.map((filter) => [filter, resultMetrics(raw[filter])]));
  return {
    metadata: {
      createdAt: new Date().toISOString(),
      runsPerFilterAndScenario: runs,
      maxAttempts,
      mineCount,
      suiteSeed,
      filters,
      scenarios,
      ...environment,
    },
    overall,
    rows,
  };
}

export async function runDifficultyBenchmark({
  mineCounts = PRODUCT_DIFFICULTY_MINE_COUNTS,
  filters = ["C"],
  onProgress = () => {},
  ...options
} = {}) {
  const counts = [...mineCounts];
  if (counts.length === 0) throw new Error("mineCounts must not be empty");
  if (counts.some((mineCount) => !Number.isInteger(mineCount))) {
    throw new Error("mineCounts must contain integers");
  }

  const runs = options.runs ?? 20;
  const scenarios = options.scenarios ?? Object.keys(CLICK_SCENARIOS);
  const total = counts.length * filters.length * scenarios.length * runs;
  const byMineCount = {};
  let offset = 0;

  for (const mineCount of counts) {
    byMineCount[mineCount] = await runBenchmark({
      ...options,
      runs,
      mineCount,
      filters,
      scenarios,
      onProgress: (progress) => onProgress({
        ...progress,
        completed: offset + progress.completed,
        total,
      }),
    });
    offset += filters.length * scenarios.length * runs;
  }

  return {
    metadata: {
      createdAt: new Date().toISOString(),
      runsPerFilterAndScenario: runs,
      maxAttempts: options.maxAttempts ?? 2_000,
      mineCounts: counts,
      suiteSeed: options.suiteSeed ?? "benchmark-v1",
      filters,
      scenarios,
      ...options.environment,
    },
    byMineCount,
  };
}
