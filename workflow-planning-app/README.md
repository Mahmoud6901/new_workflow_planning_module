# Workflow Planning Module

An Angular application featuring ArcGIS mapping capabilities with shapefile upload functionality.

## 🚀 Features

- **Interactive ArcGIS Map**: Powered by ArcGIS JavaScript API with multiple basemap options
- **Shapefile Upload**: Drag-and-drop or click-to-upload functionality for `.zip` files
- **Advanced Sketch Widget**: Full interactive editing with vertex manipulation, scaling, rotation, movement, deletion, and precision snapping
- **Line Splitting by Vertices**: Advanced feature to split line geometries into individual segments
- **Graphics Management**: Toggle visibility and manage multiple uploaded graphics
- **Custom Styling**: Automatic color coding for split line segments
- **Responsive Design**: Works on desktop and mobile devices
- **Error Handling**: Comprehensive validation and error reporting
- **Modern UI**: Clean, intuitive interface with loading indicators

## 📋 Prerequisites

- Node.js (version 18 or higher)
- npm (version 9 or higher)
- Angular CLI (version 18 or higher)

## 🛠️ Installation

1. **Clone or navigate to the project directory**:

   ```bash
   cd workflow-planning-app
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start the development server**:

   ```bash
   ng serve
   ```

4. **Open your browser** and navigate to `http://localhost:4200`

## 🎯 Usage

### Uploading Shapefiles

1. **Drag and Drop**: Simply drag a shapefile (`.shp` or `.zip`) into the upload area
2. **Click to Upload**: Click the upload area and select a file from your system
3. **File Validation**: The system validates file format and size (max 10MB)
4. **Processing**: Files are processed and displayed on the map automatically

### Sketch Widget (Interactive Editing)

1. **Selection**: Click on graphics to select them (hold Ctrl for multiple selection)
2. **Vertex Editing**: Drag individual vertices to reshape lines and polygons
3. **Move Graphics**: Drag selected graphics to reposition them on the map
4. **Scale/Resize**: Use corner handles to scale and resize graphics proportionally
5. **Rotation**: Use rotation handles to rotate graphics around their center
6. **Deletion**: Press Delete key to remove selected graphics
7. **Precision Snapping**: Toggle snapping for precise vertex alignment with 15-pixel tolerance
8. **Visual Highlighting**: Yellow highlights show snap candidates during editing
9. **Undo/Redo**: Use Ctrl+Z for undo and Ctrl+Y for redo operations
10. **Visual Feedback**: Real-time status updates for all editing operations

### Line Splitting by Vertices

1. **Upload First**: Upload a shapefile containing line or polygon features
2. **Split Lines**: Click the "Split Lines by Vertices" button
3. **View Segments**: Each segment between consecutive vertices becomes a separate line
4. **Color Coding**: Segments are automatically styled with different colors for easy identification

### Map Interaction

- **Zoom**: Use mouse wheel or touch gestures to zoom in/out
- **Pan**: Click and drag to move around the map
- **Basemap Gallery**: Click the basemap icon (top-right) to change background maps

### Graphics Management

- **View Graphics**: All uploaded graphics are listed in the control panel
- **Toggle Visibility**: Click the eye icon to show/hide individual graphics
- **Clear Graphics**: Use the "Clear All Graphics" button to remove all uploaded data
- **Split Lines**: Use the "Split Lines by Vertices" button to create line segments

## 🏗️ Architecture

### Components

- **MapComponent**: Main component handling ArcGIS map display and user interactions
- **AppComponent**: Root component providing the application layout

### Services

- **UploadShapefileService**: Handles shapefile upload, validation, processing, and line splitting

### Key Features

- **Dynamic Module Loading**: ArcGIS modules are loaded on-demand for optimal performance
- **Comprehensive Sketch Widget**: Advanced editing with vertex manipulation, scaling, rotation, movement, deletion, and precision snapping
- **Precision Snapping & Highlighting**: 15-pixel tolerance snapping with yellow highlight feedback for accurate editing
- **Advanced Geometry Processing**: Split line features by vertices with proper attribute preservation
- **Memory Management**: Proper cleanup of map resources and subscriptions
- **Error Boundaries**: Comprehensive error handling throughout the application
- **Type Safety**: Full TypeScript support with proper interfaces
- **Custom Styling**: Automatic color coding for better visualization

## 📦 Dependencies

### Production Dependencies

- `@angular/core`: Angular framework
- `@arcgis/core`: ArcGIS JavaScript API for mapping functionality
- `rxjs`: Reactive programming with observables

### Development Dependencies

- `@angular/cli`: Angular command line interface
- `typescript`: TypeScript compiler

## 🎨 Styling

- **Responsive Design**: Mobile-first approach with breakpoints at 768px and 480px
- **Modern UI**: Clean interface with subtle shadows and gradients
- **Accessibility**: High contrast support and keyboard navigation
- **Loading States**: Visual feedback during file processing

## 🚨 Error Handling

The application includes comprehensive error handling for:

- **Invalid File Formats**: Only `.shp` and `.zip` files are accepted
- **File Size Limits**: Maximum file size of 10MB
- **Map Loading Errors**: Graceful fallback when map fails to initialize
- **Network Issues**: Proper error messages for connectivity problems

## 🌐 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📱 Mobile Support

The application is fully responsive and works on:

- iOS devices (iPhone/iPad)
- Android devices
- Windows mobile devices

## 🔧 Development

### Building for Production

```bash
ng build --prod
```

### Running Tests

```bash
ng test
```

### Code Linting

```bash
ng lint
```

## 🎉 Success Indicators

✅ **Angular Application Created**: New project with routing and SSR enabled  
✅ **Map Component Generated**: Fully functional component with ArcGIS integration  
✅ **Upload Service Implemented**: Complete shapefile handling and line splitting service  
✅ **Advanced Sketch Widget**: Full editing with vertex manipulation, scaling, rotation, movement, deletion, and precision snapping  
✅ **Service Integration**: Map component successfully uses all services  
✅ **Error-Free Operation**: All functionality working without errors  
✅ **Modern UI**: Beautiful, responsive design with drag-and-drop support  
✅ **Code Documentation**: Comprehensive comments and documentation

## 📝 Notes

- The application uses the latest ArcGIS JavaScript API (v4.31)
- Shapefiles are processed client-side for security and performance
- Map data is temporarily stored in browser memory
- No server-side processing required for basic functionality

## 🤝 Contributing

1. Fork the project
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

---

**Enjoy mapping with Angular and ArcGIS! 🗺️**
