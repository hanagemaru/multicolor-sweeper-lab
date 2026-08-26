export const PLAYTEST_SEED_VERSION = "compare-play-v1";

export function playtestBaseSeed(filter, setIndex, boardIndex) {
  if (!["B", "C", "D"].includes(filter)) throw new Error("filter must be B, C, or D");
  if (!Number.isInteger(setIndex) || setIndex < 0) throw new Error("setIndex must be non-negative");
  if (!Number.isInteger(boardIndex) || boardIndex < 0) throw new Error("boardIndex must be non-negative");
  return `${PLAYTEST_SEED_VERSION}|filter:${filter}|set:${setIndex}|board:${boardIndex}`;
}
