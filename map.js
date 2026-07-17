// ======================================================
// Configuration
// ======================================================

const DATASETS = {
    minecraft: "data/minecraft",
    discord: "data/discord"
};

let currentDataset = "minecraft";
let currentProjection = "UMAP";

// ======================================================
// Loaded data
// ======================================================

let umapData = [];
let pcaData = [];

let playerStats = {};
let serverStats = {};

let figureCreated = false;

let currentColour = "cluster";
let styleFeatures = [];

// ======================================================
// Plot layout (created ONCE)
// ======================================================

const layout = {
    title: "Writing Style Map",
    dragmode: "pan",
    hovermode: "closest",
    xaxis: {
        zeroline: false,
        title: ""
    },
    yaxis: {
        zeroline: false,
        title: ""
    },
    margin: {
        t: 60
    }
};

// ======================================================
// CSV & JSON loaders
// ======================================================

async function loadCSV(path){
    const response = await fetch(path);
    const text = await response.text();

    return Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true
    }).data;
}

async function loadJSON(path){
    const response = await fetch(path);
    return await response.json();
}

// ======================================================
// Load selected dataset
// ======================================================

async function loadDataset(dataset){
    currentDataset = dataset;
    const folder = DATASETS[currentDataset];

    console.log("Loading:", currentDataset);

    [
        umapData,
        pcaData,
        playerStats,
        serverStats
    ] = await Promise.all([
        loadCSV(`${folder}/player_umap_2d_results_named.csv`),
        loadCSV(`${folder}/player_pca_results_named.csv`),
        loadJSON(`${folder}/player_stylometry_raw.json`),
        loadCSV(`${folder}/server_stylometry_raw.csv`)
    ]);

    if (serverStats && serverStats.length > 0) {
        styleFeatures = Object.keys(serverStats[0])
            .filter(f => f !== "player")
            .sort();
    } else {
        styleFeatures = [];
    }

    populateColourDropdown();
    setupSearch();
    console.log("Finished loading data.");
    drawPlot();
}

function populateColourDropdown(){
    const select = document.getElementById("colourSelect");
    if (!select) return;

    select.innerHTML = "";

    let option = document.createElement("option");
    option.value = "cluster";
    option.textContent = "HDBSCAN Cluster";
    select.appendChild(option);

    for(const feature of styleFeatures){
        option = document.createElement("option");
        option.value = feature;
        option.textContent = feature
            .replace("_statistics_", " • ")
            .replaceAll("_", " ");
        select.appendChild(option);
    }
}

function currentData(){
    if(currentProjection === "UMAP"){
        return { data: umapData, x: "UMAP_1", y: "UMAP_2" };
    }
    return { data: pcaData, x: "PC1", y: "PC2" };
}

// ======================================================
// 9. Cluster Legend Generator
// ======================================================

function updateClusterLegend(clusterColours) {
    const legendEl = document.getElementById("clusterLegend");
    if (!legendEl) return;
    
    if (currentColour !== "cluster") {
        legendEl.innerHTML = "";
        return;
    }

    let html = `<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 12px;">`;
    Object.entries(clusterColours).sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([cluster, color]) => {
        const label = cluster === "-1" ? "Noise" : `Cluster ${cluster}`;
        html += `
            <div style="display: flex; align-items: center; gap: 4px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></span>
                <span>${label}</span>
            </div>`;
    });
    html += `</div>`;
    legendEl.innerHTML = html;
}

// ======================================================
// Draw / Update figure
// ======================================================

function getMarkerConfig(plot) {
    let marker = { size: 7, opacity: 0.8 };

    if (currentColour === "cluster") {
        const palette = [
            "#e6194b","#3cb44b","#ffe119","#4363d8",
            "#f58231","#911eb4","#46f0f0","#f032e6",
            "#bcf60c","#fabebe","#008080","#e6beff",
            "#9a6324","#fffac8","#800000","#aaffc3",
            "#808000","#ffd8b1","#000075","#808080"
        ];

        const clusterColours = {};
        let next = 0;

        plot.data.forEach(d => {
            const c = String(d.cluster);
            if (!(c in clusterColours)) {
                if (c === "-1") {
                    clusterColours[c] = "#888888";
                } else {
                    clusterColours[c] = palette[next % palette.length];
                    next++;
                }
            }
        });

        marker.color = plot.data.map(d => clusterColours[String(d.cluster)] || "#888888");
        marker.showscale = false;
        
        updateClusterLegend(clusterColours);
    } 
    else {
        // Hide cluster legend when analyzing stylometric gradient scales
        const legendEl = document.getElementById("clusterLegend");
        if (legendEl) legendEl.innerHTML = "";

        const values = plot.data.map(d => {
            const stats = playerStats[d.player];
            if (!stats) return null;
            const v = stats[currentColour];
            return v === undefined ? null : Number(v);
        });

        const transformed = values.map(v => {
            if (v == null || isNaN(v)) return null;
            return Math.sign(v) * Math.log1p(Math.abs(v));
        });

        marker.color = transformed;
        marker.colorscale = "Viridis";
        marker.showscale = true;
        marker.colorbar = {
            title: currentColour.replace("_statistics_", "<br>").replaceAll("_", " ")
        };
    }

    return marker;
}

