import { Layout } from '../components/Layout';
import { useParams } from 'react-router-dom';

export function TaskDetailView() {
  const { taskId } = useParams();
  return (
    <Layout>
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-text-muted font-mono text-sm">
          Task Detail View Placeholder (ID: {taskId})
        </div>
      </div>
    </Layout>
  );
}
