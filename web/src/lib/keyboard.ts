"use client";

import { useEffect } from "react";

export interface KeyboardHandlers {
  togglePlay: () => void;
  step: (deltaMs: number) => void;
  restart: () => void;
  end: () => void;
  prevEvent: () => void;
  nextEvent: () => void;
  cycleHeatmap: () => void;
  cycleMap: () => void;
  toggleHelp: () => void;
  togglePOIs: () => void;
  toggleStorm: () => void;
  snapshot: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack while a field is focused.
      const target = e.target as HTMLElement | null;
      if (target && /input|select|textarea/i.test(target.tagName)) return;
      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          handlers.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlers.step(-50 * (e.shiftKey ? 5 : 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          handlers.step(50 * (e.shiftKey ? 5 : 1));
          break;
        case "Home":
        case "r":
          handlers.restart();
          break;
        case "End":
          handlers.end();
          break;
        case "[":
          handlers.prevEvent();
          break;
        case "]":
          handlers.nextEvent();
          break;
        case "h":
          handlers.cycleHeatmap();
          break;
        case "m":
          handlers.cycleMap();
          break;
        case "p":
          handlers.togglePOIs();
          break;
        case "c":
          handlers.toggleStorm();
          break;
        case "s":
          handlers.snapshot();
          break;
        case "?":
          handlers.toggleHelp();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlers, enabled]);
}
