/**
 * Ralph Web UI - Client Application
 */

// State
let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 2000;

const state = {
  frontend: {
    events: [],
    iteration: 0,
    status: 'idle'
  },
  backend: {
    events: [],
    iteration: 0,
    status: 'idle'
  }
};

// DOM Elements
const elements = {
  wsStatus: document.getElementById('ws-status'),
  frontendStream: document.getElementById('frontend-stream'),
  backendStream: document.getElementById('backend-stream'),
  frontendStatus: document.getElementById('frontend-status'),
  backendStatus: document.getElementById('backend-status'),
  frontendIteration: document.getElementById('frontend-iteration'),
  backendIteration: document.getElementById('backend-iteration'),
  frontendAutoscroll: document.getElementById('frontend-autoscroll'),
  backendAutoscroll: document.getElementById('backend-autoscroll'),
  artifactModal: document.getElementById('artifact-modal'),
  artifactTitle: document.getElementById('artifact-title'),
  artifactContent: document.getElementById('artifact-content'),
  specsList: document.getElementById('specs-list')
};

// WebSocket Connection
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0;
    updateConnectionStatus('connected', 'Connected');
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    updateConnectionStatus('disconnected', 'Disconnected');
    attemptReconnect();
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateConnectionStatus('disconnected', 'Error');
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  };
}

function attemptReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    updateConnectionStatus('disconnected', `Reconnecting (${reconnectAttempts})...`);
    setTimeout(connectWebSocket, reconnectDelay);
  } else {
    updateConnectionStatus('disconnected', 'Failed to connect');
  }
}

function updateConnectionStatus(status, text) {
  elements.wsStatus.className = `status-indicator ${status}`;
  elements.wsStatus.textContent = text;
}

// Message Handlers
function handleWebSocketMessage(message) {
  const { event, data, timestamp } = message;
  
  switch (event) {
    case 'state':
      handleStateUpdate(data);
      break;
    case 'log_update':
      handleLogUpdate(data);
      break;
    default:
      console.log('Unknown event:', event, data);
  }
}

function handleStateUpdate(data) {
  const loop = data.loop;
  if (!loop || (loop !== 'frontend' && loop !== 'backend')) return;
  
  state[loop].status = data.status;
  state[loop].iteration = data.iteration || 0;
  
  // Update status badge
  const statusEl = loop === 'frontend' ? elements.frontendStatus : elements.backendStatus;
  statusEl.textContent = formatStatus(data.status);
  statusEl.className = `loop-status ${getStatusClass(data.status)}`;
  
  // Add iteration to dropdown if new
  const iterSelect = loop === 'frontend' ? elements.frontendIteration : elements.backendIteration;
  if (data.iteration > 0) {
    const optionExists = Array.from(iterSelect.options).some(opt => opt.value === String(data.iteration));
    if (!optionExists) {
      const option = document.createElement('option');
      option.value = data.iteration;
      option.textContent = `Iteration ${data.iteration}`;
      iterSelect.insertBefore(option, iterSelect.options[1]);
    }
  }
}

function handleLogUpdate(data) {
  const { loop, events } = data;
  if (!loop || !events) return;
  
  const streamEl = loop === 'frontend' ? elements.frontendStream : elements.backendStream;
  const autoscrollEl = loop === 'frontend' ? elements.frontendAutoscroll : elements.backendAutoscroll;
  
  // Clear placeholder if present
  const placeholder = streamEl.querySelector('.stream-placeholder');
  if (placeholder) {
    streamEl.innerHTML = '';
  }
  
  // Render events
  events.forEach(event => {
    const eventEl = renderEvent(event);
    if (eventEl) {
      streamEl.appendChild(eventEl);
    }
  });
  
  // Auto-scroll
  if (autoscrollEl.checked) {
    streamEl.scrollTop = streamEl.scrollHeight;
  }
}

// Event Rendering
function renderEvent(event) {
  const div = document.createElement('div');
  div.className = 'stream-event';
  
  if (event.type === 'raw') {
    div.innerHTML = `<div class="event-content">${escapeHtml(event.content)}</div>`;
    return div;
  }
  
  const icon = getEventIcon(event.type);
  const typeLabel = formatEventType(event.type);
  const time = event.timestamp ? formatTime(event.timestamp) : '';
  
  let content = '';
  let contentClass = '';
  
  switch (event.type) {
    case 'tool_call':
      contentClass = 'tool-call';
      content = formatToolCall(event);
      break;
    case 'tool_result':
      contentClass = 'tool-result';
      content = formatToolResult(event);
      break;
    case 'message':
      contentClass = 'message';
      content = event.text || '';
      break;
    case 'system':
      contentClass = 'message';
      content = `Session: ${event.session_id || 'N/A'}`;
      break;
    case 'completion':
      contentClass = 'message';
      content = event.finalText || '';
      break;
    default:
      content = JSON.stringify(event, null, 2);
  }
  
  div.innerHTML = `
    <div class="event-header">
      ${icon}
      <span class="event-type">${typeLabel}</span>
      <span class="event-time">${time}</span>
    </div>
    <div class="event-content ${contentClass}">${escapeHtml(content)}</div>
  `;
  
  return div;
}

function getEventIcon(type) {
  const icons = {
    tool_call: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    tool_result: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    message: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    system: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    completion: '<svg class="event-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
  };
  return icons[type] || icons.message;
}

function formatEventType(type) {
  const labels = {
    tool_call: 'Tool Call',
    tool_result: 'Result',
    message: 'Message',
    system: 'System',
    completion: 'Complete'
  };
  return labels[type] || type;
}

