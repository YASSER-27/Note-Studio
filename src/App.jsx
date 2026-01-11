import React, { useState, useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import {
  FolderOpen, FileCode, X, Minimize2, Square, Save,
  ChevronRight, Code, FilePlus, Zap, ChevronDown, FolderPlus, Trash2
} from 'lucide-react';
import './App.css';

const { ipcRenderer } = window.require('electron');
loader.config({ monaco });

export default function App() {
  const [files, setFiles] = useState([]);
  const [currentFolderPath, setCurrentFolderPath] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [selectedPath, setSelectedPath] = useState(null); // للملف المختار حالياً
  
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const editorRef = useRef(null);
  const fileNameInputRef = useRef(null);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  const selectedPathRef = useRef(selectedPath); // مرجع للملف المختار للحذف

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

  // --- دوال الحذف الجديدة ---

  const handleDeleteItem = async (targetPath) => {
    if (!targetPath) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete: ${targetPath.split(/[\\/]/).pop()}?`);
    if (!confirmDelete) return;

    const res = await ipcRenderer.invoke('delete-item', targetPath);
    if (res.success) {
      // إغلاق التابة إذا كان الملف المفتوح هو المحذوف
      setTabs(prev => prev.filter(t => t.path !== targetPath));
      if (activeTab?.path === targetPath) setActiveTabId(null);
      
      // تحديث شجرة الملفات
      refreshFileTree();
      setSelectedPath(null);
    } else {
      alert("Error deleting file: " + res.error);
    }
  };

  const refreshFileTree = async () => {
  if (currentFolderPath) {
    // نستخدم الـ Handler المخصص لقراءة محتويات مجلد معين
    const folderRes = await ipcRenderer.invoke('open-folder-at-path', currentFolderPath);
    if (folderRes && folderRes.files) {
      setFiles(folderRes.files);
    }
  }
};

  // الاستماع لزر Delete في الكيبورد
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Delete' && selectedPathRef.current) {
        handleDeleteItem(selectedPathRef.current);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // --- دوال التحكم في الملفات والمجلدات ---

  const handleCreateFileSubmit = async (e) => {
  if (e) e.preventDefault();
  if (!newFileName || !currentFolderPath) return;

  // تأكد من صياغة المسار بشكل صحيح حسب نظام التشغيل
  const fullPath = `${currentFolderPath}/${newFileName}`;
  
  const res = await ipcRenderer.invoke('save-file', { filePath: fullPath, content: '' });
  
  if (res.success) {
    setIsCreatingFile(false);
    setNewFileName('');
    // أهم خطوة: انتظر تحديث القائمة قبل المتابعة
    await refreshFileTree(); 
    // افتح الملف الجديد في تابة
    openFileInTab(newFileName, fullPath, '');
  }
};

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
    setSelectedPath(file.path); // تحديد الملف عند النقر (للحذف)
    if (file.isDirectory) {
      setExpandedFolders(prev => ({ ...prev, [file.path]: !prev[file.path] }));
      return;
    }
    const res = await ipcRenderer.invoke('read-file', file.path);
    if (res.success) openFileInTab(file.name, file.path, res.content);
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
    const map = { js: 'javascript', py: 'python', html: 'html', css: 'css', ts: 'typescript', json: 'json', md: 'markdown' };
    return map[ext] || 'plaintext';
  };

  const switchTab = (direction) => {
    if (tabs.length < 2) return;
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    let newIndex = (currentIndex + direction + tabs.length) % tabs.length;
    setActiveTabId(tabs[newIndex].id);
  };

  const wrapSelection = (startWrapper, endWrapper = startWrapper) => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    if (selection.isEmpty()) return;
    const model = editor.getModel();
    const selectedText = model.getValueInRange(selection);
    const newText = `${startWrapper}${selectedText}${endWrapper}`;
    editor.executeEdits('', [{ range: selection, text: newText, forceMoveMarkers: true }]);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, modified: true } : t));
  };

  const closeAllTabs = () => {
    if (window.confirm("Close all tabs?")) { setTabs([]); setActiveTabId(null); }
  };

  // --- إدارة أحداث Electron (IPC) ---

  // --- إدارة أحداث Electron (IPC) ---
  useEffect(() => {
    // المستمع الخاص باختصار Alt+C لإنشاء ملف جديد
    const handleShortcutNewFile = () => {
      if (!currentFolderPath) {
        alert("Please open a project folder first!");
        return;
      }
      setIsCreatingFile(true);
      // تأخير بسيط لضمان ظهور العنصر في الـ DOM قبل عمل Focus
      setTimeout(() => fileNameInputRef.current?.focus(), 50);
    };

    ipcRenderer.on('new-file-trigger', handleShortcutNewFile);
    ipcRenderer.on('new-blank-tab', createNewBlankTab);
    ipcRenderer.on('save-trigger', handleSave);
    ipcRenderer.on('folder-opened', (event, data) => {
      setFiles(data.files);
      setCurrentFolderPath(data.path);
    });
    ipcRenderer.on('find-trigger', () => {
      if (editorRef.current) editorRef.current.getAction('actions.find').run();
    });
    ipcRenderer.on('replace-trigger', () => {
      if (editorRef.current) editorRef.current.getAction('editor.action.startFindReplaceAction').run();
    });
    ipcRenderer.on('bold-trigger', () => {
      if (activeTab && ['markdown', 'plaintext'].includes(activeTab.language)) wrapSelection('**');
    });
    ipcRenderer.on('italic-trigger', () => {
      if (activeTab && ['markdown', 'plaintext'].includes(activeTab.language)) wrapSelection('*');
    });
    ipcRenderer.on('underline-trigger', () => {
      if (activeTab && ['markdown', 'plaintext'].includes(activeTab.language)) wrapSelection('<u>', '</u>');
    });
    ipcRenderer.on('save-as-trigger', handleSaveAs);
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
    ipcRenderer.on('new-tab', createNewBlankTab);
    ipcRenderer.on('next-tab', () => switchTab(1));
    ipcRenderer.on('prev-tab', () => switchTab(-1));

    return () => {
      ipcRenderer.removeListener('new-file-trigger', handleShortcutNewFile);
      ipcRenderer.removeAllListeners('new-blank-tab');
      ipcRenderer.removeAllListeners('save-trigger');
      ipcRenderer.removeAllListeners('folder-opened');
      ipcRenderer.removeAllListeners('find-trigger');
      ipcRenderer.removeAllListeners('replace-trigger');
      ipcRenderer.removeAllListeners('bold-trigger');
      ipcRenderer.removeAllListeners('italic-trigger');
      ipcRenderer.removeAllListeners('underline-trigger');
      ipcRenderer.removeAllListeners('save-as-trigger');
      ipcRenderer.removeAllListeners('close-tab');
      ipcRenderer.removeAllListeners('new-tab');
      ipcRenderer.removeAllListeners('next-tab');
      ipcRenderer.removeAllListeners('prev-tab');
    };
  }, [activeTabId, tabs.length, currentFolderPath]); // أضفنا currentFolderPath هنا لضمان تحديث الوظيفة

  const FileTree = ({ items }) => (
    <div className="tree-container">
      {items.map((item, i) => (
        <div key={i}>
          <div 
            className={`tree-item ${activeTab?.path === item.path ? 'active' : ''} ${selectedPath === item.path ? 'selected-for-delete' : ''}`} 
            onClick={() => handleFileClick(item)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {item.isDirectory ? (expandedFolders[item.path] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>) : <FileCode size={14} color="#888"/>}
                <span>{item.name}</span>
            </div>
            {selectedPath === item.path && <Trash2 size={12} color="#ff5f56" onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.path); }} />}
          </div>
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
    <div className="app-main">
      <div className="custom-title-bar">
        <div className="brand-zone">
          <Zap size={16} fill="#888" /> <span>NoteAI Studio</span>
        </div>
        <div className="window-actions">
          <button onClick={() => ipcRenderer.send('minimize-window')}><Minimize2 size={14}/></button>
          <button onClick={() => ipcRenderer.send('maximize-window')}><Square size={14}/></button>
          <button className="close-btn" onClick={() => ipcRenderer.send('close-window')}><X size={14}/></button>
        </div>
      </div>

      <div className="content-wrapper">
        <aside className="app-sidebar">
          <div className="sidebar-header">
            <span>EXPLORER</span>
            <div className="header-icons">
               <FilePlus size={16} title="New Tab" onClick={createNewBlankTab} />
               <FolderPlus size={16} title="New File" onClick={() => {
                 if(!currentFolderPath) return alert("Open a folder first!");
                 setIsCreatingFile(true);
                 setTimeout(() => fileNameInputRef.current?.focus(), 50);
               }} />
               <FolderOpen size={16} title="Open Folder" onClick={handleOpenFolder} />
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
  // لا يغلق إلا إذا كان فارغاً، أو عند الضغط على Escape (اختياري)
  onBlur={() => { if(!newFileName) setIsCreatingFile(false); }}
  onKeyDown={(e) => { if(e.key === 'Escape') setIsCreatingFile(false); }}
  placeholder="filename.js"
  className="new-file-input"
/>
                </form>
              </div>
            )}
            {files.length > 0 ? <FileTree items={files} /> : (
              <div className="no-folder-ui">
                <button className="gray-btn" onClick={handleOpenFolder}>Open Project</button>
              </div>
            )}
          </div>
        </aside>

        <main className="editor-container">
          <div className="tabs-header">
            <div className="tabs-wrapper-scroll">
              {tabs.map(tab => (
                <div key={tab.id} className={`tab-pill ${activeTabId === tab.id ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
                  <span className="tab-title">{tab.name}{tab.modified && '*'}</span>
                  <X size={12} className="tab-close" onClick={(e) => { 
                    e.stopPropagation(); 
                    setTabs(prev => prev.filter(t => t.id !== tab.id)); 
                    if (activeTabId === tab.id) setActiveTabId(null);
                  }} />
                </div>
              ))}
            </div>
            {tabs.length > 0 && (
              <div className="tabs-actions">
                <button className="close-all-btn" onClick={closeAllTabs} title="Close All Tabs"><Trash2 size={14} /></button>
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
                onChange={(val) => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: val, modified: true } : t))}
                onMount={(editor) => { editorRef.current = editor; }}
                options={{ fontSize: 15, automaticLayout: true, minimap: { enabled: true }, wordWrap: "on", scrollBeyondLastLine: false }}
              />
            ) : (
              <div className="welcome-screen">
                <Code size={80} color="#333" />
                <div className="shortcut-list">
                   <div className="s-item"><span>Ctrl + N</span> New Scratchpad</div>
                   <div className="s-item"><span>Ctrl + O</span> Open Project</div>
                   <div className="s-item"><span>Ctrl + S</span> Save File</div>
                   <div className="s-item"><span>Ctrl + W</span> Close Tab</div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}