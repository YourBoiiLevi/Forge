import { AlertTriangle, CheckCircle, FileText } from 'lucide-react';

export interface Walkthrough {
  title: string;
  summary: string;
  files_changed: Array<{
    path: string;
    action: 'created' | 'modified' | 'deleted';
    reason: string;
  }>;
  risks: string[];
  followups: string[];
  body: string; // Markdown content
}

interface WalkthroughViewerProps {
  walkthrough: Walkthrough;
}

export function WalkthroughViewer({ walkthrough }: WalkthroughViewerProps) {
  return (
    <div className="space-y-6 font-mono max-w-4xl mx-auto p-6">
      {/* Header / Frontmatter */}
      <div className="border border-border bg-surface p-6 space-y-4">
          <div>
            <h1 className="font-pixel text-2xl text-accent mb-2">{walkthrough.title}</h1>
            <p className="text-text-secondary">{walkthrough.summary}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
             {/* Risks */}
             {walkthrough.risks.length > 0 && (
                 <div className="space-y-2">
                     <h3 className="text-xs uppercase text-warning flex items-center gap-2 font-bold tracking-wider">
                        <AlertTriangle className="h-4 w-4" /> Risks
                     </h3>
                     <ul className="list-none space-y-1.5">
                        {walkthrough.risks.map((risk, i) => (
                            <li key={i} className="text-sm text-text-primary pl-4 border-l-2 border-warning/50">
                                {risk}
                            </li>
                        ))}
                     </ul>
                 </div>
             )}

             {/* Followups */}
             {walkthrough.followups.length > 0 && (
                 <div className="space-y-2">
                     <h3 className="text-xs uppercase text-text-secondary flex items-center gap-2 font-bold tracking-wider">
                        <CheckCircle className="h-4 w-4" /> Followups
                     </h3>
                     <ul className="list-none space-y-1.5">
                        {walkthrough.followups.map((item, i) => (
                            <li key={i} className="text-sm text-text-secondary pl-4 border-l-2 border-border">
                                {item}
                            </li>
                        ))}
                     </ul>
                 </div>
             )}
          </div>
      </div>

      {/* Files Changed */}
      {walkthrough.files_changed.length > 0 && (
          <div className="space-y-2">
              <h3 className="text-sm font-pixel text-text-secondary uppercase">Files Changed</h3>
              <div className="border border-border bg-primary overflow-hidden">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-surface text-text-secondary text-xs uppercase border-b border-border">
                          <tr>
                              <th className="px-4 py-2 font-normal">File</th>
                              <th className="px-4 py-2 font-normal">Action</th>
                              <th className="px-4 py-2 font-normal">Reason</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                          {walkthrough.files_changed.map((file, i) => (
                              <tr key={i} className="hover:bg-surface/50 transition-colors">
                                  <td className="px-4 py-2 text-accent font-bold flex items-center gap-2">
                                    <FileText className="h-3 w-3 opacity-50" />
                                    {file.path}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`text-[10px] uppercase px-1.5 py-0.5 border ${
                                        file.action === 'created' ? 'border-success text-success bg-success/10' :
                                        file.action === 'deleted' ? 'border-error text-error bg-error/10' :
                                        'border-accent text-accent bg-accent/10'
                                    }`}>
                                        {file.action}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-text-secondary">{file.reason}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* Markdown Body */}
      <div className="prose prose-invert prose-sm max-w-none border-t border-border pt-6">
          <div className="whitespace-pre-wrap text-text-primary leading-relaxed">
             {/* Note: In a real implementation, use a markdown renderer like react-markdown */}
             {walkthrough.body}
          </div>
      </div>
    </div>
  );
}