function formatToolCall(event) {
  const tool = event.toolName || event.toolId || 'Unknown';
  const params = event.parameters || {};
  
  let summary = tool;
  if (params.command) {
    summary += `: ${params.command}`;
  } else if (params.file_path) {
    summary += `: ${params.file_path}`;
  } else if (params.pattern) {
    summary += `: "${params.pattern}"`;
  }
  
  return summary;
}

function formatToolResult(event) {
  const value = event.value || event.result || '';
  if (typeof value === 'string') {
    return value.slice(0, 500) + (value.length > 500 ? '...' : '');
  }
  return JSON.stringify(value, null, 2).slice(0, 500);
}

function formatStatus(status) {
  const labels = {
    idle: 'Idle',
    starting: 'Starting',
    running: 'Running',
    iteration_complete: 'Iteration Done',
    completed: 'Completed',
    error: 'Error',
    stopped: 'Stopped',
    finished: 'Finished'
  };
  return labels[status] || status;
}

function getStatusClass(status) {
  if (['running', 'starting'].includes(status)) return 'running';
  if (['error'].includes(status)) return 'error';
  if (['completed', 'finished'].includes(status)) return 'completed';
  return '';
}

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  } catch {
    return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Artifact Modal
async function loadArtifact(loop, file) {
  try {
    const response = await fetch(`/api/artifacts/${loop}/${file}`);
    if (!response.ok) throw new Error('Failed to load artifact');
    
    const data = await response.json();
    
    const titles = {
      'plan': 'Implementation Plan',
      'agents': 'AGENTS.md',
      'prompt-plan': 'Planning Prompt',
      'prompt-build': 'Building Prompt'
    };
    
    elements.artifactTitle.textContent = `${loop.charAt(0).toUpperCase() + loop.slice(1)} - ${titles[file] || file}`;
    elements.artifactContent.textContent = data.content;
    elements.artifactModal.hidden = false;
  } catch (err) {
    console.error('Failed to load artifact:', err);
    alert('Failed to load artifact');
  }
}

function closeArtifactModal() {
  elements.artifactModal.hidden = true;
}

// Load iteration logs
async function loadIteration(loop, iteration) {
  if (!iteration) {
    // Switch back to live stream - clear and wait for new events
    return;
  }
  
  try {
    const response = await fetch(`/api/logs/${loop}/${iteration}`);
    if (!response.ok) throw new Error('Failed to load iteration');
    
    const data = await response.json();
    const streamEl = loop === 'frontend' ? elements.frontendStream : elements.backendStream;
    
    streamEl.innerHTML = '';
    
    // Add iteration header
    const header = document.createElement('div');
    header.className = 'iteration-divider';
    header.textContent = `Iteration ${iteration}`;
    streamEl.appendChild(header);
    
    // Parse and render log content
    const lines = data.content.split('\n').filter(l => l.trim());
    lines.forEach(line => {
      try {
        const event = JSON.parse(line);
        const eventEl = renderEvent(event);
        if (eventEl) streamEl.appendChild(eventEl);
      } catch {
        const eventEl = renderEvent({ type: 'raw', content: line });
        if (eventEl) streamEl.appendChild(eventEl);
      }
    });
  } catch (err) {
    console.error('Failed to load iteration:', err);
  }
}

// Load specs list
async function loadSpecs() {
  try {
    const response = await fetch('/api/artifacts');
    if (!response.ok) throw new Error('Failed to load artifacts');
    
    const data = await response.json();
    
    if (data.specs && data.specs.length > 0) {
      elements.specsList.innerHTML = data.specs.map(spec => `
        <li><a href="#" onclick="loadArtifact('specs', '${spec}')">${spec}</a></li>
      `).join('');
    } else {
      elements.specsList.innerHTML = '<li class="loading">No specs found</li>';
    }
  } catch (err) {
    console.error('Failed to load specs:', err);
    elements.specsList.innerHTML = '<li class="loading">Failed to load</li>';
  }
}

// Initialize
function init() {
  connectWebSocket();
  loadSpecs();
  
  // Load initial state
  ['frontend', 'backend'].forEach(loop => {
    fetch(`/api/state/${loop}`)
      .then(res => res.json())
      .then(data => handleStateUpdate(data))
      .catch(() => {});
  });
  
  // Load iteration lists
  ['frontend', 'backend'].forEach(async loop => {
    try {
      const response = await fetch(`/api/logs/${loop}`);
      if (response.ok) {
        const data = await response.json();
        const select = loop === 'frontend' ? elements.frontendIteration : elements.backendIteration;
        
        data.logs.forEach(log => {
          const match = log.name.match(/iteration-(\d+)\.log/);
          if (match) {
            const option = document.createElement('option');
            option.value = match[1];
            option.textContent = `Iteration ${match[1]}`;
            select.appendChild(option);
          }
        });
      }
    } catch {}
  });
}

// Start
document.addEventListener('DOMContentLoaded', init);

// Close modals on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!elements.artifactModal.hidden) {
      closeArtifactModal();
    }
  }
});

// Close artifact modal on backdrop click
elements.artifactModal.addEventListener('click', (e) => {
  if (e.target === elements.artifactModal) {
    closeArtifactModal();
  }
});

// Expose functions to window for onclick handlers
window.loadArtifact = loadArtifact;
window.closeArtifactModal = closeArtifactModal;
window.loadIteration = loadIteration;
