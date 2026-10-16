import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const contractPath = join(root, 'contracts/metadata-self-hosting.v1.json');
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const maxLines = 1000;
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.sql']);
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.vite', '.next']);
function discover(folder) {
  const files = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) files.push(...discover(join(folder, entry.name)));
      continue;
    }
    if (entry.isFile() && extensions.has(extname(entry.name))) {
      const absolute = join(folder, entry.name);
      const content = readFileSync(absolute, 'utf8');
      const lines = content.length ? content.split('\n').length - Number(content.endsWith('\n')) : 0;
      files.push({ path: relative(root, absolute).replaceAll('\\', '/'), lines });
    }
  }
  return files;
}
const files = discover(root).sort((a, b) => a.path.localeCompare(b.path));
const missingAuthorities = contract.authorities.map(item => item.path).filter(path => !existsSync(join(root, path)));
const oversize = files.filter(item => item.lines > maxLines).sort((a, b) => b.lines - a.lines);
const result = {
  schemaVersion: 1,
  filesScanned: files.length,
  oversizeLimit: maxLines,
  oversizedCodeFiles: oversize,
  missingAuthorities,
  authoritativeContract: 'contracts/metadata-self-hosting.v1.json',
  policy: 'DEVELOPER_POLICY.md'
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('MetaDrive architecture inventory: ' + files.length + ' source files; ' + oversize.length + ' files above ' + maxLines + ' lines.');
  for (const item of oversize) console.log('  ' + item.lines + '  ' + item.path + ' [legacy line-count debt]');
  console.log('Missing current contract authorities: ' + missingAuthorities.length);
}
if (process.argv.includes('--check') && missingAuthorities.length) {
  console.error('Architecture contract failure: current registered engine authority missing.');
  process.exitCode = 1;
}
