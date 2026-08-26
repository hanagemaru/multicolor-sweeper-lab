import {
  COLORS,
  checkWin,
  countFlags,
  generateBoard,
  getAdjacentCells,
  revealCell,
  totalAdjacent,
} from "./game-core.js";
import { playtestBaseSeed } from "./compare-playtest-core.js";

const MINE_COUNT = 20;
const FIRST_ROW = 4;
const FIRST_COL = 4;
const SWIPE_THRESHOLD = 20;
const TAP_MAX = 8;
const BOARD_COUNT = 3;

const FILTER_INFO = {
  B: "3色・4色ともNo-Guessで、単色化すると論理だけでは解けない盤面です。",
  C: "条件Bに加え、Solverの推論ラウンド数が4色≦3色の盤面です。現在の製品候補です。",
  D: "条件Bに加え、4色が3色より1ラウンド以上少ない盤面です。4色優位を強めた比較用です。",
};

const FLAG_LABELS = {
  neutral: "無色旗",
  red: "赤旗",
  blue: "青旗",
  green: "緑旗",
  yellow: "黄旗",
};

const elements = {
  selectionView: document.querySelector("#selection-view"),
  prestartView: document.querySelector("#prestart-view"),
  gameView: document.querySelector("#game-view"),
  boardCards: document.querySelector("#board-cards"),
  resultsTable: document.querySelector("#results-table"),
  filterChoice: document.querySelector("#filter-choice"),
  filterDescription: document.querySelector("#filter-description"),
  setName: document.querySelector("#set-name"),
  previousSet: document.querySelector("#previous-set"),
  nextSet: document.querySelector("#next-set"),
  generationStatus: document.querySelector("#generation-status"),
  readyBoardName: document.querySelector("#ready-board-name"),
  modeChoice: document.querySelector("#mode-choice"),
  backToBoards: document.querySelector("#back-to-boards"),
  startGame: document.querySelector("#start-game"),
  gameBoardName: document.querySelector("#game-board-name"),
  gameMode: document.querySelector("#game-mode"),
  timer: document.querySelector("#timer"),
  status: document.querySelector("#game-status"),
  flagCount: document.querySelector("#flag-count"),
  feedback: document.querySelector("#gesture-feedback"),
  board: document.querySelector("#board"),
  yellowGuide: document.querySelector(".gesture-guide .yellow"),
  finishCard: document.querySelector("#finish-card"),
  finishTitle: document.querySelector("#finish-title"),
  finishDetail: document.querySelector("#finish-detail"),
  solverNote: document.querySelector("#solver-note"),
  markStuck: document.querySelector("#mark-stuck"),
  retryOtherMode: document.querySelector("#retry-other-mode"),
  chooseBoard: document.querySelector("#choose-board"),
};

const state = {
  selectedBoard: null,
  testBoards: [],
  filter: "C",
  setIndex: 0,
  loadToken: 0,
  colorCount: 3,
  board: null,
  phase: "select",
  gesture: null,
  startedAt: null,
  elapsedMs: 0,
  timerId: null,
  results: {},
};

const generatorWorker = new Worker("./src/generator-worker.js", { type: "module" });
const pendingGeneration = new Map();
let requestCounter = 0;

generatorWorker.addEventListener("message", (event) => {
  const pending = pendingGeneration.get(event.data.requestId);
  if (!pending) return;
  if (event.data.type === "generated") {
    pending.resolve(event.data.result);
    pendingGeneration.delete(event.data.requestId);
  } else if (event.data.type === "error") {
    pending.reject(new Error(event.data.message));
    pendingGeneration.delete(event.data.requestId);
  }
});

function requestBoardGeneration(options) {
  const requestId = `compare-${requestCounter += 1}`;
  return new Promise((resolve, reject) => {
    pendingGeneration.set(requestId, { resolve, reject });
    generatorWorker.postMessage({ type: "generate", requestId, options });
  });
}

