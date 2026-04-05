#!/usr/bin/env npx tsx
/**
 * Final push to avg 20 — three simultaneous approaches
 *
 * Dir 1: New hint protocol (sender+receiver changed together)
 * Dir 2: Eliminate remaining strikes
 * Dir 3: 3-player optimization
 */
import {
  createInitialState, applyAction, validateAction, getPlayerView, getScore, getLegalActions,
  COLORS, RANKS, RANK_COPIES,
  buildPossibilities, applyNegativeClues, isDefinitelyPlayable, getUniqueIdentity,
  isProbablyPlayable, isDefinitelyUseless, dangerScore,
} from '../../../packages/engine/dist/index.js';
import type { GameState, GameAction, PlayerView } from '../../../packages/engine/dist/index.js';

const fwm = (s: GameState) => s.fireworks as unknown as Record<string, number>;
function chop(v: PlayerView): number { const h=v.hands[v.myIndex]; for(let i=h.cards.length-1;i>=0;i--)if(h.cards[i].clues.length===0)return i; return h.cards.length-1; }
function wpc(s: GameState, h: any, ti: number): boolean { const f=fwm(s); for(const c of s.hands[ti].cards){if((h.type==='color'?c.color===h.value:c.rank===h.value)&&f[c.color]+1===c.rank)return true;} return false; }

// ═══ Current best (19.1 baseline) ═══
function botCurrent(state: GameState, pi: number): GameAction {
  const v=getPlayerView(state,pi),f=fwm(state),l=getLegalActions(state),t=state.clueTokens.current,mt=state.clueTokens.max,h=v.hands[pi];
  const p=buildPossibilities(v); applyNegativeClues(p,v);
  // P1-P2: Definite + unique play
  for(let i=0;i<h.cards.length;i++) if(isDefinitelyPlayable(p[i],f)) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
  for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;const id=getUniqueIdentity(p[i]);if(id&&f[id.color]+1===id.rank)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
  // P3: Sync play
  const hints=v.actionHistory.filter((a:any)=>a.type==='hint'&&a.targetIndex===pi);
  for(let hi=hints.length-1;hi>=0;hi--){const a=hints[hi]as any;const td:number[]=[];for(let i=0;i<h.cards.length;i++)if(h.cards[i].clues.some((c:any)=>c.type===a.hint.type&&c.value===a.hint.value))td.push(i);if(!td.length)continue;if(td.includes(chop(v)))continue;const fi=Math.max(...td);if(wpc(state,a.hint,pi)){const c=state.hands[pi].cards[fi];if(c&&f[c.color]+1===c.rank)return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;const th=state.turnsLeft!==null?0.4:0.65;if(isProbablyPlayable(p[fi],f,th))return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;}}
  // P4b: Endgame
  if(state.turnsLeft!==null&&state.strikes.current<2){for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;if(isProbablyPlayable(p[i],f,0.4))return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}}
  // P5-P8
  if(t<mt){for(let i=0;i<h.cards.length;i++)if(isDefinitelyUseless(p[i],f))return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}
  if(t>0){for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tv=getPlayerView(state,tt),ci=chop(tv),cc=state.hands[tt].cards[ci];if(cc.rank===5&&!tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===5))return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:5}}as GameAction;const cp=RANK_COPIES[cc.rank];if(state.discardPile.filter(c=>c.color===cc.color&&c.rank===cc.rank).length>=cp-1&&f[cc.color]<cc.rank&&tv.hands[tt].cards[ci].clues.length===0)return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:cc.rank}}as GameAction;}}
  if(t>0){let b:GameAction|null=null,bs=0;for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tc=state.hands[tt].cards,tv=getPlayerView(state,tt);for(const cl of COLORS as string[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].color!==cl||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===tc[ci].rank)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'color',value:cl}}as GameAction;}}for(const rk of RANKS as number[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].rank!==rk||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='color'&&c.value===tc[ci].color)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:rk}}as GameAction;}}}if(b)return b;}
  if(t<mt){let si=-1,ld=Infinity;for(let i=0;i<h.cards.length;i++){if(h.cards[i].clues.length>0)continue;const d=dangerScore(p[i],v);if(d<ld){ld=d;si=i;}}if(si>=0)return{type:'discard',playerIndex:pi,cardIndex:si}as GameAction;}
  if(l.some(a=>a.type==='discard'))return{type:'discard',playerIndex:pi,cardIndex:chop(v)}as GameAction;
  return l[0]as GameAction;
}

