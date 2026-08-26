import {
  COLORS,
  checkWin,
  countFlags,
  generateBoard,
  getAdjacentCells,
  revealCell,
  totalAdjacent,
} from "./game-core.js";

const MINE_COUNT = 20;
const FIRST_ROW = 4;
const FIRST_COL = 4;
const SWIPE_THRESHOLD = 20;
const TAP_MAX = 8;

// 比較テスト第2セット。
// 3色/4色ともhuman-rule solver（基本＋差分、guessなし）でclear。
// 初手からクリアまで確定手が途切れず、色なしでは解けないことも確認済み。
// 今回は3色を先に遊び、その後4色を遊んで順序効果を逆向きに確認する。
const TEST_BOARDS = [
  { id: "D", seed: "set2-000050", solverRounds: { 3: 6, 4: 5 } },
  { id: "E", seed: "set2-000179", solverRounds: { 3: 8, 4: 7 } },
  { id: "F", seed: "set2-000302", solverRounds: { 3: 9, 4: 7 } },
];

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
  retryOtherMode: document.querySelector("#retry-other-mode"),
  chooseBoard: document.querySelector("#choose-board"),
};

const state = {
  selectedBoard: null,
  colorCount: 3,
  board: null,
  phase: "select",
  gesture: null,
  startedAt: null,
  elapsedMs: 0,
  timerId: null,
  results: Object.fromEntries(TEST_BOARDS.map((board) => [board.id, { 3: null, 4: null }])),
};

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
    ...TEST_BOARDS.map((testBoard) => {
      const card = document.createElement("article");
      card.className = "board-card";
      card.innerHTML = `
        <strong>BOARD ${testBoard.id}</strong>
        <p>3色/4色ともNo-Guess。今回は3色→4色の順で比較推奨。</p>
        <button type="button" data-board="${testBoard.id}">この盤面を準備</button>
      `;
      return card;
    }),
  );
}

function renderResults() {
  elements.resultsTable.replaceChildren(
    ...TEST_BOARDS.map((testBoard) => {
      const row = document.createElement("div");
      row.className = "result-row";
      const r3 = state.results[testBoard.id][3];
      const r4 = state.results[testBoard.id][4];
      row.innerHTML = `
        <strong>BOARD ${testBoard.id}</strong>
        <span>3色 ${r3 === null ? "—" : formatTime(r3)}</span>
        <span>4色 ${r4 === null ? "—" : formatTime(r4)}</span>
      `;
      return row;
    }),
  );
}

function syncModeChoice() {
  for (const button of elements.modeChoice.querySelectorAll("button[data-colors]")) {
    button.classList.toggle("active", Number(button.dataset.colors) === state.colorCount);
  }
}

function prepareBoard(boardId, preferredColorCount = 3) {
  const testBoard = TEST_BOARDS.find((candidate) => candidate.id === boardId);
  if (!testBoard) return;
  stopTimer();
  state.selectedBoard = testBoard;
  state.colorCount = preferredColorCount;
  state.phase = "ready";
  state.board = null;
  state.gesture = null;
  elements.readyBoardName.textContent = `BOARD ${testBoard.id}`;
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

  elements.gameBoardName.textContent = `BOARD ${state.selectedBoard.id}`;
  elements.gameMode.textContent = `${state.colorCount} COLORS`;
  elements.yellowGuide.style.opacity = state.colorCount === 4 ? "1" : ".2";
  elements.finishCard.hidden = true;
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
    state.results[state.selectedBoard.id][state.colorCount] = state.elapsedMs;
    renderResults();
    elements.finishTitle.textContent = "クリア";
    elements.finishDetail.textContent = `${state.colorCount}色：${formatTime(state.elapsedMs)}`;
  } else {
    elements.finishTitle.textContent = "爆弾でした";
    elements.finishDetail.textContent = "この試行のタイムは記録していません。";
  }

  const rounds3 = state.selectedBoard.solverRounds[3];
  const rounds4 = state.selectedBoard.solverRounds[4];
  elements.solverNote.textContent = `参考：選定時のSolverは3色 ${rounds3}ラウンド / 4色 ${rounds4}ラウンド。実際の人間の速さを保証する値ではありません。`;
  elements.retryOtherMode.textContent = `同じ盤面を${state.colorCount === 3 ? "4色" : "3色"}で`;
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

elements.retryOtherMode.addEventListener("click", () => {
  const other = state.colorCount === 3 ? 4 : 3;
  prepareBoard(state.selectedBoard.id, other);
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

renderBoardCards();
renderResults();
setView("selection");