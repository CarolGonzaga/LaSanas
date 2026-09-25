import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { createServer } from 'node:http';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const loaded = new Map();
function load(path) {
  path = resolve(path);
  if (loaded.has(path)) return loaded.get(path);
  const exports = {};
  loaded.set(path, exports);
  const code = ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code, {exports, require: name => {
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve('src',name.slice(2)) : resolve(dirname(path),name);
      try { return load(base+'.ts'); } catch (error) { if(error.code !== 'ENOENT') throw error; return load(base+'.tsx'); }
    }
    return require(name);
  } });
  return exports;
}
const { calendarDays, calendarExecutions } = load('src/lib/production-calendar.ts');
for (const [month, days] of [['2026-09',30],['2028-02',29],['2026-02',28]]) {
  const grid = calendarDays(month);
  assert.equal(grid.length%7,0);
  assert.equal(new Date(grid[0]+'T12:00Z').getUTCDay(),0);
  assert.equal(grid.filter(day=>day.startsWith(month)).length,days);
}
assert.ok(calendarDays('2026-01')[0].startsWith('2025-12'));
const { today } = load('src/lib/format.ts');
const day = today();
const { buildWorkItems } = load('src/lib/work-items.ts');
const data = {
  opportunities:[{id:'op',book_id:'book',author_id:'author'}],
  opportunity_services:[{id:'service',opportunity_id:'op',item_kind:'service'}],
  authors:[{id:'author',name:'Autora de teste'}],books:[{id:'book',title:'Livro de teste'}],
  service_types:[{id:'type',name:'Stories [INSTAGRAM]'}],
  service_occurrences:Array.from({length:15},(_,i)=>({id:`entry-${i}`,opportunity_service_id:'service',service_type_id:'type',sequence_number:i+1,assigned_to:'producer',scheduled_date:day,scheduled_time:`${String(8+i%12).padStart(2,'0')}:00`,status:['pending','in_progress','in_revision','completed','cancelled'][i%5],released_at:day})),
};
const items = buildWorkItems(data);
const grouped = calendarExecutions([...items,{...items[0],id:'hidden',released:false},{...items[0],id:'someone-else',assignedTo:'another'},{...items[0],id:'no-date',dueDate:''},{...items[0],id:'task',source:'tasks'}],'producer');
assert.equal(grouped.get(day).length,15);
assert.equal(grouped.get(day)[0].dueTime,'08:00');
assert.ok(grouped.get(day).some(item=>item.status==='completed'));
assert.ok(grouped.get(day).some(item=>item.status==='cancelled'));
const { ProductionCalendar } = load('src/components/production-calendar.tsx');
const html = require('react-dom/server').renderToStaticMarkup(require('react').createElement(ProductionCalendar,{data,userId:'producer'}));
assert.ok(html.includes('Autora de teste'));
assert.ok(html.includes('Livro de teste'));
assert.equal((html.match(/class="production-calendar-entry /g)||[]).length,15);
console.log('PASS month boundaries, leap year, assignment/payment filters, completed/cancelled events, chronological order and calendar rendering');
if (process.argv.includes('--preview')) {
  const css = readFileSync('src/app/globals.css','utf8').replace('@import "tailwindcss";','');
  createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="pt-BR" class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main style="padding:24px">${html}</main></body></html>`);}).listen(4318,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:4318'));
}
