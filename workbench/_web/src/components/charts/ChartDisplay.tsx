import { useWorkspace } from "@/stores/useWorkspace";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { getChartById, getConfigForChart } from "@/lib/queries/chartQueries";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo, useCallback, useEffect } from "react";

import { HeatmapCard } from "./heatmap/HeatmapCard";
import { LineCard } from "./line/LineCard";
import { LogitLensWidgetEmbed, LogitLensWidgetInterface, SerializedPinnedRow, PinnedGroup } from "./logitlens/LogitLensWidgetEmbed";
import { normalizeToV2, isOldGridFormat, isV2Format } from "./logitlens/convertToV2";
import { HeatmapChart, LineChart } from "@/db/schema";
import { useCapture } from "@/components/providers/CaptureProvider";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

// Track mutation state globally via keys set in chartApi hooks

export function ChartDisplay() {
    const { jobStatus } = useWorkspace();
    const { chartId } = useParams<{ chartId: string }>();
    const { captureRef } = useCapture();
    const { setWidgetRef, setPinnedRows, setPinnedGroups, setTrackedTokens } = useLensWorkspace();

    const isLineRunning = useIsMutating({ mutationKey: ["lensLine"] }) > 0;
    const isHeatmapRunning = useIsMutating({ mutationKey: ["lensGrid"] }) > 0;

    // Callbacks for widget events
    const handleWidgetReady = useCallback((widget: LogitLensWidgetInterface) => {
        setWidgetRef(widget);
        // Initialize state from widget
        setPinnedRows(widget.getPinnedRows());
        setPinnedGroups(widget.getPinnedGroups());
    }, [setWidgetRef, setPinnedRows, setPinnedGroups]);

    const handleRowPinChange = useCallback((rows: SerializedPinnedRow[]) => {
        setPinnedRows(rows);
    }, [setPinnedRows]);

    const handleGroupPinChange = useCallback((groups: PinnedGroup[]) => {
        setPinnedGroups(groups);
    }, [setPinnedGroups]);

    const { data: chart, isLoading } = useQuery({
        queryKey: queryKeys.charts.chart(chartId),
        queryFn: () => getChartById(chartId as string),
        enabled: !!chartId,
    });

    const { data: config } = useQuery({
        queryKey: queryKeys.charts.configByChart(chartId),
        queryFn: () => getConfigForChart(chartId),
        enabled: !!chartId,
    });

    // Some query is running
    const isPending = isLineRunning || isHeatmapRunning;

    // Has no data or is loading from db
    const showEmptyState =
        (jobStatus === "Idle" && chart && chart.data === null) ||
        isLoading ||
        !chart ||
        !chart.data;

    // Check if data is heatmap format (old grid format or new V2 format)
    const isHeatmapData =
        isOldGridFormat(chart?.data) || isV2Format(chart?.data);

    // Convert chart data to V2 format for the new widget
    const v2Data = useMemo(() => {
        if (!chart?.data) return null;
        const model = config?.data?.model || "unknown";
        return normalizeToV2(chart.data, model);
    }, [chart?.data, config?.data?.model]);

    // Extract tracked tokens from v2Data for autocomplete
    useEffect(() => {
        if (v2Data?.tracked) {
            const tokens = new Set<string>();
            v2Data.tracked.forEach((posTracked: Record<string, unknown>) => {
                Object.keys(posTracked).forEach((token) => tokens.add(token));
            });
            setTrackedTokens(Array.from(tokens));
        } else {
            setTrackedTokens([]);
        }
    }, [v2Data, setTrackedTokens]);

    // Determine if we should use the new interactive widget
    // Use it for heatmap type charts (both old and new format data)
    const useNewWidget = isHeatmapData && v2Data !== null;

    return (
        <div className={cn("flex size-full", showEmptyState && "pb-6")}>
            {showEmptyState ? (
                <div className="flex size-full items-center justify-center border mx-3 mt-3 border-dashed rounded">
                    <div className="text-muted-foreground">No chart data</div>
                </div>
            ) : useNewWidget ? (
                <div ref={captureRef} className="flex size-full mx-3 mt-3">
                    <LogitLensWidgetEmbed
                        data={v2Data}
                        title={chart.name || undefined}
                        pending={isPending}
                        className="w-full"
                        onWidgetReady={handleWidgetReady}
                        onRowPinChange={handleRowPinChange}
                        onGroupPinChange={handleGroupPinChange}
                    />
                </div>
            ) : isHeatmapRunning || (!isPending && chart.type === "heatmap") ? (
                <HeatmapCard
                    captureRef={captureRef}
                    chart={chart as HeatmapChart}
                    pending={isPending || !isHeatmapData}
                    statisticType={config?.data?.statisticType}
                />
            ) : (
                <LineCard
                    captureRef={captureRef}
                    chart={chart as LineChart}
                    pending={isPending || isHeatmapData}
                    metricType={config?.data?.statisticType}
                />
            )}
        </div>
    );
}
