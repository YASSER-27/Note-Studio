import React from 'react';
import { 
  FilePlus, Plus, FolderOpen, FileCode, ChevronDown, ChevronRight,
  FolderPlus as NewFolder 
} from 'lucide-react';

export default function Sidebar({
  files,
  currentFolderPath,
  isCreatingFile,
  isCreatingFolder,
  newFileName,
  newFolderName,
  isRenaming,
  renamePath,
  renameValue,
  activeTab,
  selectedPath,
  expandedFolders,
  dropTarget,
  fileNameInputRef,
  folderNameInputRef,
  renameInputRef,
  setIsCreatingFile,
  setIsCreatingFolder,
  setNewFileName,
  setNewFolderName,
  setRenameValue,
  setIsRenaming,
  setRenamePath,
  handleCreateFileSubmit,
  handleCreateFolderSubmit,
  handleRenameSubmit,
  handleOpenFolder,
  createNewBlankTab,
  setShowProjectModal,
  onFileClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}) {
  
  const FileTree = ({ items }) => (
    <div className="tree-container">
      {items.map((item, i) => (
        <div key={i}>
          {isRenaming && renamePath === item.path ? (
            <div className="rename-input-container">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') { 
                    setIsRenaming(false); 
                    setRenamePath(null); 
                  }
                }}
                className="rename-input"
              />
            </div>
          ) : (
            <div 
              className={`tree-item ${activeTab?.path === item.path ? 'active' : ''} ${selectedPath === item.path ? 'selected-for-delete' : ''} ${dropTarget === item.path ? 'drop-target' : ''}`}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              onDragOver={(e) => onDragOver(e, item)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, item)}
              onDragEnd={onDragEnd}
              onClick={() => onFileClick(item)}
              onContextMenu={(e) => onContextMenu(e, item)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.isDirectory ? (
                  expandedFolders[item.path] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>
                ) : (
                  <FileCode size={14} color="#888"/>
                )}
                <span>{item.name}</span>
              </div>
            </div>
          )}
          {item.isDirectory && expandedFolders[item.path] && item.children && (
            <div style={{ marginLeft: '12px', borderLeft: '1px solid #333' }}>
              <FileTree items={item.children} />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <span>EXPLORER</span>
        <div className="header-icons">
          <FilePlus 
            size={16} 
            title="New Tab" 
            onClick={createNewBlankTab} 
          />
          <Plus 
            size={16} 
            title="New File (Alt+A)" 
            onClick={() => {
              if(!currentFolderPath) return alert("Open a folder first!");
              setIsCreatingFile(true);
              setTimeout(() => fileNameInputRef.current?.focus(), 50);
            }} 
          />
          <NewFolder 
            size={16} 
            title="New Folder" 
            onClick={() => {
              if(!currentFolderPath) return alert("Open a folder first!");
              setIsCreatingFolder(true);
              setTimeout(() => folderNameInputRef.current?.focus(), 50);
            }} 
          />
          <FolderOpen 
            size={16} 
            title="Open Folder" 
            onClick={handleOpenFolder} 
          />
        </div>
      </div>
      
      <div className="explorer-content">
        {isCreatingFile && (
          <div className="new-file-input-container">
            <form onSubmit={handleCreateFileSubmit}>
              <input 
                ref={fileNameInputRef}
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onBlur={() => { if(!newFileName) setIsCreatingFile(false); }}
                onKeyDown={(e) => { if(e.key === 'Escape') setIsCreatingFile(false); }}
                placeholder="filename.js"
                className="new-file-input"
              />
            </form>
          </div>
        )}
        
        {isCreatingFolder && (
          <div className="new-file-input-container">
            <form onSubmit={handleCreateFolderSubmit}>
              <input 
                ref={folderNameInputRef}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={() => { if(!newFolderName) setIsCreatingFolder(false); }}
                onKeyDown={(e) => { if(e.key === 'Escape') setIsCreatingFolder(false); }}
                placeholder="folder-name"
                className="new-file-input"
              />
            </form>
          </div>
        )}
        
        {files.length > 0 ? (
          <FileTree items={files} />
        ) : (
          <div className="no-folder-ui">
            <button className="gray-btn" onClick={handleOpenFolder}>
              Open Project
            </button>
            <button className="gray-btn" onClick={() => setShowProjectModal(true)}>
              New Project
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}