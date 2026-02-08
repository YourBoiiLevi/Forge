import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { watch } from 'chokidar';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = join(__dirname, '../..');

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Broadcast to all connected WebSocket clients
function broadcast(event: string, data: any) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Read file safely
function readFileSafe(filePath: string): string | null {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return null;
}

// API: List artifacts
app.get('/api/artifacts', (_req: Request, res: Response) => {
  const artifacts = {
    frontend: {
      plan: existsSync(join(__dirname, '../frontend/IMPLEMENTATION_PLAN.md')),
      agents: existsSync(join(__dirname, '../frontend/AGENTS.md')),
      promptPlan: existsSync(join(__dirname, '../frontend/PROMPT_plan.md')),
      promptBuild: existsSync(join(__dirname, '../frontend/PROMPT_build.md'))
    },
    backend: {
      plan: existsSync(join(__dirname, '../backend/IMPLEMENTATION_PLAN.md')),
      agents: existsSync(join(__dirname, '../backend/AGENTS.md')),
      promptPlan: existsSync(join(__dirname, '../backend/PROMPT_plan.md')),
      promptBuild: existsSync(join(__dirname, '../backend/PROMPT_build.md'))
    },
    specs: [] as string[]
  };

  // List spec files
  const specsDir = join(PROJECT_ROOT, 'specs');
  if (existsSync(specsDir)) {
    try {
      artifacts.specs = readdirSync(specsDir)
        .filter(f => f.endsWith('.md'))
        .sort();
    } catch (err) {
      console.error('Error reading specs directory:', err);
    }
  }

  res.json(artifacts);
});

// API: Get specific artifact
app.get('/api/artifacts/:loop/:file', (req: Request, res: Response) => {
  const { loop, file } = req.params;
  
  const fileMap: Record<string, string> = {
    'plan': 'IMPLEMENTATION_PLAN.md',
    'agents': 'AGENTS.md',
    'prompt-plan': 'PROMPT_plan.md',
    'prompt-build': 'PROMPT_build.md'
  };

  let filePath: string;
  
  if (loop === 'specs') {
    filePath = join(PROJECT_ROOT, 'specs', file);
  } else if (loop === 'frontend' || loop === 'backend') {
    const fileName = fileMap[file] || file;
    filePath = join(__dirname, '..', loop, fileName);
  } else {
    return res.status(400).json({ error: 'Invalid loop' });
  }

  const content = readFileSafe(filePath);
  if (content === null) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.json({ content, path: filePath });
});

// API: Get log list
app.get('/api/logs/:loop', (req: Request, res: Response) => {
  const { loop } = req.params;
  
  if (loop !== 'frontend' && loop !== 'backend') {
    return res.status(400).json({ error: 'Invalid loop' });
  }

  const logDir = join(__dirname, '../logs', loop);
  
  if (!existsSync(logDir)) {
    return res.json({ logs: [] });
  }

  try {
    const logs = readdirSync(logDir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const fullPath = join(logDir, f);
        const stats = statSync(fullPath);
        return {
          name: f,
          size: stats.size,
          modified: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    
    res.json({ logs });
  } catch (err) {
    console.error('Error reading log directory:', err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// API: Get specific log
app.get('/api/logs/:loop/:iteration', (req: Request, res: Response) => {
  const { loop, iteration } = req.params;
  
  if (loop !== 'frontend' && loop !== 'backend') {
    return res.status(400).json({ error: 'Invalid loop' });
  }

  const logPath = join(__dirname, '../logs', loop, `iteration-${iteration}.log`);
  const content = readFileSafe(logPath);
  
  if (content === null) {
    return res.status(404).json({ error: 'Log not found' });
  }

  res.json({ content });
});

// API: Get loop states
app.get('/api/state/:loop', (req: Request, res: Response) => {
  const { loop } = req.params;
  
  if (loop !== 'frontend' && loop !== 'backend') {
    return res.status(400).json({ error: 'Invalid loop' });
  }

  const statePath = join(__dirname, 'state', `${loop}-state.json`);
  const content = readFileSafe(statePath);
  
  if (content === null) {
    return res.json({ loop, status: 'unknown', message: 'No state file' });
  }

  try {
    res.json(JSON.parse(content));
  } catch {
    res.json({ loop, status: 'error', message: 'Invalid state file' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected');

  // Send current state on connection
  ['frontend', 'backend'].forEach(loop => {
    const statePath = join(__dirname, 'state', `${loop}-state.json`);
    const content = readFileSafe(statePath);
    if (content) {
      try {
        ws.send(JSON.stringify({
          event: 'state',
          data: JSON.parse(content),
          timestamp: new Date().toISOString()
        }));
      } catch {}
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// File watchers for state files
const stateDir = join(__dirname, 'state');
const logsDir = join(__dirname, '../logs');

// Watch state files
const stateWatcher = watch(join(stateDir, '*.json'), {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 100 }
});

stateWatcher.on('change', (filePath) => {
  const content = readFileSafe(filePath);
  if (content) {
    try {
      const state = JSON.parse(content);
      broadcast('state', state);
    } catch {}
  }
});

// Watch log directories for new content
const frontendLogWatcher = watch(join(logsDir, 'frontend', '*.log'), {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500 }
});

const backendLogWatcher = watch(join(logsDir, 'backend', '*.log'), {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500 }
});

function handleLogChange(filePath: string, loop: string) {
  const content = readFileSafe(filePath);
  if (content) {
    // Parse stream-json events if possible
    const lines = content.split('\n').filter(l => l.trim());
    const events = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'raw', content: line };
      }
    });

    broadcast('log_update', {
      loop,
      file: filePath.split(/[/\\]/).pop(),
      events: events.slice(-50) // Last 50 events
    });
  }
}

frontendLogWatcher.on('change', (path) => handleLogChange(path, 'frontend'));
frontendLogWatcher.on('add', (path) => handleLogChange(path, 'frontend'));

backendLogWatcher.on('change', (path) => handleLogChange(path, 'backend'));
backendLogWatcher.on('add', (path) => handleLogChange(path, 'backend'));

// Initialize state files if they don't exist
['frontend-state.json', 'backend-state.json'].forEach(file => {
  const path = join(stateDir, file);
  if (!existsSync(path)) {
    const loop = file.replace('-state.json', '');
    writeFileSync(path, JSON.stringify({
      loop,
      status: 'idle',
      message: 'Loop not started',
      timestamp: new Date().toISOString()
    }, null, 2));
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           Ralph Web UI Server                        ║
╠══════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                    ║
║  WebSocket: ws://localhost:${PORT}                      ║
╚══════════════════════════════════════════════════════╝

Watching:
  - State files: ${stateDir}
  - Logs: ${logsDir}

Press Ctrl+C to stop.
  `);
});
