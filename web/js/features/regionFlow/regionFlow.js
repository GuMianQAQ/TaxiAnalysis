import { state } from "../../core/state.js";
import {
    qs,
    renderInfoPanel,
	formatCount,
    formatFloat2,
    formatDateTime,
    parseDateTimeInput,
    requestJson,
    updateModeStatus
} from "../../core/utils.js";
import { stopAllTaxiMode } from "../trajectory/trajectoryService.js";
import { resetDensityState } from "../density/densityStore.js";
import {
    setRegionSelectionMapLocked,
    pixelToPoint
} from "../../map/map.js";

function getRF() {
    return state.regionFlow;
}

function makePolygon(region, style = {}) {
    const points = [
        new BMap.Point(region.minLon, region.maxLat),
        new BMap.Point(region.maxLon, region.maxLat),
        new BMap.Point(region.maxLon, region.minLat),
        new BMap.Point(region.minLon, region.minLat)
    ];

    return new BMap.Polygon(points, {
        strokeColor: style.strokeColor || "#35b9b1",
        strokeWeight: style.strokeWeight || 2,
        strokeOpacity: style.strokeOpacity ?? 0.95,
        fillColor: style.fillColor || "#72b9f4",
        fillOpacity: style.fillOpacity ?? 0.12
    });
}

function cloneRegion(region) {
    if (!region) return null;
    return {
        minLon: Number(region.minLon),
        minLat: Number(region.minLat),
        maxLon: Number(region.maxLon),
        maxLat: Number(region.maxLat)
    };
}

function offsetRegion(originRegion, deltaLon, deltaLat) {
    if (!originRegion) return null;
    return {
        minLon: originRegion.minLon + deltaLon,
        minLat: originRegion.minLat + deltaLat,
        maxLon: originRegion.maxLon + deltaLon,
        maxLat: originRegion.maxLat + deltaLat
    };
}

function lockMapIfNeeded() {
    const rf = getRF();
    if (rf.selecting || rf.draggingTarget) {
        setRegionSelectionMapLocked(true);
    } else {
        setRegionSelectionMapLocked(false);
    }
}

function beginRegionDrag(target, point) {
    const rf = getRF();
    if (rf.selecting || !point) return;

    const sourceRegion = target === "A" ? rf.regionA : rf.regionB;
    if (!sourceRegion) return;

    rf.draggingTarget = target;
    rf.dragStartPoint = { lng: Number(point.lng), lat: Number(point.lat) };
    rf.dragOriginRegion = cloneRegion(sourceRegion);
    hideSelectionBox();
    lockMapIfNeeded();
    updateModeStatus(`拖动区域 ${target}`);
}

function updateRegionDrag(point) {
    const rf = getRF();
    if (!rf.draggingTarget || !rf.dragStartPoint || !rf.dragOriginRegion || !point) {
        return;
    }

    const deltaLon = Number(point.lng) - rf.dragStartPoint.lng;
    const deltaLat = Number(point.lat) - rf.dragStartPoint.lat;
    const nextRegion = offsetRegion(rf.dragOriginRegion, deltaLon, deltaLat);
    if (!nextRegion) return;

    if (rf.draggingTarget === "A") {
        rf.regionA = nextRegion;
        renderRegionA();
    } else if (rf.draggingTarget === "B") {
        rf.regionB = nextRegion;
        renderRegionB();
    }
    updateRegionInfo();
}

function endRegionDrag() {
    const rf = getRF();
    if (!rf.draggingTarget) {
        return;
    }
    const target = rf.draggingTarget;
    rf.draggingTarget = null;
    rf.dragStartPoint = null;
    rf.dragOriginRegion = null;
    lockMapIfNeeded();
    updateModeStatus(`区域 ${target} 已锁定`);
}

function bindPolygonDrag(polygon, target) {
    if (!polygon) return;

    polygon.addEventListener("mousedown", (event) => {
        if (!event || !event.point) return;
        beginRegionDrag(target, event.point);
        if (event.domEvent?.preventDefault) {
            event.domEvent.preventDefault();
        }
        if (event.domEvent?.stopPropagation) {
            event.domEvent.stopPropagation();
        }
    });
}

function ensureSelectionLayer() {
    const rf = getRF();
    if (rf.selectionLayer) {
        return rf.selectionLayer;
    }

    const mapElement = qs("map");
    const layer = document.createElement("div");
    layer.className = "selection-layer";
    layer.innerHTML = `<div class="selection-box" id="region-flow-selection-box"></div>`;
    mapElement.appendChild(layer);

    rf.selectionLayer = layer;
    return layer;
}

