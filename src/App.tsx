import { useState, useCallback, DragEvent } from 'react';
import { Viewer3D } from './components/Viewer3D';
import { Timeline, Session } from './components/Timeline';
import { StatsPanel } from './components/StatsPanel';

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [networkPayloadMB, setNetworkPayloadMB] = useState(0);
  const [activeMemoryMB, setActiveMemoryMB] = useState(0);
  const [activeSplatsCount, setActiveSplatsCount] = useState(0);

  const handleStatsUpdate = useCallback((payloadMB: number, memoryMB: number, splatsCount: number) => {
    setNetworkPayloadMB(payloadMB);
    setActiveMemoryMB(memoryMB);
    setActiveSplatsCount(splatsCount);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const splatFiles = files.filter(f => f.name.endsWith('.splat') || f.name.endsWith('.ply'));

    if (splatFiles.length > 0) {
      const newSessions = splatFiles.map(file => ({
        id: `session-${Date.now()}-${file.name}`,
        date: file.name,
        url: URL.createObjectURL(file)
      }));

      setSessions(prev => {
        const updated = [...prev, ...newSessions];
        if (!activeSessionId && updated.length > 0) {
          setActiveSessionId(updated[0].id);
        }
        return updated;
      });
    }
  }, [activeSessionId]);

  const sessionUrls = sessions.reduce((acc, session) => {
    acc[session.id] = session.url;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div 
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="ui-panel">
        <h1 className="ui-title">4D Site Viewer</h1>
        <p className="ui-desc">
          Interactive prototype for visualizing a construction site over time using Gaussian Splatting.
        </p>
        <p className="ui-desc" style={{ marginTop: '8px', color: 'var(--accent-color)' }}>
          Left Click: Rotate <br />
          Right Click: Pan <br />
          Scroll: Zoom
        </p>
      </div>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-content">
            Drop .splat or .ply files here
          </div>
        </div>
      )}

      {sessions.length === 0 && !isDragging && (
        <div className="empty-state">
          <h2>No sessions loaded</h2>
          <p>Drag and drop .splat or .ply files anywhere on the screen to add them to the timeline.</p>
        </div>
      )}

      <StatsPanel 
        networkPayloadMB={networkPayloadMB} 
        activeMemoryMB={activeMemoryMB} 
        activeSplatsCount={activeSplatsCount} 
      />

      <Viewer3D 
        sessionUrls={sessionUrls} 
        activeSessionId={activeSessionId} 
        onStatsUpdate={handleStatsUpdate}
      />
      
      <Timeline 
        sessions={sessions} 
        activeSessionId={activeSessionId} 
        onSessionSelect={setActiveSessionId} 
      />
    </div>
  );
}

export default App;