function drawPlot() {
    const plot = currentData();
    const marker = getMarkerConfig(plot);
    const showLabelsInput = document.getElementById("showLabels");
    const showLabels = showLabelsInput ? showLabelsInput.checked : false;

    const trace = {
        type: "scatter",
        // 2. Conditional visibility of text labels based on UI settings
        mode: showLabels ? "markers+text" : "markers",
        x: plot.data.map(d => d[plot.x]),
        y: plot.data.map(d => d[plot.y]),
        text: plot.data.map(d => d.player),
        textposition: "top center",
        textfont: { size: 10 },
        hovertemplate: "<b>%{text}</b><extra></extra>",
        marker: marker
    };

    layout.title = `${currentDataset.toUpperCase()} • ${currentProjection}`;
    const plotEl = document.getElementById("plot");

    if (!figureCreated) {
        Plotly.newPlot("plot", [trace], layout, {
            responsive: true,
            displaylogo: false,
            scrollZoom: true
        });
        
        plotEl.on("plotly_click", function(eventData) {
            if (eventData?.points?.[0]) {
                highlightPlayer(eventData.points[0].text);
            }
        });

        // 10. Natural workspace interaction: Double click on empty map area resets graph highlight
        plotEl.on("plotly_doubleclick", function() {
            resetHighlight();
        });

        figureCreated = true;
    } else {
        Plotly.react("plot", [trace], layout);
    }
}

// ======================================================
// Change view controllers
// ======================================================

function setProjection(projection){
    currentProjection = projection;
    setupSearch(); 
    drawPlot();
}

async function setDataset(dataset){
    await loadDataset(dataset);
}

// ======================================================
// Player search
// ======================================================

function setupSearch(){
    const input = document.getElementById("playerSearch");
    const list = document.getElementById("playerList");
    if (!input || !list) return;

    list.innerHTML = "";

    currentData().data
        .map(d => d.player)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .forEach(player => {
            const option = document.createElement("option");
            option.value = player;
            list.appendChild(option);
        });

    input.onchange = function(){
        const player = this.value.trim();
        if(currentData().data.some(d => d.player === player)){
            highlightPlayer(player);
        }
    };
}

function highlightPlayer(player){
    const plot = currentData();
    const index = plot.data.findIndex(d => d.player === player);
    if(index === -1) return;

    const sizes = plot.data.map(() => 7);
    const opacity = plot.data.map(() => 0.15);

    sizes[index] = 18;
    opacity[index] = 1;

    const baseMarker = getMarkerConfig(plot);

    Plotly.react(
        "plot",
        [{
            type: "scatter",
            mode: document.getElementById("showLabels")?.checked ? "markers+text" : "markers",
            x: plot.data.map(d => d[plot.x]),
            y: plot.data.map(d => d[plot.y]),
            text: plot.data.map(d => d.player),
            textposition: "top center",
            textfont: { size: 10 },
            hovertemplate: "<b>%{text}</b><extra></extra>",
            marker: {
                ...baseMarker,
                size: sizes,
                opacity: opacity
            }
        }],
        layout
    );

    Plotly.relayout("plot", {
        "xaxis.range": [plot.data[index][plot.x] - 0.5, plot.data[index][plot.x] + 0.5],
        "yaxis.range": [plot.data[index][plot.y] - 0.5, plot.data[index][plot.y] + 0.5]
    });

    showPlayerInfo(player);
}

// 1. Completely clear textual boxes out on target reset instead of introducing generic filler phrases
function resetHighlight(){
    const plot = currentData();

    Plotly.restyle(
        "plot",
        {
            "marker.size": [plot.data.map(() => 7)],
            "marker.opacity": [plot.data.map(() => 0.8)]
        },
        [0]
    );

    Plotly.relayout("plot", { "xaxis.autorange": true, "yaxis.autorange": true });

    const searchInput = document.getElementById("playerSearch");
    if (searchInput) searchInput.value = "";

    ["playerName", "summary", "uniqueTraits", "averageTraits", "neighbourList", "playerStats"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });
}

// ======================================================
// 3, 4, 5. Comprehensive Contextual Math Engine
// ======================================================

function getFeatureDistribution(key) {
    const values = Object.values(playerStats)
        .map(x => x[key])
        .filter(v => typeof v === "number" && !isNaN(v));
    
    if (values.length === 0) return { mean: 0, stdev: 1 };
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdev = Math.sqrt(variance) || 1;
    
    return { mean, stdev };
}

function percentageDifference(player, key) {
    const stats = playerStats[player];
    if (!stats || typeof stats[key] !== "number") return 0;
    
    const { mean } = getFeatureDistribution(key);
    if (mean === 0) return 0;
    
    return ((stats[key] - mean) / mean) * 100;
}

// Calculations sorted by statistical z-score instead of simple absolute value weights
function computeZScores(player) {
    const stats = playerStats[player];
    if (!stats) return [];
    
    return Object.entries(stats)
        .filter(([_, v]) => typeof v === "number")
        .map(([k, v]) => {
            const { mean, stdev } = getFeatureDistribution(k);
            return {
                key: k,
                rawValue: v,
                zScore: (v - mean) / stdev
            };
        });
}

