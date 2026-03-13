import { useState, useEffect } from 'react';
import { Plus, Trash2, CalendarCheck, File as FileIcon, ChevronDown, ChevronUp, PenLine, X, Save } from 'lucide-react';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Files.css';

export default function Files() {
  const [activeTab, setActiveTab] = useState('today');
  const [filesData, setFilesData] = useState({ tomorrow: [], today: [], yesterday: {} });
  const [loading, setLoading] = useState(true);
  
  // For Yesterday accordion
  const [expandedDates, setExpandedDates] = useState({});

  // For In-App Task Writer
  const [isWritingTask, setIsWritingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskContent, setNewTaskContent] = useState('');
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  const loadFiles = async () => {
    setLoading(true);
    const config = await api.getConfig();
    setFilesData(config.files || { tomorrow: [], today: [], yesterday: {} });
    setLoading(false);
  };

  // Allow drops on both 'today' and 'tomorrow' tabs
  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (activeTab !== 'tomorrow' && activeTab !== 'today') return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr = Array.from(e.dataTransfer.files);
      const droppedFiles = [];
      
      for (const file of filesArr) {
        if (file.name.toLowerCase().endsWith('.md')) {
          const content = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (evt) => resolve(evt.target.result);
            reader.readAsText(file);
          });
          droppedFiles.push({ name: file.name, content });
        }
      }
      
      if (droppedFiles.length > 0) {
        const updatedFiles = await api.processDroppedContent(activeTab, droppedFiles);
        if (updatedFiles) {
          setFilesData(updatedFiles);
          trackEvent('file_upload', { method: 'drop', count: droppedFiles.length, target: activeTab });
        }
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (activeTab === 'tomorrow' || activeTab === 'today') setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleAddFile = async () => {
    if (activeTab !== 'tomorrow' && activeTab !== 'today') return;
    const updatedFiles = await api.addFileDialog(activeTab);
    if (updatedFiles) {
      setFilesData(updatedFiles);
      trackEvent('file_upload', { method: 'dialog', target: activeTab });
    }
  };

  const handleRemoveFile = async (target, pathToRemove, dateKey = null) => {
    const updatedFiles = await api.removeFile(target, pathToRemove, dateKey);
    if (updatedFiles) {
      setFilesData(updatedFiles);
    }
  };

  const handleWriteTaskSave = async () => {
    if (!newTaskTitle.trim() || !newTaskContent.trim()) return;
    
    let filename = newTaskTitle.trim();
    if (!filename.toLowerCase().endsWith('.md')) {
      filename += '.md';
    }

    const filesDataArr = [{ name: filename, content: newTaskContent }];
    
    const updatedFiles = await api.processDroppedContent(activeTab, filesDataArr);
    if (updatedFiles) {
      setFilesData(updatedFiles);
      setIsWritingTask(false);
      setNewTaskTitle('');
      setNewTaskContent('');
      trackEvent('task_create_inline', { title: filename, target: activeTab });
    }
  };

  const toggleAccordion = (dateKey) => {
    setExpandedDates(prev => ({
      ...prev,
      [dateKey]: !prev[dateKey]
    }));
  };

  const formatDate = (dateString, isFullTime = true) => {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    if (isFullTime) {
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const renderFileList = (fileArray, target, dateKey = null) => {
    if (!fileArray || fileArray.length === 0) {
      return (
        <div className="empty-state-mini">
          <p>No files.</p>
        </div>
      );
    }

    return (
      <div className="files-grid">
        {fileArray.map((file, idx) => (
          <div className="file-item" key={idx}>
            <div className="file-info">
              <div className="file-date">
                <CalendarCheck size={14} />
                {formatDate(file.added_date)}
              </div>
              <div className="file-name">{file.filename}</div>
            </div>
            <button 
              className="icon-btn remove-btn" 
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveFile(target, file.path, dateKey);
              }}
              title="Remove file"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  // Shared action buttons for Today / Tomorrow tabs
  const renderActionButtons = () => (
    <div style={{display: 'flex', gap: '10px'}}>
      <button className="btn btn-outline-primary" onClick={() => setIsWritingTask(true)}>
        <PenLine size={18} /> Write Task
      </button>
      <button className="btn btn-primary" onClick={handleAddFile}>
        <Plus size={18} /> Add .md File
      </button>
    </div>
  );

  // Shared dropzone area for Today / Tomorrow tabs
  const renderDropzone = (label, sublabel) => (
    <div 
      className={`dropzone-area ${isDragging ? 'dragging' : ''}`}
      onClick={handleAddFile}
    >
      <FileIcon size={24} className="dropzone-icon" />
      <div className="dropzone-text">
        <strong>{label}</strong>
        <span>{sublabel}</span>
      </div>
    </div>
  );

  return (
    <div 
      className="files-container fade-in"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="files-header">
        <div style={{flexGrow: 1}}></div>
        {(activeTab === 'tomorrow' || activeTab === 'today') && renderActionButtons()}
      </div>
      
      <div className="files-tabs-nav">
        <button 
          className={`files-tab-btn ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >Today</button>
        <button 
          className={`files-tab-btn ${activeTab === 'tomorrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('tomorrow')}
        >Tomorrow</button>
        <button 
          className={`files-tab-btn ${activeTab === 'yesterday' ? 'active' : ''}`}
          onClick={() => setActiveTab('yesterday')}
        >Yesterday</button>
      </div>

      <div className="glass-card files-list-card">
        {loading ? (
          <div className="skeleton-loader">Loading...</div>
        ) : (
          <div className="tab-content">
            
            {/* TOMORROW TAB */}
            {activeTab === 'tomorrow' && (
              <div className="tab-pane fade-in">
                <h3 className="pane-title">Tasks for Tomorrow</h3>
                <p className="pane-desc">Files added here will automatically move to 'Today' on the next calendar day.</p>
                {renderDropzone('Drag and drop .md files here', 'Or click to add via file picker')}
                {renderFileList(filesData.tomorrow, 'tomorrow')}
              </div>
            )}

            {/* TODAY TAB */}
            {activeTab === 'today' && (
              <div className="tab-pane fade-in">
                <h3 className="pane-title">Tasks for Today</h3>
                <p className="pane-desc">Current active tasks. You can also add extra files directly to today.</p>
                {renderDropzone('Drag and drop .md files here', 'Or click to add a file directly to Today')}
                {renderFileList(filesData.today, 'today')}
              </div>
            )}

            {/* YESTERDAY TAB */}
            {activeTab === 'yesterday' && (
              <div className="tab-pane fade-in">
                <h3 className="pane-title">Task History</h3>
                <p className="pane-desc">Past tasks organized by date.</p>
                
                {Object.keys(filesData.yesterday || {}).length === 0 ? (
                  <div className="empty-state-mini">No history yet.</div>
                ) : (
                  <div className="accordion-list">
                    {Object.keys(filesData.yesterday).sort((a,b) => b.localeCompare(a)).map(dateKey => (
                      <div className="accordion-item" key={dateKey}>
                        <div 
                          className="accordion-header" 
                          onClick={() => toggleAccordion(dateKey)}
                        >
                          <span className="accordion-title">{dateKey} ({filesData.yesterday[dateKey].length} files)</span>
                          {expandedDates[dateKey] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                        {expandedDates[dateKey] && (
                          <div className="accordion-body">
                            {renderFileList(filesData.yesterday[dateKey], 'yesterday', dateKey)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
          </div>
        )}
      </div>

      {/* Write Task Modal */}
      {isWritingTask && (
        <div className="modal-overlay fade-in" onClick={() => setIsWritingTask(false)}>
          <div className="modal-content glass-card editor-modal" onClick={e => e.stopPropagation()}>
            <button className="icon-btn close-modal-btn" onClick={() => setIsWritingTask(false)}>
              <X size={20} />
            </button>
            <h2 className="modal-title">Write New Task</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Saving to: <strong style={{ color: 'var(--accent-color)' }}>{activeTab === 'today' ? 'Today' : 'Tomorrow'}</strong>
            </p>
            
            <div className="form-group">
              <label>Task Title (Filename)</label>
              <input 
                type="text" 
                className="editor-input" 
                placeholder="e.g. morning_routine.md"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Markdown Content</label>
              <textarea 
                className="editor-textarea" 
                placeholder="- [ ] Write your task here..."
                value={newTaskContent}
                onChange={(e) => setNewTaskContent(e.target.value)}
              ></textarea>
            </div>
            
            <button 
              className="btn btn-primary w-100" 
              style={{marginTop: '10px', width: '100%'}} 
              onClick={handleWriteTaskSave}
              disabled={!newTaskTitle.trim() || !newTaskContent.trim()}
            >
              <Save size={18} /> Save to {activeTab === 'today' ? 'Today' : 'Tomorrow'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
