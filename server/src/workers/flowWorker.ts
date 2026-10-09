import { Worker } from '@temporalio/worker';
import { pool } from '../db';

const activities = {
  async sendNotificationEmail(email: string, subject: string, body: string): Promise<void> {
    console.log(`[Activity: Email] Sent to ${email} | Subject: "${subject}"`);
    console.log(`[Email Body]: ${body}`);
  },

  async updateRecordStatus(recordId: number, status: string): Promise<void> {
    console.log(`[Activity: DB] Updating sys_records ID ${recordId} status to '${status}'`);
    await pool.query(
      `UPDATE sys_records 
       SET data = jsonb_set(data, '{status}', $1::jsonb), updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2;`,
      [JSON.stringify(status), recordId]
    );
  },
};

async function runWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('../workflows/recordFlows'),
    activities,
    taskQueue: 'metadrive-flows',
  });

  console.log('=================================');
  console.log('Temporal Flow Worker Online');
  console.log('Listening on task queue: metadrive-flows');
  console.log('=================================');

  await worker.run();
}

runWorker().catch((err) => {
  console.error('Fatal error in Temporal Worker:', err);
  process.exit(1);
});