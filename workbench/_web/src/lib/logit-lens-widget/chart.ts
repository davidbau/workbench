/**
 * Chart rendering for LogitLensWidget
 */

import type {
  NormalizedData,
  WidgetState,
  DOMHelpers,
  PinnedGroup,
  ChartMargin,
  TrajectoryMetric,
} from "./types";
import { LINE_STYLES } from "./types";
import {
  niceMax,
  formatPct,
  visualizeSpaces,
  getContentFontSizePx,
  getChartMargin,
  getDefaultChartHeight,
} from "./utils";

export interface ChartContext {
  uid: string;
  data: NormalizedData;
  state: WidgetState;
  dom: DOMHelpers;
  isDarkMode: () => boolean;
  getActualChartHeight: () => number;
  getGroupTrajectory: (group: PinnedGroup, pos: number) => number[];
  getGroupLabel: (group: PinnedGroup) => string;
  getLineStyleForRow: (pos: number) => { name: string; dash: string };
  getTrajectoryMetric: () => TrajectoryMetric;
  closePopup: () => void;
  buildTable: (
    cellWidth: number,
    visibleLayerIndices: number[],
    maxRows: number | null,
    stride?: number
  ) => void;
}

/**
 * Draw all trajectories on the chart
 */
export function drawAllTrajectories(
  ctx: ChartContext,
  hoverTrajectory: number[] | null,
  hoverColor: string | null,
  hoverLabel: string | null,
  chartInnerWidth: number,
  pos: number
): void {
  const { uid, data, state, dom, isDarkMode, getActualChartHeight } = ctx;
  const nLayers = data.layers.length;

  const svg = dom.chart();
  if (!svg) return;
  svg.innerHTML = "";

  const table = dom.table();
  if (!table) return;

  const firstInputCell = table.querySelector(".input-token");
  const tableRect = table.getBoundingClientRect();
  const inputCellRect = firstInputCell?.getBoundingClientRect();
  const actualInputRight = inputCellRect
    ? inputCellRect.right - tableRect.left
    : state.inputTokenWidth;

  // Create legend group
  const legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  legendG.setAttribute("class", "legend-area");
  svg.appendChild(legendG);

  const chartMargin = getChartMargin(dom);
  const chartHeight = getActualChartHeight();
  const chartInnerHeight = chartHeight - chartMargin.top - chartMargin.bottom;

  // Main chart group
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute(
    "transform",
    `translate(${actualInputRight},${chartMargin.top})`
  );
  svg.appendChild(g);

  // Font scale for sizing
  const fontScale = getContentFontSizePx(dom) / 10;
  const dotRadius = 3 * fontScale;
  const strokeWidth = 2 * fontScale;
  const strokeWidthHover = 1.5 * fontScale;
  const labelMargin = chartMargin.right;
  const usableWidth = chartInnerWidth - labelMargin;

  // X-axis scaling
  function layerToX(layerIdx: number): number {
    if (nLayers <= 1) return usableWidth / 2;
    const visibleLayerRange = nLayers - 1 - state.plotMinLayer;
    if (visibleLayerRange <= 0) return usableWidth / 2;
    return (
      dotRadius +
      ((layerIdx - state.plotMinLayer) / visibleLayerRange) *
        (usableWidth - 2 * dotRadius)
    );
  }

  // Create X-axis with drag handler
  const xAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  xAxisGroup.style.cursor = "row-resize";

  const xAxisHoverBg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  xAxisHoverBg.setAttribute("x", "0");
  xAxisHoverBg.setAttribute("y", String(chartInnerHeight - 2));
  xAxisHoverBg.setAttribute("width", String(chartInnerWidth));
  xAxisHoverBg.setAttribute("height", "4");
  xAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
  xAxisHoverBg.style.display = "none";
  xAxisGroup.appendChild(xAxisHoverBg);

  const xAxisHitTarget = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  xAxisHitTarget.setAttribute("x", "0");
  xAxisHitTarget.setAttribute("y", String(chartInnerHeight - 4));
  xAxisHitTarget.setAttribute("width", String(chartInnerWidth));
  xAxisHitTarget.setAttribute("height", "8");
  xAxisHitTarget.setAttribute("fill", "transparent");
  xAxisGroup.appendChild(xAxisHitTarget);

  const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  xAxis.setAttribute("x1", "0");
  xAxis.setAttribute("y1", String(chartInnerHeight));
  xAxis.setAttribute("x2", String(chartInnerWidth));
  xAxis.setAttribute("y2", String(chartInnerHeight));
  xAxis.setAttribute("stroke", "#ccc");
  xAxisGroup.appendChild(xAxis);
  g.appendChild(xAxisGroup);

  xAxisGroup.addEventListener("mouseenter", () => {
    xAxisHoverBg.style.display = "block";
  });
  xAxisGroup.addEventListener("mouseleave", () => {
    xAxisHoverBg.style.display = "none";
  });
  xAxisGroup.addEventListener("mousedown", (e) => {
    ctx.closePopup();
    state.xAxisDrag = {
      active: true,
      startY: e.clientY,
      startHeight: getActualChartHeight(),
    };
    xAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
    e.preventDefault();
    e.stopPropagation();
  });

  // Create clip paths
  const clipFontSize = getContentFontSizePx(dom);
  const clipLeftExtent = 10 + clipFontSize * 5;
  const clipTopExtent = clipFontSize * 1.2;

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

  // Main chart clip
  const clipId = `${uid}_chart_clip`;
  const clipPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "clipPath"
  );
  clipPath.setAttribute("id", clipId);
  const clipRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  clipRect.setAttribute("x", String(-clipLeftExtent));
  clipRect.setAttribute("y", String(-clipTopExtent));
  clipRect.setAttribute("width", String(chartInnerWidth + clipLeftExtent));
  clipRect.setAttribute(
    "height",
    String(chartInnerHeight + clipTopExtent + chartMargin.bottom + clipFontSize * 0.5)
  );
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  // Trajectory clip (clips at x=0)
  const trajClipId = `${uid}_traj_clip`;
  const trajClipPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "clipPath"
  );
  trajClipPath.setAttribute("id", trajClipId);
  const trajClipRect = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  trajClipRect.setAttribute("x", "0");
  trajClipRect.setAttribute("y", String(-clipTopExtent));
  trajClipRect.setAttribute("width", String(chartInnerWidth));
  trajClipRect.setAttribute("height", String(chartInnerHeight + clipTopExtent + 10));
  trajClipPath.appendChild(trajClipRect);
  defs.appendChild(trajClipPath);

  svg.appendChild(defs);
  g.setAttribute("clip-path", `url(#${clipId})`);

  // Create trajectory group
  const trajG = document.createElementNS("http://www.w3.org/2000/svg", "g");
  trajG.setAttribute("clip-path", `url(#${trajClipId})`);
  g.appendChild(trajG);

  // X-axis tick labels
  const minTickGap = 24;
  let labelStride = 1;
  if (state.currentVisibleIndices.length >= 2) {
    const firstX = layerToX(state.currentVisibleIndices[0]);
    const secondX = layerToX(state.currentVisibleIndices[1]);
    const pixelsPerIndex = Math.abs(secondX - firstX);
    if (pixelsPerIndex >= 1 && pixelsPerIndex < minTickGap) {
      labelStride = Math.ceil(minTickGap / pixelsPerIndex);
    }
  }

  const lastIdx = state.currentVisibleIndices.length - 1;
  const showAtIndex = new Set<number>();
  for (let i = lastIdx; i >= 0; i -= labelStride) {
    showAtIndex.add(i);
  }
  showAtIndex.add(0);

  const minXForLabel = 8;
  state.currentVisibleIndices.forEach((layerIdx, i) => {
    if (showAtIndex.has(i)) {
      const x = layerToX(layerIdx);
      if (state.plotMinLayer > 0 && x < minXForLabel) return;

      const isLast = i === lastIdx;
      const isDraggable = !isLast && layerIdx > 0;

      const tickGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

      if (isDraggable) {
        const fontSize = getContentFontSizePx(dom);
        const hoverBg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect"
        );
        const bgWidth = Math.max(16, fontSize * 1.6);
        const bgHeight = fontSize + 2;
        hoverBg.setAttribute("x", String(x - bgWidth / 2));
        hoverBg.setAttribute("y", String(chartInnerHeight + 2));
        hoverBg.setAttribute("width", String(bgWidth));
        hoverBg.setAttribute("height", String(bgHeight));
        hoverBg.setAttribute("rx", "2");
        hoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
        hoverBg.style.display = "none";
        hoverBg.classList.add("tick-hover-bg");
        tickGroup.appendChild(hoverBg);
      }

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", String(x));
      label.setAttribute("y", String(chartInnerHeight + 2 + getContentFontSizePx(dom)));
      label.setAttribute("text-anchor", "middle");
      label.style.fontSize = "var(--ll-content-size, 14px)";
      label.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
      label.textContent = String(data.layers[layerIdx]);
      tickGroup.appendChild(label);

      if (isDraggable) {
        tickGroup.style.cursor = "col-resize";
        tickGroup.setAttribute("data-layer-idx", String(layerIdx));

        tickGroup.addEventListener("mouseenter", () => {
          const bg = tickGroup.querySelector(".tick-hover-bg") as SVGElement;
          if (bg) bg.style.display = "block";
        });
        tickGroup.addEventListener("mouseleave", () => {
          const bg = tickGroup.querySelector(".tick-hover-bg") as SVGElement;
          if (bg) bg.style.display = "none";
        });
        tickGroup.addEventListener("mousedown", (e) => {
          ctx.closePopup();
          state.plotMinLayerDrag = {
            active: true,
            startX: e.clientX,
            startMinLayer: state.plotMinLayer,
            layerIdx,
            layerXAtStart: layerToX(layerIdx),
            usableWidth,
            dotRadius,
          };
          e.preventDefault();
          e.stopPropagation();
        });
      }

      g.appendChild(tickGroup);
    }
  });

  // Y-axis with drag handler
  const yAxisGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  yAxisGroup.style.cursor = "col-resize";

  const yAxisHoverBg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  yAxisHoverBg.setAttribute("x", "-2");
  yAxisHoverBg.setAttribute("y", "0");
  yAxisHoverBg.setAttribute("width", "4");
  yAxisHoverBg.setAttribute("height", String(chartInnerHeight));
  yAxisHoverBg.setAttribute("fill", "rgba(33, 150, 243, 0.3)");
  yAxisHoverBg.style.display = "none";
  yAxisGroup.appendChild(yAxisHoverBg);

  const yAxisHitTarget = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect"
  );
  yAxisHitTarget.setAttribute("x", "-4");
  yAxisHitTarget.setAttribute("y", "0");
  yAxisHitTarget.setAttribute("width", "8");
  yAxisHitTarget.setAttribute("height", String(chartInnerHeight));
  yAxisHitTarget.setAttribute("fill", "transparent");
  yAxisGroup.appendChild(yAxisHitTarget);

  const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
  yAxis.setAttribute("x1", "0");
  yAxis.setAttribute("y1", "0");
  yAxis.setAttribute("x2", "0");
  yAxis.setAttribute("y2", String(chartInnerHeight));
  yAxis.setAttribute("stroke", "#ccc");
  yAxisGroup.appendChild(yAxis);
  g.appendChild(yAxisGroup);

  yAxisGroup.addEventListener("mouseenter", () => {
    yAxisHoverBg.style.display = "block";
  });
  yAxisGroup.addEventListener("mouseleave", () => {
    yAxisHoverBg.style.display = "none";
  });
  yAxisGroup.addEventListener("mousedown", (e) => {
    ctx.closePopup();
    state.yAxisDrag = {
      active: true,
      startX: e.clientX,
      startWidth: state.inputTokenWidth,
    };
    yAxis.setAttribute("stroke", "rgba(33, 150, 243, 0.6)");
    e.preventDefault();
    e.stopPropagation();
  });

  // Y-axis label
  const metric = ctx.getTrajectoryMetric();
  const yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yLabel.setAttribute("x", String(-chartInnerHeight / 2));
  yLabel.setAttribute("y", String(-actualInputRight + 15));
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.style.fontSize = "var(--ll-content-size, 14px)";
  yLabel.setAttribute("fill", "#666");
  yLabel.setAttribute("transform", "rotate(-90)");
  yLabel.textContent = metric === "rank" ? "Rank" : "Probability";
  svg.appendChild(yLabel);

  // Determine positions to show
  const positionsToShow: number[] = [];
  if (state.pinnedRows.length > 0) {
    state.pinnedRows.forEach((pr) => positionsToShow.push(pr.pos));
  } else {
    positionsToShow.push(pos);
  }

  // Calculate max value for scale (probability or rank)
  let allValues: number[] = [];
  positionsToShow.forEach((showPos) => {
    state.pinnedGroups.forEach((group) => {
      const traj = ctx.getGroupTrajectory(group, showPos);
      allValues = allValues.concat(traj);
    });
  });
  if (hoverTrajectory) allValues = allValues.concat(hoverTrajectory);

  // For rank mode, use max rank; for probability mode, use niceMax
  let maxValue: number;
  let tickLabelText: string;
  const isRankMode = metric === "rank";
  if (isRankMode) {
    // For rank, find max and round up to nice value
    const rawMax = Math.max(...allValues, 1);
    maxValue = rawMax <= 10 ? 10 : rawMax <= 100 ? 100 : rawMax <= 1000 ? 1000 : Math.ceil(rawMax / 1000) * 1000;
    tickLabelText = String(Math.round(maxValue));
  } else {
    const rawMaxProb = Math.max(...allValues, 0.001);
    maxValue = niceMax(rawMaxProb);
    tickLabelText = formatPct(maxValue);
  }

  // Y-axis tick at top (for probability) or bottom (for rank since lower is better)
  const hasData =
    state.pinnedGroups.length > 0 || (hoverTrajectory && hoverLabel);
  if (hasData) {
    // For rank mode, show max rank at bottom (inverted scale)
    const tickY = isRankMode ? chartInnerHeight : 0;
    const tickLine = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    tickLine.setAttribute("x1", "-3");
    tickLine.setAttribute("y1", String(tickY));
    tickLine.setAttribute("x2", "3");
    tickLine.setAttribute("y2", String(tickY));
    tickLine.setAttribute("stroke", "#999");
    g.appendChild(tickLine);

    const tickFontSize = getContentFontSizePx(dom) * 0.9;
    const tickLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    tickLabel.setAttribute("x", "-5");
    tickLabel.setAttribute("y", String(tickY + tickFontSize * 0.35));
    tickLabel.setAttribute("text-anchor", "end");
    tickLabel.style.fontSize = "calc(var(--ll-content-size, 14px) * 0.9)";
    tickLabel.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
    tickLabel.textContent = tickLabelText;
    g.appendChild(tickLabel);

    // For rank mode, also show "1" at top
    if (isRankMode) {
      const topTickY = 0;
      const topTickLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
      topTickLine.setAttribute("x1", "-3");
      topTickLine.setAttribute("y1", String(topTickY));
      topTickLine.setAttribute("x2", "3");
      topTickLine.setAttribute("y2", String(topTickY));
      topTickLine.setAttribute("stroke", "#999");
      g.appendChild(topTickLine);

      const topTickLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      topTickLabel.setAttribute("x", "-5");
      topTickLabel.setAttribute("y", String(topTickY + tickFontSize * 0.35));
      topTickLabel.setAttribute("text-anchor", "end");
      topTickLabel.style.fontSize = "calc(var(--ll-content-size, 14px) * 0.9)";
      topTickLabel.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
      topTickLabel.textContent = "1";
      g.appendChild(topTickLabel);
    }
  }

  // Legend setup
  let legendEntryCount = 0;
  if (state.pinnedRows.length > 1 && state.pinnedGroups.length === 1) {
    legendEntryCount = 1 + state.pinnedRows.length;
  } else {
    legendEntryCount = state.pinnedGroups.length;
  }
  if (hoverTrajectory && hoverLabel) {
    legendEntryCount += 1;
  }

  const legendEntryHeight = 14 * fontScale;
  const legendLineLength = 20 * fontScale;
  const legendTextX = 25 * fontScale;
  const legendTextY = 4 * fontScale;
  const legendCloseX = -12 * fontScale;
  const legendIndent = 18 * fontScale;
  const legendTotalHeight = legendEntryCount * legendEntryHeight;
  let legendY =
    chartMargin.top +
    Math.max(10 * fontScale, (chartInnerHeight - legendTotalHeight) / 2);

  // Draw trajectories
  positionsToShow.forEach((showPos) => {
    const lineStyle = ctx.getLineStyleForRow(showPos);
    state.pinnedGroups.forEach((group) => {
      const traj = ctx.getGroupTrajectory(group, showPos);
      const groupLabel = ctx.getGroupLabel(group);
      drawSingleTrajectory(
        trajG,
        traj,
        group.color,
        maxValue,
        groupLabel,
        false,
        chartInnerWidth,
        lineStyle.dash,
        state,
        data,
        dom,
        layerToX,
        chartInnerHeight,
        fontScale,
        isRankMode
      );
    });
  });

  // Draw legend entries (simplified for brevity - full implementation would mirror JS)
  state.pinnedGroups.forEach((group, groupIdx) => {
    const groupLabel = ctx.getGroupLabel(group);
    const legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legendItem.setAttribute(
      "transform",
      `translate(${legendIndent}, ${legendY})`
    );
    legendItem.style.cursor = "pointer";

    // Hit target
    const hitTarget = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hitTarget.setAttribute("x", "-15");
    hitTarget.setAttribute("y", "-8");
    hitTarget.setAttribute("width", String(state.inputTokenWidth - 5));
    hitTarget.setAttribute("height", "14");
    hitTarget.setAttribute("fill", "transparent");
    legendItem.appendChild(hitTarget);

    // Close button
    const closeBtn = document.createElementNS("http://www.w3.org/2000/svg", "text");
    closeBtn.setAttribute("class", "legend-close");
    closeBtn.setAttribute("x", String(legendCloseX));
    closeBtn.setAttribute("y", "4");
    closeBtn.style.fontSize = "var(--ll-title-size, 20px)";
    closeBtn.setAttribute("fill", "#999");
    closeBtn.style.display = "none";
    closeBtn.textContent = "\u00d7";
    legendItem.appendChild(closeBtn);

    // Line sample
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(15 * fontScale));
    line.setAttribute("y2", "0");
    line.setAttribute("stroke", group.color);
    line.setAttribute("stroke-width", String(strokeWidth));
    legendItem.appendChild(line);

    // Label text
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(20 * fontScale));
    text.setAttribute("y", String(legendTextY));
    text.style.fontSize = "var(--ll-content-size, 14px)";
    text.setAttribute("fill", isDarkMode() ? "#ddd" : "#333");
    text.textContent = groupLabel;
    legendItem.appendChild(text);

    legendItem.addEventListener("mouseenter", () => {
      closeBtn.style.display = "block";
    });
    legendItem.addEventListener("mouseleave", () => {
      closeBtn.style.display = "none";
    });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      state.pinnedGroups.splice(groupIdx, 1);
      if (state.lastPinnedGroupIndex >= state.pinnedGroups.length) {
        state.lastPinnedGroupIndex = state.pinnedGroups.length - 1;
      }
      ctx.buildTable(
        state.currentCellWidth,
        state.currentVisibleIndices,
        state.currentMaxRows
      );
    });

    legendG.appendChild(legendItem);
    legendY += legendEntryHeight;
  });

  // Hover trajectory
  if (hoverTrajectory && hoverLabel) {
    drawSingleTrajectory(
      trajG,
      hoverTrajectory,
      hoverColor || "#999",
      maxValue,
      hoverLabel,
      true,
      chartInnerWidth,
      "",
      state,
      data,
      dom,
      layerToX,
      chartInnerHeight,
      fontScale,
      isRankMode
    );

    const legendItem = document.createElementNS("http://www.w3.org/2000/svg", "g");
    legendItem.setAttribute("class", "legend-item hover-legend");
    legendItem.setAttribute(
      "transform",
      `translate(${legendIndent}, ${legendY})`
    );

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", String(15 * fontScale));
    line.setAttribute("y2", "0");
    line.setAttribute("stroke", hoverColor || "#999");
    line.setAttribute("stroke-width", String(strokeWidthHover));
    line.setAttribute(
      "stroke-dasharray",
      `${4 * fontScale},${2 * fontScale}`
    );
    line.style.opacity = "0.7";
    legendItem.appendChild(line);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(20 * fontScale));
    text.setAttribute("y", String(legendTextY));
    text.style.fontSize = "var(--ll-content-size, 14px)";
    text.setAttribute("fill", isDarkMode() ? "#aaa" : "#666");
    text.textContent = visualizeSpaces(hoverLabel);
    legendItem.appendChild(text);

    legendG.appendChild(legendItem);
  }
}

