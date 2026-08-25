import {
  COLORS,
  checkWin,
  countFlags,
  createEmptyBoard,
  generateBoard,
  revealCell,
} from "./game-core.js";

const MINE_COUNT = 20;
const TAP_MAX = 8;

const elements = {
  board: document.querySelector("#board"),
  status: document.querySelector("#status"),
  flagCount: document.querySelector("#flag-count"),
  feedback: document.querySelector("#gesture-feedback"),
  colorControl: document.querySelector("#color-control"),
  threshold: document.querySelector("#threshold"),
  thresholdValue: document.querySelector("#threshold-value"),
  newBoard: document.querySelector("#new-board"),
  yellowGuide: document.querySelector(".gesture-grid .yellow"),
};

const FLAG_LABELS = {
  neutral: "無色旗",
  red: "赤旗",
  blue: "青旗",
  green: "緑旗",
  yellow: "黄旗",
};

const state = {
  colorCount: 3,
  seed: makeSeed(),
  board: createEmptyBoard(3, MINE_COUNT, ""),
  phase: "ready",
  swipeThreshold: Number(elements.threshold.value),
  gesture: null,
};
state.board.seed = state.seed;

function makeSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resetBoard() {
  state.seed = makeSeed();
  state.board = createEmptyBoard(state.colorCount, MINE_COUNT, state.seed);
  state.phase = "ready";
  state.gesture = null;
  setFeedback("指を置いて、そのままタップまたはスワイプ");
  render();
}

function startBoard(row, col) {
  state.board = generateBoard({
    seed: state.seed,
    mineCount: MINE_COUNT,
    colorCount: state.colorCount,
    firstRow: row,
    firstCol: col,
  });
  state.phase = "playing";
  revealCell(state.board, row, col);
}

function handleReveal(row, col) {
  if (["won", "lost"].includes(state.phase)) return;
  const cell = state.board.cells[row][col];
  if (cell.state !== "hidden") return;

  if (!state.board.generated) {
    startBoard(row, col);
  } else {
    const result = revealCell(state.board, row, col);
    if (result.type === "mine") state.phase = "lost";
    else if (checkWin(state.board)) state.phase = "won";
  }
  setFeedback("タップ：開く", "tap");
  render();
}

function handleFlag(row, col, flagColor) {
  if (["won", "lost"].includes(state.phase)) return;
  if (!state.board.generated) {
    setFeedback("最初の1手はタップで開いてください");
    return;
  }
  if (flagColor === "yellow" && state.colorCount < 4) {
    setFeedback("黄旗は4色モードで使えます", "yellow");
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
  render();
}

function gestureTarget(dx, dy) {
  const distance = Math.hypot(dx, dy);
  if (distance < state.swipeThreshold) return null;

  const verticalAmount = Math.abs(dy) / distance;
  if (verticalAmount < 0.25) return "invalid";

  if (dy < 0) {
    if (Math.abs(dx) <= Math.max(6, Math.abs(dy) * 0.34)) return "neutral";
    return dx < 0 ? "red" : "blue";
  }

  if (Math.abs(dx) < 6) return "invalid";
  return dx < 0 ? "green" : "yellow";
}

function gesturePreview(target) {
  if (!target) return `あと少し動かす（${state.swipeThreshold}pxで判定）`;
  if (target === "invalid") return "斜め、または真上へスワイプ";
  if (target === "yellow" && state.colorCount < 4) return "↘ 黄：4色モードのみ";
  const arrows = { neutral: "↑", red: "↖", blue: "↗", green: "↙", yellow: "↘" };
  return `${arrows[target]} ${FLAG_LABELS[target]}`;
}

function setFeedback(text, kind = "") {
  elements.feedback.textContent = text;
  elements.feedback.className = `feedback${kind ? ` ${kind}` : ""}`;
}

function render() {
  const fragment = document.createDocumentFragment();
  const ended = ["won", "lost"].includes(state.phase);

  for (const row of state.board.cells) {
    for (const cell of row) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cell ${cell.state}`;
      button.dataset.row = String(cell.row);
      button.dataset.col = String(cell.col);
      button.setAttribute("role", "gridcell");

      if (state.gesture?.row === cell.row && state.gesture?.col === cell.col) {
        button.classList.add("gesture-source");
      }

      const showMine = cell.mineColor !== null && (ended || cell.state === "exploded");
      if (showMine) {
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
  elements.flagCount.textContent = `旗 ${countFlags(state.board)} / ${MINE_COUNT}`;
  elements.status.textContent = {
    ready: "最初のマスをタップしてください",
    playing: "プレイ中",
    won: "クリア",
    lost: "爆弾でした",
  }[state.phase];

  elements.yellowGuide.style.opacity = state.colorCount === 4 ? "1" : ".3";
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

elements.board.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const target = cellFromEvent(event);
  if (!target) return;
  event.preventDefault();
  elements.board.setPointerCapture?.(event.pointerId);
  state.gesture = {
    pointerId: event.pointerId,
    row: target.row,
    col: target.col,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  render();
});

elements.board.addEventListener("pointermove", (event) => {
  if (!state.gesture || event.pointerId !== state.gesture.pointerId) return;
  event.preventDefault();
  state.gesture.lastX = event.clientX;
  state.gesture.lastY = event.clientY;
  const dx = event.clientX - state.gesture.startX;
  const dy = event.clientY - state.gesture.startY;
  const target = gestureTarget(dx, dy);
  setFeedback(gesturePreview(target), target && target !== "invalid" ? target : "");
});

elements.board.addEventListener("pointerup", (event) => {
  if (!state.gesture || event.pointerId !== state.gesture.pointerId) return;
  event.preventDefault();
  const gesture = state.gesture;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  const distance = Math.hypot(dx, dy);
  state.gesture = null;

  if (distance <= TAP_MAX) {
    handleReveal(gesture.row, gesture.col);
    return;
  }
  if (distance < state.swipeThreshold) {
    setFeedback("タップとスワイプの中間だったので操作をキャンセル");
    render();
    return;
  }

  const target = gestureTarget(dx, dy);
  if (!target || target === "invalid") {
    setFeedback("方向を判定できなかったので操作をキャンセル");
    render();
    return;
  }
  handleFlag(gesture.row, gesture.col, target);
});

for (const eventName of ["pointercancel", "lostpointercapture"]) {
  elements.board.addEventListener(eventName, () => {
    if (!state.gesture) return;
    state.gesture = null;
    setFeedback("操作をキャンセル");
    render();
  });
}

// pointerupで操作を完結させるため、後から発生するclickは使わない。
elements.board.addEventListener("click", (event) => event.preventDefault());

elements.board.addEventListener("contextmenu", (event) => {
  const target = cellFromEvent(event);
  if (!target) return;
  event.preventDefault();
  handleFlag(target.row, target.col, "neutral");
});

elements.colorControl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-colors]");
  if (!button) return;
  state.colorCount = Number(button.dataset.colors);
  for (const candidate of elements.colorControl.querySelectorAll("button")) {
    candidate.classList.toggle("active", candidate === button);
  }
  resetBoard();
});

elements.threshold.addEventListener("input", () => {
  state.swipeThreshold = Number(elements.threshold.value);
  elements.thresholdValue.textContent = `${state.swipeThreshold}px`;
});

elements.newBoard.addEventListener("click", resetBoard);

render();
