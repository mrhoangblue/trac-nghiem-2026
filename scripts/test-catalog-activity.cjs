const fs=require('fs');const ts=require(process.cwd()+'/node_modules/typescript');const vm=require('vm');const assert=require('node:assert/strict');
class Response { constructor(body,status=200){this.body=body;this.status=status;} static json(body,opts){return new Response(body,opts?.status);} }
function load(path,stubs){const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(key)=>{if(!(key in stubs))throw Error(key);return stubs[key]},console});return mod.exports;}
(async()=>{
let role='student',signed=0;const reads=[];const docs=[{id:'public',data:()=>({title:'Public',questionCount:22})},{id:'mine',data:()=>({title:'Mine',questionCount:2,targetType:'classes',targetClassIds:['c1']})},{id:'other',data:()=>({title:'Other',questionCount:4,targetType:'classes',targetClassIds:['c2']})}];
const auth={verifyAuth:async()=>role?{uid:'student1',role}:null};
const catalog=load('src/app/api/exams/catalog/route.ts',{'next/server':{NextResponse:Response},'@/lib/verifyAuth':auth,'@/lib/firebaseAdmin':{adminDb:{collection(name){return {where(){return this},select(...fields){reads.push({name,fields});return this},async get(){return {docs:name==='exams'?docs:[{id:'c1'}]}}}}}}});
let result=await catalog.GET({});assert.equal(JSON.stringify(result.body.exams.map(x=>x.id)),JSON.stringify(['public','mine']));assert(!reads[0].fields.includes('questions'));console.log('PASS student catalog scoped + projected');
role='admin';result=await catalog.GET({});assert.equal(result.body.exams.length,3);console.log('PASS teacher catalog compatibility');
role=null;result=await catalog.GET({});assert.equal(result.status,401);console.log('PASS catalog requires auth');
role='student';reads.length=0;
class Timestamp{};
const activity=load('src/app/api/classes/[classId]/activity/route.ts',{'next/server':{NextResponse:Response},'firebase-admin/firestore':{Timestamp,FieldValue:{}},'@/lib/verifyAuth':auth,'@/lib/r2Storage':{createR2DownloadUrl:async()=>{signed++;return ''},deleteFromR2:async()=>{}},'@/lib/firebaseAdmin':{adminDb:{collection(name){return {where(){return this},doc(){return {get:async()=>({exists:true,data:()=>({studentIds:['student1']})})}},async get(){reads.push(name);return {docs:[]}}}}}}});
result=await activity.GET({nextUrl:new URL('https://site.test/api?section=announcements')},{params:Promise.resolve({classId:'c1'})});assert.equal(result.status,200);assert.equal(JSON.stringify(reads),JSON.stringify(['class_announcements']));assert.equal(signed,0);console.log('PASS announcements skip assignments, submissions, signatures');
reads.length=0;await activity.GET({nextUrl:new URL('https://site.test/api?section=assignments')},{params:Promise.resolve({classId:'c1'})});assert(!reads.includes('class_announcements'));assert(reads.includes('class_assignments'));console.log('PASS assignments skip announcements');
reads.length=0;await activity.GET({nextUrl:new URL('https://site.test/api')},{params:Promise.resolve({classId:'c1'})});assert.equal(reads.length,3);console.log('PASS legacy activity endpoint compatibility');
})().catch(e=>{console.error(e);process.exitCode=1});
