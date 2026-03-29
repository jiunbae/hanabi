#!/usr/bin/env npx tsx
/**
 * Fast parameter tuning — 8 configs × 500 games each
 */
import {
  createInitialState, applyAction, validateAction, getPlayerView, getScore, getLegalActions,
  COLORS, RANKS, RANK_COPIES,
} from '../../../packages/engine/dist/index.js';
import {
  buildPossibilities, applyNegativeClues, isDefinitelyPlayable, getUniqueIdentity,
  isProbablyPlayable, isDefinitelyUseless, dangerScore,
} from '../../../packages/engine/dist/card-tracker.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const fwm = (s: GameState) => s.fireworks as unknown as Record<string, number>;
function chop(v: PlayerView): number { const h = v.hands[v.myIndex]; for (let i = h.cards.length-1; i >= 0; i--) if (h.cards[i].clues.length===0) return i; return h.cards.length-1; }
function wpc(s: GameState, gi: number, h: any, ti: number): boolean { const f=fwm(s); for(const c of s.hands[ti].cards){if((h.type==='color'?c.color===h.value:c.rank===h.value)&&f[c.color]+1===c.rank)return true;} return false; }

function makeBot(o: { st: number; et: number; es: number; ped: number; dd: boolean }) {
  return (state: GameState, pi: number): GameAction => {
    const v=getPlayerView(state,pi), f=fwm(state), l=getLegalActions(state), t=state.clueTokens.current, mt=state.clueTokens.max, h=v.hands[pi];
    const p=buildPossibilities(v); applyNegativeClues(p,v);
    for(let i=0;i<h.cards.length;i++) if(isDefinitelyPlayable(p[i],f)) return {type:'play',playerIndex:pi,cardIndex:i} as GameAction;
    for(let i=0;i<h.cards.length;i++){if(h.cards[i].clues.length===0)continue;const id=getUniqueIdentity(p[i]);if(id&&f[id.color]+1===id.rank)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
    const hints=v.actionHistory.filter((a:any)=>a.type==='hint'&&a.targetIndex===pi);
    for(let hi=hints.length-1;hi>=0;hi--){const a=hints[hi]as any;const td:number[]=[];for(let i=0;i<h.cards.length;i++)if(h.cards[i].clues.some((c:any)=>c.type===a.hint.type&&c.value===a.hint.value))td.push(i);if(!td.length)continue;if(td.includes(chop(v)))continue;const fi=Math.max(...td);if(wpc(state,a.playerIndex,a.hint,pi)){const c=state.hands[pi].cards[fi];if(c&&f[c.color]+1===c.rank)return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;const th=state.turnsLeft!==null?o.et:o.st;if(isProbablyPlayable(p[fi],f,th))return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;}}
    if(state.turnsLeft!==null&&state.strikes.current<o.es){for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;if(isProbablyPlayable(p[i],f,o.et))return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}}
    if(o.dd&&v.deckSize<=o.ped&&t<mt){for(let i=0;i<h.cards.length;i++)if(isDefinitelyUseless(p[i],f))return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}
    if(t<mt){for(let i=0;i<h.cards.length;i++)if(isDefinitelyUseless(p[i],f))return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}
    if(t>0){for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tv=getPlayerView(state,tt),ci=chop(tv),cc=state.hands[tt].cards[ci];if(cc.rank===5&&!tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===5))return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:5}}as GameAction;const cp=RANK_COPIES[cc.rank];if(state.discardPile.filter(c=>c.color===cc.color&&c.rank===cc.rank).length>=cp-1&&f[cc.color]<cc.rank&&tv.hands[tt].cards[ci].clues.length===0)return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:cc.rank}}as GameAction;}}
    if(t>0){let b:GameAction|null=null,bs=0;for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tc=state.hands[tt].cards,tv=getPlayerView(state,tt);for(const cl of COLORS as string[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].color!==cl||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===tc[ci].rank)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'color',value:cl}}as GameAction;}}for(const rk of RANKS as number[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].rank!==rk||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='color'&&c.value===tc[ci].color)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:rk}}as GameAction;}}}if(b)return b;}
    if(t<mt){let si=-1,ld=Infinity;for(let i=0;i<h.cards.length;i++){if(h.cards[i].clues.length>0)continue;const d=dangerScore(p[i],v);if(d<ld){ld=d;si=i;}}if(si>=0)return{type:'discard',playerIndex:pi,cardIndex:si}as GameAction;}
    if(l.some(a=>a.type==='discard'))return{type:'discard',playerIndex:pi,cardIndex:chop(v)}as GameAction;
    return l[0]as GameAction;
  };
}

function run(bot: (s:GameState,pi:number)=>GameAction, n:number) {
  const sc:number[]=[]; let ts=0;
  for(let seed=1000;seed<1000+n;seed++){let s=createInitialState({numPlayers:2,seed});while(s.status==='playing'&&s.turn<100){let a=bot(s,s.currentPlayer);if(validateAction(s,a))a=getLegalActions(s)[0];s=applyAction(s,a);}sc.push(getScore(s.fireworks));ts+=s.strikes.current;}
  const d=[0,0,0,0,0,0]; for(const s of sc)d[Math.min(Math.floor(s/5),5)]++;
  return{avg:sc.reduce((a,b)=>a+b,0)/n, best:Math.max(...sc), strikes:ts/n, d20:d[4]+d[5]};
}

const cfgs: [string,{st:number;et:number;es:number;ped:number;dd:boolean}][] = [
  ['baseline(0.65/0.4/2)',    {st:0.65, et:0.4, es:2, ped:0, dd:false}],
  ['sync=0.6',               {st:0.6,  et:0.4, es:2, ped:0, dd:false}],
  ['sync=0.55',              {st:0.55, et:0.4, es:2, ped:0, dd:false}],
  ['sync=0.5',               {st:0.5,  et:0.4, es:2, ped:0, dd:false}],
  ['endgame=0.3',            {st:0.65, et:0.3, es:2, ped:0, dd:false}],
  ['endStrikes=3',           {st:0.65, et:0.4, es:3, ped:0, dd:false}],
  ['preEnd=10+dead',         {st:0.65, et:0.4, es:2, ped:10,dd:true}],
  ['sync=0.55+end=0.3+es3',  {st:0.55, et:0.3, es:3, ped:10,dd:true}],
  ['sync=0.6+end=0.3+es2',   {st:0.6,  et:0.3, es:2, ped:10,dd:true}],
  ['sync=0.6+end=0.35',      {st:0.6,  et:0.35,es:2, ped:0, dd:false}],
];

console.log('Parameter tuning (500 games each)\n');
type R = [string, ReturnType<typeof run>];
const results: R[] = [];
for(const [name,opts] of cfgs) {
  const r = run(makeBot(opts), 500);
  results.push([name, r]);
  console.log(`${name.padEnd(28)} avg=${r.avg.toFixed(1)} best=${r.best} s=${r.strikes.toFixed(2)} 20+:${r.d20}`);
}
console.log('\nRanked by avg:');
results.sort((a,b) => b[1].avg - a[1].avg);
for(const [n,r] of results) console.log(`  ${n.padEnd(28)} ${r.avg.toFixed(1)} (s=${r.strikes.toFixed(2)}, 20+:${r.d20})`);
