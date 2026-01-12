import React, { useState, useEffect, useRef } from 'react';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import {
  Copy, Scissors, Clipboard, Info, Terminal, Edit3, Trash2
} from 'lucide-react';
import './App.css';

// Import Components
import TitleBar from './components/TitleBar';
import MenuBar from './components/MenuBar';
import Sidebar from './components/Sidebar';
import EditorContainer from './components/EditorContainer';
import ProjectModal from './components/ProjectModal';

const { ipcRenderer } = window.require('electron');
loader.config({ monaco });

export default function App() {
  const [files, setFiles] = useState([]);
  const [currentFolderPath, setCurrentFolderPath] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedPath, setSelectedPath] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamePath, setRenamePath] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectType, setProjectType] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const editorRef = useRef(null);
  const fileNameInputRef = useRef(null);
  const folderNameInputRef = useRef(null);
  const renameInputRef = useRef(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const selectedPathRef = useRef(selectedPath);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { selectedPathRef.current = selectedPath; }, [selectedPath]);

  useEffect(() => {
    if (activeTabId && editorRef.current) {
      const timer = setTimeout(() => {
        editorRef.current.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTabId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // --- Drag & Drop Handlers ---
  const handleDragStart = (e, item) => {
    e.stopPropagation();
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.path);
  };

  const handleDragOver = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    if (item.isDirectory && draggedItem && draggedItem.path !== item.path) {
      setDropTarget(item.path);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDropTarget(null);
  };

  const handleDrop = async (e, targetItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    
    if (!draggedItem || !targetItem.isDirectory) return;
    
    const res = await ipcRenderer.invoke('move-file', {
      sourcePath: draggedItem.path,
      targetDir: targetItem.path
    });
    
    if (res.success) {
      if (res.newPath) {
        setTabs(prev => prev.map(t => 
          t.path === draggedItem.path ? { ...t, path: res.newPath } : t
        ));
      }
      refreshFileTree();
    } else {
      alert("Error moving file: " + res.error);
    }
    
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTarget(null);
  };

  // --- Delete ---
  const handleDeleteItem = async (targetPath) => {
    if (!targetPath) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete: ${targetPath.split(/[\\/]/).pop()}?`);
    if (!confirmDelete) return;

    const res = await ipcRenderer.invoke('delete-item', targetPath);
    if (res.success) {
      setTabs(prev => prev.filter(t => t.path !== targetPath));
      if (activeTab?.path === targetPath) setActiveTabId(null);
      refreshFileTree();
      setSelectedPath(null);
    } else {
      alert("Error deleting file: " + res.error);
    }
  };

  const refreshFileTree = async () => {
    if (currentFolderPath) {
      const folderRes = await ipcRenderer.invoke('open-folder-at-path', currentFolderPath);
      if (folderRes && folderRes.files) {
        setFiles(folderRes.files);
      }
    }
  };

  // --- Copy/Paste ---
  const handleCopyFile = async () => {
    if (!selectedPath) return;
    await ipcRenderer.invoke('copy-file', selectedPath);
  };

  const handleCutFile = async () => {
    if (!selectedPath) return;
    await ipcRenderer.invoke('cut-file', selectedPath);
  };

  const handlePasteFile = async () => {
    if (!currentFolderPath) return;
    const res = await ipcRenderer.invoke('paste-file', currentFolderPath);
    if (res.success) {
      refreshFileTree();
    } else {
      alert("Error pasting: " + res.error);
    }
  };

  // --- File Info ---
  const handleCheckFile = async () => {
    if (!selectedPath) return;
    const res = await ipcRenderer.invoke('check-file', selectedPath);
    if (res.success) {
      const info = res.info;
      alert(`File Information:
      
Size: ${(info.size / 1024).toFixed(2)} KB
Lines: ${info.lines}
Created: ${new Date(info.created).toLocaleString()}
Modified: ${new Date(info.modified).toLocaleString()}
Type: ${info.isDirectory ? 'Directory' : 'File'}`);
    }
  };

  // --- Terminal ---
  const handleOpenTerminal = async () => {
    const targetPath = selectedPath || currentFolderPath;
    if (!targetPath) return;
    
    await ipcRenderer.invoke('open-terminal', targetPath);
  };

  // --- Rename ---
  const startRename = () => {
    if (!selectedPath) return;
    setIsRenaming(true);
    setRenamePath(selectedPath);
    setRenameValue(selectedPath.split(/[\\/]/).pop());
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = async () => {
    if (!renamePath || !renameValue) return;
    
    const oldPath = renamePath;
    const parentDir = oldPath.split(/[\\/]/).slice(0, -1).join('/');
    const newPath = `${parentDir}/${renameValue}`;
    
    const res = await ipcRenderer.invoke('rename-item', { oldPath, newPath });
    if (res.success) {
      setTabs(prev => prev.map(t => 
        t.path === oldPath ? { ...t, path: newPath, name: renameValue } : t
      ));
      refreshFileTree();
      setIsRenaming(false);
      setRenamePath(null);
      setRenameValue('');
    } else {
      alert("Error renaming: " + res.error);
    }
  };

  // --- Create File ---
  const handleCreateFileSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!newFileName || !currentFolderPath) return;

    const fullPath = `${currentFolderPath}/${newFileName}`;
    const res = await ipcRenderer.invoke('save-file', { filePath: fullPath, content: '' });
    
    if (res.success) {
      setIsCreatingFile(false);
      setNewFileName('');
      await refreshFileTree();
      openFileInTab(newFileName, fullPath, '');
    }
  };

  // --- Create Folder ---
  const handleCreateFolderSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!newFolderName || !currentFolderPath) return;

    const res = await ipcRenderer.invoke('create-folder', { 
      parentPath: currentFolderPath, 
      folderName: newFolderName 
    });
    
    if (res.success) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      refreshFileTree();
    } else {
      alert("Error creating folder: " + res.error);
    }
  };

  // --- Create Project ---
  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      alert("Please enter a project name!");
      return;
    }

    setIsLoading(true);
    
    const res = await ipcRenderer.invoke('create-project', {
      type: projectType,
      name: projectName
    });

    setIsLoading(false);

    if (res.success) {
      alert(`✅ Project created successfully!\nLocation: Desktop/${projectName}`);
      setShowProjectModal(false);
      setProjectName('');
      setProjectType(null);
    } else {
      alert("❌ Error: " + res.error);
    }
  };

  // --- Open Folder ---
  const handleOpenFolder = async () => {
    const res = await ipcRenderer.invoke('open-folder');
    if (res) { 
      setFiles(res.files); 
      setCurrentFolderPath(res.path); 
    }
  };

  const openFileInTab = (name, path, content) => {
    const existing = tabsRef.current.find(t => t.path === path);
    if (existing) { 
      setActiveTabId(existing.id); 
      return; 
    }
    const newTab = { 
      id: Date.now(), 
      name, 
      path, 
      content, 
      language: detectLanguage(name), 
      modified: false 
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleFileClick = async (file) => {
    setSelectedPath(file.path);
    if (file.isDirectory) {
      setExpandedFolders(prev => ({ ...prev, [file.path]: !prev[file.path] }));
      return;
    }
    const res = await ipcRenderer.invoke('read-file', file.path);
    if (res.success) openFileInTab(file.name, file.path, res.content);
  };

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedPath(file.path);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file: file
    });
  };

  const createNewBlankTab = () => {
    const newTab = {
      id: Date.now(),
      name: 'Untitled',
      path: null,
      content: '',
      language: 'plaintext',
      modified: true
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleSave = async () => {
    const currentTabs = tabsRef.current;
    const currentActiveId = activeTabIdRef.current;
    const tabToSave = currentTabs.find(t => t.id === currentActiveId);
    if (!tabToSave) return;

    if (tabToSave.path) {
      await ipcRenderer.invoke('save-file', { filePath: tabToSave.path, content: tabToSave.content });
      setTabs(prev => prev.map(t => t.id === currentActiveId ? { ...t, modified: false } : t));
    } else {
      const res = await ipcRenderer.invoke('save-file-as', tabToSave.content);
      if (res.success) {
        setTabs(prev => prev.map(t => t.id === currentActiveId ? {
          ...t, name: res.name, path: res.path, modified: false, language: detectLanguage(res.name)
        } : t));
        refreshFileTree();
      }
    }
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;
    const res = await ipcRenderer.invoke('save-file-as', activeTab.content);
    if (res.success) {
      setTabs(prev => prev.map(t => t.id === activeTabId ? {
        ...t, name: res.name, path: res.path, modified: false, language: detectLanguage(res.name)
      } : t));
      refreshFileTree();
    }
  };

  const detectLanguage = (name) => {
    const ext = name.split('.').pop();
    const map = { 
      js: 'javascript', py: 'python', html: 'html', css: 'css', 
      ts: 'typescript', json: 'json', md: 'markdown', jsx: 'javascript',
      cpp: 'cpp', c: 'c', java: 'java', php: 'php', rb: 'ruby',
      go: 'go', rs: 'rust', swift: 'swift', kt: 'kotlin'
    };
    return map[ext] || 'plaintext';
  };

  const switchTab = (direction) => {
    if (tabs.length < 2) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    let newIndex = (currentIndex + direction + tabs.length) % tabs.length;
    setActiveTabId(tabs[newIndex].id);
  };

  const closeAllTabs = () => {
    if (window.confirm("Close all tabs?")) { setTabs([]); setActiveTabId(null); }
  };

  // --- IPC Listeners ---
  useEffect(() => {
    const handleShortcutNewFile = () => {
      if (!currentFolderPath) {
        alert("Please open a project folder first!");
        return;
      }
      setIsCreatingFile(true);
      setTimeout(() => fileNameInputRef.current?.focus(), 50);
    };

    ipcRenderer.on('new-file-trigger', handleShortcutNewFile);
    ipcRenderer.on('new-blank-tab', createNewBlankTab);
    ipcRenderer.on('save-trigger', handleSave);
    ipcRenderer.on('save-as-trigger', handleSaveAs);
    ipcRenderer.on('copy-file-trigger', handleCopyFile);
    ipcRenderer.on('paste-file-trigger', handlePasteFile);
    ipcRenderer.on('delete-file-trigger', () => handleDeleteItem(selectedPathRef.current));
    ipcRenderer.on('open-terminal-trigger', handleOpenTerminal);
    ipcRenderer.on('toggle-sidebar', () => setSidebarVisible(prev => !prev));
    ipcRenderer.on('new-project-trigger', () => setShowProjectModal(true));
	ipcRenderer.on('new-project-trigger', () => setShowProjectModal(true));
	ipcRenderer.on('new-file-trigger', handleShortcutNewFile);
    
    ipcRenderer.on('folder-opened', (event, data) => {
      setFiles(data.files);
      setCurrentFolderPath(data.path);
    });
    
    ipcRenderer.on('close-tab', () => {
      if (activeTabIdRef.current) {
        const idToClose = activeTabIdRef.current;
        setTabs(prev => {
          const newTabs = prev.filter(t => t.id !== idToClose);
          if (newTabs.length > 0) setActiveTabId(newTabs[0].id);
          else setActiveTabId(null);
          return newTabs;
        });
      }
    });
    
    ipcRenderer.on('next-tab', () => switchTab(1));
    ipcRenderer.on('prev-tab', () => switchTab(-1));

    return () => {
      ipcRenderer.removeAllListeners('new-file-trigger');
      ipcRenderer.removeAllListeners('new-blank-tab');
      ipcRenderer.removeAllListeners('save-trigger');
      ipcRenderer.removeAllListeners('save-as-trigger');
      ipcRenderer.removeAllListeners('copy-file-trigger');
      ipcRenderer.removeAllListeners('paste-file-trigger');
      ipcRenderer.removeAllListeners('delete-file-trigger');
      ipcRenderer.removeAllListeners('open-terminal-trigger');
      ipcRenderer.removeAllListeners('toggle-sidebar');
      ipcRenderer.removeAllListeners('new-project-trigger');
      ipcRenderer.removeAllListeners('folder-opened');
      ipcRenderer.removeAllListeners('close-tab');
      ipcRenderer.removeAllListeners('next-tab');
      ipcRenderer.removeAllListeners('prev-tab');
    };
	}, [activeTabId, tabs, currentFolderPath, isCreatingFile]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Delete' && selectedPathRef.current && !isRenaming) {
        handleDeleteItem(selectedPathRef.current);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isRenaming]);

  return (
    <div className="app-main">
      <TitleBar />
      <MenuBar />

      <div className="content-wrapper">
        {sidebarVisible && (
          <Sidebar
            files={files}
            currentFolderPath={currentFolderPath}
            isCreatingFile={isCreatingFile}
            isCreatingFolder={isCreatingFolder}
            newFileName={newFileName}
            newFolderName={newFolderName}
            isRenaming={isRenaming}
            renamePath={renamePath}
            renameValue={renameValue}
            activeTab={activeTab}
            selectedPath={selectedPath}
            expandedFolders={expandedFolders}
            dropTarget={dropTarget}
            fileNameInputRef={fileNameInputRef}
            folderNameInputRef={folderNameInputRef}
            renameInputRef={renameInputRef}
            setIsCreatingFile={setIsCreatingFile}
            setIsCreatingFolder={setIsCreatingFolder}
            setNewFileName={setNewFileName}
            setNewFolderName={setNewFolderName}
            setRenameValue={setRenameValue}
            setIsRenaming={setIsRenaming}
            setRenamePath={setRenamePath}
            handleCreateFileSubmit={handleCreateFileSubmit}
            handleCreateFolderSubmit={handleCreateFolderSubmit}
            handleRenameSubmit={handleRenameSubmit}
            handleOpenFolder={handleOpenFolder}
            createNewBlankTab={createNewBlankTab}
            setShowProjectModal={setShowProjectModal}
            onFileClick={handleFileClick}
            onContextMenu={handleContextMenu}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        )}

        <EditorContainer
          tabs={tabs}
          activeTabId={activeTabId}
          activeTab={activeTab}
          editorRef={editorRef}
          setActiveTabId={setActiveTabId}
          setTabs={setTabs}
          closeAllTabs={closeAllTabs}
        />
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu" 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-item" onClick={() => { handleCopyFile(); setContextMenu(null); }}>
            <Copy size={14} /> Copy
          </div>
          <div className="context-item" onClick={() => { handleCutFile(); setContextMenu(null); }}>
            <Scissors size={14} /> Cut
          </div>
          <div className="context-item" onClick={() => { handlePasteFile(); setContextMenu(null); }}>
            <Clipboard size={14} /> Paste
          </div>
          <div className="context-separator"></div>
          <div className="context-item" onClick={() => { startRename(); setContextMenu(null); }}>
            <Edit3 size={14} /> Rename
          </div>
          <div className="context-item" onClick={() => { handleDeleteItem(contextMenu.file.path); setContextMenu(null); }}>
            <Trash2 size={14} /> Delete
          </div>
          <div className="context-separator"></div>
          <div className="context-item" onClick={() => { handleCheckFile(); setContextMenu(null); }}>
            <Info size={14} /> Properties
          </div>
          <div className="context-item" onClick={() => { handleOpenTerminal(); setContextMenu(null); }}>
            <Terminal size={14} /> Open Terminal Here
          </div>
        </div>
      )}

      <ProjectModal
        showProjectModal={showProjectModal}
        isLoading={isLoading}
        projectType={projectType}
        projectName={projectName}
        setProjectType={setProjectType}
        setProjectName={setProjectName}
        setShowProjectModal={setShowProjectModal}
        handleCreateProject={handleCreateProject}
      />
    </div>
  );
}