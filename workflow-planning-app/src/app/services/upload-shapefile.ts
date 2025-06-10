import { Injectable } from '@angular/core';
import Graphic from '@arcgis/core/Graphic';
import SimpleRenderer from '@arcgis/core/renderers/SimpleRenderer';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import { BehaviorSubject } from 'rxjs';
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";

export interface Feature {
  type: "Feature";
  geometry: any;
  attributes: any;
}

@Injectable({
  providedIn: 'root'
})
export class UploadShapefileService {
  public uploadStatus = new BehaviorSubject<string>('');
  private shpjsLoaded = false;
  private shpjs: any;

  constructor() { }

  async loadShpjs(): Promise<any> {
    if (this.shpjsLoaded && this.shpjs) {
      return this.shpjs;
    }

    try {
      console.log('Loading shpjs via fetch...');

      // Fetch the library source code
      const response = await fetch('https://unpkg.com/shpjs@3.6.3/dist/shp.min.js');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const libraryCode = await response.text();

      // Create a wrapper to capture the exported function
      const wrapperCode = `
        (function() {
          var module = { exports: {} };
          var exports = module.exports;

          ${libraryCode}

          // Return whatever was exported
          return module.exports || window.shp || shp;
        })();
      `;

      // Evaluate the code
      this.shpjs = eval(wrapperCode);

      console.log('Loaded shpjs via fetch:', typeof this.shpjs);

      if (this.shpjs && typeof this.shpjs === 'function') {
        this.shpjsLoaded = true;
        return this.shpjs;
      } else {
        throw new Error('Failed to extract shpjs function from library code');
      }

    } catch (error) {
      console.error('Alternative loading method failed:', error);
      throw error;
    }
  }

