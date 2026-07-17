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

    return Papa.parse(text,{
        header:true,
        dynamicTyping:true,
        skipEmptyLines:true
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

    // Get every stylometric feature from the server CSV
    styleFeatures = Object.keys(serverStats[0])
    .filter(f => f !== "player")
    .sort();

        populateColourDropdown();

        console.log("Finished.");

        drawPlot();
        setupSearch();

    }

function populateColourDropdown(){

    const select = document.getElementById("colourSelect");

    select.innerHTML = "";

    //--------------------------------------------------
    // Cluster first
    //--------------------------------------------------

    let option = document.createElement("option");

    option.value = "cluster";
    option.textContent = "HDBSCAN Cluster";

    select.appendChild(option);

    //--------------------------------------------------
    // Stylometric features
    //--------------------------------------------------

    for(const feature of styleFeatures){

        option = document.createElement("option");

        option.value = feature;

        option.textContent =
            feature
                .replace("_statistics_"," • ")
                .replaceAll("_"," ");

        select.appendChild(option);

    }

}

// ======================================================
// Current projection
// ======================================================

function currentData(){

    if(currentProjection==="UMAP"){

        return {

            data:umapData,

            x:"UMAP_1",

            y:"UMAP_2"

        };

    }

    return {

        data:pcaData,

        x:"PC1",

        y:"PC2"

    };

}

// ======================================================
// Draw / Update figure
// ======================================================

function drawPlot() {

    const plot = currentData();

    //--------------------------------------------------
    // Build marker colours
    //--------------------------------------------------

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

        marker.color = plot.data.map(d => clusterColours[String(d.cluster)]);
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
                .replaceAll("_"," ")

        };
    }

    //--------------------------------------------------
    // Plot
    //--------------------------------------------------

    const trace = {

        type: "scatter",

        mode: "markers",

        x: plot.data.map(d => d[plot.x]),
        y: plot.data.map(d => d[plot.y]),

        text: plot.data.map(d => d.player),

        hovertemplate:
            "<b>%{text}</b><extra></extra>",

        marker: marker

    };

    layout.title =
        `${currentDataset.toUpperCase()} • ${currentProjection}`;

    if (!figureCreated) {

        Plotly.purge("plot");

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

        figureCreated = true;

    } else {

        Plotly.purge("plot");

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
    console.log(currentColour);
    console.log(values.slice(0,20));

    }
}
// ======================================================
// Change projection
// ======================================================

function setProjection(projection){

    currentProjection=projection;

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

    // fill autocomplete list

    list.innerHTML = "";

    umapData
        .map(d => d.player)
        .sort()
        .forEach(player => {

            const option = document.createElement("option");

            option.value = player;

            list.appendChild(option);

        });


    // when a player is selected

    input.addEventListener(
        "change",
        function(){

            const player = this.value;

            if(
                umapData.some(d => d.player === player)
            ){

                highlightPlayer(player);

            }

        }
    );

}

function highlightPlayer(player){

    console.log("Highlighting:", player);

    const plot = currentData();

    const sizes = plot.data.map(d =>
        d.player === player ? 20 : 5
    );

    const opacity = plot.data.map(d =>
        d.player === player ? 1 : 0.15
    );


    Plotly.restyle(
        "plot",
        {
            "marker.size": [sizes],
            "marker.opacity": [opacity]
        },
        [0]
    );


    const selected = plot.data.find(
        d => d.player === player
    );


    if(selected){

        const x = Number(selected[plot.x]);
        const y = Number(selected[plot.y]);


        Plotly.relayout(
            "plot",
            {

                "xaxis.range":[
                    x-1,
                    x+1
                ],

                "yaxis.range":[
                    y-1,
                    y+1
                ]

            }
        );

    }

}
// ======================================================
// Start
// ======================================================

window.addEventListener("load", () => {

    // Load the default dataset
    loadDataset(currentDataset);

    // Dataset selector
    document
        .getElementById("datasetSelect")
        .addEventListener("change", function () {

            setDataset(this.value);

        });

    document
        .getElementById("colourSelect")
        .addEventListener("change",function(){

            currentColour=this.value;

            drawPlot();

});

});
