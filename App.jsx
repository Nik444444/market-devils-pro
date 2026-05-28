import { useCallback, useEffect, useMemo, useState } from 'react'
import './styles.css'

const LS = { groq:'echo_groq_key', twelve:'echo_twelve_key', model:'echo_model' }
const ASSETS = [
  {id:'EUR', name:'EUR/USD', symbol:'EUR/USD', q:'EUR USD euro dollar forex', pair:'GBP/USD', pip:0.0001, unit:'пипс', accent:'#10b981'},
  {id:'GBP', name:'GBP/USD', symbol:'GBP/USD', q:'GBP USD pound dollar forex', pair:'EUR/USD', pip:0.0001, unit:'пипс', accent:'#f59e0b'},
  {id:'JPY', name:'USD/JPY', symbol:'USD/JPY', q:'USD JPY dollar yen forex', pair:'EUR/USD', pip:0.01, unit:'пипс', accent:'#ec4899'},
  {id:'XAU', name:'XAU/USD', symbol:'XAU/USD', q:'gold XAU USD bullion', pair:'EUR/USD', pip:1, unit:'$', accent:'#eab308'},
  {id:'BTC', name:'BTC/USD', symbol:'BTC/USD', q:'bitcoin BTC USD crypto', pair:'ETH/USD', pip:100, unit:'пт', accent:'#f97316'},
  {id:'ETH', name:'ETH/USD', symbol:'ETH/USD', q:'ethereum ETH USD crypto', pair:'BTC/USD', pip:10, unit:'пт', accent:'#8b5cf6'},
]
const SESSIONS = [
  {id:'asia', label:'Азия', short:'ASIA', start:1, end:9, color:'#eef2ff', stroke:'#6366f1'},
  {id:'frank', label:'Франкфурт', short:'FRANK', start:9, end:10, color:'#fff7ed', stroke:'#fb923c'},
  {id:'london', label:'Лондон', short:'LONDON', start:10, end:15, color:'#ecfdf5', stroke:'#10b981'},
  {id:'ny', label:'Нью-Йорк', short:'NY', start:15, end:23.5, color:'#fff1f2', stroke:'#fb7185'},
]
const fmt = (n,d=5)=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:d})
const pct = n=>`${Math.round(n)}%`
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n))
const lsGet=k=>{try{return localStorage.getItem(k)||''}catch{return''}}
const lsSet=(k,v)=>{try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch{}}
const berlinParts = d => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).reduce((a,p)=>(a[p.type]=p.value,a),{})
const dayKey=d=>{const p=berlinParts(d);return `${p.year}-${p.month}-${p.day}`}
const hourBE=d=>{const p=berlinParts(d);return (+p.hour)+(+p.minute)/60}
const timeBE=d=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'}).format(d)
const dur=(mins)=> mins<60?`${Math.round(mins)} мин`:`${Math.floor(mins/60)}ч ${Math.round(mins%60)}м`
function sessionByHour(h){return SESSIONS.find(s=>h>=s.start&&h<s.end)||{id:'off',label:'Вне сессии',short:'OFF',stroke:'#94a3b8',color:'#f8fafc'}}
function pip(asset, value){return Math.abs(value)/(asset.pip||0.0001)}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function med(a){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function min(a){return a.length?Math.min(...a):0}
function max(a){return a.length?Math.max(...a):0}
function nearestRound(price, asset){const step=asset.id==='XAU'?10:asset.id==='JPY'?0.5:asset.id==='BTC'?1000:asset.id==='ETH'?100:0.005;return Math.round(price/step)*step}

function demoCandles(asset){
  const base={EUR:1.137,GBP:1.272,JPY:156.2,XAU:2345,BTC:68000,ETH:3600}[asset.id]||1
  const out=[]; let p=base; const now=Date.now(); const start=now-3600*5*60*1000
  for(let i=0;i<3600;i++){
    const k=asset.id==='BTC'?55:asset.id==='ETH'?5:asset.id==='XAU'?0.55:asset.id==='JPY'?0.018:0.00011
    const h=hourBE(new Date(start+i*5*60000));
    const impulse=(h>8&&h<10?1.6:0)+(h>14.5&&h<16.5?2.2:0)
    const wave=Math.sin(i/37)*k*.9+Math.sin(i/123)*k*2.1
    const d=wave*.12+(Math.random()-.5)*k*(1.2+impulse)+(i%640===0? k*11*(Math.random()>.5?1:-1):0)
    const o=p; p+=d; const c=p; const hi=Math.max(o,c)+Math.random()*k*(1.7+impulse); const lo=Math.min(o,c)-Math.random()*k*(1.7+impulse)
    out.push({time:new Date(start+i*5*60000),open:o,high:hi,low:lo,close:c,volume:100+Math.random()*900})
  }
  return out
}
function normalize(values){return (values||[]).slice().reverse().map(v=>({time:new Date((v.datetime||'').replace(' ','T')+'Z'),open:+v.open,high:+v.high,low:+v.low,close:+v.close,volume:+(v.volume||0)})).filter(x=>Number.isFinite(x.close)&&x.time instanceof Date&&!isNaN(x.time))}
async function fetchCandles(asset,key,interval='5min',outputsize=5000){
  if(!key){
    const base=demoCandles(asset)
    const mins={ '5min':5,'15min':15,'1h':60,'4h':240,'1day':1440,'1week':10080 }[interval]||5
    return mins===5 ? base : bucket(base, mins)
  }
  const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(asset.symbol)}&interval=${interval}&outputsize=${outputsize}&timezone=UTC&apikey=${key}`
  const r=await fetch(url); const d=await r.json()
  if(d.status==='error'||d.code) throw new Error(d.message||'Twelve Data не отдал свечи')
  const a=normalize(d.values); if(a.length<50) throw new Error('Мало свечей от Twelve Data')
  return a
}
function groupDays(candles){const map=new Map(); for(const c of candles){const k=dayKey(c.time); if(!map.has(k))map.set(k,[]); map.get(k).push(c)} return [...map.entries()].map(([day,c])=>({day,c:c.sort((a,b)=>a.time-b.time)})).filter(d=>d.c.length>20)}
function hiLo(c){if(!c?.length)return null;let hi=c[0],lo=c[0]; for(const x of c){if(x.high>hi.high)hi=x;if(x.low<lo.low)lo=x} return {high:hi.high,low:lo.low,range:hi.high-lo.low,highCandle:hi,lowCandle:lo,highTime:timeBE(hi.time),lowTime:timeBE(lo.time)}}
function candlesIn(c,start,end){return c.filter(x=>{const h=hourBE(x.time); return h>=start && h<end})}
function sessionHL(dayCandles){const o={}; for(const s of SESSIONS){o[s.id]={...s, ...(hiLo(candlesIn(dayCandles,s.start,s.end))||{})}} return o}
function trueRange(c){const out=[]; for(let i=1;i<c.length;i++){out.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close)))} return out}
function atr(c,n=14){const tr=trueRange(c); return avg(tr.slice(-n))}
function swings(c,l=2){const sh=[],sl=[]; for(let i=l;i<c.length-l;i++){const w=c.slice(i-l,i+l+1); if(c[i].high===Math.max(...w.map(x=>x.high)))sh.push({...c[i],i}); if(c[i].low===Math.min(...w.map(x=>x.low)))sl.push({...c[i],i})} return {sh,sl}}
function fvg(c){const out=[]; for(let i=2;i<c.length;i++){const a=c[i-2],b=c[i]; if(a.high<b.low)out.push({type:'LONG',from:a.high,to:b.low,mid:(a.high+b.low)/2,i,time:b.time}); if(a.low>b.high)out.push({type:'SHORT',from:b.high,to:a.low,mid:(b.high+a.low)/2,i,time:b.time})} return out.slice(-12).reverse()}
function bucket(candles, minutes){
  const map=new Map();
  for(const c of candles){
    const t=c.time.getTime(); const k=Math.floor(t/(minutes*60000))*minutes*60000;
    if(!map.has(k)) map.set(k,{time:new Date(k),open:c.open,high:c.high,low:c.low,close:c.close,volume:0});
    const b=map.get(k); b.high=Math.max(b.high,c.high); b.low=Math.min(b.low,c.low); b.close=c.close; b.volume+=(c.volume||0);
  }
  return [...map.values()].sort((a,b)=>a.time-b.time)
}
function trendOf(c){
  if(!c?.length) return {dir:'WAIT', text:'нет данных', strength:0};
  const last=c.at(-1), slice=c.slice(-Math.min(80,c.length));
  const h=hiLo(slice); const m=(h.high+h.low)/2;
  const fast=avg(c.slice(-8).map(x=>x.close)), slow=avg(c.slice(-24).map(x=>x.close));
  let dir='WAIT'; if(last.close>m && fast>slow) dir='LONG'; if(last.close<m && fast<slow) dir='SHORT';
  const strength=clamp(Math.round(Math.abs(fast-slow)/Math.max(h.range,1e-9)*350+45),42,88);
  return {dir, text:dir==='LONG'?'структура выше equilibrium':'структура ниже equilibrium', strength, high:h.high, low:h.low, mid:m, range:h.range}
}
function lastBreak(c){
  const sw=swings(c,2), last=c.at(-1), sh=sw.sh.at(-2), sl=sw.sl.at(-2);
  if(sh && last.close>sh.high) return {type:'BOS вверх', level:sh.high, time:timeBE(last.time)};
  if(sl && last.close<sl.low) return {type:'BOS вниз', level:sl.low, time:timeBE(last.time)};
  const lh=sw.sh.at(-1), ll=sw.sl.at(-1);
  if(lh && last.high>lh.high && last.close<lh.high) return {type:'Sweep high', level:lh.high, time:timeBE(last.time)};
  if(ll && last.low<ll.low && last.close>ll.low) return {type:'Sweep low', level:ll.low, time:timeBE(last.time)};
  return {type:'слом не подтверждён', level:null, time:'—'}
}
function findPOI(c){
  const gaps=fvg(c).slice(0,5);
  const last=c.at(-1); if(!last) return [];
  return gaps.map(g=>({label:g.type==='LONG'?'Bullish FVG / POI':'Bearish FVG / POI', price:g.mid, from:g.from, to:g.to, side:g.type, dist:Math.abs(g.mid-last.close)})).sort((a,b)=>a.dist-b.dist).slice(0,3)
}


function rrTargets({bias,last,invalid,levels,asset}){
  if(!last || bias==='WAIT' || !invalid?.price) return [];
  const entry=last.close;
  const risk=Math.abs(entry-invalid.price);
  if(!Number.isFinite(risk)||risk<=0) return [];
  const dir=bias==='LONG'?1:-1;
  const candidates=(levels||[])
    .filter(l=>Number.isFinite(l.price))
    .filter(l=> dir===1 ? l.price>entry+risk*1.95 : l.price<entry-risk*1.95)
    .sort((a,b)=> dir===1 ? a.price-b.price : b.price-a.price);
  const mapped=candidates.slice(0,3).map((l,i)=>({
    ...l,
    name:`TP${i+1} · ${l.label}`,
    rr:Math.abs(l.price-entry)/risk,
    reason:`цель не ближе 1:${(Math.abs(l.price-entry)/risk).toFixed(1)} от риска`
  }));
  if(mapped.length) return mapped;
  const synthetic=entry+dir*risk*2;
  return [{label:'2R минимум',price:synthetic,type:'rr',side:dir===1?'buy':'sell',name:'TP1 · 2R минимум',rr:2,reason:'минимальная цель 1:2, так как дальше нет чистой ликвидности в видимой зоне'}];
}

function tdaAnalysis({asset,h1,h4,d1,w1,c5,m}){
  const W=trendOf(w1), D=trendOf(d1), H4=trendOf(h4), H1=trendOf(h1);
  const base = h1?.length ? h1 : bucket(c5,60);
  const lb=lastBreak(base); const pois=findPOI(base);
  const prevDay=d1?.at(-2), prevWeek=w1?.at(-2), last=(base.at(-1)||c5.at(-1));
  const levels=[];
  if(prevWeek){levels.push({label:'PWH', price:prevWeek.high, type:'weekly', side:'buy', source:'недельный high'}); levels.push({label:'PWL', price:prevWeek.low, type:'weekly', side:'sell', source:'недельный low'})}
  if(prevDay){levels.push({label:'PDH', price:prevDay.high, type:'daily', side:'buy', source:'дневной high'}); levels.push({label:'PDL', price:prevDay.low, type:'daily', side:'sell', source:'дневной low'})}
  if(m?.sess?.asia?.high) levels.push({label:'Asia H',price:m.sess.asia.high,type:'session',side:'buy',source:'верх Азии'});
  if(m?.sess?.asia?.low) levels.push({label:'Asia L',price:m.sess.asia.low,type:'session',side:'sell',source:'низ Азии'});
  if(m?.sess?.london?.high) levels.push({label:'London H',price:m.sess.london.high,type:'session',side:'buy',source:'верх Лондона'});
  if(m?.sess?.london?.low) levels.push({label:'London L',price:m.sess.london.low,type:'session',side:'sell',source:'низ Лондона'});
  const h1sw=swings(base,2), h4sw=swings(h4?.length?h4:bucket(c5,240),2);
  h4sw.sh.slice(-3).forEach((x,i)=>levels.push({label:`H4 FH${i+1}`,price:x.high,type:'fractal',side:'buy',source:'H4 fractal high',time:x.time}));
  h4sw.sl.slice(-3).forEach((x,i)=>levels.push({label:`H4 FL${i+1}`,price:x.low,type:'fractal',side:'sell',source:'H4 fractal low',time:x.time}));
  h1sw.sh.slice(-4).forEach((x,i)=>levels.push({label:`H1 FH${i+1}`,price:x.high,type:'fractal',side:'buy',source:'H1 fractal high',time:x.time}));
  h1sw.sl.slice(-4).forEach((x,i)=>levels.push({label:`H1 FL${i+1}`,price:x.low,type:'fractal',side:'sell',source:'H1 fractal low',time:x.time}));
  for(const p of pois) levels.push({label:p.label,price:p.price,type:'poi',side:p.side==='LONG'?'buy':'sell',zone:[p.from,p.to],source:'FVG POI'});
  const uniq=[]; for(const l of levels.filter(x=>Number.isFinite(x.price))){ if(!uniq.some(u=>Math.abs(u.price-l.price)<=Math.max(Math.abs(last.close)*0.00008,asset.pip*3))) uniq.push(l) }
  const alignedLong=[W,D,H4,H1].filter(x=>x.dir==='LONG').length, alignedShort=[W,D,H4,H1].filter(x=>x.dir==='SHORT').length;
  const bias=alignedLong>alignedShort?'LONG':alignedShort>alignedLong?'SHORT':m?.bias||'WAIT';
  const above=uniq.filter(l=>l.price>last.close).sort((a,b)=>a.price-b.price); const below=uniq.filter(l=>l.price<last.close).sort((a,b)=>b.price-a.price);
  const invalid=(bias==='LONG'?below.find(l=>l.side==='sell'):above.find(l=>l.side==='buy'))||null;
  const targets=rrTargets({bias,last,invalid,levels:uniq,asset});
  const fta=targets[0]||null;
  const htfText = `${W.dir}/${D.dir}/${H4.dir}/${H1.dir}`;
  const plan = bias==='LONG'
    ? `Приоритет LONG, если цена удерживает discount/POI и даёт H1 displacement. Первый FTA: ${fta?fta.label:'ближайшая buy-side ликвидность'}. Инвалидация: ${invalid?invalid.label:'последний H1 fractal low'}.`
    : bias==='SHORT'
      ? `Приоритет SHORT, если цена делает sweep buy-side или ретест premium/POI и ломает H1 вниз. Первый FTA: ${fta?fta.label:'ближайшая sell-side ликвидность'}. Инвалидация: ${invalid?invalid.label:'последний H1 fractal high'}.`
      : `HTF не синхронизирован (${htfText}). План: ждать снятие одной стороны + H1 BOS/displacement, вход только после подтверждения.`;
  const checklist=[`HTF стек: ${htfText}`,`W1: ${W.text}`,`D1: ${D.text}`,`H4: ${H4.text}`,`H1: ${H1.text}`,`Триггер: ${lb.type}${lb.level?' @ '+fmt(lb.level):''}`,`POI: ${pois[0]?.label||'нет чистого FVG рядом'}`]
  return {bias,W,D,H4,H1,lb,pois,levels:uniq,targets,invalid,fta,plan,checklist,chart:base.slice(-120),h1sw,h4sw};
}

function statPack(vals,asset){return {med:med(vals),avg:avg(vals),min:min(vals),max:max(vals),count:vals.length,medP:pip(asset,med(vals)),avgP:pip(asset,avg(vals)),minP:pip(asset,min(vals)),maxP:pip(asset,max(vals))}}
function rangeStats(days, asset){
  const daily=days.map(d=>hiLo(d.c)?.range).filter(Boolean)
  const asia=days.map(d=>hiLo(candlesIn(d.c,1,9))?.range).filter(Boolean)
  const ib=days.map(d=>hiLo(candlesIn(d.c,15,16))?.range).filter(Boolean)
  const ibExt=[]
  for(const d of days){const ibh=hiLo(candlesIn(d.c,15,16)), rest=hiLo(candlesIn(d.c,16,23.5)); if(ibh&&rest) ibExt.push(Math.max(0,rest.high-ibh.high,ibh.low-rest.low))}
  return {daily:statPack(daily,asset), asia:statPack(asia,asset), ib:statPack(ib,asset), ibExt:statPack(ibExt,asset)}
}
function timeWindow(items, kind, side){
  const mins=items.map(x=>{const ex=kind==='high'?x.highCandle:x.lowCandle; if(!ex)return null; const h=hourBE(ex.time); return Math.round(h*60)}).filter(x=>x!==null)
  if(mins.length<3)return 'мало данных'
  const q=side==='short'?mins.sort((a,b)=>a-b).slice(Math.floor(mins.length*.55)):mins.sort((a,b)=>a-b).slice(0,Math.ceil(mins.length*.45))
  return `${hm(min(q))} - ${hm(max(q))}`
}
function hm(m){m=((Math.round(m)%1440)+1440)%1440; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
function peakStats(days){
  const combos={}; const rows=[]
  for(const d of days){const all=hiLo(d.c); if(!all)continue; const hiS=sessionByHour(hourBE(all.highCandle.time)).short; const loS=sessionByHour(hourBE(all.lowCandle.time)).short; const first=all.highCandle.time<all.lowCandle.time?hiS:loS; const second=all.highCandle.time<all.lowCandle.time?loS:hiS; const key=`${first}|${second}`; combos[key]=(combos[key]||0)+1}
  const total=Object.values(combos).reduce((a,b)=>a+b,0)||1
  for(const [k,v] of Object.entries(combos)){const [first,second]=k.split('|'); rows.push({first,second,prob:Math.round(v/total*100),count:v})}
  return rows.sort((a,b)=>b.prob-a.prob).slice(0,6)
}
function expectations(days, currentDay, asset){
  const sess=currentDay?sessionHL(currentDay.c):{}
  const allDays=days.slice(0,-1).length>3?days.slice(0,-1):days
  const bySess={}; for(const s of SESSIONS){const arr=allDays.map(d=>hiLo(candlesIn(d.c,s.start,s.end))).filter(Boolean); bySess[s.id]={
    ...s,
    highShort:timeWindow(arr,'high','short'), highLong:timeWindow(arr,'high','long'), lowShort:timeWindow(arr,'low','short'), lowLong:timeWindow(arr,'low','long'),
    stat:statPack(arr.map(x=>x.range),asset), today:sess[s.id]||{...s}
  }}
  return bySess
}
function calcSMT(c,pair){if(!pair?.length)return {state:'NO DATA',text:'Для SMT нужна вторая пара.'}; const a=swings(c),b=swings(pair); const ah=a.sh.at(-1),aph=a.sh.at(-2),bh=swings(pair).sh.at(-1),bph=swings(pair).sh.at(-2); const al=a.sl.at(-1),apl=a.sl.at(-2),bl=swings(pair).sl.at(-1),bpl=swings(pair).sl.at(-2); if(ah&&aph&&bh&&bph&&ah.high>aph.high&&!(bh.high>bph.high))return {state:'BEARISH SMT',text:'Основной актив обновил high, коррелят не подтвердил.'}; if(al&&apl&&bl&&bpl&&al.low<apl.low&&!(bl.low<bpl.low))return {state:'BULLISH SMT',text:'Основной актив обновил low, коррелят не подтвердил.'}; return {state:'NEUTRAL',text:'SMT не даёт чистого перекоса.'}}
function analyze(c, pair, asset, tfs={}){
  const days=groupDays(c); const currentDay=days.at(-1); const current=currentDay?.c||c.slice(-288); const hld=hiLo(current); const all=hiLo(c); const last=c.at(-1), prev=c.at(-2)||last; const A=atr(c), sw=swings(c), fvgs=fvg(c)
  const stats=rangeStats(days,asset); const sess=sessionHL(current); const exp=expectations(days,currentDay,asset); const peaks=peakStats(days)
  const hi=hld?.high||last.high, lo=hld?.low||last.low, mid=(hi+lo)/2; const pd=(last.close-lo)/Math.max(hi-lo,1e-9)*100
  const levels=[['HOD',hi,'buy'],['LOD',lo,'sell'],['EQ дня',mid,'eq'],['Asia H',sess.asia?.high,'buy'],['Asia L',sess.asia?.low,'sell'],['London H',sess.london?.high,'buy'],['London L',sess.london?.low,'sell'],['NY H',sess.ny?.high,'buy'],['NY L',sess.ny?.low,'sell'],['Round',nearestRound(last.close,asset),'eq']].filter(x=>Number.isFinite(x[1])).map(([label,price,type])=>({label,price,type,dist:Math.abs((price-last.close)/Math.max(last.close,1e-9))*100,side:price>last.close?'выше':'ниже'})).sort((a,b)=>a.dist-b.dist)
  const above=levels.filter(l=>l.price>last.close&&l.type!=='eq').sort((a,b)=>a.price-b.price)[0]; const below=levels.filter(l=>l.price<last.close&&l.type!=='eq').sort((a,b)=>b.price-a.price)[0]
  const body=Math.abs(last.close-last.open); const displacement=body>Math.max(A*.55,(last.high-last.low)*.55); const lastSH=sw.sh.at(-1), lastSL=sw.sl.at(-1); const bosUp=lastSH&&last.close>lastSH.high; const bosDn=lastSL&&last.close<lastSL.low
  const swept={asiaH:last.high>(sess.asia?.high||Infinity),asiaL:last.low<(sess.asia?.low||-Infinity),londonH:last.high>(sess.london?.high||Infinity),londonL:last.low<(sess.london?.low||-Infinity),hod:last.high>=hi,lod:last.low<=lo}
  let bias='WAIT', score=48, reasons=[]
  if(swept.asiaL&&displacement&&last.close>prev.close){bias='LONG';score+=18;reasons.push('Asia Low снят, есть бычий displacement')}
  if(swept.asiaH&&displacement&&last.close<prev.close){bias='SHORT';score+=18;reasons.push('Asia High снят, есть медвежий displacement')}
  if(bosUp){bias=bias==='SHORT'?'WAIT':'LONG'; score+=9; reasons.push('BOS вверх')}
  if(bosDn){bias=bias==='LONG'?'WAIT':'SHORT'; score+=9; reasons.push('BOS вниз')}
  if(pd>70){if(bias!=='LONG') bias='SHORT'; score+=7; reasons.push('цена в premium')}
  if(pd<30){if(bias!=='SHORT') bias='LONG'; score+=7; reasons.push('цена в discount')}
  if(!displacement){score-=8; reasons.push('нет displacement — подтверждения для входа мало')}
  if(!reasons.length)reasons.push('нет чистой статистической модели')
  score=clamp(Math.round(score),40,86)
  let first='WAIT', fl=above||below, prob=50; const up=above?.dist??999, dn=below?.dist??999
  if(up<dn){first='BUY-SIDE';fl=above;prob=56+Math.min(18,(dn-up)*2600)} else {first='SELL-SIDE';fl=below;prob=56+Math.min(18,(up-dn)*2600)}
  if(pd>75&&first==='BUY-SIDE')prob-=7; if(pd<25&&first==='SELL-SIDE')prob-=7; prob=clamp(Math.round(prob),45,76)
  const extensionPips=pip(asset,hi-lo); const dailyCompletion=stats.daily.avgP?clamp(extensionPips/stats.daily.avgP*100,0,180):0
  const active=sessionByHour(hourBE(new Date()))
  const base={days,current,currentDay,last,prev,asset,all,hld,stats,sess,exp,peaks,levels,above,below,atr:A,fvgs,sw,pd,mid,hi,lo,change:(last.close-(current[0]?.open||last.open))/(current[0]?.open||last.open)*100,displacement,bosUp,bosDn,structure:bosUp?'BOS вверх':bosDn?'BOS вниз':'диапазон',swept,bias,score,reasons,first,firstLevel:fl,firstProb:prob,extensionPips,dailyCompletion,active,smt:calcSMT(c,pair)}
  const tda=tdaAnalysis({asset,h1:tfs.h1||bucket(c,60),h4:tfs.h4||bucket(c,240),d1:tfs.d1||bucket(c,1440),w1:tfs.w1||bucket(c,10080),c5:c,m:base})
  return {...base, tda, chartCandles:tda.chart, narrative:makeNarrative({...base,bias:tda.bias||bias,score,first,fl,prob,pd,dailyCompletion,displacement,reasons})}
}
function makeNarrative(x){return `${x.bias==='WAIT'?'Ждать подтверждение':x.bias==='LONG'?'Приоритет лонг-модели':'Приоритет шорт-модели'}. Первым вероятнее ${x.first} около ${x.fl?.label||'ближайшей ликвидности'} (${Math.round(x.prob)}%). P/D: ${Math.round(x.pd)}%. Daily extension выполнен примерно на ${Math.round(x.dailyCompletion)}% от средней доступной истории. ${x.displacement?'Displacement есть.':'Displacement пока нет.'}`}
async function groq(messages,max=900,temp=.05){const key=lsGet(LS.groq); if(!key) throw new Error('Вставь Groq key в кабинете'); const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:lsGet(LS.model)||'llama-3.1-8b-instant',temperature:temp,max_tokens:max,messages})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content||''}
function jsonFrom(t){const a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch{}} return null}

function impactCalendar(asset){
  const now=new Date();
  const base=[
    {time:'09:00',cur:'EUR',event:'German Ifo / PMI bloc',impact:'MEDIUM',why:'может расширить EUR диапазон в Лондоне'},
    {time:'11:00',cur:'EUR',event:'Eurozone CPI / ECB speakers',impact:'HIGH',why:'главный риск для EUR/USD до NY'},
    {time:'14:30',cur:'USD',event:'US Jobless Claims / GDP / PCE',impact:'HIGH',why:'часто даёт sweep перед NY continuation'},
    {time:'16:00',cur:'USD',event:'US ISM / Consumer Confidence',impact:'HIGH',why:'окно импульса после открытия NY'},
    {time:'20:00',cur:'USD',event:'FOMC / Fed speakers',impact:'HIGH',why:'может сломать дневной bias'},
    {time:'23:30',cur:'USD',event:'API / crypto-liquidity window',impact:'LOW',why:'актуально для BTC/ETH и позднего NY'},
  ];
  const assetCur = asset.id==='EUR'?'EUR':asset.id==='GBP'?'GBP':asset.id==='JPY'?'JPY':asset.id==='XAU'?'USD':asset.id==='BTC'||asset.id==='ETH'?'USD':'USD';
  return base.filter(e=>e.cur==='USD'||e.cur===assetCur).map((e,i)=>({...e,id:i,focus: e.impact==='HIGH'}));
}
function scenarioRows(m){
  const tp=m.tda.targets||[]; const poi=m.tda.pois?.[0]; const b=m.tda.bias;
  const react = poi ? `${poi.label} ${fmt(Math.min(poi.from,poi.to))}–${fmt(Math.max(poi.from,poi.to))}` : (m.tda.invalid?`${m.tda.invalid.label} ${fmt(m.tda.invalid.price)}`:'после sweep + BOS');
  const main = b==='LONG'
    ? {title:'Основной сценарий LONG', trigger:`Сначала снять sell-side (${m.below?.label||'нижняя ликвидность'}), затем H1 BOS вверх`, entry:`Реакция от ${react}`, tp:tp.slice(0,3).map(x=>`${x.name} ${fmt(x.price)}`).join(' → ')||'ближайшая buy-side ликвидность'}
    : b==='SHORT'
      ? {title:'Основной сценарий SHORT', trigger:`Сначала снять buy-side (${m.above?.label||'верхняя ликвидность'}), затем H1 BOS вниз`, entry:`Реакция от ${react}`, tp:tp.slice(0,3).map(x=>`${x.name} ${fmt(x.price)}`).join(' → ')||'ближайшая sell-side ликвидность'}
      : {title:'Сценарий WAIT', trigger:'Дождаться sweep одной стороны диапазона и подтверждённый H1 BOS', entry:`Работа только от POI/FTA: ${react}`, tp:'после подтверждения — ближайшая противоположная ликвидность'};
  const alt = b==='LONG'
    ? {title:'Альтернатива', trigger:`Если пробьют ${m.tda.invalid?.label||'invalid'} без возврата`, entry:'LONG отменяется, ждать новый sell-side sweep', tp:'цели пересчитать после нового H1 закрытия'}
    : b==='SHORT'
      ? {title:'Альтернатива', trigger:`Если пробьют ${m.tda.invalid?.label||'invalid'} без возврата`, entry:'SHORT отменяется, ждать новый buy-side sweep', tp:'цели пересчитать после нового H1 закрытия'}
      : {title:'Альтернатива', trigger:'Если новости дают импульс без ретеста', entry:'не догонять, ждать FTA → pullback', tp:'только после формирования нового POI'};
  return [main, alt];
}


function macroPulse(news, asset){
  const items=(news||[]).slice(0,8);
  const score=items.reduce((a,n)=>a+(n.impact==='LONG'?1:n.impact==='SHORT'?-1:0)*(n.urgency==='HIGH'?2:n.urgency==='MEDIUM'?1.2:.6),0);
  const bias=score>1.2?'LONG':score<-1.2?'SHORT':'WAIT';
  const high=items.filter(n=>n.urgency==='HIGH').length;
  const drivers=items.slice(0,3).map(n=>n.title_ru||n.title).filter(Boolean);
  return {bias,score,high,drivers,text:bias==='LONG'?'Макро-фон поддерживает покупки, но вход только после sweep/BOS.':bias==='SHORT'?'Макро-фон давит вниз, но вход только после sweep/BOS.':'Макро-фон смешанный: приоритет техническому плану и новостным окнам.'};
}

async function fetchNews(asset){
  const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(asset.q)}&mode=artlist&format=json&maxrecords=8&sort=hybridrel`
  const r=await fetch(url); const d=await r.json(); const raw=(d.articles||[]).slice(0,8).map(a=>({title:a.title,source:a.sourceCommonName||a.domain||'GDELT',url:a.url,time:a.seendate||''}))
  if(!raw.length) return []
  const key=lsGet(LS.groq); if(!key) return raw.map(x=>({...x,title_ru:x.title,impact:'WAIT',summary_ru:'Вставь Groq key, чтобы получить русский перевод и impact.',urgency:'LOW'}))
  const txt=await groq([{role:'system',content:'Ты переводчик и рыночный редактор. Верни только JSON: {items:[{title_ru,summary_ru,impact:LONG|SHORT|WAIT,urgency:HIGH|MEDIUM|LOW}]}. Не придумывай факты.'},{role:'user',content:`Актив ${asset.name}. Переведи на русский и оцени impact. Заголовки: ${JSON.stringify(raw)}`}],1200,.05)
  const j=jsonFrom(txt); return raw.map((x,i)=>({...x,...(j?.items?.[i]||{})}))
}

