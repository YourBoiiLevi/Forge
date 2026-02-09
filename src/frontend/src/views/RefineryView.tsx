import { Layout } from '../components/Layout';
import { TopBar } from '../components/TopBar';

export function RefineryView() {
  return (
    <Layout>
      <TopBar />
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-zinc-500 font-mono text-sm">
          Refinery View Placeholder
        </div>
      </div>
    </Layout>
  );
}
