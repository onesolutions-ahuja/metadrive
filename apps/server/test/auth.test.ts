import assert from 'node:assert/strict';
import test from 'node:test';
import { SignJWT } from 'jose';
import { JwtService } from '../src/auth';

test('JwtService verifies principal email and permissions claims', async () => {
  const service = await JwtService.create({
    AUTH_ISSUER: 'http://localhost:3001/',
    AUTH_AUDIENCE: 'metadrive-api'
  });

  const { accessToken } = await service.issue({
    userId: 'user-123',
    tenantId: 'tenant-456',
    email: 'admin@example.com',
    roles: ['System Administrator'],
    permissions: ['metadata:read', 'security:manage']
  });

  const verified = await service.verify(accessToken);
  assert.equal(verified.sub, 'user-123');
  assert.equal(verified.tenant_id, 'tenant-456');
  assert.equal(verified.email, 'admin@example.com');
  assert.deepEqual(verified.permissions, ['metadata:read', 'security:manage']);
});

test('JwtService rejects tokens missing required email or permissions claims', async () => {
  const service = await JwtService.create({
    AUTH_ISSUER: 'http://localhost:3001/',
    AUTH_AUDIENCE: 'metadrive-api'
  });

  const token = await new SignJWT({
    tenant_id: 'tenant-456',
    roles: ['System Administrator']
  })
    .setProtectedHeader({ alg: 'RS256', kid: service.kid, typ: 'JWT' })
    .setIssuer(service.config.issuer)
    .setAudience(service.config.audience)
    .setSubject('user-123')
    .setIssuedAt(Math.floor(Date.now() / 1000))
    .setExpirationTime(Math.floor(Date.now() / 1000) + service.config.accessTokenTtlSeconds)
    .sign((service as any).signingKey);

  await assert.rejects(() => service.verify(token), /missing required identity, tenant, email, role, or permission claims/);
});