  public async processShapefileToGeoJSON(file: File): Promise<Graphic[]> {
    this.uploadStatus.next(`<b>Processing ${file.name}...</b>`);
    await this.loadShpjs();

    if (!file) {
      const errorMsg = 'No file provided.';
      this.uploadStatus.next(`<p style="color:orange">${errorMsg}</p>`);
      return Promise.reject(new Error(errorMsg));
    }

    const fileName = file.name.toLowerCase();
    if (fileName.indexOf(".zip") === -1) {
      const errorMsg = 'Invalid file type. Please provide a .zip file.';
      this.uploadStatus.next(`<p style="color:red">${errorMsg}</p>`);
      return Promise.reject(new Error(errorMsg));
    }

    return new Promise<Graphic[]>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: ProgressEvent<FileReader>) => {
        if (event.target?.result) {
          const arrayBuffer = event.target.result as ArrayBuffer;
          const features = this.shpjs.parseZip(arrayBuffer)
          let newGraphic: Graphic[] = [];
          // Convert LineString and MultiLineString coordinates to Polyline paths
          features.features.map((feature: any) => {
            if (feature) {

              if (feature.geometry && feature.geometry.type === 'LineString') {
                // Convert LineString to ArcGIS Graphic
                const graphic = new Graphic({
                  geometry: {
                    type: 'polyline',
                    paths: [feature.geometry.coordinates], // LineString coordinates become a single path
                  } as any,
                  attributes: {
                    ...feature.properties,
                    ORIGINAL_GEOM_TYPE: 'LineString', // Track original geometry type
                    LINE_COUNT: 1 // Single line
                  }
                });
                newGraphic.push(graphic);
                return graphic;
              }

              if (feature.geometry && feature.geometry.type === 'MultiLineString') {
                // Convert MultiLineString to ArcGIS Graphic
                // MultiLineString coordinates are an array of LineString coordinate arrays
                // Each LineString in the MultiLineString becomes a separate path in the polyline
                const graphic = new Graphic({
                  geometry: {
                    type: 'polyline',
                    paths: feature.geometry.coordinates, // Each LineString becomes a separate path
                  } as any,
                  attributes: {
                    ...feature.properties,
                    ORIGINAL_GEOM_TYPE: 'MultiLineString', // Track original geometry type
                    LINE_COUNT: feature.geometry.coordinates.length // Number of lines in MultiLineString
                  }
                });
                newGraphic.push(graphic);
                return graphic;
              }

              // For other geometry types, create a basic Graphic
              const graphic = new Graphic({
                geometry: feature.geometry,
                attributes: feature.properties
              });
              newGraphic.push(graphic);
              return graphic;

            }
            return newGraphic;
          });

          resolve(newGraphic);
        } else {
          const errorMsg = "Error reading file: Target result is null.";
          reject(new Error(errorMsg));
        }
      };
      reader.onerror = (errorEvent: ProgressEvent<FileReader>) => {
        const errorMsg = "Error reading file: " + (errorEvent.target?.error?.message || "Unknown error");
        this.uploadStatus.next(`<p style="color:red">${errorMsg}</p>`);
        reject(new Error(errorMsg));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Gets supported file formats for shapefiles
   * @returns Array of supported file extensions
   */
  getSupportedFormats(): string[] {
    return ['.zip'];
  }

  /**
   * Gets maximum file size for uploads (in bytes)
   * @returns Maximum file size in bytes (default: 10MB)
   */
  getMaxFileSize(): number {
    return 10 * 1024 * 1024; // 10MB
  }

  /**
   * Validates file size
   * @param file - The file to validate
   * @returns boolean indicating if file size is valid
   */
  validateFileSize(file: File): boolean {
    return file.size <= this.getMaxFileSize();
  }

  /**
 * Validates if the uploaded file is a valid shapefile format
 * @param file - The uploaded file
 * @returns boolean indicating if file is valid
 */
  validateShapefileFormat(file: File): boolean {
    const validExtensions = ['.zip'];
    const fileName = file.name.toLowerCase();

    return validExtensions.some(ext => fileName.endsWith(ext));
  }

  /**
   * Splits line features by vertices to create individual line segments
   * Each segment connects two consecutive vertices of the original line
   * @param uploadedShapefile - Array of Graphics containing line features
   * @returns Promise<Graphic[]> Array of new line features representing segments
   */
  public async splitLineByVertices(uploadedShapefile: Graphic[]): Promise<Graphic[]> {
    try {
      // Update status to indicate processing
      this.uploadStatus.next('<b>Splitting lines by vertices...</b>');

      // Validate input
      if (!uploadedShapefile || uploadedShapefile.length === 0) {
        const errorMsg = 'No shapefile data provided for splitting.';
        this.uploadStatus.next(`<p style="color:red">${errorMsg}</p>`);
        throw new Error(errorMsg);
      }

      // Array to store all segmented line features
      let segmentedLines: Graphic[] = [];
      let totalSegmentsCreated = 0;

      // Process each graphic in the uploaded shapefile
      for (let i = 0; i < uploadedShapefile.length; i++) {
        const graphic = uploadedShapefile[i];

        // Check if the graphic has geometry
        if (!graphic.geometry) {
          console.warn(`Graphic ${i} has no geometry, skipping...`);
          continue;
        }

        // Process based on geometry type
        const geometryType = graphic.geometry.type;

        if (geometryType === 'polyline') {
          // Handle polyline geometry (includes converted LineString and MultiLineString)
          const segments = await this.splitPolylineByVertices(graphic);
          segmentedLines.push(...segments);
          totalSegmentsCreated += segments.length;

        } else if (geometryType === 'polygon') {
          // Handle polygon geometry by converting rings to polylines
          const segments = await this.splitPolygonRingsByVertices(graphic);
          segmentedLines.push(...segments);
          totalSegmentsCreated += segments.length;

        } else if (geometryType === 'point' || geometryType === 'multipoint') {
          // Points cannot be split, but we can create a warning
          console.warn(`Point geometry cannot be split into line segments. Graphic ${i} skipped.`);

        } else {
          console.warn(`Unsupported geometry type: ${geometryType}. Graphic ${i} skipped.`);
        }
      }

      // Validate results
      if (segmentedLines.length === 0) {
        const errorMsg = 'No line geometry found in the shapefile that can be split into segments.';
        this.uploadStatus.next(`<p style="color:orange">${errorMsg}</p>`);
        throw new Error(errorMsg);
      }

      // Update status with success message
      this.uploadStatus.next(
        `<p style="color:green"><b>Successfully split lines!</b><br/>
        Created ${totalSegmentsCreated} line segments from ${uploadedShapefile.length} original features.</p>`
      );

      return segmentedLines;

    } catch (error) {
      const errorMsg = `Error splitting lines by vertices: ${error}`;
      console.error(errorMsg, error);
      this.uploadStatus.next(`<p style="color:red">${errorMsg}</p>`);
      throw error;
    }
  }

  /**
   * Splits a polyline graphic by its vertices to create individual line segments
   * @param polylineGraphic - Graphic containing polyline geometry
   * @returns Promise<Graphic[]> Array of line segment graphics
   */
  private async splitPolylineByVertices(polylineGraphic: Graphic): Promise<Graphic[]> {
    const segments: Graphic[] = [];

    try {
      const polylineGeometry = polylineGraphic.geometry as any;

      // Polylines can have multiple paths
      if (polylineGeometry.paths && polylineGeometry.paths.length > 0) {

        // Process each path in the polyline
        for (let pathIndex = 0; pathIndex < polylineGeometry.paths.length; pathIndex++) {
          const path = polylineGeometry.paths[pathIndex];

          // Create segments for consecutive vertices in this path
          for (let vertexIndex = 0; vertexIndex < path.length - 1; vertexIndex++) {
            const startVertex = path[vertexIndex];
            const endVertex = path[vertexIndex + 1];

            // Create a new polyline geometry for this segment
            const segmentGeometry = {
              type: 'polyline' as const,
              paths: [[startVertex, endVertex]],
              spatialReference: polylineGeometry.spatialReference
            };

            // Create new graphic for this segment with enhanced attributes
            const segmentGraphic = new Graphic({
              geometry: segmentGeometry as any,
              attributes: {
                ...polylineGraphic.attributes, // Copy original attributes
                SEGMENT_ID: segments.length + 1,
                PATH_INDEX: pathIndex,
                VERTEX_START: vertexIndex,
                VERTEX_END: vertexIndex + 1,
                ORIGINAL_FID: polylineGraphic.attributes?.OBJECTID || polylineGraphic.attributes?.FID || pathIndex,
                SEGMENT_LENGTH: this.calculateSegmentLength(startVertex, endVertex),
                TOTAL_PATHS: polylineGeometry.paths.length, // Indicates if this came from MultiLineString
                IS_MULTILINE: polylineGeometry.paths.length > 1 ? 'YES' : 'NO'
              }
            });

            segments.push(segmentGraphic);
          }
        }
      }

    } catch (error) {
      console.error('Error splitting polyline by vertices:', error);
      throw new Error(`Failed to split polyline: ${error}`);
    }

    return segments;
  }

  /**
   * Splits polygon rings by vertices to create individual line segments
   * @param polygonGraphic - Graphic containing polygon geometry
   * @returns Promise<Graphic[]> Array of line segment graphics from polygon rings
   */
  private async splitPolygonRingsByVertices(polygonGraphic: Graphic): Promise<Graphic[]> {
    const segments: Graphic[] = [];

    try {
      const polygonGeometry = polygonGraphic.geometry as any;

      // Polygons have rings (exterior and interior)
      if (polygonGeometry.rings && polygonGeometry.rings.length > 0) {

        // Process each ring in the polygon
        for (let ringIndex = 0; ringIndex < polygonGeometry.rings.length; ringIndex++) {
          const ring = polygonGeometry.rings[ringIndex];

          // Create segments for consecutive vertices in this ring
          // Note: Polygon rings are closed, so we include the segment from last vertex back to first
          for (let vertexIndex = 0; vertexIndex < ring.length - 1; vertexIndex++) {
            const startVertex = ring[vertexIndex];
            const endVertex = ring[vertexIndex + 1];

            // Create a new polyline geometry for this segment
            const segmentGeometry = {
              type: 'polyline' as const,
              paths: [[startVertex, endVertex]],
              spatialReference: polygonGeometry.spatialReference
            };

            // Create new graphic for this segment with enhanced attributes
            const segmentGraphic = new Graphic({
              geometry: segmentGeometry as any,
              attributes: {
                ...polygonGraphic.attributes, // Copy original attributes
                SEGMENT_ID: segments.length + 1,
                RING_INDEX: ringIndex,
                RING_TYPE: ringIndex === 0 ? 'EXTERIOR' : 'INTERIOR',
                VERTEX_START: vertexIndex,
                VERTEX_END: vertexIndex + 1,
                ORIGINAL_FID: polygonGraphic.attributes?.OBJECTID || polygonGraphic.attributes?.FID || 0,
                SEGMENT_LENGTH: this.calculateSegmentLength(startVertex, endVertex)
              }
            });

            segments.push(segmentGraphic);
          }
        }
      }

    } catch (error) {
      console.error('Error splitting polygon rings by vertices:', error);
      throw new Error(`Failed to split polygon rings: ${error}`);
    }

    return segments;
  }

  /**
   * Calculates the approximate length of a line segment between two vertices
   * @param startVertex - Starting vertex [x, y] coordinates
   * @param endVertex - Ending vertex [x, y] coordinates
   * @returns number - Approximate length of the segment
   */
  private calculateSegmentLength(startVertex: number[], endVertex: number[]): number {
    try {
      // Simple Euclidean distance calculation
      // Note: This is approximate and doesn't account for map projection
      const dx = endVertex[0] - startVertex[0];
      const dy = endVertex[1] - startVertex[1];
      return Math.sqrt(dx * dx + dy * dy);
    } catch (error) {
      console.warn('Error calculating segment length:', error);
      return 0;
    }
  }

  /**
   * Enhanced version that splits lines with custom styling for better visualization
   * @param uploadedShapefile - Array of Graphics containing line features
   * @param applyCustomStyling - Whether to apply different colors to segments
   * @returns Promise<Graphic[]> Array of styled line segment graphics
   */
  public async splitLineByVerticesWithStyling(
    uploadedShapefile: Graphic[],
    applyCustomStyling: boolean = true
  ): Promise<Graphic[]> {
    try {
      // First get the basic segments
      const segments = await this.splitLineByVertices(uploadedShapefile);

      if (!applyCustomStyling) {
        return segments;
      }

      // Apply custom styling to segments for better visualization
      const styledSegments = segments.map((segment, index) => {
        // Create different colors for segments to make them visually distinct
        const colors = [
          [255, 0, 0, 0.8],     // Red
          [0, 255, 0, 0.8],     // Green
          [0, 0, 255, 0.8],     // Blue
          [255, 255, 0, 0.8],   // Yellow
          [255, 0, 255, 0.8],   // Magenta
          [0, 255, 255, 0.8],   // Cyan
          [255, 165, 0, 0.8],   // Orange
          [128, 0, 128, 0.8]    // Purple
        ];

        const colorIndex = index % colors.length;

        // Create symbol for the segment
        segment.symbol = {
          type: 'simple-line',
          color: colors[colorIndex],
          width: 3,
          style: 'solid'
        } as any;

        return segment;
      });

      this.uploadStatus.next(
        `<p style="color:green"><b>Successfully styled ${styledSegments.length} line segments!</b><br/>
        Each segment has a unique color for easy identification.</p>`
      );

      return styledSegments;

    } catch (error) {
      console.error('Error applying styling to segments:', error);
      // Return unstyled segments as fallback
      return this.splitLineByVertices(uploadedShapefile);
    }
  }
}