export default function App(){
  const [assetId,setAssetId]=useState('EUR'); const [candles,setCandles]=useState([]); const [pair,setPair]=useState([]); const [tfData,setTfData]=useState({}); const [loading,setLoading]=useState(false); const [err,setErr]=useState(''); const [news,setNews]=useState([]); const [ai,setAi]=useState(null); const [settings,setSettings]=useState(false); const [keysTick,setKeysTick]=useState(0)
  const asset=ASSETS.find(a=>a.id===assetId)||ASSETS[0]
  const refresh=useCallback(async()=>{setLoading(true);setErr('');setAi(null); try{const key=lsGet(LS.twelve); const c=await fetchCandles(asset,key,'5min',5000); setCandles(c); const [h1,h4,d1,w1]=await Promise.allSettled([fetchCandles(asset,key,'1h',1000),fetchCandles(asset,key,'4h',800),fetchCandles(asset,key,'1day',500),fetchCandles(asset,key,'1week',260)]); setTfData({h1:h1.value||bucket(c,60),h4:h4.value||bucket(c,240),d1:d1.value||bucket(c,1440),w1:w1.value||bucket(c,10080)}); const pa=ASSETS.find(a=>a.symbol===asset.pair); if(pa){try{setPair(await fetchCandles(pa,key))}catch{setPair([])}}}catch(e){setErr(e.message); const dc=demoCandles(asset); setCandles(dc); setTfData({h1:bucket(dc,60),h4:bucket(dc,240),d1:bucket(dc,1440),w1:bucket(dc,10080)}); setPair([])} finally{setLoading(false)}},[assetId,keysTick])
  useEffect(()=>{refresh()},[refresh])
  useEffect(()=>{const id=setInterval(()=>refresh(),60000); return ()=>clearInterval(id)},[refresh])
  useEffect(()=>{loadNews(); const id=setInterval(()=>loadNews(),60000); return ()=>clearInterval(id)},[assetId,keysTick])
  const m=useMemo(()=>candles.length?analyze(candles,pair,asset,tfData):null,[candles,pair,asset,tfData])
  const macro=useMemo(()=>macroPulse(news,asset),[news,asset])
  async function loadNews(){try{setNews(await fetchNews(asset))}catch(e){setErr('Новости: '+e.message)}}
  const runAI=async()=>{if(!m)return; try{const ctx={asset:asset.name,price:m.last.close,bias:m.bias,confidence:m.score,first:m.first,firstLevel:m.firstLevel,firstProb:m.firstProb,premiumDiscount:m.pd,extension:m.extensionPips,dailyCompletion:m.dailyCompletion,structure:m.structure,swept:m.swept,smt:m.smt,fvg:m.fvgs.slice(0,5),levels:m.levels.slice(0,8),tda:m.tda,targets:m.tda.targets,reasons:m.reasons}; const txt=await groq([{role:'system',content:'Ты prop/ICT ассистент. Пиши по-русски. Используй только данные из JSON. Не давай финансовый совет. Не придумывай уровни, новости или вероятности. Верни JSON: {headline,bias,plan,whatFirst,checklist:[...],execution:{entry,confirmation,invalid,target},risk}.'},{role:'user',content:JSON.stringify(ctx)}],900,.05); setAi(jsonFrom(txt)||{headline:'План',bias:m.bias,plan:txt,whatFirst:m.narrative,checklist:m.reasons,execution:{},risk:'Проверяй на графике.'})}catch(e){setErr('AI: '+e.message)}}
  if(!m) return <div className="boot">Загружаю EchoDesk…</div>
  return <div className="terminal">
    <Top asset={asset} setAssetId={setAssetId} loading={loading} refresh={refresh} setSettings={setSettings}/>
    <main className="grid">
      <Chart candles={m.chartCandles} m={m}/>
      <Cockpit m={m} macro={macro}/>
      <DailyPlan m={m}/>
      <MacroPanel macro={macro} news={news}/>
      <Calendar asset={asset}/>
      <News news={news}/>
      <TDA m={m}/>
      <SessionBoard m={m}/>
    </main>
    {settings&&<Settings close={()=>setSettings(false)} setKeysTick={setKeysTick}/>} {err&&<div className="toast" onClick={()=>setErr('')}>⚠️ {err}</div>}
  </div>
}
function Top({asset,setAssetId,loading,refresh,setSettings}){return <header className="top"><div className="brand"><b>MARKET DEVILS</b><span>EchoDesk · Statistical ICT Operating System</span></div><div className="assetbar">{ASSETS.map(a=><button key={a.id} onClick={()=>setAssetId(a.id)} className={a.id===asset.id?'on':''}>{a.name}</button>)}</div><div className="topActions"><button onClick={refresh}>{loading?'Загрузка…':'Обновить'}</button><span className="auto">AUTO 60s</span><button onClick={()=>setSettings(true)}>Ключи</button></div></header>}

