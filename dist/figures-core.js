(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SNPFigures=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const regression=[
    {id:'RF',name:'随机森林回归',short:'RF',noise:3.5,shrink:.65},
    {id:'GBDT',name:'梯度提升树回归',short:'GBDT',noise:3.2,shrink:.68},
    {id:'XGBoost',name:'XGBoost 回归',short:'XGBoost',noise:2.9,shrink:.76},
    {id:'LightGBM',name:'LightGBM 回归',short:'LightGBM',noise:3.1,shrink:.72},
    {id:'SVR',name:'支持向量回归',short:'SVR',noise:3.9,shrink:.60},
    {id:'KRR',name:'核岭回归',short:'KRR',noise:4.1,shrink:.57}
  ];
  const classification=[
    {id:'RF',name:'随机森林分类',short:'RF',noise:.70,shrink:1.9},
    {id:'SVM',name:'支持向量分类',short:'SVM',noise:.90,shrink:1.7},
    {id:'LR',name:'逻辑回归',short:'LR',noise:1.0,shrink:1.7},
    {id:'GB',name:'梯度提升树分类',short:'GBDT classifier',noise:.75,shrink:1.9},
    {id:'KNN',name:'K 近邻分类',short:'KNN',noise:1.2,shrink:1.6},
    {id:'NB',name:'高斯朴素贝叶斯',short:'Gaussian NB',noise:1.3,shrink:1.5}
  ];
  function random(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return(s+.5)/4294967296;};}
  function normal(r){return Math.sqrt(-2*Math.log(r()))*Math.cos(2*Math.PI*r());}
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const fmt=(v,n=3)=>Number.isFinite(v)?v.toFixed(n):'NA';
  function auc(y,p){
    const positives=y.reduce((s,v)=>s+v,0),negatives=y.length-positives;
    if(!positives||!negatives)return null;
    const order=p.map((score,i)=>({score,y:y[i]})).sort((a,b)=>a.score-b.score);let sum=0;
    for(let i=0;i<order.length;){let j=i+1;while(j<order.length&&order[j].score===order[i].score)j++;const rank=(i+1+j)/2;for(let k=i;k<j;k++)if(order[k].y)sum+=rank;i=j;}
    return(sum-positives*(positives+1)/2)/(positives*negatives);
  }
  function metrics(observed,predicted,task='regression'){
    if(!observed.length||observed.length!==predicted.length||[...observed,...predicted].some(v=>!Number.isFinite(v)))throw Error('指标需要等长、非空的有限数值。');
    const mx=mean(observed),my=mean(predicted);let xx=0,yy=0,xy=0,se=0,ae=0,tp=0,fp=0,fn=0,correct=0;
    observed.forEach((x,i)=>{const y=predicted[i],dx=x-mx,dy=y-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;se+=(x-y)**2;ae+=Math.abs(x-y);if(task==='classification'){const label=y>=.5?1:0;correct+=label===x;if(label&&x)tp++;if(label&&!x)fp++;if(!label&&x)fn++;}});
    return{rmse:Math.sqrt(se/observed.length),mae:ae/observed.length,pcc:xx&&yy?xy/Math.sqrt(xx*yy):null,slope:xx?xy/xx:null,intercept:xx?my-(xy/xx)*mx:null,auc:task==='classification'?auc(observed,predicted):null,brier:task==='classification'?se/observed.length:null,accuracy:task==='classification'?correct/observed.length:null,f1:task==='classification'?(2*tp/(2*tp+fp+fn)||0):null};
  }
  function catalog(task){if(!['regression','classification'].includes(task))throw Error('未知绘图任务。');return task==='regression'?regression:classification;}
  function simulate({task='regression',folds=5,seed=2023,n=180,modelIds}={}){
    if(!Number.isInteger(folds)||folds<2||folds>20)throw Error('演示交叉验证折数须为 2–20 的整数。');
    if(!Number.isInteger(seed)||seed<0||seed>2147483647)throw Error('随机种子须为 0–2147483647 的整数。');
    if(!Number.isInteger(n)||n<folds*4||n>1000)throw Error('合成样本数量须在折数的 4 倍至 1000 之间。');
    const all=catalog(task),ids=modelIds===undefined?all.map(m=>m.id):modelIds;
    if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!all.some(m=>m.id===id)))throw Error('绘图模型选择无效。');
    const r=random(seed),latent=Array.from({length:n},()=>normal(r)),observed=latent.map(v=>task==='regression'?128+6.2*v:(v+.75*normal(r)>0?1:0));
    const assignments=new Array(n),shuffle=random(seed^0x49f91^folds);
    const groups=task==='classification'?[observed.map((v,i)=>v===0?i:-1).filter(i=>i>=0),observed.map((v,i)=>v===1?i:-1).filter(i=>i>=0)]:[Array.from({length:n},(_,i)=>i)];
    groups.forEach(indices=>{for(let i=indices.length-1;i>0;i--){const j=Math.floor(shuffle()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}indices.forEach((i,j)=>assignments[i]=j%folds+1);});
    const results=ids.map(id=>{
      const model=all.find(m=>m.id===id),hash=[...task+id].reduce((s,c)=>((s*31+c.charCodeAt(0))>>>0),17),rand=random(seed^hash^(folds*941));
      const predict=(i,training,fold)=>{
        const jitter=normal(rand),factor=1+Math.sin(fold*1.7+hash%7)*.13;
        if(task==='regression')return 128+(observed[i]-128)*(training?.92:model.shrink)+jitter*model.noise*(training?.35:factor);
        const score=training?(observed[i]*2-1)*2.2+jitter*.7:latent[i]*model.shrink+jitter*model.noise*factor;
        return 1/(1+Math.exp(-score));
      };
      const predicted=observed.map((_,i)=>predict(i,false,assignments[i]));
      const foldMetrics=Array.from({length:folds},(_,f)=>{
        const fold=f+1,test=observed.map((_,i)=>i).filter(i=>assignments[i]===fold),train=observed.map((_,i)=>i).filter(i=>assignments[i]!==fold);
        return{fold,trainN:train.length,testN:test.length,train:metrics(train.map(i=>observed[i]),train.map(i=>predict(i,true,fold)),task),test:metrics(test.map(i=>observed[i]),test.map(i=>predicted[i]),task)};
      });
      return{...model,task,folds,seed,n,observed:[...observed],predicted,assignments:[...assignments],metrics:metrics(observed,predicted,task),foldMetrics};
    });
    return{dataSource:'SIMULATED',noModelFitted:true,task,folds,seed,n,modelIds:[...ids],results};
  }
  function sorted(results,order='notebook'){
    const copy=[...results];
    if(order==='rmse')copy.sort((a,b)=>a.metrics.rmse-b.metrics.rmse);
    if(order==='pcc')copy.sort((a,b)=>(b.metrics.pcc??-Infinity)-(a.metrics.pcc??-Infinity));
    if(order==='auc')copy.sort((a,b)=>(b.metrics.auc??-Infinity)-(a.metrics.auc??-Infinity));
    return copy;
  }
  function bandwidth(values){const m=mean(values),sd=Math.sqrt(values.reduce((s,x)=>s+(x-m)**2,0)/Math.max(1,values.length-1));return Math.max(sd*values.length**(-.2),.015);}
  function density(values,xs){const h=bandwidth(values),scale=1/(values.length*h*Math.sqrt(2*Math.PI));return xs.map(x=>scale*values.reduce((s,v)=>s+Math.exp(-.5*((x-v)/h)**2),0));}
  function pointDensity(xs,ys){const hx=bandwidth(xs),hy=bandwidth(ys);return xs.map((x,i)=>xs.reduce((s,xj,j)=>s+Math.exp(-.5*(((x-xj)/hx)**2+((ys[i]-ys[j])/hy)**2)),0)/(xs.length*2*Math.PI*hx*hy));}
  const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const palette=['#440154','#414487','#2a788e','#22a884','#7ad151','#fde725'];
  function color(t){t=Math.max(0,Math.min(1,t));const s=t*(palette.length-1),i=Math.min(palette.length-2,Math.floor(s)),mix=s-i;const rgb=v=>[1,3,5].map(j=>parseInt(v.slice(j,j+2),16));const a=rgb(palette[i]),b=rgb(palette[i+1]);return'#'+a.map((v,j)=>Math.round(v+(b[j]-v)*mix).toString(16).padStart(2,'0')).join('');}
  function frame(result,title,xLabel,yLabel,xRange,yRange,{right=950,xTicks,yTicks}={}){
    const left=106,top=95,bottom=657,W=1080,H=800;
    const px=v=>left+(v-xRange[0])/(xRange[1]-xRange[0])*(right-left),py=v=>bottom-(v-yRange[0])/(yRange[1]-yRange[0])*(bottom-top);
    let content=`<rect width="1080" height="800" fill="white"/><text x="540" y="40" text-anchor="middle" font-size="27" font-weight="600">${escape(title)}</text><text x="540" y="71" text-anchor="middle" font-size="17" fill="#657780">${escape(result.short)} · ${result.folds}-fold · n = ${result.n} · SIMULATED</text>`;
    const xt=xTicks||Array.from({length:6},(_,i)=>xRange[0]+(xRange[1]-xRange[0])*i/5),yt=yTicks||Array.from({length:6},(_,i)=>yRange[0]+(yRange[1]-yRange[0])*i/5);
    xt.forEach(x=>{content+=`<line x1="${px(x)}" y1="${bottom}" x2="${px(x)}" y2="${bottom+8}" stroke="#243339"/><text x="${px(x)}" y="${bottom+34}" text-anchor="middle" font-size="18">${xTicks&&Number.isInteger(x)?x:(Math.abs(x)<2?fmt(x,2):fmt(x,1))}</text>`;});
    yt.forEach(y=>{content+=`<line x1="${left}" y1="${py(y)}" x2="${right}" y2="${py(y)}" stroke="#edf0f1"/><text x="${left-14}" y="${py(y)+6}" text-anchor="end" font-size="18">${Math.abs(y)<2?fmt(y,3):fmt(y,1)}</text>`;});
    content+=`<rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="none" stroke="#243339" stroke-width="1.8"/><text x="${(left+right)/2}" y="727" text-anchor="middle" font-size="24">${escape(xLabel)}</text><text transform="translate(31 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle" font-size="24">${escape(yLabel)}</text><text x="540" y="770" text-anchor="middle" font-size="15" fill="#657780">SIMULATED · seed ${result.seed} · Synthetic predictions; no model fitted; no uploaded data used</text>`;
    return{px,py,left,right,top,bottom,W,H,content};
  }
  function closeSVG(content,result,type){return`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="800" viewBox="0 0 1080 800" role="img" aria-label="${escape(result.short+' '+type+' SIMULATED')}" style="font-family:Arial,Helvetica,sans-serif;color:#243339"><title>${escape(result.short+' '+type+' SIMULATED')}</title>${content}</svg>`;}
  function scatter(result){
    const cls=result.task==='classification',low=cls?-.08:Math.floor(Math.min(...result.observed,...result.predicted)-3),high=cls?1.08:Math.ceil(Math.max(...result.observed,...result.predicted)+3);
    const f=frame(result,cls?'Observed label vs predicted probability':'Observed vs predicted values',cls?'Observed label (0 / 1)':'Observed Values',cls?'Predicted probability':'Predicted Values',[low,high],[low,high],{right:913,...(cls?{xTicks:[0,1]}:{})});
    const z=pointDensity(result.observed,result.predicted),min=Math.min(...z),max=Math.max(...z);let s=f.content;
    s+=`<line x1="${f.px(low)}" y1="${f.py(low)}" x2="${f.px(high)}" y2="${f.py(high)}" stroke="#2962ff" stroke-width="2.8" stroke-dasharray="11 8"/>`;
    z.map((d,i)=>({d,i})).sort((a,b)=>a.d-b.d).forEach(({d,i})=>{const x=result.observed[i]+(cls?((i%11)-5)*.006:0);s+=`<circle cx="${f.px(x)}" cy="${f.py(result.predicted[i])}" r="4.6" fill="${color((d-min)/(max-min||1))}" opacity=".9"/>`;});
    const m=result.metrics;
    if(!cls&&m.slope!==null){const x1=Math.min(...result.observed),x2=Math.max(...result.observed);s+=`<line x1="${f.px(x1)}" y1="${f.py(m.slope*x1+m.intercept)}" x2="${f.px(x2)}" y2="${f.py(m.slope*x2+m.intercept)}" stroke="#151d21" stroke-width="3"/>`;}
    s+=`<rect x="120" y="108" width="320" height="113" fill="white" fill-opacity=".92"/><text x="135" y="136" font-size="22">RMSE${cls?' (prob.)':''}: ${fmt(m.rmse)}</text><text x="135" y="166" font-size="22">${cls?'ROC-AUC':'PCC'}: ${fmt(cls?m.auc:m.pcc)}</text><text x="135" y="200" font-size="19">${cls?'Horizontal jitter for visibility only':`y = ${fmt(m.slope)}x ${m.intercept>=0?'+':'−'} ${fmt(Math.abs(m.intercept))}`}</text>`;
    s+='<defs><linearGradient id="viridis" x1="0" y1="1" x2="0" y2="0">'+palette.map((v,i)=>`<stop offset="${i*20}%" stop-color="${v}"/>`).join('')+'</linearGradient></defs><rect x="935" y="95" width="20" height="562" fill="url(#viridis)"/>';
    for(let i=0;i<5;i++)s+=`<text x="963" y="${657-i*140.5}" font-size="15">${(min+(max-min)*i/4).toPrecision(2)}</text>`;
    return closeSVG(s,result,'scatter');
  }
  function distribution(result){
    const cls=result.task==='classification',a=cls?result.predicted.filter((_,i)=>!result.observed[i]):result.predicted,b=cls?result.predicted.filter((_,i)=>result.observed[i]):result.observed;
    const combined=[...a,...b],h=Math.max(bandwidth(a),bandwidth(b));const low=cls?0:Math.min(...combined)-h*3,high=cls?1:Math.max(...combined)+h*3,xs=Array.from({length:200},(_,i)=>low+(high-low)*i/199),da=density(a,xs),db=density(b,xs);
    const f=frame(result,cls?'Predicted probability by observed class':'Predicted vs observed density',cls?'Predicted probability':'Values','Density',[low,high],[0,Math.max(...da,...db)*1.14]);let s=f.content;
    [[da,'#a9a4ee',false],[db,'#f09898',true]].forEach(([ds,fill,dashed])=>{const d=xs.map((x,i)=>`${i?'L':'M'} ${f.px(x)} ${f.py(ds[i])}`).join(' ');s+=`<path d="${d} L ${f.px(high)} ${f.py(0)} L ${f.px(low)} ${f.py(0)} Z" fill="${fill}" fill-opacity=".48"/><path d="${d}" fill="none" stroke="${dashed?'#23947d':'#735bc0'}" stroke-width="3.5" ${dashed?'stroke-dasharray="10 7"':''}/>`;});
    s+=`<rect x="122" y="110" width="330" height="83" rx="5" fill="white" stroke="#dae1e4"/><line x1="140" y1="136" x2="188" y2="136" stroke="#735bc0" stroke-width="3.5"/><text x="202" y="143" font-size="20">${cls?'Observed class 0':'Predicted values'}</text><line x1="140" y1="169" x2="188" y2="169" stroke="#23947d" stroke-width="3.5" stroke-dasharray="10 7"/><text x="202" y="176" font-size="20">${cls?'Observed class 1':'Observed values'}</text>`;
    if(cls)s+='<text x="545" y="115" font-size="14" fill="#657780">Gaussian KDE; boundary bias near 0 / 1</text>';
    return closeSVG(s,result,'density');
  }
  function foldsPlot(result){
    const cls=result.task==='classification',key=cls?'auc':'pcc',values=result.foldMetrics.flatMap(v=>[v.train[key],v.test[key]]).filter(Number.isFinite),low=cls?0:Math.min(0,Math.floor(Math.min(...values)*10)/10);
    const f=frame(result,cls?'Training / validation ROC-AUC by fold':'Training / validation PCC by fold','Folds',cls?'ROC-AUC':'PCC',[.65,result.folds+.35],[low,1.04],{xTicks:Array.from({length:result.folds},(_,i)=>i+1)});let s=f.content;
    [['train','#36aca2',false],['test','#614099',true]].forEach(([which,c,dashed])=>{let active=false;let d='';for(const row of result.foldMetrics){const val=row[which][key];if(!Number.isFinite(val)){active=false;continue;}d+=`${active?' L':' M'} ${f.px(row.fold)} ${f.py(val)}`;active=true;s+=`<circle cx="${f.px(row.fold)}" cy="${f.py(val)}" r="4.5" fill="${c}"/>`;}s+=`<path d="${d}" stroke="${c}" stroke-width="3.6" fill="none" ${dashed?'stroke-dasharray="12 7"':''}/>`;});
    s+=`<rect x="121" y="565" width="440" height="77" rx="5" fill="white" fill-opacity=".95" stroke="#dae1e4"/><line x1="139" y1="590" x2="195" y2="590" stroke="#36aca2" stroke-width="3.5"/><text x="209" y="597" font-size="19">Train (synthetic, not fitted)</text><line x1="139" y1="620" x2="195" y2="620" stroke="#614099" stroke-width="3.5" stroke-dasharray="12 7"/><text x="209" y="627" font-size="19">Validation (synthetic held-out)</text>`;
    return closeSVG(s,result,'folds');
  }
  function figures(result){return[{id:'scatter',title:result.task==='classification'?'观测标签与预测概率':'观测值与预测值',svg:scatter(result)},{id:'density',title:result.task==='classification'?'按观测类别分组的概率密度':'预测/观测值密度分布',svg:distribution(result)},{id:'folds',title:result.task==='classification'?'各折训练/验证 AUC':'各折训练/验证 PCC',svg:foldsPlot(result)}];}
  const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function zip(entries){
    const local=[],central=[];let offset=0,total=0;const encoder=new TextEncoder();
    entries.forEach(({name,data})=>{
      if(!name||name.startsWith('/')||name.split('/').includes('..'))throw Error('无效 ZIP 文件名。');
      const filename=encoder.encode(name),bytes=typeof data==='string'?encoder.encode(data):new Uint8Array(data),crc=crc32(bytes);
      const header=new Uint8Array(30+filename.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,filename.length,true);header.set(filename,30);local.push(header,bytes);
      const c=new Uint8Array(46+filename.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);c.set(filename,46);central.push(c);offset+=header.length+bytes.length;total+=c.length;
    });
    if(entries.length>65535||offset+total>0xffffffff)throw Error('演示 ZIP 超过支持范围。');
    const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,total,true);ev.setUint32(16,offset,true);
    const bytes=new Uint8Array(offset+total+22);let p=0;for(const chunk of [...local,...central,end]){bytes.set(chunk,p);p+=chunk.length;}return bytes;
  }
  function csv(rows){return'\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v===null?'NA':v).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';}
  return{catalog,simulate,metrics,auc,sorted,density,figures,zip,crc32,csv,fmt};
});
