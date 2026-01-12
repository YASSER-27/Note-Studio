import React from 'react';
import { Zap, Minimize2, Square, X } from 'lucide-react';

const { ipcRenderer } = window.require('electron');

export default function TitleBar() {
  return (
    <div className="custom-title-bar">
      <div className="brand-zone">
        <Zap size={16} fill="#888" /> <span>Note Studio</span>
      </div>
      <div className="window-actions">
        <button onClick={() => ipcRenderer.send('minimize-window')}>
          <Minimize2 size={14}/>
        </button>
        <button onClick={() => ipcRenderer.send('maximize-window')}>
          <Square size={14}/>
        </button>
        <button className="close-btn" onClick={() => ipcRenderer.send('close-window')}>
          <X size={14}/>
        </button>
      </div>
    </div>
  );
}