import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { TrashIcon } from "../components/icons";

import { register } from "./register";

export const actionClearAnnotations = register({
  name: "clearAnnotations",
  label: "buttons.clearAnnotations",
  icon: TrashIcon,
  viewMode: true,
  trackEvent: { category: "toolbar" },
  predicate: (elements, appState, appProps, app) =>
    app.annotationTrails.hasAnnotations,
  perform: (elements, appState, _, app) => {
    app.annotationTrails.clear();
    app.broadcastAnnotationsCleared();
    return {
      captureUpdate: CaptureUpdateAction.NEVER,
    };
  },
  keyTest: (event) =>
    event.altKey &&
    !event[KEYS.CTRL_OR_CMD] &&
    !event.shiftKey &&
    event.code === CODES.K,
});
