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

        marker.color = plot.data.map(d => Number(d.cluster));
        marker.colorscale = "Turbo";
        marker.showscale = false;

    } else {

        const values = plot.data.map(d => {

            const stats = playerStats[d.player];

            if (!stats) return 0;

            const v = Number(stats[currentColour]);

            if (!Number.isFinite(v))
                return 0;

            return v;

        });
        console.log("Colour:", currentColour);
        console.log(values.slice(0,20));

        //--------------------------------------------------
        // Symmetric log transform
        //--------------------------------------------------

        const transformed = values.map(v =>
            Math.sign(v) * Math.log1p(Math.abs(v))
        );
        console.log(transformed.slice(0,20));
        console.log(
            transformed.some(v => !Number.isFinite(v))
        );

        marker.color = transformed;
        marker.colorscale = "Viridis";
        marker.showscale = true;

        marker.colorbar = {
            title: currentColour
                .replace("_statistics_", "<br>")
                .replaceAll("_", " ")
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
