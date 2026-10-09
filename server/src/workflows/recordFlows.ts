import { proxyActivities } from '@temporalio/workflow';

export interface FlowActivities {
  sendNotificationEmail(email: string, subject: string, body: string): Promise<void>;
  updateRecordStatus(recordId: number, status: string): Promise<void>;
}

const { sendNotificationEmail, updateRecordStatus } = proxyActivities<FlowActivities>({
  startToCloseTimeout: '1 minute',
});

export async function processRecordFlow(payload: { record_id: number; account_name?: string; status?: string }): Promise<string> {
  console.log(`[Temporal Workflow] Starting workflow for Record ID: ${payload.record_id}`);

  if (payload.account_name) {
    await sendNotificationEmail(
      'admin@metadrive.io',
      `New Account Activity: ${payload.account_name}`,
      `Account ${payload.account_name} (ID: ${payload.record_id}) has triggered automated onboarding.`
    );
  }

  await updateRecordStatus(payload.record_id, 'Processed');
  return `Workflow completed successfully for record ${payload.record_id}`;
}