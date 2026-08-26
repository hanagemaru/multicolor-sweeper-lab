import { writeFile } from "node:fs/promises";
import { runBenchmark } from "../src/benchmark-core.js";

const runs = Number(process.argv[2] ?? 20);
const outputPath = process.argv[3] ?? "benchmark-results/node-latest.json";
const result = await runBenchmark({
  runs,
  maxAttempts: 2_000,
  yieldEvery: 0,
  environment: { runtime: `Node ${process.version}`, userAgent: null },
  onProgress: ({ completed, total }) => {
    if (completed % Math.max(1, runs) === 0) process.stdout.write(`\r${completed}/${total}`);
  },
});
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`\nSaved ${outputPath}\n`);
for (const [filter, metrics] of Object.entries(result.overall)) {
  console.log(filter, {
    adoptionRate: metrics.adoptionRate,
    averageAttempts: metrics.averageAttempts,
    timingMs: metrics.timingMs,
    rounds3: metrics.inference.three.rounds,
    rounds4: metrics.inference.four.rounds,
  });
}

