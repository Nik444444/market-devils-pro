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
async function fetchCandles(asset,key){
  if(!key) return demoCandles(asset)
  const url=`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(asset.symbol)}&interval=5min&outputsize=5000&timezone=UTC&apikey=${key}`
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
function analyze(c, pair, asset){
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
  return {days,current,currentDay,last,prev,asset,all,hld,stats,sess,exp,peaks,levels,above,below,atr:A,fvgs,sw,pd,mid,hi,lo,change:(last.close-(current[0]?.open||last.open))/(current[0]?.open||last.open)*100,displacement,bosUp,bosDn,structure:bosUp?'BOS вверх':bosDn?'BOS вниз':'диапазон',swept,bias,score,reasons,first,firstLevel:fl,firstProb:prob,extensionPips,dailyCompletion,active,smt:calcSMT(c,pair), narrative:makeNarrative({bias,score,first,fl,prob,pd,dailyCompletion,displacement,reasons})}
}
function makeNarrative(x){return `${x.bias==='WAIT'?'Ждать подтверждение':x.bias==='LONG'?'Приоритет лонг-модели':'Приоритет шорт-модели'}. Первым вероятнее ${x.first} около ${x.fl?.label||'ближайшей ликвидности'} (${Math.round(x.prob)}%). P/D: ${Math.round(x.pd)}%. Daily extension выполнен примерно на ${Math.round(x.dailyCompletion)}% от средней доступной истории. ${x.displacement?'Displacement есть.':'Displacement пока нет.'}`}
async function groq(messages,max=900,temp=.05){const key=lsGet(LS.groq); if(!key) throw new Error('Вставь Groq key в кабинете'); const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify({model:lsGet(LS.model)||'llama-3.1-8b-instant',temperature:temp,max_tokens:max,messages})}); const d=await r.json(); if(d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content||''}
function jsonFrom(t){const a=t.indexOf('{'),b=t.lastIndexOf('}'); if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch{}} return null}
async function fetchNews(asset){
  const url=`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(asset.q)}&mode=artlist&format=json&maxrecords=8&sort=hybridrel`
  const r=await fetch(url); const d=await r.json(); const raw=(d.articles||[]).slice(0,8).map(a=>({title:a.title,source:a.sourceCommonName||a.domain||'GDELT',url:a.url,time:a.seendate||''}))
  if(!raw.length) return []
  const key=lsGet(LS.groq); if(!key) return raw.map(x=>({...x,title_ru:x.title,impact:'WAIT',summary_ru:'Вставь Groq key, чтобы получить русский перевод и impact.',urgency:'LOW'}))
  const txt=await groq([{role:'system',content:'Ты переводчик и рыночный редактор. Верни только JSON: {items:[{title_ru,summary_ru,impact:LONG|SHORT|WAIT,urgency:HIGH|MEDIUM|LOW}]}. Не придумывай факты.'},{role:'user',content:`Актив ${asset.name}. Переведи на русский и оцени impact. Заголовки: ${JSON.stringify(raw)}`}],1200,.05)
  const j=jsonFrom(txt); return raw.map((x,i)=>({...x,...(j?.items?.[i]||{})}))
}

