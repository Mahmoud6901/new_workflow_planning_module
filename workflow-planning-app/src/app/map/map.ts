import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadShapefileService } from '../services/upload-shapefile';
import { Subscription } from 'rxjs';
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import MapView from "@arcgis/core/views/MapView.js";
import Sketch from "@arcgis/core/widgets/Sketch.js";
import Map from '@arcgis/core/Map';
import Graphic from '@arcgis/core/Graphic';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import Measurement from "@arcgis/core/widgets/Measurement.js";
import { JoinFeaturesService } from '../services/join-features';


@Component({
  selector: 'app-map',
  imports: [CommonModule],
  templateUrl: './map.html',
  styleUrl: './map.css'
})
export class MapComponent implements OnInit, OnDestroy {
  @ViewChild('mapViewNode', { static: true }) private mapViewEl!: ElementRef;

  // Inject the shapefile upload service
  uploadShapefileService = inject(UploadShapefileService);

  // Map and view instances
  private map: any;
  private view: any;
  private graphicsLayer: any;
  private sketchWidget!: Sketch;
  private shapefileGraphics: any[] = [];
  private subscriptions: Subscription[] = [];
  private measurementWidget: any;
  private selectedGraphicsToBeJoined: Graphic[] = [];

  // Upload state
  isUploading = false;
  isProcessing = false;
  uploadMessage = '';
  supportedFormats: string[] = [];

  // Snapping state
  isSnappingEnabled = false;

  // Automatic cutting state
  isAutoCuttingEnabled = false;
  private selectedGraphic: any = null; // Currently selected line for cutting
  private originalSymbol: any = null; // Store original symbol to restore when deselecting
  private cutLineColors = [
    [255, 100, 100, 0.9], // Light red for first piece
    [100, 100, 255, 0.9]  // Light blue for second piece
  ];

  _clickHandle: any;
  enableCutting: boolean = false;

  constructor(private joinService: JoinFeaturesService) {
    this.supportedFormats = this.uploadShapefileService.getSupportedFormats();
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.initializeMap();
      this.initializeSketchWidget();
      // this.initializeMeasurementWidget();
      this.subscribeToUploadStatus();
    } catch (err) {
      console.error('Error initializing map', err);
      this.uploadMessage = 'Failed to initialize map';
    }
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Clear selection
    this.clearSelection();

    // Clean up graphics
    this.clearShapefileGraphics();

    // Clean up sketch widget
    if (this.sketchWidget) {
      this.sketchWidget.destroy();
    }

    // Clean up measurement widget
    if (this.measurementWidget) {
      this.measurementWidget.destroy();
    }