function formatTime(ms) {
  const tenths = Math.max(0, Math.floor(ms / 100));
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const tenth = tenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenth}`;
}

function updateElapsed() {
  if (!state.startedAt) return;
  state.elapsedMs = Date.now() - state.startedAt;
  elements.timer.textContent = formatTime(state.elapsedMs);
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(updateElapsed, 100);
}

function stopTimer() {
  if (state.timerId !== null) window.clearInterval(state.timerId);
  state.timerId = null;
  updateElapsed();
}

function setView(name) {
  elements.selectionView.hidden = name !== "selection";
  elements.prestartView.hidden = name !== "prestart";
  elements.gameView.hidden = name !== "game";
}

function renderBoardCards() {
  elements.boardCards.replaceChildren(
    ...state.testBoards.map((testBoard, index) => {
      const card = document.createElement("article");
      card.className = "board-card";
      card.innerHTML = `
        <div class="board-card-title">
          <strong>BOARD ${index + 1}</strong>
          <span>条件${testBoard.filter}</span>
        </div>
        <p>Solver：3色 ${testBoard.solverRounds[3]} / 4色 ${testBoard.solverRounds[4]} round<br>生成 ${testBoard.attempts}試行</p>
        <button type="button" data-board="${testBoard.key}">この盤面を準備</button>
      `;
      return card;
    }),
  );
}

function resultLabel(result) {
  if (result === null || result === undefined) return "—";
  if (result.outcome === "stuck") return "詰まり";
  return formatTime(result.elapsedMs);
}

function renderResults() {
  if (state.testBoards.length === 0) {
    elements.resultsTable.replaceChildren();
    return;
  }
  elements.resultsTable.replaceChildren(
    ...state.testBoards.map((testBoard, index) => {
      const row = document.createElement("div");
      row.className = "result-row";
      const result = state.results[testBoard.key] ?? { 3: null, 4: null };
      row.innerHTML = `
        <strong>BOARD ${index + 1}</strong>
        <span>3色 ${resultLabel(result[3])}</span>
        <span>4色 ${resultLabel(result[4])}</span>
      `;
      return row;
    }),
  );
}

function syncFilterControls() {
  for (const button of elements.filterChoice.querySelectorAll("button[data-filter]")) {
    button.classList.toggle("active", button.dataset.filter === state.filter);
    button.disabled = state.phase === "loading";
  }
  elements.filterDescription.textContent = FILTER_INFO[state.filter];
  elements.setName.textContent = `SET ${state.setIndex + 1}`;
  elements.previousSet.disabled = state.phase === "loading" || state.setIndex === 0;
  elements.nextSet.disabled = state.phase === "loading";
}

async function loadBoardSet() {
  stopTimer();
  const token = state.loadToken + 1;
  state.loadToken = token;
  state.phase = "loading";
  state.selectedBoard = null;
  state.testBoards = [];
  setView("selection");
  renderBoardCards();
  renderResults();
  syncFilterControls();
  elements.generationStatus.textContent = `条件${state.filter}・SET ${state.setIndex + 1}をWeb Workerで生成中…`;

  try {
    const generated = await Promise.all(
      Array.from({ length: BOARD_COUNT }, (_, boardIndex) => requestBoardGeneration({
        baseSeed: playtestBaseSeed(state.filter, state.setIndex, boardIndex),
        filter: state.filter,
        maxAttempts: 2_000,
        mineCount: MINE_COUNT,
        firstRow: FIRST_ROW,
        firstCol: FIRST_COL,
        includeTrace: false,
      })),
    );
    if (token !== state.loadToken) return;
    if (generated.some((result) => result.failed)) {
      throw new Error("最大試行回数内に3盤面を生成できませんでした");
    }
    state.testBoards = generated.map((result, boardIndex) => ({
      key: `${state.filter}:${state.setIndex}:${boardIndex}`,
      filter: state.filter,
      seed: result.seed,
      attempts: result.attempts,
      solverRounds: {
        3: result.results.three.stats.reasoningRounds,
        4: result.results.four.stats.reasoningRounds,
      },
    }));
    for (const board of state.testBoards) {
      state.results[board.key] ??= { 3: null, 4: null };
    }
    state.phase = "select";
    elements.generationStatus.textContent = `条件${state.filter}の3盤面を生成しました。SETを変えて盤面を追加できます。`;
    renderBoardCards();
    renderResults();
    syncFilterControls();
  } catch (error) {
    if (token !== state.loadToken) return;
    state.phase = "select";
    elements.generationStatus.textContent = `生成エラー：${error.message}`;
    syncFilterControls();
  }
}

function syncModeChoice() {
  for (const button of elements.modeChoice.querySelectorAll("button[data-colors]")) {
    button.classList.toggle("active", Number(button.dataset.colors) === state.colorCount);
  }
}

function prepareBoard(boardKey, preferredColorCount = 3) {
  const testBoard = state.testBoards.find((candidate) => candidate.key === boardKey);
  if (!testBoard) return;
  stopTimer();
  state.selectedBoard = testBoard;
  state.colorCount = preferredColorCount;
  state.phase = "ready";
  state.board = null;
  state.gesture = null;
  const boardNumber = state.testBoards.indexOf(testBoard) + 1;
  elements.readyBoardName.textContent = `条件${testBoard.filter}・BOARD ${boardNumber}`;
  syncModeChoice();
  setView("prestart");
}

function beginGame() {
  if (!state.selectedBoard) return;

  state.board = generateBoard({
    seed: state.selectedBoard.seed,
    mineCount: MINE_COUNT,
    colorCount: state.colorCount,
    firstRow: FIRST_ROW,
    firstCol: FIRST_COL,
  });
  state.phase = "playing";
  state.gesture = null;
  state.elapsedMs = 0;
  state.startedAt = Date.now();

  revealCell(state.board, FIRST_ROW, FIRST_COL);

  const boardNumber = state.testBoards.indexOf(state.selectedBoard) + 1;
  elements.gameBoardName.textContent = `条件${state.selectedBoard.filter}・BOARD ${boardNumber}`;
  elements.gameMode.textContent = `${state.colorCount} COLORS`;
  elements.yellowGuide.style.opacity = state.colorCount === 4 ? "1" : ".2";
  elements.finishCard.hidden = true;
  elements.markStuck.hidden = false;
  elements.feedback.textContent = "スワイプ判定：20px・序盤の方向で固定";
  elements.feedback.className = "feedback";
  setView("game");
  renderBoard();
  renderStatus();
  startTimer();
}

function setFeedback(text, kind = "") {
  elements.feedback.textContent = text;
  elements.feedback.className = `feedback${kind ? ` ${kind}` : ""}`;
}

function finishGame(result) {
  if (state.phase !== "playing") return;
  state.phase = result;
  stopTimer();
  renderBoard();
  renderStatus();

  const won = result === "won";
  if (won) {
    state.results[state.selectedBoard.key][state.colorCount] = {
      outcome: "won",
      elapsedMs: state.elapsedMs,
    };
    renderResults();
    elements.finishTitle.textContent = "クリア";
    elements.finishDetail.textContent = `${state.colorCount}色：${formatTime(state.elapsedMs)}`;
  } else if (result === "stuck") {
    state.results[state.selectedBoard.key][state.colorCount] = {
      outcome: "stuck",
      elapsedMs: state.elapsedMs,
    };
    renderResults();
    elements.finishTitle.textContent = "論理で詰まった";
    elements.finishDetail.textContent = `${state.colorCount}色：${formatTime(state.elapsedMs)}時点で記録しました。`;
  } else {
    elements.finishTitle.textContent = "爆弾でした";
    elements.finishDetail.textContent = "この試行のタイムは記録していません。";
  }

  const rounds3 = state.selectedBoard.solverRounds[3];
  const rounds4 = state.selectedBoard.solverRounds[4];
  elements.solverNote.textContent = `参考：選定時のSolverは3色 ${rounds3}ラウンド / 4色 ${rounds4}ラウンド。実際の人間の速さを保証する値ではありません。`;
  elements.retryOtherMode.textContent = `同じ盤面を${state.colorCount === 3 ? "4色" : "3色"}で`;
  elements.markStuck.hidden = true;
  elements.finishCard.hidden = false;
}

function handleReveal(row, col) {
  if (state.phase !== "playing") return;
  const cell = state.board.cells[row][col];

  if (cell.state === "revealed") {
    attemptChord(cell);
    return;
  }
  if (cell.state !== "hidden") return;

  const result = revealCell(state.board, row, col);
  if (result.type === "mine") {
    finishGame("lost");
    return;
  }
  if (checkWin(state.board)) {
    finishGame("won");
    return;
  }
  setFeedback("タップ：開く");
  renderBoard();
  renderStatus();
}

function attemptChord(cell) {
  const adjacent = getAdjacentCells(state.board, cell.row, cell.col);
  const adjacentFlags = adjacent.filter((candidate) => candidate.state === "flagged").length;
  const needed = totalAdjacent(cell);

  if (adjacentFlags !== needed) {
    setFeedback(`Chord待ち：周囲の旗 ${adjacentFlags} / 爆弾 ${needed}`);
    return;
  }

  for (const candidate of adjacent) {
    if (candidate.state !== "hidden") continue;
    const result = revealCell(state.board, candidate.row, candidate.col);
    if (result.type === "mine") {
      finishGame("lost");
      return;
    }
  }

  if (checkWin(state.board)) {
    finishGame("won");
    return;
  }
  setFeedback("Chord：周囲を一括で開きました");
  renderBoard();
  renderStatus();
}

function handleFlag(row, col, flagColor) {
  if (state.phase !== "playing") return;
  if (flagColor === "yellow" && state.colorCount < 4) {
    setFeedback("黄旗は4色モードのみ", "yellow");
    return;
  }

  const cell = state.board.cells[row][col];
  if (!["hidden", "flagged"].includes(cell.state)) return;

  if (cell.state === "flagged" && cell.flagColor === flagColor) {
    cell.state = "hidden";
    cell.flagColor = null;
    setFeedback(`${FLAG_LABELS[flagColor]}を解除`);
  } else {
    cell.state = "flagged";
    cell.flagColor = flagColor;
    setFeedback(`${FLAG_LABELS[flagColor]}を設置`, flagColor);
  }
  renderBoard();
  renderStatus();
}

function renderStatus() {
  if (!state.board) return;
  elements.flagCount.textContent = `旗 ${countFlags(state.board)} / ${MINE_COUNT}`;
  elements.status.textContent = {
    playing: "プレイ中",
    won: "クリア",
    lost: "失敗",
    stuck: "論理で詰まった",
  }[state.phase] || "";
}

function renderBoard() {
  if (!state.board) return;
  const fragment = document.createDocumentFragment();

  for (const row of state.board.cells) {
    for (const cell of row) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.state}`;
      button.dataset.row = String(cell.row);
      button.dataset.col = String(cell.col);
      button.setAttribute("role", "gridcell");

      if (cell.state === "exploded") {
        const color = COLORS[cell.mineColor];
        button.classList.add(`mine-${color.id}`);
        button.innerHTML = '<span class="mine-mark" aria-hidden="true">●</span>';
      } else if (cell.state === "flagged") {
        const flagColor = cell.flagColor || "neutral";
        button.classList.add(`flag-${flagColor}`);
        button.innerHTML = '<span class="flag-mark" aria-hidden="true">⚑</span>';
      } else if (cell.state === "revealed") {
        const clue = document.createElement("span");
        clue.className = "clue-grid";
        for (let colorIndex = 0; colorIndex < 4; colorIndex += 1) {
          const number = document.createElement("span");
          if (colorIndex < state.colorCount) {
            number.className = `clue ${COLORS[colorIndex].id}`;
            const value = cell.adjacentCounts[colorIndex];
            if (value > 0) number.textContent = String(value);
          } else {
            number.className = "clue unused";
          }
          clue.append(number);
        }
        button.append(clue);
      }
      fragment.append(button);
    }
  }

  elements.board.replaceChildren(fragment);
}

