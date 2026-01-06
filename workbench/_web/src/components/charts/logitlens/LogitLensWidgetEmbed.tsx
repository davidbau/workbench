"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// Type for widget data in V2 format
export interface LogitLensV2Data {
    meta: { version: number; model: string };
    input: string[];
    layers: number[];
    topk: string[][][]; // [layer][position][k]
    tracked: Record<string, number[]>[]; // [position]{token: trajectory}
}

// Pinned group type
export interface PinnedGroup {
    tokens: string[];
    color: string;
}

// Serialized pinned row type
export interface SerializedPinnedRow {
    pos: number;
    lineStyleName: string;
}

// Type for the widget interface returned by LogitLensWidget
export interface LogitLensWidgetInterface {
    uid: string;
    getState: () => Record<string, unknown>;
    getColumnState: () => Record<string, unknown>;
    setColumnState: (state: Record<string, unknown>) => void;
    linkColumnsTo: (widget: LogitLensWidgetInterface) => void;
    unlinkColumns: (widget: LogitLensWidgetInterface) => void;
    setDarkMode: (enabled: boolean | null) => void;
    getDarkMode: () => boolean;
    // Row and group manipulation
    togglePinnedRow: (pos: number) => boolean;
    togglePinnedTrajectory: (token: string, addToGroup?: boolean) => boolean;
    getPinnedRows: () => SerializedPinnedRow[];
    getPinnedGroups: () => PinnedGroup[];
    // Event handlers
    setEventHandlers: (handlers: {
        onRowPinChange?: (pinnedRows: SerializedPinnedRow[]) => void;
        onGroupPinChange?: (pinnedGroups: PinnedGroup[]) => void;
    }) => void;
}

// Declare the global LogitLensWidget function
declare global {
    interface Window {
        LogitLensWidget?: (
            container: string | HTMLElement,
            data: LogitLensV2Data,
            uiState?: Record<string, unknown>
        ) => LogitLensWidgetInterface;
    }
}

interface LogitLensWidgetEmbedProps {
    data: LogitLensV2Data | null;
    title?: string;
    className?: string;
    pending?: boolean;
    onWidgetReady?: (widget: LogitLensWidgetInterface) => void;
    /** Called when pinned rows change in the widget */
    onRowPinChange?: (pinnedRows: SerializedPinnedRow[]) => void;
    /** Called when pinned token groups change in the widget */
    onGroupPinChange?: (pinnedGroups: PinnedGroup[]) => void;
    /** External ref to access the widget instance */
    widgetRef?: React.MutableRefObject<LogitLensWidgetInterface | null>;
}

export function LogitLensWidgetEmbed({
    data,
    title,
    className,
    pending = false,
    onWidgetReady,
    onRowPinChange,
    onGroupPinChange,
    widgetRef: externalWidgetRef,
}: LogitLensWidgetEmbedProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const internalWidgetRef = useRef<LogitLensWidgetInterface | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use external ref if provided, otherwise internal
    const widgetRef = externalWidgetRef || internalWidgetRef;

    // Load the widget script
    const loadWidgetScript = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (window.LogitLensWidget) {
                resolve();
                return;
            }

            // Check if script is already being loaded
            const existingScript = document.querySelector(
                'script[src="/logit-lens-widget.js"]'
            );
            if (existingScript) {
                existingScript.addEventListener("load", () => resolve());
                existingScript.addEventListener("error", () =>
                    reject(new Error("Failed to load widget script"))
                );
                return;
            }

            // Load the script
            const script = document.createElement("script");
            script.src = "/logit-lens-widget.js";
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load widget script"));
            document.head.appendChild(script);
        });
    }, []);

    // Initialize or update widget
    useEffect(() => {
        if (!data || !containerRef.current || pending) {
            return;
        }

        let mounted = true;

        const initWidget = async () => {
            try {
                setIsLoading(true);
                setError(null);

                await loadWidgetScript();

                if (!mounted || !containerRef.current || !window.LogitLensWidget) {
                    return;
                }

                // Clear container
                containerRef.current.innerHTML = "";

                // Build UI state
                const uiState: Record<string, unknown> = {};
                if (title) {
                    uiState.title = title;
                }

                // Create widget
                const widget = window.LogitLensWidget(
                    containerRef.current,
                    data,
                    uiState
                );

                widgetRef.current = widget;

                // Set up event handlers
                widget.setEventHandlers({
                    onRowPinChange,
                    onGroupPinChange,
                });

                // Detect dark mode from CSS
                const isDark = document.documentElement.classList.contains("dark");
                widget.setDarkMode(isDark);

                if (onWidgetReady) {
                    onWidgetReady(widget);
                }

                setIsLoading(false);
            } catch (err) {
                if (mounted) {
                    setError(err instanceof Error ? err.message : "Failed to load widget");
                    setIsLoading(false);
                }
            }
        };

        initWidget();

        return () => {
            mounted = false;
        };
    }, [data, title, pending, loadWidgetScript, onWidgetReady, widgetRef]);

    // Update event handlers when they change (without re-creating widget)
    useEffect(() => {
        if (widgetRef.current) {
            widgetRef.current.setEventHandlers({
                onRowPinChange,
                onGroupPinChange,
            });
        }
    }, [onRowPinChange, onGroupPinChange, widgetRef]);

    // Update dark mode when theme changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === "attributes" &&
                    mutation.attributeName === "class" &&
                    widgetRef.current
                ) {
                    const isDark = document.documentElement.classList.contains("dark");
                    widgetRef.current.setDarkMode(isDark);
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });

        return () => observer.disconnect();
    }, []);

    if (error) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center p-4 text-destructive",
                    className
                )}
            >
                {error}
            </div>
        );
    }

    return (
        <div className={cn("relative w-full", className)}>
            {(isLoading || pending) && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            )}
            <div
                ref={containerRef}
                className={cn(
                    "w-full min-h-[300px] bg-background rounded-lg",
                    (isLoading || pending) && "opacity-0"
                )}
            />
        </div>
    );
}
