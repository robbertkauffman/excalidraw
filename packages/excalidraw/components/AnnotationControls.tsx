import { useSyncExternalStore } from "react";

import { t } from "../i18n";

import { IconButton } from "./IconButton";
import { Island } from "./Island";
import { isToolButtonDisabled } from "./Tools";
import { annotationToolIcon } from "./icons";

import type { AppClassProperties, UIAppState } from "../types";

export const AnnotationControls = ({
  app,
  appState,
}: {
  app: AppClassProperties;
  appState: UIAppState;
}) => {
  const hasAnnotations = useSyncExternalStore(
    app.annotationTrails.subscribe,
    app.annotationTrails.hasAnnotations,
    app.annotationTrails.hasAnnotations,
  );
  const selected = appState.activeTool.type === "annotation";
  if (
    !app.isToolSupported("annotation") ||
    (!appState.viewModeEnabled && !selected && !hasAnnotations)
  ) {
    return null;
  }
  return (
    <Island
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.25rem",
      }}
    >
      {appState.viewModeEnabled && (
        <IconButton
          type="toggle"
          icon={annotationToolIcon}
          checked={selected}
          title={t("toolBar.annotation")}
          aria-label={t("toolBar.annotation")}
          data-testid="toolbar-annotation"
          disabled={isToolButtonDisabled(app, "annotation")}
          onSelect={() => app.setActiveTool({ type: "annotation" })}
        />
      )}
      <button
        type="button"
        className="excalidraw-button"
        disabled={!hasAnnotations}
        onClick={app.annotationTrails.clear}
      >
        {t("toolBar.clearAnnotations")}
      </button>
    </Island>
  );
};