// ═══ Dir 1: Enhanced hint protocol — both sender & receiver updated ═══
// Sender: when hinting, also consider "2-step" plays (hint color → receiver deduces rank from fireworks)
// Receiver: if a color hint makes a card's only possible rank == next needed, play it
function botProtocol(state: GameState, pi: number): GameAction {
  const v=getPlayerView(state,pi),f=fwm(state),l=getLegalActions(state),t=state.clueTokens.current,mt=state.clueTokens.max,h=v.hands[pi];
  const p=buildPossibilities(v); applyNegativeClues(p,v);

  // P1-P2: Same
  for(let i=0;i<h.cards.length;i++) if(isDefinitelyPlayable(p[i],f)) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
  for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;const id=getUniqueIdentity(p[i]);if(id&&f[id.color]+1===id.rank)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}

  // P3-ENHANCED: Sync play + "color implies rank" deduction
  // If I know color=X and only 1 rank is possible for that color (next needed), play it
  for(let i=0;i<h.cards.length;i++){
    const kc=h.cards[i].clues.find((c:any)=>c.type==='color')?.value as string|undefined;
    if(!kc)continue;
    // What ranks are possible for this color?
    const ci_idx = COLORS.indexOf(kc as any);
    if(ci_idx<0)continue;
    let possibleRanks=0, playableRank=-1;
    for(let r=0;r<5;r++){
      if(p[i].possible[ci_idx][r]){
        possibleRanks++;
        if(f[kc]+1===RANKS[r])playableRank=r;
      }
    }
    // If only 1 rank possible AND it's playable, play!
    if(possibleRanks===1&&playableRank>=0) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
    // If playable rank is the only playable option among possibilities, still good
    if(playableRank>=0&&possibleRanks<=3){
      // Count how many of the possible ranks are playable
      let playableCount=0;
      for(let r=0;r<5;r++)if(p[i].possible[ci_idx][r]&&f[kc]+1===RANKS[r])playableCount++;
      if(playableCount>0&&playableCount===possibleRanks) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
    }
  }

  // Same for rank hint: if I know rank=R and only 1 color needs R, play it
  for(let i=0;i<h.cards.length;i++){
    const kr=h.cards[i].clues.find((c:any)=>c.type==='rank')?.value as number|undefined;
    if(!kr)continue;
    const ri=RANKS.indexOf(kr as any);
    if(ri<0)continue;
    let possibleColors=0, playableColor=-1;
    for(let c=0;c<5;c++){
      if(p[i].possible[c][ri]){
        possibleColors++;
        if(f[COLORS[c]]+1===kr)playableColor=c;
      }
    }
    if(possibleColors===1&&playableColor>=0) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
  }

  // Original sync play
  const hints=v.actionHistory.filter((a:any)=>a.type==='hint'&&a.targetIndex===pi);
  for(let hi=hints.length-1;hi>=0;hi--){const a=hints[hi]as any;const td:number[]=[];for(let i=0;i<h.cards.length;i++)if(h.cards[i].clues.some((c:any)=>c.type===a.hint.type&&c.value===a.hint.value))td.push(i);if(!td.length)continue;if(td.includes(chop(v)))continue;const fi=Math.max(...td);if(wpc(state,a.hint,pi)){const c=state.hands[pi].cards[fi];if(c&&f[c.color]+1===c.rank)return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;const th=state.turnsLeft!==null?0.4:0.65;if(isProbablyPlayable(p[fi],f,th))return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;}}
  if(state.turnsLeft!==null&&state.strikes.current<2){for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;if(isProbablyPlayable(p[i],f,0.4))return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}}

  // Rest same as current
  if(t<mt){for(let i=0;i<h.cards.length;i++)if(isDefinitelyUseless(p[i],f))return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}
  if(t>0){for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tv=getPlayerView(state,tt),ci=chop(tv),cc=state.hands[tt].cards[ci];if(cc.rank===5&&!tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===5))return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:5}}as GameAction;const cp=RANK_COPIES[cc.rank];if(state.discardPile.filter(c=>c.color===cc.color&&c.rank===cc.rank).length>=cp-1&&f[cc.color]<cc.rank&&tv.hands[tt].cards[ci].clues.length===0)return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:cc.rank}}as GameAction;}}
  if(t>0){let b:GameAction|null=null,bs=0;for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tc=state.hands[tt].cards,tv=getPlayerView(state,tt);for(const cl of COLORS as string[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].color!==cl||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===tc[ci].rank)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'color',value:cl}}as GameAction;}}for(const rk of RANKS as number[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].rank!==rk||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='color'&&c.value===tc[ci].color)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:rk}}as GameAction;}}}if(b)return b;}
  if(t<mt){let si=-1,ld=Infinity;for(let i=0;i<h.cards.length;i++){if(h.cards[i].clues.length>0)continue;const d=dangerScore(p[i],v);if(d<ld){ld=d;si=i;}}if(si>=0)return{type:'discard',playerIndex:pi,cardIndex:si}as GameAction;}
  if(l.some(a=>a.type==='discard'))return{type:'discard',playerIndex:pi,cardIndex:chop(v)}as GameAction;
  return l[0]as GameAction;
}

