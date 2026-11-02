import { useEffect } from "react";
import type { RefObject } from "react";

/** Closes a popup when the person clicks elsewhere or presses Escape (and returns focus to its button). */
export function useDismiss(
  open: boolean,
  close: () => void,
  wrap: RefObject<HTMLElement | null>,
  button: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, wrap, button]);
}
