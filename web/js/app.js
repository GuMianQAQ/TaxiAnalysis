import { state } from "./core/state.js";
import { qs, setText, renderInfoPanel, updateMetaStatus, updateRegionStatus, updateModeStatus, requestJson } from "./core/utils.js";
import { loadBaiduMapScript, initMap, clearRegionOverlay, clearTrajectoryOverlays, resetDensityState } from "./map/map.js";
import { ensureDensityOverlay } from "./map/overlays/densityOverlay.js";
import { installDensityMapInteractions } from "./features/density/densityView.js";
import { installRegionSelection, startRegionSelection, cancelRegionSelection } from "./map/regionSelection.js";
import { activateDockPanel, clearDockSelection } from "./ui/dock.js";
import { runTrajectoryQuery } from "./features/trajectory/trajectoryService.js";
import { runRegionQuery } from "./features/region/regionService.js";
import { runDensityQuery, setDensityBucketIndex, stopDensityPlayback, startDensityPlayback } from "./features/density/densityService.js";
import { initRegionFlowFeature } from "./features/regionFlow/regionFlow.js";
import { runFrequentPathQuery } from "./features/frequentPath/frequentPathService.js";
import { initFrequentPathRegionFeature } from "./features/frequentPath/frequentPathRegionService.js";
import { initFastestPathRegionFeature } from "./features/fastestPath/fastestPathRegionService.js";
import { initRegionFlowStateFeature } from "./features/regionFlow/regionFlowState.js";
function setInputValueIfExists(id, value) {
    const element = qs(id);
    if (element) {
        element.value = value;
    }
}

function applyDefaultTimeValues() {
    const defaultStart = "2008-02-03T06:30";
    const defaultEnd = "2008-02-03T22:00";

    setInputValueIfExists("region-start", defaultStart);
    setInputValueIfExists("region-end", defaultEnd);
    setInputValueIfExists("density-start", defaultStart);
    setInputValueIfExists("density-end", defaultEnd);
    setInputValueIfExists("region-flow-start", defaultStart);
    setInputValueIfExists("region-flow-end", defaultEnd);
    setInputValueIfExists("region-flow-state-start", defaultStart);
    setInputValueIfExists("region-flow-state-end", defaultEnd);
    setInputValueIfExists("fastest-path-start", defaultStart);
    setInputValueIfExists("fastest-path-end", defaultEnd);
}

function attachButtonRipple(button) {
    button.addEventListener("pointerdown", (event) => {
        const rect = button.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.className = "ripple";
        const size = Math.max(rect.width, rect.height) * 1.8;
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${event.clientX - rect.left}px`;
        ripple.style.top = `${event.clientY - rect.top}px`;
        button.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
    });
}

function bindEvents() {
    document.querySelectorAll(".tool-btn[data-panel]").forEach((button) => {
        button.addEventListener("click", () => {
            activateDockPanel(button.dataset.panel);
        });
    });
	qs("frequent-path-btn")?.addEventListener("click", async () => {
    try {
        await runFrequentPathQuery();
    } catch (error) {
        renderInfoPanel("frequent-path-info", [], error.message);
    }
});
    document.querySelectorAll("button").forEach((button) => {
        attachButtonRipple(button);
    });

    const rail = document.querySelector(".rail");
    if (rail) {
        rail.addEventListener("dblclick", (event) => {
            if (event.target.closest("button, input, select, label, .result, .result-block")) {
                return;
            }
            clearDockSelection();
        });
    }

    qs("select-region-btn").addEventListener("click", startRegionSelection);

    qs("clear-region-btn").addEventListener("click", () => {
        cancelRegionSelection();
        state.region = null;
        clearRegionOverlay();
        clearTrajectoryOverlays();
        resetDensityState();
        updateRegionStatus();
    });

    qs("trajectory-btn").addEventListener("click", async () => {
        try {
            await runTrajectoryQuery();
        } catch (error) {
            renderInfoPanel("trajectory-info", [], error.message);
        }
    });

    qs("region-query-btn").addEventListener("click", async () => {
        try {
            await runRegionQuery();
        } catch (error) {
            renderInfoPanel("region-query-info", [], error.message);
        }
    });

    qs("density-btn").addEventListener("click", async () => {
        try {
            await runDensityQuery();
        } catch (error) {
            renderInfoPanel("density-info", [], error.message);
        }
    });

    qs("density-bucket").addEventListener("change", (event) => {
        setDensityBucketIndex(Number(event.target.value));
    });

    qs("density-timeline").addEventListener("input", (event) => {
        setDensityBucketIndex(Number(event.target.value));
    });

    qs("density-prev").addEventListener("click", () => {
        stopDensityPlayback();
        setDensityBucketIndex(state.currentBucketIndex - 1);
    });

    qs("density-next").addEventListener("click", () => {
        stopDensityPlayback();
        setDensityBucketIndex(state.currentBucketIndex + 1);
    });

    qs("density-play").addEventListener("click", () => {
        if (state.densityPlayTimer) {
            stopDensityPlayback();
            return;
        }
        startDensityPlayback();
    });

    
}

async function bootstrap() {
    setText("server-status", "连接中");
    try {
        state.meta = await requestJson("/api/meta");
        await loadBaiduMapScript(state.meta.baiduMapAk);
        initMap();
        ensureDensityOverlay();
        installDensityMapInteractions();
        installRegionSelection();
		initRegionFlowFeature();
		initRegionFlowStateFeature();
		initFrequentPathRegionFeature();
		initFastestPathRegionFeature();
        bindEvents();
        applyDefaultTimeValues();
        updateMetaStatus();
        updateRegionStatus();
        updateModeStatus("地图");
        clearDockSelection();
    } catch (error) {
        setText("server-status", "失败");
        renderInfoPanel("trajectory-info", [], error.message);
        throw error;
    }
}

bootstrap().catch((error) => {
    console.error(error);
});


