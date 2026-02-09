import '@testing-library/jest-dom';

// Mock lucide-react icons globally
import { vi } from 'vitest';
import React from 'react';

// Create a generic icon mock component
const IconMock = React.forwardRef((props: React.SVGProps<SVGSVGElement>, ref: React.ForwardedRef<SVGSVGElement>) => 
  React.createElement('svg', { ref, ...props })
);
(IconMock as React.FC).displayName = 'IconMock';

// Explicitly mock the lucide-react module with a factory function
vi.mock('lucide-react', () => {
  return {
    // Basic icons we know we use
    Activity: IconMock,
    PauseCircle: IconMock,
    PlayCircle: IconMock,
    GitBranch: IconMock,
    Box: IconMock,
    FileText: IconMock,
    Database: IconMock,
    ShieldAlert: IconMock,
    CirclePause: IconMock, // In case of older/newer version naming
    Loader2: IconMock, // Used in Button
    
    // Fallback for others using Proxy
    // Note: Vitest's vi.mock factory must return the module object directly, 
    // but Proxy support in factories can be tricky if not handling all keys.
    // For now, let's explicitly list used icons to be safe.
  };
});

// Mock ResizeObserver for React Flow
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock TextDecoder/TextEncoder for JSDOM env if missing (often needed for libs)
if (typeof global.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

// Mock scrollIntoView for JSDOM
window.HTMLElement.prototype.scrollIntoView = vi.fn();


