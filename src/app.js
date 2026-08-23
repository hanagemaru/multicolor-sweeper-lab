import {
  COLORS,
  GRID_SIZE,
  checkWin,
  countFlags,
  createEmptyBoard,
  generateBoard,
  progressPercent,
  revealCell,
  toggleFlag,
} from "./game-core.js";

const RESULT_LABELS = {
  "logical-clear": "論理クリア",
  "guessed-clear": "推測クリア",
  stuck: "論理で詰み",
  stopped: "中断",
};

const STORAGE_KEY = "multicolor-sweeper-lab-history-v1";

const elements = {
  board: document.querySelector("#board"),
  colorControls: document.querySelector("#color-count-control"),
  mineControls: document.querySelector("#mine-count-control"),
  inputModeControls: document.querySelector("#input-mode-control"),
  showZero: document.querySelector("#show-zero"),
  seedInput: document.querySelector("#seed-input"),
  applySeed: document.querySelector("#apply-seed"),
  randomSeed: document.querySelector("#random-seed"),
  restart: document.querySelector("#restart-game"),
  fresh: document.querySelector("#fresh-game"),
  status: document.querySelector("#game-status"),
  flagCount: document.querySelector("#flag-count"),
  elapsed: document.querySelector("#elapsed-time"),
  progress: document.querySelector("#progress-value"),
  legend: document.querySelector("#color-legend"),
  recordMessage: document.querySelector("#record-message"),
  recordButtons: document.querySelector(".record-buttons"),
  historyEmpty: document.querySelector("#history-empty"),
  historyTable: document.querySelector("#history-table"),
  historyBody: document.querySelector("#history-body"),
  exportCsv: document.querySelector("#export-csv"),
};

const state = {
  colorCount: 4,
  mineCount: 25,
  showZero: false,
  seed: createSeed(),
  inputMode: "reveal",
  board: null,
  phase: "ready",
  startedAt: null,
  finishedAt: null,
  elapsedSeconds: 0,
  moves: 0,
  timerId: null,
};

function createSeed() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.floor(Math.random() * 0xffffff).toString(36).toUpperCase().padStart(5, "0");
  return `${time}-${random}`;
}

function resetPendingBoard() {
  stopTimer();
  state.board = createEmptyBoard(state.colorCount, state.mineCount, state.seed);
  state.phase = "ready";
  state.startedAt = null;
  state.finishedAt = null;
  state.elapsedSeconds = 0;
  state.moves = 0;
  elements.recordMessage.textContent = "";
  render();
}

function startExactBoard(firstClick) {
  stopTimer();
  state.board = generateBoard({
    seed: state.seed,
    mineCount: state.mineCount,
    colorCount: state.colorCount,
    firstRow: firstClick.row,
    firstCol: firstClick.col,
  });
  state.phase = "playing";
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.elapsedSeconds = 0;
  state.moves = 1;
  revealCell(state.board, firstClick.row, firstClick.col);
  startTimer();
  render();
}

function startFromFirstClick(row, col) {
  const flagged = state.board.cells.flat()
    .filter((cell) => cell.state === "flagged")
    .map((cell) => ({ row: cell.row, col: cell.col }));

  state.board = generateBoard({
    seed: state.seed,
    mineCount: state.mineCount,
    colorCount: state.colorCount,
    firstRow: row,
    firstCol: col,
  });
  for (const position of flagged) {
    state.board.cells[position.row][position.col].state = "flagged";
  }

  state.phase = "playing";
  state.startedAt = Date.now();
  state.moves = 1;
  revealCell(state.board, row, col);
  startTimer();
}

function restartComparableBoard() {
  if (state.board.generated && state.board.firstClick) {
    startExactBoard(state.board.firstClick);
  } else {
    resetPendingBoard();
  }
}

function updateCondition(nextCondition) {
  const firstClick = state.board?.generated ? state.board.firstClick : null;
  Object.assign(state, nextCondition);
  elements.seedInput.value = state.seed;
  syncActiveControls();
  if (firstClick) startExactBoard(firstClick);
  else resetPendingBoard();
}

