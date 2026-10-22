import React from "react";

import { KEYS } from "@excalidraw/common";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { fireEvent, render, waitFor } from "./test-utils";

describe("shortcuts", () => {
  it("Clear canvas shortcut should display confirm dialog", async () => {
    await render(
      <Excalidraw
        initialData={{ elements: [API.createElement({ type: "rectangle" })] }}
        handleKeyboardGlobally
      />,
    );

    expect(window.h.elements.length).toBe(1);

    Keyboard.withModifierKeys({ ctrl: true }, () => {
      Keyboard.keyDown(KEYS.DELETE);
    });
    const confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);

    await waitFor(() => {
      expect(window.h.elements[0].isDeleted).toBe(true);
    });
  });

  it("Deleting multiple elements should require confirmation", async () => {
    const rect1 = API.createElement({ type: "rectangle" });
    const rect2 = API.createElement({ type: "rectangle", x: 100 });
    await render(
      <Excalidraw
        initialData={{ elements: [rect1, rect2] }}
        handleKeyboardGlobally
      />,
    );
    API.setSelectedElements([rect1, rect2]);

    Keyboard.keyDown(KEYS.DELETE);
    let confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Cancel"]')!);
    await waitFor(() => {
      expect(document.querySelector(".confirm-dialog")).toBe(null);
    });
    expect(window.h.elements.every((el) => !el.isDeleted)).toBe(true);
    expect(window.h.state.selectedElementIds).toEqual({
      [rect1.id]: true,
      [rect2.id]: true,
    });

    Keyboard.keyDown(KEYS.DELETE);
    confirmDialog = document.querySelector(".confirm-dialog")!;
    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);
    await waitFor(() => {
      expect(window.h.elements.every((el) => el.isDeleted)).toBe(true);
    });
  });

  it("Deleting a frame should require confirmation", async () => {
    const frame = API.createElement({ type: "frame" });
    await render(
      <Excalidraw initialData={{ elements: [frame] }} handleKeyboardGlobally />,
    );
    API.setSelectedElements([frame]);

    Keyboard.keyDown(KEYS.DELETE);
    const confirmDialog = document.querySelector(".confirm-dialog")!;
    expect(confirmDialog).not.toBe(null);
    expect(window.h.elements[0].isDeleted).toBe(false);

    fireEvent.click(confirmDialog.querySelector('[aria-label="Cancel"]')!);
    expect(window.h.elements[0].isDeleted).toBe(false);
  });

  it("Deleting a single element should not require confirmation", async () => {
    const rect = API.createElement({ type: "rectangle" });
    await render(
      <Excalidraw initialData={{ elements: [rect] }} handleKeyboardGlobally />,
    );
    API.setSelectedElements([rect]);

    Keyboard.keyDown(KEYS.DELETE);
    expect(document.querySelector(".confirm-dialog")).toBe(null);
    expect(window.h.elements[0].isDeleted).toBe(true);
  });

  it("Confirming deletion should only delete the selection that opened the dialog", async () => {
    const rect1 = API.createElement({ type: "rectangle" });
    const rect2 = API.createElement({ type: "rectangle", x: 100 });
    const rect3 = API.createElement({ type: "rectangle", x: 200 });
    await render(
      <Excalidraw
        initialData={{ elements: [rect1, rect2, rect3] }}
        handleKeyboardGlobally
      />,
    );
    API.setSelectedElements([rect1, rect2]);

    Keyboard.keyDown(KEYS.DELETE);
    API.setSelectedElements([rect1, rect2, rect3]);

    const confirmDialog = document.querySelector(".confirm-dialog")!;
    fireEvent.click(confirmDialog.querySelector('[aria-label="Confirm"]')!);
    await waitFor(() => {
      expect(
        window.h.elements.find((el) => el.id === rect1.id)?.isDeleted,
      ).toBe(true);
    });
    expect(window.h.elements.find((el) => el.id === rect2.id)?.isDeleted).toBe(
      true,
    );
    expect(window.h.elements.find((el) => el.id === rect3.id)?.isDeleted).toBe(
      false,
    );
  });

  it("Escape immediately after Delete should cancel and keep selection", async () => {
    const rect1 = API.createElement({ type: "rectangle" });
    const rect2 = API.createElement({ type: "rectangle", x: 100 });
    await render(
      <Excalidraw
        initialData={{ elements: [rect1, rect2] }}
        handleKeyboardGlobally
      />,
    );
    API.setSelectedElements([rect1, rect2]);

    Keyboard.keyDown(KEYS.DELETE);
    expect(document.querySelector(".confirm-dialog")).not.toBe(null);
    Keyboard.keyDown(KEYS.ESCAPE);

    await waitFor(() => {
      expect(document.querySelector(".confirm-dialog")).toBe(null);
    });
    expect(window.h.elements.every((el) => !el.isDeleted)).toBe(true);
    expect(window.h.state.selectedElementIds).toEqual({
      [rect1.id]: true,
      [rect2.id]: true,
    });
  });
});
