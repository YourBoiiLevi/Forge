import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { IntegrationResults } from '../components/refinery/IntegrationResults';
import { MOCK_TEST_RESULTS } from '../components/refinery/types';

describe('IntegrationResults', () => {
  it('does not render when no results', () => {
    const { container } = render(<IntegrationResults results={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders test summary counts', () => {
    render(<IntegrationResults results={MOCK_TEST_RESULTS} />);
    
    expect(screen.getByText('Integration Results')).toBeInTheDocument();
    expect(screen.getByText(`✓ ${MOCK_TEST_RESULTS.passed} passed`)).toBeInTheDocument();
    expect(screen.getByText(`✗ ${MOCK_TEST_RESULTS.failed} failed`)).toBeInTheDocument();
  });

  it('renders individual test cases', () => {
    render(<IntegrationResults results={MOCK_TEST_RESULTS} />);
    
    const testCase = MOCK_TEST_RESULTS.cases[0];
    expect(screen.getByText(testCase.name)).toBeInTheDocument();
    expect(screen.getByText(`${testCase.duration}ms`)).toBeInTheDocument();
  });
});