function getSelectionBox() {
    ensureSelectionLayer();
    return document.getElementById("region-flow-selection-box");
}

function showSelectionBox(startPixel, endPixel) {
    const box = getSelectionBox();
    const left = Math.min(startPixel.x, endPixel.x);
    const top = Math.min(startPixel.y, endPixel.y);
    const width = Math.abs(startPixel.x - endPixel.x);
    const height = Math.abs(startPixel.y - endPixel.y);

    box.style.display = "block";
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
}

function hideSelectionBox() {
    const box = getSelectionBox();
    if (box) {
        box.style.display = "none";
    }
}

function startSelectRegion(target) {
    const rf = getRF();

    stopAllTaxiMode(true);
    resetDensityState();

    rf.selecting = true;
    rf.selectingTarget = target;
    rf.selectionStartPixel = null;
    rf.selectionEndPixel = null;
    rf.selectionRestoreRegion = cloneRegion(target === "A" ? rf.regionA : rf.regionB);

    ensureSelectionLayer().classList.add("active");
    hideSelectionBox();
    lockMapIfNeeded();
    updateModeStatus(`框选区域 ${target}`);
}

function previewSelectingTarget(startPixel, endPixel) {
    const rf = getRF();
    const target = rf.selectingTarget;
    if (!target || !startPixel || !endPixel) {
        return;
    }

    const region = regionFromPixels(startPixel, endPixel);
    if (target === "A") {
        rf.regionA = region;
        renderRegionA();
    } else if (target === "B") {
        rf.regionB = region;
        renderRegionB();
    }
    updateRegionInfo();
}

function cancelSelectRegion() {
    const rf = getRF();
    const selectionTarget = rf.selectingTarget;
    const selectionRestoreRegion = cloneRegion(rf.selectionRestoreRegion);
    rf.selecting = false;
    rf.selectingTarget = null;
    rf.selectionStartPixel = null;
    rf.selectionEndPixel = null;

    hideSelectionBox();
    if (rf.selectionLayer) {
        rf.selectionLayer.classList.remove("active");
    }
    rf.selectionRestoreRegion = null;
    if (selectionTarget) {
        if (selectionTarget === "A") {
            rf.regionA = selectionRestoreRegion;
            renderRegionA();
        } else if (selectionTarget === "B") {
            rf.regionB = selectionRestoreRegion;
            renderRegionB();
        }
        updateRegionInfo();
    }
    lockMapIfNeeded();
    updateModeStatus("地图");
}

function regionFromPixels(startPixel, endPixel) {
    const leftTop = pixelToPoint(
        Math.min(startPixel.x, endPixel.x),
        Math.min(startPixel.y, endPixel.y)
    );
    const rightBottom = pixelToPoint(
        Math.max(startPixel.x, endPixel.x),
        Math.max(startPixel.y, endPixel.y)
    );

    return {
        minLon: leftTop.lng,
        maxLon: rightBottom.lng,
        maxLat: leftTop.lat,
        minLat: rightBottom.lat
    };
}

function renderRegionA() {
    const rf = getRF();
    if (rf.polygonA) {
        state.map.removeOverlay(rf.polygonA);
        rf.polygonA = null;
    }
    if (!rf.regionA) return;

    rf.polygonA = makePolygon(rf.regionA, {
        strokeColor: "#2f80ed",
        fillColor: "#2f80ed",
        fillOpacity: 0.10
    });
    state.map.addOverlay(rf.polygonA);
    bindPolygonDrag(rf.polygonA, "A");
}

function renderRegionB() {
    const rf = getRF();
    if (rf.polygonB) {
        state.map.removeOverlay(rf.polygonB);
        rf.polygonB = null;
    }
    if (!rf.regionB) return;

    rf.polygonB = makePolygon(rf.regionB, {
        strokeColor: "#eb5757",
        fillColor: "#eb5757",
        fillOpacity: 0.10
    });
    state.map.addOverlay(rf.polygonB);
    bindPolygonDrag(rf.polygonB, "B");
}

function clearRegionA() {
    const rf = getRF();
    if (rf.draggingTarget === "A") {
        endRegionDrag();
    }
    rf.regionA = null;
    if (rf.polygonA) {
        state.map.removeOverlay(rf.polygonA);
        rf.polygonA = null;
    }
    updateRegionInfo();
}

