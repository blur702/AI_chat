"use client";

import { useCallback, useReducer, type Dispatch } from "react";
import type { MobileIdeTab } from "@/components/workspace/mobile-ide-tabs";

export type PanelName =
  | "chat"
  | "automations"
  | "history"
  | "imageGen"
  | "tools"
  | "events"
  | "resources"
  | "drupal"
  | "kb"
  | "snapshots"
  | "context"
  | "uiBuilder"
  | "planning"
  | "kbBuilder";

type Action =
  | { type: "toggle"; panel: PanelName }
  | { type: "open"; panel: PanelName }
  | { type: "close"; panel: PanelName }
  | { type: "closeAll" };

function reducer(state: Set<PanelName>, action: Action): Set<PanelName> {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state);
      if (next.has(action.panel)) next.delete(action.panel);
      else next.add(action.panel);
      return next;
    }
    case "open": {
      if (state.has(action.panel)) return state;
      const next = new Set(state);
      next.add(action.panel);
      return next;
    }
    case "close": {
      if (!state.has(action.panel)) return state;
      const next = new Set(state);
      next.delete(action.panel);
      return next;
    }
    case "closeAll":
      return state.size === 0 ? state : new Set();
  }
}

const PANEL_TO_MOBILE_TAB: Partial<Record<PanelName, MobileIdeTab>> = {
  chat: "chat",
  imageGen: "image-gen",
  tools: "tools",
  events: "events",
  resources: "resources",
  drupal: "drupal",
  kb: "kb",
  snapshots: "snapshots",
  context: "context",
  uiBuilder: "ui-builder",
  planning: "planning",
  kbBuilder: "kb",
};

export interface UsePanelManagerReturn {
  isOpen: (panel: PanelName) => boolean;
  toggle: (panel: PanelName) => void;
  open: (panel: PanelName) => void;
  close: (panel: PanelName) => void;
  closeAll: () => void;
  dispatch: Dispatch<Action>;
}

export function usePanelManager(
  isMobile: boolean,
  setMobileTab: (tab: MobileIdeTab) => void
): UsePanelManagerReturn {
  const [openPanels, dispatch] = useReducer(reducer, new Set<PanelName>());

  const isOpen = useCallback(
    (panel: PanelName) => openPanels.has(panel),
    [openPanels]
  );

  const toggle = useCallback(
    (panel: PanelName) => {
      if (isMobile) {
        const mobileTab = PANEL_TO_MOBILE_TAB[panel];
        if (mobileTab) {
          setMobileTab(mobileTab);
          return;
        }
      }
      dispatch({ type: "toggle", panel });
    },
    [isMobile, setMobileTab]
  );

  const open = useCallback(
    (panel: PanelName) => {
      if (isMobile) {
        const mobileTab = PANEL_TO_MOBILE_TAB[panel];
        if (mobileTab) {
          setMobileTab(mobileTab);
          return;
        }
      }
      dispatch({ type: "open", panel });
    },
    [isMobile, setMobileTab]
  );

  const close = useCallback(
    (panel: PanelName) => {
      dispatch({ type: "close", panel });
    },
    []
  );

  const closeAll = useCallback(() => {
    dispatch({ type: "closeAll" });
  }, []);

  return { isOpen, toggle, open, close, closeAll, dispatch };
}
