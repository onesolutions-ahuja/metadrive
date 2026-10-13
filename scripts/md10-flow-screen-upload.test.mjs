import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFlowScreenUpload } from '../apps/web/src/flowScreenUploadValidation.mjs';

const options = { maxFiles: 2, maxFileSize: 300 * 1024, allowedTypes: ['image/*', '.pdf'] };
const file = (name, type, size) => ({ name, type, size });

test('allows matching MIME wildcards and file extensions', () => {
  assert.doesNotThrow(() => validateFlowScreenUpload([file('photo.png','image/png',120)], [], options));
  assert.doesNotThrow(() => validateFlowScreenUpload([file('form.PDF','',120)], [], options));
});
test('rejects unapproved formats and too many files', () => {
  assert.throws(() => validateFlowScreenUpload([file('run.exe','application/x-executable',1)], [], options), /type is not allowed/);
  assert.throws(() => validateFlowScreenUpload([file('a.png','image/png',1),file('b.png','image/png',1)], [file('old.pdf','application/pdf',1)], options), /no more than 2/);
});
test('rejects oversized individual or combined files before reading bytes', () => {
  assert.throws(() => validateFlowScreenUpload([file('a.pdf','application/pdf',310*1024)], [], options), /Each file/);
  assert.throws(() => validateFlowScreenUpload([file('a.pdf','application/pdf',280*1024)], [file('b.pdf','application/pdf',270*1024)], options), /512 KB total/);
});
