Warning: truncated output (original token count: 25248)
Total output lines: 497

'use strict';

(()=>{
  const source=document.querySelector('.active-vocab-card:not(#phraseBankMount)');
  const mount=document.getElementById('phraseBankMount');
  const sourcePractice=document.getElementById('practiceButton');
  const practiceScreen=document.getElementById('practiceScreen');
  const practiceListTitle=document.getElementById('practiceListTitle');
  const practiceList=document.getElementById('practiceListPlaceholder');
  const practiceListItems=document.getElementById('practiceList');
  const practiceListHeader=practiceList?.querySelector('.practice-list-header');
  const practiceScreenHeader=document.querySelector('.practice-screen-header');
  const practiceHeaderActions=document.querySelector('.practice-header-actions');
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
  const PHRASE_HEADERS=['フレーズID','例文番号','主カテゴリ','追加カテゴリ','日本語文','英文','補足','理解度','◯回数','×回数','△回数','タグ'];
  const CATEGORY_HEADERS=['カテゴリパス','表示順'];
  let data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],tags:[],tagFolders:[],tagFolderByName:{},nextTagFolderId:1,fileName:'未読込'};
  let tagManagerFolderId=null,tagManagerFormState=null,tagManagerSnapshot=null,tagManagerDirty=false;
  const expandedTagFolders=new Set(),expandedTagFilterFolders=new Set();
  let loaded=false,loadDataPromise=null,moduleMode='active-vocabulary',launchingPhrase=false,editorPhraseId=null,editorCategoryIds=new Set(),editorPrimaryId=null,categoryDraftParentId=undefined,categoryManagerSnapshot=null,categoryManagerDirty=false,phraseSaveMessageTimer=null,rowPhraseIds=new WeakMap(),rowPhraseObjects=new WeakMap(),phraseFilterCategoryIds=new Set(),phraseBulkSelecting=false,phraseBulkSelectedIds=new Set(),activeBulkSelectedRows=new Set(),activeBulkRowMap=new WeakMap(),phraseBulkMoveCategoryId=null,phraseBulkHeaderTimer=null,phraseBulkActionsTimer=null,editorTagNames=new Set(),phraseFilterTagNames=new Set();
  const normalize=value=>String(value??'').trim();
  const number=value=>Math.max(0,Number.parseInt(value,10)||0);
  try{phraseFilterCategoryIds=new Set(JSON.parse(localStorage.getItem('phraseCategoryFilterV1')||'[]').map(number).filter(Boolean))}catch{}
  try{phraseFilterTagNames=new Set(JSON.parse(localStorage.getItem('phraseTagFilterV1')||'[]').map(normalize).filter(Boolean))}catch{}

  const phraseHierarchyFilter=document.createElement('div');phraseHierarchyFilter.className='filter-section phrase-hierarchy-filter';phraseHierarchyFilter.dataset.filterSection='phrase-category';phraseHierarchyFilter.hidden=true;
  phraseHierarchyFilter.innerHTML='<div class="filter-section-head"><h3><span class="condition-badge">条件3</span><span>カテゴリ</span></h3><div class="filter-section-actions"><button class="section-filter-button select" id="phraseHierarchyFilterAction" type="button">すべて選択</button></div></div><div id="phraseHierarchyFilterChoices"></div>';
  const phraseTagFilterSection=document.createElement('div');phraseTagFilterSection.className='filter-section phrase-tag-filter';phraseTagFilterSection.dataset.filterSection='phrase-tag';phraseTagFilterSection.hidden=true;phraseTagFilterSection.innerHTML='<div class="filter-section-head"><h3><span class="condition-badge">条件4</span><span>タグ</span></h3><div class="filter-section-actions"><button class="section-filter-button select" id="phraseTagFilterAction" type="button">すべて選択</button></div></div><p class="phrase-tag-filter-help">複数選択した場合、選んだタグのどれかが付いた例文を表示します。</p><div id="phraseTagFilterChoices"></div>';
  if(wordTextFilterSection)wordTextFilterSection.after(phraseHierarchyFilter,phraseTagFilterSection);else sharedFilterCard?.append(phraseHierarchyFilter,phraseTagFilterSection);

  const openDatabase=()=>new Promise((resolve,reject)=>{const request=indexedDB.open('flovo-data',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('app'))request.result.createObjectStore('app')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const readStore=async key=>{const database=await openDatabase();try{return await new Promise((resolve,reject)=>{const transaction=database.transaction('app','readonly'),request=transaction.objectStore('app').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}finally{database.close()}};
  const writeStore=async()=>{const database=await openDatabase();try{await new Promise((resolve,reject)=>{const transaction=database.transaction('app','readwrite');transaction.objectStore('app').put(data,STORE_KEY);transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)})}finally{database.close()}};
  const migrateLegacy=legacy=>{
    if(!legacy||!Array.isArray(legacy.phrases))return null;
    const migrated={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],tags:[],fileName:'未読込'},categoryByName=new Map();
    (legacy.scenes||[]).forEach((name,index)=>{const id=migrated.nextCategoryId++;migrated.categories.push({id,parentId:null,name:normalize(name),order:index+1});categoryByName.set(normalize(name),id)});
    legacy.phrases.forEach((phrase,index)=>{const categoryIds=(phrase.scenes||[]).map(name=>categoryByName.get(normalize(name))).filter(Boolean),id=number(phrase.id)||migrated.nextPhraseId++;migrated.nextPhraseId=Math.max(migrated.nextPhraseId,id+1);migrated.phrases.push({id,primaryCategoryId:categoryIds[0]||null,categoryIds,japanese:normalize(phrase.japanese),english:normalize(phrase.english),note:normalize(phrase.note),understanding:normalize(phrase.understanding),correct:number(phrase.correct),wrong:number(phrase.wrong),unsure:number(phrase.unsure),order:index+1})});
    return migrated;
  };
  const loadData=()=>{
    if(loaded)return Promise.resolve();
    if(loadDataPromise)return loadDataPromise;
    loadDataPromise=(async()=>{
    let saved=await readStore(STORE_KEY);if(!saved)saved=migrateLegacy(await readStore(LEGACY_STORE_KEY));
    if(saved&&Array.isArray(saved.categories)&&Array.isArray(saved.phrases))data=saved;
    data.version=2;data.fileName=data.fileName||'未読込';data.tags=Array.isArray(data.tags)?data.tags:[];
    data.nextCategoryId=Math.max(number(data.nextCategoryId)||1,...data.categories.map(item=>number(item.id)+1));
    data.nextPhraseId=Math.max(number(data.nextPhraseId)||1,...data.phrases.map(item=>number(item.id)+1));
    data.categories.forEach((item,index)=>{item.id=number(item.id);item.parentId=item.parentId==null?null:number(item.parentId);item.name=normalize(item.name);item.order=number(item.order)||index+1});
    data.phrases.forEach((item,index)=>{item.id=number(item.id);item.categoryIds=[...new Set((item.categoryIds||[]).map(number).filter(Boolean))];item.primaryCategoryId=number(item.primaryCategoryId)||item.categoryIds[0]||null;if(item.primaryCategoryId&&!item.categoryIds.includes(item.primaryCategoryId))item.categoryIds.unshift(item.primaryCategoryId);item.japanese=normalize(item.japanese);item.english=normalize(item.english);item.note=normalize(item.note);item.tags=[...new Map((Array.isArray(item.tags)?item.tags:[]).map(normalize).filter(tag=>tag&&!tag.includes('|')).map(tag=>[tag.toLocaleLowerCase('ja'),tag])).values()];item.understanding=normalize(item.understanding);item.correct=number(item.correct);item.wrong=number(item.wrong);item.unsure=number(item.unsure);item.order=number(item.order)||index+1});
    data.tags=[...new Map([...data.tags,...data.phrases.flatMap(item=>item.tags||[])].map(normalize).filter(tag=>tag&&!tag.includes('|')).map(tag=>[tag.toLocaleLowerCase('ja'),tag])).values()];
    data.tagFolders=Array.isArray(data.tagFolders)?data.tagFolders:[];data.nextTagFolderId=Math.max(number(data.nextTagFolderId)||1,...data.tagFolders.map(folder=>number(folder.id)+1));data.tagFolders.forEach((folder,index)=>{folder.id=number(folder.id)||index+1;folder.parentId=folder.parentId==null?null:number(folder.parentId);folder.name=normalize(folder.name);folder.order=number(folder.order)||index+1});data.tagFolderByName=data.tagFolderByName&&typeof data.tagFolderByName==='object'?data.tagFolderByName:{};const validFolderIds=new Set(data.tagFolders.map(folder=>folder.id));Object.keys(data.tagFolderByName).forEach(key=>{if(!validFolderIds.has(number(data.tagFolderByName[key])))delete data.tagFolderByName[key]});
    data.phrases.forEach(item=>{item.tags=(item.tags||[]).map(tag=>data.tags.find(known=>known.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja'))||tag)});
    const uncategorized=ensureUncategorizedCategory();
    data.phrases.forEach(item=>{if(!categoryById(item.primaryCategoryId)){item.primaryCategoryId=uncategorized.id;item.categoryIds=[uncategorized.id]}});
    await writeStore();loaded=true;refreshPhraseHome();renderPhraseHierarchyFilter();
      })().catch(error=>{loadDataPromise=null;throw error});
    return loadDataPromise;
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
    const path=categoryPathNodes(item.id),selectedRoot=path[0];
    childrenOf(null).filter(root=>root.id!==selectedRoot?.id).forEach(root=>{editorCategoryIds.delete(root.id);descendantIds(root.id).forEach(id=>editorCategoryIds.delete(id))});
    path.forEach((pathNode,index)=>{
      const parentId=index===0?null:path[index-1].id;
      childrenOf(parentId).filter(sibling=>sibling.id!==pathNode.id).forEach(sibling=>{editorCategoryIds.delete(sibling.id);descendantIds(sibling.id).forEach(id=>editorCategoryIds.delete(id))});
    });
    descendantIds(item.id).forEach(id=>editorCategoryIds.delete(id));
    path.forEach(node=>editorCategoryIds.add(node.id));pickEditorPrimary(item.id);
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
  const categoryExpansionByView=new Map();
  const expandedCategoriesFor=view=>{if(!categoryExpansionByView.has(view))categoryExpansionByView.set(view,new Set());return categoryExpansionByView.get(view)};
  const renderCategoryTree=(container,view,renderRow,renderExtra)=>{
    container.replaceChildren();
    const expanded=expandedCategoriesFor(view),entries=[],extras=[];
    const updateVisibility=()=>{
      entries.forEach(({item,node,toggle})=>{
        const ancestors=categoryPathNodes(item.id).slice(0,-1);
        node.hidden=ancestors.some(parent=>!expanded.has(parent.id));
        if(toggle){const open=expanded.has(item.id);toggle.textContent=open?'⌄':'›';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',`「${item.name}」を${open?'折りたたむ':'展開'}`)}
      });
      extras.forEach(({parentId,node})=>{node.hidden=categoryPathNodes(parentId).some(parent=>!expanded.has(parent.id))});
    };
    flattenCategories().forEach(({item,depth})=>{
      const node=document.createElement('div');node.className='phrase-category-tree-node';node.style.setProperty('--depth',depth);
      const hasChildren=childrenOf(item.id).length>0;
      let toggle=null;
      if(hasChildren){toggle=document.createElement('button');toggle.type='button';toggle.className='phrase-category-tree-toggle';toggle.addEventListener('click',()=>{if(expanded.has(item.id))expanded.delete(item.id);else expanded.add(item.id);updateVisibility()})}
      else{toggle=document.createElement('span');toggle.className='phrase-category-tree-spacer';toggle.setAttribute('aria-hidden','true')}
      const row=renderRow(item,depth);node.append(toggle,row);container.append(node);entries.push({item,node,toggle:hasChildren?toggle:null});
      if(renderExtra){const extra=renderExtra(item,depth);if(extra){extra.style?.removeProperty('--depth');const extraNode=document.createElement('div');extraNode.className='phrase-category-tree-extra';extraNode.style.setProperty('--depth',depth+1);extraNode.append(extra);extras.push({parentId:item.id,node:extraNode})}}
    });
    extras.forEach(({parentId,node})=>{
      const descendants=entries.filter(({item})=>categoryPathNodes(item.id).slice(0,-1).some(parent=>parent.id===parentId));
      const anchor=descendants[descendants.length-1]?.node||entries.find(({item})=>item.id===parentId)?.node;
      if(anchor?.nextSibling)container.insertBefore(node,anchor.nextSibling);else container.append(node);
    });
    updateVisibility();
  };
  const ensureCategoryPath=path=>{let parentId=null,found=null;for(const name of String(path||'').split('>').map(normalize).filter(Boolean)){found=childrenOf(parentId).find(item=>item.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'));if(!found){found={id:data.nextCategoryId++,parentId,name,order:childrenOf(parentId).length+1};data.categories.push(found)}parentId=found.id}return found?.id||null};
  const renderPhraseHierarchyFilter=()=>{
    phraseFilterCategoryIds=new Set([...phraseFilterCategoryIds].filter(id=>categoryById(id)));
    const container=phraseHierarchyFilter.querySelector('#phraseHierarchyFilterChoices');
    const expanded=expandedCategoriesFor('filter');
    [...phraseFilterCategoryIds].forEach(id=>{const path=categoryPathNodes(id);for(let index=0;index<path.length-1;index++){if(phraseFilterCategoryIds.has(path[index].id))break;expanded.add(path[index].id)}});
    renderCategoryTree(container,'filter',item=>{
      const choice=document.createElement('label');choice.className='phrase-category-choice phrase-hierarchy-filter-choice';
      const checkbox=document.createElement('input');checkbox.type='checkbox';const selected=phraseFilterCategoryIds.has(item.id);checkbox.checked=selected;checkbox.setAttribute('aria-label',item.nam…15248 tokens truncated…eSortDirty&&!confirm('保存していない並び替えがあります。破棄してカテゴリを選び直しますか？')){const current=document.querySelector('#phraseSortCategories input[value="'+phraseSortCategoryId+'"]');if(current)current.checked=true;return}phraseSortCategoryId=id;phraseSortDraftIds=data.phrases.filter(x=>x.primaryCategoryId===id).sort((a,b)=>a.order-b.order||a.id-b.id).map(x=>x.id);phraseSortOriginalIds=phraseSortDraftIds.slice();phraseSortDirty=false;$('#phraseSortSave').disabled=true;$('#phraseSortCategoryPicker').hidden=true;$('#phraseSortContent').hidden=false;renderPhraseSortItems()};
  const choosePhraseSortCategory=()=>{if(phraseSortDirty&&!confirm('保存していない並び替えがあります。破棄してカテゴリを選び直しますか？'))return;phraseSortDirty=false;phraseSortCategoryId=null;phraseSortDraftIds=[];phraseSortOriginalIds=[];$('#phraseSortSave').disabled=true;$('#phraseSortContent').hidden=true;$('#phraseSortCategoryPicker').hidden=false;renderPhraseSortCategories()};
  const resetPhraseSort=()=>{phraseSortCategoryId=null;phraseSortDraftIds=[];phraseSortOriginalIds=[];phraseSortDirty=false;$('#phraseSortSave').disabled=true;$('#phraseSortContent').hidden=true;$('#phraseSortCategoryPicker').hidden=false};
  const closePhraseSort=async(force=false)=>{if(phraseSortDirty&&!force&&!confirm('並び替えた内容はまだ保存されていません。変更を破棄して閉じますか？'))return;await closePhraseBottomSheet(sortOverlay);resetPhraseSort()};
  const openPhraseSort=async()=>{await loadData();resetPhraseSort();renderPhraseSortCategories();bindPhraseBottomSheetGrab(sortOverlay,()=>closePhraseSort(true));openPhraseBottomSheet(sortOverlay)};
  const savePhraseSort=async()=>{if(!phraseSortDirty||!phraseSortCategoryId)return;if(!confirm('並び替えた順番を保存しますか？'))return;const currentPhrase=currentPhraseFromCard();const ids=new Set(phraseSortDraftIds),items=data.phrases.filter(x=>x.primaryCategoryId===phraseSortCategoryId);if(items.length!==ids.size)return;phraseSortDraftIds.forEach((id,i)=>{const phrase=data.phrases.find(x=>x.id===id);if(phrase)phrase.order=i+1});await writeStore();refreshPhraseHome();await closePhraseSort(true);await refreshLivePractice(currentPhrase?{preferredNumber:phraseNumber(currentPhrase)}:{});window.flovoPracticeBridge?.refreshFilterCount?.()};
  const phraseFromListRow=row=>phraseByNumber(row?.querySelector('.practice-list-word-no')?.textContent||'');
  const visibleBulkRows=()=>[...(practiceListItems?.querySelectorAll('.practice-list-row')||[])];
  const isPhraseBulkMode=()=>moduleMode==='phrase-bank';
  const selectedBulkCount=()=>isPhraseBulkMode()?phraseBulkSelectedIds.size:activeBulkSelectedRows.size;
  const activeSourceForRow=(row,indexHint)=>{let source=activeBulkRowMap.get(row);if(source)return source;const storedIndex=Number.parseInt(row.dataset.practiceRowIndex,10),index=Number.isInteger(indexHint)?indexHint:Number.isInteger(storedIndex)?storedIndex:[...practiceListItems.children].indexOf(row);source=window.flovoPracticeBridge?.getVisibleRows?.()[index];if(source)activeBulkRowMap.set(row,source);return source};
  const phraseIdForRow=(row,indexHint)=>{let id=number(row.dataset.phraseBulkId);if(id)return id;id=rowPhraseIds.get(activeSourceForRow(row,indexHint))||phraseFromListRow(row)?.id||0;if(id)row.dataset.phraseBulkId=String(id);return id};
  const bulkRowCount=()=>window.flovoPracticeBridge?.getVisibleRows?.().length??practiceListItems?.getElementsByClassName('practice-list-row').length??0;
  const isBulkRowSelected=(row,index)=>isPhraseBulkMode()?phraseBulkSelectedIds.has(phraseIdForRow(row)):activeBulkSelectedRows.has(activeSourceForRow(row,index));
  const syncBulkRowVisual=(row,index)=>{const selected=isBulkRowSelected(row,index);row.classList.toggle('phrase-bulk-selected',selected);row.setAttribute('aria-selected',String(selected))};
  const animateBulkHeader=active=>{
    clearTimeout(phraseBulkHeaderTimer);bulkHeader.classList.remove('is-entering','is-leaving');
    if(active){bulkHeader.hidden=false;requestAnimationFrame(()=>{if(!phraseBulkSelecting)return;bulkHeader.classList.add('is-entering');phraseBulkHeaderTimer=setTimeout(()=>bulkHeader.classList.remove('is-entering'),520)});return}
    if(bulkHeader.hidden)return;bulkHeader.classList.add('is-leaving');phraseBulkHeaderTimer=setTimeout(()=>{if(!phraseBulkSelecting)bulkHeader.hidden=true;bulkHeader.classList.remove('is-leaving')},460);
  };
  const animateBulkActions=active=>{
    clearTimeout(phraseBulkActionsTimer);bulkActions.classList.remove('is-entering','is-leaving');
    if(active){bulkActions.hidden=false;requestAnimationFrame(()=>{if(!phraseBulkSelecting)return;bulkActions.classList.add('is-entering');phraseBulkActionsTimer=setTimeout(()=>bulkActions.classList.remove('is-entering'),500)});return}
    if(bulkActions.hidden)return;bulkActions.classList.add('is-leaving');phraseBulkActionsTimer=setTimeout(()=>{if(!phraseBulkSelecting)bulkActions.hidden=true;bulkActions.classList.remove('is-leaving')},400);
  };
  const updateBulkUi=(syncRows=false)=>{
    const count=selectedBulkCount();
    practiceList?.classList.toggle('phrase-bulk-selecting',phraseBulkSelecting);
    bulkSelectButton.hidden=phraseBulkSelecting;
    categoryManageButton.hidden=!isPhraseBulkMode()||phraseBulkSelecting;sortButton.hidden=!isPhraseBulkMode()||phraseBulkSelecting;
    bulkHeader.querySelector('.phrase-bulk-count').textContent=`${count}件選択`;
    const rowCount=bulkRowCount(),allSelected=Boolean(rowCount)&&count===rowCount;
    const allButton=bulkHeader.querySelector('.phrase-bulk-all');allButton.textContent=allSelected?'すべて解除':'すべてを選択';allButton.disabled=!rowCount;
    bulkActions.querySelectorAll('button').forEach(button=>button.disabled=!count);
    if(syncRows)visibleBulkRows().forEach(syncBulkRowVisual);
  };
  const decorateBulkRows=()=>{
    activeBulkRowMap=new WeakMap();updateBulkUi(phraseBulkSelecting);
  };
  const setBulkSelecting=active=>{if(!active)practiceListItems?.querySelectorAll('.phrase-bulk-selected').forEach(row=>{row.classList.remove('phrase-bulk-selected');row.removeAttribute('aria-selected')});phraseBulkSelecting=Boolean(active);phraseBulkSelectedIds.clear();activeBulkSelectedRows.clear();activeBulkRowMap=new WeakMap();if(!active)bulkMove.hidden=true;animateBulkHeader(phraseBulkSelecting);animateBulkActions(phraseBulkSelecting);updateBulkUi(false)};
  const toggleBulkRow=row=>{if(isPhraseBulkMode()){const id=phraseIdForRow(row);if(!id)return;if(phraseBulkSelectedIds.has(id))phraseBulkSelectedIds.delete(id);else phraseBulkSelectedIds.add(id)}else{const source=activeSourceForRow(row);if(!source)return;if(activeBulkSelectedRows.has(source))activeBulkSelectedRows.delete(source);else activeBulkSelectedRows.add(source)}syncBulkRowVisual(row);updateBulkUi(false)};
  const renderBulkDestinations=()=>{
    phraseBulkMoveCategoryId=null;bulkMove.querySelector('.phrase-bulk-move-summary').textContent=`選択した${phraseBulkSelectedIds.size}件を移動します。`;
    const container=bulkMove.querySelector('.phrase-bulk-destinations');
    renderCategoryTree(container,'move',item=>{
      const row=document.createElement('label');row.className='phrase-bulk-destination';const radio=document.createElement('input');radio.type='radio';radio.name='phraseBulkDestination';radio.value=String(item.id);const copy=document.createElement('span');copy.innerHTML=`<b>${categoryCode(item.id)}</b><span></span>`;copy.lastElementChild.textContent=item.name;radio.addEventListener('change',()=>{phraseBulkMoveCategoryId=item.id;bulkMove.querySelector('.phrase-bulk-move-save').disabled=false});row.append(radio,copy);return row;
    });
    bulkMove.querySelector('.phrase-bulk-move-save').disabled=true;
  };
  const openBulkMove=()=>{if(!phraseBulkSelectedIds.size)return;renderBulkDestinations();bulkMove.hidden=false};
  const closeBulkMove=()=>{bulkMove.hidden=true;phraseBulkMoveCategoryId=null};
  const moveBulkPhrases=async()=>{const target=categoryById(phraseBulkMoveCategoryId);if(!target||!phraseBulkSelectedIds.size)return;const path=categoryPathNodes(target.id).map(item=>item.id);data.phrases.forEach(phrase=>{if(phraseBulkSelectedIds.has(phrase.id)){phrase.primaryCategoryId=target.id;phrase.categoryIds=[...path]}});await writeStore();refreshPhraseHome();renderPhraseHierarchyFilter();closeBulkMove();setBulkSelecting(false);await refreshLivePractice({view:'list'});window.flovoPracticeBridge?.refreshFilterCount?.()};
  const deleteBulkPhrases=async()=>{const count=selectedBulkCount();if(!count)return;if(!isPhraseBulkMode()){if(!confirm(`選択した例文 ${count}件を削除しますか？\n\n単語データは削除されません。`))return;await window.flovoPracticeBridge?.deleteRows?.([...activeBulkSelectedRows]);setBulkSelecting(false);return}if(!confirm(`選択したフレーズ ${count}件を削除しますか？`))return;data.phrases=data.phrases.filter(phrase=>!phraseBulkSelectedIds.has(phrase.id));await writeStore();refreshPhraseHome();setBulkSelecting(false);await refreshLivePractice({view:'list'});window.flovoPracticeBridge?.refreshFilterCount?.()};
  bulkSelectButton.addEventListener('click',()=>setBulkSelecting(true));
  bulkHeader.querySelector('.phrase-bulk-cancel').addEventListener('click',()=>setBulkSelecting(false));
  bulkHeader.querySelector('.phrase-bulk-all').addEventListener('click',()=>{const rows=visibleBulkRows(),allSelected=Boolean(rows.length)&&selectedBulkCount()===rows.length,activeRows=isPhraseBulkMode()?[]:(window.flovoPracticeBridge?.getVisibleRows?.()||[]);rows.forEach((row,index)=>{if(isPhraseBulkMode()){const id=phraseIdForRow(row);if(id){if(allSelected)phraseBulkSelectedIds.delete(id);else phraseBulkSelectedIds.add(id)}}else{const source=activeRows[index];if(source){activeBulkRowMap.set(row,source);if(allSelected)activeBulkSelectedRows.delete(source);else activeBulkSelectedRows.add(source)}}syncBulkRowVisual(row,index)});updateBulkUi(false)});
  bulkActions.querySelector('.phrase-bulk-move').addEventListener('click',openBulkMove);
  bulkActions.querySelector('.phrase-bulk-delete').addEventListener('click',()=>deleteBulkPhrases().catch(()=>alert(isPhraseBulkMode()?'フレーズを削除できませんでした。':'例文を削除できませんでした。')));
  sortButton.addEventListener('click',()=>openPhraseSort().catch(()=>alert('並び替えを開けませんでした。')));
  $('#phraseSortCancel').addEventListener('click',()=>closePhraseSort().catch(()=>alert('並び替えを閉じられませんでした。')));
  $('#phraseSortChooseCategory').addEventListener('click',choosePhraseSortCategory);
  $('#phraseSortSave').addEventListener('click',()=>savePhraseSort().catch(()=>alert('並び順を保存できませんでした。')));
  sortOverlay.addEventListener('click',event=>{if(event.target===sortOverlay)closePhraseSort().catch(()=>alert('並び替えを閉じられませんでした。'))});
  bulkMove.querySelector('.phrase-bulk-move-cancel').addEventListener('click',closeBulkMove);bulkMove.querySelector('.phrase-bulk-move-save').addEventListener('click',()=>moveBulkPhrases().catch(()=>alert('フレーズを移動できませんでした。')));bulkMove.addEventListener('click',event=>{if(event.target===bulkMove)closeBulkMove()});
  if(practiceListItems)new MutationObserver(decorateBulkRows).observe(practiceListItems,{childList:true});
  const currentPhraseFromCard=()=>phraseByNumber(document.getElementById('practiceWordNumber')?.textContent||'');
  document.addEventListener('click',event=>{const listRow=event.target.closest?.('.practice-list-row');if(phraseBulkSelecting&&listRow){event.preventDefault();event.stopImmediatePropagation();toggleBulkRow(listRow);return}if(moduleMode!=='phrase-bank')return;const listMenu=event.target.closest?.('.practice-list-menu');if(event.target.closest?.('#practiceCardAdd')){event.preventDefault();event.stopImmediatePropagation();openEditor(null);return}if(event.target.closest?.('#practiceCardMenu')){event.preventDefault();event.stopImmediatePropagation();openEditor(currentPhraseFromCard());return}if(listMenu){event.preventDefault();event.stopImmediatePropagation();const value=listMenu.closest('.practice-list-row')?.querySelector('.practice-list-word-no')?.textContent||'';openEditor(phraseByNumber(value))}},true);
  $('#phraseDataCancel').addEventListener('click',closeEditor);$('#phraseDataSave').addEventListener('click',()=>saveEditor().catch(()=>alert('フレーズを保存できませんでした。')));$('#phraseDataDelete').addEventListener('click',()=>deletePhrase().catch(()=>alert('フレーズを削除できませんでした。')));editor.addEventListener('click',event=>{if(event.target===editor)closeEditor()});categoryManageButton.addEventListener('click',openManager);tagManageButton.addEventListener('click',openTagManager);$('#phraseTagManagerClose').addEventListener('click',()=>closeTagManager().catch(()=>alert('画面を閉じられませんでした。')));tagManager.addEventListener('click',event=>{if(event.target===tagManager)closeTagManager().catch(()=>alert('画面を閉じられませんでした。'))});$('#phraseCategoryClose').addEventListener('click',()=>closeManager().catch(()=>alert('カテゴリ管理を閉じられませんでした。')));$('#phraseCategorySave').addEventListener('click',()=>saveCategoryManager().catch(()=>alert('カテゴリを保存できませんでした。')));manager.addEventListener('click',event=>{if(event.target===manager)closeManager().catch(()=>alert('練習画面を更新できませんでした。'))});

  const buildExportWorkbook=()=>{const workbook=XLSX.utils.book_new();const phraseRows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(item=>[item.id,phraseNumber(item),categoryPath(item.primaryCategoryId),item.categoryIds.filter(id=>id!==item.primaryCategoryId).map(categoryPath).join(' | '),item.japanese,item.english,item.note,item.understanding,item.correct,item.wrong,item.unsure,(item.tags||[]).join(' | ')]);const categoryRows=flattenCategories().map(({item})=>[categoryPath(item.id),item.order]);const folders=data.tagFolders.slice().sort((a,b)=>tagFolderPath(a.id).localeCompare(tagFolderPath(b.id),'ja'));const folderRows=folders.map(folder=>[tagFolderPath(folder.id),folder.order]);const tagRows=allPhraseTags().map((tag,index)=>[tag,tagFolderPath(tagFolderIdFor(tag)),index+1]);XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([PHRASE_HEADERS,...phraseRows]),'マイフレーズ');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([CATEGORY_HEADERS,...categoryRows]),'マイフレーズカテゴリ');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['フォルダパス','表示順'],...folderRows]),'マイフレーズタグフォルダ');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['タグ','フォルダパス','表示順'],...tagRows]),'マイフレーズタグ');return workbook};
  const saveFile=async file=>{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file]});return}const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
  phraseExport.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();try{await loadData();if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const bytes=XLSX.write(buildExportWorkbook(),{bookType:'xlsx',type:'array'}),file=new File([bytes],`MyPhrase_${new Date().toISOString().slice(0,10).replaceAll('-','')}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});await saveFile(file)}catch(error){if(error?.name!=='AbortError')alert(error?.message||'書き出しに失敗しました。')}});
  phraseInput.disabled=false;
  phraseInput.addEventListener('change',async()=>{const file=phraseInput.files?.[0];if(!file)return;try{if(typeof XLSX==='undefined')throw new Error('Excel機能を準備できませんでした。');const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'}),phraseSheet=workbook.Sheets['マイフレーズ'];if(!phraseSheet)throw new Error('「マイフレーズ」シートがありません。');const categorySheet=workbook.Sheets['マイフレーズカテゴリ'],categoryRows=categorySheet?XLSX.utils.sheet_to_json(categorySheet,{header:1,defval:'',raw:false}).slice(1):[],tagFolderSheet=workbook.Sheets['マイフレーズタグフォルダ'],tagFolderRows=tagFolderSheet?XLSX.utils.sheet_to_json(tagFolderSheet,{header:1,defval:'',raw:false}).slice(1):[],tagSheet=workbook.Sheets['マイフレーズタグ'],tagRows=tagSheet?XLSX.utils.sheet_to_json(tagSheet,{header:1,defval:'',raw:false}).slice(1):[],phraseRows=XLSX.utils.sheet_to_json(phraseSheet,{header:1,defval:'',raw:false}).slice(1).filter(row=>row.some(value=>normalize(value)));data={version:2,nextPhraseId:1,nextCategoryId:1,categories:[],phrases:[],tags:[],tagFolders:[],tagFolderByName:{},nextTagFolderId:1,fileName:file.name};categoryRows.sort((a,b)=>String(a[0]).split('>').length-String(b[0]).split('>').length||number(a[1])-number(b[1])).forEach(row=>{const id=ensureCategoryPath(row[0]),category=categoryById(id);if(category)category.order=number(row[1])||category.order});phraseRows.forEach((row,index)=>{const japanese=normalize(row[4]),english=normalize(row[5]);if(!japanese||!english)throw new Error(`${index+2}行目：日本語文と英文は必須です。`);const primaryCategoryId=ensureCategoryPath(row[2]);if(!primaryCategoryId)throw new Error(`${index+2}行目：主カテゴリは必須です。`);const extras=String(row[3]||'').split('|').map(normalize).filter(Boolean).map(ensureCategoryPath),id=number(row[0])||data.nextPhraseId++;data.nextPhraseId=Math.max(data.nextPhraseId,id+1);data.phrases.push({id,primaryCategoryId,categoryIds:[...new Set([primaryCategoryId,...extras])],japanese,english,note:normalize(row[6]),understanding:normalize(row[7]),correct:number(row[8]),wrong:number(row[9]),unsure:number(row[10]),order:index+1,tags:[...new Map(String(row[11]||'').split('|').map(normalize).filter(tag=>tag&&!tag.includes('|')).map(tag=>[tag.toLocaleLowerCase('ja'),tag])).values()]})});ensureUncategorizedCategory();data.tags=[...new Map([...data.phrases.flatMap(item=>item.tags||[]),...tagRows.map(row=>normalize(row[0]))].map(normalize).filter(tag=>tag&&!tag.includes('|')).map(tag=>[tag.toLocaleLowerCase('ja'),tag])).values()];const ensureTagFolderPath=path=>{let parentId=null;String(path||'').split('/').map(normalize).filter(Boolean).forEach((name,index)=>{let folder=data.tagFolders.find(item=>item.parentId===parentId&&item.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'));if(!folder){folder={id:data.nextTagFolderId++,parentId,name,order:data.tagFolders.filter(item=>item.parentId===parentId).length+1};data.tagFolders.push(folder)}parentId=folder.id});return parentId};tagFolderRows.sort((a,b)=>String(a[0]).split('/').length-String(b[0]).split('/').length||number(a[1])-number(b[1])).forEach(row=>{const id=ensureTagFolderPath(row[0]),folder=tagFolderById(id);if(folder)folder.order=number(row[1])||folder.order});tagRows.forEach(row=>{const tag=normalize(row[0]),path=normalize(row[1]);if(tag&&path){const id=ensureTagFolderPath(path);if(id)data.tagFolderByName[tagFolderKey(tag)]=id}});loaded=true;await writeStore();refreshPhraseHome();renderPhraseHierarchyFilter();renderPhraseTagFilter();window.flovoPracticeBridge?.refreshFilterCount?.();alert(`${data.phrases.length}件のマイフレーズを読み込みました。`)}catch(error){alert(error?.message||'マイフレーズの読み込みに失敗しました。')}finally{phraseInput.value=''}});
  loadData().catch(()=>{});
})();
