import { DEFAULT_LASER_COLOR } from "@excalidraw/common";

import type { LaserPointerOptions } from "@excalidraw/laser-pointer";

import { AnimatedTrail } from "./animatedTrail";
import { getClientColor } from "./clients";
import { atom, editorJotaiStore } from "./editor-jotai";

import type { AnimatedTrailOptions, Trail } from "./animatedTrail";
import type App from "./components/App";
import type { SocketId } from "./types";

/** whether any (local or collaborator) annotation is currently rendered */
export const annotationsPresentAtom = atom(false);

/**
 * Laser-like strokes that don't fade and stay rendered until cleared. They're
 * a temporary SVG overlay — never scene elements — so they aren't saved,
 * exported or part of the undo history.
 */
export class AnnotationTrails implements Trail {
  public localTrail: AnimatedTrail;
  /** number of times the local user cleared annotations, sent to peers */
  public localClearCount = 0;
  private collabTrails = new Map<SocketId, AnimatedTrail>();
  private collabClearCounts = new Map<SocketId, number | undefined>();
  private container?: SVGSVGElement;
  private annotationsPresent = false;

  constructor(private app: App) {
    this.localTrail = new AnimatedTrail(app, {
      ...this.getTrailOptions(),
      fill: () => DEFAULT_LASER_COLOR,
    });
  }

  private getTrailOptions(): Partial<LaserPointerOptions> &
    Partial<AnimatedTrailOptions> {
    return {
      simplify: 0,
      streamline: 0.4,
      sizeMapping: () => 1,
      persistent: true,
    };
  }

  get hasAnnotations() {
    if (this.localTrail.hasTrails) {
      return true;
    }
    for (const trail of this.collabTrails.values()) {
      if (trail.hasTrails) {
        return true;
      }
    }
    return false;
  }

  private syncAnnotationsPresent() {
    const present = this.hasAnnotations;
    if (present !== this.annotationsPresent) {
      this.annotationsPresent = present;
      this.app.updateEditorAtom(annotationsPresentAtom, present);
    }
  }

  startPath(x: number, y: number): void {
    this.localTrail.startPath(x, y);
    this.syncAnnotationsPresent();
  }

  addPointToPath(x: number, y: number): void {
    this.localTrail.addPointToPath(x, y);
  }

  endPath(): void {
    this.localTrail.endPath();
  }

  start(container: SVGSVGElement) {
    this.container = container;
    this.localTrail.start(container);
    for (const trail of this.collabTrails.values()) {
      trail.start(container);
    }
  }

  stop() {
    this.localTrail.stop();
    for (const trail of this.collabTrails.values()) {
      trail.stop();
    }
    this.collabTrails.clear();
    this.collabClearCounts.clear();
    this.container = undefined;
    if (this.annotationsPresent) {
      // the editor is going away, so don't trigger a re-render
      this.annotationsPresent = false;
      editorJotaiStore.set(annotationsPresentAtom, false);
    }
  }

  /** re-render all annotations, e.g. after the viewport changed */
  redraw() {
    this.localTrail.redraw();
    for (const trail of this.collabTrails.values()) {
      trail.redraw();
    }
  }

  /**
   * Clears all annotations rendered locally (own and collaborators') and
   * bumps `localClearCount` so peers drop the local user's annotations.
   */
  clear() {
    this.localTrail.clearTrails();
    for (const trail of this.collabTrails.values()) {
      trail.clearTrails();
    }
    this.localClearCount++;
    this.syncAnnotationsPresent();
  }

  private stopCollabTrails(collaborators?: App["state"]["collaborators"]) {
    for (const [key, trail] of this.collabTrails) {
      if (!collaborators?.has(key)) {
        trail.stop();
        this.collabTrails.delete(key);
      }
    }
    for (const key of this.collabClearCounts.keys()) {
      if (!collaborators?.has(key)) {
        this.collabClearCounts.delete(key);
      }
    }
  }

  updateCollabTrails(collaborators: App["state"]["collaborators"]) {
    this.stopCollabTrails(collaborators);

    if (!this.container || collaborators.size === 0) {
      this.syncAnnotationsPresent();
      return;
    }

    for (const [key, collaborator] of collaborators.entries()) {
      // Current user has their own trail drawn via localTrail
      if (collaborator.isCurrentUser) {
        continue;
      }

      // on first sight, only remember the clear count (nothing to clear yet)
      const clearCount = collaborator.pointer?.annotationClearCount;
      if (!this.collabClearCounts.has(key)) {
        this.collabClearCounts.set(key, clearCount);
      } else if (clearCount !== this.collabClearCounts.get(key)) {
        this.collabClearCounts.set(key, clearCount);
        if (clearCount !== undefined) {
          this.collabTrails.get(key)?.clearTrails();
        }
      }

      const isAnnotating = collaborator.pointer?.tool === "annotation";
      let trail = this.collabTrails.get(key);
      if (!trail) {
        if (!isAnnotating) {
          continue;
        }
        trail = new AnimatedTrail(this.app, {
          ...this.getTrailOptions(),
          fill: () =>
            collaborator.pointer?.laserColor ||
            getClientColor(key, collaborator),
        });
        trail.start(this.container);

        this.collabTrails.set(key, trail);
      }

      if (collaborator.pointer && isAnnotating) {
        const buttonDown = collaborator.button === "down";
        const buttonUp = collaborator.button === "up";
        const hasTrail = trail.hasCurrentTrail;

        if (buttonDown && !hasTrail) {
          trail.startPath(collaborator.pointer.x, collaborator.pointer.y);
        }

        const lastPointOriginal = !trail.hasLastPoint(
          collaborator.pointer.x,
          collaborator.pointer.y,
        );
        if (buttonDown && lastPointOriginal) {
          trail.addPointToPath(collaborator.pointer.x, collaborator.pointer.y);
        }

        if (buttonUp && hasTrail) {
          trail.addPointToPath(collaborator.pointer.x, collaborator.pointer.y);
          trail.endPath();
        }
      } else if (trail.hasCurrentTrail) {
        // collaborator switched tools mid-stroke
        trail.endPath();
      }
    }

    this.syncAnnotationsPresent();
  }
}