// ═══ Dir 2: Zero-strike variant ═══
// Skip sync play + endgame aggression. Only play definitely/uniquely playable.
function botZeroStrike(state: GameState, pi: number): GameAction {
  const v=getPlayerView(state,pi),f=fwm(state),l=getLegalActions(state),t=state.clueTokens.current,mt=state.clueTokens.max,h=v.hands[pi];
  const p=buildPossibilities(v); // NO negative clues at all
  for(let i=0;i<h.cards.length;i++) if(isDefinitelyPlayable(p[i],f)) return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;
  for(let i=0;i<h.cards.length;i++){if(!h.cards[i].clues.length)continue;const id=getUniqueIdentity(p[i]);if(id&&f[id.color]+1===id.rank)return{type:'play',playerIndex:pi,cardIndex:i}as GameAction;}
  // Sync play but ONLY if definitely playable (no probability)
  const hints=v.actionHistory.filter((a:any)=>a.type==='hint'&&a.targetIndex===pi);
  for(let hi=hints.length-1;hi>=0;hi--){const a=hints[hi]as any;const td:number[]=[];for(let i=0;i<h.cards.length;i++)if(h.cards[i].clues.some((c:any)=>c.type===a.hint.type&&c.value===a.hint.value))td.push(i);if(!td.length)continue;if(td.includes(chop(v)))continue;const fi=Math.max(...td);if(wpc(state,a.hint,pi)){const c=state.hands[pi].cards[fi];if(c&&f[c.color]+1===c.rank)return{type:'play',playerIndex:pi,cardIndex:fi}as GameAction;}}
  // Same P5-P8
  if(t<mt){for(let i=0;i<h.cards.length;i++)if(isDefinitelyUseless(p[i],f))return{type:'discard',playerIndex:pi,cardIndex:i}as GameAction;}
  if(t>0){for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tv=getPlayerView(state,tt),ci=chop(tv),cc=state.hands[tt].cards[ci];if(cc.rank===5&&!tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===5))return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:5}}as GameAction;const cp=RANK_COPIES[cc.rank];if(state.discardPile.filter(c=>c.color===cc.color&&c.rank===cc.rank).length>=cp-1&&f[cc.color]<cc.rank&&tv.hands[tt].cards[ci].clues.length===0)return{type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:cc.rank}}as GameAction;}}
  if(t>0){let b:GameAction|null=null,bs=0;for(let tt=0;tt<state.hands.length;tt++){if(tt===pi)continue;const tc=state.hands[tt].cards,tv=getPlayerView(state,tt);for(const cl of COLORS as string[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].color!==cl||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='rank'&&c.value===tc[ci].rank)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'color',value:cl}}as GameAction;}}for(const rk of RANKS as number[]){let u=0;for(let ci=0;ci<tc.length;ci++){if(tc[ci].rank!==rk||f[tc[ci].color]+1!==tc[ci].rank)continue;u+=tv.hands[tt].cards[ci].clues.some((c:any)=>c.type==='color'&&c.value===tc[ci].color)?3:1;}if(u>bs){bs=u;b={type:'hint',playerIndex:pi,targetIndex:tt,hint:{type:'rank',value:rk}}as GameAction;}}}if(b)return b;}
  if(t<mt){let si=-1,ld=Infinity;for(let i=0;i<h.cards.length;i++){if(h.cards[i].clues.length>0)continue;const d=dangerScore(p[i],v);if(d<ld){ld=d;si=i;}}if(si>=0)return{type:'discard',playerIndex:pi,cardIndex:si}as GameAction;}
  if(l.some(a=>a.type==='discard'))return{type:'discard',playerIndex:pi,cardIndex:chop(v)}as GameAction;
  return l[0]as GameAction;
}

