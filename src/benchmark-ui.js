const runButton = document.querySelector("#run-benchmark");
const runsInput = document.querySelector("#runs");
const status = document.querySelector("#benchmark-status");
const output = document.querySelector("#benchmark-output");

let worker = null;

function format(value, digits = 2) {
  return value === null ? "—" : Number(value).toFixed(digits);
}

function render(result) {
  const rows = Object.entries(result.overall).map(([filter, metrics]) => `
    <tr>
      <th>${filter}</th>
      <td>${format(metrics.adoptionRate * 100)}%</td>
      <td>${format(metrics.averageAttempts)}</td>
      <td>${format(metrics.timingMs.p50)} / ${format(metrics.timingMs.p95)} / ${format(metrics.timingMs.worst)} ms</td>
      <td>${format(metrics.inference.three.rounds)} / ${format(metrics.inference.four.rounds)}</td>
      <td>${format(metrics.inference.three.subsetDifferenceUses)} / ${format(metrics.inference.four.subsetDifferenceUses)}</td>
    </tr>
  `).join("");
  output.innerHTML = `
    <table>
      <thead><tr><th>条件</th><th>採用率</th><th>平均試行</th><th>p50 / p95 / worst</th><th>round 3/4</th><th>subset 3/4</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <details><summary>JSON</summary><pre>${JSON.stringify(result, null, 2)}</pre></details>
  `;
}

runButton.addEventListener("click", () => {
  worker?.terminate();
  worker = new Worker("./src/generator-worker.js", { type: "module" });
  const requestId = crypto.randomUUID();
  runButton.disabled = true;
  output.replaceChildren();
  status.textContent = "Web Workerで測定中…";
  worker.addEventListener("message", (event) => {
    if (event.data.requestId !== requestId) return;
    if (event.data.type === "progress") {
      const { completed, total, filter, scenario } = event.data.progress;
      status.textContent = `${completed} / ${total}（条件${filter}・${scenario}）`;
    } else if (event.data.type === "benchmark-complete") {
      status.textContent = "完了。測定中もUIはWorkerから分離されています。";
      runButton.disabled = false;
      render(event.data.result);
      window.__BENCHMARK_RESULT__ = event.data.result;
      worker.terminate();
    } else if (event.data.type === "error") {
      status.textContent = `エラー: ${event.data.message}`;
      runButton.disabled = false;
      worker.terminate();
    }
  });
  worker.postMessage({
    type: "benchmark",
    requestId,
    options: { runs: Number(runsInput.value), maxAttempts: 2_000 },
  });
});

