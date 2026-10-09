import { v1 } from '@authzed/authzed-node';
import * as grpc from '@grpc/grpc-js';
import { promisify } from 'util';

// 1. Initialize Client with the Preshared Key
const client = v1.NewClient(
  'localhost:50051',
  grpc.credentials.createInsecure()
);

const meta = new grpc.Metadata();
meta.add('authorization', 'Bearer alliance_secret');

// 2. Promisify Core Methods
const writeSchemaAsync = promisify(client.writeSchema.bind(client));
const writeRelationshipsAsync = promisify(client.writeRelationships.bind(client));
const checkPermissionAsync = promisify(client.checkPermission.bind(client));

export const SpiceService = {
  async applySchema(schemaText: string) {
    const request = v1.WriteSchemaRequest.create({ schema: schemaText });
    return await writeSchemaAsync(request, meta);
  },

  async grantAccess(resourceType: string, resourceId: string, relation: string, user: string) {
    const request = v1.WriteRelationshipsRequest.create({
      updates: [
        {
          operation: v1.RelationshipUpdate_Operation.CREATE,
          relationship: v1.Relationship.create({
            resource: v1.ObjectReference.create({ objectType: resourceType, objectId: resourceId }),
            relation: relation,
            subject: v1.SubjectReference.create({
              object: v1.ObjectReference.create({ objectType: 'user', objectId: user }),
            }),
          }),
        },
      ],
    });
    return await writeRelationshipsAsync(request, meta);
  },

  async checkAccess(resourceType: string, resourceId: string, permission: string, user: string): Promise<boolean> {
    const request = v1.CheckPermissionRequest.create({
      resource: v1.ObjectReference.create({ objectType: resourceType, objectId: resourceId }),
      permission: permission,
      subject: v1.SubjectReference.create({
        object: v1.ObjectReference.create({ objectType: 'user', objectId: user }),
      }),
    });
    const response = await checkPermissionAsync(request, meta);
    return response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;
  }
};