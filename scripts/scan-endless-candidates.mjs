import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRandom, generateBoard, totalAdjacent, getAdjacentCells } from '../src/game-core.js';
import { solveBoard } from '../src/solver.js';
import { attemptSeed } from '../src/no-guess-generator.js';

const SCENARIOS={
 center:()=>({row:4,col:4}),
 'near-center':()=>({row:3,col:4}),
 edge:()=>({row:0,col:4}),
 corner:()=>({row:0,col:0}),
 random:(run,seed)=>{const r=createRandom(`${seed}|click|${run}`);return{row:Math.floor(r()*9),col:Math.floor(r()*9)}}
};
function arg(name,fallback){const p=`--${name}=`;const x=process.argv.find(v=>v.startsWith(p));return x?x.slice(p.length):fallback;}
function parseCounts(text){const out=[];for(const part of text.split(',')){if(part.includes('-')){let[a,b]=part.split('-').map(Number);for(let n=a;n<=b;n++)out.push(n)}else out.push(Number(part));}return out;}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function pct(a,p){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.ceil(s.length*p)-1)]}
function firstRevealCount(board){
 const flat=board.cells.flat(); const start=board.firstClick.row*9+board.firstClick.col; const q=[start], seen=new Set(), rev=new Set();
 while(q.length){const i=q.shift();if(seen.has(i))continue;seen.add(i);const c=flat[i];if(c.mineColor!==null)continue;rev.add(i);if(totalAdjacent(c)===0){for(const a of getAdjacentCells(board,c.row,c.col))q.push(a.row*9+a.col);}}
 return rev.size;
}
function metrics(board,solved){const initial=firstRevealCount(board),safe=81-board.mineCount;return{rounds:solved.stats.reasoningRounds,deductions:solved.stats.deductions,safeDeductions:solved.stats.safeDeductions,mineDeductions:solved.stats.mineDeductions,subset:solved.stats.subsetDifferenceUses,ruleUsage:solved.stats.ruleUsage,initial,initialRatio:initial/safe,initialClear:initial===safe,remainingSafe:safe-initial};}
function summarize(entries,total){
 const times=entries.map(e=>e.evalMs); const m=(key)=>entries.map(e=>e.metrics[key]).filter(Number.isFinite); const ruleNames=new Set(entries.flatMap(e=>Object.keys(e.metrics.ruleUsage||{}))); const rules={};for(const r of ruleNames)rules[r]=avg(entries.map(e=>e.metrics.ruleUsage?.[r]??0));
 return {accepted:entries.length,total,rate:entries.length/total,evalMs:{avg:avg(times),p50:pct(times,.5),p95:pct(times,.95),max:times.length?Math.max(...times):null},difficulty:{rounds:avg(m('rounds')),deductions:avg(m('deductions')),safeDeductions:avg(m('safeDeductions')),mineDeductions:avg(m('mineDeductions')),subsetDifferenceUses:avg(m('subset')),ruleUsage:rules},initial:{revealed:avg(m('initial')),ratio:avg(m('initialRatio')),clearRate:entries.length?entries.filter(e=>e.metrics.initialClear).length/entries.length:null,remainingSafe:avg(m('remainingSafe'))}};
}

const counts=parseCounts(arg('counts','3-40')); const samples=Number(arg('samples','20')); const suiteSeed=arg('seed','endless-scan-v1'); const output=arg('output','benchmark-results/endless-scan.json'); const scenarios=arg('scenarios',Object.keys(SCENARIOS).join(',')).split(',');
const rows=[]; let processed=0,totalWork=counts.length*scenarios.length*samples;
for(const mineCount of counts){
 const buckets={dedicated3:[],dedicated4:[],commonA3:[],commonA4:[],commonC3:[],commonC4:[]}; const byScenario={};
 for(const scenario of scenarios){byScenario[scenario]={dedicated3:[],dedicated4:[],commonA3:[],commonA4:[],commonC3:[],commonC4:[]};
  for(let sample=0;sample<samples;sample++){
   const click=SCENARIOS[scenario](sample,suiteSeed); const baseSeed=`${suiteSeed}|${scenario}|sample:${sample}|mines:${mineCount}`; const seed=attemptSeed(baseSeed,0); const common={seed,mineCount,firstRow:click.row,firstCol:click.col};
   let t=performance.now(); const b3=generateBoard({...common,colorCount:3}); const s3=solveBoard(b3,{includeTrace:false}); const ms3=performance.now()-t; const m3=metrics(b3,s3);
   t=performance.now(); const b4=generateBoard({...common,colorCount:4}); const s4=solveBoard(b4,{includeTrace:false}); const ms4=performance.now()-t; const m4=metrics(b4,s4);
   if(s3.noGuess){const e={evalMs:ms3,metrics:m3};buckets.dedicated3.push(e);byScenario[scenario].dedicated3.push(e)}
   if(s4.noGuess){const e={evalMs:ms4,metrics:m4};buckets.dedicated4.push(e);byScenario[scenario].dedicated4.push(e)}
   if(s3.noGuess&&s4.noGuess){
      let tmono=performance.now(); const mono=solveBoard(b3,{mode:'mono',includeTrace:false}); const monoMs=performance.now()-tmono;
      const e3={evalMs:ms3+ms4+monoMs,metrics:m3},e4={evalMs:ms3+ms4+monoMs,metrics:m4}; buckets.commonA3.push(e3);buckets.commonA4.push(e4);byScenario[scenario].commonA3.push(e3);byScenario[scenario].commonA4.push(e4);
      const colorEssential=!mono.noGuess; const conditionC=colorEssential&&s4.stats.reasoningRounds<=s3.stats.reasoningRounds;
      if(conditionC){buckets.commonC3.push(e3);buckets.commonC4.push(e4);byScenario[scenario].commonC3.push(e3);byScenario[scenario].commonC4.push(e4);}
   }
   processed++; if(processed%100===0)console.error(`progress ${processed}/${totalWork}`);
  }
 }
 const total=scenarios.length*samples;
 const overall={};for(const[k,v]of Object.entries(buckets))overall[k]=summarize(v,total);
 const scenarioSummaries={};for(const sc of scenarios){scenarioSummaries[sc]={};for(const[k,v]of Object.entries(byScenario[sc]))scenarioSummaries[sc][k]=summarize(v,samples);}
 rows.push({mineCount,totalCandidates:total,overall,byScenario:scenarioSummaries});
 fs.mkdirSync(new URL('../benchmark-results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL(`../${output}`,import.meta.url),JSON.stringify({metadata:{createdAt:new Date().toISOString(),runtime:process.version,counts,samplesPerScenario:samples,scenarios,suiteSeed},rows},null,2));
}
console.log(JSON.stringify({metadata:{counts,samplesPerScenario:samples,scenarios,suiteSeed},rows}));