    // Destroy the map view
    if (this.view) {
      this.view.destroy();
    }
    if (this._clickHandle) {
      this._clickHandle.remove();
    }
  }

  /**
   * Subscribe to upload status updates from the service
   */
  private subscribeToUploadStatus(): void {
    const statusSub = this.uploadShapefileService.uploadStatus.subscribe(status => {
      if (status) {
        this.uploadMessage = status;
      }
    });
    this.subscriptions.push(statusSub);
  }

  /**
   * Initializes the ArcGIS map and view
   */
  private async initializeMap() {
    try {

      // Create a graphics layer for shapefiles
      this.graphicsLayer = new GraphicsLayer({
        title: 'Uploaded Shapefiles',
      });

      // Create the map
      this.map = new Map({
        basemap: 'topo-vector',
        layers: [this.graphicsLayer]
      });
      // Create the map view
      this.view = new MapView({
        container: this.mapViewEl.nativeElement,
        map: this.map,
        center: [46.6753, 24.7136], // Center of Riyadh, Saudi Arabia
        zoom: 10
      });

      return this.view.when();

    } catch (error) {
      console.error('Error loading ArcGIS modules:', error);
      throw error;
    }

  }

  private initializeSketchWidget() {
    this.sketchWidget = new Sketch({
      layer: this.graphicsLayer,
      view: this.view,
      creationMode: "update",
      availableCreateTools: ['polyline'],
      visibleElements: {
        selectionTools: {
          "rectangle-selection": true,
          "lasso-selection": true
        },
        settingsMenu: false,
        undoRedoMenu: false
      },
    });

    this.sketchWidget.on("update", (event) => {
      this.setGraphicsToBeJoined(this.sketchWidget.updateGraphics.toArray());
      console.log('sketch widget update graphics:', this.getGraphicsToBeJoinedCount());
    });



    // Add click event handler for line selection when auto-cut is enabled
    this._clickHandle = this.view.on('click', (event: any) => {
      if (this.isAutoCuttingEnabled) {
        this.handleMapClick(event);
      }
    });

    // Listen for sketch events - automatic cutting on polyline creation
    this.sketchWidget.on('create', async (event: any) => {
      if (event.state === 'complete' && event.graphic.geometry.type === 'polyline' && this.isAutoCuttingEnabled) {
        await this.performSelectedLineCut(event.graphic);
      }
    });

    this.view.ui.add(this.sketchWidget, "top-right");
  }

  private initializeMeasurementWidget() {
    this.measurementWidget = new Measurement({
      view: this.view,
      activeTool: 'distance', // Start with no active tool
      linearUnit: "meters",
      areaUnit: "square-meters"
    });

    // Add measurement widget to the view
    this.view.ui.add(this.measurementWidget, 'bottom-right');

    console.log('Measurement widget initialized successfully');
  }

  /**
   * Toggles automatic cutting mode
   */
  toggleAutoCuttingMode(): void {
    this.isAutoCuttingEnabled = !this.isAutoCuttingEnabled;

    if (this.isAutoCuttingEnabled) {
      this.clearSelection(); // Clear any previous selection
      this.uploadMessage = '<p style="color:blue"><b>🔄 Selection-Based Cutting Mode Active</b><br/>Step 1: Click on a polyline to select it<br/>Step 2: Draw a cutting line that intersects the selected polyline</p>';
    } else {
      this.clearSelection(); // Clear selection when disabling
      this.uploadMessage = '<p style="color:gray">Auto-cutting mode disabled.</p>';
    }
  }

  /**
   * Handles map clicks for line selection during auto-cut mode
   */
  private async handleMapClick(event: any): Promise<void> {
    try {
      // Perform hit test to find clicked graphics
      const response = await this.view.hitTest(event);

      if (response.results.length > 0) {
        // Find the first polyline graphic that was clicked
        const clickedGraphic = response.results.find((result: any) =>
          result.graphic &&
          result.graphic.geometry?.type === 'polyline' &&
          this.shapefileGraphics.includes(result.graphic)
        )?.graphic;

        if (clickedGraphic) {
          this.selectLineForCutting(clickedGraphic);
        }
      }
    } catch (error) {
      console.error('Error handling map click:', error);
    }
  }

  /**
   * Selects a line graphic for cutting and highlights it
   */
  private selectLineForCutting(graphic: any): void {
    // Clear previous selection
    this.clearSelection();

    // Store the selected graphic and its original symbol
    this.selectedGraphic = graphic;
    this.originalSymbol = graphic.symbol;

    // Create highlight symbol
    const highlightSymbol = new SimpleLineSymbol({
      color: '#00FFFF',
      width: 1.5,
      style: 'solid',
      cap: 'round',
      join: 'round'
    });

    // Apply highlight symbol
    graphic.symbol = highlightSymbol;

    // Update UI message
    this.uploadMessage = '<p style="color:green"><b>✅ Line Selected!</b><br/>Now draw a cutting line that intersects the highlighted line to perform the cut.</p>';
  }

  /**
   * Clears the current line selection
   */
  private clearSelection(): void {
    if (this.selectedGraphic && this.originalSymbol) {
      // Restore original symbol
      this.selectedGraphic.symbol = this.originalSymbol;
      this.selectedGraphic = null;
      this.originalSymbol = null;
    }
  }

  /**
   * Performs cutting on the selected line when a cutting line is drawn
   */
  private async performSelectedLineCut(cuttingLineGraphic: any): Promise<void> {
    this.isProcessing = true;

    try {
      // Check if a line is selected
      if (!this.selectedGraphic) {
        this.uploadMessage = '<p style="color:orange">⚠️ No line selected! Please click on a polyline first to select it for cutting.</p>';
        // Remove the cutting line since no line was selected
        this.graphicsLayer.remove(cuttingLineGraphic);
        return;
      }

      // Check if the cutting line intersects the selected line
      const intersects = geometryEngine.intersects(this.selectedGraphic.geometry, cuttingLineGraphic.geometry);

      if (!intersects) {
        this.uploadMessage = '<p style="color:orange">⚠️ The cutting line does not intersect the selected line. Please draw a line that crosses the highlighted polyline.</p>';
        // Remove the cutting line since it doesn't intersect
        this.graphicsLayer.remove(cuttingLineGraphic);
        return;
      }

      // Perform the cut operation
      const cutResult = geometryEngine.cut(this.selectedGraphic.geometry, cuttingLineGraphic.geometry);

      if (cutResult && cutResult.length === 2) {
        // Successfully cut into exactly 2 pieces
        const newGraphics: any[] = [];

        // Create new graphics for each piece with different colors
        cutResult.forEach((cutGeometry: any, index: number) => {
          const color = this.cutLineColors[index % this.cutLineColors.length];
          const newGraphic = new Graphic({
            geometry: cutGeometry,
            symbol: new SimpleLineSymbol({
              color: color,
              width: 4,
              style: 'dot',
              cap: 'round',
              join: 'round'
            }),
            attributes: {
              ...this.selectedGraphic.attributes,
              CUT_PIECE_ID: index + 1,
              CUT_TYPE: 'SELECTED_CUT',
              TOTAL_PIECES: 2,
              PIECE_COLOR: index === 0 ? 'RED' : 'BLUE',
              ORIGINAL_FID: this.selectedGraphic.attributes?.OBJECTID || this.selectedGraphic.attributes?.FID || 0,
              CUT_TIMESTAMP: new Date().toISOString()
            }
          });
          newGraphics.push(newGraphic);
        });

        // Remove the original selected graphic from the graphics array
        const originalIndex = this.shapefileGraphics.indexOf(this.selectedGraphic);
        if (originalIndex > -1) {
          this.shapefileGraphics.splice(originalIndex, 1);
        }

        // Add the new cut pieces
        this.shapefileGraphics.push(...newGraphics);

        // Update the graphics layer
        this.graphicsLayer.remove(this.selectedGraphic);
        this.graphicsLayer.addMany(newGraphics);

        // Remove the cutting line
        this.graphicsLayer.remove(cuttingLineGraphic);

        // Clear selection
        this.clearSelection();

        this.uploadMessage = `<p style="color:green"><b>✂️ Cut Successful!</b><br/>
        The selected line has been cut into <span style="color:red;">red</span> and <span style="color:blue;">blue</span> pieces.<br/>
        Click on another polyline to continue cutting or disable auto-cut mode.</p>`;

        // Zoom to the results
        await this.zoomToGraphics(newGraphics);

      } else {
        this.uploadMessage = '<p style="color:orange">⚠️ Unable to cut the selected line into exactly 2 pieces. The cutting line may not properly intersect the polyline.</p>';
        // Remove the cutting line since cutting failed
        this.graphicsLayer.remove(cuttingLineGraphic);
      }

    } catch (error) {
      console.error('Error performing selected line cut:', error);
      this.uploadMessage = `<p style="color:red">Error performing cut: ${error}</p>`;

      // Remove the cutting line on error
      this.graphicsLayer.remove(cuttingLineGraphic);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Gets count of polylines available for cutting
   */
  getPolylineCount(): number {
    return this.shapefileGraphics.filter(
      graphic => graphic.geometry?.type === 'polyline'
    ).length;
  }

  /**
   * Checks if a line is currently selected for cutting
   */
  hasSelectedLine(): boolean {
    return this.selectedGraphic !== null;
  }

  /**
   * Gets information about the currently selected line
   */
  getSelectedLineInfo(): string | null {
    if (!this.selectedGraphic) return null;

    const attributes = this.selectedGraphic.attributes;
    return attributes?.name || attributes?.NAME || 'Selected Polyline';
  }

  /**
   * Handles file selection for shapefile upload
   * @param event - File input change event
   */
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.uploadShapefile(file);
      // Reset the input value to allow re-selecting the same file
      event.target.value = '';
    }
  }

  /**
   * Handles drag and drop file upload
   * @param event - Drag event
   */
  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.uploadShapefile(files[0]);
    }
  }

  /**
   * Prevents default drag over behavior
   * @param event - Drag event
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  /**
   * Uploads a shapefile using the upload service
   * @param file - The file to upload
   */
  async uploadShapefile(file: File): Promise<void> {
    // Validate file size
    if (!this.uploadShapefileService.validateFileSize(file)) {
      const maxSizeMB = this.uploadShapefileService.getMaxFileSize() / (1024 * 1024);
      this.uploadMessage = `<p style="color:red">File size exceeds maximum limit of ${maxSizeMB}MB</p>`;
      return;
    }

    // Validate file format
    if (!this.uploadShapefileService.validateShapefileFormat(file)) {
      this.uploadMessage = `<p style="color:red">Invalid file format. Please upload a .zip file containing a shapefile.</p>`;
      return;
    }

    this.isUploading = true;
    this.uploadMessage = 'Uploading shapefile...';

    try {
      // Process the shapefile and get graphics
      const graphics = await this.uploadShapefileService.processShapefileToGeoJSON(file);

      if (graphics && graphics.length > 0) {
        // Add graphics to the graphics layer
        this.graphicsLayer.addMany(graphics);
        this.shapefileGraphics.push(...graphics);

        // Zoom to the graphics extent
        await this.zoomToGraphics(graphics);

        this.uploadMessage = `<p style="color:green"><b>Successfully uploaded ${file.name}</b><br/>Added ${graphics.length} features to the map.</p>`;
        console.log('Successfully added graphics to map:', graphics.length);
        this.splitLinesByVertices();
      } else {
        this.uploadMessage = `<p style="color:orange">No valid features found in ${file.name}</p>`;
      }
    } catch (error) {
      console.error('Error uploading shapefile:', error);
      this.uploadMessage = `<p style="color:red">Error uploading ${file.name}: ${error}</p>`;
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Zooms the map view to the extent of the uploaded graphics
   * @param graphics - The graphics to zoom to
   */
  private async zoomToGraphics(graphics: any[]): Promise<void> {
    try {
      if (graphics.length > 0 && this.view) {
        // Import geometryEngine for extent calculation
        const [geometryEngine] = await Promise.all([
          import('@arcgis/core/geometry/geometryEngine.js')
        ]);

        const geometries = graphics.map(graphic => graphic.geometry).filter(geom => geom);

        if (geometries.length > 0) {
          // Create a union of all geometries to get the overall extent
          const union = (geometryEngine as any).union(geometries);
          if (union) {
            await this.view.goTo(union.extent || union);
          } else {
            // Fallback: go to first geometry
            await this.view.goTo(geometries[0]);
          }
        }
      }
    } catch (error) {
      console.error('Error zooming to graphics:', error);
      // Fallback: just go to the first graphic
      if (graphics.length > 0 && graphics[0].geometry) {
        try {
          await this.view.goTo(graphics[0].geometry);
        } catch (fallbackError) {
          console.error('Fallback zoom also failed:', fallbackError);
        }
      }
    }
  }

  /**
   * Removes all shapefile graphics from the map
   */
  clearShapefileGraphics(): void {
    // Clear selection first
    this.clearSelection();

    if (this.graphicsLayer) {
      this.graphicsLayer.removeAll();
    }
    this.shapefileGraphics = [];
    this.uploadMessage = '<p style="color:blue">All shapefile graphics removed</p>';
  }

  /**
   * Gets information about uploaded graphics
   * @returns Array of graphic information
   */
  getGraphicsInfo(): any[] {
    return this.shapefileGraphics.map((graphic, index) => ({
      id: `graphic-${index}`,
      title: graphic.attributes?.name || graphic.attributes?.NAME || `Feature ${index + 1}`,
      type: graphic.geometry?.type || 'unknown',
      visible: graphic.visible !== false
    }));
  }

  /**
   * Toggles visibility of a graphic
   * @param graphicId - ID of the graphic to toggle
   */
  toggleGraphicVisibility(graphicId: string): void {
    const index = parseInt(graphicId.replace('graphic-', ''));
    if (index >= 0 && index < this.shapefileGraphics.length) {
      const graphic = this.shapefileGraphics[index];
      graphic.visible = !graphic.visible;
    }
  }

  /**
   * Gets the count of uploaded graphics
   * @returns Number of graphics
   */
  getGraphicsCount(): number {
    return this.shapefileGraphics.length;
  }

  /**
   * Splits line features by vertices using the upload service
   */
  async splitLinesByVertices(): Promise<void> {
    if (this.shapefileGraphics.length === 0) {
      this.uploadMessage = '<p style="color:orange">No graphics available to split. Please upload a shapefile first.</p>';
      return;
    }

    this.isProcessing = true;

    try {
      // Use the service to split lines by vertices with styling
      const segmentedGraphics = await this.uploadShapefileService.splitLineByVertices(
        this.shapefileGraphics,
      );

      if (segmentedGraphics && segmentedGraphics.length > 0) {
        // Clear selection since we're replacing all graphics
        this.clearSelection();

        // Clear existing graphics
        this.graphicsLayer.removeAll();

        // Add the segmented graphics to the map
        this.graphicsLayer.addMany(segmentedGraphics);

        // Update the internal graphics array
        this.shapefileGraphics = segmentedGraphics;

        // Zoom to the segmented graphics extent
        await this.zoomToGraphics(segmentedGraphics);

        await this.sketchWidget.update(segmentedGraphics);
        this.sketchWidget.cancel();

        this.uploadMessage = `<p style="color:green"><b>Lines successfully split!</b><br/>
        Created ${segmentedGraphics.length} line segments with unique colors for easy identification.</p>`;

        console.log('Successfully split lines into segments:', segmentedGraphics.length);
      } else {
        this.uploadMessage = '<p style="color:orange">No line segments could be created from the current graphics.</p>';
      }
    } catch (error) {
      console.error('Error splitting lines by vertices:', error);
      this.uploadMessage = `<p style="color:red">Error splitting lines: ${error}</p>`;
    } finally {
      this.isProcessing = false;
    }
  }

  async joinLines(): Promise<void> {
    try {
      const joinedPolylineGraphic = await this.joinService.joinSelectedPolylines(this.selectedGraphicsToBeJoined);
      this.joinService.processPathBasedOnLength(joinedPolylineGraphic, this.graphicsLayer, this.shapefileGraphics).then(() => {
        this.enableCutting = true;
      })
      this.graphicsLayer.removeMany(this.selectedGraphicsToBeJoined);
      this.setGraphicsToBeJoined([]);
      this.uploadMessage = `<p style="color:green"><b>Lines successfully joined!</b><br/>
        Created ${this.selectedGraphicsToBeJoined.length} line segments with unique colors for easy identification.</p>`;
    } catch (error) {
      console.error('Error joining lines:', error);
      this.sketchWidget.cancel();
      this.uploadMessage = `<p style="color:red">Error joining lines: ${error}</p>`;
    }
  }

  getGraphicsToBeJoinedCount(): number {
    return this.selectedGraphicsToBeJoined.length;
  }

  setGraphicsToBeJoined(graphics: Graphic[]): void {
    this.selectedGraphicsToBeJoined = graphics;
  }
}