function getUniqueTraits(player) {
    return computeZScores(player)
        .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
        .slice(0, 10);
}

function getAverageTraits(player) {
    return computeZScores(player)
        .sort((a, b) => Math.abs(a.zScore) - Math.abs(b.zScore))
        .slice(0, 10);
}

// ======================================================
// 8. Distance Geometry & Interaction Mapping
// ======================================================

function getNearestNeighbours(player){
    const plot = currentData();
    const me = plot.data.find(d => d.player === player);
    if (!me) return [];

    return plot.data
        .filter(d => d.player !== player)
        .map(d => ({
            player: d.player,
            dist: Math.hypot(d[plot.x] - me[plot.x], d[plot.y] - me[plot.y])
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 10);
}

// ======================================================
// Render Metadata & Statistical Panels
// ======================================================

function showPlayerInfo(player){
    const stats = playerStats[player];
    const statsContainer = document.getElementById("playerStats");
    if(!statsContainer || !stats) return;

    const nameContainer = document.getElementById("playerName");
    if (nameContainer) nameContainer.textContent = player;

    const mapRow = currentData().data.find(d => d.player === player);
    const clusterVal = mapRow ? mapRow.cluster : "Unknown";
    const neighbors = getNearestNeighbours(player);
    const topUnique = getUniqueTraits(player);

    // 6. Contextually descriptive multi-line workspace summary block
    const summaryContainer = document.getElementById("summary");
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div style="line-height: 1.4; font-size: 13px;">
                <strong>Cluster ID:</strong> ${clusterVal === -1 ? "Noise (-1)" : clusterVal}<br>
                <strong>Nearest Author:</strong> ${neighbors[0] ? neighbors[0].player : "None"}<br>
                <strong>Most Distinctive:</strong>
                <ul style="margin: 4px 0; padding-left: 16px;">
                    ${topUnique.slice(0, 3).map(t => {
                        const markerPrefix = t.zScore >= 0 ? "High" : "Low";
                        const friendlyName = t.key.replace("_statistics_", " ").replaceAll("_", " ");
                        return `<li>${markerPrefix} ${friendlyName}</li>`;
                    }).join("")}
                </ul>
            </div>
        `;
    }

    // 3, 7. Transform values to percent deviations and clamp rows to top 15 most expressive variations
    let html = "<table>";
    const sortedFeatures = Object.keys(stats)
        .filter(k => typeof stats[k] === "number")
        .map(k => ({ key: k, diff: percentageDifference(player, k) }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 15);

    sortedFeatures.forEach(({ key, diff }) => {
        const displayValue = diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
        html += `
        <tr>
            <td>${key.replaceAll("_", " ")}</td>
            <td style="color: ${diff >= 0 ? '#27ae60' : '#c0392b'}; font-weight: bold;">${displayValue}</td>
        </tr>
        `;
    });
    html += "</table>";
    statsContainer.innerHTML = html;

    // Populating UI Trait structures with calculated contextual data
    const uniqueEl = document.getElementById("uniqueTraits");
    if (uniqueEl) {
        uniqueEl.innerHTML = topUnique
            .map(x => `<li>${x.key.replaceAll("_", " ")} (${x.zScore >= 0 ? '+' : ''}${x.zScore.toFixed(2)}σ)</li>`)
            .join("");
    }

    const averageEl = document.getElementById("averageTraits");
    if (averageEl) {
        averageEl.innerHTML = getAverageTraits(player)
            .map(x => `<li>${x.key.replaceAll("_", " ")} (${x.zScore.toFixed(2)}σ)</li>`)
            .join("");
    }

    // 8. Neighbors populated as fully reactive actionable anchors
    const neighborEl = document.getElementById("neighbourList");
    if (neighborEl) {
        neighborEl.innerHTML = neighbors
            .map(x => `<li style="cursor: pointer; color: #3498db; text-decoration: underline; margin-bottom: 2px;" 
                           onclick="highlightPlayer('${x.player.replace(/'/g, "\\'")}')">${x.player}</li>`)
            .join("");
    }
}

// ======================================================
// Start
// ======================================================

window.addEventListener("load", () => {
    loadDataset(currentDataset);

    const datasetSelect = document.getElementById("datasetSelect");
    if (datasetSelect) {
        datasetSelect.addEventListener("change", function () {
            setDataset(this.value);
        });
    }

    const colourSelect = document.getElementById("colourSelect");
    if (colourSelect) {
        colourSelect.addEventListener("change", function () {
            currentColour = this.value;
            drawPlot();
        });
    }

    // 2. Attach clean runtime rendering hook to the text visualization checkbox toggles
    const showLabelsSelect = document.getElementById("showLabels");
    if (showLabelsSelect) {
        showLabelsSelect.addEventListener("change", drawPlot);
    }

    const resetBtn = document.getElementById("resetHighlight");
    if (resetBtn) {
        resetBtn.onclick = resetHighlight;
    }
});
