import { Layout } from '../components/Layout';
import { TopBar } from '../components/TopBar';
import { useParams } from 'react-router-dom';

export function TaskDetailView() {
  const { taskId } = useParams();
  return (
    <Layout>
      <TopBar />
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-zinc-500 font-mono text-sm">
          Task Detail View Placeholder (ID: {taskId})
        </div>
      </div>
    </Layout>
  );
}
