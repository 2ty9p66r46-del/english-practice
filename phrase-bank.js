'use strict';

(()=>{
  const source=document.querySelector('.active-vocab-card:not(#phraseBankMount)');
  const mount=document.getElementById('phraseBankMount');
  const sourcePractice=document.getElementById('practiceButton');
  const practiceScreen=document.getElementById('practiceScreen');
  const practiceListTitle=document.getElementById('practiceListTitle');
  const practiceList=document.getElementById('practiceListPlaceholder');
  const practiceBack=document.getElementById('practiceBackToList');
  if(!source||!mount||!sourcePractice||!practiceScreen)return;

  const clone=source.cloneNode(true);
  const idMap=new Map();
  clone.querySelectorAll('[id]').forEach(element=>{
    const original=element.id;
    const replacement=`phrase_${original}`;
    idMap.set(original,replacement);
    element.id=replacement;
  });
  clone.querySelectorAll('[aria-controls]').forEach(element=>{
    const target=element.getAttribute('aria-controls');
    if(idMap.has(target))element.setAttribute('aria-controls',idMap.get(target));
  });
  mount.className=clone.className;
  mount.replaceChildren(...clone.childNodes);
  mount.querySelector('.home-module-title strong').textContent='マイフレーズバンク';
  mount.querySelector('.home-module-title small').textContent='MY PHRASE BANK';

  const phrasePractice=document.getElementById(idMap.get('practiceButton'));
  const phraseImport=document.getElementById(idMap.get('importButton'));
  const phraseInput=document.getElementById(idMap.get('excelInput'));
  const phraseExport=document.getElementById(idMap.get('exportButton'));
  const phraseTabs=[...mount.querySelectorAll('[data-home-stat]')];
  const phrasePanels=[...mount.querySelectorAll('.home-stat-panel')];
  const panelByStat={understanding:idMap.get('homeUnderstandingPanel'),answers:idMap.get('homeAnswerPanel'),words:idMap.get('homeWordPanel')};
  let moduleMode='active-vocabulary';
  let launchingPhrase=false;

  phraseTabs.forEach(button=>button.addEventListener('click',()=>{
    phraseTabs.forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active))});
    phrasePanels.forEach(panel=>{panel.hidden=panel.id!==panelByStat[button.dataset.homeStat]});
  }));

  const syncedIds=['homeImportFileName','homeMasteryRate','homeMasteredCount','homeSteadyCount','homeLearningCount','homeNewCount','homeAnswerRate','homeCorrectCount','homeWrongCount','homeUnsureCount','homeTotalWordCount','homeActiveWordCount'];
  const styledIds=['homeUnderstandingDonut','homeAnswerDonut','homeCorrectBar','homeUnsureBar','homeWrongBar','homeActiveWordBar'];
  const copiedIds=['homeLevelStats','homePosStats'];
  const syncHomeCard=()=>{
    syncedIds.forEach(id=>{const from=document.getElementById(id),to=document.getElementById(idMap.get(id));if(from&&to)to.textContent=from.textContent});
    styledIds.forEach(id=>{const from=document.getElementById(id),to=document.getElementById(idMap.get(id));if(!from||!to)return;to.setAttribute('style',from.getAttribute('style')||'');const label=from.getAttribute('aria-label');if(label)to.setAttribute('aria-label',label)});
    copiedIds.forEach(id=>{const from=document.getElementById(id),to=document.getElementById(idMap.get(id));if(from&&to)to.innerHTML=from.innerHTML});
  };
  new MutationObserver(syncHomeCard).observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','aria-label']});
  syncHomeCard();

  phraseInput.disabled=true;
  phraseImport.addEventListener('click',event=>{event.preventDefault();document.getElementById('excelInput').click()});
  phraseExport.addEventListener('click',event=>{event.preventDefault();document.getElementById('exportButton').click()});

  const applyModuleLabels=()=>{
    const phrase=moduleMode==='phrase-bank';
    if(practiceListTitle)practiceListTitle.textContent=phrase?'マイフレーズバンク':'例文一覧';
    practiceScreen.setAttribute('aria-label',phrase?'マイフレーズバンク':'英作文練習');
    if(practiceList)practiceList.setAttribute('aria-label',phrase?'マイフレーズバンク':'例文一覧');
    if(practiceBack)practiceBack.setAttribute('aria-label',phrase?'マイフレーズバンク一覧へ戻る':'例文一覧へ戻る');
  };
  sourcePractice.addEventListener('click',()=>{if(!launchingPhrase){moduleMode='active-vocabulary';applyModuleLabels()}},{capture:true});
  phrasePractice.addEventListener('click',()=>{
    moduleMode='phrase-bank';applyModuleLabels();launchingPhrase=true;
    try{sourcePractice.click()}finally{launchingPhrase=false}
  });
  new MutationObserver(()=>{if(!practiceScreen.hidden)applyModuleLabels();else{moduleMode='active-vocabulary';applyModuleLabels()}}).observe(practiceScreen,{attributes:true,attributeFilter:['hidden']});
})();
