import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Tasks.css';

export default function Tasks() {
  const [fileContents, setFileContents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load today's tasks on mount (parent passes a new `key` on each tab visit → forces remount → fresh data)
  useEffect(() => {
    const loadContent = async () => {
      try {
        const filesData = await api.readAllFiles();
        const todayFiles = filesData.today || [];

        // Priority sort: "먼저" / "1순위" / "우선" → top
        const sortedFiles = [...todayFiles].sort((a, b) => {
          const pri = (n) => (n.includes('먼저') || n.includes('1순위') || n.includes('우선') ? 1 : 0);
          return pri(b.filename) - pri(a.filename);
        });

        setFileContents(sortedFiles);
      } catch (e) {
        console.error('Failed to load tasks.', e);
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, []);

  // Toggle a single checkbox line by line index within the markdown text
  const toggleLineByIndex = useCallback(async (fileIndex, lineIndex, currentChecked) => {
    const file = fileContents[fileIndex];
    if (!file) return;

    const contentLines = file.content.split('\n');
    let targetLine = contentLines[lineIndex];

    if (!currentChecked) {
      // Mark as checked
      targetLine = targetLine.replace(/^(\s*)-\s*\[\s\]/, '$1- [x]');
    } else {
      // Mark as unchecked
      targetLine = targetLine.replace(/^(\s*)-\s*\[[xX]\]/, '$1- [ ]');
    }

    contentLines[lineIndex] = targetLine;
    const newContent = contentLines.join('\n');

    // Optimistic update
    const updated = [...fileContents];
    updated[fileIndex] = { ...file, content: newContent };
    setFileContents(updated);

    // Persist — write to disk via backend
    const res = await api.updateFileContent(file.path, newContent);
    if (!res || !res.success) {
      console.error('Failed to persist checkbox state.');
      // Roll back optimistic update
      setFileContents(fileContents);
    } else {
      trackEvent('task_check', { filename: file.filename, checked: !currentChecked });
    }
  }, [fileContents]);

  // Handler for the ReactMarkdown `input[type=checkbox]` renderer — uses AST node position
  const handleCheckboxToggle = useCallback(async (fileIndex, node, isChecked) => {
    if (!node || !node.position) return;
    const lineIndex = node.position.start.line - 1;
    const file = fileContents[fileIndex];
    if (!file) return;
    const currentChecked = !isChecked; // onChange gives us the NEW state; we need the OLD
    await toggleLineByIndex(fileIndex, lineIndex, currentChecked);
  }, [fileContents, toggleLineByIndex]);

  // Render a single checklist item row — clicking anywhere on the row toggles
  const renderListItem = (fileIndex, content, lineIndex, isChecked) => (
    <li
      key={lineIndex}
      className={`task-row ${isChecked ? 'task-checked' : ''}`}
      onClick={() => toggleLineByIndex(fileIndex, lineIndex, isChecked)}
      style={{ cursor: 'pointer' }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        readOnly
        onClick={(e) => e.stopPropagation()} // prevent double-toggle
        style={{ cursor: 'pointer', marginRight: '8px', flexShrink: 0 }}
      />
      <span>{content}</span>
    </li>
  );

  // Parse markdown text into checklist rows for custom rendering
  const parseAndRenderFile = (file, fileIndex) => {
    const lines = file.content.split('\n');
    const rows = [];

    lines.forEach((line, lineIndex) => {
      const uncheckedMatch = line.match(/^(\s*)-\s*\[\s\]\s*(.*)/);
      const checkedMatch   = line.match(/^(\s*)-\s*\[[xX]\]\s*(.*)/);

      if (uncheckedMatch) {
        rows.push(renderListItem(fileIndex, uncheckedMatch[2], lineIndex, false));
      } else if (checkedMatch) {
        rows.push(renderListItem(fileIndex, checkedMatch[2], lineIndex, true));
      }
    });

    return rows;
  };

  return (
    <div className="tasks-container fade-in">
      <div className="tasks-content-area">
        {loading ? (
          <div className="glass-card skeleton-loader">Loading your tasks...</div>
        ) : fileContents.length === 0 ? (
          <div className="glass-card empty-state" style={{ textAlign: 'center', padding: '40px' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '12px', color: 'var(--text-primary)' }}>All caught up! 🎉</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: '1.6' }}>
              There are no tasks pending for today. <br />
              Take a well-deserved break, or drop some new goals into <b>Tomorrow</b>!
            </p>
          </div>
        ) : (
          fileContents.map((file, idx) => {
            const rows = parseAndRenderFile(file, idx);
            return (
              <div className="glass-card markdown-section" key={idx}>
                <div className="section-header">
                  <span className="section-filename">{file.filename}</span>
                </div>
                {rows.length > 0 ? (
                  <ul className="task-list">{rows}</ul>
                ) : (
                  // Fallback: non-checklist markdown rendered normally
                  <div className="markdown-body">
                    {file.content ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeRaw]}
                        components={{
                          input: ({ node, ...props }) => {
                            if (props.type === 'checkbox') {
                              return (
                                <input
                                  type="checkbox"
                                  checked={props.checked}
                                  onChange={(e) => handleCheckboxToggle(idx, node, e.target.checked)}
                                  style={{ cursor: 'pointer', marginRight: '8px' }}
                                />
                              );
                            }
                            return <input {...props} />;
                          },
                        }}
                      >
                        {file.content}
                      </ReactMarkdown>
                    ) : (
                      <em style={{ color: 'var(--text-secondary)' }}>Empty file.</em>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
