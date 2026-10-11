import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { describe, expect, it } from "vitest";
import { CHANNELS, STAGE_H, STAGE_W, TIERS } from "./constants";
import { CAMPAIGN, parseBoard } from "./boards";
import { BACKGROUND, game } from "./game";

async function setup() {
  const events = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    clock: new ConstantClock(1000 / 60),
    surface: {
      cssWidth: () => STAGE_W,
      cssHeight: () => STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  return engine;
}

describe("Refract simulation", () => {
  it("parses all campaign boards and rejects malformed notation", () => {
    expect(CAMPAIGN).toHaveLength(24);
    for (const rows of CAMPAIGN)
      expect(parseBoard(rows).nodes.length).toBeGreaterThan(0);
    expect(() => parseBoard(["T?T"])).toThrow();
    expect(() => parseBoard(["TT", "T"])).toThrow();
  });
  it("draws, retracts, resumes and solves a beam without frames", async () => {
    const engine = await setup();
    const d = engine.debug;
    engine.apply((s) => d.loadBoard(s, ["TtT"]));
    engine.apply((s) => d.pointerDown(s, 544, 392));
    engine.apply((s) => d.pointerMove(s, 640, 392));
    expect(d.snapshot(engine.state).beams.triangle?.cells).toHaveLength(2);
    engine.apply((s) => d.pointerMove(s, 544, 392));
    expect(d.snapshot(engine.state).beams.triangle?.cells).toHaveLength(1);
    engine.apply((s) => d.pointerMove(s, 640, 392));
    engine.apply((s) => d.pointerUp(s));
    engine.apply((s) => d.pointerDown(s, 640, 392));
    engine.apply((s) => d.pointerMove(s, 736, 392));
    expect(d.snapshot(engine.state).solved).toBe(true);
    expect(engine.state.screen).toBe("solved");
    expect(engine.state.solvedBoards).toEqual([0]);
    engine.destroy();
  });
  it("enforces exclusivity, crystal capacity, and clear", async () => {
    const engine = await setup();
    const d = engine.debug;
    engine.apply((s) => d.loadBoard(s, ["T1T", "S.S"]));
    engine.apply((s) => d.pointerDown(s, 544, 344));
    engine.apply((s) => d.pointerMove(s, 640, 344));
    expect(
      d.snapshot(engine.state).board.nodes.find((n) => n.kind === "crystal")
        ?.spent,
    ).toBe(1);
    engine.apply((s) => d.pointerMove(s, 640, 344));
    expect(d.snapshot(engine.state).beams.triangle?.cells).toHaveLength(2);
    engine.apply((s) => d.clear(s));
    expect(d.snapshot(engine.state).beams.triangle?.cells).toHaveLength(0);
    engine.destroy();
  });
  it("advances simulation time independently of screen and exposes diagnostics", async () => {
    const engine = await setup();
    await engine.advance(60);
    expect(engine.state.simTime).toBeCloseTo(1);
    expect(engine.diagnostics().map((r) => r.name)).toContain("solved");
    engine.apply((s) => engine.debug.setScreen(s, "howto"));
    await engine.advance(60);
    expect(engine.state.simTime).toBeCloseTo(2);
    engine.destroy();
  });
});

it("generated boards stay inside their tier shape and piece limits", async () => {
  const engine = await setup();
  for (let tier = 1; tier <= 5; tier++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      engine.apply((s) => engine.debug.generateBoard(s, tier));
      const board = engine.state.board;
      const spec = TIERS[tier - 1];
      const crystals = board.nodes.filter((n) => n.kind === "crystal");
      expect(board.cols).toBeGreaterThanOrEqual(spec.minCols);
      expect(board.cols).toBeLessThanOrEqual(spec.maxCols);
      expect(board.rows).toBeGreaterThanOrEqual(spec.minRows);
      expect(board.rows).toBeLessThanOrEqual(spec.maxRows);
      expect(crystals.length).toBeGreaterThanOrEqual(spec.minCrystals);
      expect(crystals.length).toBeLessThanOrEqual(spec.maxCrystals);
      expect(board.cols * board.rows - board.nodes.length).toBeLessThanOrEqual(
        spec.maxEmptyCells,
      );
      expect(
        CHANNELS.filter((c) => board.nodes.some((n) => n.channel === c)),
      ).toHaveLength(spec.channels);
      for (const crystal of crystals) {
        expect(crystal.charges).toBeGreaterThanOrEqual(spec.minCharges);
        expect(crystal.charges).toBeLessThanOrEqual(spec.maxCharges);
      }
    }
  }
  engine.destroy();
});

it("solves campaign board one with the route shown in the replay", async () => {
  const engine = await setup();
  const d = engine.debug;
  engine.apply((s) => d.loadBoard(s, CAMPAIGN[0]));
  const route: [number, number][] = [
    [1, 0],
    [2, 0],
    [1, 1],
    [0, 1],
    [1, 2],
    [2, 2],
    [2, 1],
  ];
  const point = ([col, row]: [number, number]) => ({
    x: 544 + col * 96,
    y: 296 + row * 96,
  });
  const start = point(route[0]);
  engine.apply((s) => d.pointerDown(s, start.x, start.y));
  for (const cell of route.slice(1)) {
    const p = point(cell);
    engine.apply((s) => d.pointerMove(s, p.x, p.y));
  }
  expect(d.snapshot(engine.state).solved).toBe(true);
  expect(engine.state.screen).toBe("solved");
  engine.destroy();
});
