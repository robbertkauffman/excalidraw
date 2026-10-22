import { actionClearCanvas, actionDeleteSelected } from "../actions";
import { atom, useAtom } from "../editor-jotai";
import { t } from "../i18n";

import { useApp, useExcalidrawActionManager } from "./App";

import ConfirmDialog from "./ConfirmDialog";

import type { AppState } from "../types";

export const activeConfirmDialogAtom = atom<
  | "clearCanvas"
  | {
      type: "deleteSelection";
      editorId: string;
      selectedElementIds: AppState["selectedElementIds"];
    }
  | null
>(null);

export const ActiveConfirmDialog = () => {
  const [activeConfirmDialog, setActiveConfirmDialog] = useAtom(
    activeConfirmDialogAtom,
  );
  const actionManager = useExcalidrawActionManager();
  const app = useApp();

  if (!activeConfirmDialog) {
    return null;
  }

  if (activeConfirmDialog === "clearCanvas") {
    return (
      <ConfirmDialog
        onConfirm={() => {
          actionManager.executeAction(actionClearCanvas);
          setActiveConfirmDialog(null);
        }}
        onCancel={() => setActiveConfirmDialog(null)}
        title={t("clearCanvasDialog.title")}
      >
        <p className="clear-canvas__content"> {t("alerts.clearReset")}</p>
      </ConfirmDialog>
    );
  }

  if (
    activeConfirmDialog.type === "deleteSelection" &&
    activeConfirmDialog.editorId === app.id
  ) {
    return (
      <ConfirmDialog
        onConfirm={() => {
          setActiveConfirmDialog(null);
          actionManager.executeAction(actionDeleteSelected, "ui", {
            confirmed: true,
            selectedElementIds: activeConfirmDialog.selectedElementIds,
          });
        }}
        onCancel={() => setActiveConfirmDialog(null)}
        title={t("deleteSelectionDialog.title")}
      >
        <p>{t("alerts.deleteSelection")}</p>
      </ConfirmDialog>
    );
  }

  return null;
};
