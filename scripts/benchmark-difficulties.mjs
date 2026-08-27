import { writeFile } from "node:fs/promises";
import { runDifficultyBenchmark } from "../src/benchmark-core.js";

const runs = Number(process.argv[2] ?? 20);
const outputPath = process.argv[3] ?? "benchmark-results/node-difficulties-c.json";
const result = await runDifficultyBenchmark({
  runs,
  filters: ["C"],
  maxAttempts: 2_000,
  yieldEvery: 0,
  environment: { runtime: `Node ${process.version}`, userAgent: null },
  onProgress: ({ completed, total, mineCount, scenario }) => {
    if (completed % Math.max(1, runs) === 0) {
      process.stdout.write(`\r${completed}/${total} (${mineCount} mines, ${scenario})`);
    }
  },
});

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`\nSaved ${outputPath}\n`);
for (const mineCount of result.metadata.mineCounts) {
  const metrics = result.byMineCount[mineCount].overall.C;
  console.log(`${mineCount} mines`, {
    adoptionRate: metrics.adoptionRate,
    averageAttempts: metrics.averageAttempts,
    timingMs: metrics.timingMs,
    rounds3: metrics.inference.three.rounds,
    rounds4: metrics.inference.four.rounds,
  });
}
