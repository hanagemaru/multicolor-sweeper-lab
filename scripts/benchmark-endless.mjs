import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRandom, generateBoard } from '../src/game-core.js';
import { solveBoard } from '../src/solver.js';
import { attemptSeed, evaluateCandidate } from '../src/no-guess-generator.js';

const SCENARIOS = {
  center: () => ({ row: 4, col: 4 }),
  'near-center': () => ({ row: 3, col: 4 }),
  edge: () => ({ row: 0, col: 4 }),
  corner: () => ({ row: 0, col: 0 }),
  random: (run, suiteSeed) => {
    const random = createRandom(`${suiteSeed}|click|${run}`);
    return { row: Math.floor(random() * 9), col: Math.floor(random() * 9) };
  },
};

const MODES = ['dedicated3', 'dedicated4', 'commonA', 'commonC'];

function parseCounts(text) {
  const result=[];
  for (const part of text.split(',')) {
    if (part.includes('-')) { const [a,b]=part.split('-').map(Number); for(let n=a;n<=b;n++) result.push(n); }
    else result.push(Number(part));
  }
  return result;
}
function arg(name, fallback) {
  const prefix=`--${name}=`; const found=process.argv.find(x=>x.startsWith(prefix)); return found?found.slice(prefix.length):fallback;
}
function percentile(values, p) { if(!values.length)return null; const s=[...values].sort((a,b)=>a-b); return s[Math.min(s.length-1,Math.ceil(s.length*p)-1)]; }
function avg(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function sum(values){return values.reduce((a,b)=>a+b,0);}

function acceptedMetrics(board, solved) {
  const initialRevealed=solved.trace?.[0]?.revealed?.length ?? 0;
  const safeCount=81-board.mineCount;
  return {
    reasoningRounds: solved.stats.reasoningRounds,
    deductions: solved.stats.deductions,
    safeDeductions: solved.stats.safeDeductions,
    mineDeductions: solved.stats.mineDeductions,
    subsetDifferenceUses: solved.stats.subsetDifferenceUses,
    ruleUsage: solved.stats.ruleUsage,
    initialRevealed,
    initialRevealRatio: safeCount ? initialRevealed/safeCount : 0,
    initialClear: initialRevealed===safeCount,
    remainingSafeAfterInitial: safeCount-initialRevealed,
  };
}

function tryCandidate({mode, baseSeed, attempt, mineCount, firstClick}) {
  if(mode==='dedicated3' || mode==='dedicated4') {
    const colorCount=mode==='dedicated3'?3:4;
    const seed=attemptSeed(baseSeed,attempt);
    const board=generateBoard({seed,mineCount,colorCount,firstRow:firstClick.row,firstCol:firstClick.col});
    const solved=solveBoard(board,{includeTrace:false});
    return solved.noGuess ? {board, solved} : null;
  }
  const filter=mode==='commonA'?'A':'C';
  const candidate=evaluateCandidate({baseSeed,attempt,mineCount,firstRow:firstClick.row,firstCol:firstClick.col,includeTrace:false,shortCircuitOnThreeFailure:true});
  if(!candidate.flags[filter]) return null;
  const board3=generateBoard({seed:candidate.seed,mineCount,colorCount:3,firstRow:firstClick.row,firstCol:firstClick.col});
  const board4=generateBoard({seed:candidate.seed,mineCount,colorCount:4,firstRow:firstClick.row,firstCol:firstClick.col});
  return {board3,board4};
}

function runOne({mode,mineCount,scenario,run,maxAttempts,suiteSeed}) {
  const firstClick=SCENARIOS[scenario](run,suiteSeed);
  const baseSeed=`${suiteSeed}|endless|${mode}|${scenario}|run:${run}|mines:${mineCount}`;
  const started=performance.now();
  for(let attempt=0;attempt<maxAttempts;attempt++) {
    const accepted=tryCandidate({mode,baseSeed,attempt,mineCount,firstClick});
    if(!accepted) continue;
    const elapsedMs=performance.now()-started;
    if(mode==='dedicated3'||mode==='dedicated4') {
      const traced=solveBoard(accepted.board,{includeTrace:true});
      return {failed:false,attempts:attempt+1,elapsedMs,firstClick,metrics:{[mode==='dedicated3'?'three':'four']:acceptedMetrics(accepted.board,traced)}};
    }
    const solved3=solveBoard(accepted.board3,{includeTrace:true});
    const solved4=solveBoard(accepted.board4,{includeTrace:true});
    return {failed:false,attempts:attempt+1,elapsedMs,firstClick,metrics:{three:acceptedMetrics(accepted.board3,solved3),four:acceptedMetrics(accepted.board4,solved4)}};
  }
  return {failed:true,attempts:maxAttempts,elapsedMs:performance.now()-started,firstClick,metrics:{}};
}

function aggregate(results) {
  const successes=results.filter(r=>!r.failed); const failures=results.filter(r=>r.failed);
  const successTimes=successes.map(r=>r.elapsedMs); const allTimes=results.map(r=>r.elapsedMs);
  const attemptsAll=sum(results.map(r=>r.attempts));
  const metricFor=(color,key)=>successes.map(r=>r.metrics[color]?.[key]).filter(Number.isFinite);
  const boolFor=(color,key)=>successes.map(r=>r.metrics[color]?.[key]).filter(v=>typeof v==='boolean');
  const ruleNames=new Set();
  for(const r of successes) for(const c of ['three','four']) for(const k of Object.keys(r.metrics[c]?.ruleUsage??{})) ruleNames.add(k);
  const colorSummary=(color)=>{
    if(!successes.some(r=>r.metrics[color])) return null;
    const rules={}; for(const rule of ruleNames) rules[rule]=avg(successes.map(r=>r.metrics[color]?.ruleUsage?.[rule]??0).filter(Number.isFinite));
    return {
      reasoningRounds:avg(metricFor(color,'reasoningRounds')),
      deductions:avg(metricFor(color,'deductions')),
      safeDeductions:avg(metricFor(color,'safeDeductions')),
      mineDeductions:avg(metricFor(color,'mineDeductions')),
      subsetDifferenceUses:avg(metricFor(color,'subsetDifferenceUses')),
      initialRevealed:avg(metricFor(color,'initialRevealed')),
      initialRevealRatio:avg(metricFor(color,'initialRevealRatio')),
      initialClearRate:boolFor(color,'initialClear').filter(Boolean).length / Math.max(1,boolFor(color,'initialClear').length),
      remainingSafeAfterInitial:avg(metricFor(color,'remainingSafeAfterInitial')),
      ruleUsage:rules,
    };
  };
  return {
    runs:results.length,successes:successes.length,failures:failures.length,
    failureRate:failures.length/results.length,
    adoptionRate:attemptsAll?successes.length/attemptsAll:0,
    averageAttemptsSuccess:avg(successes.map(r=>r.attempts)),
    attemptsTotal:attemptsAll,
    timingMs:{success:{p50:percentile(successTimes,.5),p95:percentile(successTimes,.95),max:successTimes.length?Math.max(...successTimes):null,average:avg(successTimes)},all:{p50:percentile(allTimes,.5),p95:percentile(allTimes,.95),max:allTimes.length?Math.max(...allTimes):null}},
    inference:{three:colorSummary('three'),four:colorSummary('four')},
  };
}

const mineCounts=parseCounts(arg('counts','3-40'));
const runs=Number(arg('runs','1'));
const maxAttempts=Number(arg('max-attempts','500'));
const modes=arg('modes',MODES.join(',')).split(',');
const scenarios=arg('scenarios',Object.keys(SCENARIOS).join(',')).split(',');
const suiteSeed=arg('seed','endless-v1');
const output=arg('output','benchmark-results/endless.json');
const raw=[];
let done=0,total=mineCounts.length*modes.length*scenarios.length*runs;
for(const mineCount of mineCounts){
 for(const mode of modes){
  for(const scenario of scenarios){
   for(let run=0;run<runs;run++){
    raw.push({mineCount,mode,scenario,run,...runOne({mode,mineCount,scenario,run,maxAttempts,suiteSeed})});
    done++; if(done%25===0) console.error(`progress ${done}/${total}`);
   }
  }
 }
}
const rows=[];
for(const mineCount of mineCounts){ for(const mode of modes){ const r=raw.filter(x=>x.mineCount===mineCount&&x.mode===mode); rows.push({mineCount,mode,...aggregate(r)}); }}
const perScenario=[];
for(const mineCount of mineCounts){for(const mode of modes){for(const scenario of scenarios){const r=raw.filter(x=>x.mineCount===mineCount&&x.mode===mode&&x.scenario===scenario);perScenario.push({mineCount,mode,scenario,...aggregate(r)});}}}
const result={metadata:{createdAt:new Date().toISOString(),runtime:process.version,mineCounts,runsPerScenario:runs,maxAttempts,modes,scenarios,suiteSeed},rows,perScenario};
fs.mkdirSync(new URL('../benchmark-results/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL(`../${output}`,import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
