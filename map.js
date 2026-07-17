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
// CSV loader
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

// ======================================================
// JSON loader
// ======================================================

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

// ======================================================
// Current projection
// ======================================================

function currentData(){
    if(currentProjection === "UMAP"){
        return {
            data: umapData,
            x: "UMAP_1",
            y: "UMAP_2"
        };
    }
    return {
        data: pcaData,
        x: "PC1",
        y: "PC2"
    };
}

// ======================================================
// Draw / Update figure
// ======================================================

function getMarkerConfig(plot) {
    let marker = {
        size: 7,
        opacity: 0.8
    };

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
    } 
    else {
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
            title: currentColour
                .replace("_statistics_", "<br>")
                .replaceAll("_", " ")
        };
    }

    return marker;
}

function drawPlot() {
    const plot = currentData();
    const marker = getMarkerConfig(plot);

    const trace = {
        type: "scatter",
        mode: "markers",
        x: plot.data.map(d => d[plot.x]),
        y: plot.data.map(d => d[plot.y]),
        text: plot.data.map(d => d.player),
        hovertemplate: "<b>%{text}</b><extra></extra>",
        marker: marker
    };

    layout.title = `${currentDataset.toUpperCase()} • ${currentProjection}`;

    const plotEl = document.getElementById("plot");

    if (!figureCreated) {
        Plotly.newPlot(
            "plot",
            [trace],
            layout,
            {
                responsive: true,
                displaylogo: false,
                scrollZoom: true
            }
        );
        
        // 1. CLICK TO HIGHLIGHT TRIGGER REGISTERED ONCE
        plotEl.on("plotly_click", function(eventData) {
            if (eventData && eventData.points && eventData.points[0]) {
                const player = eventData.points[0].text;
                highlightPlayer(player);
            }
        });

        figureCreated = true;
    } else {
        Plotly.react("plot", [trace], layout);
    }
}

// ======================================================
// Change projection
// ======================================================

function setProjection(projection){
    currentProjection = projection;
    setupSearch(); 
    drawPlot();
}

// ======================================================
// Change dataset
// ======================================================

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
            mode: "markers",
            x: plot.data.map(d => d[plot.x]),
            y: plot.data.map(d => d[plot.y]),
            text: plot.data.map(d => d.player),
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
        "xaxis.range": [
            plot.data[index][plot.x] - 0.5,
            plot.data[index][plot.x] + 0.5
        ],
        "yaxis.range": [
            plot.data[index][plot.y] - 0.5,
            plot.data[index][plot.y] + 0.5
        ]
    });

    showPlayerInfo(player);
}

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

    Plotly.relayout(
        "plot",
        {
            "xaxis.autorange": true,
            "yaxis.autorange": true
        }
    );

    const searchInput = document.getElementById("playerSearch");
    if (searchInput) searchInput.value = "";

    // Clear sidebar elements cleanly back to their base state
    const els = ["playerName", "summary", "uniqueTraits", "averageTraits", "neighbourList", "playerStats"];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = "";
    });

    const statsContainer = document.getElementById("playerStats");
    if (statsContainer) {
        statsContainer.innerHTML = `
            <h3>No player selected</h3>
            <p>Click a player on the map or search for one.</p>
        `;
    }
}

// ======================================================
// 3. Trait Computation Metrics (Deviation-based)
// ======================================================

function getUniqueTraits(player){
    const stats = playerStats[player];
    if (!stats) return [];
    return Object.entries(stats)
        .filter(([k, v]) => typeof v === "number")
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 10);
}

function getAverageTraits(player){
    const stats = playerStats[player];
    if (!stats) return [];
    return Object.entries(stats)
        .filter(([k, v]) => typeof v === "number")
        .sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))
        .slice(0, 10);
}

// ======================================================
// 4. Coordinate Proximity Math
// ======================================================

function getNearestNeighbours(player){
    const plot = currentData();
    const me = plot.data.find(d => d.player === player);
    if (!me) return [];

    return plot.data
        .filter(d => d.player !== player)
        .map(d => ({
            player: d.player,
            dist: Math.hypot(
                d[plot.x] - me[plot.x],
                d[plot.y] - me[plot.y]
            )
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
    if(!statsContainer) return;
    if(!stats) return;

    // 2. Clear out container and map variables to sidebar structural boxes
    const nameContainer = document.getElementById("playerName");
    if (nameContainer) nameContainer.textContent = player;

    const summaryContainer = document.getElementById("summary");
    if (summaryContainer) {
        summaryContainer.innerHTML = `<b>${Object.keys(stats).length}</b> stylometric features`;
    }

    let html = "";
    html += "<table>";
    Object.entries(stats).forEach(([k, v]) => {
        const displayValue = (typeof v === 'number' || !isNaN(Number(v))) 
            ? Number(v).toFixed(3) 
            : v;

        html += `
        <tr>
            <td>${k.replaceAll("_", " ")}</td>
            <td>${displayValue}</td>
        </tr>
        `;
    });
    html += "</table>";
    statsContainer.innerHTML = html;

    // Populate computed complex metrics into the lists
    const uniqueEl = document.getElementById("uniqueTraits");
    if (uniqueEl) {
        uniqueEl.innerHTML = getUniqueTraits(player)
            .map(x => `<li>${x[0].replaceAll("_", " ")} (${x[1].toFixed(2)})</li>`)
            .join("");
    }

    const averageEl = document.getElementById("averageTraits");
    if (averageEl) {
        averageEl.innerHTML = getAverageTraits(player)
            .map(x => `<li>${x[0].replaceAll("_", " ")} (${x[1].toFixed(2)})</li>`)
            .join("");
    }

    const neighborEl = document.getElementById("neighbourList");
    if (neighborEl) {
        neighborEl.innerHTML = getNearestNeighbours(player)
            .map(x => `<li>${x.player}</li>`)
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

    const resetBtn = document.getElementById("resetHighlight");
    if (resetBtn) {
        resetBtn.onclick = resetHighlight;
    }
});
