import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresConnectionOptions} from '../scripts/postgres-connection.mjs';

const remote='postgresql://user:pass@db.example.test:5432/metadrive?sslmode=require&sslrootcert=/ignored.pem';

test('remote PostgreSQL uses verified TLS and the configured CA certificate',()=>{
  const options=postgresConnectionOptions(remote,{METADRIVE_DB_CA_CERT:'-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----'});
  const url=new URL(options.connectionString);
  assert.equal(options.ssl.rejectUnauthorized,true);
  assert.equal(options.ssl.ca,'-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----');
  assert.equal(url.searchParams.has('sslmode'),false);
  assert.equal(url.searchParams.has('sslrootcert'),false);
});

test('unverified and unencrypted remote TLS require explicit policy overrides',()=>{
  assert.equal(postgresConnectionOptions(remote,{}).ssl.rejectUnauthorized,true);
  assert.equal(postgresConnectionOptions(remote,{METADRIVE_DB_ALLOW_SELF_SIGNED_CERT:'true'}).ssl.rejectUnauthorized,false);
  assert.throws(()=>postgresConnectionOptions(remote,{PGSSLMODE:'disable'}),/Unencrypted remote/);
});

test('local PostgreSQL may disable TLS and non-PostgreSQL URLs are rejected',()=>{
  assert.equal(postgresConnectionOptions('postgres://localhost:5432/metadrive',{PGSSLMODE:'disable'}).ssl,false);
  assert.throws(()=>postgresConnectionOptions('https://db.example.test'),/Expected PostgreSQL/);
});
