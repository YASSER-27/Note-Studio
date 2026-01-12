import React from 'react';
import Editor from '@monaco-editor/react';
import { X, Trash2, Code } from 'lucide-react';

export default function EditorContainer({
  tabs,
  activeTabId,
  activeTab,
  editorRef,
  setActiveTabId,
  setTabs,
  closeAllTabs
}) {
  
  return (
    <main className="editor-container">
      <div className="tabs-header">
        <div className="tabs-wrapper-scroll">
          {tabs.map(tab => (
            <div 
              key={tab.id} 
              className={`tab-pill ${activeTabId === tab.id ? 'active' : ''}`} 
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="tab-title">
                {tab.name}{tab.modified && '*'}
              </span>
              <X 
                size={12} 
                className="tab-close" 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setTabs(prev => prev.filter(t => t.id !== tab.id)); 
                  if (activeTabId === tab.id) setActiveTabId(null);
                }} 
              />
            </div>
          ))}
        </div>
        {tabs.length > 0 && (
          <div className="tabs-actions">
            <button 
              className="close-all-btn" 
              onClick={closeAllTabs} 
              title="Close All Tabs"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="editor-viewport">
        {activeTab ? (
          <Editor
            height="100%"
            theme="vs-dark"
            language={activeTab.language}
            value={activeTab.content}
            onChange={(val) => setTabs(prev => prev.map(t => 
              t.id === activeTabId ? { ...t, content: val, modified: true } : t
            ))}
            onMount={(editor) => { editorRef.current = editor; }}
            options={{ 
              fontSize: 15, 
              automaticLayout: true, 
              minimap: { enabled: true }, 
              wordWrap: "on", 
              scrollBeyondLastLine: false,
              tabSize: 2,
              formatOnPaste: true,
              formatOnType: true
            }}
          />
        ) : (
          <div className="welcome-screen">
            <Code size={80} color="#333" />
            <div className="shortcut-list">
              <div className="s-item"><span>Ctrl + Shift + N</span> New Project</div>
              <div className="s-item"><span>Ctrl + N</span> New Tab</div>
              <div className="s-item"><span>Ctrl + O</span> Open Folder</div>
              <div className="s-item"><span>Ctrl + S</span> Save File</div>
              <div className="s-item"><span>Alt + A</span> New File</div>
              <div className="s-item"><span>Ctrl + `</span> Open Terminal</div>
              <div className="s-item"><span>Ctrl + B</span> Toggle Sidebar</div>
              <div className="s-item"><span>Drag & Drop</span> Move Files</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}