function drawSingleTrajectory(
  g: SVGElement,
  trajectory: number[],
  color: string,
  maxValue: number,
  label: string,
  isHover: boolean,
  chartInnerWidth: number,
  dashPattern: string,
  state: WidgetState,
  data: NormalizedData,
  dom: DOMHelpers,
  layerToX: (layerIdx: number) => number,
  chartInnerHeight: number,
  fontScale: number,
  isRankMode: boolean = false
): void {
  if (!trajectory || trajectory.length === 0) return;

  const dotRadius = (isHover ? 2 : 3) * fontScale;
  const strokeWidth = (isHover ? 1.5 : 2) * fontScale;

  const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
  if (isHover) pathEl.style.opacity = "0.7";

  // For rank mode: rank 1 is at top (y=0), maxRank is at bottom
  // For probability mode: 0 is at bottom, maxProb is at top
  function valueToY(value: number): number {
    if (isRankMode) {
      // Rank 1 at top, maxValue at bottom (logarithmic scale for better visibility)
      if (value <= 0) return chartInnerHeight; // No data
      if (value === 1) return 0;
      // Use log scale for rank: log(1) = 0 at top, log(maxValue) at bottom
      const logMax = Math.log(maxValue);
      const logVal = Math.log(value);
      return (logVal / logMax) * chartInnerHeight;
    } else {
      // Probability: higher is up
      return chartInnerHeight - (value / maxValue) * chartInnerHeight;
    }
  }

  let d = "";
  trajectory.forEach((p, layerIdx) => {
    const x = layerToX(layerIdx);
    const y = valueToY(p);
    d += (layerIdx === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  });

  pathEl.setAttribute("d", d);
  pathEl.setAttribute("fill", "none");
  pathEl.setAttribute("stroke", color);
  pathEl.setAttribute("stroke-width", String(strokeWidth));

  if (isHover) {
    pathEl.setAttribute(
      "stroke-dasharray",
      `${4 * fontScale},${2 * fontScale}`
    );
  } else if (dashPattern) {
    const scaledDash = dashPattern
      .split(",")
      .map((v) => parseFloat(v) * fontScale)
      .join(",");
    pathEl.setAttribute("stroke-dasharray", scaledDash);
  }
  g.appendChild(pathEl);

  // Draw dots at visible layer positions
  state.currentVisibleIndices.forEach((layerIdx) => {
    const p = trajectory[layerIdx];
    const x = layerToX(layerIdx);
    const y = valueToY(p);

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", x.toFixed(1));
    circle.setAttribute("cy", y.toFixed(1));
    circle.setAttribute("r", String(dotRadius));
    circle.setAttribute("fill", color);
    if (isHover) circle.style.opacity = "0.7";

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    const tooltipValue = isRankMode
      ? `rank ${Math.round(p)}`
      : `${(p * 100).toFixed(2)}%`;
    title.textContent = `${label || ""} L${data.layers[layerIdx]}: ${tooltipValue}`;
    circle.appendChild(title);
    g.appendChild(circle);
  });
}
