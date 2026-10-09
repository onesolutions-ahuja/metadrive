import { Connection, Client } from '@temporalio/client';

export class TemporalService {
  private static client: Client | null = null;

  private static async getClient(): Promise<Client> {
    if (!this.client) {
      const connection = await Connection.connect({ address: 'localhost:7233' });
      this.client = new Client({ connection });
    }
    return this.client;
  }

  static async triggerWorkflow(workflowName: string, workflowId: string, args: any[]) {
    const client = await this.getClient();
    const handle = await client.workflow.start(workflowName, {
      taskQueue: 'metadrive-flows',
      args: [args],
      workflowId: workflowId,
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
  }
}