import {
  CAMPAIGN_LENGTH,
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  TIERS,
} from "./constants";
import type { BoardState, Channel, NodeState } from "./game";

export const CAMPAIGN: readonly (readonly string[])[] = [
  [".Tt", "ttT", ".tt"],
  [".tt", "TtT", "tt."],
  ["tTtt", "ttTt", "ttt."],
  ["Tt.t", "tTtt", ".ttt"],
  [".tTt", ".ttt", "ttTt", "tttt"],
  ["tttT", "ttt.", "t.tt", "ttTt"],
  ["STtt", "sstt", "ssTt", "Sss."],
  ["Sst..", "stTtt", "ssttt", "SsstT"],
  ["tSss", "2tss", "Ttss", "tTS."],
  ["Tt.T.", "ttt..", "t2sSs", "tSsss"],
  ["..t.s", "ttT2s", "ttS2S", "t.Tss"],
  ["Tttt.", "ttsSt", ".22t.", "ssST."],
  [".Ddd", "tTdD", "t22.", "tsSs", "T.S."],
  ["..tT.", "t2dD.", "T2t.s", "d2sss", "DSssS"],
  [".T.2t", "sDttt", "sS2Td", "ss22D", ".S.d."],
  ["..ttt", ".S2tt", "DsTsT", "d22d.", "SddD."],
  ["...ttd", "S2Ttdd", "t32Ddd", "Tss2d.", "sS.dD."],
  ["T.....", "ttDsss", "dd3222", ".dt3Ss", "DddTSs"],
  [".Dttt", ".dd3t", ".d2TT", "S2s2D", ".sSss"],
  [".S.tT.", "s2ttDd", "s2T2.d", "s22d3.", "ssSddD"],
  ["S2D..T", "d2ssts", ".D3S3s", ".dT32t", ".d2tt."],
  [".tt2d.", ".t2t2d", "t1DdSd", "2.S3dD", "TT2sd.", ".ssss."],
  ["s2SST..", "2232.t.", "stTsttt", "..t.t.t", "d22ttdD", "dD2dddd"],
  ["ssdd.d.", "2S.dd2d", "ssD..d.", "t2ttTdd", ".t323Dd", "ttT2sS."],
];
if (CAMPAIGN.length !== CAMPAIGN_LENGTH) throw new Error("Campaign length");

const symbols: Record<
  string,
  { kind: NodeState["kind"]; channel: Channel | null; charges: number | null }
> = {
  T: { kind: "emitter", channel: "triangle", charges: null },
  S: { kind: "emitter", channel: "square", charges: null },
  D: { kind: "emitter", channel: "diamond", charges: null },
  t: { kind: "lens", channel: "triangle", charges: null },
  s: { kind: "lens", channel: "square", charges: null },
  d: { kind: "lens", channel: "diamond", charges: null },
  "1": { kind: "crystal", channel: null, charges: 1 },
  "2": { kind: "crystal", channel: null, charges: 2 },
  "3": { kind: "crystal", channel: null, charges: 3 },
};
export function parseBoard(rows: readonly string[]): BoardState {
  const cols = rows[0]?.length ?? 0;
  if (
    !cols ||
    cols > GRID_MAX_COLS ||
    !rows.length ||
    rows.length > GRID_MAX_ROWS ||
    rows.some((r) => r.length !== cols)
  )
    throw new Error("Invalid board dimensions");
  const nodes: NodeState[] = [];
  rows.forEach((line, row) =>
    [...line].forEach((char, col) => {
      if (char === ".") return;
      const node = symbols[char];
      if (!node) throw new Error(`Invalid board notation: ${char}`);
      nodes.push({ col, row, ...node });
    }),
  );
  return { cols, rows: rows.length, nodes };
}
export function channelsOf(board: BoardState): Channel[] {
  return CHANNELS.filter((channel) =>
    board.nodes.some((node) => node.channel === channel),
  );
}

// These templates meet the corresponding tier's route and solution bounds.
// Empty border cells, transposition, and reflection preserve their solutions
// and all five difficulty measures while allowing every grid size in the ladder.
const transpose = (rows: readonly string[]): string[] =>
  Array.from({ length: rows[0].length }, (_, col) =>
    rows.map((row) => row[col]).join(""),
  );
const padRight = (rows: readonly string[]): string[] =>
  rows.map((row) => row + ".");
const padBottom = (rows: readonly string[]): string[] => [
  ...rows,
  ".".repeat(rows[0].length),
];
const tier3Small = ["tSss", "22ss", "Ttss", "tTS."];
const tier4Compact = [".2ttT", "DT2s.", "dd2SS", "dD.s."];
const tier5Large = [".tt2dd", ".t2t2d", "t1D.dd", "2.S3dD", "TT2sS.", ".ssss."];
type TemplatePool = Readonly<Record<string, readonly (readonly string[])[]>>;
const cascadePools: readonly TemplatePool[] = [
  {
    "3x3": CAMPAIGN.slice(0, 2),
    "4x3": CAMPAIGN.slice(2, 4),
    "3x4": CAMPAIGN.slice(2, 4).map(transpose),
    "4x4": CAMPAIGN.slice(4, 6),
  },
  {
    "4x4": [CAMPAIGN[6], CAMPAIGN[8]],
    "5x4": [CAMPAIGN[7], CAMPAIGN[9]],
  },
  {
    "4x4": [tier3Small],
    "5x4": CAMPAIGN.slice(10, 12),
    "4x5": CAMPAIGN.slice(10, 12).map(transpose),
    "5x5": CAMPAIGN.slice(10, 12).map(padBottom),
  },
  {
    "5x4": [tier4Compact],
    "6x4": [padRight(tier4Compact)],
    "5x5": [CAMPAIGN[13]],
    "6x5": [padRight(CAMPAIGN[13]), CAMPAIGN[16]],
  },
  {
    "6x5": [CAMPAIGN[20]],
    "7x5": [padRight(CAMPAIGN[20])],
    "6x6": [tier5Large],
    "7x6": [padRight(tier5Large)],
  },
];
export function generateBoard(tier: number): BoardState {
  const rung = TIERS[tier - 1];
  if (!rung) throw new Error(`Invalid tier: ${tier}`);
  const cols =
    rung.minCols +
    Math.floor(Math.random() * (rung.maxCols - rung.minCols + 1));
  const rowsCount =
    rung.minRows +
    Math.floor(Math.random() * (rung.maxRows - rung.minRows + 1));
  const pool = cascadePools[tier - 1][`${cols}x${rowsCount}`];
  if (!pool)
    throw new Error(`Missing cascade templates for ${cols}x${rowsCount}`);
  const source = pool[Math.floor(Math.random() * pool.length)];
  const oriented =
    cols === rowsCount && Math.random() < 0.5 ? transpose(source) : [...source];
  const flipX = Math.random() < 0.5;
  const flipY = Math.random() < 0.5;
  const rows = flipY ? [...oriented].reverse() : oriented;
  return parseBoard(
    flipX ? rows.map((row) => [...row].reverse().join("")) : rows,
  );
}
