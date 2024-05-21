# YouBike Rentals Visualization

This project visualizes YouBike rental data using ArcGIS API for JavaScript. The visualization displays rental routes on a 3D map with varying colors indicating the frequency of rentals. Users can interact with the map and adjust the threshold for displaying routes.

## Features

- **3D Map Visualization**: Displays YouBike rental routes on a 3D map.
- **Interactive Controls**: Users can select data type (weekend/weekday) and adjust the threshold for displaying rental routes.
- **Color Indication**: Routes are color-coded based on rental frequency:
  - **High Frequency**: Red
  - **Medium Frequency**: Orange
  - **Low Frequency**: Yellow

## How to Use

1. **Select Data**: Choose between weekend and weekday data from the dropdown menu.
2. **Adjust Threshold**: Use the slider to set the minimum frequency threshold for displaying routes. The threshold value is shown next to the slider.

## Setup

1. Clone the repository:
   ```sh
   git clone https://github.com/tzu901/youbikeViz.git
   ```

2. Navigate to the project directory:
    ```sh
    cd youbikeViz
    ```

3. Open index.html in your preferred web browser to view the visualization.

## Result
https://tzu901.github.io/youbikeViz.

## Credits
ArcGIS API for JavaScript
YouBike OD data
