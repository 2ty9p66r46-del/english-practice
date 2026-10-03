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
  const expandedTagFolders=new Set();
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
      const checkbox=document.createElement('input');checkbox.type='checkbox';const selected=phraseFilterCategoryIds.has(item.id);checkbox.checked=selected;checkbox.setAttribute('aria-label',item.name+'で絞り込む');const label=document.createElement('span');label.textContent=item.name;
      checkbox.addEventListener('change',()=>{const ids=[item.id,...descendantIds(item.id)];if(!checkbox.checked)ids.forEach(id=>phraseFilterCategoryIds.delete(id));else ids.forEach(id=>phraseFilterCategoryIds.add(id));renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.()});
      choice.append(checkbox,label);return choice;
    });
    const action=phraseHierarchyFilter.querySelector('#phraseHierarchyFilterAction'),allIds=flattenCategories().map(({item})=>item.id),active=allIds.length>0&&allIds.every(id=>phraseFilterCategoryIds.has(id));action.textContent='すべて選択';action.classList.toggle('selected',active);action.setAttribute('aria-pressed',String(active));
  };
  const tagFolderKey=tag=>normalize(tag).toLocaleLowerCase('ja');
  const tagFolderById=id=>data.tagFolders.find(folder=>folder.id===Number(id));
  const tagFolderPath=id=>{const names=[];let folder=tagFolderById(id),guard=0;while(folder&&guard++<20){names.unshift(folder.name);folder=folder.parentId==null?null:tagFolderById(folder.parentId)}return names.join(' / ')};
  const tagFolderDepth=id=>{let depth=0,folder=tagFolderById(id),guard=0;while(folder&&guard++<20){depth++;folder=folder.parentId==null?null:tagFolderById(folder.parentId)}return depth};
  const expandTagFolderPath=id=>{let folder=tagFolderById(id),guard=0;while(folder&&guard++<20){expandedTagFolders.add(folder.id);folder=folder.parentId==null?null:tagFolderById(folder.parentId)}};
  const tagFolderOptions=(selectedId=null)=>{const select=document.createElement('select');select.className='phrase-tag-folder-select';const root=document.createElement('option');root.value='';root.textContent='フォルダなし';select.append(root);data.tagFolders.slice().sort((a,b)=>tagFolderPath(a.id).localeCompare(tagFolderPath(b.id),'ja')).forEach(folder=>{const option=document.createElement('option');option.value=String(folder.id);option.textContent=tagFolderPath(folder.id);select.append(option)});select.value=selectedId==null?'':String(selectedId);return select};
  const tagFolderIdFor=tag=>{const id=Number(data.tagFolderByName?.[tagFolderKey(tag)]);return tagFolderById(id)?.id??null};
  const tagsGroupedByFolder=()=>{const groups=new Map();allPhraseTags().forEach(tag=>{const path=tagFolderPath(tagFolderIdFor(tag));if(!groups.has(path))groups.set(path,[]);groups.get(path).push(tag)});return groups};
  const allPhraseTags=()=>[...new Map((data.tags||[]).map(normalize).filter(Boolean).map(tag=>[tag.toLocaleLowerCase('ja'),tag])).values()];
  const renderPhraseTagFilter=()=>{
    const available=allPhraseTags();phraseFilterTagNames=new Set([...phraseFilterTagNames].filter(tag=>available.some(item=>item.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja'))));
    const container=phraseTagFilterSection.querySelector('#phraseTagFilterChoices');container.replaceChildren();
    tagsGroupedByFolder().forEach((tags,path)=>{if(path){const heading=document.createElement('strong');heading.className='phrase-tag-folder-heading';heading.textContent=path;container.append(heading)}tags.forEach(tag=>{const button=document.createElement('button');button.type='button';button.className='phrase-tag-filter-choice';const selected=[...phraseFilterTagNames].some(item=>item.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja'));button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.textContent=tag;button.addEventListener('click',()=>{if(selected)phraseFilterTagNames=new Set([...phraseFilterTagNames].filter(item=>item.toLocaleLowerCase('ja')!==tag.toLocaleLowerCase('ja')));else phraseFilterTagNames.add(tag);renderPhraseTagFilter();window.flovoPracticeBridge?.refreshFilterCount?.()});container.append(button)})});
    const action=phraseTagFilterSection.querySelector('#phraseTagFilterAction'),active=available.length>0&&available.every(tag=>[...phraseFilterTagNames].some(item=>item.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja')));action.textContent='すべて選択';action.classList.toggle('selected',active);action.setAttribute('aria-pressed',String(active));action.disabled=!available.length;
  };
  phraseHierarchyFilter.querySelector('#phraseHierarchyFilterAction').addEventListener('click',()=>{
    const allIds=flattenCategories().map(({item})=>item.id),allSelected=allIds.length>0&&allIds.every(id=>phraseFilterCategoryIds.has(id));
    if(allSelected)phraseFilterCategoryIds.clear();
    else phraseFilterCategoryIds=new Set(allIds);
    renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.();
  });
  phraseTagFilterSection.querySelector('#phraseTagFilterAction').addEventListener('click',()=>{
    const allTags=allPhraseTags(),allSelected=allTags.length>0&&allTags.every(tag=>[...phraseFilterTagNames].some(item=>item.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja')));
    if(allSelected)phraseFilterTagNames.clear();
    else phraseFilterTagNames=new Set(allTags);
    renderPhraseTagFilter();window.flovoPracticeBridge?.refreshFilterCount?.();
  });
  const phraseMatchesFilter=row=>{
    const phrase=rowPhraseObjects.get(row)||phraseByNumber(row?.[0]);if(!phrase)return false;
    if(phraseFilterCategoryIds.size&&!phraseFilterCategoryIds.has(phrase.primaryCategoryId))return false;
    if(phraseFilterTagNames.size&&!phrase.tags?.some(tag=>[...phraseFilterTagNames].some(selected=>selected.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja'))))return false;
    return true;
  };
  const toStoredData=()=>{
    rowPhraseIds=new WeakMap();rowPhraseObjects=new WeakMap();
    const rows=data.phrases.slice().sort((a,b)=>phraseNumber(a).localeCompare(phraseNumber(b),'ja',{numeric:true})).map(phrase=>{const row=[phraseNumber(phrase),categoryPath(phrase.primaryCategoryId),'','','','','','','','','','',phrase.japanese,phrase.english,phrase.note,phrase.understanding,phrase.correct,phrase.wrong,phrase.unsure];rowPhraseIds.set(row,phrase.id);rowPhraseObjects.set(row,phrase);return row});
    return {headers:[],rows,vocabularyRows:rows,fileName:data.fileName,modified:true,phraseBank:true};
  };
  const saveStoredData=async stored=>{(stored?.rows||[]).forEach(row=>{const phrase=rowPhraseObjects.get(row);if(!phrase)return;phrase.japanese=normalize(row[12]);phrase.english=normalize(row[13]);phrase.note=normalize(row[14]);phrase.understanding=normalize(row[15]);phrase.correct=number(row[16]);phrase.wrong=number(row[17]);phrase.unsure=number(row[18])});await writeStore();refreshPhraseHome()};
  window.flovoPracticeAdapter={active:false,getData:async()=>{await loadData();return toStoredData()},saveData:saveStoredData,matchesRow:phraseMatchesFilter,getTextTargets:row=>{const item=rowPhraseObjects.get(row)||phraseByNumber(row?.[0]);return item?[item.english]:[]},getFilterSnapshot:()=>({categoryIds:[...phraseFilterCategoryIds],tags:[...phraseFilterTagNames]}),restoreFilterSnapshot:snapshot=>{phraseFilterCategoryIds=new Set(Array.isArray(snapshot)?snapshot:(snapshot?.categoryIds||[]));phraseFilterTagNames=new Set(Array.isArray(snapshot)?[]:(snapshot?.tags||[]));renderPhraseHierarchyFilter();renderPhraseTagFilter()},resetFilter:()=>{phraseFilterCategoryIds.clear();phraseFilterTagNames.clear();renderPhraseHierarchyFilter();renderPhraseTagFilter()},commitFilter:()=>{try{localStorage.setItem('phraseCategoryFilterV1',JSON.stringify([...phraseFilterCategoryIds]));localStorage.setItem('phraseTagFilterV1',JSON.stringify([...phraseFilterTagNames]))}catch{}},renderPracticeCardMetadata:row=>{const section=document.getElementById('phraseCardTagSection'),container=document.getElementById('phraseCardTagBadges');if(!section||!container)return;section.hidden=moduleMode!=='phrase-bank';container.replaceChildren();const phrase=rowPhraseObjects.get(row)||phraseByNumber(row?.[0]);if(!phrase||!phrase.tags?.length){const empty=document.createElement('span');empty.className='phrase-card-no-tags';empty.textContent='タグなし';container.append(empty);return}phrase.tags.forEach(tag=>{const badge=document.createElement('span');badge.className='phrase-card-tag-badge';badge.textContent=tag;container.append(badge)})}};

  const setText=(original,value)=>{const element=document.getElementById(idMap.get(original));if(element)element.textContent=String(value)};
  const refreshPhraseHome=()=>{
    const total=data.phrases.length,counts={mastered:0,steady:0,learning:0,new:0};data.phrases.forEach(item=>{if(item.understanding==='100%')counts.mastered++;else if(item.understanding==='80%')counts.steady++;else if(item.understanding==='50%')counts.learning++;else counts.new++});
    setText('homeImportFileName',data.fileName||'未読込');setText('homeMasteryRate',total?`${Math.round(counts.mastered/total*100)}%`:'0%');setText('homeMasteredCount',counts.mastered);setText('homeSteadyCount',counts.steady);setText('homeLearningCount',counts.learning);setText('homeNewCount',counts.new);
    const correct=data.phrases.reduce((sum,item)=>sum+item.correct,0),wrong=data.phrases.reduce((sum,item)=>sum+item.wrong,0),unsure=data.phrases.reduce((sum,item)=>sum+item.unsure,0),answers=correct+wrong+unsure;
    setText('homeAnswerRate',answers?`${Math.round(correct/answers*100)}%`:'—%');setText('homeCorrectCount',correct);setText('homeWrongCount',wrong);setText('homeUnsureCount',unsure);setText('homeTotalWordCount',total);setText('homeActiveWordCount',total);renderPhraseTagFilter();
  };
  phraseTabs.forEach(button=>button.addEventListener('click',()=>{phraseTabs.forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active))});phrasePanels.forEach(panel=>{panel.hidden=panel.id!==panelByStat[button.dataset.homeStat]})}));

  const applyModuleLabels=()=>{
    const phrase=moduleMode==='phrase-bank';document.body.dataset.practiceModule=phrase?'phrase-bank':'active-vocabulary';window.flovoPracticeBridge?.showCountMode?.(phrase?'phrase-bank':'active-vocabulary');
    const editorButton=document.getElementById('practiceCardAdd');if(editorButton){editorButton.setAttribute('aria-label',phrase?'追加':'データ編集');const label=editorButton.querySelector('span');if(label)label.textContent=phrase?'追加':'データ編集'}
    if(!phrase&&phraseBulkSelecting){phraseBulkSelecting=false;phraseBulkSelectedIds.clear();bulkMove.hidden=true}
    if(typeof bulkSelectButton!=='undefined'){bulkSelectButton.hidden=phraseBulkSelecting;categoryManageButton.hidden=!phrase||phraseBulkSelecting;tagManageButton.hidden=!phrase||phraseBulkSelecting;sortButton.hidden=!phrase||phraseBulkSelecting;bulkSelectButton.setAttribute('aria-label',phrase?'フレーズを移動・削除':'例文を削除');const actionLabel=bulkSelectButton.querySelector('span');if(actionLabel)actionLabel.textContent=phrase?'移動・削除':'削除';if(!phrase&&practiceScreen.hidden){clearTimeout(phraseBulkHeaderTimer);clearTimeout(phraseBulkActionsTimer);bulkHeader.hidden=true;bulkHeader.classList.remove('is-entering','is-leaving');bulkActions.hidden=true;bulkActions.classList.remove('is-entering','is-leaving')}practiceList?.classList.toggle('phrase-bulk-selecting',phraseBulkSelecting)}
    phraseHierarchyFilter.hidden=!phrase;phraseTagFilterSection.hidden=!phrase;tagManageButton.hidden=!phrase||phraseBulkSelecting;if(wordFromField)wordFromField.hidden=phrase;if(wordTextFilterTitle)wordTextFilterTitle.textContent=phrase?'例文文字列条件':'単語文字列条件';if(otherFilterBadge)otherFilterBadge.textContent='条件5';
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
  editor.innerHTML=`<section class="phrase-data-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseDataTitle"><header class="phrase-data-head"><span class="practice-filter-handle" aria-hidden="true"></span><button id="phraseDataCancel" type="button">キャンセル</button><h2 id="phraseDataTitle">例文追加</h2><button id="phraseDataSave" type="button">追加</button></header><div class="phrase-data-body"><label><span>日本語 <b>※</b></span><textarea id="phraseJapaneseInput" rows="3"></textarea></label><label><span>英語 <b>※</b></span><textarea id="phraseEnglishInput" rows="3" lang="en"></textarea></label><label><span>補足</span><textarea id="phraseNoteInput" rows="3"></textarea></label><div class="phrase-category-field"><div><strong>カテゴリ</strong></div><div id="phraseCategoryChoices"></div></div><div class="phrase-tag-editor"><div class="phrase-tag-editor-heading"><strong>タグ</strong><span>任意・複数選択可</span></div><div id="phraseTagEditorChoices" class="phrase-tag-editor-choices"></div><small>登録済みタグから選択できます。追加・削除は練習画面の「タグ」から行います。</small></div><p class="phrase-data-error" id="phraseDataError" hidden></p><button class="phrase-data-delete" id="phraseDataDelete" type="button" hidden>このフレーズを削除</button></div></section>`;shell.append(editor);
  const phraseAddedToast=document.createElement('div');phraseAddedToast.className='phrase-added-toast';phraseAddedToast.setAttribute('role','status');phraseAddedToast.setAttribute('aria-live','polite');phraseAddedToast.textContent='追加しました';phraseAddedToast.hidden=true;document.body.append(phraseAddedToast);
  const manager=document.createElement('div');manager.className='phrase-data-overlay';manager.id='phraseCategoryOverlay';manager.hidden=true;
  manager.innerHTML=`<section class="phrase-data-sheet phrase-category-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseCategoryTitle"><header class="phrase-data-head"><span class="practice-filter-handle" aria-hidden="true"></span><button id="phraseCategoryClose" type="button">キャンセル</button><h2 id="phraseCategoryTitle">カテゴリ管理</h2><button id="phraseCategorySave" type="button">保存</button></header><div class="phrase-category-manager" id="phraseCategoryManager"></div></section>`;shell.append(manager);
  const tagManager=document.createElement('div');tagManager.className='phrase-data-overlay';tagManager.id='phraseTagOverlay';tagManager.hidden=true;
  tagManager.innerHTML='<section class="phrase-data-sheet phrase-tag-manager-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseTagManagerTitle"><header class="phrase-data-head"><span class="practice-filter-handle" aria-hidden="true"></span><button id="phraseTagManagerClose" type="button">キャンセル</button><h2 id="phraseTagManagerTitle">タグ管理</h2><button id="phraseTagSave" type="button">保存</button></header><p class="phrase-tag-manager-error" id="phraseTagManagerError" hidden></p><div class="phrase-tag-manager-list" id="phraseTagManagerList"></div></section>';shell.append(tagManager);
  const bulkSelectButton=document.createElement('button');bulkSelectButton.type='button';bulkSelectButton.id='phraseBulkSelectButton';bulkSelectButton.className='phrase-bulk-select-button';bulkSelectButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="8" cy="16" r="3"/><path d="M14 8h6M14 16h6"/></svg><span>移動・削除</span>';bulkSelectButton.setAttribute('aria-label','フレーズを移動・削除');bulkSelectButton.hidden=true;practiceHeaderActions?.insertBefore(bulkSelectButton,document.getElementById('practiceCardAdd'));
  const categoryManageButton=document.createElement('button');categoryManageButton.type='button';categoryManageButton.className='phrase-bulk-select-button phrase-category-manage-button';categoryManageButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v5M6 9h12M6 9v4M18 9v4"/><rect x="3" y="13" width="6" height="6" rx="1.5"/><rect x="15" y="13" width="6" height="6" rx="1.5"/></svg><span>カテゴリ</span>';categoryManageButton.setAttribute('aria-label','カテゴリ管理を開く');categoryManageButton.hidden=true;practiceHeaderActions?.insertBefore(categoryManageButton,document.getElementById('practiceCardAdd'));
  const sortButton=document.createElement('button');sortButton.type='button';sortButton.className='phrase-bulk-select-button phrase-sort-button';sortButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7 4-4 4 4M12 3v18M16 17l-4 4-4-4"/></svg><span>並び替え</span>';sortButton.setAttribute('aria-label','カテゴリ内のフレーズを並び替える');sortButton.hidden=true;practiceHeaderActions?.insertBefore(sortButton,categoryManageButton);
  const tagManageButton=document.createElement('button');tagManageButton.type='button';tagManageButton.className='phrase-bulk-select-button phrase-tag-manage-button';tagManageButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13.5 13.5 20a2 2 0 0 1-2.8 0L4 13.3V4h9.3l6.7 6.7a2 2 0 0 1 0 2.8Z"/><circle cx="8.5" cy="8.5" r="1"/></svg><span>タグ</span>';tagManageButton.setAttribute('aria-label','タグを追加・削除する');tagManageButton.hidden=true;practiceHeaderActions?.insertBefore(tagManageButton,categoryManageButton);practiceHeaderActions?.insertBefore(tagManageButton,sortButton);
  const bulkHeader=document.createElement('div');bulkHeader.className='phrase-bulk-header';bulkHeader.hidden=true;bulkHeader.innerHTML='<button class="phrase-bulk-all" type="button">すべてを選択</button><strong class="phrase-bulk-count">0件選択</strong><button class="phrase-bulk-cancel" type="button" aria-label="選択を終了"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>';practiceScreenHeader?.append(bulkHeader);
  const bulkActions=document.createElement('div');bulkActions.className='phrase-bulk-actions';bulkActions.hidden=true;bulkActions.innerHTML='<button class="phrase-bulk-move" type="button" aria-label="選択したフレーズを移動" title="移動" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2 2h9v9.5a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19Z"/><path d="M3.5 8V5A1.5 1.5 0 0 1 5 3.5h5l2 2h7A1.5 1.5 0 0 1 20.5 7v2.5"/></svg></button><button class="phrase-bulk-delete" type="button" aria-label="選択した例文を削除" title="削除" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13M10 10v7M14 10v7"/></svg></button>';practiceList?.append(bulkActions);
  const bulkMove=document.createElement('div');bulkMove.className='phrase-data-overlay';bulkMove.id='phraseBulkMoveOverlay';bulkMove.hidden=true;
  bulkMove.innerHTML='<section class="phrase-data-sheet phrase-bulk-move-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseBulkMoveTitle"><header class="phrase-data-head"><button class="phrase-bulk-move-cancel" type="button">キャンセル</button><h2 id="phraseBulkMoveTitle">移動先を選択</h2><button class="phrase-bulk-move-save" type="button" disabled>移動</button></header><p class="phrase-category-help phrase-bulk-move-summary"></p><div class="phrase-bulk-destinations"></div></section>';shell.append(bulkMove);
  const sortOverlay=document.createElement('div');sortOverlay.className='phrase-data-overlay';sortOverlay.id='phraseSortOverlay';sortOverlay.hidden=true;
  sortOverlay.innerHTML='<section class="phrase-data-sheet phrase-sort-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseSortTitle"><header class="phrase-data-head"><span class="practice-filter-handle" aria-hidden="true"></span><button id="phraseSortCancel" type="button">キャンセル</button><h2 id="phraseSortTitle">並び替え</h2><button id="phraseSortSave" type="button" disabled>保存</button></header><div class="phrase-sort-category-picker" id="phraseSortCategoryPicker"><p class="phrase-category-help">並び替えるカテゴリを1つ選んでください。</p><div class="phrase-sort-categories" id="phraseSortCategories"></div></div><div class="phrase-sort-content" id="phraseSortContent" hidden><div class="phrase-sort-selected"><strong id="phraseSortCategoryName"></strong><button id="phraseSortChooseCategory" type="button">カテゴリを選び直す</button></div><p class="phrase-category-help">各行の↑↓で順番を調整します。例文番号は保存時に振り直されます。</p><div class="phrase-sort-items" id="phraseSortItems"></div></div></section>';shell.append(sortOverlay);
  let phraseSortCategoryId=null,phraseSortDraftIds=[],phraseSortOriginalIds=[],phraseSortDirty=false;
  const $=selector=>document.querySelector(selector);
  const showPhraseAddedToast=()=>{clearTimeout(phraseSaveMessageTimer);phraseAddedToast.hidden=false;phraseAddedToast.classList.remove('is-visible');requestAnimationFrame(()=>phraseAddedToast.classList.add('is-visible'));phraseSaveMessageTimer=setTimeout(()=>{phraseAddedToast.classList.remove('is-visible');phraseSaveMessageTimer=setTimeout(()=>{phraseAddedToast.hidden=true},280)},2400)};

  const renderCategoryChoices=()=>{
    const container=$('#phraseCategoryChoices');if(!flattenCategories().length){container.innerHTML='<p class="phrase-category-empty">カテゴリ管理からカテゴリを作成してください。</p>';return}
    if(editorPrimaryId)categoryPathNodes(editorPrimaryId).forEach(item=>expandedCategoriesFor('editor').add(item.id));
    renderCategoryTree(container,'editor',item=>{
      const row=document.createElement('label');row.className='phrase-category-choice';const check=document.createElement('input');check.type='checkbox';check.checked=editorCategoryIds.has(item.id);check.setAttribute('aria-label',`${categoryPath(item.id)}を設定`);const label=document.createElement('span');label.textContent=item.name;check.addEventListener('change',()=>{toggleEditorCategory(item,check.checked);renderCategoryChoices()});row.append(check,label);return row;
    });
    renderPhraseHierarchyFilter();window.flovoPracticeBridge?.refreshFilterCount?.();
  };
  const renderEditorTags=()=>{
    const container=$('#phraseTagEditorChoices');if(!container)return;container.replaceChildren();
    const renderLevel=(parentId,target,depth)=>{
      const folders=data.tagFolders.filter(folder=>(folder.parentId??null)===(parentId??null)).sort((a,b)=>a.order-b.order||a.id-b.id);
      folders.forEach(folder=>{
        const node=document.createElement('div');node.className='phrase-tag-editor-folder-node';node.style.setProperty('--depth',depth);
        const row=document.createElement('div');row.className='phrase-tag-editor-folder-row';
        const directTags=allPhraseTags().filter(tag=>tagFolderIdFor(tag)===folder.id),subfolders=data.tagFolders.filter(item=>item.parentId===folder.id);
        const canExpand=directTags.length>0||subfolders.length>0;
        const toggle=document.createElement(canExpand?'button':'span');
        if(canExpand){toggle.type='button';toggle.className='phrase-tag-editor-folder-toggle';toggle.textContent=expandedTagFolders.has(folder.id)?'⌄':'›';toggle.setAttribute('aria-expanded',String(expandedTagFolders.has(folder.id)));toggle.setAttribute('aria-label','「'+folder.name+'」'+(expandedTagFolders.has(folder.id)?'を折りたたむ':'展開'));toggle.addEventListener('click',()=>{if(expandedTagFolders.has(folder.id))expandedTagFolders.delete(folder.id);else expandedTagFolders.add(folder.id);renderEditorTags()})}
        else{toggle.className='phrase-tag-tree-spacer';toggle.setAttribute('aria-hidden','true')}
        const label=document.createElement('strong');label.className='phrase-tag-editor-folder-label';label.innerHTML=tagTreeIcons.folder;const name=document.createElement('span');name.textContent=folder.name;label.append(name);row.append(toggle,label);node.append(row);target.append(node);
        if(canExpand){const children=document.createElement('div');children.className='phrase-tag-editor-folder-children';children.hidden=!expandedTagFolders.has(folder.id);node.append(children);renderLevel(folder.id,children,depth+1)}
      });
      allPhraseTags().filter(tag=>tagFolderIdFor(tag)===parentId).forEach(tag=>{
        const row=document.createElement('div');row.className='phrase-tag-editor-tree-tag-row';row.style.setProperty('--depth',depth);
        const spacer=document.createElement('span');spacer.className='phrase-tag-tree-spacer';spacer.setAttribute('aria-hidden','true');
        const button=document.createElement('button');button.type='button';button.className='phrase-tag-editor-choice';const selected=[...editorTagNames].some(item=>item.toLocaleLowerCase('ja')===tag.toLocaleLowerCase('ja'));button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));button.textContent=tag;button.addEventListener('click',()=>{if(selected)editorTagNames=new Set([...editorTagNames].filter(item=>item.toLocaleLowerCase('ja')!==tag.toLocaleLowerCase('ja')));else editorTagNames.add(tag);renderEditorTags()});row.append(spacer,button);target.append(row)
      })
    };
    renderLevel(null,container,0)
  };
  const showTagManagerForm=(kind,parentId)=>{tagManagerFolderId=parentId??null;tagManagerFormState={kind,parentId:tagManagerFolderId};if(tagManagerFolderId!=null)expandTagFolderPath(tagManagerFolderId);$('#phraseTagManagerError').hidden=true;renderPhraseTagManager();requestAnimationFrame(()=>$('#'+(kind==='tag'?'phraseNewTagInput':'phraseNewFolderInput'))?.focus())};
const tagTreeIcons={tag:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 3 10V3h7l10 10Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',folder:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/><path d="M3 9h18"/></svg>',move:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"/><path d="M9 13h7m-2-2 2 2-2 2"/></svg>'};
  const markTagManagerDirty=async()=>{tagManagerDirty=true;const save=$('#phraseTagSave');if(save)save.disabled=false};
  const renderPhraseTagManager=()=>{
  const container=$('#phraseTagManagerList');container.replaceChildren();
  const rootRow=document.createElement('div');rootRow.className='phrase-tag-tree-root';const rootName=document.createElement('strong');rootName.textContent='ルート';const rootActions=document.createElement('div');rootActions.className='phrase-tag-root-actions';const rootAddTag=document.createElement('button');rootAddTag.type='button';rootAddTag.className='phrase-tag-icon-button';rootAddTag.setAttribute('aria-label','ルートにタグを追加');rootAddTag.title='タグを追加';rootAddTag.innerHTML=tagTreeIcons.tag;rootAddTag.addEventListener('click',()=>showTagManagerForm('tag',null));const rootAddFolder=document.createElement('button');rootAddFolder.type='button';rootAddFolder.className='phrase-tag-icon-button';rootAddFolder.setAttribute('aria-label','ルートにフォルダを追加');rootAddFolder.title='フォルダを追加';rootAddFolder.innerHTML=tagTreeIcons.folder;rootAddFolder.addEventListener('click',()=>showTagManagerForm('folder',null));rootActions.append(rootAddTag,rootAddFolder);rootRow.append(rootName,rootActions);container.append(rootRow);
  const makeTagRow=(tag,index,localTags,parentId)=>{const row=document.createElement('div');row.className='phrase-tag-manager-row phrase-tag-tree-tag';const input=document.createElement('input');input.value=tag;input.maxLength=30;input.setAttribute('aria-label',tag+'タグの名前');const save=document.createElement('button');save.type='button';save.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m4 16.5-.8 4.3 4.3-.8L19.8 7.7a2.1 2.1 0 0 0-3-3L4 16.5Z\"/><path d=\"m14.8 6.7 3 3\"/></svg>";save.title='変更';save.setAttribute('aria-label',tag+'を変更');save.addEventListener('click',async()=>{const next=normalize(input.value),error=$('#phraseTagManagerError');if(!next){error.textContent='タグ名を入力してください。';error.hidden=false;return}if(next.includes('|')){error.textContent='タグ名に「|」は使えません。';error.hidden=false;return}if(allPhraseTags().some(item=>tagFolderKey(item)===tagFolderKey(next)&&tagFolderKey(item)!==tagFolderKey(tag))){error.textContent='同じ名前のタグがすでにあります。タグ名はフォルダ間でも重複できません。';error.hidden=false;return}if(next===tag){error.hidden=true;return}const matches=value=>tagFolderKey(value)===tagFolderKey(tag),oldKey=tagFolderKey(tag),newKey=tagFolderKey(next);data.tags=data.tags.map(item=>matches(item)?next:item);data.phrases.forEach(phrase=>{phrase.tags=(phrase.tags||[]).map(item=>matches(item)?next:item)});if(data.tagFolderByName[oldKey]!=null){data.tagFolderByName[newKey]=data.tagFolderByName[oldKey];delete data.tagFolderByName[oldKey]}phraseFilterTagNames=new Set([...phraseFilterTagNames].map(item=>matches(item)?next:item));editorTagNames=new Set([...editorTagNames].map(item=>matches(item)?next:item));await markTagManagerDirty();error.hidden=true;renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter();refreshPhraseHome();await refreshLivePractice();window.flovoPracticeBridge?.refreshFilterCount?.()});const up=document.createElement('button');up.type='button';up.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m6 14 6-6 6 6\"/></svg>";up.setAttribute('aria-label','上へ移動');up.disabled=index===0;const down=document.createElement('button');down.type='button';down.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m6 10 6 6 6-6\"/></svg>";down.setAttribute('aria-label','下へ移動');down.disabled=index===localTags.length-1;const move=delta=>{const targetTag=localTags[index+delta];if(!targetTag)return;const from=data.tags.findIndex(item=>tagFolderKey(item)===tagFolderKey(tag)),to=data.tags.findIndex(item=>tagFolderKey(item)===tagFolderKey(targetTag));[data.tags[from],data.tags[to]]=[data.tags[to],data.tags[from]];markTagManagerDirty();renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter()};up.addEventListener('click',()=>move(-1));down.addEventListener('click',()=>move(1));const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',async()=>{if(!confirm('「'+tag+'」をすべての例文から外して削除しますか？'))return;data.tags=data.tags.filter(item=>tagFolderKey(item)!==tagFolderKey(tag));delete data.tagFolderByName[tagFolderKey(tag)];data.phrases.forEach(phrase=>{phrase.tags=(phrase.tags||[]).filter(item=>tagFolderKey(item)!==tagFolderKey(tag))});phraseFilterTagNames=new Set([...phraseFilterTagNames].filter(item=>tagFolderKey(item)!==tagFolderKey(tag)));await markTagManagerDirty();renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter();refreshPhraseHome();window.flovoPracticeBridge?.refreshFilterCount?.()});const controls=document.createElement('div');controls.className='phrase-tag-manager-actions';controls.append(save,up,down,remove);row.append(input,controls);return row};
  const makeInlineAddRow=(kind,parentId)=>{const row=document.createElement('div');row.className='phrase-tag-inline-add-row';row.style.setProperty('--depth',tagFolderDepth(parentId));const spacer=document.createElement('span');spacer.className='phrase-tag-tree-spacer';const input=document.createElement('input');input.id=kind==='tag'?'phraseNewTagInput':'phraseNewFolderInput';input.maxLength=30;input.placeholder=kind==='tag'?'新しいタグ名':'新しいフォルダ名';input.setAttribute('aria-label',input.placeholder);const add=document.createElement('button');add.type='button';add.textContent='追加';add.addEventListener('click',()=>{const work=kind==='tag'?addManagedTag():addManagedTagFolder();work.catch(()=>alert(kind==='tag'?'タグを追加できませんでした。':'フォルダを追加できませんでした。'))});const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.addEventListener('click',()=>{tagManagerFormState=null;$('#phraseTagManagerError').hidden=true;renderPhraseTagManager()});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add.click()}else if(event.key==='Escape'){event.preventDefault();cancel.click()}});row.append(spacer,input,add,cancel);return row};
  const renderLevel=(parentId,depth,target)=>{
    if(tagManagerFormState&&tagManagerFormState.parentId===parentId)target.append(makeInlineAddRow(tagManagerFormState.kind,parentId));
    const folders=data.tagFolders.filter(folder=>(folder.parentId??null)===(parentId??null)).sort((a,b)=>a.order-b.order||a.id-b.id);
    if(folders.length){const heading=document.createElement('strong');heading.className='phrase-tag-tree-section-title';heading.textContent=depth===0?'フォルダ':'サブフォルダ';target.append(heading)}
    folders.forEach((folder,index)=>{const node=document.createElement('div');node.className='phrase-tag-tree-node';node.style.setProperty('--depth',depth);const row=document.createElement('div');row.className='phrase-tag-folder-tree-row';const directTags=allPhraseTags().filter(tag=>tagFolderIdFor(tag)===folder.id),subfolders=data.tagFolders.filter(item=>item.parentId===folder.id);const hasChildren=directTags.length+subfolders.length>0,showInlineForm=tagManagerFormState?.parentId===folder.id,canExpand=hasChildren||showInlineForm||expandedTagFolders.has(folder.id);let toggle;if(canExpand){toggle=document.createElement('button');toggle.type='button';toggle.className='phrase-tag-tree-toggle';toggle.textContent=expandedTagFolders.has(folder.id)?'⌄':'›';toggle.setAttribute('aria-expanded',String(expandedTagFolders.has(folder.id)));toggle.setAttribute('aria-label','「'+folder.name+'」'+(expandedTagFolders.has(folder.id)?'を折りたたむ':'展開'));toggle.addEventListener('click',()=>{if(expandedTagFolders.has(folder.id))expandedTagFolders.delete(folder.id);else expandedTagFolders.add(folder.id);renderPhraseTagManager()})}else{toggle=document.createElement('span');toggle.className='phrase-tag-tree-spacer';toggle.setAttribute('aria-hidden','true')}const name=document.createElement('strong');const folderIcon=document.createElement('span');folderIcon.className='phrase-tag-folder-inline-icon';folderIcon.innerHTML=tagTreeIcons.folder;const nameText=document.createElement('span');nameText.textContent=folder.name;name.append(folderIcon,nameText);const addTag=document.createElement('button');addTag.type='button';addTag.className='phrase-tag-icon-button';addTag.innerHTML=tagTreeIcons.tag;addTag.setAttribute('aria-label',folder.name+'にタグを追加');addTag.title='このフォルダにタグを追加';addTag.addEventListener('click',()=>showTagManagerForm('tag',folder.id));const addFolder=document.createElement('button');addFolder.type='button';addFolder.className='phrase-tag-icon-button';addFolder.innerHTML=tagTreeIcons.folder;addFolder.setAttribute('aria-label',folder.name+'にサブフォルダを追加');addFolder.title='サブフォルダを追加';addFolder.addEventListener('click',()=>showTagManagerForm('folder',folder.id));const rename=document.createElement('button');rename.type='button';rename.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m4 16.5-.8 4.3 4.3-.8L19.8 7.7a2.1 2.1 0 0 0-3-3L4 16.5Z\"/><path d=\"m14.8 6.7 3 3\"/></svg>";rename.title='名前を変更';rename.setAttribute('aria-label',folder.name+'の名前変更');rename.addEventListener('click',async()=>{const next=normalize(window.prompt('フォルダ名',folder.name));if(!next||next===folder.name)return;if(next.includes('/')){alert('フォルダ名に「/」は使えません。');return}if(data.tagFolders.some(item=>item.id!==folder.id&&(item.parentId??null)===(folder.parentId??null)&&item.name.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ階層に同じ名前のフォルダがあります。');return}folder.name=next;await markTagManagerDirty();renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter()});const up=document.createElement('button');up.type='button';up.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m6 14 6-6 6 6\"/></svg>";up.setAttribute('aria-label','上へ移動');up.disabled=index===0;const down=document.createElement('button');down.type='button';down.innerHTML="<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"m6 10 6 6 6-6\"/></svg>";down.setAttribute('aria-label','下へ移動');down.disabled=index===folders.length-1;const moveFolder=delta=>{const targetFolder=folders[index+delta];if(!targetFolder)return;const order=folder.order;folder.order=targetFolder.order;targetFolder.order=order;markTagManagerDirty();renderPhraseTagManager()};up.addEventListener('click',()=>moveFolder(-1));down.addEventListener('click',()=>moveFolder(1));const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',async()=>{const parent=folder.parentId??null;if(!confirm('「'+tagFolderPath(folder.id)+'」を削除しますか？中のタグとサブフォルダは親の場所へ移動します。'))return;data.tagFolders.forEach(item=>{if(item.parentId===folder.id)item.parentId=parent});Object.keys(data.tagFolderByName).forEach(key=>{if(Number(data.tagFolderByName[key])===folder.id){if(parent==null)delete data.tagFolderByName[key];else data.tagFolderByName[key]=parent}});data.tagFolders=data.tagFolders.filter(item=>item.id!==folder.id);expandedTagFolders.delete(folder.id);await markTagManagerDirty();renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter()});const folderActions=document.createElement('div');folderActions.className='phrase-tag-folder-tree-icons';folderActions.append(addTag,addFolder);const actions=document.createElement('div');actions.className='phrase-tag-folder-tree-actions phrase-tag-manager-actions';actions.append(rename,up,down,remove);row.append(toggle,name,folderActions,actions);node.append(row);node.style.setProperty('--depth',depth);target.append(node);if(canExpand){const childrenBox=document.createElement('div');childrenBox.className='phrase-tag-tree-children';childrenBox.hidden=!expandedTagFolders.has(folder.id);node.append(childrenBox);renderLevel(folder.id,depth+1,childrenBox)}});
    const tags=allPhraseTags().filter(tag=>tagFolderIdFor(tag)===parentId);if(tags.length){const heading=document.createElement('strong');heading.className='phrase-tag-tree-section-title';heading.textContent='タグ';target.append(heading)}tags.forEach((tag,index)=>{const node=document.createElement('div');node.className='phrase-tag-tree-tag-node';const spacer=document.createElement('span');spacer.className='phrase-tag-tree-spacer';spacer.setAttribute('aria-hidden','true');node.append(spacer,makeTagRow(tag,index,tags,parentId));target.append(node)});
  };
  renderLevel(null,0,container);
    const saveButton=$('#phraseTagSave');if(saveButton)saveButton.disabled=!tagManagerDirty;
    if(!data.tagFolders.length&&!allPhraseTags().length&&!tagManagerFormState){const empty=document.createElement('p');empty.className='phrase-tag-manager-empty';empty.textContent='タグやフォルダはありません。上のルート行から追加できます。';container.append(empty)}
};const addManagedTag=async()=>{const input=$('#phraseNewTagInput'),name=normalize(input.value),error=$('#phraseTagManagerError');if(!name){error.textContent='タグ名を入力してください。';error.hidden=false;return}if(name.includes('|')){error.textContent='タグ名に「|」は使えません。';error.hidden=false;return}if(allPhraseTags().some(tag=>tag.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'))){error.textContent='同じ名前のタグがすでにあります。タグ名はフォルダ間でも重複できません。';error.hidden=false;return}data.tags.push(name);if(tagManagerFolderId!=null){data.tagFolderByName[tagFolderKey(name)]=tagManagerFolderId;expandTagFolderPath(tagManagerFolderId)}await markTagManagerDirty();input.value='';tagManagerFormState=null;error.hidden=true;renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter();refreshPhraseHome()};
const addManagedTagFolder=async()=>{const input=$('#phraseNewFolderInput'),name=normalize(input.value),error=$('#phraseTagManagerError');if(!name){error.textContent='フォルダ名を入力してください。';error.hidden=false;return}if(name.includes('/')){error.textContent='フォルダ名に「/」は使えません。';error.hidden=false;return}const parent=tagManagerFolderId;if(data.tagFolders.some(folder=>(folder.parentId??null)===(parent??null)&&folder.name.toLocaleLowerCase('ja')===name.toLocaleLowerCase('ja'))){error.textContent='同じ階層に同じ名前のフォルダがあります。';error.hidden=false;return}const created={id:data.nextTagFolderId++,parentId:parent,name,order:data.tagFolders.filter(folder=>(folder.parentId??null)===(parent??null)).length+1};data.tagFolders.push(created);if(parent!=null)expandTagFolderPath(parent);await markTagManagerDirty();input.value='';tagManagerFormState=null;error.hidden=true;renderPhraseTagManager();renderEditorTags();renderPhraseTagFilter()};
const saveTagManager=async()=>{if(!tagManagerDirty)return;await writeStore();try{localStorage.setItem('phraseTagFilterV1',JSON.stringify([...phraseFilterTagNames]))}catch{}tagManagerSnapshot=null;tagManagerDirty=false;await closePhraseBottomSheet(tagManager);renderEditorTags();renderPhraseTagFilter();refreshPhraseHome();await refreshLivePractice();window.flovoPracticeBridge?.refreshFilterCount?.()};
  const openTagManager=()=>{tagManagerFolderId=null;tagManagerFormState=null;tagManagerSnapshot={tags:data.tags.slice(),tagFolders:data.tagFolders.map(item=>({...item})),tagFolderByName:{...data.tagFolderByName},nextTagFolderId:data.nextTagFolderId,phraseTags:data.phrases.map(phrase=>[phrase.id,(phrase.tags||[]).slice()]),filterTags:[...phraseFilterTagNames],editorTags:[...editorTagNames]};tagManagerDirty=false;renderPhraseTagManager();$('#phraseTagManagerError').hidden=true;$('#phraseTagSave').onclick=saveTagManager;bindPhraseBottomSheetGrab(tagManager,()=>closeTagManager(true));openPhraseBottomSheet(tagManager)};
  const closeTagManager=async(skipConfirmation=false)=>{if(tagManagerDirty&&!skipConfirmation&&!confirm('保存していない変更を破棄しますか？'))return;if(tagManagerDirty&&tagManagerSnapshot){data.tags=tagManagerSnapshot.tags.slice();data.tagFolders=tagManagerSnapshot.tagFolders.map(item=>({...item}));data.tagFolderByName={...tagManagerSnapshot.tagFolderByName};data.nextTagFolderId=tagManagerSnapshot.nextTagFolderId;const phraseTags=new Map(tagManagerSnapshot.phraseTags);data.phrases.forEach(phrase=>{phrase.tags=(phraseTags.get(phrase.id)||[]).slice()});phraseFilterTagNames=new Set(tagManagerSnapshot.filterTags);editorTagNames=new Set(tagManagerSnapshot.editorTags);try{localStorage.setItem('phraseTagFilterV1',JSON.stringify([...phraseFilterTagNames]))}catch{}renderEditorTags();renderPhraseTagFilter();refreshPhraseHome();window.flovoPracticeBridge?.refreshFilterCount?.()}tagManagerSnapshot=null;tagManagerDirty=false;await closePhraseBottomSheet(tagManager);await refreshLivePractice()};
  const openPhraseBottomSheet=overlay=>{overlay.hidden=false;requestAnimationFrame(()=>requestAnimationFrame(()=>overlay.classList.add('open')))};
  const closePhraseBottomSheet=async overlay=>{if(overlay.hidden)return;overlay.classList.remove('open');await new Promise(resolve=>setTimeout(resolve,340));overlay.hidden=true};
  const bindPhraseBottomSheetGrab=(overlay,onDismiss)=>{if(overlay.dataset.grabBound||!window.flovoPracticeBridge?.enableBottomSheetGrab)return;const sheet=overlay.querySelector('.phrase-data-sheet'),handle=overlay.querySelector('.practice-filter-handle');if(!sheet||!handle)return;window.flovoPracticeBridge.enableBottomSheetGrab(overlay,sheet,handle,onDismiss);overlay.dataset.grabBound='true'};
  const openEditor=async phrase=>{await loadData();clearTimeout(phraseSaveMessageTimer);phraseAddedToast.hidden=true;phraseAddedToast.classList.remove('is-visible');editorPhraseId=phrase?.id??null;editorCategoryIds=new Set(phrase?.categoryIds||[]);editorTagNames=new Set(phrase?.tags||[]);editorPrimaryId=phrase?.primaryCategoryId||null;normalizeEditorCategories();$('#phraseDataTitle').textContent=phrase?'フレーズ編集':'例文追加';$('#phraseDataSave').textContent=phrase?'保存':'追加';$('#phraseJapaneseInput').value=phrase?.japanese||'';$('#phraseEnglishInput').value=phrase?.english||'';$('#phraseNoteInput').value=phrase?.note||'';$('#phraseDataDelete').hidden=!phrase;$('#phraseDataError').hidden=true;renderCategoryChoices();renderEditorTags();bindPhraseBottomSheetGrab(editor,closeEditor);openPhraseBottomSheet(editor)};
  const closeEditor=async()=>{await closePhraseBottomSheet(editor);editorPhraseId=null;editorCategoryIds.clear();editorPrimaryId=null;editorTagNames.clear();};
  const refreshLivePractice=options=>practiceScreen.hidden?Promise.resolve():window.flovoPracticeBridge?.refresh?.(options)||Promise.resolve();
  const saveEditor=async()=>{const japanese=normalize($('#phraseJapaneseInput').value),english=normalize($('#phraseEnglishInput').value),note=normalize($('#phraseNoteInput').value),error=$('#phraseDataError');if(!japanese||!english){error.textContent='日本語と英語は両方入力してください。';error.hidden=false;return}pickEditorPrimary(editorPrimaryId);if(!editorPrimaryId){error.textContent='カテゴリを選択してください。';error.hidden=false;return}let phrase=data.phrases.find(item=>item.id===editorPhraseId),isNew=!phrase;if(!phrase){phrase={id:data.nextPhraseId++,order:data.phrases.length+1,understanding:'',correct:0,wrong:0,unsure:0};data.phrases.push(phrase)}Object.assign(phrase,{primaryCategoryId:editorPrimaryId,categoryIds:[...editorCategoryIds],japanese,english,note,tags:[...editorTagNames]});await writeStore();refreshPhraseHome();const preferredNumber=phraseNumber(phrase);error.hidden=true;if(isNew){editorPhraseId=null;$('#phraseJapaneseInput').value='';$('#phraseEnglishInput').value='';$('#phraseNoteInput').value='';editorTagNames.clear();renderEditorTags();showPhraseAddedToast();await refreshLivePractice();return}await closeEditor();await refreshLivePractice({preferredNumber})};
  const deletePhrase=async()=>{const phrase=data.phrases.find(item=>item.id===editorPhraseId);if(!phrase||!confirm('このフレーズを削除しますか？'))return;data.phrases=data.phrases.filter(item=>item!==phrase);await writeStore();refreshPhraseHome();await closeEditor();await refreshLivePractice()};

  const markCategoryManagerDirty=()=>{
    categoryManagerDirty=true;
    const save=$('#phraseCategorySave');if(save)save.disabled=false;
  };
  const addCategory=async(parentId,name)=>{
    const next=normalize(name);
    if(!next||/[>|]/.test(next)){alert('カテゴリ名に「>」「|」は使えません。');return false}
    if(next===UNCATEGORIZED_NAME){alert('「未分類」は固定階層のため追加できません。');return false}
    if(childrenOf(parentId).some(candidate=>candidate.name.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ階層に同名のカテゴリがあります。');return false}
    data.categories.push({id:data.nextCategoryId++,parentId,name:next,order:childrenOf(parentId).length+1});categoryDraftParentId=undefined;markCategoryManagerDirty();renderCategoryManager();return true;
  };
  const appendCategoryDraft=(container,parentId,depth)=>{
    const row=document.createElement('div');row.className='phrase-category-manager-row phrase-category-draft';row.style.setProperty('--depth',depth);
    const code=document.createElement('b');const nextOrdinal=childrenOf(parentId).filter(candidate=>!isUncategorized(candidate)).length+1;code.textContent=parentId==null?String(nextOrdinal):`${categoryCode(parentId)}.${nextOrdinal}`;
    const input=document.createElement('input');input.maxLength=30;input.placeholder=parentId==null?'新しい親階層名':'新しい子階層名';input.setAttribute('aria-label',input.placeholder);
    const save=document.createElement('button');save.type='button';save.textContent='追加';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
    const commit=()=>addCategory(parentId,input.value);
    save.addEventListener('click',commit);cancel.addEventListener('click',()=>{categoryDraftParentId=undefined;renderCategoryManager()});input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commit()}else if(event.key==='Escape'){event.preventDefault();categoryDraftParentId=undefined;renderCategoryManager()}});
    row.append(code,input,save,cancel);container.append(row);requestAnimationFrame(()=>input.focus({preventScroll:true}));
  };

  const renderCategoryManager=()=>{
    const container=$('#phraseCategoryManager');
    renderCategoryTree(container,'manager',item=>{
      const fixed=isUncategorized(item),row=document.createElement('div');row.className='phrase-category-manager-row';
      const code=document.createElement('b');code.textContent=categoryCode(item.id);
      const input=document.createElement('input');input.value=item.name;input.maxLength=30;input.disabled=fixed;input.setAttribute('aria-label',`${item.name}の名前`);
      input.addEventListener('input',()=>{item.name=input.value;markCategoryManagerDirty()});
      const add=document.createElement('button');add.type='button';add.textContent='＋';add.disabled=fixed;add.setAttribute('aria-label',fixed?'未分類には子階層を追加できません':`${item.name}に子階層を追加`);
      add.addEventListener('click',()=>{categoryDraftParentId=item.id;expandedCategoriesFor('manager').add(item.id);renderCategoryManager()});
      const siblings=childrenOf(item.parentId),siblingIndex=siblings.findIndex(candidate=>candidate.id===item.id);const up=document.createElement('button');up.type='button';up.textContent='↑';up.disabled=fixed||siblingIndex<=0||isUncategorized(siblings[siblingIndex-1]);up.setAttribute('aria-label',fixed?'未分類は固定階層のため移動できません':`${item.name}を上へ`);const down=document.createElement('button');down.type='button';down.textContent='↓';down.disabled=fixed||siblingIndex<0||siblingIndex>=siblings.length-1||isUncategorized(siblings[siblingIndex+1]);down.setAttribute('aria-label',fixed?'未分類は固定階層のため移動できません':`${item.name}を下へ`);const moveCategory=delta=>{const current=childrenOf(item.parentId),index=current.findIndex(candidate=>candidate.id===item.id),target=current[index+delta];if(index<0||!target||fixed||isUncategorized(target))return;const order=item.order;item.order=target.order;target.order=order;markCategoryManagerDirty();renderCategoryManager()};up.addEventListener('click',()=>moveCategory(-1));down.addEventListener('click',()=>moveCategory(1));
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.disabled=fixed;remove.setAttribute('aria-label',fixed?'未分類は削除できません':`${item.name}を削除`);
      remove.addEventListener('click',()=>{const ids=new Set([item.id,...descendantIds(item.id)]),affected=data.phrases.filter(phrase=>ids.has(phrase.primaryCategoryId)||phrase.categoryIds.some(id=>ids.has(id)));if(!confirm(`「${item.name}」と配下の階層を削除しますか？${affected.length?`\n含まれるフレーズ ${affected.length}件は保存時に「未分類」へ移動します。`:''}`))return;data.categories=data.categories.filter(candidate=>!ids.has(candidate.id));expandedCategoriesFor('manager').forEach(id=>{if(ids.has(id))expandedCategoriesFor('manager').delete(id)});categoryDraftParentId=undefined;markCategoryManagerDirty();renderCategoryManager()});
      row.append(code,input,add,up,down,remove);return row;
    },(item,depth)=>{
      if(categoryDraftParentId!==item.id)return null;
      const holder=document.createElement('div');appendCategoryDraft(holder,item.id,depth+1);return holder.firstElementChild;
    });
    if(categoryDraftParentId===null)appendCategoryDraft(container,null,0);
    const addRoot=document.createElement('button');addRoot.type='button';addRoot.className='phrase-category-add-root';addRoot.textContent='＋ 親階層を追加';addRoot.addEventListener('click',()=>{categoryDraftParentId=null;renderCategoryManager()});container.append(addRoot);
    const save=$('#phraseCategorySave');if(save)save.disabled=!categoryManagerDirty;
  };
  const saveCategoryManager=async()=>{
    const names=new Set();
    for(const category of data.categories){
      const name=normalize(category.name);
      if(!name||/[>|]/.test(name)){alert('カテゴリ名を入力してください。「>」「|」は使えません。');return}
      if(name===UNCATEGORIZED_NAME&& !isUncategorized(category)){alert('「未分類」は固定階層名です。');return}
      const key=`${category.parentId??'root'}:${name.toLocaleLowerCase('ja')}`;
      if(names.has(key)){alert('同じ階層に同名のカテゴリがあります。');return}
      names.add(key);category.name=name;
    }
    const oldIds=new Set((categoryManagerSnapshot?.categories||[]).map(item=>item.id));
    const currentIds=new Set(data.categories.map(item=>item.id));
    const removedIds=new Set([...oldIds].filter(id=>!currentIds.has(id)));
    if(removedIds.size){
      const uncategorized=ensureUncategorizedCategory();
      data.phrases.filter(phrase=>removedIds.has(phrase.primaryCategoryId)||phrase.categoryIds.some(id=>removedIds.has(id))).forEach(phrase=>{phrase.primaryCategoryId=uncategorized.id;phrase.categoryIds=[uncategorized.id]});
    }
    await writeStore();categoryManagerSnapshot=null;categoryManagerDirty=false;categoryDraftParentId=undefined;
    await closePhraseBottomSheet(manager);renderCategoryChoices();await refreshLivePractice();
  };
  const openManager=()=>{categoryDraftParentId=undefined;categoryManagerSnapshot={categories:data.categories.map(item=>({...item})),nextCategoryId:data.nextCategoryId};categoryManagerDirty=false;renderCategoryManager();bindPhraseBottomSheetGrab(manager,()=>closeManager(true));openPhraseBottomSheet(manager)};
  const closeManager=async(skipConfirmation=false)=>{
    if(categoryManagerDirty&&!skipConfirmation&&!confirm('保存していない変更を破棄しますか？'))return;
    if(categoryManagerDirty&&categoryManagerSnapshot){data.categories=categoryManagerSnapshot.categories.map(item=>({...item}));data.nextCategoryId=categoryManagerSnapshot.nextCategoryId}
    categoryManagerSnapshot=null;categoryManagerDirty=false;categoryDraftParentId=undefined;
    await closePhraseBottomSheet(manager);renderCategoryChoices();await refreshLivePractice();
  };
  const renderPhraseSortCategories=()=>{const c=$('#phraseSortCategories');renderCategoryTree(c,'sort',item=>{const row=document.createElement('label');row.className='phrase-sort-category';const radio=document.createElement('input');radio.type='radio';radio.name='phraseSortCategory';radio.value=String(item.id);radio.setAttribute('aria-label',categoryPath(item.id));const label=document.createElement('span');label.textContent=item.name;radio.addEventListener('change',()=>selectPhraseSortCategory(item.id));row.append(radio,label);return row})};
  const renderPhraseSortItems=()=>{const c=$('#phraseSortItems');c.replaceChildren();const category=categoryById(phraseSortCategoryId);if(!category)return;$('#phraseSortCategoryName').textContent=categoryPath(category.id);if(!phraseSortDraftIds.length){const p=document.createElement('p');p.className='phrase-sort-empty';p.textContent='このカテゴリにはフレーズがありません。';c.append(p)}phraseSortDraftIds.forEach((id,i)=>{const phrase=data.phrases.find(x=>x.id===id);if(!phrase)return;const row=document.createElement('article');row.className='phrase-sort-row';const no=document.createElement('span');no.className='phrase-sort-number';no.textContent=categoryCode(category.id)+'-'+String(i+1).padStart(3,'0');const copy=document.createElement('div');copy.className='phrase-sort-copy';const ja=document.createElement('strong');ja.textContent=phrase.japanese||'（日本語未登録）';const en=document.createElement('span');en.textContent=phrase.english||'（英語未登録）';copy.append(ja,en);const actions=document.createElement('div');actions.className='phrase-sort-row-actions';const up=document.createElement('button');up.type='button';up.textContent='↑';up.disabled=i===0;up.setAttribute('aria-label',(i+1)+'番目のフレーズを上へ移動');const down=document.createElement('button');down.type='button';down.textContent='↓';down.disabled=i===phraseSortDraftIds.length-1;down.setAttribute('aria-label',(i+1)+'番目のフレーズを下へ移動');const move=(from,to)=>{if(to<0||to>=phraseSortDraftIds.length)return;const next=phraseSortDraftIds.slice();[next[from],next[to]]=[next[to],next[from]];phraseSortDraftIds=next;phraseSortDirty=next.some((value,index)=>value!==phraseSortOriginalIds[index]);$('#phraseSortSave').disabled=!phraseSortDirty;renderPhraseSortItems()};up.addEventListener('click',()=>move(i,i-1));down.addEventListener('click',()=>move(i,i+1));actions.append(up,down);row.append(no,copy,actions);c.append(row)})};
  const selectPhraseSortCategory=id=>{if(phraseSortDirty&&!confirm('保存していない並び替えがあります。破棄してカテゴリを選び直しますか？')){const current=document.querySelector('#phraseSortCategories input[value="'+phraseSortCategoryId+'"]');if(current)current.checked=true;return}phraseSortCategoryId=id;phraseSortDraftIds=data.phrases.filter(x=>x.primaryCategoryId===id).sort((a,b)=>a.order-b.order||a.id-b.id).map(x=>x.id);phraseSortOriginalIds=phraseSortDraftIds.slice();phraseSortDirty=false;$('#phraseSortSave').disabled=true;$('#phraseSortCategoryPicker').hidden=true;$('#phraseSortContent').hidden=false;renderPhraseSortItems()};
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