function Command({m}){const b=m.tda?.bias||m.bias; return <section className="command card proPanel"><p>BIAS / дневной план</p><h1 className={b.toLowerCase()}>{b==='WAIT'?'WAIT':b}</h1><div className="score"><Ring v={m.score} c={b==='LONG'?'#0f9f6e':b==='SHORT'?'#c2410c':'#b7791f'}/><div><b>{m.score}%</b><span>качество контекста</span></div></div><h3>{m.tda.plan}</h3><div className="decisionStack"><div><small>Что ищем</small><b>{b==='LONG'?'снятие sell-side → реакция':b==='SHORT'?'снятие buy-side → реакция':'сначала sweep + BOS'}</b></div><div><small>Первая цель</small><b>{m.tda.fta?`${m.tda.fta.label} · ${fmt(m.tda.fta.price)}`:'после подтверждения'}</b></div><div><small>Инвалидация</small><b>{m.tda.invalid?`${m.tda.invalid.label} · ${fmt(m.tda.invalid.price)}`:'нет чистого уровня'}</b></div></div><div className="reasonList">{m.tda.checklist.slice(0,5).map((r,i)=><span key={i}>✓ {r}</span>)}</div></section>}

function Cockpit({m,macro}){const b=m.tda?.bias||m.bias;return <section className="cockpit card"><div className="biasLine"><small>BIAS</small><b className={b.toLowerCase()}>{b}</b><span>{m.score}%</span></div><div className="nowPrice"><small>Текущая цена</small><b>{fmt(m.last.close)}</b><em>{m.asset.name} · H1</em></div><div className="tradeMap"><div><small>Зона реакции</small><b>{m.tda.pois[0]?`${fmt(Math.min(m.tda.pois[0].from,m.tda.pois[0].to))}–${fmt(Math.max(m.tda.pois[0].from,m.tda.pois[0].to))}`:'ждать sweep + BOS'}</b></div><div><small>Инвалидация</small><b>{m.tda.invalid?`${m.tda.invalid.label} · ${fmt(m.tda.invalid.price)}`:'нет чистой'}</b></div><div><small>TP 1:2+</small><b>{m.tda.targets[0]?`${m.tda.targets[0].name} · ${fmt(m.tda.targets[0].price)}`:'после подтверждения'}</b></div></div><div className="whatFirst"><small>Первое снятие</small><b>{m.first} · {m.firstLevel?.label}</b><div className="probBar"><i style={{width:`${m.firstProb}%`}}/></div><span>{m.firstProb}% · ближайшая ликвидность + фракталы + P/D</span></div><div className="macroMini"><small>Макро фон</small><b className={macro.bias.toLowerCase()}>{macro.bias}</b><p>{macro.text}</p></div></section>}
function MacroPanel({macro,news}){return <section className="macroPanel card"><Title t="Макро-анализ" s="направление и риск по свежим заголовкам"/><div className="macroScore"><b className={macro.bias.toLowerCase()}>{macro.bias}</b><span>{macro.text}</span><em>{macro.high} high impact заголовков</em></div><div className="drivers">{macro.drivers.length?macro.drivers.map((d,i)=><p key={i}>• {d}</p>):<p>Новости ещё не загружены или нет Groq-перевода.</p>}</div></section>}

