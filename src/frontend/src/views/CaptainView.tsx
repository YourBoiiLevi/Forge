import { Layout } from '../components/Layout';
import { CaptainChat } from '../components/captain/CaptainChat';
import { useParams } from 'react-router-dom';

export function CaptainView() {
  // In a real app, we might get runId from the URL or a global context
  // For now, we'll assume a default or grab it from params if available
  const { runId = 'default-run' } = useParams<{ runId: string }>();

  return (
    <Layout>
      <CaptainChat runId={runId} />
    </Layout>
  );
}
