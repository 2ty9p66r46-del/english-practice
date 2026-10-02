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
  const STORE_KEY='phraseBankV2',LEGACY_STORE_KEY='phraseBankV1';
  const PHRASE_HEADERS=['フレーズID','例文番号','主カテゴリ','追加カテゴリ','日本語文','英文','補足','理解度','◯回数','×回数','△回数'];
  const CATEGORY_HEADERS=['カテゴリパス','表示順'];
  let data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],fileName:'未読込'};
  let loaded=false,moduleMode='active-vocabulary',launchingPhrase=false,editorPhraseId=null,editorCategoryIds=new Set(),editorPrimaryId=null,rowPhraseIds=new WeakMap();
  const normalize=value=>String(value??'').trim();
  const number=value=>Math.max(0,Number.parseInt(value,10)||0);

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
    loaded=true;if(saved)await writeStore();refreshPhraseHome();
  };
  const categoryById=id=>data.categories.find(item=>item.id===Number(id));
  const childrenOf=parentId=>data.categories.filter(item=>(item.parentId??null)===(parentId??null)).sort((a,b)=>a.order-b.order||a.id-b.id);
  const categoryPathNodes=id=>{const nodes=[];let item=categoryById(id);const seen=new Set();while(item&&!seen.has(item.id)){seen.add(item.id);nodes.unshift(item);item=categoryById(item.parentId)}return nodes};
  const categoryPath=id=>categoryPathNodes(id).map(item=>item.name).join(' > ')||'カテゴリ未登録';
  const categoryCode=id=>categoryPathNodes(id).map(item=>childrenOf(item.parentId).findIndex(candidate=>candidate.id===item.id)+1).join('.')||'0';
  const descendantIds=id=>{const ids=new Set();const visit=parentId=>childrenOf(parentId).forEach(item=>{ids.add(item.id);visit(item.id)});visit(id);return ids};
  const pickEditorPrimary=preferred=>{
    if(preferred&&editorCategoryIds.has(preferred)){editorPrimaryId=preferred;return}
    editorPrimaryId=[...editorCategoryIds].sort((a,b)=>categoryPathNodes(b).length-categoryPathNodes(a).length)[0]||null;
  };
  const toggleEditorCategory=(item,selected)=>{
    if(!selected){
      descendantIds(item.id).forEach(id=>editorCategoryIds.delete(id));editorCategoryIds.delete(item.id);pickEditorPrimary();return;
    }
    if(item.parentId!=null)childrenOf(item.parentId).filter(sibling=>sibling.id!==item.id).forEach(sibling=>{editorCategoryIds.delete(sibling.id);descendantIds(sibling.id).forEach(id=>editorCategoryIds.delete(id))});
    categoryPathNodes(item.id).forEach(node=>editorCategoryIds.add(node.id));pickEditorPrimary(item.id);
  };
  const normalizeEditorCategories=()=>{
    const preferredPath=new Set(categoryPathNodes(editorPrimaryId).map(item=>item.id));
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

  const toStoredData=()=>{
    rowPhraseIds=new WeakMap();
    const rows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(phrase=>{const row=[phraseNumber(phrase),categoryPath(phrase.primaryCategoryId),'','','','','','','','','','',phrase.japanese,phrase.english,phrase.note,phrase.understanding,phrase.correct,phrase.wrong,phrase.unsure];rowPhraseIds.set(row,phrase.id);return row});
    return {headers:[],rows,vocabularyRows:rows,fileName:data.fileName,modified:true,phraseBank:true};
  };
  const saveStoredData=async stored=>{(stored?.rows||[]).forEach(row=>{const phrase=data.phrases.find(item=>item.id===rowPhraseIds.get(row));if(!phrase)return;phrase.japanese=normalize(row[12]);phrase.english=normalize(row[13]);phrase.note=normalize(row[14]);phrase.understanding=normalize(row[15]);phrase.correct=number(row[16]);phrase.wrong=number(row[17]);phrase.unsure=number(row[18])});await writeStore();refreshPhraseHome()};
  window.flovoPracticeAdapter={active:false,getData:async()=>{await loadData();return toStoredData()},saveData:saveStoredData};

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
  editor.innerHTML=`<section class="phrase-data-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseDataTitle"><header class="phrase-data-head"><button id="phraseDataCancel" type="button">キャンセル</button><h2 id="phraseDataTitle">フレーズ追加</h2><button id="phraseDataSave" type="button">保存</button></header><div class="phrase-data-body"><label><span>日本語 <b>※</b></span><textarea id="phraseJapaneseInput" rows="3"></textarea></label><label><span>英語 <b>※</b></span><textarea id="phraseEnglishInput" rows="3" lang="en"></textarea></label><label><span>補足</span><textarea id="phraseNoteInput" rows="3"></textarea></label><div class="phrase-category-field"><div><strong>カテゴリ（複数選択可）</strong><button id="phraseCategoryManage" type="button">フォルダ管理</button></div><p>子を選ぶと親も選択され、同じ親の下では1つだけ選べます。</p><div id="phraseCategoryChoices"></div></div><p class="phrase-data-error" id="phraseDataError" hidden></p><button class="phrase-data-delete" id="phraseDataDelete" type="button" hidden>このフレーズを削除</button></div></section>`;shell.append(editor);
  const manager=document.createElement('div');manager.className='phrase-data-overlay';manager.id='phraseCategoryOverlay';manager.hidden=true;
  manager.innerHTML=`<section class="phrase-data-sheet phrase-category-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseCategoryTitle"><header class="phrase-data-head"><button id="phraseCategoryClose" type="button">閉じる</button><h2 id="phraseCategoryTitle">カテゴリ管理</h2><span></span></header><div class="phrase-root-add"><input id="phraseRootName" maxlength="30" placeholder="親フォルダ名"><button id="phraseRootAdd" type="button">追加</button></div><p class="phrase-category-help">＋で子フォルダを追加。並び順が階層番号になります。</p><div class="phrase-category-manager" id="phraseCategoryManager"></div></section>`;shell.append(manager);
  const $=selector=>document.querySelector(selector);

  const renderCategoryChoices=()=>{
    const container=$('#phraseCategoryChoices');container.replaceChildren();const flat=flattenCategories();if(!flat.length){container.innerHTML='<p class="phrase-category-empty">フォルダ管理からカテゴリを作成してください。</p>';return}
    flat.forEach(({item,depth})=>{const row=document.createElement('label');row.className='phrase-category-choice';row.style.setProperty('--depth',depth);const check=document.createElement('input');check.type='checkbox';check.checked=editorCategoryIds.has(item.id);check.setAttribute('aria-label',`${categoryPath(item.id)}を設定`);const label=document.createElement('span');label.textContent=item.name;check.addEventListener('change',()=>{toggleEditorCategory(item,check.checked);renderCategoryChoices()});row.append(check,label);container.append(row)});
  };
  const openEditor=async phrase=>{await loadData();editorPhraseId=phrase?.id??null;editorCategoryIds=new Set(phrase?.categoryIds||[]);editorPrimaryId=phrase?.primaryCategoryId||null;normalizeEditorCategories();$('#phraseDataTitle').textContent=phrase?'フレーズ編集':'フレーズ追加';$('#phraseJapaneseInput').value=phrase?.japanese||'';$('#phraseEnglishInput').value=phrase?.english||'';$('#phraseNoteInput').value=phrase?.note||'';$('#phraseDataDelete').hidden=!phrase;$('#phraseDataError').hidden=true;renderCategoryChoices();editor.hidden=false};
  const closeEditor=()=>{editor.hidden=true;editorPhraseId=null;editorCategoryIds.clear();editorPrimaryId=null};
  const refreshLivePractice=options=>practiceScreen.hidden?Promise.resolve():window.flovoPracticeBridge?.refresh?.(options)||Promise.resolve();
  const saveEditor=async()=>{const japanese=normalize($('#phraseJapaneseInput').value),english=normalize($('#phraseEnglishInput').value),note=normalize($('#phraseNoteInput').value),error=$('#phraseDataError');if(!japanese||!english){error.textContent='日本語と英語は両方入力してください。';error.hidden=false;return}pickEditorPrimary(editorPrimaryId);if(!editorPrimaryId){error.textContent='カテゴリを選択してください。';error.hidden=false;return}let phrase=data.phrases.find(item=>item.id===editorPhraseId),isNew=!phrase;if(!phrase){phrase={id:data.nextPhraseId++,order:data.phrases.length+1,understanding:'',correct:0,wrong:0,unsure:0};data.phrases.push(phrase)}Object.assign(phrase,{primaryCategoryId:editorPrimaryId,categoryIds:[...editorCategoryIds],japanese,english,note});await writeStore();refreshPhraseHome();const preferredNumber=phraseNumber(phrase);closeEditor();await refreshLivePractice({preferredNumber,view:isNew?'list':undefined})};
  const deletePhrase=async()=>{const phrase=data.phrases.find(item=>item.id===editorPhraseId);if(!phrase||!confirm('このフレーズを削除しますか？'))return;data.phrases=data.phrases.filter(item=>item!==phrase);await writeStore();refreshPhraseHome();closeEditor();await refreshLivePractice({view:'list'})};

  const renderCategoryManager=()=>{
    const container=$('#phraseCategoryManager');container.replaceChildren();const flat=flattenCategories();if(!flat.length){container.innerHTML='<p class="phrase-category-empty">カテゴリはまだありません。</p>';return}
    flat.forEach(({item,depth})=>{const row=document.createElement('div');row.className='phrase-category-manager-row';row.style.setProperty('--depth',depth);const code=document.createElement('b');code.textContent=categoryCode(item.id);const input=document.createElement('input');input.value=item.name;input.maxLength=30;input.setAttribute('aria-label',`${item.name}の名前`);const save=document.createElement('button');save.type='button';save.textContent='変更';save.addEventListener('click',async()=>{const next=normalize(input.value);if(!next||/[>|]/.test(next)){alert('カテゴリ名に「>」「|」は使えません。');return}if(childrenOf(item.parentId).some(candidate=>candidate.id!==item.id&&candidate.name.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ階層に同名のカテゴリがあります。');return}item.name=next;await writeStore();renderCategoryManager();renderCategoryChoices()});const add=document.createElement('button');add.type='button';add.textContent='＋';add.setAttribute('aria-label',`${item.name}に子フォルダを追加`);add.addEventListener('click',async()=>{const name=normalize(prompt(`${item.name}の子フォルダ名`));if(!name)return;if(/[>|]/.test(name)){alert('カテゴリ名に「>」「|」は使えません。');return}if(childrenOf(item.id).some(candidate=>candidate.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'))){alert('同名のカテゴリがあります。');return}data.categories.push({id:data.nextCategoryId++,parentId:item.id,name,order:childrenOf(item.id).length+1});await writeStore();renderCategoryManager();renderCategoryChoices()});const up=document.createElement('button');up.type='button';up.textContent='↑';up.setAttribute('aria-label',`${item.name}を上へ`);up.addEventListener('click',async()=>{const siblings=childrenOf(item.parentId),index=siblings.findIndex(candidate=>candidate.id===item.id);if(index<1)return;const previous=siblings[index-1],order=item.order;item.order=previous.order;previous.order=order;await writeStore();renderCategoryManager();renderCategoryChoices()});const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',async()=>{const ids=new Set([item.id]);let changed=true;while(changed){changed=false;data.categories.forEach(candidate=>{if(ids.has(candidate.parentId)&&!ids.has(candidate.id)){ids.add(candidate.id);changed=true}})}if(data.phrases.some(phrase=>phrase.categoryIds.some(id=>ids.has(id)))){alert('フレーズに設定されているカテゴリは削除できません。');return}if(!confirm(`「${item.name}」と子フォルダを削除しますか？`))return;data.categories=data.categories.filter(candidate=>!ids.has(candidate.id));await writeStore();renderCategoryManager();renderCategoryChoices()});row.append(code,input,save,add,up,remove);container.append(row)});
  };
  const openManager=()=>{renderCategoryManager();manager.hidden=false};
  const closeManager=async()=>{manager.hidden=true;renderCategoryChoices();await refreshLivePractice({view:'list'})};
  const addRoot=async()=>{const input=$('#phraseRootName'),name=normalize(input.value);if(!name)return;if(/[>|]/.test(name)){alert('カテゴリ名に「>」「|」は使えません。');return}if(childrenOf(null).some(candidate=>candidate.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'))){alert('同名のカテゴリがあります。');return}data.categories.push({id:data.nextCategoryId++,parentId:null,name,order:childrenOf(null).length+1});input.value='';await writeStore();renderCategoryManager();renderCategoryChoices()};
  const currentPhraseFromCard=()=>phraseByNumber(document.getElementById('practiceWordNumber')?.textContent||'');
  document.addEventListener('click',event=>{if(moduleMode!=='phrase-bank')return;const listMenu=event.target.closest?.('.practice-list-menu');if(event.target.closest?.('#practiceCardAdd')){event.preventDefault();event.stopImmediatePropagation();openEditor(null);return}if(event.target.closest?.('#practiceCardMenu')){event.preventDefault();event.stopImmediatePropagation();openEditor(currentPhraseFromCard());return}if(listMenu){event.preventDefault();event.stopImmediatePropagation();const value=listMenu.closest('.practice-list-row')?.querySelector('.practice-list-word-no')?.textContent||'';openEditor(phraseByNumber(value))}},true);
  $('#phraseDataCancel').addEventListener('click',closeEditor);$('#phraseDataSave').addEventListener('click',()=>saveEditor().catch(()=>alert('フレーズを保存できませんでした。')));$('#phraseDataDelete').addEventListener('click',()=>deletePhrase().catch(()=>alert('フレーズを削除できませんでした。')));editor.addEventListener('click',event=>{if(event.target===editor)closeEditor()});$('#phraseCategoryManage').addEventListener('click',openManager);$('#phraseCategoryClose').addEventListener('click',()=>closeManager().catch(()=>alert('練習画面を更新できませんでした。')));manager.addEventListener('click',event=>{if(event.target===manager)closeManager().catch(()=>alert('練習画面を更新できませんでした。'))});$('#phraseRootAdd').addEventListener('click',()=>addRoot().catch(()=>alert('カテゴリを追加できませんでした。')));$('#phraseRootName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addRoot().catch(()=>alert('カテゴリを追加できませんでした。'))}});

  const buildExportWorkbook=()=>{const workbook=XLSX.utils.book_new();const phraseRows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(item=>[item.id,phraseNumber(item),categoryPath(item.primaryCategoryId),item.categoryIds.filter(id=>id!==item.primaryCategoryId).map(categoryPath).join(' | '),item.japanese,item.english,item.note,item.understanding,item.correct,item.wrong,item.unsure]);const categoryRows=flattenCategories().map(({item})=>[categoryPath(item.id),item.order]);XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([PHRASE_HEADERS,...phraseRows]),'マイフレーズ');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([CATEGORY_HEADERS,...categoryRows]),'マイフレーズカテゴリ');return workbook};
  const saveFile=async file=>{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return}const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  phraseExport.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();try{await loadData();if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const bytes=XLSX.write(buildExportWorkbook(),{bookType:'xlsx',type:'array'}),file=new File([bytes],`MyPhrase_${new Date().toISOString().slice(0,10).replaceAll('-','')}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});await saveFile(file)}catch(error){if(error?.name!=='AbortError')alert(error?.message||'書き出しに失敗しました。')}});
  phraseInput.disabled=false;
  phraseInput.addEventListener('change',async()=>{const file=phraseInput.files?.[0];if(!file)return;try{if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),phraseSheet=workbook.Sheets['マイフレーズ'];if(!phraseSheet)throw new Error('「マイフレーズ」シートがありません。');const categorySheet=workbook.Sheets['マイフレーズカテゴリ'],categoryRows=categorySheet?XLSX.utils.sheet_to_json(categorySheet,{header:1,defval:'',raw:false}).slice(1):[],phraseRows=XLSX.utils.sheet_to_json(phraseSheet,{header:1,defval:'',raw:false}).slice(1).filter(row=>row.some(value=>normalize(value)));data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],fileName:file.name};categoryRows.sort((a,b)=>String(a[0]).split('>').length-String(b[0]).split('>').length||number(a[1])-number(b[1])).forEach(row=>{const id=ensureCategoryPath(row[0]),category=categoryById(id);if(category)category.order=number(row[1])||category.order});phraseRows.forEach((row,index)=>{const japanese=normalize(row[4]),english=normalize(row[5]);if(!japanese||!english)throw new Error(`${index+2}行目：日本語文と英文は必須です。`);const primaryCategoryId=ensureCategoryPath(row[2]);if(!primaryCategoryId)throw new Error(`${index+2}行目：主カテゴリは必須です。`);const extras=String(row[3]||'').split('|').map(normalize).filter(Boolean).map(ensureCategoryPath),id=number(row[0])||data.nextPhraseId++;data.nextPhraseId=Math.max(data.nextPhraseId,id+1);data.phrases.push({id,primaryCategoryId,categoryIds:[...new Set([primaryCategoryId,...extras])],japanese,english,note:normalize(row[6]),understanding:normalize(row[7]),correct:number(row[8]),wrong:number(row[9]),unsure:number(row[10]),order:index+1})});loaded=true;await writeStore();refreshPhraseHome();alert(`${data.phrases.length}件のマイフレーズを読み込みました。`)}catch(error){alert(error?.message||'マイフレーズの読み込みに失敗しました。')}finally{phraseInput.value=''}});
  loadData().catch(()=>{});
})();
