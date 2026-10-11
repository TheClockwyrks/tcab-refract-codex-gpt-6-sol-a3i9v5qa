import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  BACK_LABEL,
  BINDINGS,
  BOARD_CX,
  BOARD_CY,
  CAMPAIGN_LENGTH,
  CELL_PITCH,
  CHANNELS,
  CLEAR_LABEL,
  CUES,
  HUD_SOLVED_LABEL,
  HUD_TIER_LABEL,
  MAX_TIER,
  NODE_HIT_R,
  REFRACT_DEBUG_VERSION,
  SET_LABELS,
  SOLVED_ITEMS,
  SOLVED_TITLE_TEXT,
  STAGE_H,
  STAGE_W,
  TAGLINE_TEXT,
  TIER_ADVANCE,
  TITLE_ITEMS,
  TITLE_TEXT,
} from "./constants";
import { CAMPAIGN, channelsOf, generateBoard, parseBoard } from "./boards";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";
export type Mode = "campaign" | "cascade";
export type Channel = "triangle" | "square" | "diamond";
export type NodeKind = "emitter" | "lens" | "crystal";
export interface Cell {
  readonly col: number;
  readonly row: number;
}
export interface NodeState extends Cell {
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}
export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}
export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}
export interface TraceState {
  readonly channel: Channel;
}
export type PointerDevice = "mouse" | "pen" | "touch";
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}
export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;
  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;
  readonly solvedCount: number;
  readonly tier: number;
  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const BACKGROUND = "#09121b";
const colors: Record<Channel, string> = {
  triangle: "#f8ad70",
  square: "#69dbce",
  diamond: "#af9df7",
};
const same = (a: Cell, b: Cell): boolean => a.col === b.col && a.row === b.row;
const key = (a: Cell, b: Cell): string =>
  [a, b]
    .map((c) => `${c.col},${c.row}`)
    .sort()
    .join("|");
const nodeAt = (board: BoardState, cell: Cell): NodeState | undefined =>
  board.nodes.find((n) => same(n, cell));
const beamOf = (state: RefractState, channel: Channel): BeamState =>
  state.beams.find((b) => b.channel === channel)!;
const cellsOf = (state: RefractState, channel: Channel): readonly Cell[] =>
  beamOf(state, channel).cells;
