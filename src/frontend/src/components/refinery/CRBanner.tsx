import { ChangeRequest } from '../../lib/types';
import { useNavigate } from 'react-router-dom';

interface CRBannerProps {
  changeRequests: ChangeRequest[];
}

export function CRBanner({ changeRequests }: CRBannerProps) {
  const navigate = useNavigate();
  const pendingCRs = changeRequests.filter(cr => cr.status === 'pending');
  
  if (pendingCRs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {pendingCRs.map(cr => (
        <div 
          key={cr.crId}
          className="border border-warning bg-warning/10 px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-warning/20 transition-colors"
          onClick={() => navigate(`/changes`)}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠</span>
            <div>
              <div className="font-pixel text-warning text-sm uppercase">Change Request Emitted</div>
              <div className="font-mono text-text-primary text-xs">
                {cr.crId}: "{cr.title}"
              </div>
            </div>
          </div>
          <button className="px-3 py-1 bg-bg-primary border border-warning/50 text-warning text-xs font-mono hover:bg-warning/10 uppercase">
            View Request
          </button>
        </div>
      ))}
    </div>
  );
}