function gestureTarget(dx, dy) {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return "invalid";

  const verticalAmount = Math.abs(dy) / distance;
  if (verticalAmount < 0.25) return "invalid";

  if (dy < 0) {
    if (Math.abs(dx) <= Math.max(6, Math.abs(dy) * 0.34)) return "neutral";
    return dx < 0 ? "red" : "blue";
  }

  if (Math.abs(dx) < 6) return "invalid";
  return dx < 0 ? "green" : "yellow";
}

function previewTarget(target) {
  if (target === "invalid") return "方向を判定できません";
  if (target === "yellow" && state.colorCount < 4) return "↘ 黄：4色モードのみ";
  const arrows = { neutral: "↑", red: "↖", blue: "↗", green: "↙", yellow: "↘" };
  return `${arrows[target]} ${FLAG_LABELS[target]}：方向固定`;
}

function cellFromEvent(event) {
  const cell = event.target.closest(".cell");
  if (!cell) return null;
  return {
    element: cell,
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
  };
}

elements.boardCards.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-board]");
  if (button) prepareBoard(button.dataset.board, 3);
});

elements.filterChoice.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button || button.dataset.filter === state.filter || state.phase === "loading") return;
  state.filter = button.dataset.filter;
  state.setIndex = 0;
  loadBoardSet();
});

