import { generateNoGuess } from "./no-guess-generator.js";
import { runBenchmark } from "./benchmark-core.js";

self.addEventListener("message", async (event) => {
  const { type, requestId, options } = event.data;
  try {
    if (type === "generate") {
      const result = generateNoGuess(options);
      self.postMessage({ type: "generated", requestId, result });
      return;
    }
    if (type === "benchmark") {
      const result = await runBenchmark({
        ...options,
        yieldEvery: 0,
        environment: { userAgent: self.navigator.userAgent, runtime: "Web Worker" },
        onProgress: (progress) => self.postMessage({ type: "progress", requestId, progress }),
      });
      self.postMessage({ type: "benchmark-complete", requestId, result });
      return;
    }
    throw new Error(`Unknown worker request: ${type}`);
  } catch (error) {
    self.postMessage({ type: "error", requestId, message: error.message, stack: error.stack });
  }
});

