import { vi } from "vitest";

import { restoreElements } from "../data/restore";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer } from "./helpers/ui";
import {
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
  waitFor,
  fireEvent,
} from "./test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

describe("embeddables", () => {
  beforeEach(() => {
    mockBoundingClientRect();
  });

  afterEach(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("autoplays a Google Drive video on first activation only", async () => {
    await render(<Excalidraw viewModeEnabled />);
    await waitFor(() => expect(h.state.width).toBe(200));

    // link set upfront: embeds are validated (and cached) once per element
    API.setElements([
      {
        ...API.createElement({
          type: "embeddable",
          x: 20,
          y: 20,
          width: 120,
          height: 90,
        }),
        link: "https://drive.google.com/file/d/aaa/view",
      },
    ]);

    const iframe = await waitFor(() => {
      const iframe = document.querySelector("iframe.excalidraw__embeddable");
      expect(iframe).not.toBe(null);
      return iframe!;
    });
    // jsdom's `location.replace` can't be spied on
    const replace = vi.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { location: { replace } },
    });

    const activate = async () => {
      mouse.clickAt(80, 65);
      await waitFor(() => {
        expect(h.state.activeEmbeddable?.state).toBe("active");
      });
    };

    await activate();
    // replace (not `src`) so the reload doesn't add a history entry
    expect(replace).toHaveBeenCalledWith(
      "https://drive.google.com/file/d/aaa/preview?autoplay=1",
    );

    // re-activating must not reload (and restart) the video
    mouse.clickAt(5, 5);
    expect(h.state.activeEmbeddable).toBe(null);
    await activate();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  describe("magic frame iframes from scene data", () => {
    const getIframe = () =>
      waitFor(() => {
        const iframe = document.querySelector<HTMLIFrameElement>(
          "iframe.excalidraw__embeddable",
        );
        expect(iframe).not.toBe(null);
        return iframe!;
      });

    it("doesn't render imported generated HTML until the user opts in", async () => {
      await render(<Excalidraw />);
      await waitFor(() => expect(h.state.width).toBe(200));

      const html = "<script>alert(1)</script>";
      const [iframeElement] = restoreElements(
        [
          {
            ...API.createElement({
              type: "iframe",
              x: 20,
              y: 20,
              width: 120,
              height: 90,
            }),
            customData: { generationData: { status: "done", html } },
          } as any,
        ],
        null,
      );
      API.setElements([iframeElement]);

      const iframe = await getIframe();
      expect(iframe.getAttribute("srcdoc")).not.toContain("<script");

      API.setSelectedElements([iframeElement]);
      const showButton = await waitFor(() => {
        const button = document.querySelector<HTMLElement>(
          '[title="Show generated content"]',
        );
        expect(button).not.toBe(null);
        return button!;
      });
      fireEvent.click(showButton);

      await waitFor(() => {
        expect(
          (
            document.querySelector(
              "iframe.excalidraw__embeddable",
            ) as HTMLIFrameElement
          ).getAttribute("srcdoc"),
        ).toBe(html);
      });
    });

    it("escapes the error message", async () => {
      await render(<Excalidraw />);
      await waitFor(() => expect(h.state.width).toBe(200));

      API.setElements(
        restoreElements(
          [
            {
              ...API.createElement({
                type: "iframe",
                x: 20,
                y: 20,
                width: 120,
                height: 90,
              }),
              customData: {
                generationData: {
                  status: "error",
                  code: "ERR_OAI",
                  message: "<img src=x onerror=alert(1)>",
                },
              },
            } as any,
          ],
          null,
        ),
      );

      const srcdoc = (await getIframe()).getAttribute("srcdoc")!;
      expect(srcdoc).not.toContain("<img");
      expect(srcdoc).toContain("&lt;img src=x onerror=alert(1)&gt;");
    });
  });
});