elements.previousSet.addEventListener("click", () => {
  if (state.setIndex === 0 || state.phase === "loading") return;
  state.setIndex -= 1;
  loadBoardSet();
});

elements.nextSet.addEventListener("click", () => {
  if (state.phase === "loading") return;
  state.setIndex += 1;
  loadBoardSet();
});

elements.modeChoice.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-colors]");
  if (!button) return;
  state.colorCount = Number(button.dataset.colors);
  syncModeChoice();
});

elements.backToBoards.addEventListener("click", () => {
  state.phase = "select";
  setView("selection");
});

elements.startGame.addEventListener("click", beginGame);

elements.markStuck.addEventListener("click", () => finishGame("stuck"));

elements.retryOtherMode.addEventListener("click", () => {
  const other = state.colorCount === 3 ? 4 : 3;
  prepareBoard(state.selectedBoard.key, other);
});

elements.chooseBoard.addEventListener("click", () => {
  stopTimer();
  state.phase = "select";
  setView("selection");
});

elements.board.addEventListener("pointerdown", (event) => {
  if (state.phase !== "playing" || event.button !== 0) return;
  const target = cellFromEvent(event);
  if (!target) return;
  event.preventDefault();
  elements.board.setPointerCapture?.(event.pointerId);
  target.element.classList.add("gesture-source");
  state.gesture = {
    pointerId: event.pointerId,
    row: target.row,
    col: target.col,
    startX: event.clientX,
    startY: event.clientY,
    sourceElement: target.element,
    locked: false,
    target: null,
  };
});