const replaceBeam = (
  state: RefractState,
  channel: Channel,
  cells: readonly Cell[],
): RefractState => ({
  ...state,
  beams: state.beams.map((b) =>
    b.channel === channel ? { channel, cells } : b,
  ),
});
const cellX = (col: number, cols: number): number =>
  BOARD_CX - ((cols - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
const cellY = (row: number, rows: number): number =>
  BOARD_CY - ((rows - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
const spent = (state: RefractState, cell: Cell): number =>
  state.beams.reduce(
    (sum, b) => sum + b.cells.filter((c) => same(c, cell)).length,
    0,
  );
const emptyBeams = (board: BoardState): BeamState[] =>
  channelsOf(board).map((channel) => ({ channel, cells: [] }));
export const initialState = (muted = false): RefractState => ({
  screen: "title",
  mode: "campaign",
  menuIndex: 0,
  board: { cols: 0, rows: 0, nodes: [] },
  beams: [],
  tracing: null,
  boardIndex: 0,
  solvedBoards: [],
  unlockedCount: 1,
  selectIndex: 0,
  solvedCount: 0,
  tier: 1,
  pointer: { x: 0, y: 0, down: false, device: "mouse" },
  armedTarget: null,
  simTime: 0,
  muted,
});
function load(state: RefractState, board: BoardState): RefractState {
  return {
    ...state,
    screen: "playing",
    board,
    beams: emptyBeams(board),
    tracing: null,
    menuIndex: 0,
    armedTarget: null,
  };
}
const campaignBoard = (state: RefractState, index: number): RefractState => ({
  ...load(state, parseBoard(CAMPAIGN[index])),
  boardIndex: index,
  selectIndex: index,
});
function completeBeam(state: RefractState, beam: BeamState): boolean {
  const cells = beam.cells;
  if (cells.length < 2) return false;
  const first = nodeAt(state.board, cells[0]);
  const last = nodeAt(state.board, cells[cells.length - 1]);
  if (
    first?.kind !== "emitter" ||
    last?.kind !== "emitter" ||
    first.channel !== beam.channel ||
    last.channel !== beam.channel ||
    same(first, last)
  )
    return false;
  return state.board.nodes
    .filter((n) => n.kind === "lens" && n.channel === beam.channel)
    .every(
      (n) =>
        cells.filter((c) => same(c, n)).length === 1 &&
        cells.findIndex((c) => same(c, n)) > 0 &&
        cells.findIndex((c) => same(c, n)) < cells.length - 1,
    );
}
const solved = (state: RefractState): boolean =>
  state.beams.length > 0 &&
  state.beams.every((b) => completeBeam(state, b)) &&
  state.board.nodes
    .filter((n) => n.kind === "crystal")
    .every(
      (n) =>
        spent(state, n) === n.charges &&
        state.beams.every(
          (b) => !b.cells.length || !same(b.cells[b.cells.length - 1], n),
        ),
    );
function legal(state: RefractState, channel: Channel, next: Cell): boolean {
  const cells = cellsOf(state, channel);
  const last = cells[cells.length - 1];
  const dest = nodeAt(state.board, next);
  if (
    !last ||
    !dest ||
    Math.abs(last.col - next.col) > 1 ||
    Math.abs(last.row - next.row) > 1 ||
    same(last, next)
  )
    return false;
  const origin = nodeAt(state.board, last)!;
  if (origin.kind === "emitter" && cells.length > 1) return false;
  if (dest.channel && dest.channel !== channel) return false;
  if (
    dest.kind === "emitter" &&
    (cells.length < 1 || cells.some((c) => same(c, next)))
  )
    return false;
  if (dest.kind === "lens" && cells.some((c) => same(c, next))) return false;
  if (dest.kind === "crystal" && spent(state, next) >= (dest.charges ?? 0))
    return false;
  const newKey = key(last, next);
  for (const beam of state.beams)
    for (let i = 1; i < beam.cells.length; i++) {
      const a = beam.cells[i - 1],
        b = beam.cells[i];
      if (key(a, b) === newKey) return false;
      if (
        Math.abs(last.col - next.col) === 1 &&
        Math.abs(last.row - next.row) === 1 &&
        Math.abs(a.col - b.col) === 1 &&
        Math.abs(a.row - b.row) === 1 &&
        a.col + b.col === last.col + next.col &&
        a.row + b.row === last.row + next.row &&
        key(a, b) !== newKey
      )
        return false;
    }
  return true;
}
function hitNode(
  board: BoardState,
  x: number,
  y: number,
): NodeState | undefined {
  return board.nodes.find(
    (n) =>
      Math.hypot(x - cellX(n.col, board.cols), y - cellY(n.row, board.rows)) <=
      NODE_HIT_R,
  );
}
function startTrace(
  state: RefractState,
  node: NodeState,
  cue?: (name: string) => void,
): RefractState {
  if (
    node.kind === "emitter" &&
    node.channel &&
    cellsOf(state, node.channel).length === 0
  )
    return {
      ...replaceBeam(state, node.channel, [node]),
      tracing: { channel: node.channel },
    };
  for (const beam of state.beams) {
    const cells = beam.cells;
    if (cells.length && same(cells[0], node))
      return {
        ...replaceBeam(state, beam.channel, [...cells].reverse()),
        tracing: { channel: beam.channel },
      };
    if (cells.length && same(cells[cells.length - 1], node))
      return { ...state, tracing: { channel: beam.channel } };
  }
  const through = state.beams.filter((b) =>
    b.cells.slice(1, -1).some((c) => same(c, node)),
  );
  if (through.length === 1) {
    const beam = through[0];
    const index = beam.cells.reduce(
      (found, c, i) => (same(c, node) ? i : found),
      -1,
    );
    if (index < beam.cells.length - 1) cue?.(CUES.retract);
    return {
      ...replaceBeam(state, beam.channel, beam.cells.slice(0, index + 1)),
      tracing: { channel: beam.channel },
    };
  }
  return state;
}
function finishSolve(state: RefractState): RefractState {
  if (state.mode === "cascade") {
    const solvedCount = state.solvedCount + 1;
    return {
      ...state,
      screen: "solved",
      tracing: null,
      armedTarget: null,
      menuIndex: 0,
      solvedCount,
      tier: Math.min(Math.floor(solvedCount / TIER_ADVANCE) + 1, MAX_TIER),
    };
  }
  const solvedBoards = [
    ...new Set([...state.solvedBoards, state.boardIndex]),
  ].sort((a, b) => a - b);
  return {
    ...state,
    screen: solvedBoards.length === CAMPAIGN_LENGTH ? "complete" : "solved",
    tracing: null,
    armedTarget: null,
    menuIndex: 0,
    solvedBoards,
    unlockedCount: Math.min(
      CAMPAIGN_LENGTH,
      Math.max(state.unlockedCount, state.boardIndex + 2),
    ),
    selectIndex: state.boardIndex,
  };
}
function traceMove(
  state: RefractState,
  node: NodeState,
  cue?: (name: string) => void,
): RefractState {
  if (!state.tracing || state.screen !== "playing") return state;
  const channel = state.tracing.channel;
  const cells = cellsOf(state, channel);
  if (!cells.length) return state;
  if (cells.length >= 2 && same(node, cells[cells.length - 2])) {
    cue?.(CUES.retract);
    return replaceBeam(state, channel, cells.slice(0, -1));
  }
  if (!legal(state, channel, node)) return state;
  let next = replaceBeam(state, channel, [...cells, node]);
  cue?.(CUES.connect);
  if (completeBeam(next, beamOf(next, channel))) cue?.(CUES.channelComplete);
  if (solved(next)) {
    cue?.(CUES.solved);
    next = finishSolve(next);
  }
  return next;
}
export function targets(state: RefractState): Target[] {
  const menu = (labels: readonly string[], y: number, gap = 88): Target[] =>
    labels.map((_, i) => ({
      id: `menu-${i}`,
      x: 478,
      y: y + gap * i,
      w: 324,
      h: 74,
    }));
  if (state.screen === "title") return menu(TITLE_ITEMS, 360);
  if (state.screen === "howto")
    return [{ id: "back", x: 58, y: 612, w: 142, h: 76 }];
  if (state.screen === "playing")
    return [
      { id: "clear", x: 990, y: 598, w: 146, h: 78 },
      { id: "back", x: 70, y: 598, w: 146, h: 78 },
    ];
  if (state.screen === "select")
    return [
      ...Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => ({
        id: `board-${i + 1}`,
        x: 276 + (i % 6) * 134,
        y: 205 + Math.floor(i / 6) * 106,
        w: 110,
        h: 80,
      })),
      { id: "back", x: 58, y: 612, w: 142, h: 76 },
    ];
  if (state.screen === "complete") return menu(["SELECT", "TITLE"], 410);
  return menu(
    state.mode === "cascade"
      ? SOLVED_ITEMS
      : state.boardIndex === CAMPAIGN_LENGTH - 1
        ? ["REPLAY", "SELECT"]
        : ["NEXT BOARD", "REPLAY", "SELECT"],
    365,
  );
}
function takeTarget(state: RefractState, id: string): RefractState {
  if (id === "back") return goBack(state);
  if (id === "clear") return clear(state);
  if (id.startsWith("board-")) {
    const index = Number(id.slice(6)) - 1;
    return index < state.unlockedCount ? campaignBoard(state, index) : state;
  }
  if (id.startsWith("menu-"))
    return confirm({ ...state, menuIndex: Number(id.slice(5)) });
  return state;
}
const targetAt = (
  state: RefractState,
  x: number,
  y: number,
): Target | undefined =>
  targets(state).find(
    (t) => x >= t.x && y >= t.y && x <= t.x + t.w && y <= t.y + t.h,
  );
function pointerEvent(
  state: RefractState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice,
  cue?: (name: string) => void,
): RefractState {
  let next: RefractState = {
    ...state,
    pointer: {
      x,
      y,
      device,
      down: type === "up" ? false : type === "down" ? true : state.pointer.down,
    },
  };
  const target = targetAt(next, x, y);
  if (type === "down") {
    if (target)
      return { ...highlight(next, target.id), armedTarget: target.id };
    const node =
      next.screen === "playing" ? hitNode(next.board, x, y) : undefined;
    return node ? startTrace(next, node, cue) : next;
  }
  if (type === "up") {
    const armed = next.armedTarget;
    next = {
      ...next,
      armedTarget: null,
      tracing: null,
      beams: next.beams.map((b) =>
        b.cells.length === 1 ? { ...b, cells: [] } : b,
      ),
    };
    return armed && target?.id === armed ? takeTarget(next, armed) : next;
  }
  if (!next.pointer.down && target) return highlight(next, target.id);
  if (next.pointer.down && next.tracing) {
    const node = hitNode(next.board, x, y);
    if (node) return traceMove(next, node, cue);
  }
  return next;
}
function highlight(state: RefractState, id: string): RefractState {
  if (id.startsWith("menu-"))
    return { ...state, menuIndex: Number(id.slice(5)) };
  if (id.startsWith("board-"))
    return { ...state, selectIndex: Number(id.slice(6)) - 1 };
  return state;
}
function clear(state: RefractState): RefractState {
  return {
    ...state,
    beams: state.beams.map((b) => ({ ...b, cells: [] })),
    tracing: null,
  };
}
function goBack(state: RefractState): RefractState {
  if (state.screen === "title") return state;
  if (state.screen === "howto")
    return { ...state, screen: "title", menuIndex: 2, armedTarget: null };
  if (state.screen === "select")
    return { ...state, screen: "title", menuIndex: 0, armedTarget: null };
  if (state.screen === "playing" || state.screen === "solved")
    return state.mode === "campaign"
      ? { ...clear(state), screen: "select", armedTarget: null }
      : { ...clear(state), screen: "title", menuIndex: 1, armedTarget: null };
  return { ...state, screen: "select", armedTarget: null };
}
function confirm(state: RefractState): RefractState {
  if (state.screen === "title") {
    if (state.menuIndex === 0)
      return {
        ...state,
        screen: "select",
        mode: "campaign",
        selectIndex: state.boardIndex,
        armedTarget: null,
      };
    if (state.menuIndex === 1)
      return load(
        { ...state, mode: "cascade", solvedCount: 0, tier: 1 },
        generateBoard(1),
      );
    return { ...state, screen: "howto", menuIndex: 0, armedTarget: null };
  }
  if (state.screen === "select")
    return state.selectIndex < state.unlockedCount
      ? campaignBoard(state, state.selectIndex)
      : state;
  if (state.screen === "solved") {
    if (state.mode === "cascade")
      return load(
        state.menuIndex === 1 ? { ...state, solvedCount: 0, tier: 1 } : state,
        generateBoard(state.menuIndex === 1 ? 1 : state.tier),
      );
    if (state.boardIndex < CAMPAIGN_LENGTH - 1 && state.menuIndex === 0)
      return campaignBoard(state, state.boardIndex + 1);
    if (state.menuIndex === (state.boardIndex < CAMPAIGN_LENGTH - 1 ? 1 : 0))
      return campaignBoard(state, state.boardIndex);
    return { ...state, screen: "select", menuIndex: 0 };
  }
  if (state.screen === "complete")
    return state.menuIndex === 0
      ? { ...state, screen: "select" }
      : { ...state, screen: "title", menuIndex: 0 };
  return state;
}
export interface Snapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  boardIndex: number;
  solvedBoards: number[];
  unlockedCount: number;
  selectIndex: number;
  solvedCount: number;
  tier: number;
  board: {
    cols: number;
    rows: number;
    nodes: {
      col: number;
      row: number;
      x: number;
      y: number;
      kind: NodeKind;
      channel: Channel | null;
      charges: number | null;
      spent: number | null;
    }[];
  };
  beams: Partial<Record<Channel, { cells: Cell[]; complete: boolean }>>;
  solved: boolean;
  tracing: { channel: Channel; live: Cell } | null;
  pointer: PointerState;
  targets: Target[];
  muted: boolean;
  simTime: number;
}
export function snapshot(state: RefractState): Snapshot {
  const beams: Snapshot["beams"] = {};
  for (const b of state.beams)
    beams[b.channel] = {
      cells: b.cells.map((c) => ({ ...c })),
      complete: completeBeam(state, b),
    };
  const live = state.tracing
    ? cellsOf(state, state.tracing.channel)[
        cellsOf(state, state.tracing.channel).length - 1
      ]
    : undefined;
  return {
    version: REFRACT_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    boardIndex: state.boardIndex,
    solvedBoards: [...state.solvedBoards],
    unlockedCount: state.unlockedCount,
    selectIndex: state.selectIndex,
    solvedCount: state.solvedCount,
    tier: state.tier,
    board: {
      cols: state.board.cols,
      rows: state.board.rows,
      nodes: state.board.nodes.map((n) => ({
        ...n,
        x: cellX(n.col, state.board.cols),
        y: cellY(n.row, state.board.rows),
        spent: n.kind === "crystal" ? spent(state, n) : null,
      })),
    },
    beams,
    solved: solved(state),
    tracing:
      state.tracing && live
        ? { channel: state.tracing.channel, live: { ...live } }
        : null,
    pointer: { ...state.pointer },
    targets: targets(state),
    muted: state.muted,
    simTime: state.simTime,
  };
}
export interface RefractDebugApi {
  readonly version: number;
  reset(state: DeepReadonly<RefractState>): RefractState;
  snapshot(state: DeepReadonly<RefractState>): Snapshot;
  reconcile(state: DeepReadonly<RefractState>): RefractState;
  setMode(state: DeepReadonly<RefractState>, mode: Mode): RefractState;
  setScreen(state: DeepReadonly<RefractState>, screen: Screen): RefractState;
  setMenuIndex(state: DeepReadonly<RefractState>, index: number): RefractState;
  setSolvedCount(
    state: DeepReadonly<RefractState>,
    count: number,
  ): RefractState;
  setTier(state: DeepReadonly<RefractState>, tier: number): RefractState;
  generateBoard(state: DeepReadonly<RefractState>, tier: number): RefractState;
  loadBoard(
    state: DeepReadonly<RefractState>,
    board: readonly string[],
  ): RefractState;
  pointerDown(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    state: DeepReadonly<RefractState>,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(
    state: DeepReadonly<RefractState>,
    device?: PointerDevice,
  ): RefractState;
  clear(state: DeepReadonly<RefractState>): RefractState;
}
const mutableView = (state: DeepReadonly<RefractState>): RefractState =>
  state as RefractState;
const debug: RefractDebugApi = {
  version: REFRACT_DEBUG_VERSION,
  reset: (s) => initialState(s.muted),
  snapshot: (s) => snapshot(mutableView(s)),
  reconcile: (s) => ({ ...mutableView(s) }),
  setMode: (s, mode) => ({ ...mutableView(s), mode }),
  setScreen: (s, screen) => ({ ...mutableView(s), screen, armedTarget: null }),
  setMenuIndex: (s, menuIndex) => ({ ...mutableView(s), menuIndex }),
  setSolvedCount: (s, solvedCount) => ({ ...mutableView(s), solvedCount }),
  setTier: (s, tier) => ({ ...mutableView(s), tier }),
  generateBoard: (s, tier) => load(mutableView(s), generateBoard(tier)),
  loadBoard: (s, rows) => load(mutableView(s), parseBoard(rows)),
  pointerDown: (s, x, y, device = "mouse") =>
    pointerEvent(mutableView(s), "down", x, y, device),
  pointerMove: (s, x, y, device = "mouse") =>
    pointerEvent(mutableView(s), "move", x, y, device),
  pointerUp: (s, device = "mouse") =>
    pointerEvent(mutableView(s), "up", s.pointer.x, s.pointer.y, device),
  clear: (s) => clear(mutableView(s)),
};
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = "#112330",
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#31505d";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function label(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 22,
  color = "#e6f1ec",
  align: CanvasTextAlign = "left",
  weight = 500,
): void {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}
function silhouette(
  ctx: CanvasRenderingContext2D,
  channel: Channel,
  x: number,
  y: number,
  radius: number,
  filled: boolean,
): void {
  ctx.beginPath();
  const sides = channel === "triangle" ? 3 : 4;
  const phase = channel === "square" ? -Math.PI / 4 : -Math.PI / 2;
  for (let i = 0; i < sides; i++) {
    const a = phase + (i * Math.PI * 2) / sides;
    const px = x + Math.cos(a) * radius,
      py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = colors[channel];
  ctx.fillStyle = colors[channel];
  ctx.lineWidth = 3;
  if (filled) ctx.fill();
  else ctx.stroke();
}
function drawBoard(ctx: CanvasRenderingContext2D, state: RefractState): void {
  const b = state.board;
  for (let row = 0; row < b.rows; row++)
    for (let col = 0; col < b.cols; col++) {
      const x = cellX(col, b.cols),
        y = cellY(row, b.rows);
      ctx.strokeStyle = "#1a3642";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#294550";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  for (const beam of state.beams) {
    const path = beam.cells;
    if (path.length < 2) continue;
    ctx.beginPath();
    path.forEach((c, i) => {
      const x = cellX(c.col, b.cols),
        y = cellY(c.row, b.rows);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = colors[beam.channel];
    ctx.lineWidth = 13;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.14;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  for (const n of b.nodes) {
    const x = cellX(n.col, b.cols),
      y = cellY(n.row, b.rows);
    ctx.fillStyle = "#0c1b24";
    ctx.beginPath();
    ctx.arc(x, y, 33, 0, Math.PI * 2);
    ctx.fill();
    if (n.channel) silhouette(ctx, n.channel, x, y, 23, n.kind === "lens");
    else {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const px = x + Math.cos(a) * 27,
          py = y + Math.sin(a) * 27;
        if (!i) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#244d61";
      ctx.fill();
      ctx.strokeStyle = "#8cdeed";
      ctx.lineWidth = 2;
      ctx.stroke();
      const used = spent(state, n);
      label(ctx, `${used}/${n.charges}`, x, y, 16, "#e9fbfd", "center", 700);
    }
  }
}
function drawTargets(
  ctx: CanvasRenderingContext2D,
  state: RefractState,
  texts: readonly string[],
): void {
  targets(state)
    .filter((t) => t.id.startsWith("menu-"))
    .forEach((t, i) => {
      const chosen = i === state.menuIndex;
      panel(ctx, t.x, t.y, t.w, t.h, chosen ? "#214552" : "#102632");
      if (chosen) {
        ctx.fillStyle = "#72ddce";
        ctx.fillRect(t.x, t.y, 5, t.h);
      }
      label(
        ctx,
        texts[i],
        t.x + t.w / 2,
        t.y + t.h / 2,
        23,
        chosen ? "#f5fff9" : "#a9c0c6",
        "center",
        chosen ? 700 : 500,
      );
    });
}
function drawControl(
  ctx: CanvasRenderingContext2D,
  t: Target,
  text: string,
): void {
  panel(ctx, t.x, t.y, t.w, t.h);
  label(ctx, text, t.x + t.w / 2, t.y + t.h / 2, 19, "#d7e9ea", "center", 700);
}
function renderScreen(
  state: RefractState,
  ctx: CanvasRenderingContext2D,
): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const wash = ctx.createLinearGradient(0, 0, STAGE_W, STAGE_H);
  wash.addColorStop(0, "#102633");
  wash.addColorStop(0.5, "#08141f");
  wash.addColorStop(1, "#12202b");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.strokeStyle = "#173140";
  ctx.lineWidth = 1;
  for (let x = 32; x < STAGE_W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, STAGE_H);
    ctx.stroke();
  }
  for (let y = 16; y < STAGE_H; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(STAGE_W, y);
    ctx.stroke();
  }
  label(ctx, "R /  LIGHT LABORATORY", 56, 38, 18, "#73dccc", "left", 700);
  label(
    ctx,
    state.muted ? "SOUND OFF" : "SOUND ON",
    1210,
    38,
    14,
    "#75909b",
    "right",
  );
  if (state.screen === "title") {
    ctx.strokeStyle = "#456778";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(330, 152);
    ctx.lineTo(950, 152);
    ctx.stroke();
    label(ctx, TITLE_TEXT, 640, 205, 90, "#effcf3", "center", 800);
    label(ctx, TAGLINE_TEXT, 640, 281, 23, "#83d7cb", "center", 600);
    drawTargets(ctx, state, TITLE_ITEMS);
    label(ctx, "TRACE  ·  THREAD  ·  SPEND", 640, 661, 17, "#66818c", "center");
    return;
  }
  if (state.screen === "howto") {
    label(ctx, "HOW TO PLAY", 640, 100, 47, "#effcf3", "center", 800);
    const lines = [
      "Start at an outlined emitter. Drag through nearby nodes to its matching emitter.",
      "Move to any of the eight neighboring nodes, including diagonals. Empty cells are gaps.",
      "Thread every filled lens of your beam’s shape. Other shapes belong to other beams.",
      "Any beam can pass through a crystal. Its number is how many crossings it needs.",
      "Each segment can be drawn once. Diagonal segments cannot cross.",
      "A blocked move simply waits. Drag backward to undo; release to keep your path.",
      `Press ${BINDINGS.clear[0]} to clear the board. Press M to mute sound.`,
    ];
    lines.forEach((line, i) =>
      label(ctx, line, 150, 190 + i * 55, 20, "#d4e6e4"),
    );
    drawControl(ctx, targets(state)[0], BACK_LABEL);
    return;
  }
  if (state.screen === "select") {
    label(ctx, "CAMPAIGN", 640, 94, 47, "#effcf3", "center", 800);
    label(
      ctx,
      `${state.solvedBoards.length} / ${CAMPAIGN_LENGTH} BOARDS SOLVED`,
      640,
      145,
      19,
      "#7fd8cd",
      "center",
    );
    targets(state).forEach((t, i) => {
      if (i >= CAMPAIGN_LENGTH) return;
      const selected = i === state.selectIndex,
        locked = i >= state.unlockedCount,
        done = state.solvedBoards.includes(i);
      panel(
        ctx,
        t.x,
        t.y,
        t.w,
        t.h,
        selected
          ? "#275063"
          : done
            ? "#1c3d3a"
            : locked
              ? "#10212b"
              : "#183c46",
      );
      if (selected) {
        ctx.strokeStyle = "#8fe9d7";
        ctx.lineWidth = 3;
        ctx.strokeRect(t.x + 1, t.y + 1, t.w - 2, t.h - 2);
      }
      label(
        ctx,
        String(i + 1).padStart(2, "0"),
        t.x + t.w / 2,
        t.y + 30,
        27,
        locked ? "#637984" : "#eafbf5",
        "center",
        700,
      );
      label(
        ctx,
        locked ? "LOCKED" : done ? "SOLVED" : "OPEN",
        t.x + t.w / 2,
        t.y + 59,
        12,
        locked ? "#637984" : done ? "#8cdebb" : "#7ed9d0",
        "center",
        700,
      );
    });
    SET_LABELS.forEach((set, i) =>
      label(ctx, set, 156, 245 + i * 106, 18, "#98bac0"),
    );
    drawControl(ctx, targets(state)[targets(state).length - 1], BACK_LABEL);
    return;
  }
  drawBoard(ctx, state);
  if (state.screen === "playing") {
    label(
      ctx,
      state.mode === "campaign"
        ? `BOARD ${String(state.boardIndex + 1).padStart(2, "0")}  /  ${CAMPAIGN_LENGTH}`
        : "CASCADE",
      640,
      76,
      34,
      "#effcf3",
      "center",
      750,
    );
    if (state.mode === "cascade") {
      label(
        ctx,
        `${HUD_SOLVED_LABEL} ${state.solvedCount}`,
        1000,
        155,
        19,
        "#dce8e6",
      );
      label(ctx, `${HUD_TIER_LABEL} ${state.tier}`, 1000, 185, 19, "#dce8e6");
    }
    state.beams.forEach((b, i) => {
      const x = 80 + i * 140;
      silhouette(ctx, b.channel, x, 140, 15, completeBeam(state, b));
      label(
        ctx,
        completeBeam(state, b) ? "DONE" : "OPEN",
        x + 28,
        140,
        14,
        colors[b.channel],
      );
    });
    targets(state).forEach((t) =>
      drawControl(ctx, t, t.id === "clear" ? CLEAR_LABEL : BACK_LABEL),
    );
    label(ctx, "R TO CLEAR", 1160, 690, 14, "#83a1aa", "right");
    return;
  }
  panel(ctx, 350, 252, 580, 390, "#0b1b26ed");
  if (state.screen === "solved") {
    label(
      ctx,
      state.mode === "cascade"
        ? SOLVED_TITLE_TEXT
        : `BOARD ${state.boardIndex + 1} SOLVED`,
      640,
      299,
      38,
      "#f1fbf3",
      "center",
      800,
    );
    if (state.mode === "cascade")
      label(
        ctx,
        `${state.solvedCount} BOARDS SOLVED`,
        640,
        340,
        17,
        "#8adaca",
        "center",
      );
    const items =
      state.mode === "cascade"
        ? SOLVED_ITEMS
        : state.boardIndex === CAMPAIGN_LENGTH - 1
          ? ["REPLAY", "SELECT"]
          : ["NEXT BOARD", "REPLAY", "SELECT"];
    drawTargets(ctx, state, items);
  } else {
    label(ctx, "COURSE COMPLETE", 640, 310, 43, "#f1fbf3", "center", 800);
    label(
      ctx,
      `ALL ${CAMPAIGN_LENGTH} BOARDS SOLVED`,
      640,
      360,
      19,
      "#8adaca",
      "center",
    );
    drawTargets(ctx, state, ["SELECT", "TITLE"]);
  }
}
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api: InitApi<RefractState>): [RefractState, RefractDebugApi] {
    ACTIONS.forEach((action) =>
      api.input.register(action, { keys: [...BINDINGS[action]] }),
    );
    api.audio.define(CUES.connect, {
      wave: "sine",
      freq: 630,
      freqTo: 820,
      durationMs: 70,
      gain: 0.12,
    });
    api.audio.define(CUES.retract, {
      wave: "triangle",
      freq: 350,
      freqTo: 220,
      durationMs: 80,
      gain: 0.11,
    });
    api.audio.define(CUES.channelComplete, {
      wave: "sine",
      freq: 650,
      freqTo: 1060,
      durationMs: 230,
      gain: 0.16,
    });
    api.audio.define(CUES.solved, {
      wave: "triangle",
      freq: 500,
      freqTo: 1250,
      durationMs: 430,
      gain: 0.18,
    });
    api.audio.define(CUES.clear, {
      wave: "sawtooth",
      freq: 280,
      freqTo: 90,
      durationMs: 130,
      gain: 0.08,
    });
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("mode", (s) => s.mode);
    api.diagnostics.register("board", (s) => `${s.board.cols}x${s.board.rows}`);
    CHANNELS.forEach((channel) =>
      api.diagnostics.register(channel, (s) => {
        const b = s.beams.find((v) => v.channel === channel);
        return b
          ? `${Math.max(0, b.cells.length - 1)} ${completeBeam(mutableView(s), b) ? "done" : "open"}`
          : "-";
      }),
    );
    api.diagnostics.register(
      "crystals",
      (s) =>
        s.board.nodes
          .filter((n) => n.kind === "crystal")
          .map((n) => `${spent(mutableView(s), n)}/${n.charges}`)
          .join(",") || "-",
    );
    api.diagnostics.register("solved", (s) => solved(mutableView(s)));
    api.diagnostics.register(
      "pointer",
      (s) =>
        `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
    );
    return [initialState(), debug];
  },
  update(
    state: DeepReadonly<RefractState>,
    api: UpdateApi,
    dt: number,
  ): RefractState {
    let next: RefractState = {
      ...mutableView(state),
      simTime: state.simTime + dt,
    };
    const cues = new Set<string>();
    const cue = (name: string): void => {
      cues.add(name);
    };
    for (const sample of api.input.pointerSamples())
      if (
        sample.primary &&
        (sample.type !== "down" || sample.button === "primary") &&
        (sample.type !== "up" || sample.button === "primary")
      )
        next = pointerEvent(
          next,
          sample.type,
          sample.x,
          sample.y,
          sample.device,
          cue,
        );
    const p = api.input.pointer();
    next = {
      ...next,
      pointer: {
        x: p.x,
        y: p.y,
        down: p.down,
        device: p.device,
      },
    };
    const pressed = Object.fromEntries(
      ACTIONS.map((action) => [action, api.input.pressed(action)]),
    ) as Record<(typeof ACTIONS)[number], boolean>;
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    if (pressed.back) next = goBack(next);
    else if (pressed.clear && next.screen === "playing") {
      if (next.beams.some((b) => b.cells.length > 1)) cue(CUES.clear);
      next = clear(next);
    } else if (pressed.confirm) next = confirm(next);
    else if (next.screen === "select") {
      let index = next.selectIndex;
      if (pressed.left) index = Math.floor(index / 6) * 6 + ((index + 5) % 6);
      if (pressed.right) index = Math.floor(index / 6) * 6 + ((index + 1) % 6);
      if (pressed.up) index = (index + 18) % CAMPAIGN_LENGTH;
      if (pressed.down) index = (index + 6) % CAMPAIGN_LENGTH;
      next = { ...next, selectIndex: index };
    } else if (["title", "solved", "complete"].includes(next.screen)) {
      const count =
        next.screen === "title"
          ? TITLE_ITEMS.length
          : next.screen === "complete"
            ? 2
            : next.mode === "cascade"
              ? 2
              : next.boardIndex === CAMPAIGN_LENGTH - 1
                ? 2
                : 3;
      if (pressed.up)
        next = { ...next, menuIndex: (next.menuIndex + count - 1) % count };
      if (pressed.down)
        next = { ...next, menuIndex: (next.menuIndex + 1) % count };
    }
    cues.forEach((name) => api.audio.play(name));
    return { ...next, muted: api.audio.muted() };
  },
  render(state: DeepReadonly<RefractState>, api: RenderApi): void {
    renderScreen(mutableView(state), api.ctx);
  },
};
