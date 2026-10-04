import React, { useState, useEffect, useRef } from 'react';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneTools from 'cornerstone-tools';
import Hammer from 'hammerjs';
import dicomParser from 'dicom-parser';
import './App.css';

cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;

cornerstoneTools.init();

// Exports are produced entirely in the browser. The plain export is the
// default: these files carry clinical measurements, so they are written as
// readable JSON and should be handled accordingly. The passphrase variant
// derives its key from a passphrase supplied at export time, so no key is ever
// part of the source or the shipped bundle.
const ENCRYPTED_EXPORT_FORMAT = 'xray-markup-encrypted-v1';
const PBKDF2_ITERATIONS = 250000;
const textEncoder = new TextEncoder();

const toBase64 = (bytes) => {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
};

const deriveExportKey = async (passphrase, salt) => {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

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
    downloadJson(measurements, 'measurements.json');
  };

  const handleExportEncryptedMeasurements = async () => {
    const passphrase = window.prompt(
      'Enter a passphrase to protect this export. It is used to derive the key and is not stored by the app.'
    );
    if (passphrase === null) return;
    if (!passphrase) {
      window.alert('Export cancelled: a passphrase is required.');
      return;
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveExportKey(passphrase, salt);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      textEncoder.encode(JSON.stringify(measurements))
    );

    downloadJson({
      format: ENCRYPTED_EXPORT_FORMAT,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: PBKDF2_ITERATIONS,
        salt: toBase64(salt)
      },
      cipher: { name: 'AES-GCM', iv: toBase64(iv), keyLength: 256 },
      ciphertext: toBase64(new Uint8Array(ciphertext))
    }, 'measurements.enc.json');
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
      <button onClick={handleExportEncryptedMeasurements}>Export with Passphrase</button>
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
