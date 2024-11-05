import React, { useState, useEffect, useRef } from 'react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneTools from 'cornerstone-tools';
import Hammer from 'hammerjs';
import dicomParser from 'dicom-parser';
import CryptoJS from 'crypto-js';
import './App.css';

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;

cornerstoneTools.init();

const App = () => {
  const [imageId, setImageId] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const imageRef = useRef(null);

  useEffect(() => {
    if (imageId) {
      cornerstone.enable(imageRef.current);
      cornerstone.loadImage(imageId).then(image => {
        cornerstone.displayImage(imageRef.current, image);
        cornerstoneTools.addToolForElement(imageRef.current, cornerstoneTools.LengthTool);
        cornerstoneTools.addToolForElement(imageRef.current, cornerstoneTools.AngleTool);
        cornerstoneTools.addToolForElement(imageRef.current, cornerstoneTools.CobbAngleTool);
        cornerstoneTools.setToolActive('Length', { mouseButtonMask: 1 });
      });
    }
  }, [imageId]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      let imageId;
      
      if (file.type === 'application/dicom') {
        // Handle DICOM file
        const dicomData = dicomParser.parseDicom(arrayBuffer);
        imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
      } else {
        // Handle other image formats
        const base64 = arrayBufferToBase64(arrayBuffer);
        imageId = `data:${file.type};base64,${base64}`;
      }
      
      setImageId(imageId);
    };
    reader.readAsArrayBuffer(file);
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleToolChange = (toolName) => {
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
  };

  const handleSaveMeasurements = () => {
    const toolState = cornerstoneTools.getToolState(imageRef.current);
    const newMeasurements = [];

    if (toolState.length) {
      newMeasurements.push(...toolState.length.data.map(data => ({
        type: 'Length',
        value: data.length.toFixed(2),
        unit: 'mm'
      })));
    }

    if (toolState.angle) {
      newMeasurements.push(...toolState.angle.data.map(data => ({
        type: 'Angle',
        value: data.angle.toFixed(2),
        unit: 'degrees'
      })));
    }

    if (toolState.cobbAngle) {
      newMeasurements.push(...toolState.cobbAngle.data.map(data => ({
        type: 'Cobb Angle',
        value: data.angle.toFixed(2),
        unit: 'degrees'
      })));
    }

    setMeasurements(newMeasurements);
  };

  const handleExportMeasurements = () => {
    const measurementsJson = JSON.stringify(measurements);
    const encryptedData = CryptoJS.AES.encrypt(measurementsJson, 'secret_key').toString();
    const blob = new Blob([encryptedData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'measurements.json';
    a.click();
  };

  return (
    <div className="App">
      <h1>Spinal X-ray Analyzer</h1>
      <input type="file" accept="image/*,.dcm" onChange={handleFileUpload} />
      <div className="toolbar">
        <button onClick={() => handleToolChange('Length')}>Length</button>
        <button onClick={() => handleToolChange('Angle')}>Angle</button>
        <button onClick={() => handleToolChange('CobbAngle')}>Cobb Angle</button>
      </div>
      <div ref={imageRef} style={{ width: '512px', height: '512px' }}></div>
      <button onClick={handleSaveMeasurements}>Save Measurements</button>
      <button onClick={handleExportMeasurements}>Export Measurements</button>
      <div className="measurements">
        <h2>Measurements</h2>
        <ul>
          {measurements.map((measurement, index) => (
            <li key={index}>
              {measurement.type}: {measurement.value} {measurement.unit}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default App;