function clearRegionB() {
    const rf = getRF();
    if (rf.draggingTarget === "B") {
        endRegionDrag();
    }
    rf.regionB = null;
    if (rf.polygonB) {
        state.map.removeOverlay(rf.polygonB);
        rf.polygonB = null;
    }
    updateRegionInfo();
}

function clearRegionFlowState() {
    const rf = getRF();
    cancelSelectRegion();
    endRegionDrag();
    closeRegionFlowModal();
    if (rf.polygonA && state.map) {
        state.map.removeOverlay(rf.polygonA);
        rf.polygonA = null;
    }
    if (rf.polygonB && state.map) {
        state.map.removeOverlay(rf.polygonB);
        rf.polygonB = null;
    }
    rf.regionA = null;
    rf.regionB = null;
    rf.lastResult = null;
    updateRegionInfo();
    const chart = ensureChart();
    if (chart) {
        chart.clear();
        chart.setOption(emptyChartOption("等待分析"), true);
    }
    if (rf.modalChart) {
        rf.modalChart.clear();
        rf.modalChart.setOption(emptyChartOption("等待分析"), true);
    }
    renderInfoPanel("region-flow-info", [], "等待分析");
}

function formatRegionText(region) {
    if (!region) return "未设置";
    return [
        `经度：${region.minLon.toFixed(6)} ~ ${region.maxLon.toFixed(6)}`,
        `纬度：${region.minLat.toFixed(6)} ~ ${region.maxLat.toFixed(6)}`
    ].join("\n");
}

function updateRegionInfo() {
    const rf = getRF();
    const aEl = qs("region-flow-region-a-info");
    const bEl = qs("region-flow-region-b-info");

    if (aEl) {
        aEl.textContent = formatRegionText(rf.regionA);
        aEl.classList.toggle("empty", !rf.regionA);
    }
    if (bEl) {
        bEl.textContent = formatRegionText(rf.regionB);
        bEl.classList.toggle("empty", !rf.regionB);
    }
}

function ensureInputs() {
    const rf = getRF();
    if (!rf.regionA) throw new Error("请先框选区域 A");
    if (!rf.regionB) throw new Error("请先框选区域 B");

    const tStart = parseDateTimeInput(qs("region-flow-start").value, "开始时间");
    const tEnd = parseDateTimeInput(qs("region-flow-end").value, "结束时间");
    if (tEnd <= tStart) {
        throw new Error("结束时间必须晚于开始时间");
    }

    const intervalMinutes = Number(qs("region-flow-interval").value);
    const deltaMinutes = Number(qs("region-flow-delta").value);

    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
        throw new Error("时间粒度无效");
    }
    if (!Number.isFinite(deltaMinutes) || deltaMinutes < 0) {
        throw new Error("ΔT 无效");
    }

    const bucketSize = intervalMinutes * 60;
    const bucketCount = Math.ceil((tEnd - tStart) / bucketSize);
    const deltaT = deltaMinutes * 60;

    return {
        regionA: rf.regionA,
        regionB: rf.regionB,
        tStart,
        tEnd,
        bucketSize,
        bucketCount,
        deltaT
    };
}

function ensureChart() {
    const rf = getRF();
    const el = qs("region-flow-chart");
    if (!el || !window.echarts) return null;

    if (!rf.chart) {
        rf.chart = echarts.init(el, null, { renderer: "canvas" });
    }
    return rf.chart;
}

function ensureModalChart() {
    const rf = getRF();
    const modalEl = rf.modal?.querySelector?.("#region-flow-modal-chart");
    if (!modalEl || !window.echarts) return null;
    if (!rf.modalChart) {
        rf.modalChart = echarts.init(modalEl, null, { renderer: "canvas" });
    }
    return rf.modalChart;
}

function bindRegionFlowModalUi() {
    const rf = getRF();
    const expandButton = qs("region-flow-expand");
    if (expandButton) {
        expandButton.addEventListener("click", () => {
            openRegionFlowModal();
        });
    }

    if (rf.modal) {
        rf.modal.addEventListener("click", (event) => {
            if (event.target?.dataset?.close === "1") {
                closeRegionFlowModal();
            }
        });
    }

    if (rf.modalClose) {
        rf.modalClose.addEventListener("click", closeRegionFlowModal);
    }

    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && rf.modalOpen) {
            closeRegionFlowModal();
        }
    });
}

function emptyChartOption(text = "等待分析") {
    return {
        backgroundColor: "transparent",
        animation: false,
        graphic: {
            type: "text",
            left: "center",
            top: "middle",
            style: {
                text,
                fill: "rgba(102, 120, 136, 0.82)",
                fontSize: 13,
                fontWeight: 500
            }
        }
    };
}

