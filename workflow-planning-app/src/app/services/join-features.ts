import { Injectable } from '@angular/core';
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine.js";
import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import * as geodeticLengthOperator from "@arcgis/core/geometry/operators/geodeticLengthOperator.js";
import * as lengthOperator from "@arcgis/core/geometry/operators/lengthOperator.js";
import Polyline from "@arcgis/core/geometry/Polyline.js"; 
import SpatialReference from "@arcgis/core/geometry/SpatialReference";
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';


@Injectable({
  providedIn: 'root'
})
export class JoinFeaturesService {

  constructor() { }

  private MIN_FEATURES_FOR_JOIN = 2;
  private LENGTH_UNIT:any = 'meters';
  /**
   * Join connected but disjoint polylines into a single polyline
   * @param features - Array of graphic features to join
   * @returns Promise<Graphic | null> - Joined polyline graphic or null if joining fails
   * @throws Error when polylines cannot be joined (disconnected)
   */
  async joinSelectedPolylines (features: Graphic[]) : Promise<Graphic | null>
  {

    const validationResult = this.validateInputFeatures(features);
    if (!validationResult.isValid) {
      console.warn(`Cannot join polylines: ${validationResult.reason}`);
      return null;
    }

    const extractedPolylinesGeometries = this.extractPolylineGeometries(features);  
    if (extractedPolylinesGeometries.length < this.MIN_FEATURES_FOR_JOIN) {
      console.warn('Insufficient polyline geometries for joining');
      return null;
    }
    
    try {
      const joinedPolyline = this.createJoinedPolyline(extractedPolylinesGeometries);
      this.validateJoinedPolyline(joinedPolyline);
      const joinedGraphic = new Graphic({geometry: joinedPolyline,});
      return joinedGraphic;
    } catch (error) {
      throw error;
    }
  };
  async processPathBasedOnLength(originGraphic: any,layer: GraphicsLayer,innerGraphicsContainer:any[]) : Promise<void> {
    try {
 
      const drawnGraphicGeometry: Polyline = originGraphic.geometry;
      const segments: Polyline[] = [];
      // Merge multiple paths into a single path if necessary
      let mergedGeometry = drawnGraphicGeometry;
 
      // Check if the polyline has multiple paths
      if (drawnGraphicGeometry.paths && drawnGraphicGeometry.paths.length > 1) {
        // Use geometryEngine.union to merge all paths into a single path
        // Create separate polylines for each path
        const pathPolylines = drawnGraphicGeometry.paths.map(path => {
          return new Polyline({
            paths: [path],
            spatialReference: drawnGraphicGeometry.spatialReference
          });
        });
 
        // Use union to combine them into a single geometry
        mergedGeometry = geometryEngine.union(pathPolylines) as Polyline;
      }
 
      // Calculate total length in meters using the merged geometry
      const totalLength = geometryEngine.geodesicLength(mergedGeometry, 'meters');
      if (totalLength > 1000) {
        
        // Create a densified polyline for more accurate splitting
        const densifiedPolyline = geometryEngine.geodesicDensify(
          mergedGeometry,
          2, // Higher precision densification
          'meters'
        ) as Polyline;
 
        // Calculate number of full 1000m segments needed
        const fullSegmentsCount = Math.floor(totalLength / 1000);
        // Now we know we're working with a single path

        densifiedPolyline.paths.map((path: number[][]) => {
          let currentPath = [...path]; // Clone the path array
          let segmentIndex = 0;
   
          // Process each 1000m segment
          while (segmentIndex < fullSegmentsCount) {
            let segmentPoints = [currentPath[0]]; // Start with the first point
            let segmentLength = 0;
            let i = 1;
   
            // Add points until we reach or nearly exceed 1000m
            while (i < currentPath.length && segmentLength < 1000) {
              const segment = new Polyline({
                paths: [[currentPath[i - 1], currentPath[i]]],
                spatialReference: mergedGeometry.spatialReference,
              });
   
              const pointToPointLength = geometryEngine.geodesicLength(segment, 'meters');
   
              // If adding this point would exceed 1000m, calculate split point
              if (segmentLength + pointToPointLength > 1000) {
                const remainingToTarget = 1000 - segmentLength;
                const ratio = remainingToTarget / pointToPointLength;
   
                // Calculate precise interpolated split point along the line
                const splitPoint = [
                  currentPath[i - 1][0] + (currentPath[i][0] - currentPath[i - 1][0]) * ratio,
                  currentPath[i - 1][1] + (currentPath[i][1] - currentPath[i - 1][1]) * ratio,
                ];
   
                segmentPoints.push(splitPoint);
   
                // Create exactly 1000m segment
                const newSegment = new Polyline({
                  paths: [segmentPoints],
                  spatialReference: mergedGeometry.spatialReference,
                });
   
                segments.push(newSegment);
                // Update the current path to start from the split point
                currentPath = [splitPoint, ...currentPath.slice(i)];
   
                break;
              }
   
              // Otherwise add the point and continue
              segmentLength += pointToPointLength;
              segmentPoints.push(currentPath[i]);
              i++;
            }
   
            // If we processed all points but didn't complete the segment
            if (i === currentPath.length && segmentPoints.length > 1) {
              // This shouldn't normally happen with a properly densified polyline,
              // but add a safety check
              const polyline = new Polyline({
                paths: [segmentPoints],
                spatialReference: mergedGeometry.spatialReference,
              });
   
              segments.push(polyline);
              currentPath = [];
              break;
            }
   
            segmentIndex++;
          }
   
          // If we have points left, create the final segment with remaining length
          if (currentPath.length > 1) {
            const finalSegment = new Polyline({
              paths: [currentPath],
              spatialReference: mergedGeometry.spatialReference,
            });
   
            segments.push(finalSegment);
          }
   
          // Add new segments to the map with alternating colors for visibility
          segments.forEach((segment, index) => {
            const colors = [[99, 198, 29], 'orange'];
            const color = colors[index % colors.length];
            const segmentGraphic = new Graphic({
              geometry: segment,
              symbol: new SimpleLineSymbol({
                color: color,
                width: 4,
                style: 'dot',
              }),
              attributes: {
                segmentIndex: index
              }
            });
            layer.add(segmentGraphic);
            innerGraphicsContainer.push(segmentGraphic);
          });
        });

      } else {
        // If path is less than 1000m, just use it directly
        const graphic = new Graphic({
          geometry: mergedGeometry, // Use the merged geometry
          symbol: new SimpleLineSymbol({
            color: [99, 198, 29],
            width: 4,
            style: 'dot',
          }),
        });
        layer.add(graphic);
        innerGraphicsContainer.push(graphic);
      }
    } catch (error) {
      console.error('Error in processPathBasedOnLength:', error);
    }
  }
  private validateInputFeatures(features: Graphic[]): ValidationResult {
    if (!features) {
      return { isValid: false, reason: 'Features array is null or undefined' };
    }
    if (features.length < this.MIN_FEATURES_FOR_JOIN) {
      return { isValid: false, reason: `Minimum ${this.MIN_FEATURES_FOR_JOIN} features required` };
    }
    return { isValid: true };
  }
  private extractPolylineGeometries(features: Graphic[]): Polyline[] {
    return features
      .map(f => f.geometry)
      .filter(g => g != null && g.type === "polyline");
  }
  private createJoinedPolyline(polylineGeometries: Polyline[]) {
    const normalizedPolylineGeometries = polylineGeometries.map(polyline => {
      return new Polyline({
        paths: polyline.paths,
        spatialReference: polyline.spatialReference
      });
    });

    let joinedGeometry = geometryEngine.union(normalizedPolylineGeometries) as Polyline;

    if(!joinedGeometry){
      throw new Error("Failed to create joined geometry");
    }

    return joinedGeometry;
  }
  private validateJoinedPolyline(joinedGeometry: Polyline):void {
    if(joinedGeometry.paths.length > 1){
      throw new Error('Cannot join disconnected polylines - result contains multiple paths');
    }
  }
  private async calculateJoinedPolylineLength(joinedGeometry: Polyline):Promise<number> {
    if(this.isGeodetic(joinedGeometry.spatialReference)){
      return await this.calculateGeodeticLength(joinedGeometry); 
    }else{
      return this.calculatePlanarLength(joinedGeometry); 
    }
  }
  private async calculateGeodeticLength(joinedGeometry: Polyline):Promise<number> {
    if (!geodeticLengthOperator.isLoaded()) {
      await geodeticLengthOperator.load();
    }
    return geodeticLengthOperator.execute(joinedGeometry, { unit: this.LENGTH_UNIT });
  }
  private isGeodetic(joinedGeomSpatialReference: SpatialReference):boolean {
    return joinedGeomSpatialReference.isGeographic || joinedGeomSpatialReference.isWebMercator;
  }
  private calculatePlanarLength(joinedGeometry: Polyline):number {
   return lengthOperator.execute(joinedGeometry, { unit: this.LENGTH_UNIT });
  }
}

interface ValidationResult {
  isValid: boolean;
  reason?: string;
}
