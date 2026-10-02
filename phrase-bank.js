'use strict';

(()=>{
  const source=document.querySelector('.active-vocab-card:not(#phraseBankMount)');
  const mount=document.getElementById('phraseBankMount');
  const sourcePractice=document.getElementById('practiceButton');
  const practiceScreen=document.getElementById('practiceScreen');
  const practiceListTitle=document.getElementById('practiceListTitle');
  const practiceList=document.getElementById('practiceListPlaceholder');
  const practiceBack=document.getElementById('practiceBackToList');
  const practiceInfoRow=document.querySelector('.practice-info-row.practice-info-primary');
  const practiceWordTitle=document.querySelector('.practice-word-title');
  const practiceWordHeading=document.querySelector('.practice-word-heading');
  const practiceNoteButton=document.getElementById('practiceNoteButton');
  const practiceWordCopy=document.getElementById('practiceWordCopy');
  const navHome=document.querySelector('.nav-home');
  const shell=document.querySelector('.shell');
  const sharedFilterCard=document.getElementById('filterCard');
  const wordTextFilterSection=sharedFilterCard?.querySelector('[data-filter-section="text"]');
  const wordFromField=document.getElementById('wordFrom')?.closest('label');
  const wordTextFilterTitle=wordTextFilterSection?.querySelector('.filter-section-head h3 span:last-child');
  const otherFilterBadge=sharedFilterCard?.querySelector('[data-filter-section="other"] .condition-badge');
  if(!source||!mount||!sourcePractice||!practiceScreen||!shell)return;

  const clone=source.cloneNode(true);
  const idMap=new Map();
  clone.querySelectorAll('[id]').forEach(element=>{const original=element.id,replacement=`phrase_${original}`;idMap.set(original,replacement);element.id=replacement});
  clone.querySelectorAll('[aria-controls]').forEach(element=>{const target=element.getAttribute('aria-controls');if(idMap.has(target))element.setAttribute('aria-controls',idMap.get(target))});
  mount.className=clone.className;mount.replaceChildren(...clone.childNodes);
  mount.querySelector('.home-module-title strong').textContent='マイフレーズバンク';
  mount.querySelector('.home-module-title small').textContent='MY PHRASE BANK';

  const phrasePractice=document.getElementById(idMap.get('practiceButton'));
  const phraseInput=document.getElementById(idMap.get('excelInput'));
  const phraseExport=document.getElementById(idMap.get('exportButton'));
  const phraseTabs=[...mount.querySelectorAll('[data-home-stat]')];
  const phrasePanels=[...mount.querySelectorAll('.home-stat-panel')];
  const panelByStat={understanding:idMap.get('homeUnderstandingPanel'),answers:idMap.get('homeAnswerPanel'),words:idMap.get('homeWordPanel')};
  const STORE_KEY='phraseBankV2',LEGACY_STORE_KEY='phraseBankV1',UNCATEGORIZED_NAME='未分類';
  const PHRASE_HEADERS=['フレーズID','例文番号','主カテゴリ','追加カテゴリ','日本語文','英文','補足','理解度','◯回数','×回数','△回数'];
  const CATEGORY_HEADERS=['カテゴリパス','表示順'];
  let data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],fileName:'未読込'};
  let loaded=false,moduleMode='active-vocabulary',launchingPhrase=false,editorPhraseId=null,editorCategoryIds=new Set(),editorPrimaryId=null,categoryDraftParentId=undefined,rowPhraseIds=new WeakMap(),phraseFilterCategoryIds=new Set();
  const normalize=value=>String(value??'').trim();
  const number=value=>Math.max(0,Number.parseInt(value,10)||0);
  try{phraseFilterCategoryIds=new Set(JSON.parse(localStorage.getItem('phraseCategoryFilterV1')||'[]').map(number).filter(Boolean))}catch{}

  const phraseHierarchyFilter=document.createElement('div');phraseHierarchyFilter.className='filter-section phrase-hierarchy-filter';phraseHierarchyFilter.dataset.filterSection='phrase-category';phraseHierarchyFilter.hidden=true;
  phraseHierarchyFilter.innerHTML='<div class="filter-section-head"><h3><span class="condition-badge">条件3</span><span>階層</span></h3><div class="filter-section-actions"><button class="section-filter-button select" id="phraseHierarchyFilterAction" type="button">すべて選択</button></div></div><p class="phrase-hierarchy-filter-help">任意の階層を複数選択できます。親を選ぶと配下も対象になります。</p><div id="phraseHierarchyFilterChoices"></div>';
  wordTextFilterSection?.after(phraseHierarchyFilter);

  const openDatabase=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('flovo-data',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('app'))request.result.createObjectStore('app')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const readStore=async key=>{const database=await openDatabase();try{return await new Promise((resolve,reject)=>{const transaction=database.transaction('app','readonly'),request=transaction.objectStore('app').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{database.close()}};
  const writeStore=async()=>{const database=await openDatabase();try{await new Promise((resolve,reject)=>{const transaction=database.transaction('app','readwrite');transaction.objectStore('app').put(data,STORE_KEY);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)})}finally{database.close()}};
  const migrateLegacy=legacy=>{
    if(!legacy||!Array.isArray(legacy.phrases))return null;
    const migrated={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],fileName:'未読込'},categoryByName=new Map();
    (legacy.scenes||[]).forEach((name,index)=>{const id=migrated.nextCategoryId++;migrated.categories.push({id,parentId:null,name:normalize(name),order:index+1});categoryByName.set(normalize(name),id)});
    legacy.phrases.forEach((phrase,index)=>{const categoryIds=(phrase.scenes||[]).map(name=>categoryByName.get(normalize(name))).filter(Boolean),id=number(phrase.id)||migrated.nextPhraseId++;migrated.nextPhraseId=Math.max(migrated.nextPhraseId,id+1);migrated.phrases.push({id,primaryCategoryId:categoryIds[0]||null,categoryIds,japanese:normalize(phrase.japanese),english:normalize(phrase.english),note:normalize(phrase.note),understanding:normalize(phrase.understanding),correct:number(phrase.correct),wrong:number(phrase.wrong),unsure:number(phrase.unsure),order:index+1})});
    return migrated;
  };
  const loadData=async()=>{
    if(loaded)return;
    let saved=await readStore(STORE_KEY);if(!saved)saved=migrateLegacy(await readStore(LEGACY_STORE_KEY));
    if(saved&&Array.isArray(saved.categories)&&Array.isArray(saved.phrases))data=saved;
    data.version=2;data.fileName=data.fileName||'未読込';
    data.nextCategoryId=Math.max(number(data.nextCategoryId)||1,...data.categories.map(item=>number(item.id)+1));
    data.nextPhraseId=Math.max(number(data.nextPhraseId)||1,...data.phrases.map(item=>number(item.id)+1));
    data.categories.forEach((item,index)=>{item.id=number(item.id);item.parentId=item.parentId==null?null:number(item.parentId);item.name=normalize(item.name);item.order=number(item.order)||index+1});
    data.phrases.forEach((item,index)=>{item.id=number(item.id);item.categoryIds=[...new Set((item.categoryIds||[]).map(number).filter(Boolean))];item.primaryCategoryId=number(item.primaryCategoryId)||item.categoryIds[0]||null;if(item.primaryCategoryId&&!item.categoryIds.includes(item.primaryCategoryId))item.categoryIds.unshift(item.primaryCategoryId);item.japanese=normalize(item.japanese);item.english=normalize(item.english);item.note=normalize(item.note);item.understanding=normalize(item.understanding);item.correct=number(item.correct);item.wrong=number(item.wrong);item.unsure=number(item.unsure);item.order=number(item.order)||index+1});
    const uncategorized=ensureUncategorizedCategory();
    data.phrases.forEach(item=>{if(!categoryById(item.primaryCategoryId)){item.primaryCategoryId=uncategorized.id;item.categoryIds=[uncategorized.id]}});
    loaded=true;await writeStore();refreshPhraseHome();renderPhraseHierarchyFilter();
  };
  const categoryById=id=>data.categories.find(item=>item.id===Number(id));
  const childrenOf=parentId=>data.categories.filter(item=>(item.parentId??null)===(parentId??null)).sort((a,b)=>a.order-b.order||a.id-b.id);
  const uncategorizedCategory=()=>data.categories.find(item=>item.system==='uncategorized');
  const isUncategorized=item=>item?.system==='uncategorized';
  const ensureUncategorizedCategory=()=>{
    let item=uncategorizedCategory()||data.categories.find(candidate=>candidate.parentId==null&&candidate.name===UNCATEGORIZED_NAME);
    if(!item){item={id:data.nextCategoryId++,parentId:null,name:UNCATEGORIZED_NAME,order:Math.max(0,...data.categories.filter(candidate=>candidate.parentId==null).map(candidate=>number(candidate.order)))+1};data.categories.push(item)}
    item.system='uncategorized';item.parentId=null;item.name=UNCATEGORIZED_NAME;
    return item;
  };
  const categoryPathNodes=id=>{const nodes=[];let item=categoryById(id);const seen=new Set();while(item&&!seen.has(item.id)){seen.add(item.id);nodes.unshift(item);item=categoryById(item.parentId)}return nodes};
  const categoryPath=id=>categoryPathNodes(id).map(item=>item.name).join(' > ')||'カテゴリ未登録';
  const categoryCode=id=>{const nodes=categoryPathNodes(id);return nodes.some(isUncategorized)?'0':nodes.map(item=>childrenOf(item.parentId).filter(candidate=>!isUncategorized(candidate)).findIndex(candidate=>candidate.id===item.id)+1).join('.')||'0'};
  const descendantIds=id=>{const ids=new Set();const visit=parentId=>childrenOf(parentId).forEach(item=>{ids.add(item.id);visit(item.id)});visit(id);return ids};
  const pickEditorPrimary=preferred=>{
    if(preferred&&editorCategoryIds.has(preferred)){editorPrimaryId=preferred;return}
    editorPrimaryId=[...editorCategoryIds].sort((a,b)=>categoryPathNodes(b).length-categoryPathNodes(a).length)[0]||null;
  };
  const toggleEditorCategory=(item,selected)=>{
    if(!selected){
      descendantIds(item.id).forEach(id=>editorCategoryIds.delete(id));editorCategoryIds.delete(item.id);pickEditorPrimary();return;
    }
    const uncategorized=ensureUncategorizedCategory();
    if(isUncategorized(item))editorCategoryIds.clear();else editorCategoryIds.delete(uncategorized.id);
    const selectedRoot=categoryPathNodes(item.id)[0];
    childrenOf(null).filter(root=>root.id!==selectedRoot?.id).forEach(root=>{editorCategoryIds.delete(root.id);descendantIds(root.id).forEach(id=>editorCategoryIds.delete(id))});
    if(item.parentId!=null)childrenOf(item.parentId).filter(sibling=>sibling.id!==item.id).forEach(sibling=>{editorCategoryIds.delete(sibling.id);descendantIds(sibling.id).forEach(id=>editorCategoryIds.delete(id))});
    categoryPathNodes(item.id).forEach(node=>editorCategoryIds.add(node.id));pickEditorPrimary(item.id);
  };
  const normalizeEditorCategories=()=>{
    const uncategorized=ensureUncategorizedCategory();
    if(editorCategoryIds.has(uncategorized.id)&&editorCategoryIds.size>1){if(editorPrimaryId===uncategorized.id)editorCategoryIds=new Set([uncategorized.id]);else editorCategoryIds.delete(uncategorized.id)}
    const preferredPath=new Set(categoryPathNodes(editorPrimaryId).map(item=>item.id));
    const selectedRoots=childrenOf(null).filter(item=>editorCategoryIds.has(item.id));
    if(selectedRoots.length>1){const keep=selectedRoots.find(item=>preferredPath.has(item.id))||selectedRoots[0];selectedRoots.filter(item=>item!==keep).forEach(item=>{editorCategoryIds.delete(item.id);descendantIds(item.id).forEach(id=>editorCategoryIds.delete(id))})}
    data.categories.forEach(parent=>{
      const selected=childrenOf(parent.id).filter(item=>editorCategoryIds.has(item.id));if(selected.length<2)return;
      const keep=selected.find(item=>preferredPath.has(item.id))||selected[0];selected.filter(item=>item!==keep).forEach(item=>{editorCategoryIds.delete(item.id);descendantIds(item.id).forEach(id=>editorCategoryIds.delete(id))});
    });
    [...editorCategoryIds].forEach(id=>categoryPathNodes(id).forEach(item=>editorCategoryIds.add(item.id)));pickEditorPrimary(editorPrimaryId);
  };
  const phraseSequence=phrase=>data.phrases.filter(item=>(item.primaryCategoryId||null)===(phrase.primaryCategoryId||null)).sort((a,b)=>a.order-b.order||a.id-b.id).findIndex(item=>item.id===phrase.id)+1;
  const phraseNumber=phrase=>`${categoryCode(phrase.primaryCategoryId)}-${String(Math.max(1,phraseSequence(phrase))).padStart(3,'0')}`;
  const phraseByNumber=value=>data.phrases.find(item=>phraseNumber(item)===String(value).replace(/^No\s*/i,''));
  const flattenCategories=()=>{const result=[];const visit=(parentId,depth)=>childrenOf(parentId).forEach(item=>{result.push({item,depth});visit(item.id,depth+1)});visit(null,0);return result};
  const ensureCategoryPath=path=>{let parentId=null,found=null;for(const name of String(path||'').split('>').map(normalize).filter(Boolean)){found=childrenOf(parentId).find(item=>item.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'));if(!found){found={id:data.nextCategoryId++,parentId,name,order:childrenOf(parentId).length+1};data.categories.push(found)}parentId=found.id}return found?.id||null};
  const renderPhraseHierarchyFilter=()=>{
    phraseFilterCategoryIds=new Set([...phraseFilterCategoryIds].filter(id=>categoryById(id)));
    const container=phraseHierarchyFilter.querySelector('#phraseHierarchyFilterChoices');container.replaceChildren();
    flattenCategories().forEach(({item,depth})=>{const row=document.createElement('label');row.className='phrase-hierarchy-filter-choice';row.style.setProperty('--depth',depth);const check=document.createElement('input');check.type='checkbox';check.checked=phraseFilterCategoryIds.has(item.id);check.setAttribute('aria-label',`${categoryPath(item.id)}で絞り込む`);const label=document.createElement('span');label.textContent=item.name;check.addEventListener('change',()=>{if(check.checked)phraseFilterCategoryIds.add(item.id);else phraseFilterCategoryIds.delete(item.id);renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.()});row.append(check,label);container.append(row)});
    const action=phraseHierarchyFilter.querySelector('#phraseHierarchyFilterAction'),active=Boolean(phraseFilterCategoryIds.size);action.textContent=active?'リセット':'すべて選択';action.classList.toggle('selected',active);action.setAttribute('aria-pressed',String(active));
  };
  const phraseMatchesFilter=row=>{
    if(!phraseFilterCategoryIds.size)return true;
    const phrase=data.phrases.find(item=>item.id===rowPhraseIds.get(row))||phraseByNumber(row?.[0]);if(!phrase)return false;
    const covered=new Set();[phrase.primaryCategoryId,...phrase.categoryIds].filter(Boolean).forEach(id=>categoryPathNodes(id).forEach(item=>covered.add(item.id)));
    return [...phraseFilterCategoryIds].some(id=>covered.has(id));
  };
  phraseHierarchyFilter.querySelector('#phraseHierarchyFilterAction').addEventListener('click',()=>{if(phraseFilterCategoryIds.size)phraseFilterCategoryIds.clear();else flattenCategories().forEach(({item})=>phraseFilterCategoryIds.add(item.id));renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.()});

  const toStoredData=()=>{
    rowPhraseIds=new WeakMap();
    const rows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(phrase=>{const row=[phraseNumber(phrase),categoryPath(phrase.primaryCategoryId),'','','','','','','','','','',phrase.japanese,phrase.english,phrase.note,phrase.understanding,phrase.correct,phrase.wrong,phrase.unsure];rowPhraseIds.set(row,phrase.id);return row});
    return {headers:[],rows,vocabularyRows:rows,fileName:data.fileName,modified:true,phraseBank:true};
  };
  const saveStoredData=async stored=>{(stored?.rows||[]).forEach(row=>{const phrase=data.phrases.find(item=>item.id===rowPhraseIds.get(row));if(!phrase)return;phrase.japanese=normalize(row[12]);phrase.english=normalize(row[13]);phrase.note=normalize(row[14]);phrase.understanding=normalize(row[15]);phrase.correct=number(row[16]);phrase.wrong=number(row[17]);phrase.unsure=number(row[18])});await writeStore();refreshPhraseHome()};
  window.flovoPracticeAdapter={active:false,getData:async()=>{await loadData();return toStoredData()},saveData:saveStoredData,matchesRow:phraseMatchesFilter,getFilterSnapshot:()=>[...phraseFilterCategoryIds],restoreFilterSnapshot:ids=>{phraseFilterCategoryIds=new Set(Array.isArray(ids)?ids:[]);renderPhraseHierarchyFilter()},resetFilter:()=>{phraseFilterCategoryIds.clear();renderPhraseHierarchyFilter()},commitFilter:()=>{try{localStorage.setItem('phraseCategoryFilterV1',JSON.stringify([...phraseFilterCategoryIds]))}catch{}}};

  const setText=(original,value)=>{const element=document.getElementById(idMap.get(original));if(element)element.textContent=String(value)};
  const refreshPhraseHome=()=>{
    const total=data.phrases.length,counts={mastered:0,steady:0,learning:0,new:0};data.phrases.forEach(item=>{if(item.understanding==='100%')counts.mastered++;else if(item.understanding==='80%')counts.steady++;else if(item.understanding==='50%')counts.learning++;else counts.new++});
    setText('homeImportFileName',data.fileName||'未読込');setText('homeMasteryRate',total?`${Math.round(counts.mastered/total*100)}%`:'0%');setText('homeMasteredCount',counts.mastered);setText('homeSteadyCount',counts.steady);setText('homeLearningCount',counts.learning);setText('homeNewCount',counts.new);
    const correct=data.phrases.reduce((sum,item)=>sum+item.correct,0),wrong=data.phrases.reduce((sum,item)=>sum+item.wrong,0),unsure=data.phrases.reduce((sum,item)=>sum+item.unsure,0),answers=correct+wrong+unsure;
    setText('homeAnswerRate',answers?`${Math.round(correct/answers*100)}%`:'—%');setText('homeCorrectCount',correct);setText('homeWrongCount',wrong);setText('homeUnsureCount',unsure);setText('homeTotalWordCount',total);setText('homeActiveWordCount',total);
  };
  phraseTabs.forEach(button=>button.addEventListener('click',()=>{phraseTabs.forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active))});phrasePanels.forEach(panel=>{panel.hidden=panel.id!==panelByStat[button.dataset.homeStat]})}));

  const applyModuleLabels=()=>{
    const phrase=moduleMode==='phrase-bank';document.body.dataset.practiceModule=phrase?'phrase-bank':'active-vocabulary';
    phraseHierarchyFilter.hidden=!phrase;if(wordFromField)wordFromField.hidden=phrase;if(wordTextFilterTitle)wordTextFilterTitle.textContent=phrase?'カテゴリ文字列条件':'単語文字列条件';if(otherFilterBadge)otherFilterBadge.textContent=phrase?'条件4':'条件5';
    if(practiceWordTitle)practiceWordTitle.textContent=phrase?'カテゴリ':'単語';
    if(practiceNoteButton&&practiceInfoRow&&practiceWordHeading){if(phrase)practiceInfoRow.append(practiceNoteButton);else practiceWordHeading.insertBefore(practiceNoteButton,practiceWordCopy||null)}
    if(practiceListTitle)practiceListTitle.textContent=phrase?'マイフレーズバンク':'例文一覧';practiceScreen.setAttribute('aria-label',phrase?'マイフレーズバンク':'英作文練習');if(practiceList)practiceList.setAttribute('aria-label',phrase?'マイフレーズバンク':'例文一覧');if(practiceBack)practiceBack.setAttribute('aria-label',phrase?'マイフレーズバンク一覧へ戻る':'例文一覧へ戻る');
  };
  sourcePractice.addEventListener('click',()=>{if(!launchingPhrase){moduleMode='active-vocabulary';window.flovoPracticeAdapter.active=false;applyModuleLabels()}},{capture:true});
  const launchPhrase=async()=>{await loadData();moduleMode='phrase-bank';window.flovoPracticeAdapter.active=true;applyModuleLabels();launchingPhrase=true;try{sourcePractice.click()}finally{launchingPhrase=false}};
  phrasePractice.addEventListener('click',()=>launchPhrase().catch(()=>alert('マイフレーズバンクを開けませんでした。')));
  phrasePractice.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();launchPhrase().catch(()=>alert('マイフレーズバンクを開けませんでした。'))}});
  navHome?.addEventListener('click',()=>{if(practiceScreen.hidden){moduleMode='active-vocabulary';window.flovoPracticeAdapter.active=false;applyModuleLabels()}});
  new MutationObserver(()=>{
    if(!practiceScreen.hidden)applyModuleLabels();
    else if(!launchingPhrase){moduleMode='active-vocabulary';window.flovoPracticeAdapter.active=false;applyModuleLabels()}
  }).observe(practiceScreen,{attributes:true,attributeFilter:['hidden']});

  const editor=document.createElement('div');editor.className='phrase-data-overlay';editor.id='phraseDataOverlay';editor.hidden=true;
  editor.innerHTML=`<section class="phrase-data-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseDataTitle"><header class="phrase-data-head"><button id="phraseDataCancel" type="button">キャンセル</button><h2 id="phraseDataTitle">フレーズ追加</h2><button id="phraseDataSave" type="button">保存</button></header><div class="phrase-data-body"><label><span>日本語 <b>※</b></span><textarea id="phraseJapaneseInput" rows="3"></textarea></label><label><span>英語 <b>※</b></span><textarea id="phraseEnglishInput" rows="3" lang="en"></textarea></label><label><span>補足</span><textarea id="phraseNoteInput" rows="3"></textarea></label><div class="phrase-category-field"><div><strong>カテゴリ</strong><button id="phraseCategoryManage" type="button">階層管理</button></div><p>親階層は1つだけ選択できます。子を選ぶと親も自動選択されます。</p><div id="phraseCategoryChoices"></div></div><p class="phrase-data-error" id="phraseDataError" hidden></p><button class="phrase-data-delete" id="phraseDataDelete" type="button" hidden>このフレーズを削除</button></div></section>`;shell.append(editor);
  const manager=document.createElement('div');manager.className='phrase-data-overlay';manager.id='phraseCategoryOverlay';manager.hidden=true;
  manager.innerHTML=`<section class="phrase-data-sheet phrase-category-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseCategoryTitle"><header class="phrase-data-head"><button id="phraseCategoryClose" type="button">閉じる</button><h2 id="phraseCategoryTitle">階層管理</h2><span></span></header><p class="phrase-category-help">＋から階層を直接追加できます。並び順が階層番号になります。</p><div class="phrase-category-manager" id="phraseCategoryManager"></div></section>`;shell.append(manager);
  const $=selector=>document.querySelector(selector);

  const renderCategoryChoices=()=>{
    const container=$('#phraseCategoryChoices');container.replaceChildren();const flat=flattenCategories();if(!flat.length){container.innerHTML='<p class="phrase-category-empty">階層管理からカテゴリを作成してください。</p>';return}
    flat.forEach(({item,depth})=>{const row=document.createElement('label');row.className='phrase-category-choice';row.style.setProperty('--depth',depth);const check=document.createElement('input');check.type='checkbox';check.checked=editorCategoryIds.has(item.id);check.setAttribute('aria-label',`${categoryPath(item.id)}を設定`);const label=document.createElement('span');label.textContent=item.name;check.addEventListener('change',()=>{toggleEditorCategory(item,check.checked);renderCategoryChoices()});row.append(check,label);container.append(row)});
    renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.();
  };
  const openEditor=async phrase=>{await loadData();editorPhraseId=phrase?.id??null;editorCategoryIds=new Set(phrase?.categoryIds||[]);editorPrimaryId=phrase?.primaryCategoryId||null;normalizeEditorCategories();$('#phraseDataTitle').textContent=phrase?'フレーズ編集':'フレーズ追加';$('#phraseJapaneseInput').value=phrase?.japanese||'';$('#phraseEnglishInput').value=phrase?.english||'';$('#phraseNoteInput').value=phrase?.note||'';$('#phraseDataDelete').hidden=!phrase;$('#phraseDataError').hidden=true;renderCategoryChoices();editor.hidden=false};
  const closeEditor=()=>{editor.hidden=true;editorPhraseId=null;editorCategoryIds.clear();editorPrimaryId=null};
  const refreshLivePractice=options=>practiceScreen.hidden?Promise.resolve():window.flovoPracticeBridge?.refresh?.(options)||Promise.resolve();
  const saveEditor=async()=>{const japanese=normalize($('#phraseJapaneseInput').value),english=normalize($('#phraseEnglishInput').value),note=normalize($('#phraseNoteInput').value),error=$('#phraseDataError');if(!japanese||!english){error.textContent='日本語と英語は両方入力してください。';error.hidden=false;return}pickEditorPrimary(editorPrimaryId);if(!editorPrimaryId){error.textContent='カテゴリを選択してください。';error.hidden=false;return}let phrase=data.phrases.find(item=>item.id===editorPhraseId),isNew=!phrase;if(!phrase){phrase={id:data.nextPhraseId++,order:data.phrases.length+1,understanding:'',correct:0,wrong:0,unsure:0};data.phrases.push(phrase)}Object.assign(phrase,{primaryCategoryId:editorPrimaryId,categoryIds:[...editorCategoryIds],japanese,english,note});await writeStore();refreshPhraseHome();const preferredNumber=phraseNumber(phrase);closeEditor();await refreshLivePractice({preferredNumber,view:isNew?'list':undefined})};
  const deletePhrase=async()=>{const phrase=data.phrases.find(item=>item.id===editorPhraseId);if(!phrase||!confirm('このフレーズを削除しますか？'))return;data.phrases=data.phrases.filter(item=>item!==phrase);await writeStore();refreshPhraseHome();closeEditor();await refreshLivePractice({view:'list'})};

  const addCategory=async(parentId,name)=>{
    const next=normalize(name);
    if(!next||/[>|]/.test(next)){alert('カテゴリ名に「>」「|」は使えません。');return false}
    if(next===UNCATEGORIZED_NAME){alert('「未分類」は固定階層のため追加できません。');return false}
    if(childrenOf(parentId).some(candidate=>candidate.name.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ階層に同名のカテゴリがあります。');return false}
    data.categories.push({id:data.nextCategoryId++,parentId,name:next,order:childrenOf(parentId).length+1});categoryDraftParentId=undefined;await writeStore();renderCategoryManager();renderCategoryChoices();return true;
  };
  const appendCategoryDraft=(container,parentId,depth)=>{
    const row=document.createElement('div');row.className='phrase-category-manager-row phrase-category-draft';row.style.setProperty('--depth',depth);
    const code=document.createElement('b');code.textContent='＋';
    const input=document.createElement('input');input.maxLength=30;input.placeholder=parentId==null?'新しい親階層名':'新しい子階層名';input.setAttribute('aria-label',input.placeholder);
    const save=document.createElement('button');save.type='button';save.textContent='追加';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
    const commit=()=>addCategory(parentId,input.value).catch(()=>alert('カテゴリを追加できませんでした。'));
    save.addEventListener('click',commit);cancel.addEventListener('click',()=>{categoryDraftParentId=undefined;renderCategoryManager()});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape'){event.preventDefault();categoryDraftParentId=undefined;renderCategoryManager()}});
    row.append(code,input,save,cancel);container.append(row);requestAnimationFrame(()=>input.focus({preventScroll:true}));
  };

  const renderCategoryManager=()=>{
    const container=$('#phraseCategoryManager');container.replaceChildren();const flat=flattenCategories();
    flat.forEach(({item,depth})=>{
      const fixed=isUncategorized(item),row=document.createElement('div');row.className='phrase-category-manager-row';row.style.setProperty('--depth',depth);
      const code=document.createElement('b');code.textContent=categoryCode(item.id);
      const input=document.createElement('input');input.value=item.name;input.maxLength=30;input.disabled=fixed;input.setAttribute('aria-label',`${item.name}の名前`);
      const save=document.createElement('button');save.type='button';save.textContent=fixed?'固定':'変更';save.disabled=fixed;
      save.addEventListener('click',async()=>{const next=normalize(input.value);if(!next||/[>|]/.test(next)){alert('カテゴリ名に「>」「|」は使えません。');return}if(next===UNCATEGORIZED_NAME){alert('「未分類」は固定階層名です。');return}if(childrenOf(item.parentId).some(candidate=>candidate.id!==item.id&&candidate.name.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ階層に同名のカテゴリがあります。');return}item.name=next;await writeStore();renderCategoryManager();renderCategoryChoices()});
      const add=document.createElement('button');add.type='button';add.textContent='＋';add.disabled=fixed;add.setAttribute('aria-label',fixed?'未分類には子階層を追加できません':`${item.name}に子階層を追加`);
      add.addEventListener('click',()=>{categoryDraftParentId=item.id;renderCategoryManager()});
      const up=document.createElement('button');up.type='button';up.textContent='↑';up.setAttribute('aria-label',`${item.name}を上へ`);up.addEventListener('click',async()=>{const siblings=childrenOf(item.parentId),index=siblings.findIndex(candidate=>candidate.id===item.id);if(index<1)return;const previous=siblings[index-1],order=item.order;item.order=previous.order;previous.order=order;await writeStore();renderCategoryManager();renderCategoryChoices()});
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.disabled=fixed;remove.setAttribute('aria-label',fixed?'未分類は削除できません':`${item.name}を削除`);
      remove.addEventListener('click',async()=>{const ids=new Set([item.id,...descendantIds(item.id)]),affected=data.phrases.filter(phrase=>ids.has(phrase.primaryCategoryId)||phrase.categoryIds.some(id=>ids.has(id)));if(!confirm(`「${item.name}」と配下の階層を削除しますか？${affected.length?`\n含まれるフレーズ ${affected.length}件は「未分類」へ移動します。`:''}`))return;const uncategorized=ensureUncategorizedCategory();affected.forEach(phrase=>{phrase.primaryCategoryId=uncategorized.id;phrase.categoryIds=[uncategorized.id]});if(affected.some(phrase=>phrase.id===editorPhraseId)){editorPrimaryId=uncategorized.id;editorCategoryIds=new Set([uncategorized.id])}data.categories=data.categories.filter(candidate=>!ids.has(candidate.id));await writeStore();renderCategoryManager();renderCategoryChoices();await refreshLivePractice({view:'list'})});
      row.append(code,input,save,add,up,remove);container.append(row);if(categoryDraftParentId===item.id)appendCategoryDraft(container,item.id,depth+1);
    });
    if(categoryDraftParentId===null)appendCategoryDraft(container,null,0);
    const addRoot=document.createElement('button');addRoot.type='button';addRoot.className='phrase-category-add-root';addRoot.textContent='＋ 親階層を追加';addRoot.addEventListener('click',()=>{categoryDraftParentId=null;renderCategoryManager()});container.append(addRoot);
  };
  const openManager=()=>{categoryDraftParentId=undefined;renderCategoryManager();manager.hidden=false};
  const closeManager=async()=>{categoryDraftParentId=undefined;manager.hidden=true;renderCategoryChoices();await refreshLivePractice({view:'list'})};
  const currentPhraseFromCard=()=>phraseByNumber(document.getElementById('practiceWordNumber')?.textContent||'');
  document.addEventListener('click',event=>{if(moduleMode!=='phrase-bank')return;const listMenu=event.target.closest?.('.practice-list-menu');if(event.target.closest?.('#practiceCardAdd')){event.preventDefault();event.stopImmediatePropagation();openEditor(null);return}if(event.target.closest?.('#practiceCardMenu')){event.preventDefault();event.stopImmediatePropagation();openEditor(currentPhraseFromCard());return}if(listMenu){event.preventDefault();event.stopImmediatePropagation();const value=listMenu.closest('.practice-list-row')?.querySelector('.practice-list-word-no')?.textContent||'';openEditor(phraseByNumber(value))}},true);
  $('#phraseDataCancel').addEventListener('click',closeEditor);$('#phraseDataSave').addEventListener('click',()=>saveEditor().catch(()=>alert('フレーズを保存できませんでした。')));$('#phraseDataDelete').addEventListener('click',()=>deletePhrase().catch(()=>alert('フレーズを削除できませんでした。')));editor.addEventListener('click',event=>{if(event.target===editor)closeEditor()});$('#phraseCategoryManage').addEventListener('click',openManager);$('#phraseCategoryClose').addEventListener('click',()=>closeManager().catch(()=>alert('練習画面を更新できませんでした。')));manager.addEventListener('click',event=>{if(event.target===manager)closeManager().catch(()=>alert('練習画面を更新できませんでした。'))});

  const buildExportWorkbook=()=>{const workbook=XLSX.utils.book_new();const phraseRows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(item=>[item.id,phraseNumber(item),categoryPath(item.primaryCategoryId),item.categoryIds.filter(id=>id!==item.primaryCategoryId).map(categoryPath).join(' | '),item.japanese,item.english,item.note,item.understanding,item.correct,item.wrong,item.unsure]);const categoryRows=flattenCategories().map(({item})=>[categoryPath(item.id),item.order]);XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([PHRASE_HEADERS,...phraseRows]),'マイフレーズ');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([CATEGORY_HEADERS,...categoryRows]),'マイフレーズカテゴリ');return workbook};
  const saveFile=async file=>{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return}const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  phraseExport.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();try{await loadData();if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const bytes=XLSX.write(buildExportWorkbook(),{bookType:'xlsx',type:'array'}),file=new File([bytes],`MyPhrase_${new Date().toISOString().slice(0,10).replaceAll('-','')}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});await saveFile(file)}catch(error){if(error?.name!=='AbortError')alert(error?.message||'書き出しに失敗しました。')}});
  phraseInput.disabled=false;
  phraseInput.addEventListener('change',async()=>{const file=phraseInput.files?.[0];if(!file)return;try{if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),phraseSheet=workbook.Sheets['マイフレーズ'];if(!phraseSheet)throw new Error('「マイフレーズ」シートがありません。');const categorySheet=workbook.Sheets['マイフレーズカテゴリ'],categoryRows=categorySheet?XLSX.utils.sheet_to_json(categorySheet,{header:1,defval:'',raw:false}).slice(1):[],phraseRows=XLSX.utils.sheet_to_json(phraseSheet,{header:1,defval:'',raw:false}).slice(1).filter(row=>row.some(value=>normalize(value)));data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],fileName:file.name};categoryRows.sort((a,b)=>String(a[0]).split('>').length-String(b[0]).split('>').length||number(a[1])-number(b[1])).forEach(row=>{const id=ensureCategoryPath(row[0]),category=categoryById(id);if(category)category.order=number(row[1])||category.order});phraseRows.forEach((row,index)=>{const japanese=normalize(row[4]),english=normalize(row[5]);if(!japanese||!english)throw new Error(`${index+2}行目：日本語文と英文は必須です。`);const primaryCategoryId=ensureCategoryPath(row[2]);if(!primaryCategoryId)throw new Error(`${index+2}行目：主カテゴリは必須です。`);const extras=String(row[3]||'').split('|').map(normalize).filter(Boolean).map(ensureCategoryPath),id=number(row[0])||data.nextPhraseId++;data.nextPhraseId=Math.max(data.nextPhraseId,id+1);data.phrases.push({id,primaryCategoryId,categoryIds:[...new Set([primaryCategoryId,...extras])],japanese,english,note:normalize(row[6]),understanding:normalize(row[7]),correct:number(row[8]),wrong:number(row[9]),unsure:number(row[10]),order:index+1})});ensureUncategorizedCategory();loaded=true;await writeStore();refreshPhraseHome();renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.();alert(`${data.phrases.length}件のマイフレーズを読み込みました。`)}catch(error){alert(error?.message||'マイフレーズの読み込みに失敗しました。')}finally{phraseInput.value=''}});
  loadData().catch(()=>{});
})();
