import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react');
let states = [], index = 0;
function load(path) {
  path = resolve(path);
  const exports = {};
  const code = ts.transpileModule(readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code, {exports, require: name => {
    if(name === 'react') return {...React,useState: initial => [states[index++] ?? initial,()=>{}],useTransition:()=>[false,()=>{}]};
    if(name === 'next/navigation') return {useRouter:()=>({refresh(){}})};
    if(name === '@/actions/business') return {};
    if(name === 'next/link') return {default: props=>React.createElement('a',props)};
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? resolve('src',name.slice(2)) : resolve(dirname(path),name);
      try { return load(base+'.ts'); } catch (error) { if(error.code !== 'ENOENT') throw error; return load(base+'.tsx'); }
    }
    return require(name);
  } });
  return exports;
}
const {TaskList} = load('src/components/task-list.tsx');
const {ServiceCatalog} = load('src/components/service-catalog.tsx');
const render=(component, props, values)=>{states=values;index=0;return require('react-dom/server').renderToStaticMarkup(React.createElement(component,props));};
const day=load('src/lib/format.ts').today();
const data={tasks:[
 {id:'one',title:'Pendente importante',due_date:day,status:'pending',priority:'high',assigned_to:'me'},
 {id:'two',title:'Concluída anterior',due_date:'2020-01-01',status:'completed',assigned_to:'me'},
 {id:'three',title:'Cancelada antiga',due_date:'2020-01-01',status:'cancelled',assigned_to:'other'},
 {id:'four',title:'Tarefa arquivada',due_date:day,status:'pending',archived_at:day},
 {id:'five',title:'Outra futura',due_date:'2099-01-01',status:'in_progress',assigned_to:'other'},
]};
const props={data,userId:'me',edit(){},onDelete(){},readOnly:false};
let html=render(TaskList,props,['open']);
assert.ok(html.includes('Pendente importante') && html.includes('Outra futura'));
assert.ok(!html.includes('Concluída anterior') && !html.includes('Cancelada antiga') && !html.includes('Tarefa arquivada'));
assert.ok(html.indexOf('Pendente importante')<html.indexOf('Outra futura'));
html=render(TaskList,props,['completed']);assert.ok(html.includes('Reabrir Concluída anterior') && !html.includes('Outra futura'));
html=render(TaskList,props,['today']);assert.ok(html.includes('Pendente importante') && !html.includes('Outra futura'));
html=render(TaskList,props,['important']);assert.ok(html.includes('aria-pressed="true"') && !html.includes('Outra futura'));
html=render(TaskList,props,['all','','other']);assert.ok(html.includes('Cancelada antiga') && !html.includes('Pendente importante'));
html=render(TaskList,props,['all','futura']);assert.ok(html.includes('Outra futura') && !html.includes('Pendente importante'));
const catalog={data:{service_packages:[{id:'plan',name:'Plano 1',duration_months:3,package_price:570,active:true}]},edit(){},prefix:''};
html=render(ServiceCatalog,catalog,['service_packages']);assert.ok(html.includes('190,00') && html.includes('570,00') && html.includes('/pacotes/plan'));
assert.ok(html.includes('/servicos-contratados'));
console.log('PASS task filters, search, ownership, completed/reopen controls, order, monthly catalog pricing and execution access');
