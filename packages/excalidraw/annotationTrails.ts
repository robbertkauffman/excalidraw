import { LaserPointer } from "@excalidraw/laser-pointer";
import {
  DEFAULT_LASER_COLOR,
  SVG_NS,
  getSvgPathFromStroke,
  sceneCoordsToViewportCoords,
} from "@excalidraw/common";

import type { Trail } from "./animatedTrail";
import type App from "./components/App";

type Annotation = { points: [number, number][]; element: SVGPathElement };

/** Local, scene-coordinate presentation marks. Never part of the scene/store. */
export class AnnotationTrails implements Trail {
  private annotations: Annotation[] = [];
  private current?: Annotation;
  private container?: SVGSVGElement;
  private listeners = new Set<() => void>();

  constructor(private app: App) {}

  hasAnnotations = () => this.annotations.length > 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  start(container: SVGSVGElement) {
    this.container = container;
    this.render();
  }

  stop() {
    this.clear();
    this.container = undefined;
  }

  startPath(x: number, y: number) {
    this.endPath();
    const element = document.createElementNS(SVG_NS, "path");
    element.setAttribute("fill", DEFAULT_LASER_COLOR);
    element.setAttribute("data-annotation", "true");
    this.current = { points: [[x, y]], element };
    this.annotations.push(this.current);
    this.container?.appendChild(element);
    this.draw(this.current);
    this.notify();
  }

  addPointToPath(x: number, y: number) {
    if (this.current) {
      const lastPoint = this.current.points[this.current.points.length - 1];
      if (lastPoint[0] !== x || lastPoint[1] !== y) {
        this.current.points.push([x, y]);
        this.draw(this.current);
      }
    }
  }

  endPath() {
    if (this.current) {
      this.current = undefined;
    }
  }

  cancelPath() {
    if (this.current) {
      this.current.element.remove();
      this.annotations = this.annotations.filter((a) => a !== this.current);
      this.current = undefined;
      this.notify();
    }
  }

  clear = () => {
    for (const annotation of this.annotations) {
      annotation.element.remove();
    }
    this.annotations = [];
    this.current = undefined;
    this.notify();
  };

  /** Called only on input or viewport changes; no idle animation loop. */
  render() {
    for (const annotation of this.annotations) {
      this.container?.appendChild(annotation.element);
      this.draw(annotation);
    }
  }

  private draw({ points, element }: Annotation) {
    // Build geometry in viewport coordinates: constant screen width also avoids
    // LaserPointer's subpixel-size cutoff at high zoom levels.
    const trail = new LaserPointer({ simplify: 0, streamline: 0.4 });
    for (const [x, y] of points) {
      const point = sceneCoordsToViewportCoords(
        { sceneX: x, sceneY: y },
        this.app.state,
      );
      trail.addPoint([point.x, point.y, 0]);
    }
    // LaserPointer has no outline until its second distinct point. Render a
    // circle explicitly so a tap is a persistent mark, not a clear gesture.
    const outline =
      points.length === 1
        ? Array.from({ length: 32 }, (_, index) => {
            const angle = (index * Math.PI) / 16;
            return [
              trail.originalPoints[0][0] + Math.cos(angle) * trail.options.size,
              trail.originalPoints[0][1] + Math.sin(angle) * trail.options.size,
            ];
          })
        : trail.getStrokeOutline();
    element.setAttribute("d", getSvgPathFromStroke(outline, true));
  }
}
