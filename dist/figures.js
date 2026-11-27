/* Independent, browser-local scientific figure demo. No model training. */
(function(){
  'use strict';
  const F=window.SNPFigures,el=id=>document.getElementById(id),html=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={batch:null,ordered:[],dirty:false,exporting:false,selections:{regression:new Set(F.catalog('regression').map(m=>m.id)),classification:new Set(selected)}};
  const textCSV=(rows)=>F.csv(rows);
  const pad=n=>String(n).padStart(2,'0');
  function status(message,error=false){el('figureStatus').textContent=message;el('figureStatus').classList.toggle('error',error);}
  function availability(){const disabled=state.exporting||state.dirty||!state.batch?.results.length;el('downloadFigures').disabled=disabled;document.querySelectorAll('[data-figure-download]').forEach(b=>b.disabled=disabled);}
  function dirty(){state.dirty=true;status('设置已修改，请点击“生成 / 更新演示图”；下载将在图与当前设置一致后启用。');availability();}
  function modelOptions(){const task=el('figureTask').value;el('figureModelOptions').innerHTML=F.catalog(task).map(m=>`<label><input type="checkbox" value="${m.id}" ${state.selections[task].has(m.id)?'checked':''}> ${html(m.short)}</label>`).join('');el('figureSort').querySelector('[value="auc"]').disabled=task!=='classification';if(task!=='classification'&&el('figureSort').value==='auc')el('figureSort').value='notebook';}
  function render(){
    if(!state.batch?.results.length){state.ordered=[];el('figureSummary').innerHTML='';el('figureGallery').innerHTML='<div class="figure-empty">没有选中绘图模型。请至少勾选一个模型后生成演示图。</div>';availability();return;}
    const batch=state.batch,cls=batch.task==='classification';state.ordered=F.sorted(batch.results,el('figureSort').value);
    el('figureSummary').innerHTML=`<div class="table-wrap figure-summary-table"><table><thead><tr><th>排序</th><th>模型 · SIMULATED</th><th>${cls?'ROC-AUC':'PCC（合并演示预测）'}</th><th>${cls?'Brier score':'RMSE'}</th><th>${cls?'准确率':'MAE'}</th><th>折数</th></tr></thead><tbody>${state.ordered.map((r,i)=>`<tr><td>${pad(i+1)}</td><td>${html(r.short)}</td><td>${F.fmt(cls?r.metrics.auc:r.metrics.pcc)}</td><td>${F.fmt(cls?r.metrics.brier:r.metrics.rmse)}</td><td>${F.fmt(cls?r.metrics.accuracy:r.metrics.mae)}</td><td>${r.folds}</td></tr>`).join('')}</tbody></table></div>`;
    el('figureGallery').innerHTML=state.ordered.map((r,i)=>`<details class="scientific-model" data-figure-model="${r.id}" ${i===0?'open':''}><summary><b>${pad(i+1)} · ${html(r.name)} / ${html(r.short)}</b><span class="model-metric">${r.folds} 折 · ${cls?'AUC '+F.fmt(r.metrics.auc):'RMSE '+F.fmt(r.metrics.rmse)+' / PCC '+F.fmt(r.metrics.pcc)} · 3 张模拟图</span></summary><div class="figure-grid">${F.figures(r).map((figure,j)=>`<figure class="scientific-figure">${figure.svg}<figcaption><b>${pad(j+1)} · ${figure.title}</b> <span class="pill">SIMULATED</span><div class="actions"><button class="secondary" data-figure-download="svg" data-model="${r.id}" data-kind="${figure.id}">下载 SVG</button><button class="secondary" data-figure-download="png" data-model="${r.id}" data-kind="${figure.id}">下载 PNG</button></div></figcaption></figure>`).join('')}</div></details>`).join('');
    el('figureSource').textContent=cls?'原有二分类模型演示：横轴为 0/1 标签，预测值为概率；密度图按病例/对照分组，各折曲线使用 ROC-AUC。所有预测为合成演示。':'Notebook 连续性状回归图演示：RF、GBDT、XGBoost、LightGBM、SVR、KRR。RMSE、PCC 和密度根据合成观测/预测值计算，不代表已训练的模型。';
    availability();
  }
  function generate(syncMain=true){
    if(syncMain&&(busy||dataState.pending)){toast('请等待当前分析或导入完成。');return false;}
    try{
      const folds=Number(el('figureFolds').value),seed=Number(el('figureSeed').value),task=el('figureTask').value;
      if(!el('figureFolds').value||!el('figureSeed').value)throw Error('请填写折数和随机种子。');
      const batch=F.simulate({task,folds,seed,modelIds:[...state.selections[task]]});
      const binary=F.simulate({task:'classification',folds,seed});
      models.forEach(model=>{model[3]=binary.results.find(r=>r.id===model[2]).metrics.auc;});
      renderModels();
      if(syncMain&&config.folds!==folds){config={...config,folds};el('folds').value=String(folds);if(dataState.matrix)renderMatrix();resetFlow();}
      state.batch=batch;state.dirty=false;render();status(`演示图已更新：${batch.results.length} 个模型 / ${batch.results.length*3} 张图 · ${folds} 折 · 180 个合成样本 · seed ${seed}。未使用上传文件，未训练模型。`);return true;
    }catch(error){state.dirty=true;status(error.message,true);availability();return false;}
  }
  function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  async function svgToPng(svg){
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),image=new Image();
    try{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PNG 图像加载超时，可改用 SVG 导出。')),15000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('PNG 图像绘制失败，可改用 SVG 导出。'));};image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=2160;canvas.height=1600;const context=canvas.getContext('2d');if(!context)throw Error('浏览器不支持 PNG 导出，请选择 SVG。');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 编码失败，请选择 SVG。')),'image/png'));
    }finally{URL.revokeObjectURL(url);}
  }
  function figureName(result,kind,format){return`${result.short.replace(/[^a-z0-9_-]/gi,'_')}_${kind}_${result.folds}fold_seed${result.seed}_SIMULATED.${format}`;}
  function record(batch,ordered){return{version:'SNP-FIGURES-1.0',dataSource:'SIMULATED',modelFitted:false,uploadedDataUsed:false,task:batch.task,folds:batch.folds,seed:batch.seed,syntheticSamples:batch.n,modelOrder:ordered.map(r=>r.id),figureOrder:['01_scatter','02_density','03_folds'],pngPixels:[2160,1600],split:batch.task==='classification'?'Deterministic synthetic stratified partitions':'Deterministic synthetic shuffled partitions',method:'Synthetic predictions, not fitted estimators. One held-out synthetic prediction per sample. Metrics computed from these synthetic values; Gaussian KDE and observed-to-predicted OLS. Training curves are synthetic.',notebookReferences:['01.RF.ipynb','02.GBDT.ipynb','03.XGBoost.ipynb','04.LightGBM.ipynb','05.SVR&KRR.ipynb'],metrics:ordered.map(r=>({model:r.id,...r.metrics}))};}
  function dataEntries(batch,ordered){
    const entries=[{name:'SIMULATED_manifest.json',data:JSON.stringify(record(batch,ordered),null,2)},{name:'README_SIMULATED.txt',data:'SNP Studio scientific figure demo\n\nALL RESULTS ARE SIMULATED. No model fitted. No uploaded SNP data used.\nThe fold count changes synthetic partitions and predictions; it does not execute cross-validation training.\n\nFolders follow the displayed model sort order. Within each folder: 01 scatter, 02 density, 03 folds.\nPNG: 2160 x 1600 pixels. SVG: editable vector graphics.\nCSV files include SIMULATED on every record and can be used to reproduce the plotted points.\nRMSE/PCC are calculated from pooled synthetic validation predictions; per-fold metrics are exported separately.\nTraining predictions are synthetic and should not be interpreted as fitted training performance.\nClassification density smooths predicted probabilities by observed label; KDE has boundary bias near 0/1.\nGaussian KDE uses a diagonal bandwidth approximation; it is not byte-for-byte scipy.gaussian_kde.\n'}];
    entries.push({name:'SIMULATED_model_metrics.csv',data:textCSV([['data_source','order','task','model','folds','seed','n','RMSE','PCC','MAE','ROC_AUC','Brier','accuracy','F1','slope','intercept'],...ordered.map((r,i)=>['SIMULATED',i+1,r.task,r.id,r.folds,r.seed,r.n,r.metrics.rmse,r.metrics.pcc,r.metrics.mae,r.metrics.auc,r.metrics.brier,r.metrics.accuracy,r.metrics.f1,r.metrics.slope,r.metrics.intercept])])});
    ordered.forEach((r,i)=>{
      const directory=`${pad(i+1)}_${r.id}/`;
      entries.push({name:directory+'SIMULATED_predictions.csv',data:textCSV([['data_source','task','model','sample_id','validation_fold','observed','predicted'],...r.observed.map((v,j)=>['SIMULATED',r.task,r.id,'SYN'+String(j+1).padStart(3,'0'),r.assignments[j],v,r.predicted[j]])])});
      entries.push({name:directory+'SIMULATED_fold_metrics.csv',data:textCSV([['data_source','model','fold','train_n','validation_n','train_PCC','validation_PCC','train_RMSE','validation_RMSE','train_AUC','validation_AUC'],...r.foldMetrics.map(f=>['SIMULATED',r.id,f.fold,f.trainN,f.testN,f.train.pcc,f.test.pcc,f.train.rmse,f.test.rmse,f.train.auc,f.test.auc])])});
    });return entries;
  }
  function locked(value){state.exporting=value;el('figureTask').disabled=value;el('figureFolds').disabled=value;el('figureSeed').disabled=value;el('figureSort').disabled=value;el('figureFormat').disabled=value;el('generateFigures').disabled=value;el('figureModelOptions').querySelectorAll('input').forEach(e=>e.disabled=value);availability();}
  async function exportAll(){
    if(state.exporting||state.dirty||!state.batch?.results.length)return;
    const batch=state.batch,ordered=[...state.ordered],format=el('figureFormat').value,total=ordered.length*3;locked(true);
    try{
      const entries=dataEntries(batch,ordered);let done=0;
      for(let i=0;i<ordered.length;i++)for(const [j,figure] of F.figures(ordered[i]).entries()){
        const prefix=`${pad(i+1)}_${ordered[i].id}/${pad(j+1)}_${figure.id}_SIMULATED`;
        status(`正在打包 ${done+1}/${total}：${ordered[i].short} / ${figure.title}…`);
        if(format==='both'||format==='svg')entries.push({name:prefix+'.svg',data:figure.svg});
        if(format==='both'||format==='png'){const blob=await svgToPng(figure.svg);entries.push({name:prefix+'.png',data:await blob.arrayBuffer()});}
        done++;await new Promise(resolve=>setTimeout(resolve,0));
      }
      saveBlob(new Blob([F.zip(entries)],{type:'application/zip'}),`SNP_SIMULATED_${batch.task}_${batch.folds}fold_seed${batch.seed}.zip`);
      status(`已生成 ZIP：${total} 张科研图（${format==='both'?'PNG + SVG':format.toUpperCase()}）及 CSV、运行说明，排序与页面一致。浏览器将保存至你的下载目录。`);
    }catch(error){status('导出失败：'+error.message,true);}finally{locked(false);}
  }
  el('figureTask').onchange=()=>{modelOptions();generate();};el('figureFolds').oninput=dirty;el('figureSeed').oninput=dirty;el('figureSort').onchange=render;el('generateFigures').onclick=()=>generate();el('downloadFigures').onclick=exportAll;
  el('expandFigures').onclick=()=>el('figureGallery').querySelectorAll('details').forEach(d=>d.open=true);
  el('collapseFigures').onclick=()=>el('figureGallery').querySelectorAll('details').forEach(d=>d.open=false);
  el('figureModelOptions').onchange=event=>{const task=el('figureTask').value;if(event.target.checked)state.selections[task].add(event.target.value);else state.selections[task].delete(event.target.value);generate();};
  el('figureGallery').onclick=async event=>{
    const button=event.target.closest('[data-figure-download]');if(!button||state.dirty||state.exporting)return;
    const r=state.ordered.find(r=>r.id===button.dataset.model),figure=F.figures(r).find(f=>f.id===button.dataset.kind),format=button.dataset.figureDownload;locked(true);
    try{const blob=format==='png'?await svgToPng(figure.svg):new Blob([figure.svg],{type:'image/svg+xml;charset=utf-8'});saveBlob(blob,figureName(r,figure.id,format));status(`已导出 ${r.short} / ${figure.title}（${format.toUpperCase()}，SIMULATED）。`);}catch(error){status(error.message,true);}finally{locked(false);}
  };
  window.ScientificPlots={configure(folds,models){el('figureFolds').value=String(folds);state.selections.classification=new Set(models);modelOptions();generate(false);},state,generate,exportAll,svgToPng,record,dataEntries};
  modelOptions();generate(false);
  if(window.location.hash==='#figures')navigate('figures');
})();
