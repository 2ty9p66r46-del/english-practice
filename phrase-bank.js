'use strict';

(()=>{
  const openButton=document.getElementById('phraseBankOpen');
  const shell=document.querySelector('.shell');
  const mainNav=document.querySelector('.nav');
  const navHome=document.querySelector('.nav-home');
  if(!openButton||!shell)return;

  const screen=document.createElement('section');
  screen.className='phrase-bank-screen';
  screen.id='phraseBankScreen';
  screen.hidden=true;
  screen.setAttribute('aria-label','マイフレーズバンク');
  screen.innerHTML=`
    <header class="phrase-bank-header">
      <button class="phrase-bank-back" id="phraseBankBack" type="button" aria-label="ホームへ戻る">‹</button>
      <div class="phrase-bank-title"><strong>マイフレーズバンク</strong><small>MY PHRASE BANK</small></div>
      <button class="phrase-bank-header-action" id="phraseSceneManage" type="button">場面管理</button>
    </header>
    <div class="phrase-bank-tabs" role="tablist" aria-label="表示切替">
      <button class="phrase-bank-tab active" data-phrase-tab="list" type="button" role="tab" aria-selected="true">フレーズ一覧</button>
      <button class="phrase-bank-tab" data-phrase-tab="practice" type="button" role="tab" aria-selected="false">練習</button>
    </div>
    <main class="phrase-bank-main">
      <section id="phraseListPanel">
        <div class="phrase-bank-filter">
          <div class="phrase-bank-filter-head"><strong>場面で絞り込み</strong><div class="phrase-bank-filter-mode"><button class="active" data-phrase-filter-mode="any" type="button">いずれか</button><button data-phrase-filter-mode="all" type="button">すべて</button></div></div>
          <div class="phrase-bank-scene-chips" id="phraseFilterScenes"></div>
        </div>
        <div class="phrase-bank-list-meta"><span id="phraseListCount">0件</span><button class="phrase-bank-add" id="phraseAdd" type="button">＋ フレーズ追加</button></div>
        <div class="phrase-bank-list" id="phraseList"></div>
      </section>
      <section class="phrase-practice" id="phrasePracticePanel" hidden></section>
    </main>
    <div class="phrase-overlay" id="phraseEditorOverlay" hidden>
      <section class="phrase-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseEditorTitle">
        <header class="phrase-sheet-head"><button id="phraseEditorCancel" type="button">キャンセル</button><h2 id="phraseEditorTitle">フレーズ追加</h2><button id="phraseEditorSave" type="button">保存</button></header>
        <div class="phrase-editor-fields">
          <label class="phrase-field"><span>日本語 <b class="phrase-field-required">※</b></span><textarea id="phraseJapaneseInput" rows="3" placeholder="自分が言いたい日本語"></textarea></label>
          <label class="phrase-field"><span>英語 <b class="phrase-field-required">※</b></span><textarea id="phraseEnglishInput" rows="3" placeholder="英語のフレーズ" lang="en"></textarea></label>
          <label class="phrase-field"><span>補足</span><textarea id="phraseNoteInput" rows="3" placeholder="使い方や言い換えなど（任意）"></textarea></label>
          <div class="phrase-field"><div class="phrase-editor-scene-head"><span>場面（複数選択可）</span></div><div class="phrase-bank-scene-chips" id="phraseEditorScenes"></div></div>
          <div class="phrase-inline-add"><input id="phraseNewScene" type="text" maxlength="30" placeholder="新しい場面を追加"><button id="phraseNewSceneAdd" type="button">追加</button></div>
          <p class="phrase-editor-error" id="phraseEditorError" hidden></p>
        </div>
        <button class="phrase-delete-button" id="phraseDelete" type="button" hidden>このフレーズを削除</button>
      </section>
    </div>
    <div class="phrase-overlay" id="phraseSceneOverlay" hidden>
      <section class="phrase-sheet" role="dialog" aria-modal="true" aria-labelledby="phraseSceneTitle">
        <header class="phrase-sheet-head"><button id="phraseSceneClose" type="button">閉じる</button><h2 id="phraseSceneTitle">場面管理</h2><span></span></header>
        <div class="phrase-inline-add"><input id="phraseManagerNewScene" type="text" maxlength="30" placeholder="新しい場面"><button id="phraseManagerAdd" type="button">追加</button></div>
        <div class="phrase-scene-manager-list" id="phraseSceneList"></div>
      </section>
    </div>`;
  shell.append(screen);

  const $=selector=>screen.querySelector(selector);
  const $$=selector=>[...screen.querySelectorAll(selector)];
  const storeKey='phraseBankV1';
  const emptyData=()=>({version:1,nextId:1,scenes:[],phrases:[]});
  let data=emptyData();
  let activeTab='list';
  let filterMode='any';
  let selectedFilters=new Set();
  let practiceRows=[];
  let practiceIndex=0;
  let editorPhraseId=null;
  let editorScenes=new Set();
  let swipeStart=null;

  const openDatabase=()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('flovo-data',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('app'))request.result.createObjectStore('app')};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  const loadData=async()=>{
    const database=await openDatabase();
    try{
      const saved=await new Promise((resolve,reject)=>{
        const transaction=database.transaction('app','readonly');
        const request=transaction.objectStore('app').get(storeKey);
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      if(!saved||!Array.isArray(saved.scenes)||!Array.isArray(saved.phrases))return emptyData();
      saved.nextId=Math.max(Number(saved.nextId)||1,...saved.phrases.map(item=>(Number(item.id)||0)+1));
      saved.phrases.forEach(item=>{
        item.scenes=Array.isArray(item.scenes)?item.scenes.filter(Boolean):[];
        item.understanding=['0%','50%','80%','100%'].includes(item.understanding)?item.understanding:'';
        item.correct=Number(item.correct)||0;item.unsure=Number(item.unsure)||0;item.wrong=Number(item.wrong)||0;
      });
      return saved;
    }finally{database.close()}
  };
  const saveData=async()=>{
    const database=await openDatabase();
    try{
      await new Promise((resolve,reject)=>{
        const transaction=database.transaction('app','readwrite');
        transaction.objectStore('app').put(data,storeKey);
        transaction.oncomplete=resolve;
        transaction.onerror=()=>reject(transaction.error);
      });
    }finally{database.close()}
  };
  const normalize=value=>String(value??'').trim();
  const formatNumber=value=>String(value).padStart(5,'0');
  const phraseById=id=>data.phrases.find(item=>item.id===id);
  const visiblePhrases=()=>{
    if(!selectedFilters.size)return [...data.phrases];
    const selected=[...selectedFilters];
    return data.phrases.filter(item=>filterMode==='all'?selected.every(scene=>item.scenes.includes(scene)):selected.some(scene=>item.scenes.includes(scene)));
  };
  const makeSceneChip=(scene,selected=false)=>{
    const chip=document.createElement('span');chip.className='phrase-scene-chip';chip.textContent=scene;
    if(selected)chip.classList.add('selected');
    return chip;
  };
  const showEmpty=(container,title,detail)=>{
    const empty=document.createElement('div');empty.className='phrase-bank-empty';
    const inner=document.createElement('div');const strong=document.createElement('strong');strong.textContent=title;
    const p=document.createElement('p');p.textContent=detail;inner.append(strong,p);empty.append(inner);container.append(empty);
  };

  const renderFilterScenes=()=>{
    const container=$('#phraseFilterScenes');container.replaceChildren();
    const all=document.createElement('button');all.type='button';all.className='phrase-scene-chip';all.textContent='すべて';
    all.classList.toggle('selected',selectedFilters.size===0);
    all.addEventListener('click',()=>{selectedFilters.clear();renderAll()});container.append(all);
    data.scenes.forEach(scene=>{
      const chip=document.createElement('button');chip.type='button';chip.className='phrase-scene-chip';chip.textContent=scene;
      chip.classList.toggle('selected',selectedFilters.has(scene));
      chip.addEventListener('click',()=>{selectedFilters.has(scene)?selectedFilters.delete(scene):selectedFilters.add(scene);renderAll()});
      container.append(chip);
    });
  };
  const renderList=()=>{
    const rows=visiblePhrases();const list=$('#phraseList');list.replaceChildren();
    $('#phraseListCount').textContent=`${rows.length} / ${data.phrases.length}件`;
    if(!rows.length){
      showEmpty(list,data.phrases.length?'条件に合うフレーズがありません':'フレーズはまだありません',data.phrases.length?'場面の選択を変えてください。':'「＋ フレーズ追加」から最初のフレーズを登録できます。');return;
    }
    rows.forEach(item=>{
      const row=document.createElement('article');row.className='phrase-bank-row';
      const number=document.createElement('span');number.className='phrase-bank-row-number';number.textContent=`No ${formatNumber(item.id)}`;
      const scenes=document.createElement('div');scenes.className='phrase-bank-row-scenes';
      item.scenes.forEach(scene=>scenes.append(makeSceneChip(scene)));
      if(!item.scenes.length)scenes.append(makeSceneChip('場面未登録'));
      const japanese=document.createElement('p');japanese.className='phrase-bank-row-japanese';japanese.textContent=item.japanese;
      const english=document.createElement('p');english.className='phrase-bank-row-english';english.textContent=item.english;
      const edit=document.createElement('button');edit.type='button';edit.className='phrase-bank-row-edit';edit.textContent='•••';edit.setAttribute('aria-label','フレーズを編集');edit.addEventListener('click',()=>openEditor(item.id));
      row.append(number,scenes,japanese,english,edit);list.append(row);
    });
  };
  const setAnswerVisible=visible=>{
    const reveal=$('#phraseReveal');const english=$('#phrasePracticeEnglish');
    if(!reveal||!english)return;reveal.hidden=visible;english.hidden=!visible;
  };
  const renderPractice=()=>{
    const panel=$('#phrasePracticePanel');panel.replaceChildren();
    practiceRows=visiblePhrases();
    if(practiceIndex>=practiceRows.length)practiceIndex=Math.max(0,practiceRows.length-1);
    if(!practiceRows.length){const empty=document.createElement('div');empty.className='phrase-practice-empty';empty.textContent='練習できるフレーズがありません。';panel.append(empty);return}
    const item=practiceRows[practiceIndex];
    const card=document.createElement('article');card.className='phrase-practice-card';card.id='phrasePracticeCard';
    card.innerHTML=`
      <div class="phrase-practice-top"><strong class="phrase-practice-progress">${practiceIndex+1} / ${practiceRows.length}</strong><div class="phrase-practice-scenes"></div></div>
      <section class="phrase-practice-language"><header><span>日本語</span><button class="phrase-speak" data-phrase-speak="ja" type="button" aria-label="日本語を再生">▶</button></header><p>${escapeHtml(item.japanese)}</p></section>
      <section class="phrase-practice-language"><header><span>英語</span><button class="phrase-speak" data-phrase-speak="en" type="button" aria-label="英語を再生">▶</button></header><button class="phrase-reveal" id="phraseReveal" type="button">英文を表示</button><p id="phrasePracticeEnglish" hidden>${escapeHtml(item.english)}</p></section>
      ${normalize(item.note)?`<p class="phrase-practice-note">${escapeHtml(item.note)}</p>`:''}
      <div class="phrase-practice-ratings" aria-label="理解度">${['0%','50%','80%','100%'].map(value=>`<button type="button" data-phrase-rating="${value}" class="${item.understanding===value?'selected':''}">${value.replace('%','')}</button>`).join('')}</div>
      <div class="phrase-practice-results"><button class="phrase-result-correct" type="button" data-phrase-result="correct">◯ <small>${item.correct}</small></button><button class="phrase-result-unsure" type="button" data-phrase-result="unsure">△ <small>${item.unsure}</small></button><button class="phrase-result-wrong" type="button" data-phrase-result="wrong">× <small>${item.wrong}</small></button></div>
      <div class="phrase-practice-nav"><button type="button" data-phrase-move="-1">前へ</button><button type="button" data-phrase-move="1">次へ</button></div>`;
    const scenes=card.querySelector('.phrase-practice-scenes');item.scenes.forEach(scene=>scenes.append(makeSceneChip(scene)));
    if(!item.scenes.length)scenes.append(makeSceneChip('場面未登録'));
    panel.append(card);
    card.querySelector('#phraseReveal').addEventListener('click',()=>setAnswerVisible(true));
    card.querySelector('#phrasePracticeEnglish').addEventListener('click',()=>setAnswerVisible(false));
    card.querySelectorAll('[data-phrase-move]').forEach(button=>button.addEventListener('click',()=>movePractice(Number(button.dataset.phraseMove))));
    card.querySelectorAll('[data-phrase-rating]').forEach(button=>button.addEventListener('click',async()=>{
      item.understanding=item.understanding===button.dataset.phraseRating?'':button.dataset.phraseRating;await persistAndRender();
    }));
    card.querySelectorAll('[data-phrase-result]').forEach(button=>button.addEventListener('click',async()=>{
      item[button.dataset.phraseResult]=(Number(item[button.dataset.phraseResult])||0)+1;await persistAndRender();
    }));
    card.querySelectorAll('[data-phrase-speak]').forEach(button=>button.addEventListener('click',()=>{
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();const english=button.dataset.phraseSpeak==='en';const utterance=new SpeechSynthesisUtterance(english?item.english:item.japanese);utterance.lang=english?'en-US':'ja-JP';speechSynthesis.speak(utterance);
    }));
    card.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;swipeStart={id:event.pointerId,x:event.clientX,y:event.clientY};card.setPointerCapture?.(event.pointerId)});
    card.addEventListener('pointerup',event=>{if(!swipeStart||swipeStart.id!==event.pointerId)return;const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;swipeStart=null;if(Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.2)movePractice(dx<0?1:-1)});
    card.addEventListener('pointercancel',()=>{swipeStart=null});
  };
  const escapeHtml=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const movePractice=direction=>{if(!practiceRows.length)return;practiceIndex=(practiceIndex+direction+practiceRows.length)%practiceRows.length;renderPractice()};
  const renderAll=()=>{renderFilterScenes();renderList();if(activeTab==='practice')renderPractice()};
  const persistAndRender=async()=>{try{await saveData();renderAll()}catch{alert('フレーズデータを保存できませんでした。')}};

  const renderEditorScenes=()=>{
    const container=$('#phraseEditorScenes');container.replaceChildren();
    if(!data.scenes.length){const note=document.createElement('span');note.className='phrase-bank-list-meta';note.textContent='場面を下の入力欄から追加してください。';container.append(note);return}
    data.scenes.forEach(scene=>{
      const chip=document.createElement('button');chip.type='button';chip.className='phrase-scene-chip';chip.textContent=scene;chip.classList.toggle('selected',editorScenes.has(scene));
      chip.addEventListener('click',()=>{editorScenes.has(scene)?editorScenes.delete(scene):editorScenes.add(scene);renderEditorScenes()});container.append(chip);
    });
  };
  const addScene=async(input,selectInEditor=false)=>{
    const scene=normalize(input.value);if(!scene)return;
    const duplicate=data.scenes.find(item=>item.toLocaleLowerCase('ja')===scene.toLocaleLowerCase('ja'));
    if(duplicate){if(selectInEditor)editorScenes.add(duplicate);input.value='';renderEditorScenes();return}
    data.scenes.push(scene);if(selectInEditor)editorScenes.add(scene);input.value='';await saveData();renderAll();renderEditorScenes();renderSceneManager();
  };
  const openEditor=id=>{
    editorPhraseId=id??null;const item=id==null?null:phraseById(id);editorScenes=new Set(item?.scenes||[]);
    $('#phraseEditorTitle').textContent=item?'フレーズ編集':'フレーズ追加';
    $('#phraseJapaneseInput').value=item?.japanese||'';$('#phraseEnglishInput').value=item?.english||'';$('#phraseNoteInput').value=item?.note||'';
    $('#phraseEditorError').hidden=true;$('#phraseDelete').hidden=!item;renderEditorScenes();$('#phraseEditorOverlay').hidden=false;$('#phraseJapaneseInput').focus({preventScroll:true});
  };
  const closeEditor=()=>{$('#phraseEditorOverlay').hidden=true;editorPhraseId=null;editorScenes.clear()};
  const saveEditor=async()=>{
    const japanese=normalize($('#phraseJapaneseInput').value),english=normalize($('#phraseEnglishInput').value),note=normalize($('#phraseNoteInput').value),error=$('#phraseEditorError');
    if(!japanese||!english){error.textContent='日本語と英語は両方入力してください。';error.hidden=false;return}
    if(editorPhraseId==null){data.phrases.push({id:data.nextId++,japanese,english,note,scenes:[...editorScenes],understanding:'',correct:0,unsure:0,wrong:0})}
    else{const item=phraseById(editorPhraseId);if(!item)return;Object.assign(item,{japanese,english,note,scenes:[...editorScenes]})}
    try{await saveData();closeEditor();renderAll()}catch{error.textContent='保存できませんでした。';error.hidden=false}
  };
  const deleteEditorPhrase=async()=>{
    const item=phraseById(editorPhraseId);if(!item||!confirm('このフレーズを削除しますか？'))return;
    data.phrases=data.phrases.filter(candidate=>candidate!==item);await saveData();closeEditor();renderAll();
  };

  const renderSceneManager=()=>{
    const list=$('#phraseSceneList');list.replaceChildren();
    if(!data.scenes.length){const empty=document.createElement('p');empty.className='phrase-manager-empty';empty.textContent='場面はまだ登録されていません。';list.append(empty);return}
    data.scenes.forEach(scene=>{
      const row=document.createElement('div');row.className='phrase-scene-manager-row';
      const input=document.createElement('input');input.value=scene;input.maxLength=30;input.setAttribute('aria-label',`${scene}の名前`);
      const save=document.createElement('button');save.type='button';save.textContent='変更';save.addEventListener('click',async()=>{
        const next=normalize(input.value);if(!next||next===scene)return;
        if(data.scenes.some(item=>item!==scene&&item.toLocaleLowerCase('ja')===next.toLocaleLowerCase('ja'))){alert('同じ名前の場面があります。');return}
        data.scenes[data.scenes.indexOf(scene)]=next;data.phrases.forEach(item=>{item.scenes=item.scenes.map(value=>value===scene?next:value)});
        if(selectedFilters.delete(scene))selectedFilters.add(next);await saveData();renderAll();renderSceneManager();
      });
      const remove=document.createElement('button');remove.type='button';remove.textContent='削除';remove.addEventListener('click',async()=>{
        if(!confirm(`場面「${scene}」を削除しますか？\nフレーズ本体は削除されません。`))return;
        data.scenes=data.scenes.filter(item=>item!==scene);data.phrases.forEach(item=>{item.scenes=item.scenes.filter(value=>value!==scene)});selectedFilters.delete(scene);editorScenes.delete(scene);await saveData();renderAll();renderEditorScenes();renderSceneManager();
      });
      row.append(input,save,remove);list.append(row);
    });
  };
  const openSceneManager=()=>{renderSceneManager();$('#phraseSceneOverlay').hidden=false;$('#phraseManagerNewScene').focus({preventScroll:true})};
  const closeSceneManager=()=>{$('#phraseSceneOverlay').hidden=true};
  const setTab=tab=>{
    activeTab=tab;$$('[data-phrase-tab]').forEach(button=>{const active=button.dataset.phraseTab===tab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
    $('#phraseListPanel').hidden=tab!=='list';$('#phrasePracticePanel').hidden=tab!=='practice';if(tab==='practice'){practiceIndex=0;renderPractice()}
  };
  const openScreen=async()=>{
    try{data=await loadData()}catch{data=emptyData();alert('保存済みのフレーズデータを読み込めませんでした。')}
    selectedFilters=new Set([...selectedFilters].filter(scene=>data.scenes.includes(scene)));screen.hidden=false;mainNav?.classList.add('phrase-mode');navHome?.classList.remove('active');setTab('list');renderAll();
  };
  const closeScreen=()=>{if('speechSynthesis' in window)speechSynthesis.cancel();screen.hidden=true;mainNav?.classList.remove('phrase-mode');navHome?.classList.add('active')};

  openButton.addEventListener('click',openScreen);
  openButton.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openScreen()}});
  $('#phraseBankBack').addEventListener('click',closeScreen);navHome?.addEventListener('click',()=>{if(!screen.hidden)closeScreen()});
  $('#phraseSceneManage').addEventListener('click',openSceneManager);$('#phraseSceneClose').addEventListener('click',closeSceneManager);
  $('#phraseSceneOverlay').addEventListener('click',event=>{if(event.target===$('#phraseSceneOverlay'))closeSceneManager()});
  $('#phraseAdd').addEventListener('click',()=>openEditor(null));$('#phraseEditorCancel').addEventListener('click',closeEditor);$('#phraseEditorSave').addEventListener('click',saveEditor);$('#phraseDelete').addEventListener('click',deleteEditorPhrase);
  $('#phraseEditorOverlay').addEventListener('click',event=>{if(event.target===$('#phraseEditorOverlay'))closeEditor()});
  $('#phraseNewSceneAdd').addEventListener('click',()=>addScene($('#phraseNewScene'),true));$('#phraseManagerAdd').addEventListener('click',()=>addScene($('#phraseManagerNewScene')));
  $('#phraseNewScene').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addScene(event.currentTarget,true)}});$('#phraseManagerNewScene').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addScene(event.currentTarget)}});
  $$('[data-phrase-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.phraseTab)));
  $$('[data-phrase-filter-mode]').forEach(button=>button.addEventListener('click',()=>{filterMode=button.dataset.phraseFilterMode;$$('[data-phrase-filter-mode]').forEach(item=>item.classList.toggle('active',item===button));renderAll()}));
  document.addEventListener('keydown',event=>{if(screen.hidden||event.key!=='Escape')return;if(!$('#phraseEditorOverlay').hidden)closeEditor();else if(!$('#phraseSceneOverlay').hidden)closeSceneManager();else closeScreen()});
})();
