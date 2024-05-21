document.addEventListener("DOMContentLoaded", function () {
    require([
        "esri/Map",
        "esri/views/SceneView",
        "esri/Graphic",
        "esri/layers/GraphicsLayer",
        "esri/geometry/Polyline",
        "esri/symbols/SimpleLineSymbol",
        "esri/layers/SceneLayer"
    ], function (Map, SceneView, Graphic, GraphicsLayer, Polyline, SimpleLineSymbol,SceneLayer) {

        const 台北市 = new SceneLayer({
            url: "https://www.historygis.udd.gov.taipei/arcgis/rest/services/Hosted/LOD1_2021/SceneServer",
            title: "臺北市",
          });
            
        var map = new Map({
            basemap: {
                portalItem: {
                    id: "4f2e99ba65e34bb8af49733d9778fb8e"
                }
            },
        });
        map.add(台北市);
        

        var view = new SceneView({
            container: "viewDiv",
            map: map,
            camera: {
                position: {
                    x: 121.50,
                    y: 24.92,
                    z: 16000,
                },
                tilt: 40,
                heading: 15,
            },
        });

        var graphicsLayer = new GraphicsLayer();
        map.add(graphicsLayer);

        var threshold = 800; 

        function toRadians(degrees) {
            return (degrees * Math.PI) / 180;
        }

        function calculateDistance(lat1, lon1, lat2, lon2) {
            var R = 6371; // Earth radius in km
            var dLat = toRadians(lat2 - lat1);
            var dLon = toRadians(lon2 - lon1);
            var a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRadians(lat1)) *
                    Math.cos(toRadians(lat2)) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        function generateArcPoints(start, end, distance) {
            const steps = 100;
            const arcHeight = Math.min(0.5, distance / 6) * 3; // Dynamic height based on distance
            let points = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const lat = (1 - t) * start[1] + t * end[1];
                const lng = (1 - t) * start[0] + t * end[0];
                const height = Math.sin(Math.PI * t) * arcHeight * 1000; // Scale arcHeight for visibility
                points.push([lng, lat, height]);
            }
            return points;
        }

        function getColorByQuantile(frequency, quantiles) {
            if (frequency <= quantiles[0]) {
                return 'rgba(255, 255, 0, 0.7)'; // 黃色，透明度 0.7
            } else if (frequency <= quantiles[1]) {
                return 'rgba(255, 165, 0, 0.7)'; // 橙色，透明度 0.7
            } else {
                return 'rgba(255, 0, 0, 0.7)'; // 紅色，透明度 0.7
            }
        }

        function calculateQuantiles(data, quantileCount) {
            const frequencies = data.map(item => item.frequency).sort((a, b) => a - b);
            const quantiles = [];
            for (let i = 1; i < quantileCount; i++) {
                const position = (frequencies.length - 1) * (i / quantileCount);
                const base = Math.floor(position);
                const rest = position - base;
                quantiles.push(frequencies[base] + rest * (frequencies[base + 1] - frequencies[base]));
            }
            return quantiles;
        }

        function loadData(dataType, threshold) {
            const dataFiles = [
                `./data/output_${dataType}_01.json`,
                `./data/output_${dataType}_02.json`,
                `./data/output_${dataType}_03.json`,
                `./data/output_${dataType}_04.json`,
                `./data/output_${dataType}_05.json`,
                `./data/output_${dataType}_06.json`,
                `./data/output_${dataType}_07.json`,
                `./data/output_${dataType}_08.json`,
                `./data/output_${dataType}_09.json`,
                `./data/output_${dataType}_10.json`
            ];

            Promise.all(dataFiles.map(url => fetch(url).then(response => response.json())))
                .then(datasets => {
                    const data = datasets.flat();

                    const filteredData = data.filter(item => item.frequency > threshold);
                    const quantiles = calculateQuantiles(filteredData, 3);

                    const allGraphics = [];

                    filteredData.forEach(function (item) {
                        if (
                            item.rent_lon &&
                            item.rent_lat &&
                            item.end_lon &&
                            item.end_lat &&
                            !(
                                item.rent_lon === item.end_lon &&
                                item.rent_lat === item.end_lat
                            )
                        ) {
                            const distance = calculateDistance(
                                item.rent_lat,
                                item.rent_lon,
                                item.end_lat,
                                item.end_lon
                            );
                            const arcPoints = generateArcPoints(
                                [item.rent_lon, item.rent_lat],
                                [item.end_lon, item.end_lat],
                                distance
                            );

                            var line = new Polyline({
                                hasZ: true, // Enable Z coordinate
                                paths: [arcPoints],
                            });

                            var lineColor = getColorByQuantile(item.frequency, quantiles);
                            var lineSymbol = new SimpleLineSymbol({
                                color: lineColor,
                                width: 5,
                                ocacity: 0.7
                            });

                            var lineGraphic = new Graphic({
                                geometry: line,
                                symbol: lineSymbol,
                            });

                            allGraphics.push(lineGraphic);
                        }
                    });

                    graphicsLayer.removeAll();

                    function addGraphicsInBatches(graphics, batchSize) {
                        let index = 0;

                        function addNextBatch() {
                            const batch = graphics.slice(index, index + batchSize);
                            graphicsLayer.addMany(batch);
                            index += batchSize;

                            if (index < graphics.length) {
                                requestAnimationFrame(addNextBatch);
                            }
                        }

                        requestAnimationFrame(addNextBatch);
                    }

                    addGraphicsInBatches(allGraphics, 100);
                    console.log("Load success.");
                })
                .catch((error) => console.error("Error loading the data:", error));
        }

        loadData("weekday", threshold);

        document.getElementById("dataSelect").addEventListener("change", function (event) {
            loadData(event.target.value, threshold);
        });

        document.getElementById("thresholdSlider").addEventListener("input", function (event) {
            threshold = parseInt(event.target.value);
            document.getElementById("thresholdValue").innerText = threshold;
            loadData(document.getElementById("dataSelect").value, threshold);
        });
    });
});
