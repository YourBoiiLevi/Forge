import { render, screen } from '@testing-library/react';
import { WalkthroughViewer } from './WalkthroughViewer';
import { describe, it, expect } from 'vitest';

describe('WalkthroughViewer', () => {
    const mockWalkthrough = {
        title: 'Walkthrough Title',
        summary: 'A short summary',
        files_changed: [
            { path: 'src/main.ts', action: 'modified' as const, reason: 'Bug fix' }
        ],
        risks: ['High Risk'],
        followups: ['Follow up task'],
        body: 'Markdown content here'
    };

    it('renders header information', () => {
        render(<WalkthroughViewer walkthrough={mockWalkthrough} />);
        expect(screen.getByText('Walkthrough Title')).toBeInTheDocument();
        expect(screen.getByText('A short summary')).toBeInTheDocument();
    });

    it('renders risks and followups', () => {
        render(<WalkthroughViewer walkthrough={mockWalkthrough} />);
        expect(screen.getByText('High Risk')).toBeInTheDocument();
        expect(screen.getByText('Follow up task')).toBeInTheDocument();
    });

    it('renders file changes', () => {
        render(<WalkthroughViewer walkthrough={mockWalkthrough} />);
        expect(screen.getByText('src/main.ts')).toBeInTheDocument();
        expect(screen.getByText('modified')).toBeInTheDocument();
        expect(screen.getByText('Bug fix')).toBeInTheDocument();
    });

    it('renders markdown body', () => {
        render(<WalkthroughViewer walkthrough={mockWalkthrough} />);
        expect(screen.getByText('Markdown content here')).toBeInTheDocument();
    });
});
