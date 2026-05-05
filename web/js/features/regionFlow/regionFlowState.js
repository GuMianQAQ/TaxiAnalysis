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

function getRFS() {
    return state.regionFlowState;
}

function makePolygon(region) {
    const points = [
        new BMap.Point(region.minLon, region.maxLat),
        new BMap.Point(region.maxLon, region.maxLat),
        new BMap.Point(region.maxLon, region.minLat),
        new BMap.Point(region.minLon, region.minLat)
    ];

    return new BMap.Polygon(points, {
        strokeColor: "#7b61ff",
        strokeWeight: 2,
        strokeOpacity: 0.95,
        fillColor: "#7b61ff",
        fillOpacity: 0.12
    });
}

function ensureSelectionLayer() {
    const rfs = getRFS();

    if (rfs.selectionLayer) {
        return rfs.selectionLayer;
    }

    const mapElement = qs("map");
    const layer = document.createElement("div");
    layer.className = "selection-layer";
    layer.innerHTML = `<div class="selection-box" id="region-flow-state-selection-box"></div>`;
    mapElement.appendChild(layer);

    rfs.selectionLayer = layer;
    return layer;
}

function getSelectionBox() {
    ensureSelectionLayer();
    return document.getElementById("region-flow-state-selection-box");
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

function renderRegion() {
    const rfs = getRFS();

    if (rfs.polygon) {
        state.map.removeOverlay(rfs.polygon);
        rfs.polygon = null;
    }

    if (!rfs.region) {
        return;
    }

    rfs.polygon = makePolygon(rfs.region);
    state.map.addOverlay(rfs.polygon);
}

function formatRegionText(region) {
    if (!region) {
        return "区域 A 未设置";
    }

    return [
        `经度：${region.minLon.toFixed(6)} ~ ${region.maxLon.toFixed(6)}`,
        `纬度：${region.minLat.toFixed(6)} ~ ${region.maxLat.toFixed(6)}`
    ].join("\n");
}

function updateRegionInfo() {
    const rfs = getRFS();
    const el = qs("region-flow-state-region-info");

    if (!el) {
        return;
    }

    el.textContent = formatRegionText(rfs.region);
    el.classList.toggle("empty", !rfs.region);
}

function startSelectRegion() {
    const rfs = getRFS();

    stopAllTaxiMode(true);
    resetDensityState();

    rfs.selecting = true;
    rfs.selectionStartPixel = null;
    rfs.selectionEndPixel = null;

    ensureSelectionLayer().classList.add("active");
    hideSelectionBox();
    setRegionSelectionMapLocked(true);
    updateModeStatus("框选区域 A");
}

function cancelSelectRegion() {
    const rfs = getRFS();

    rfs.selecting = false;
    rfs.selectionStartPixel = null;
    rfs.selectionEndPixel = null;

    hideSelectionBox();

    if (rfs.selectionLayer) {
        rfs.selectionLayer.classList.remove("active");
    }

    setRegionSelectionMapLocked(false);
}

function clearRegion() {
    const rfs = getRFS();

    cancelSelectRegion();

    rfs.region = null;
    rfs.lastResult = null;

    if (rfs.polygon) {
        state.map.removeOverlay(rfs.polygon);
        rfs.polygon = null;
    }

    updateRegionInfo();
    renderInfoPanel("region-flow-state-info", [], "等待分析");

    const chart = ensureChart();
    if (chart) {
        chart.clear();
        chart.setOption(emptyChartOption("等待分析"), true);
    }
}

function ensureInputs() {
    const rfs = getRFS();

    if (!rfs.region) {
        throw new Error("请先框选区域 A");
    }

    const tStart = parseDateTimeInput(qs("region-flow-state-start").value, "开始时间");
    const tEnd = parseDateTimeInput(qs("region-flow-state-end").value, "结束时间");

    if (tEnd <= tStart) {
        throw new Error("结束时间必须晚于开始时间");
    }

    const intervalMinutes = Number(qs("region-flow-state-interval").value);

    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
        throw new Error("时间粒度无效");
    }

    const bucketSize = intervalMinutes * 60;
    const bucketCount = Math.ceil((tEnd - tStart) / bucketSize);

    return {
        region: rfs.region,
        tStart,
        tEnd,
        bucketSize,
        bucketCount
    };
}