export default function App(){
  const [assetId,setAssetId]=useState('EUR'); const [candles,setCandles]=useState([]); const [pair,setPair]=useState([]); const [loading,setLoading]=useState(false); const [err,setErr]=useState(''); const [news,setNews]=useState([]); const [ai,setAi]=useState(null); const [settings,setSettings]=useState(false); const [keysTick,setKeysTick]=useState(0)
  const asset=ASSETS.find(a=>a.id===assetId)||ASSETS[0]
  const refresh=useCallback(async()=>{setLoading(true);setErr('');setAi(null); try{const key=lsGet(LS.twelve); const c=await fetchCandles(asset,key); setCandles(c); const pa=ASSETS.find(a=>a.symbol===asset.pair); if(pa){try{setPair(await fetchCandles(pa,key))}catch{setPair([])}}}catch(e){setErr(e.message); setCandles(demoCandles(asset)); setPair([])} finally{setLoading(false)}},[assetId,keysTick])
  useEffect(()=>{refresh()},[refresh])
  const m=useMemo(()=>candles.length?analyze(candles,pair,asset):null,[candles,pair,asset])
  const loadNews=async()=>{try{setNews(await fetchNews(asset))}catch(e){setErr('Новости: '+e.message)}}
  const runAI=async()=>{if(!m)return; try{const ctx={asset:asset.name,price:m.last.close,bias:m.bias,confidence:m.score,first:m.first,firstLevel:m.firstLevel,firstProb:m.firstProb,premiumDiscount:m.pd,extension:m.extensionPips,dailyCompletion:m.dailyCompletion,structure:m.structure,swept:m.swept,smt:m.smt,fvg:m.fvgs.slice(0,5),levels:m.levels.slice(0,8),reasons:m.reasons}; const txt=await groq([{role:'system',content:'Ты prop/ICT ассистент. Пиши по-русски. Используй только данные из JSON. Не давай финансовый совет. Не придумывай уровни, новости или вероятности. Верни JSON: {headline,bias,plan,whatFirst,checklist:[...],execution:{entry,confirmation,invalid,target},risk}.'},{role:'user',content:JSON.stringify(ctx)}],900,.05); setAi(jsonFrom(txt)||{headline:'План',bias:m.bias,plan:txt,whatFirst:m.narrative,checklist:m.reasons,execution:{},risk:'Проверяй на графике.'})}catch(e){setErr('AI: '+e.message)}}
  if(!m) return <div className="boot">Загружаю EchoDesk…</div>
  return <div className="terminal">
    <Top asset={asset} setAssetId={setAssetId} loading={loading} refresh={refresh} setSettings={setSettings}/>
    <main className="grid">
      <Command m={m}/>
      <Chart candles={m.current} m={m}/>
      <Right m={m} runAI={runAI} loadNews={loadNews}/>
      <SessionBoard m={m}/>
      <Stats m={m}/>
      <News news={news}/>
      <Oracle ai={ai} m={m}/>
    </main>
    {settings&&<Settings close={()=>setSettings(false)} setKeysTick={setKeysTick}/>} {err&&<div className="toast" onClick={()=>setErr('')}>⚠️ {err}</div>}
  </div>
}
function Top({asset,setAssetId,loading,refresh,setSettings}){return <header className="top"><div className="brand"><b>MARKET DEVILS</b><span>EchoDesk · Statistical ICT Operating System</span></div><div className="assetbar">{ASSETS.map(a=><button key={a.id} onClick={()=>setAssetId(a.id)} className={a.id===asset.id?'on':''}>{a.name}</button>)}</div><div className="topActions"><button onClick={refresh}>{loading?'Загрузка…':'Обновить'}</button><button onClick={()=>setSettings(true)}>Ключи</button></div></header>}
function Command({m}){return <section className="command card"><p>Главный сценарий</p><h1 className={m.bias.toLowerCase()}>{m.bias==='WAIT'?'WAIT':m.bias}</h1><div className="score"><Ring v={m.score} c={m.bias==='LONG'?'#10b981':m.bias==='SHORT'?'#ef4444':'#eab308'}/><div><b>{m.score}%</b><span>качество модели</span></div></div><h3>{m.narrative}</h3><div className="reasonList">{m.reasons.map((r,i)=><span key={i}>✓ {r}</span>)}</div></section>}
function Right({m,runAI,loadNews}){return <aside className="rightcol"><section className="first card"><small>Что вероятнее снимем первым</small><b>{m.first}</b><strong>{m.firstLevel?.label} · {fmt(m.firstLevel?.price)}</strong><Ring v={m.firstProb} c="#0ea5e9"/><p>Вероятность рассчитана по дистанции до ликвидности, P/D и текущему контексту, без AI.</p></section><section className="card micro"><h3>Execution checklist</h3><span className={m.displacement?'ok':'bad'}>{m.displacement?'Displacement есть':'Displacement нет'}</span><span className={m.bosUp||m.bosDn?'ok':'warn'}>{m.structure}</span><span>{m.smt.state}</span><button onClick={runAI}>AI-план по расчётам</button><button onClick={loadNews}>Новости RU</button></section></aside>}
function Chart({candles,m}){const W=1120,H=520,P=42,hi=Math.max(...candles.map(x=>x.high)),lo=Math.min(...candles.map(x=>x.low)); const X=i=>P+i*(W-2*P)/Math.max(1,candles.length-1),Y=v=>P+(hi-v)*(H-2*P)/(hi-lo||1),step=(W-2*P)/candles.length; const dayStart=dayKey(candles[0]?.time),zones=SESSIONS.map(s=>{let ids=candles.map((c,i)=>({c,i})).filter(o=>hourBE(o.c.time)>=s.start&&hourBE(o.c.time)<s.end&&dayKey(o.c.time)===dayStart); if(!ids.length)return null; return {...s,x:X(ids[0].i),w:X(ids.at(-1).i)-X(ids[0].i)+step}}).filter(Boolean); const levels=[['HOD',m.hi,'#111827'],['LOD',m.lo,'#111827'],['EQ',m.mid,'#94a3b8'],['Asia H',m.sess.asia?.high,'#6366f1'],['Asia L',m.sess.asia?.low,'#6366f1'],['London H',m.sess.london?.high,'#10b981'],['London L',m.sess.london?.low,'#10b981']].filter(x=>Number.isFinite(x[1])); return <section className="chart card"><div className="chartHead"><div><h2>{m.asset.name}</h2><p>5m · Berlin time · уровни построены по OHLC</p></div><div className="quote"><b>{fmt(m.last.close)}</b><span className={m.change>=0?'long':'short'}>{m.change>=0?'+':''}{fmt(m.change,2)}%</span></div></div><svg viewBox={`0 0 ${W} ${H}`}>{zones.map(z=><g key={z.id}><rect x={z.x} y={P} width={z.w} height={H-2*P} fill={z.color} opacity=".78"/><text x={z.x+10} y={P+22} fill={z.stroke}>{z.label}</text></g>)}{m.fvgs.slice(0,4).map((g,i)=><rect key={i} x={P} y={Y(Math.max(g.from,g.to))} width={W-2*P} height={Math.max(5,Math.abs(Y(g.from)-Y(g.to)))} fill={g.type==='LONG'?'#10b981':'#ef4444'} opacity=".13"/>)}{levels.map(l=><g key={l[0]}><line x1={P} x2={W-P} y1={Y(l[1])} y2={Y(l[1])} stroke={l[2]} strokeDasharray={l[0]==='EQ'?'4 7':'7 7'} opacity=".65"/><text x={W-P-135} y={Y(l[1])-6} fill={l[2]}>{l[0]} {fmt(l[1])}</text></g>)}{candles.map((c,i)=>{const up=c.close>=c.open; return <g key={i}><line x1={X(i)} x2={X(i)} y1={Y(c.high)} y2={Y(c.low)} stroke={up?'#374151':'#111827'} opacity=".88"/><rect x={X(i)-step*.32} y={Y(Math.max(c.open,c.close))} width={Math.max(1.5,step*.64)} height={Math.max(2,Math.abs(Y(c.open)-Y(c.close)))} fill={up?'#ffffff':'#111827'} stroke="#111827" strokeWidth="1"/></g>})}<circle cx={W-P-8} cy={Y(m.last.close)} r="5" fill="#111827"/></svg></section>}
function SessionBoard({m}){return <section className="sessions card"><Title t="Сессии и тайминг" s="ожидания high/low"/><div className="sessionGrid">{SESSIONS.filter(s=>s.id!=='frank').map(s=>{const e=m.exp[s.id]; return <div className="session" key={s.id}><h3>{s.label}</h3><small>{String(Math.floor(s.start)).padStart(2,'0')}:00-{String(Math.floor(s.end)).padStart(2,'0')}:00</small><div className="matrix"><b></b><b>Short expected</b><b>Long expected</b><span>Low Time</span><em className="red">{e.lowShort}</em><em className="green">{e.lowLong}</em><span>High Time</span><em className="red">{e.highShort}</em><em className="green">{e.highLong}</em></div><div className="miniStats"><b>{Math.round(e.stat.medP)}</b><span>med</span><b>{Math.round(e.stat.avgP)}</b><span>avg</span><b className="red">{Math.round(e.stat.minP)}</b><span>min</span><b className="green">{Math.round(e.stat.maxP)}</b><span>max</span></div></div>})}</div><Peak rows={m.peaks}/></section>}
function Peak({rows}){return <div className="peak"><h3>Peak points</h3><div className="peakHead"><span>1-я точка</span><span>2-я точка</span><span>Вероятность</span></div>{rows.map((r,i)=><div className="peakRow" key={i}><b>{r.first}</b><b>{r.second}</b><strong>{r.prob}%</strong></div>)}</div>}
function Stats({m}){return <section className="stats card"><Title t="Расширения" s="med / avg / min / max"/><div className="statCards"><Stat title="Daily Extension" data={m.stats.daily} active={m.extensionPips}/><Stat title="Asia Extension" data={m.stats.asia}/><Stat title="IB Size" data={m.stats.ib}/><Stat title="IB UP/DOWN Ext" data={m.stats.ibExt}/></div><div className="pd"><span>Discount</span><div><i style={{left:`${m.pd}%`}}/></div><span>Premium</span></div></section>}
function Stat({title,data,active}){return <div className="stat"><h3>{title}</h3>{active!==undefined&&<p>сейчас: {Math.round(active)}</p>}<div><b>{Math.round(data.medP)}</b><span>med</span><b>{Math.round(data.avgP)}</b><span>avg</span><b className="red">{Math.round(data.minP)}</b><span>min</span><b className="green">{Math.round(data.maxP)}</b><span>max</span></div><small>{data.count} сэмплов</small></div>}
function News({news}){return <section className="news card"><Title t="Новости" s="перевод и impact через Groq"/>{!news.length?<p>Нажми «Новости RU». Без Groq покажет оригинальные заголовки.</p>:news.map((n,i)=><article key={i}><span className={(n.impact||'WAIT').toLowerCase()}>{n.impact||'WAIT'}</span><h3>{n.title_ru||n.title}</h3><p>{n.summary_ru||''}</p><small>{n.source}</small></article>)}</section>}
function Oracle({ai,m}){return <section className="oracle card"><Title t="AI Oracle" s="только объясняет рассчитанные данные"/>{!ai?<p>{m.narrative}</p>:<><h2>{ai.headline}</h2><p>{ai.plan}</p><b>{ai.whatFirst}</b><div>{(ai.checklist||[]).map((x,i)=><span key={i}>✦ {x}</span>)}</div><pre>{JSON.stringify(ai.execution||{},null,2)}</pre><em>⚠️ {ai.risk}</em></>}</section>}
function Settings({close,setKeysTick}){const[g,setG]=useState(lsGet(LS.groq)),[t,setT]=useState(lsGet(LS.twelve)),[mo,setMo]=useState(lsGet(LS.model)||'llama-3.1-8b-instant'); return <div className="modal"><section><button className="x" onClick={close}>×</button><h2>Кабинет трейдера</h2><p>Ключи сохраняются только в браузере пользователя.</p><label>Groq key<input type="password" value={g} onChange={e=>setG(e.target.value)} placeholder="gsk_..."/></label><label>Twelve Data key<input type="password" value={t} onChange={e=>setT(e.target.value)} placeholder="td_..."/></label><label>Groq model<input value={mo} onChange={e=>setMo(e.target.value)}/></label><button onClick={()=>{lsSet(LS.groq,g.trim());lsSet(LS.twelve,t.trim());lsSet(LS.model,mo.trim());setKeysTick(x=>x+1);close()}}>Сохранить</button></section></div>}
function Title({t,s}){return <div className="title"><h2>{t}</h2><small>{s}</small></div>}
function Ring({v,c}){return <div className="ring" style={{background:`conic-gradient(${c} ${v*3.6}deg,#e5e7eb 0)`}}><i>{Math.round(v)}%</i></div>}
