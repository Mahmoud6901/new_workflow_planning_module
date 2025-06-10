import { Component, OnInit, OnDestroy, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadShapefileService } from '../services/upload-shapefile';
import { Subscription } from 'rxjs';
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import MapView from "@arcgis/core/views/MapView.js";
import Sketch from "@arcgis/core/widgets/Sketch.js";
import Map from '@arcgis/core/Map';

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
  private sketchWidget: any;
  private shapefileGraphics: any[] = [];
  private subscriptions: Subscription[] = [];

  // Upload state
  isUploading = false;
  isProcessing = false;
  uploadMessage = '';
  supportedFormats: string[] = [];

  // Snapping state
  isSnappingEnabled = true;

  constructor() {
    this.supportedFormats = this.uploadShapefileService.getSupportedFormats();
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.initializeMap();
      this.initializeSketchWidget();
      this.subscribeToUploadStatus();
    } catch (err) {
      console.error('Error initializing map', err);
      this.uploadMessage = 'Failed to initialize map';
    }
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Clean up graphics
    this.clearShapefileGraphics();

    // Clean up sketch widget
    if (this.sketchWidget) {
      this.sketchWidget.destroy();
    }

    // Destroy the map view
    if (this.view) {
      this.view.destroy();
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
        title: 'Uploaded Shapefiles'
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



      console.log('Map and Sketch widget initialized successfully');
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
      creationMode: 'update'
    });

    // Add sketch widget to the view
    this.view.ui.add(this.sketchWidget, 'top-right');
  }
  /**
   * Handles file selection for shapefile upload
   * @param event - File input change event
   */
  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.uploadShapefile(file);
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
      const segmentedGraphics = await this.uploadShapefileService.splitLineByVerticesWithStyling(
        this.shapefileGraphics,
        true // Apply custom styling
      );

      if (segmentedGraphics && segmentedGraphics.length > 0) {
        // Clear existing graphics
        this.graphicsLayer.removeAll();

        // Add the segmented graphics to the map
        this.graphicsLayer.addMany(segmentedGraphics);

        // Update the internal graphics array
        this.shapefileGraphics = segmentedGraphics;

        // Zoom to the segmented graphics extent
        await this.zoomToGraphics(segmentedGraphics);

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
}