function buildRegionFlowChartOption(data, compact = true) {
    const buckets = data?.buckets || [];
    if (!buckets.length) {
        return emptyChartOption("暂无数据");
    }

    const xData = buckets.map(item => formatDateTime(item.bucketStart));
    const aToB = buckets.map(item => Number(item.aToB || 0));
    const bToA = buckets.map(item => Number(item.bToA || 0));

    return {
        backgroundColor: "transparent",
        animation: true,
        animationDuration: compact ? 160 : 220,
        tooltip: {
            trigger: "axis",
            confine: true,
            formatter: (params) => {
                const lines = [params?.[0]?.axisValue || "-"];
                for (const p of (params || [])) {
                    lines.push(`${p.marker}${p.seriesName}: ${Number(p.value).toFixed(2)}`);
                }
                return lines.join("<br/>");
            }
        },
        legend: { top: 6, data: ["A→B", "B→A"] },
        grid: compact
            ? { left: 48, right: 20, top: 42, bottom: 42 }
            : { left: 58, right: 24, top: 54, bottom: 82, containLabel: true },
        xAxis: {
            type: "category",
            data: xData,
            axisLabel: compact
                ? { rotate: 35 }
                : { rotate: 40, hideOverlap: true }
        },
        yAxis: {
            type: "value",
            name: "车流量"
        },
        series: [
            {
                name: "A→B",
                type: "line",
                smooth: true,
                showSymbol: !compact,
                symbolSize: compact ? 0 : 7,
                data: aToB
            },
            {
                name: "B→A",
                type: "line",
                smooth: true,
                showSymbol: !compact,
                symbolSize: compact ? 0 : 7,
                data: bToA
            }
        ]
    };
}

function renderChart(data) {
    const chart = ensureChart();
    if (!chart) return;

    chart.clear();
    chart.setOption(buildRegionFlowChartOption(data, true), true);
    chart.resize();

    const rf = getRF();
    if (rf.modalOpen && rf.modalChart) {
        rf.modalChart.clear();
        rf.modalChart.setOption(buildRegionFlowChartOption(data, false), true);
        rf.modalChart.resize();
    }
}

function openRegionFlowModal() {
    const rf = getRF();
    if (!rf.modal) return;

    rf.modal.hidden = false;
    rf.modalOpen = true;
    if (rf.modalSubtitle) {
        const count = Number(rf.lastResult?.buckets?.length || 0);
        rf.modalSubtitle.textContent = `共 ${formatCount(count)} 个时间段`;
    }

    const modalChart = ensureModalChart();
    if (modalChart) {
        modalChart.clear();
        modalChart.setOption(buildRegionFlowChartOption(rf.lastResult, false), true);
        requestAnimationFrame(() => modalChart.resize());
    }
}

function closeRegionFlowModal() {
    const rf = getRF();
    if (!rf.modal) return;
    rf.modalOpen = false;
    rf.modal.hidden = true;
}
function renderResult(data, params) {
    const summary = data.summary || {};
    renderInfoPanel("region-flow-info", [
        ["A→B 总量", formatFloat2(summary.totalAtoB)],
        ["B→A 总量", formatFloat2(summary.totalBtoA)],
        ["开始时间", formatDateTime(params.tStart)],
        ["结束时间", formatDateTime(params.tEnd)],
        ["时间粒度", `${Math.round(params.bucketSize / 60)} 分钟`],
        ["ΔT", `${Math.round(params.deltaT / 60)} 分钟`],
        ["桶数量", formatCount(params.bucketCount)],
        ["接口耗时", `${Number(data.elapsedMs || 0)} ms`]
    ]);
}

async function runRegionFlowQuery() {
    const rf = getRF();
    const params = ensureInputs();

    const data = await requestJson("/api/region-flow/bidirectional", {
        method: "POST",
        body: JSON.stringify({
            minLonA: params.regionA.minLon,
            minLatA: params.regionA.minLat,
            maxLonA: params.regionA.maxLon,
            maxLatA: params.regionA.maxLat,
            minLonB: params.regionB.minLon,
            minLatB: params.regionB.minLat,
            maxLonB: params.regionB.maxLon,
            maxLatB: params.regionB.maxLat,
            tStart: params.tStart,
            bucketSize: params.bucketSize,
            bucketCount: params.bucketCount,
            deltaT: params.deltaT
        })
    });

    rf.lastResult = data;
    renderResult(data, params);
    renderChart(data);
}