function Chart({candles,m}){
  const W=1680,H=820,P=64;
  const visible=(candles||[]).slice(-96);
  const important=[...m.tda.levels.filter(l=>['weekly','daily','session','fractal','poi'].includes(l.type)),...m.tda.targets,(m.tda.invalid?{...m.tda.invalid,label:'INVALID · '+m.tda.invalid.label,type:'invalid'}:null)].filter(l=>l&&Number.isFinite(l.price));
  const prices=[...visible.flatMap(x=>[x.high,x.low]),...important.map(l=>l.price)];
  const hi=Math.max(...prices), lo=Math.min(...prices), pad=(hi-lo)*0.08||1;
  const top=hi+pad, bot=lo-pad;
  const X=i=>P+i*(W-2*P)/Math.max(1,visible.length-1),Y=v=>P+(top-v)*(H-2*P)/(top-bot||1),step=(W-2*P)/Math.max(1,visible.length);
  const zones=[]; let active=null;
  visible.forEach((c,i)=>{const s=sessionByHour(hourBE(c.time)); if(s.id==='off'||s.id==='frank') return; if(!active||active.id!==s.id||dayKey(active.last.time)!==dayKey(c.time)){ if(active) zones.push(active); active={...s,start:i,end:i,last:c}; } else {active.end=i; active.last=c}}); if(active) zones.push(active);
  const levelColor=l=>l.type==='invalid'?'#fb7185':l.type==='rr'?'#22c55e':l.type==='poi'?'#c084fc':l.type==='weekly'?'#e5e7eb':l.type==='daily'?'#f59e0b':l.type==='fractal'?(l.side==='buy'?'#94a3b8':'#64748b'):'#2dd4bf';
  const keyLevels=important.sort((a,b)=>Math.abs(a.price-m.last.close)-Math.abs(b.price-m.last.close)).slice(0,10);
  const fractalMarkers=[...m.tda.h1sw.sh.slice(-8).map(x=>({kind:'high',price:x.high,time:x.time})),...m.tda.h1sw.sl.slice(-8).map(x=>({kind:'low',price:x.low,time:x.time}))];
  return <section className="chart card cleanChart terminalChart"><div className="chartHead"><div><h2>{m.asset.name} · 1ч · OANDA</h2><p>Рабочий график: фракталы · сессии · POI · invalidation · TP 1:2+</p></div><div className="quote"><b>{fmt(m.last.close)}</b><span className={m.change>=0?'long':'short'}>{m.change>=0?'+':''}{fmt(m.change,2)}%</span></div></div><svg viewBox={`0 0 ${W} ${H}`}>
    <defs><radialGradient id="chartBg" cx="50%" cy="25%" r="80%"><stop offset="0%" stopColor="#151b27"/><stop offset="65%" stopColor="#0b1018"/><stop offset="100%" stopColor="#060a10"/></radialGradient><filter id="softGlow"><feGaussianBlur stdDeviation="2.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect x="0" y="0" width={W} height={H} fill="url(#chartBg)"/>
    {[0,1,2,3,4].map(i=><line key={i} x1={P} x2={W-P} y1={P+i*(H-2*P)/4} y2={P+i*(H-2*P)/4} stroke="#1b2431" opacity=".58"/>)}
    {zones.map((z,i)=><g key={i}><rect x={X(z.start)} y={P} width={Math.max(step,X(z.end)-X(z.start)+step)} height={H-2*P} fill={z.id==='asia'?'#23314d':z.id==='london'?'#173b33':'#3d2029'} opacity=".24"/><text x={X(z.start)+8} y={P+18} fill={z.id==='asia'?'#93a7ff':z.id==='london'?'#51d0a7':'#ff8ea2'}>{z.label}</text></g>)}
    {m.tda.pois.slice(0,3).map((g,i)=><g key={'poi'+i}><rect x={P} y={Y(Math.max(g.from,g.to))} width={W-2*P} height={Math.max(8,Math.abs(Y(g.from)-Y(g.to)))} fill={g.side==='LONG'?'#10b981':'#ef4444'} opacity=".085"/><text x={W-P-130} y={Y(g.price)-6} fill="#c084fc">POI / FVG</text></g>)}
    {keyLevels.map((l,i)=><g key={i}><line x1={P} x2={W-P} y1={Y(l.price)} y2={Y(l.price)} stroke={levelColor(l)} strokeDasharray={l.type==='fractal'?'3 8':l.type==='poi'?'10 6':'none'} opacity={l.type==='fractal'?'.45':'.7'} /><rect x={W-P-148} y={Y(l.price)-14} width="140" height="22" rx="8" fill="#0f172a" opacity=".78"/><text x={W-P-140} y={Y(l.price)+1} fill={levelColor(l)}>{l.label} {fmt(l.price)}</text></g>)}
    {m.tda.targets.map((t,i)=><g key={'tp'+i}><line x1={P} x2={W-P} y1={Y(t.price)} y2={Y(t.price)} stroke="#22c55e" strokeWidth="1.15" strokeDasharray="7 7"/><text x={P+10} y={Y(t.price)-7} fill="#34d399">{t.name}</text></g>)}
    {visible.map((c,i)=>{const up=c.close>=c.open; return <g key={i}><line x1={X(i)} x2={X(i)} y1={Y(c.high)} y2={Y(c.low)} stroke="#d1d5db" opacity=".82"/><rect x={X(i)-step*.28} y={Y(Math.max(c.open,c.close))} width={Math.max(2,step*.56)} height={Math.max(2,Math.abs(Y(c.open)-Y(c.close)))} fill={up?'#e5e7eb':'#111827'} stroke={up?'#f8fafc':'#020617'} strokeWidth="1"/></g>})}
    {fractalMarkers.map((f,i)=>{const idx=visible.findIndex(c=>Math.abs(c.time-f.time)<1000); if(idx<0)return null; return <text key={i} x={X(idx)-5} y={f.kind==='high'?Y(f.price)-8:Y(f.price)+18} fill="#cbd5e1">×</text>})}
    <line x1={P} x2={W-P} y1={Y(m.last.close)} y2={Y(m.last.close)} stroke="#cbd5e1" strokeDasharray="2 8" opacity=".48"/><rect x={W-P-98} y={Y(m.last.close)-14} width="90" height="28" rx="8" fill="#334155"/><text x={W-P-88} y={Y(m.last.close)+4} fill="#f8fafc">NOW {fmt(m.last.close)}</text>
    {m.tda.invalid&&<g><line x1={P} x2={W-P} y1={Y(m.tda.invalid.price)} y2={Y(m.tda.invalid.price)} stroke="#fb7185" strokeDasharray="8 6" strokeWidth="1"/><rect x={P+8} y={Y(m.tda.invalid.price)-25} width="170" height="24" rx="8" fill="#451a23"/><text x={P+18} y={Y(m.tda.invalid.price)-9} fill="#fb7185">INVALID {fmt(m.tda.invalid.price)}</text></g>}
    {m.tda.targets.slice(0,3).map((t,i)=><g key={'targetBadge'+i}><rect x={P+8} y={Y(t.price)-26} width="190" height="24" rx="8" fill="#052e24"/><text x={P+18} y={Y(t.price)-10} fill="#34d399">{t.name} · RR {t.rr? t.rr.toFixed(1): '2+'}</text></g>)}
  </svg></section>
}

function MiniChart({data,label,level}){const c=(data||[]).slice(-60),W=260,H=120,P=12;if(!c.length)return <div className="miniChart empty">нет данных</div>;const hi=Math.max(...c.map(x=>x.high),level||c.at(-1).close),lo=Math.min(...c.map(x=>x.low),level||c.at(-1).close),pad=(hi-lo)*.08||1;const Y=v=>P+(hi+pad-v)*(H-2*P)/((hi+pad)-(lo-pad)||1),X=i=>P+i*(W-2*P)/Math.max(1,c.length-1),step=(W-2*P)/c.length;return <div className="miniChart"><small>{label}</small><svg viewBox={`0 0 ${W} ${H}`}>{level&&<line x1={P} x2={W-P} y1={Y(level)} y2={Y(level)} stroke="#ef4444" strokeDasharray="5 5"/>}{c.map((x,i)=>{const up=x.close>=x.open;return <g key={i}><line x1={X(i)} x2={X(i)} y1={Y(x.high)} y2={Y(x.low)} stroke="#64748b"/><rect x={X(i)-step*.28} y={Y(Math.max(x.open,x.close))} width={Math.max(1.5,step*.55)} height={Math.max(2,Math.abs(Y(x.open)-Y(x.close)))} fill={up?'#fff':'#111827'} stroke="#111827" strokeWidth=".8"/></g>})}</svg></div>}


function TDA({m}){return <section className="tda card proPanel"><Title t="Top Down Analysis" s="W1 → D1 → H4 → H1 · fractal based"/><div className="tfGrid">{[['W1',m.tda.W,m.tda.chart],['D1',m.tda.D,m.tda.chart],['H4',m.tda.H4,m.tda.chart],['H1',m.tda.H1,m.tda.chart]].map(([k,v,d])=><div className={'tf '+v.dir.toLowerCase()} key={k}><small>{k}</small><b>{v.dir}</b><span>{v.text}</span><em>{v.strength}%</em></div>)}</div><div className="analysisMap"><div><h3>Слом / sweep</h3><p>{m.tda.lb.type}{m.tda.lb.level?` на ${fmt(m.tda.lb.level)}`:''}. Это место должно быть подтверждено реакцией, иначе план остаётся наблюдением.</p><MiniChart data={m.tda.chart} label="H1 trigger zone" level={m.tda.lb.level}/></div><div><h3>POI / FTA</h3><p>POI: {m.tda.pois[0]?.label||'чистый FVG рядом не найден'}. FTA: {m.tda.fta?`${m.tda.fta.label} ${fmt(m.tda.fta.price)}`:'ждать после подтверждения'}.</p><MiniChart data={m.tda.chart} label="POI → FTA" level={m.tda.fta?.price}/></div><div><h3>План на день</h3><p>{m.tda.plan}</p><MiniChart data={m.tda.chart} label="H1 operating range" level={m.tda.invalid?.price}/></div></div></section>}

function SessionBoard({m}){return <section className="sessions card proPanel"><Title t="Сессии: что это значит" s="каждый блок отвечает: где вероятнее сформируется high/low и какую ликвидность могут снять первой"/><div className="sessionGrid">{SESSIONS.filter(s=>s.id!=='frank').map(s=>{const e=m.exp[s.id]; const today=e.today||{}; const range=today.range?Math.round(pip(m.asset,today.range)):0; return <div className="session" key={s.id}><h3>{s.label}</h3><small>{String(Math.floor(s.start)).padStart(2,'0')}:00-{String(Math.floor(s.end)).padStart(2,'0')}:00</small><div className="matrix"><b></b><b>Short expected</b><b>Long expected</b><span>Low Time</span><em className="red">{e.lowShort}</em><em className="green">{e.lowLong}</em><span>High Time</span><em className="red">{e.highShort}</em><em className="green">{e.highLong}</em></div><div className="miniStats"><b>{Math.round(e.stat.medP)}</b><span>med</span><b>{Math.round(e.stat.avgP)}</b><span>avg</span></div><div className="sessionNote"><b>Сегодня</b><span>{range?`${range} ${m.asset.unit}`:'ещё нет диапазона'}</span><span>{today.highTime?`H ${today.highTime} / L ${today.lowTime}`:'ожидаем формирование'}</span></div></div>})}</div><Peak rows={m.peaks} m={m}/></section>}

function Peak({rows,m}){return <div className="peak"><h3>Сценарии снятия ликвидности</h3><p className="peakIntro">Это не сигнал на вход. Блок показывает историческую последовательность: какая сессия чаще ставит первый экстремум дня и куда затем смещается ликвидность.</p><div className="peakHead"><span>1-я точка</span><span>2-я точка</span><span>Вероятность</span><span>Что это значит</span></div>{rows.map((r,i)=><div className="peakRow" key={i}><b>{r.first}</b><b>{r.second}</b><strong>{r.prob}%</strong><p>{r.first==='NY'?'NY часто ставит первый экстремум: дальше ищем sweep противоположной стороны и подтверждение BOS.':r.first==='ASIA'?'Азия дала первый экстремум: Лондон или NY часто используют его как ликвидность для следующего движения.':'Смотреть переход ликвидности между сессиями.'}</p></div>)}<div className="firstScenario"><span>Текущий расчёт:</span><b>{m.first} → {m.firstLevel?.label}</b><strong>{m.firstProb}%</strong></div></div>}


function DailyPlan({m}){const rows=scenarioRows(m); return <section className="dailyPlan card proPanel"><Title t="План на день" s="структурированный execution plan без воды"/><div className="planHero"><div><small>BIAS</small><b className={m.tda.bias.toLowerCase()}>{m.tda.bias}</b><span>{m.tda.plan}</span></div><div><small>Где ждать реакцию</small><b>{m.tda.pois[0]?`${m.tda.pois[0].label}`:(m.tda.invalid?.label||'после sweep')}</b><span>{m.tda.pois[0]?`${fmt(Math.min(m.tda.pois[0].from,m.tda.pois[0].to))}–${fmt(Math.max(m.tda.pois[0].from,m.tda.pois[0].to))}`:'нет чистого POI рядом'}</span></div><div><small>Take Profit map</small><b>{m.tda.targets[0]?`${m.tda.targets[0].name}`:'после BOS'}</b><span>{m.tda.targets.map(t=>fmt(t.price)).join(' → ')||'ждать новую цель'}</span></div></div><div className="scenarioCards">{rows.map((r,i)=><article key={i}><h3>{r.title}</h3><dl><dt>Триггер</dt><dd>{r.trigger}</dd><dt>Вход / реакция</dt><dd>{r.entry}</dd><dt>Цели</dt><dd>{r.tp}</dd></dl></article>)}</div><div className="executionRules"><b>Правила исполнения</b><span>1. Не входить посередине диапазона.</span><span>2. Сначала liquidity sweep, потом H1/M15 displacement.</span><span>3. Первый TP — FTA, дальше PDH/PDL/PWH/PWL или session extreme.</span><span>4. Инвалидация — закрытие H1 за invalid level без возврата.</span></div></section>}
function Calendar({asset}){const events=impactCalendar(asset); return <section className="calendar card proPanel"><Title t="Календарь новостей" s="ForexFactory style · ключевые окна риска"/><div className="calTable"><div className="calHead"><span>Время</span><span>Валюта</span><span>Событие</span><span>Impact</span><span>Зачем трейдеру</span></div>{events.map(e=><div className={'calRow '+e.impact.toLowerCase()} key={e.id}><b>{e.time}</b><span>{e.cur}</span><strong>{e.event}</strong><em>{e.impact}</em><p>{e.why}</p></div>)}</div></section>}

function RangeDesk({m}){return <section className="stats rangeDesk card proPanel"><Title t="Range / Extension" s="без лишнего шума"/><div className="rangeMain"><div><small>Daily extension</small><b>{Math.round(m.extensionPips)}</b><span>сейчас</span></div><div><small>Средний дневной</small><b>{Math.round(m.stats.daily.avgP)}</b><span>avg</span></div><div><small>Выполнение</small><b>{Math.round(m.dailyCompletion)}%</b><span>от avg</span></div></div><div className="pd big"><span>Discount</span><div><i style={{left:`${m.pd}%`}}/></div><span>Premium</span></div><div className="rangeExplain"><b>{m.dailyCompletion>100?'Расширение выше среднего':'Есть запас до среднего диапазона'}</b><p>{m.dailyCompletion>100?'Новые входы только после sweep/ретеста. Не догонять движение.':'Если появится displacement, цели можно строить до ближайшей session/fractal ликвидности.'}</p></div><div className="cleanStats"><Stat title="Asia range" data={m.stats.asia}/><Stat title="IB size" data={m.stats.ib}/><Stat title="IB extension" data={m.stats.ibExt}/></div></section>}
function Stat({title,data}){return <div className="stat"><h3>{title}</h3><div><b>{Math.round(data.medP)}</b><span>med</span><b>{Math.round(data.avgP)}</b><span>avg</span></div><small>min {Math.round(data.minP)} · max {Math.round(data.maxP)}</small></div>}
function News({news}){return <section className="news card"><Title t="Новости" s="автообновление каждую минуту"/>{!news.length?<p>Новости загружаются автоматически. Если нет перевода — проверь Groq key.</p>:news.map((n,i)=><article key={i}><span className={(n.impact||'WAIT').toLowerCase()}>{n.impact||'WAIT'}</span><h3>{n.title_ru||n.title}</h3><p>{n.summary_ru||''}</p><small>{n.source}</small></article>)}</section>}
function Oracle({ai,m}){return <section className="oracle card"><Title t="Дневной план" s="развёрнутый сценарий по рассчитанным данным"/>{!ai?<><h2>{m.tda.bias} сценарий</h2><p>{m.tda.plan}</p><div>{m.tda.checklist.map((x,i)=><span key={i}>✦ {x}</span>)}</div></>:<><h2>{ai.headline}</h2><p>{ai.plan}</p><b>{ai.whatFirst}</b><div>{(ai.checklist||[]).map((x,i)=><span key={i}>✦ {x}</span>)}</div><pre>{JSON.stringify(ai.execution||{},null,2)}</pre><em>⚠️ {ai.risk}</em></>}</section>}
function Settings({close,setKeysTick}){const[g,setG]=useState(lsGet(LS.groq)),[t,setT]=useState(lsGet(LS.twelve)),[mo,setMo]=useState(lsGet(LS.model)||'llama-3.1-8b-instant'); return <div className="modal"><section><button className="x" onClick={close}>×</button><h2>Кабинет трейдера</h2><p>Ключи сохраняются только в браузере пользователя.</p><label>Groq key<input type="password" value={g} onChange={e=>setG(e.target.value)} placeholder="gsk_..."/></label><label>Twelve Data key<input type="password" value={t} onChange={e=>setT(e.target.value)} placeholder="td_..."/></label><label>Groq model<input value={mo} onChange={e=>setMo(e.target.value)}/></label><button onClick={()=>{lsSet(LS.groq,g.trim());lsSet(LS.twelve,t.trim());lsSet(LS.model,mo.trim());setKeysTick(x=>x+1);close()}}>Сохранить</button></section></div>}
function Title({t,s}){return <div className="title"><h2>{t}</h2><small>{s}</small></div>}
function Ring({v,c}){return <div className="ring" style={{background:`conic-gradient(${c} ${v*3.6}deg,#e5e7eb 0)`}}><i>{Math.round(v)}%</i></div>}
