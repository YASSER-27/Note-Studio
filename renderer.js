const { ipcRenderer } = require('electron');
let editor;
let currentPath = "";

// تهيئة محرك VS Code (Monaco)
require.config({ paths: { 'vs': 'node_modules/monaco-editor/min/vs' }});
require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('monaco-container'), {
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: true }
    });
    
    // دعم اختصارات Ctrl+S, Ctrl+Z, Ctrl+A تلقائياً داخل Monaco
});

// فتح مشروع ومزامنة كل شيء
async function openProject() {
    const data = await ipcRenderer.invoke('open-folder');
    if(data) {
        currentPath = data.folderPath;
        const list = document.getElementById('file-tree');
        list.innerHTML = data.files.map(f => `<li onclick="openFile('${f}')">📄 ${f}</li>`).join('');
        // التيرمينال الآن أصبح جاهزاً في مسار المجلد تلقائياً
    }
}

async function openFile(name) {
    const fullPath = `${currentPath}/${name}`;
    const content = await ipcRenderer.invoke('read-file', fullPath);
    editor.setValue(content);
    document.getElementById('active-file-name').innerText = name;
    
    // تلوين الكود تلقائياً بناءً على الصيغة
    const ext = name.split('.').pop();
    monaco.editor.setModelLanguage(editor.getModel(), getLang(ext));
}

function getLang(ext) {
    const map = { 'js': 'javascript', 'py': 'python', 'html': 'html', 'css': 'css', 'json': 'json' };
    return map[ext] || 'plaintext';
}