import { Link, useLocation } from 'react-router-dom';
// import { PauseCircle, PlayCircle, Activity, GitBranch, Box, FileText, Database, ShieldAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { StatusLED } from './ui/StatusLED';
import { useState, useEffect } from 'react';

// Temporary mock icons to debug rendering issue
const IconMock = () => <span />;
const PauseCircle = IconMock;
const PlayCircle = IconMock;
const Activity = IconMock;
const GitBranch = IconMock;
const Box = IconMock;
const FileText = IconMock;
const Database = IconMock;
const ShieldAlert = IconMock;


export function TopBar() {
  const [elapsed, setElapsed] = useState('00:00:00');
  const location = useLocation();

  useEffect(() => {
    // Simple timer for demo purposes, would connect to actual run start time in real impl
    const start = Date.now();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(diff / 3600).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const s = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { path: '/', icon: Activity, label: 'Dashboard' },
    { path: '/captain/current', icon: ShieldAlert, label: 'Captain' }, // using 'current' as placeholder runId
    { path: '/artifacts/current', icon: Box, label: 'Artifacts' },
    { path: '/change-requests/current', icon: FileText, label: 'Changes' },
  ];

  return (
    <header className="h-14 border-b border-white/10 bg-zinc-950 flex items-center px-4 justify-between shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-600 flex items-center justify-center rounded-sm font-bold text-black">F</div>
          <span className="font-bold tracking-tight text-lg">FORGE</span>
        </div>

        <div className="h-6 w-px bg-white/10 mx-2" />

        <nav className="flex items-center gap-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path || 
                             (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link 
                key={item.path} 
                to={item.path}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-sm transition-colors ${
                  isActive 
                    ? 'bg-white/10 text-white' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <StatusLED status="running" />
            <span>RUNNING</span>
          </div>
          
          <div className="flex items-center gap-2">
            <GitBranch size={14} />
            <span>main</span>
          </div>

          <div className="bg-zinc-900 px-2 py-1 rounded">
            gpt-4-turbo
          </div>

          <div className="tabular-nums text-zinc-300">
            {elapsed}
          </div>
        </div>

        <Button variant="primary">
          <PauseCircle size={16} className="mr-2" />
          PAUSE ALL
        </Button>
      </div>
    </header>
  );
}
