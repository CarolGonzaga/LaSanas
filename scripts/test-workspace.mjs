import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/workspace.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function scenario(workspaceId, failTable) {
  let signing = 0, peakSigning = 0;
  const rows = {
    books: Array.from({length: 1001}, (_, i) => ({id: `book-${i}`, workspace_id: workspaceId, cover_storage_path: `cover-${i}`})),
    client_assets: [{id: 'asset', workspace_id: workspaceId, asset_type: 'image', storage_path: 'asset-image', storage_bucket: 'client-assets'}],
  };
  const calls = [];
  const db = {
    auth: {getUser: async () => ({data: {user: {id: 'user', email: 'test@example.test'}}})},
    from(table) {
      const filters = {}; let range;
      const query = {
        select() {return query;}, order() {return query;}, limit() {return query;},
        eq(key, value) {filters[key] = value; return query;},
        is(key, value) {filters[key] = value; return query;},
        range(start, end) {range = [start, end]; return query;},
        then(resolve, reject) {
          calls.push({table, filters, range});
          let data;
          if (table === 'workspace_members') {
            data = filters.user_id
              ? [{workspace_id: workspaceId, role: 'admin', workspaces: {name: workspaceId}}]
              : [{user_id:'user', role:'admin', profiles: {id:'user', avatar_url:'avatar'}}];
          } else if (table === 'production_updates') {
            assert.equal(filters.recipient_user_id, 'user');
            assert.equal(filters.read_at, null);
            data = [{id: 'notification'}];
          } else {
            data = rows[table].slice(range[0], range[1] + 1);
          }
          return Promise.resolve({data, error: table === failTable ? {message:'unavailable'} : null}).then(resolve, reject);
        },
      };
      return query;
    },
    storage: {from: bucket => ({createSignedUrls: async paths => {
      signing++; peakSigning = Math.max(peakSigning, signing);
      await new Promise(resolve => setTimeout(resolve, 5));
      signing--;
      return {data: paths.map(path => ({signedUrl: `${workspaceId}/${bucket}/${path}`}))};
    }})},
  };
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => {
    if (name === 'server-only') return {};
    // Outside a React server render, do not simulate persistent caching.
    if (name === 'react') return {cache: fn => fn};
    if (name === 'next/headers') return {cookies: async () => ({get: () => ({value:workspaceId})})};
    if (name === 'next/navigation') return {redirect: () => {throw new Error('redirect');}};
    if (name === '@/lib/supabase/server') return {createClient: async () => db};
    if (name === '@/lib/modules') return {modules: Object.keys(rows).map(table => ({table,title:table}))};
    throw new Error(name);
  }});
  if (failTable) {
    await assert.rejects(exports.loadWorkspace(), /unavailable/);
    return;
  }
  const result = await exports.loadWorkspace();
  assert.equal(result.data.books.length, 1001);
  assert.equal(result.data.books[1000].preview_url, `${workspaceId}/business-assets/cover-1000`);
  assert.equal(result.data.client_assets[0].preview_url, `${workspaceId}/client-assets/asset-image`);
  assert.equal(result.data.profiles[0].avatar_preview_url, `${workspaceId}/business-assets/avatar`);
  assert.equal(result.data.production_updates.length, 1);
  assert.equal(peakSigning, 3);
  assert.ok(calls.filter(call => !call.filters.user_id).every(call => call.filters.workspace_id === workspaceId));
}
await scenario('workspace-a');
await scenario('workspace-b');
await scenario('workspace-a', 'books');
console.log('PASS workspace pagination, workspace filters, notifications, concurrent image signing and error handling');
