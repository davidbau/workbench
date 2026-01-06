import { create } from "zustand";
import type { LogitLensWidgetInterface, PinnedGroup, SerializedPinnedRow } from "@/components/charts/logitlens/LogitLensWidgetEmbed";

interface LensWorkspaceState {
    highlightedLineIds: Set<string>;
    setHighlightedLineIds: (highlightedLineIds: Set<string>) => void;

    toggleLineHighlight: (lineId: string) => void;
    clearHighlightedLineIds: () => void;

    // Widget state
    widgetRef: LogitLensWidgetInterface | null;
    setWidgetRef: (widget: LogitLensWidgetInterface | null) => void;
    pinnedRows: SerializedPinnedRow[];
    setPinnedRows: (rows: SerializedPinnedRow[]) => void;
    pinnedGroups: PinnedGroup[];
    setPinnedGroups: (groups: PinnedGroup[]) => void;

    // Tracked tokens from widget data (available for autocomplete)
    trackedTokens: string[];
    setTrackedTokens: (tokens: string[]) => void;

    // Widget actions
    togglePinnedRow: (pos: number) => boolean;
    togglePinnedTrajectory: (token: string, addToGroup?: boolean) => boolean;
}

export const useLensWorkspace = create<LensWorkspaceState>()((set, get) => ({
    highlightedLineIds: new Set(),
    setHighlightedLineIds: (highlightedLineIds: Set<string>) => set({ highlightedLineIds }),

    toggleLineHighlight: (lineId: string) =>
        set((state) => {
            const newHighlightedLineIds = new Set(state.highlightedLineIds);
            if (state.highlightedLineIds.has(lineId)) {
                newHighlightedLineIds.delete(lineId);
            } else {
                newHighlightedLineIds.add(lineId);
            }
            return { highlightedLineIds: newHighlightedLineIds };
        }),

    clearHighlightedLineIds: () => set({ highlightedLineIds: new Set() }),

    // Widget state
    widgetRef: null,
    setWidgetRef: (widget) => set({ widgetRef: widget }),
    pinnedRows: [],
    setPinnedRows: (rows) => set({ pinnedRows: rows }),
    pinnedGroups: [],
    setPinnedGroups: (groups) => set({ pinnedGroups: groups }),
    trackedTokens: [],
    setTrackedTokens: (tokens) => set({ trackedTokens: tokens }),

    // Widget actions - proxy to widget
    togglePinnedRow: (pos) => {
        const { widgetRef } = get();
        if (widgetRef) {
            return widgetRef.togglePinnedRow(pos);
        }
        return false;
    },
    togglePinnedTrajectory: (token, addToGroup = false) => {
        const { widgetRef } = get();
        if (widgetRef) {
            return widgetRef.togglePinnedTrajectory(token, addToGroup);
        }
        return false;
    },
}));
