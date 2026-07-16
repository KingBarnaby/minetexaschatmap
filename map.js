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

    console.log("Finished.");

    console.log("UMAP:",umapData.length);
    console.log("PCA:",pcaData.length);

    console.log(
        "Players:",
        Object.keys(playerStats).length
    );

    drawPlot();

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

function drawPlot(){

    const plot = currentData();

    const trace={

        type:"scatter",

        mode:"markers",

        x:plot.data.map(d=>d[plot.x]),

        y:plot.data.map(d=>d[plot.y]),

        text:plot.data.map(d=>d.player),

        customdata:plot.data,

        hovertemplate:
            "<b>%{text}</b><extra></extra>",

        marker:{

            size:7,

            opacity:0.8,

            color:"#4F8EF7"

        }

    };

    layout.title =
        `${currentDataset.toUpperCase()} • ${currentProjection}`;

    if(!figureCreated){

        Plotly.newPlot(

            "plot",

            [trace],

            layout,

            {

                responsive:true,

                displaylogo:false,

                scrollZoom:true

            }

        );

        figureCreated=true;

    }

    else{

        Plotly.react(

            "plot",

            [trace],

            layout

        );

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

window.addEventListener(

    "load",

    ()=>{

        loadDataset(currentDataset);

    }

);
