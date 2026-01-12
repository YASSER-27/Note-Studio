import React from 'react';
import { Monitor, Box, Loader } from 'lucide-react';

export default function ProjectModal({
  showProjectModal,
  isLoading,
  projectType,
  projectName,
  setProjectType,
  setProjectName,
  setShowProjectModal,
  handleCreateProject
}) {
  
  if (!showProjectModal) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Create New Project</h3>
        
        {isLoading ? (
          <div className="loading-state">
            <Loader size={40} className="spin-anim" color="#007acc" />
            <p style={{marginTop: 15, color: '#ccc'}}>
              Creating <b>{projectType}</b> project...
            </p>
            <p style={{fontSize: 12, color: '#666'}}>
              {projectType === 'electron' 
                ? 'Installing Vite template (this may take a moment)...' 
                : 'Setting up file structure...'}
            </p>
          </div>
        ) : (
          <>
            {!projectType ? (
              <div className="project-types">
                <div className="p-card" onClick={() => setProjectType('electron')}>
                  <Monitor size={32} color="#61dafb" />
                  <span>Electron (Vite)</span>
                </div>
                <div className="p-card" onClick={() => setProjectType('python')}>
                  <Box size={32} color="#ffe873" />
                  <span>Python Pro</span>
                </div>
              </div>
            ) : (
              <div className="project-form">
                <p>
                  Project Type: <b>
                    {projectType === 'electron' ? 'Electron + React (Vite)' : 'Python Project'}
                  </b>
                </p>
                <input 
                  type="text" 
                  placeholder="Project Name (e.g., my-app)" 
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value.replace(/\s/g, '-'))}
                  autoFocus
                />
                <div className="modal-actions">
                  <button onClick={handleCreateProject}>
                    Create on Desktop
                  </button>
                  <button 
                    className="cancel" 
                    onClick={() => { 
                      setProjectType(null); 
                      setShowProjectModal(false); 
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}