function installRegionFlowSelection() {
    const rf = getRF();
    const mapElement = qs("map");
    ensureSelectionLayer();

    mapElement.addEventListener("mousedown", (event) => {
        if (!rf.selecting || event.button !== 0) return;

        const rect = mapElement.getBoundingClientRect();
        rf.selectionStartPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        rf.selectionEndPixel = { ...rf.selectionStartPixel };
        showSelectionBox(rf.selectionStartPixel, rf.selectionEndPixel);
        event.preventDefault();
    });

    mapElement.addEventListener("mousemove", (event) => {
        if (!rf.selecting || !rf.selectionStartPixel) return;

        const rect = mapElement.getBoundingClientRect();
        rf.selectionEndPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        showSelectionBox(rf.selectionStartPixel, rf.selectionEndPixel);
        previewSelectingTarget(rf.selectionStartPixel, rf.selectionEndPixel);
        event.preventDefault();
    });

    state.map.addEventListener("mousemove", (event) => {
        if (!rf.draggingTarget || !event?.point) return;
        updateRegionDrag(event.point);
    });
    window.addEventListener("mousemove", (event) => {
        if (rf.selecting && rf.selectionStartPixel) {
            const rect = mapElement.getBoundingClientRect();
            rf.selectionEndPixel = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
            showSelectionBox(rf.selectionStartPixel, rf.selectionEndPixel);
            previewSelectingTarget(rf.selectionStartPixel, rf.selectionEndPixel);
            return;
        }
        if (!rf.draggingTarget) return;
        const rect = mapElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const point = pixelToPoint(x, y);
        if (!point) return;
        updateRegionDrag(point);
    });

    window.addEventListener("mouseup", (event) => {
        if (rf.draggingTarget) {
            endRegionDrag();
            return;
        }

        if (!rf.selecting || !rf.selectionStartPixel || !rf.selectionEndPixel) return;

        const rect = mapElement.getBoundingClientRect();
        const endPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        rf.selectionEndPixel = endPixel;

        const width = Math.abs(rf.selectionStartPixel.x - endPixel.x);
        const height = Math.abs(rf.selectionStartPixel.y - endPixel.y);

        if (width < 8 || height < 8) {
            cancelSelectRegion();
            return;
        }

        const region = regionFromPixels(rf.selectionStartPixel, endPixel);
        const target = rf.selectingTarget;

        cancelSelectRegion();

        if (target === "A") {
            rf.regionA = region;
            renderRegionA();
        } else if (target === "B") {
            rf.regionB = region;
            renderRegionB();
        }

        updateRegionInfo();
        updateModeStatus(`区域 ${target} 已锁定`);
    });
}

function initRegionFlowFeature() {
    const rf = getRF();
    rf.modal = qs("region-flow-modal");
    rf.modalTitle = qs("region-flow-modal-title");
    rf.modalSubtitle = qs("region-flow-modal-subtitle");
    rf.modalClose = qs("region-flow-modal-close");

    ensureSelectionLayer();
    updateRegionInfo();

    const chart = ensureChart();
    if (chart) {
        chart.setOption(emptyChartOption("等待分析"), true);
    }
    const modalChart = ensureModalChart();
    if (modalChart) {
        modalChart.setOption(emptyChartOption("等待分析"), true);
    }

    installRegionFlowSelection();
    bindRegionFlowModalUi();

    qs("region-flow-select-a-btn")?.addEventListener("click", () => startSelectRegion("A"));
    qs("region-flow-select-b-btn")?.addEventListener("click", () => startSelectRegion("B"));
    qs("region-flow-clear-a-btn")?.addEventListener("click", clearRegionA);
    qs("region-flow-clear-b-btn")?.addEventListener("click", clearRegionB);

    qs("region-flow-btn")?.addEventListener("click", async () => {
        try {
            await runRegionFlowQuery();
        } catch (error) {
            renderInfoPanel("region-flow-info", [], error.message);
        }
    });

    window.addEventListener("resize", () => {
        const chartRef = getRF().chart;
        if (chartRef) {
            chartRef.resize();
        }
        const modalChartRef = getRF().modalChart;
        if (modalChartRef && getRF().modalOpen) {
            modalChartRef.resize();
        }
    });
}

export {
    initRegionFlowFeature,
    runRegionFlowQuery,
    startSelectRegion,
    clearRegionA,
    clearRegionB,
    clearRegionFlowState
};

