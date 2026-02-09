import { Layout } from '../components/Layout';
import { TopBar } from '../components/TopBar';

export function ChangeRequestsView() {
  return (
    <Layout>
      <TopBar />
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-zinc-500 font-mono text-sm">
          Change Requests View Placeholder
        </div>
      </div>
    </Layout>
  );
}
