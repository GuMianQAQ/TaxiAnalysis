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

    ensureSelectionLayer().classList.add("active");
    hideSelectionBox();
    setRegionSelectionMapLocked(true);
    updateModeStatus(`框选区域 ${target}`);
}

function cancelSelectRegion() {
    const rf = getRF();
    rf.selecting = false;
    rf.selectingTarget = null;
    rf.selectionStartPixel = null;
    rf.selectionEndPixel = null;

    hideSelectionBox();
    if (rf.selectionLayer) {
        rf.selectionLayer.classList.remove("active");
    }
    setRegionSelectionMapLocked(false);
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
}

function clearRegionA() {
    const rf = getRF();
    rf.regionA = null;
    if (rf.polygonA) {
        state.map.removeOverlay(rf.polygonA);
        rf.polygonA = null;
    }
    updateRegionInfo();
}

function clearRegionB() {
    const rf = getRF();
    rf.regionB = null;
    if (rf.polygonB) {
        state.map.removeOverlay(rf.polygonB);
        rf.polygonB = null;
    }
    updateRegionInfo();
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

function renderChart(data) {
    const chart = ensureChart();
    if (!chart) return;

    const buckets = data?.buckets || [];
    if (!buckets.length) {
        chart.clear();
        chart.setOption(emptyChartOption("暂无数据"), true);
        return;
    }

    const xData = buckets.map(item => formatDateTime(item.bucketStart));
    const aToB = buckets.map(item => Number(item.aToB || 0));
    const bToA = buckets.map(item => Number(item.bToA || 0));

    chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
    trigger: "axis",
    confine: true,
    formatter: (params) => {
        let lines = [params[0].axisValue];
        for (const p of params) {
            lines.push(`${p.marker}${p.seriesName}: ${Number(p.value).toFixed(2)}`);
        }
        return lines.join("<br/>");
    }
},
        legend: { top: 6, data: ["A→B", "B→A"] },
        grid: { left: 48, right: 20, top: 42, bottom: 42 },
        xAxis: {
            type: "category",
            data: xData,
            axisLabel: { rotate: 35 }
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
                showSymbol: false,
                data: aToB
            },
            {
                name: "B→A",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: bToA
            }
        ]
    }, true);

    chart.resize();
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
        event.preventDefault();
    });

    window.addEventListener("mouseup", (event) => {
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
    ensureSelectionLayer();
    updateRegionInfo();

    const chart = ensureChart();
    if (chart) {
        chart.setOption(emptyChartOption("等待分析"), true);
    }

    installRegionFlowSelection();

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
    });
}

export {
    initRegionFlowFeature,
    runRegionFlowQuery,
    startSelectRegion,
    clearRegionA,
    clearRegionB
};