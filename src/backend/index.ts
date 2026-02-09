import { startServer } from './server';

export async function main(): Promise<void> {
  const server = await startServer();
  const addr = server.address();

  // eslint-disable-next-line no-console
  console.log('forge-backend listening', addr);
}

if (require.main === module) {
  void main();
}
