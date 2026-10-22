import { actionClearCanvas, actionDeleteSelected } from "../actions";
import { atom, useAtom } from "../editor-jotai";
import { t } from "../i18n";

import { useExcalidrawActionManager } from "./App";
import ConfirmDialog from "./ConfirmDialog";

export const activeConfirmDialogAtom = atom<
  "clearCanvas" | "deleteSelection" | null
>(null);

export const ActiveConfirmDialog = () => {
  const [activeConfirmDialog, setActiveConfirmDialog] = useAtom(
    activeConfirmDialogAtom,
  );
  const actionManager = useExcalidrawActionManager();

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

  if (activeConfirmDialog === "deleteSelection") {
    return (
      <ConfirmDialog
        onConfirm={() => {
          setActiveConfirmDialog(null);
          actionManager.executeAction(actionDeleteSelected, "ui", {
            confirmed: true,
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