function handleReveal(row, col) {
  if (["lost", "won"].includes(state.phase)) return;
  const target = state.board.cells[row][col];
  if (target.state !== "hidden") return;

  if (!state.board.generated) {
    startFromFirstClick(row, col);
  } else {
    state.moves += 1;
    const result = revealCell(state.board, row, col);
    if (result.type === "mine") finishGame("lost");
    else if (checkWin(state.board)) finishGame("won");
  }
  render();
}

function handleFlag(row, col) {
  if (["lost", "won"].includes(state.phase)) return;
  toggleFlag(state.board, row, col);
  state.moves += 1;
  render();
}

function finishGame(phase) {
  state.phase = phase;
  state.finishedAt = Date.now();
  updateElapsed();
  stopTimer();
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    updateElapsed();
    renderStatus();
  }, 1000);
}

function stopTimer() {
  if (state.timerId !== null) window.clearInterval(state.timerId);
  state.timerId = null;
}

function updateElapsed() {
  if (!state.startedAt) return;
  const end = state.finishedAt || Date.now();
  state.elapsedSeconds = Math.max(0, Math.floor((end - state.startedAt) / 1000));
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function render() {
  renderBoard();
  renderStatus();
  renderLegend();
  syncActiveControls();
}

function renderBoard() {
  const fragment = document.createDocumentFragment();
  const gameEnded = ["lost", "won"].includes(state.phase);

  for (const row of state.board.cells) {
    for (const cell of row) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.state}`;
      button.dataset.row = String(cell.row);
      button.dataset.col = String(cell.col);
      button.setAttribute("role", "gridcell");

      const showMine = cell.mineColor !== null && (gameEnded || cell.state === "exploded");
      if (showMine) {
        button.classList.add("mine", `mine-${COLORS[cell.mineColor].id}`);
        button.innerHTML = `<span class="mine-mark" aria-hidden="true">●</span>`;
        button.setAttribute("aria-label", `${cell.row + 1}行${cell.col + 1}列、${COLORS[cell.mineColor].label}爆弾`);
      } else if (cell.state === "flagged") {
        button.innerHTML = '<span class="flag-mark" aria-hidden="true">⚑</span>';
        button.setAttribute("aria-label", `${cell.row + 1}行${cell.col + 1}列、旗`);
      } else if (cell.state === "revealed") {
        const clue = document.createElement("span");
        clue.className = "clue-grid";
        const labels = [];
        for (let colorIndex = 0; colorIndex < 4; colorIndex += 1) {
          const value = cell.adjacentCounts[colorIndex];
          const number = document.createElement("span");
          number.className = colorIndex < state.colorCount ? `clue ${COLORS[colorIndex].id}` : "clue unused";
          if (colorIndex < state.colorCount && (state.showZero || value > 0)) number.textContent = String(value);
          clue.append(number);
          if (colorIndex < state.colorCount) labels.push(`${COLORS[colorIndex].label}${value}`);
        }
        button.append(clue);
        button.setAttribute("aria-label", `${cell.row + 1}行${cell.col + 1}列、${labels.join("、")}`);
      } else {
        button.setAttribute("aria-label", `${cell.row + 1}行${cell.col + 1}列、未開封`);
      }

      fragment.append(button);
    }
  }

  elements.board.replaceChildren(fragment);
}

function renderStatus() {
  const statusText = {
    ready: "最初のマスを選んでください",
    playing: "プレイ中",
    won: "クリア！ 結果を記録できます",
    lost: "爆弾でした。同じ盤面で再挑戦できます",
  }[state.phase];
  elements.status.textContent = statusText;
  elements.flagCount.textContent = `${countFlags(state.board)} / ${state.mineCount}`;
  elements.elapsed.textContent = formatTime(state.elapsedSeconds);
  elements.progress.textContent = `${progressPercent(state.board)}%`;
}

function renderLegend() {
  const positions = ["左上", "右上", "左下", "右下"];
  elements.legend.replaceChildren(
    ...COLORS.slice(0, state.colorCount).map((color, index) => {
      const item = document.createElement("span");
      item.innerHTML = `<i style="--legend-color:${color.hex}"></i>${positions[index]}：${color.label}`;
      return item;
    }),
  );
}

function syncActiveControls() {
  for (const button of elements.colorControls.querySelectorAll("button")) {
    button.classList.toggle("is-active", Number(button.dataset.colors) === state.colorCount);
  }
  for (const button of elements.mineControls.querySelectorAll("button")) {
    button.classList.toggle("is-active", Number(button.dataset.mines) === state.mineCount);
  }
  for (const button of elements.inputModeControls.querySelectorAll("button")) {
    button.classList.toggle("is-active", button.dataset.mode === state.inputMode);
  }
}

function readHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveResult(result) {
  updateElapsed();
  const record = {
    createdAt: new Date().toISOString(),
    colorCount: state.colorCount,
    mineCount: state.mineCount,
    seed: state.seed,
    firstClick: state.board.firstClick ? `${state.board.firstClick.row + 1},${state.board.firstClick.col + 1}` : "",
    result,
    progress: progressPercent(state.board),
    elapsedSeconds: state.elapsedSeconds,
    moves: state.moves,
  };
  const history = [record, ...readHistory()].slice(0, 100);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  elements.recordMessage.textContent = `${state.colorCount}色・爆弾${state.mineCount}個を「${RESULT_LABELS[result]}」として記録しました。`;
  renderHistory();
}

function renderHistory() {
  const history = readHistory();
  elements.historyEmpty.hidden = history.length > 0;
  elements.historyTable.hidden = history.length === 0;
  elements.historyBody.replaceChildren(
    ...history.slice(0, 8).map((record) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${record.colorCount}色 / ${record.mineCount}個</td><td>${RESULT_LABELS[record.result] || record.result}</td><td>${record.progress}%</td>`;
      return row;
    }),
  );
}

