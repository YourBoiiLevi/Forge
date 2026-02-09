import { TestSuite } from './types';
import { StatusLED } from '../ui/StatusLED';

interface IntegrationResultsProps {
  results: TestSuite | null;
}

export function IntegrationResults({ results }: IntegrationResultsProps) {
  if (!results) return null;

  const passedCount = results.passed;
  const failedCount = results.failed;
  const skippedCount = results.skipped;
  
  return (
    <div className="border border-border bg-bg-surface mt-4">
      <div className="px-4 py-3 border-b border-border flex justify-between items-center">
        <h3 className="font-pixel text-text-primary text-sm uppercase">Integration Results</h3>
        <div className="font-mono text-xs flex gap-3">
          <span className="text-success">✓ {passedCount} passed</span>
          <span className={failedCount > 0 ? 'text-error font-bold' : 'text-text-secondary'}>
            ✗ {failedCount} failed
          </span>
          <span className="text-text-secondary">○ {skippedCount} skipped</span>
        </div>
      </div>
      
      <div className="divide-y divide-border max-h-60 overflow-y-auto">
        {results.cases.map((testCase, index) => (
          <div key={index} className="px-4 py-2 font-mono text-xs hover:bg-bg-primary/50">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                <StatusLED 
                  status={
                    testCase.status === 'passed' ? 'done' : 
                    testCase.status === 'failed' ? 'failed' : 
                    'pending'
                  } 
                  size="sm"
                />
              </div>
              <div className="flex-1">
                <span className={
                  testCase.status === 'failed' ? 'text-error' : 'text-text-primary'
                }>
                  {testCase.name}
                </span>
                <span className="text-text-muted ml-2 text-[10px]">
                  {testCase.duration}ms
                </span>
                
                {testCase.error && (
                  <pre className="mt-1 p-2 bg-bg-primary border border-error/20 text-error overflow-x-auto whitespace-pre-wrap">
                    {testCase.error}
                  </pre>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
