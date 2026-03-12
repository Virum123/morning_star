import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { api } from '../utils/api';
import { trackEvent } from '../utils/analytics';
import './Tasks.css';

export default function Tasks() {
  const [fileContents, setFileContents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContent = async () => {
      try {
        const filesData = await api.readAllFiles();
        
        // As requested, only print "today" files to the task view
        const todayFiles = filesData.today || [];

        // Priority logic: "먼저", "1순위", "우선" -> highest
        const sortedFiles = todayFiles.sort((a, b) => {
          const getPriority = (filename) => {
            if (filename.includes("먼저") || filename.includes("1순위") || filename.includes("우선")) {
              return 1; // Highest
            }
            return 0; // Low
          };
          
          const aPri = getPriority(a.filename);
          const bPri = getPriority(b.filename);
          
          return bPri - aPri; // Descending order of priority
        });

        setFileContents(sortedFiles);
      } catch (e) {
        console.error("Failed to load tasks.", e);
      } finally {
        setLoading(false);
      }
    };
    loadContent();
  }, []);

  const handleCheckboxToggle = async (fileIndex, node, isChecked) => {
    const file = fileContents[fileIndex];
    if (!file || !node || !node.position) {
      console.warn("Could not find AST node position to toggle checkbox.");
      return;
    }

    const lineIndex = node.position.start.line - 1;
    let contentLines = file.content.split('\n');
    let targetLine = contentLines[lineIndex];

    if (isChecked) {
      targetLine = targetLine.replace(/-\s*\[\s\]/, "- [x]");
    } else {
      targetLine = targetLine.replace(/-\s*\[[xX]\]/, "- [ ]");
    }

    contentLines[lineIndex] = targetLine;
    const newContent = contentLines.join('\n');

    // Optimistic UI Update
    const newFileContents = [...fileContents];
    newFileContents[fileIndex] = { ...file, content: newContent };
    setFileContents(newFileContents);

    // Persist to backend
    const res = await api.updateFileContent(file.path, newContent);
    if (!res || !res.success) {
      console.error("Failed to update markdown file on backend.");
    } else {
      trackEvent('task_check', { filename: file.filename, checked: isChecked });
    }
  };

  return (
    <div className="tasks-container fade-in">
      <div className="tasks-content-area">
        {loading ? (
          <div className="glass-card skeleton-loader">Loading your tasks...</div>
        ) : fileContents.length === 0 ? (
          <div className="glass-card empty-state" style={{ textAlign: "center", padding: "40px" }}>
            <h2 style={{ fontSize: "1.5rem", marginBottom: "12px", color: "var(--text-primary)" }}>All caught up! 🎉</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem", lineHeight: "1.6" }}>
              There are no tasks pending for today. <br/>
              Take a well-deserved break, or drop some new goals into <b>Tomorrow</b>!
            </p>
          </div>
        ) : (
          fileContents.map((file, idx) => (
            <div className="glass-card markdown-section" key={idx}>
              <div className="section-header">
                <span className="section-filename">{file.filename}</span>
              </div>
              <div className="markdown-body">
                {file.content ? (
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]} 
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      input: ({ node, ...props }) => {
                        if (props.type === "checkbox") {
                          return (
                            <input
                              type="checkbox"
                              checked={props.checked}
                              disabled={false}
                              onChange={(e) => handleCheckboxToggle(idx, node, e.target.checked)}
                              style={{ cursor: "pointer", marginRight: "8px" }}
                            />
                          );
                        }
                        return <input {...props} />;
                      }
                    }}
                  >
                    {file.content}
                  </ReactMarkdown>
                ) : (
                  <em style={{color: 'var(--text-secondary)'}}>Empty file.</em>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
