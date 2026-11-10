import { vi } from "vitest";

import { CODES, KEYS } from "@excalidraw/common";

import { Excalidraw } from "../index";
import { actionClearAnnotations } from "../actions";
import { restoreAppState } from "../data/restore";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, fireEvent, render, waitFor } from "./test-utils";

import type { Collaborator, ExcalidrawProps, SocketId } from "../types";

const { h } = window;
const mouse = new Pointer("mouse");

const getSvgPaths = () =>
  Array.from(document.querySelectorAll<SVGPathElement>(".SVGLayer svg path"));

const getRenderedPathData = () =>
  getSvgPaths()
    .map((path) => path.getAttribute("d") ?? "")
    .join(" ")
    .trim();

const drawStroke = (from = [100, 100], to = [180, 160]) => {
  mouse.downAt(from[0], from[1]);
  mouse.moveTo((from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  mouse.moveTo(to[0], to[1]);
  mouse.upAt(to[0], to[1]);
};

/** wait until the trail animation loops have settled */
const flushFrames = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

const pressClearShortcut = () => {
  Keyboard.withModifierKeys({ alt: true }, () => {
    Keyboard.codeDown(CODES.K);
  });
};

describe("annotation tool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is activated with Shift+K while plain K keeps activating the laser", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    Keyboard.withModifierKeys({ shift: true }, () => {
      Keyboard.keyPress(KEYS.K);
    });
    expect(h.state.activeTool.type).toBe("annotation");

    Keyboard.keyPress(KEYS.K);
    expect(h.state.activeTool.type).toBe("laser");
  });

  it("is activated from the extra-tools menu", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    UI.clickExtraTool("annotation");
    expect(h.state.activeTool.type).toBe("annotation");
  });

  it("draws persistent strokes that aren't scene elements", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });

    drawStroke();
    await flushFrames();

    expect(h.elements.length).toBe(0);
    expect(h.state.activeTool.type).toBe("annotation");
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);
    expect(getRenderedPathData()).not.toBe("");
  });

  it("doesn't fade, unlike the laser", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    await flushFrames();

    act(() => {
      h.app.setActiveTool({ type: "laser" });
    });
    drawStroke([300, 300], [380, 360]);

    const laserTrail = h.app.laserTrails.localTrail as unknown as {
      trailElement: SVGPathElement;
    };
    expect(laserTrail.trailElement.isConnected).toBe(true);

    const now = performance.now();
    vi.spyOn(performance, "now").mockImplementation(() => now + 5000);

    // laser regression: its trail decays and is removed
    await waitFor(() => {
      expect(laserTrail.trailElement.isConnected).toBe(false);
    });

    act(() => {
      h.app.annotationTrails.redraw();
    });
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);
    expect(getRenderedPathData()).not.toBe("");
  });

  it("keeps annotations across tool switches and follows the viewport", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    await flushFrames();
    const initialPathData = getRenderedPathData();

    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h.state.activeTool.type).toBe("selection");
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);
    expect(getRenderedPathData()).toBe(initialPathData);

    API.setAppState({ scrollX: h.state.scrollX + 50 });
    await flushFrames();

    expect(h.app.annotationTrails.hasAnnotations).toBe(true);
    const pannedPathData = getRenderedPathData();
    expect(pannedPathData).not.toBe("");
    expect(pannedPathData).not.toBe(initialPathData);
  });

  it("clears all annotations with Alt+K", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    drawStroke([200, 200], [260, 240]);
    await flushFrames();
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);

    pressClearShortcut();

    expect(h.app.annotationTrails.hasAnnotations).toBe(false);
    expect(getRenderedPathData()).toBe("");
    expect(h.state.activeTool.type).toBe("annotation");
  });

  it("clears all annotations via the action", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    await flushFrames();

    act(() => {
      h.app.actionManager.executeAction(actionClearAnnotations);
    });

    expect(h.app.annotationTrails.hasAnnotations).toBe(false);
    expect(getRenderedPathData()).toBe("");
  });

  it("shows a clear button only while annotations exist", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    const queryClearButton = () =>
      document.querySelector("[data-testid='clear-annotations-button']");

    expect(queryClearButton()).toBeNull();

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    await flushFrames();

    await waitFor(() => {
      expect(queryClearButton()).not.toBeNull();
    });

    fireEvent.click(queryClearButton()!);

    expect(h.app.annotationTrails.hasAnnotations).toBe(false);
    await waitFor(() => {
      expect(queryClearButton()).toBeNull();
    });
  });

  it("doesn't add history entries", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();
    pressClearShortcut();

    expect(h.history.isUndoStackEmpty).toBe(true);
    expect(h.history.isRedoStackEmpty).toBe(true);
  });

  it("works in view mode without panning", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    API.setAppState({ viewModeEnabled: true });

    Keyboard.withModifierKeys({ shift: true }, () => {
      Keyboard.keyPress(KEYS.K);
    });
    expect(h.state.activeTool.type).toBe("annotation");

    const initialScrollX = h.state.scrollX;
    const initialScrollY = h.state.scrollY;

    drawStroke();
    await flushFrames();

    expect(h.state.scrollX).toBe(initialScrollX);
    expect(h.state.scrollY).toBe(initialScrollY);
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);

    pressClearShortcut();
    expect(h.app.annotationTrails.hasAnnotations).toBe(false);
  });

  it("broadcasts the annotation tool and clear count to collaborators", async () => {
    const onPointerUpdate =
      vi.fn<NonNullable<ExcalidrawProps["onPointerUpdate"]>>();
    await render(
      <Excalidraw
        handleKeyboardGlobally={true}
        onPointerUpdate={onPointerUpdate}
      />,
    );

    act(() => {
      h.app.setActiveTool({ type: "annotation" });
    });
    drawStroke();

    const pointers = onPointerUpdate.mock.calls.map(([{ pointer }]) => pointer);
    expect(pointers.length).toBeGreaterThan(0);
    expect(pointers.every((pointer) => pointer.tool === "annotation")).toBe(
      true,
    );
    expect(
      pointers.every((pointer) => pointer.annotationClearCount === undefined),
    ).toBe(true);

    onPointerUpdate.mockClear();
    pressClearShortcut();

    expect(onPointerUpdate).toHaveBeenCalled();
    expect(onPointerUpdate.mock.lastCall![0].pointer.annotationClearCount).toBe(
      1,
    );
  });

  it("renders persistent collaborator annotations and clears them", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    const annotatorId = "annotator" as SocketId;
    const laserId = "laser" as SocketId;
    const annotator = (
      x: number,
      y: number,
      button: "up" | "down",
      annotationClearCount?: number,
    ): Collaborator => ({
      pointer: { x, y, tool: "annotation", annotationClearCount },
      button,
    });
    const laserUser: Collaborator = {
      pointer: { x: 10, y: 10, tool: "laser" },
      button: "down",
    };

    const update = (collaborators: Map<SocketId, Collaborator>) =>
      act(() => {
        h.app.updateScene({ collaborators });
      });

    update(
      new Map([
        [annotatorId, annotator(10, 10, "down")],
        [laserId, laserUser],
      ]),
    );
    update(
      new Map([
        [annotatorId, annotator(60, 60, "down")],
        [laserId, laserUser],
      ]),
    );
    update(
      new Map([
        [annotatorId, annotator(80, 90, "up")],
        [laserId, laserUser],
      ]),
    );
    await flushFrames();

    expect(h.app.annotationTrails.hasAnnotations).toBe(true);
    const annotationPathData = getRenderedPathData();
    expect(annotationPathData).not.toBe("");

    // the collaborator cleared their annotations
    update(
      new Map([
        [annotatorId, annotator(80, 90, "up", 1)],
        [laserId, laserUser],
      ]),
    );
    expect(h.app.annotationTrails.hasAnnotations).toBe(false);

    // and draws again, then leaves
    update(new Map([[annotatorId, annotator(10, 10, "down", 1)]]));
    update(new Map([[annotatorId, annotator(40, 40, "up", 1)]]));
    expect(h.app.annotationTrails.hasAnnotations).toBe(true);

    update(new Map());
    expect(h.app.annotationTrails.hasAnnotations).toBe(false);
  });

  it("doesn't restore an active annotation tool", () => {
    const restored = restoreAppState(
      {
        activeTool: {
          type: "annotation",
          customType: null,
          locked: false,
          fromSelection: false,
          lastActiveTool: null,
        },
      },
      null,
    );
    expect(restored.activeTool.type).toBe("selection");
  });
});
