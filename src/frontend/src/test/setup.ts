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