elements.board.addEventListener("pointermove", (event) => {
  const gesture = state.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  event.preventDefault();
  if (gesture.locked) return;

  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;

  gesture.target = gestureTarget(dx, dy);
  gesture.locked = true;
  setFeedback(previewTarget(gesture.target), gesture.target !== "invalid" ? gesture.target : "");
});

elements.board.addEventListener("pointerup", (event) => {
  const gesture = state.gesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  event.preventDefault();
  gesture.sourceElement?.classList.remove("gesture-source");

  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  const distance = Math.hypot(dx, dy);

  if (!gesture.locked && distance >= SWIPE_THRESHOLD) {
    gesture.target = gestureTarget(dx, dy);
    gesture.locked = true;
  }

  state.gesture = null;

  if (!gesture.locked && distance <= TAP_MAX) {
    handleReveal(gesture.row, gesture.col);
    return;
  }
  if (!gesture.locked) {
    setFeedback("タップとスワイプの中間だったのでキャンセル");
    return;
  }
  if (!gesture.target || gesture.target === "invalid") {
    setFeedback("方向を判定できなかったのでキャンセル");
    return;
  }
  handleFlag(gesture.row, gesture.col, gesture.target);
});

for (const eventName of ["pointercancel", "lostpointercapture"]) {
  elements.board.addEventListener(eventName, () => {
    if (!state.gesture) return;
    state.gesture.sourceElement?.classList.remove("gesture-source");
    state.gesture = null;
    setFeedback("操作をキャンセル");
  });
}

elements.board.addEventListener("click", (event) => event.preventDefault());
elements.board.addEventListener("contextmenu", (event) => event.preventDefault());

syncFilterControls();
loadBoardSet();