function escapeCsv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportHistory() {
  const history = readHistory();
  if (history.length === 0) {
    elements.recordMessage.textContent = "保存できる記録がまだありません。";
    return;
  }
  const headers = ["日時", "色数", "爆弾数", "Seed", "初手(行,列)", "結果", "進行率", "秒数", "操作数"];
  const rows = history.map((record) => [
    record.createdAt,
    record.colorCount,
    record.mineCount,
    record.seed,
    record.firstClick,
    RESULT_LABELS[record.result] || record.result,
    record.progress,
    record.elapsedSeconds,
    record.moves,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "multicolor-sweeper-results.csv";
  link.click();
  URL.revokeObjectURL(url);
}

elements.colorControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-colors]");
  if (button) updateCondition({ colorCount: Number(button.dataset.colors) });
});

elements.mineControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mines]");
  if (button) updateCondition({ mineCount: Number(button.dataset.mines) });
});

elements.inputModeControls.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-mode]");
  if (!button) return;
  state.inputMode = button.dataset.mode;
  syncActiveControls();
});

elements.showZero.addEventListener("change", () => {
  state.showZero = elements.showZero.checked;
  renderBoard();
});

elements.applySeed.addEventListener("click", () => {
  const seed = elements.seedInput.value.trim();
  if (!seed) {
    elements.seedInput.focus();
    return;
  }
  updateCondition({ seed });
});

elements.randomSeed.addEventListener("click", () => updateCondition({ seed: createSeed() }));
elements.fresh.addEventListener("click", () => updateCondition({ seed: createSeed() }));
elements.restart.addEventListener("click", restartComparableBoard);

elements.board.addEventListener("click", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell || suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  if (state.inputMode === "flag") handleFlag(row, col);
  else handleReveal(row, col);
});

elements.board.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  handleFlag(Number(cell.dataset.row), Number(cell.dataset.col));
});

let longPressTimer = null;
let suppressNextClick = false;

elements.board.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  longPressTimer = window.setTimeout(() => {
    suppressNextClick = true;
    handleFlag(Number(cell.dataset.row), Number(cell.dataset.col));
    if (navigator.vibrate) navigator.vibrate(25);
  }, 480);
});

for (const eventName of ["pointerup", "pointercancel", "pointerleave"]) {
  elements.board.addEventListener(eventName, () => {
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = null;
  });
}

elements.recordButtons.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-result]");
  if (button) saveResult(button.dataset.result);
});

elements.exportCsv.addEventListener("click", exportHistory);

elements.seedInput.value = state.seed;
resetPendingBoard();
renderHistory();