// ═══ Runner ═══
function run(bot: (s:GameState,p:number)=>GameAction, n:number, np:number) {
  const sc:number[]=[]; let ts=0;
  for(let seed=1000;seed<1000+n;seed++){
    let s=createInitialState({numPlayers:np,seed});
    while(s.status==='playing'&&s.turn<100){let a=bot(s,s.currentPlayer);if(validateAction(s,a))a=getLegalActions(s)[0];s=applyAction(s,a);}
    sc.push(getScore(s.fireworks));ts+=s.strikes.current;
  }
  const d=[0,0,0,0,0,0];for(const s of sc)d[Math.min(Math.floor(s/5),5)]++;
  return{avg:sc.reduce((a,b)=>a+b,0)/n,best:Math.max(...sc),worst:Math.min(...sc),strikes:ts/n,d20:d[4]+d[5],d25:d[5]};
}

console.log('═══ Final Push to avg 20 ═══\n');

// 2-player tests (1000 games each)
console.log('--- 2 Players (1000 games) ---');
const bots: [string, (s:GameState,p:number)=>GameAction][] = [
  ['Current (19.1)', botCurrent],
  ['Dir1: Enhanced Protocol', botProtocol],
  ['Dir2: Zero-Strike', botZeroStrike],
];

for (const [name, bot] of bots) {
  const r = run(bot, 1000, 2);
  console.log(`  ${name.padEnd(25)} avg=${r.avg.toFixed(1)} best=${r.best} worst=${r.worst} s=${r.strikes.toFixed(2)} 20+:${r.d20} 25:${r.d25}`);
}

// 3-player test
console.log('\n--- 3 Players (500 games) ---');
for (const [name, bot] of bots) {
  const r = run(bot, 500, 3);
  console.log(`  ${name.padEnd(25)} avg=${r.avg.toFixed(1)} best=${r.best} worst=${r.worst} s=${r.strikes.toFixed(2)} 20+:${r.d20} 25:${r.d25}`);
}

// 4-player test
console.log('\n--- 4 Players (500 games) ---');
for (const [name, bot] of bots) {
  const r = run(bot, 500, 4);
  console.log(`  ${name.padEnd(25)} avg=${r.avg.toFixed(1)} best=${r.best} worst=${r.worst} s=${r.strikes.toFixed(2)} 20+:${r.d20} 25:${r.d25}`);
}
