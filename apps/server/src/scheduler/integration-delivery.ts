import { z } from 'zod';
import { openIntegrationEnvelope } from '../connector-envelope.js';
import { credentialKeyRing } from '../core/credential-crypto.js';
import { CalloutFault } from '../connector-reliability.js';
import type { IntegrationDeliveryDependencies, FlowRuntimeContext } from '../index.js';
import type { Delivery } from './integration-dispatch.js';

export function createIntegrationDeliveryHandler(deps: IntegrationDeliveryDependencies) {
  return async (tenantId: string, delivery: Delivery): Promise<{status:number}> => {
        const value = openIntegrationEnvelope(tenantId, delivery.operationKey,
          delivery.encryptedRequest, credentialKeyRing());
        const decoded = z.object({
          label: z.string().min(1).max(255),
          config: z.record(z.unknown()),
          context: z.object({
            currentUserId: z.string().min(1),
            variables: z.record(z.unknown())
          }).passthrough()
        }).parse(value);
        const credentialRef = decoded.config.integrationConnectionId || decoded.config.namedCredentialId;
        if (credentialRef !== delivery.credentialId ||
            decoded.config.idempotencyKey !== delivery.operationKey ||
            decoded.config.deliveryMode !== 'SYNC') {
          throw new CalloutFault('OUTBOX_IDENTITY_MISMATCH', undefined, 1, false);
        }
        const currentTenant = deps.tenantData(tenantId);
        const user = deps.getState().users.find(item => item.id === decoded.context.currentUserId &&
          item.tenantId === tenantId && !item.disabled);
        if (!currentTenant || !user ||
            !deps.effectivePermissions(user,currentTenant).includes('callouts:execute')) {
          throw new CalloutFault('OUTBOX_PERMISSION_DENIED', undefined, 1, false);
        }
        const restored = { ...decoded.context,
          formulaStack: new Set<string>(), currentUserId:user.id, debug:false,
          rollbackSnapshot:undefined } as FlowRuntimeContext;
        const response = await deps.performHttpCallout(tenantId, currentTenant,
          { ...decoded.config, maxAttempts: 1, deliveryMode:'SYNC' },
          restored, decoded.label);
        return { status: response.status };

  };
}