function ensureChart() {
    const rfs = getRFS();
    const el = qs("region-flow-state-chart");

    if (!el || !window.echarts) {
        return null;
    }

    if (!rfs.chart) {
        rfs.chart = echarts.init(el, null, { renderer: "canvas" });
    }

    return rfs.chart;
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

function buildChartOption(data) {
    const buckets = data?.buckets || [];

    if (!buckets.length) {
        return emptyChartOption("暂无数据");
    }

    const xData = buckets.map(item => formatDateTime(item.bucketStart));

    const entering = buckets.map(item => Number(item.entering || 0));
    const leaving = buckets.map(item => Number(item.leaving || 0));
    const inside = buckets.map(item => Number(item.inside || 0));

    return {
        backgroundColor: "transparent",
        animation: true,
        animationDuration: 180,
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
        legend: {
            top: 6,
            data: ["进入", "离开", "区域内车辆"]
        },
        grid: {
            left: 48,
            right: 20,
            top: 42,
            bottom: 42
        },
        xAxis: {
            type: "category",
            data: xData,
            axisLabel: {
                rotate: 35
            }
        },
        yAxis: {
            type: "value",
            name: "车辆数"
        },
        series: [
            {
                name: "进入",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: entering
            },
            {
                name: "离开",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: leaving
            },
            {
                name: "区域内车辆",
                type: "line",
                smooth: true,
                showSymbol: false,
                data: inside
            }
        ]
    };
}

function renderChart(data) {
    const chart = ensureChart();

    if (!chart) {
        return;
    }

    chart.clear();
    chart.setOption(buildChartOption(data), true);
    chart.resize();
}

function renderResult(data, params) {
    const summary = data.summary || {};

    renderInfoPanel("region-flow-state-info", [
        ["进入总量", formatFloat2(summary.totalEntering)],
        ["离开总量", formatFloat2(summary.totalLeaving)],
        ["净流入", formatFloat2(summary.netEntering)],
        ["开始时间", formatDateTime(params.tStart)],
        ["结束时间", formatDateTime(params.tEnd)],
        ["时间粒度", `${Math.round(params.bucketSize / 60)} 分钟`],
        ["桶数量", formatCount(params.bucketCount)],
        ["接口耗时", `${Number(data.elapsedMs || 0)} ms`]
    ]);
}

async function runRegionFlowStateQuery() {
    const rfs = getRFS();
    const params = ensureInputs();

    const data = await requestJson("/api/region-flow/state", {
        method: "POST",
        body: JSON.stringify({
            minLon: params.region.minLon,
            minLat: params.region.minLat,
            maxLon: params.region.maxLon,
            maxLat: params.region.maxLat,
            tStart: params.tStart,
            bucketSize: params.bucketSize,
            bucketCount: params.bucketCount
        })
    });

    rfs.lastResult = data;

    renderResult(data, params);
    renderChart(data);
    updateModeStatus("区域关联分析 2");
}

function installSelectionEvents() {
    const rfs = getRFS();
    const mapElement = qs("map");

    ensureSelectionLayer();

    mapElement.addEventListener("mousedown", (event) => {
        if (!rfs.selecting || event.button !== 0) {
            return;
        }

        const rect = mapElement.getBoundingClientRect();

        rfs.selectionStartPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        rfs.selectionEndPixel = { ...rfs.selectionStartPixel };

        showSelectionBox(rfs.selectionStartPixel, rfs.selectionEndPixel);
        event.preventDefault();
    });

    mapElement.addEventListener("mousemove", (event) => {
        if (!rfs.selecting || !rfs.selectionStartPixel) {
            return;
        }

        const rect = mapElement.getBoundingClientRect();

        rfs.selectionEndPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        showSelectionBox(rfs.selectionStartPixel, rfs.selectionEndPixel);

        const region = regionFromPixels(rfs.selectionStartPixel, rfs.selectionEndPixel);
        rfs.region = region;
        renderRegion();
        updateRegionInfo();

        event.preventDefault();
    });

    window.addEventListener("mouseup", (event) => {
        if (!rfs.selecting || !rfs.selectionStartPixel || !rfs.selectionEndPixel) {
            return;
        }

        const rect = mapElement.getBoundingClientRect();

        const endPixel = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        rfs.selectionEndPixel = endPixel;

        const width = Math.abs(rfs.selectionStartPixel.x - endPixel.x);
        const height = Math.abs(rfs.selectionStartPixel.y - endPixel.y);

        if (width < 8 || height < 8) {
            cancelSelectRegion();
            updateModeStatus("地图");
            return;
        }

        rfs.region = regionFromPixels(rfs.selectionStartPixel, endPixel);

        cancelSelectRegion();
        renderRegion();
        updateRegionInfo();
        updateModeStatus("区域 A 已锁定");
    });
}

function clearRegionFlowStateAnalysis() {
    const rfs = getRFS();

    cancelSelectRegion();

    if (rfs.polygon && state.map) {
        state.map.removeOverlay(rfs.polygon);
        rfs.polygon = null;
    }

    rfs.region = null;
    rfs.lastResult = null;

    updateRegionInfo();

    const chart = ensureChart();
    if (chart) {
        chart.clear();
        chart.setOption(emptyChartOption("等待分析"), true);
    }

    renderInfoPanel("region-flow-state-info", [], "等待分析");
}

function initRegionFlowStateFeature() {
    ensureSelectionLayer();
    updateRegionInfo();

    const chart = ensureChart();
    if (chart) {
        chart.setOption(emptyChartOption("等待分析"), true);
    }

    installSelectionEvents();

    qs("region-flow-state-select-btn")?.addEventListener("click", startSelectRegion);
    qs("region-flow-state-clear-btn")?.addEventListener("click", clearRegion);

    qs("region-flow-state-btn")?.addEventListener("click", async () => {
        try {
            await runRegionFlowStateQuery();
        } catch (error) {
            renderInfoPanel("region-flow-state-info", [], error.message);
        }
    });

    window.addEventListener("resize", () => {
        const chartRef = getRFS().chart;
        if (chartRef) {
            chartRef.resize();
        }
    });
}

export {
    initRegionFlowStateFeature,
    runRegionFlowStateQuery,
    clearRegionFlowStateAnalysis
};