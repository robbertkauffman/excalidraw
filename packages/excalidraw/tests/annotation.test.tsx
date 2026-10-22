import { vi } from "vitest";

import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { AnnotationTrails } from "../annotationTrails";
import { AnimationController } from "../renderer/animation";
import { getNormalizedZoom } from "../scene/normalize";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, GlobalTestState, render, screen } from "./test-utils";

const h = window.h;
const paths = () =>
  Array.from(document.querySelectorAll<SVGPathElement>("[data-annotation]"));
const selectAnnotation = () =>
  act(() => h.app.setActiveTool({ type: "annotation" }));
const clearButton = () =>
  screen.getByRole("button", { name: "Clear annotations" });

describe("persistent annotations", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "draws and clears with %s without scene or history changes",
    async (type) => {
      await render(<Excalidraw />);
      const pointer = new Pointer(type);
      selectAnnotation();
      const historyLength = API.getUndoStack().length;
      expect(clearButton()).toBeDisabled();
      pointer.downAt(40, 40);
      pointer.moveTo(100, 80);
      pointer.upAt(100, 80);
      expect(paths()).toHaveLength(1);
      expect(paths()[0].getAttribute("d")).not.toBe("");
      expect(h.state.activeTool.type).toBe("annotation");
      expect(h.elements).toEqual([]);
      expect(API.getUndoStack()).toHaveLength(historyLength);
      fireEvent.click(clearButton());
      expect(paths()).toHaveLength(0);
      expect(clearButton()).toBeDisabled();
      expect(h.state.activeTool.type).toBe("annotation");
    },
  );

  it("preserves full long strokes and dots beyond the laser decay window without idle animation", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    const animation = vi.spyOn(AnimationController, "start");
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const mouse = new Pointer("mouse");
    mouse.downAt(20, 40);
    for (let index = 1; index <= 100; index++) {
      mouse.moveTo(20 + index * 3, 40 + (index % 2) * 10);
    }
    mouse.upAt();
    mouse.clickAt(80, 100);
    const original = paths().map((path) => path.getAttribute("d"));
    expect(original).toHaveLength(2);
    expect(original.every(Boolean)).toBe(true);
    animation.mockClear();
    now.mockReturnValue(60_000);
    act(() => h.app.annotationTrails.render());
    expect(paths().map((path) => path.getAttribute("d"))).toEqual(original);
    expect(animation).not.toHaveBeenCalled();
    // A late point in a new stroke never truncates the previous one.
    mouse.clickAt(120, 120);
    expect(paths()[0].getAttribute("d")).toBe(original[0]);
    animation.mockRestore();
    now.mockRestore();
  });

  it.each(["desktop", "phone"] as const)(
    "exposes accessible annotation controls on %s",
    async (formFactor) => {
      await render(
        <Excalidraw UIOptions={{ getFormFactor: () => formFactor }} />,
      );
      const trigger = () =>
        document.querySelector<HTMLButtonElement>(
          ".App-toolbar__extra-tools-trigger",
        )!;
      fireEvent.click(trigger());
      fireEvent.click(
        screen.getByRole("menuitemradio", { name: "Annotation" }),
      );
      expect(h.state.activeTool.type).toBe("annotation");
      fireEvent.click(trigger());
      expect(
        screen
          .getByRole("menuitemradio", { name: "Annotation" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      fireEvent.click(
        screen.getByRole("menuitemradio", { name: "Annotation" }),
      );
      new Pointer("mouse").clickAt(40, 40);
      act(() => h.app.setActiveTool({ type: "selection" }));
      fireEvent.click(clearButton());
      expect(paths()).toHaveLength(0);
      API.setAppState({ viewModeEnabled: true });
      fireEvent.click(screen.getByRole("button", { name: "Annotation" }));
      expect(
        screen
          .getByRole("button", { name: "Annotation" })
          .getAttribute("aria-pressed"),
      ).toBe("true");
    },
  );

  it("preserves fading laser geometry and timing", async () => {
    await render(<Excalidraw />);
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    act(() => {
      h.app.laserTrails.startPath(20, 20);
      h.app.laserTrails.addPointToPath(50, 50);
    });
    const trail = h.app.laserTrails.localTrail.getCurrentTrail()!;
    expect(trail.getStrokeOutline().length).toBeGreaterThan(0);
    now.mockReturnValue(1001);
    expect(trail.getStrokeOutline()).toEqual([]);
    now.mockRestore();
  });

  it("keeps annotations across tool changes and clears only annotations", async () => {
    await render(<Excalidraw />);
    const rectangle = API.createElement({ type: "rectangle" });
    API.setElements([rectangle]);
    const mouse = new Pointer("mouse");
    selectAnnotation();
    mouse.clickAt(40, 40);
    const original = paths()[0].getAttribute("d");
    act(() => h.app.setActiveTool({ type: "laser" }));
    mouse.downAt(150, 150);
    mouse.moveTo(200, 200);
    mouse.upAt();
    expect(paths()[0].getAttribute("d")).toBe(original);
    const clearLaser = vi.spyOn(h.app.laserTrails.localTrail, "clearTrails");
    fireEvent.click(clearButton());
    expect(paths()).toHaveLength(0);
    expect(h.elements).toEqual([rectangle]);
    expect(clearLaser).not.toHaveBeenCalled();
    expect(h.state.activeTool.type).toBe("laser");
    clearLaser.mockRestore();
  });

  it.each(["mouse", "pen", "touch"] as const)(
    "supports %s annotations in view mode without panning",
    async (type) => {
      await render(<Excalidraw viewModeEnabled />);
      fireEvent.click(screen.getByRole("button", { name: "Annotation" }));
      const { scrollX, scrollY } = h.state;
      const pointer = new Pointer(type);
      pointer.downAt(40, 40);
      pointer.moveTo(100, 80);
      pointer.upAt();
      expect(paths()).toHaveLength(1);
      expect([h.state.scrollX, h.state.scrollY]).toEqual([scrollX, scrollY]);
      expect(h.elements).toEqual([]);
      fireEvent.click(clearButton());
      expect(paths()).toHaveLength(0);
    },
  );

  it("tracks viewport transforms and editor offsets", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    new Pointer("mouse").clickAt(40, 40);
    const original = paths()[0].getAttribute("d");
    API.setAppState({
      scrollX: 50,
      scrollY: 30,
      zoom: { value: getNormalizedZoom(2) },
      offsetLeft: 25,
      offsetTop: 35,
    });
    expect(paths()[0].getAttribute("d")).not.toBe(original);
    API.setAppState({
      scrollX: 0,
      scrollY: 0,
      zoom: { value: getNormalizedZoom(1) },
      offsetLeft: 0,
      offsetTop: 0,
    });
    expect(paths()[0].getAttribute("d")).toBe(original);
  });

  it("keeps short strokes visible above 400% zoom", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    mouse.downAt(40, 40);
    mouse.upAt(60, 60);
    API.setAppState({ zoom: { value: getNormalizedZoom(5) } });
    expect(paths()[0].getAttribute("d")).not.toBe("");
  });

  it("cleans up cancellation after switching tools mid-stroke", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    mouse.downAt(40, 40);
    act(() => h.app.setActiveTool({ type: "selection" }));
    fireEvent.pointerCancel(GlobalTestState.interactiveCanvas, {
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(paths()).toHaveLength(0);
    expect(h.state.cursorButton).toBe("up");
    selectAnnotation();
    mouse.clickAt(60, 60);
    expect(paths()).toHaveLength(1);
  });

  it("clears a mid-stroke path immediately and cannot resurrect it on pointerup", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    mouse.downAt(40, 40);
    fireEvent.click(clearButton());
    mouse.moveTo(80, 80);
    mouse.upAt();
    expect(paths()).toHaveLength(0);
    act(() => h.app.annotationTrails.clear());
    expect(paths()).toHaveLength(0);
  });

  it("cancels pointer interactions and accepts the next stroke", async () => {
    await render(<Excalidraw />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    mouse.downAt(40, 40);
    fireEvent.pointerCancel(GlobalTestState.interactiveCanvas, {
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(paths()).toHaveLength(0);
    expect(h.state.cursorButton).toBe("up");
    mouse.clickAt(80, 80);
    expect(paths()).toHaveLength(1);
  });

  it("does not annotate space-drag, middle-drag, or two-finger navigation", async () => {
    await render(<Excalidraw handleKeyboardGlobally autoFocus />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    Keyboard.keyDown(" ");
    mouse.downAt(40, 40);
    mouse.moveTo(60, 60);
    mouse.upAt();
    Keyboard.keyUp(" ");
    expect(paths()).toHaveLength(0);
    fireEvent.pointerDown(GlobalTestState.interactiveCanvas, {
      button: 1,
      pointerId: 1,
      clientX: 40,
      clientY: 40,
    });
    fireEvent.pointerUp(GlobalTestState.interactiveCanvas, {
      button: 1,
      pointerId: 1,
      clientX: 60,
      clientY: 60,
    });
    expect(paths()).toHaveLength(0);
    const first = new Pointer("touch", 2);
    const second = new Pointer("touch", 3);
    first.downAt(40, 40);
    second.downAt(80, 80);
    first.moveTo(30, 30);
    second.moveTo(100, 100);
    first.upAt();
    second.upAt();
    expect(paths()).toHaveLength(0);
  });

  it("respects forced tools, disabled interaction and hidden UI", async () => {
    const result = await render(
      <Excalidraw activeTool={{ type: "annotation" }} ui={false} />,
    );
    expect(h.state.activeTool.type).toBe("annotation");
    expect(screen.queryByRole("button", { name: "Annotation" })).toBeNull();
    const mouse = new Pointer("mouse");
    mouse.clickAt(40, 40);
    expect(paths()).toHaveLength(1);
    act(() => h.app.setActiveTool({ type: "laser" }));
    expect(h.state.activeTool.type).toBe("annotation");
    result.rerender(
      <Excalidraw activeTool={{ type: "annotation" }} interaction={false} />,
    );
    expect(h.state.activeTool.type).toBe("selection");
    expect(screen.queryByRole("button", { name: "Annotation" })).toBeNull();
    mouse.clickAt(80, 80);
    expect(paths()).toHaveLength(1);
  });

  it("isolates editor overlays and releases marks on scene replacement, reset and unmount", async () => {
    const result = await render(<Excalidraw />);
    selectAnnotation();
    const mouse = new Pointer("mouse");
    mouse.clickAt(40, 40);
    const other = new AnnotationTrails(h.app);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    other.start(svg);
    other.startPath(10, 10);
    other.endPath();
    fireEvent.click(clearButton());
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    mouse.clickAt(40, 40);
    API.updateScene({ elements: [API.createElement({ type: "rectangle" })] });
    expect(paths()).toHaveLength(1);
    API.updateScene({ elements: [] });
    expect(paths()).toHaveLength(1);
    act(() =>
      h.app.syncActionResult({
        elements: [],
        files: {},
        replaceFiles: true,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      }),
    );
    expect(paths()).toHaveLength(0);
    mouse.clickAt(40, 40);
    act(() => h.app.api.resetScene());
    expect(paths()).toHaveLength(0);
    selectAnnotation();
    mouse.clickAt(40, 40);
    const annotations = h.app.annotationTrails;
    result.unmount();
    expect(annotations.hasAnnotations()).toBe(false);
    other.stop();
    expect(other.hasAnnotations()).toBe(false);
    expect(svg.children).toHaveLength(0);
  });
});
