'use strict';

// FloVo home behavior. Shared screen styles live in styles.css.
const EXPECTED_HEADERS=['品詞重要度','No','Sub No','単語','発音記号US','発音記号UK','品詞','意味','日本語文','英文','備考','S','W','理解度','データチェック'];
    const importButton=document.getElementById('importButton');
    const exportButton=document.getElementById('exportButton');
    const reloadButton=document.getElementById('reloadButton');
    const templateButton=document.getElementById('templateButton');
    const excelInput=document.getElementById('excelInput');
    const helpButton=document.getElementById('helpButton');
    const helpOverlay=document.getElementById('helpOverlay');
    const helpClose=document.getElementById('helpClose');
    const text=value=>String(value??'').trim();
    const openDatabase=()=>new Promise((resolve,reject)=>{
      const request=indexedDB.open('flovo-data',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('app');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    let importedDataPromise=null;
    const saveImportedData=async payload=>{
      const database=await openDatabase();
      await new Promise((resolve,reject)=>{
        const transaction=database.transaction('app','readwrite');
        transaction.objectStore('app').put(payload,'importedExcel');
        transaction.oncomplete=resolve;
        transaction.onerror=()=>reject(transaction.error);
      });
      database.close();
      importedDataPromise=Promise.resolve(payload);
    };
    const loadImportedData=async()=>{
      const database=await openDatabase();
      const result=await new Promise((resolve,reject)=>{
        const request=database.transaction('app','readonly').objectStore('app').get('importedExcel');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      database.close();
      return result;
    };
    const getImportedData=()=>importedDataPromise||(importedDataPromise=loadImportedData().catch(error=>{
      importedDataPromise=null;
      throw error;
    }));
    const saveFileToDevice=async file=>{
      if(navigator.canShare?.({files:[file]})){
        await navigator.share({files:[file]});
        return;
      }
      const url=URL.createObjectURL(file);
      const link=document.createElement('a');
      link.href=url;
      link.download=file.name;
      link.style.display='none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    };
    const validateRows=rows=>{
      const errors=[];
      const pairNumbers=new Map();
      rows.forEach((row,index)=>{
        const rowNo=index+2;
        const required=[0,1,2,3,4,5,6];
        if(required.some(column=>!text(row[column])))errors.push(`${rowNo}行目：必須項目が空欄です`);
        if(!text(row[11])&&!text(row[12]))errors.push(`${rowNo}行目：S・Wが両方空欄です`);
        if(text(row[14]))errors.push(`${rowNo}行目：データチェックに「${text(row[14])}」があります`);
        const word=text(row[3]).toLowerCase();
        const part=text(row[6]);
        const no=text(row[1]);
        if(word&&part&&no){
          const key=`${word}\\t${part}`;
          if(pairNumbers.has(key)&&pairNumbers.get(key)!==no)errors.push(`${rowNo}行目：同じ単語・品詞が別Noで定義されています`);
          else pairNumbers.set(key,no);
        }
      });
      return [...new Set(errors)];
    };
    reloadButton.addEventListener('click',async()=>{
      if(!navigator.onLine){alert('オフラインのため更新できません。通信を確認してください。');return}
      reloadButton.disabled=true;
      reloadButton.classList.add('loading');
      try{
        const registration=await navigator.serviceWorker?.getRegistration();
        await registration?.update();
        const cacheNames=await caches.keys();
        await Promise.all(cacheNames.filter(name=>name.startsWith('flovo-')).map(name=>caches.delete(name)));
        location.reload();
      }catch(error){
        reloadButton.disabled=false;
        reloadButton.classList.remove('loading');
        alert('更新に失敗しました。通信を確認してもう一度お試しください。');
      }
    });
    templateButton.addEventListener('click',async()=>{
      if(!confirm('Excelの雛形をダウンロードしますか？'))return;
      templateButton.disabled=true;
      try{
        const response=await fetch('./Import-data_format.xlsx',{cache:'no-store'});
        if(!response.ok)throw new Error('雛形ファイルを取得できませんでした。');
        const file=new File([await response.blob()],'Import-data_format.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        await saveFileToDevice(file);
      }catch(error){
        if(error?.name!=='AbortError')alert(error?.message||'雛形の保存に失敗しました。');
      }finally{
        templateButton.disabled=false;
      }
    });
    exportButton.addEventListener('click',async()=>{
      exportButton.disabled=true;
      try{
        const stored=await getImportedData();
        if(!stored)throw new Error('書き出すデータがありません。先にExcelを読み込んでください。');
        let bytes=stored.fileBytes;
        if(!bytes||stored.modified){
          if(typeof XLSX==='undefined')throw new Error('Excel書出機能を準備できませんでした。通信状態を確認してください。');
          const sheet=XLSX.utils.aoa_to_sheet([stored.headers,...stored.rows]);
          const workbook=XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook,sheet,'単語リスト');
          bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
        }
        const now=new Date();
        const pad=value=>String(value).padStart(2,'0');
        const timestamp=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        const originalName=stored.fileName||'FloVo_export.xlsx';
        const baseName=originalName.replace(/\.xlsx$/i,'');
        const fileName=`${baseName}_${timestamp}.xlsx`;
        const file=new File([bytes],fileName,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
        await saveFileToDevice(file);
      }catch(error){
        if(error?.name!=='AbortError')alert(error?.message||'Excelの書き出しに失敗しました。');
      }finally{
        exportButton.disabled=false;
      }
    });
    importButton.addEventListener('click',()=>{
      if(typeof XLSX==='undefined'){alert('Excel読込機能を準備できませんでした。通信状態を確認して、アプリを開き直してください。');return}
      excelInput.click();
    });
    excelInput.addEventListener('change',async()=>{
      const file=excelInput.files?.[0];
      if(!file)return;
      importButton.disabled=true;
      try{
        const fileBytes=await file.arrayBuffer();
        const workbook=XLSX.read(fileBytes,{type:'array',cellFormula:true});
        const sheet=workbook.Sheets['単語リスト']||workbook.Sheets[workbook.SheetNames[0]];
        if(!sheet)throw new Error('読み込めるシートがありません。');
        const allRows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
        const headers=(allRows[0]||[]).map(text);
        const formatMatches=headers.length===EXPECTED_HEADERS.length&&EXPECTED_HEADERS.every((header,index)=>headers[index]===header);
        if(!formatMatches)throw new Error('雛形と列名または列順が違います。雛形ファイルにデータを入力して読み込んでください。');
        const rows=allRows.slice(1).filter(row=>row.some(value=>text(value)));
        if(!rows.length)throw new Error('読み込めるデータがありません。');
        const errors=validateRows(rows);
        if(errors.length)throw new Error(`データにエラーがあります。\\n\\n${errors.slice(0,5).join('\\n')}${errors.length>5?`\\nほか${errors.length-5}件`:''}`);
        await saveImportedData({headers,rows,vocabularyRows:rows.map(row=>[...row]),fileName:file.name,fileBytes,modified:false,importedAt:new Date().toISOString()});
        await refreshQuestionCount();
        alert(`${rows.length}行のデータを読み込みました。`);
      }catch(error){
        alert(error?.message||'Excelの読み込みに失敗しました。');
      }finally{
        importButton.disabled=false;
        excelInput.value='';
      }
    });
    const scroller=document.getElementById('mainScroll');
    const practiceButton=document.getElementById('practiceButton');
    const wordCount=document.getElementById('wordCount');
    const exampleCount=document.getElementById('exampleCount');
    const homeWordCount=document.getElementById('homeWordCount');
    const homeExampleCount=document.getElementById('homeExampleCount');
    const homeImportFileName=document.getElementById('homeImportFileName');
    const filterSections=[...document.querySelectorAll('.filter-section')];
    const subgroupAllButtons=[...document.querySelectorAll('.group .all')];
    const levelChoices=[...document.querySelectorAll('.level-group .choice')];
    const partChoices=[...document.querySelectorAll('.part-group .choice')];
    const understandingChoices=[...document.querySelectorAll('.understanding .choice')];
    const allFilterChoices=[...levelChoices,...partChoices,...understandingChoices];
    const selectAllFilters=document.getElementById('selectAllFilters');
    const overallFilterWarning=document.getElementById('overallFilterWarning');
    const practiceScreen=document.getElementById('practiceScreen');
    const screenFade=document.getElementById('screenFade');
    const practiceExerciseCard=document.getElementById('practiceExerciseCard');
    const practiceListPlaceholder=document.getElementById('practiceListPlaceholder');
    const practiceList=document.getElementById('practiceList');
    const mainNav=document.querySelector('.nav');
    const navHome=document.querySelector('.nav-home');
    const practiceProgress=document.getElementById('practiceProgress');
    const practiceJapanese=document.getElementById('practiceJapanese');
    const practiceEnglish=document.getElementById('practiceEnglish');
    const practiceReveal=document.getElementById('practiceReveal');
    const practiceAudio=document.getElementById('practiceAudio');
    const practiceJapaneseAudio=document.getElementById('practiceJapaneseAudio');
    const practiceJapaneseStop=document.getElementById('practiceJapaneseStop');
    const practiceEnglishStop=document.getElementById('practiceEnglishStop');
    const practiceWord=document.getElementById('practiceWord');
    const practiceNumber=document.getElementById('practiceNumber');
    const practicePart=document.getElementById('practicePart');
    const practiceLevels=document.getElementById('practiceLevels');
    const practiceMeaning=document.getElementById('practiceMeaning');
    const practicePronUs=document.getElementById('practicePronUs');
    const practicePronUk=document.getElementById('practicePronUk');
    const practicePronUsAudio=document.getElementById('practicePronUsAudio');
    const practicePronUkAudio=document.getElementById('practicePronUkAudio');
    const practiceNote=document.getElementById('practiceNote');
    const practiceCardAdd=document.getElementById('practiceCardAdd');
    const cardActionsOverlay=document.getElementById('cardActionsOverlay');
    const cardActionsWord=document.getElementById('cardActionsWord');
    const cardActionsNumber=document.getElementById('cardActionsNumber');
    const cardActionEdit=document.getElementById('cardActionEdit');
    const cardActionDelete=document.getElementById('cardActionDelete');
    const cardActionCancel=document.getElementById('cardActionCancel');
    const cardEditorOverlay=document.getElementById('cardEditorOverlay');
    const cardEditorTitle=document.getElementById('cardEditorTitle');
    const cardEditorCancel=document.getElementById('cardEditorCancel');
    const cardEditorSave=document.getElementById('cardEditorSave');
    const cardWordSearch=document.getElementById('cardWordSearch');
    const cardWordResults=document.getElementById('cardWordResults');
    const cardSelectedWord=document.getElementById('cardSelectedWord');
    const cardJapaneseInput=document.getElementById('cardJapaneseInput');
    const cardEnglishInput=document.getElementById('cardEnglishInput');
    const practiceRatingButtons=[...document.querySelectorAll('.practice-rating-button')];
    const setSentenceSpeaking=(button,active,showStop=true)=>{
      button.classList.toggle('speaking',active);
      const stopButton=button===practiceJapaneseAudio?practiceJapaneseStop:practiceEnglishStop;
      stopButton.hidden=!active||!showStop;
    };
    const clearSentenceSpeaking=()=>{
      setSentenceSpeaking(practiceJapaneseAudio,false);
      setSentenceSpeaking(practiceAudio,false);
    };
    const autoPlayTab=document.getElementById('autoPlayTab');
    const autoPlayIcon=document.getElementById('autoPlayIcon');
    const autoPlayLabel=document.getElementById('autoPlayLabel');
    const languageModeTab=document.getElementById('languageModeTab');
    const languageModeIcon=document.getElementById('languageModeIcon');
    const languageModeLabel=document.getElementById('languageModeLabel');
    const repeatModeTab=document.getElementById('repeatModeTab');
    const repeatModeLabel=document.getElementById('repeatModeLabel');
    const practiceBackToList=document.getElementById('practiceBackToList');
    const practiceHeaderCounts=document.getElementById('practiceHeaderCounts');
    const practiceFilterButton=document.getElementById('practiceFilterButton');
    const practiceFilterOverlay=document.getElementById('practiceFilterOverlay');
    const practiceFilterSheetBody=document.getElementById('practiceFilterSheetBody');
    const practiceFilterClose=document.getElementById('practiceFilterClose');
    const filterCard=document.getElementById('filterCard');
    const filterCardHomeParent=filterCard.parentNode;
    const filterCardHomeNext=filterCard.nextSibling;
    const practiceSettingsTab=document.getElementById('practiceSettingsTab');
    const practiceSettingsOverlay=document.getElementById('practiceSettingsOverlay');
    const practiceSettingsClose=document.getElementById('practiceSettingsClose');
    const japanesePauseSetting=document.getElementById('japanesePauseSetting');
    const englishPauseSetting=document.getElementById('englishPauseSetting');
    const englishRepeatSetting=document.getElementById('englishRepeatSetting');
    const speechRateSetting=document.getElementById('speechRateSetting');
    const japanesePauseMenu=document.getElementById('japanesePauseMenu');
    const englishPauseMenu=document.getElementById('englishPauseMenu');
    const englishRepeatMenu=document.getElementById('englishRepeatMenu');
    const speechRateMenu=document.getElementById('speechRateMenu');
    levelChoices.forEach(button=>button.classList.add(button.textContent.trim().endsWith('1')?'red':button.textContent.trim().endsWith('2')?'orange':'yellow'));
    document.querySelectorAll('.part-group').forEach(group=>{
      const rank=group.querySelector('.group-title span')?.textContent.trim().slice(-1);
      const tone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank];
      if(tone)group.querySelectorAll('.choice').forEach(button=>button.classList.add(tone));
    });
    const understandingTones={'未登録':'purple','0%':'red','50%':'orange','80%':'yellow','100%':'green'};
    understandingChoices.forEach(button=>button.classList.add(understandingTones[button.textContent.trim()]));
    const selectedValues=buttons=>new Set(buttons.filter(button=>button.classList.contains('selected')).map(button=>button.dataset.value||button.textContent.trim()));
    const getMatchingRows=rows=>{
      const levels=selectedValues(levelChoices);
      const parts=selectedValues(partChoices);
      const understandings=selectedValues(understandingChoices);
      return rows.filter(row=>{
        if(!text(row[8])||!text(row[9]))return false;
        if(levels.size&&![text(row[11]),text(row[12])].some(value=>levels.has(value)))return false;
        if(parts.size&&!parts.has(text(row[6])))return false;
        const understanding=text(row[13])||'未登録';
        return !understandings.size||understandings.has(understanding);
      });
    };
    const refreshQuestionCount=async()=>{
      const stored=await getImportedData();
      const sourceRows=stored?.rows||[];
      const matchingRows=getMatchingRows(sourceRows);
      const allExampleRows=sourceRows.filter(row=>text(row[8])&&text(row[9]));
      const matchingPairCount=new Set(matchingRows.map(row=>`${text(row[3]).toLowerCase()}\\t${text(row[6])}`)).size;
      const totalPairCount=new Set(allExampleRows.map(row=>`${text(row[3]).toLowerCase()}\\t${text(row[6])}`)).size;
      practiceButton.dataset.questionCount=String(matchingRows.length);
      practiceButton.dataset.pairCount=String(matchingPairCount);
      const renderFiveDigitCount=(element,value)=>{
        const number=Math.min(99999,Math.max(0,Math.trunc(Number(value)||0)));
        const digits=String(number);
        const padding='0'.repeat(5-digits.length);
        element.innerHTML=`<span class="count-padding">${padding}</span><span class="count-value">${digits}</span>`;
      };
      renderFiveDigitCount(wordCount,matchingPairCount);
      renderFiveDigitCount(exampleCount,matchingRows.length);
      renderFiveDigitCount(homeWordCount,totalPairCount);
      renderFiveDigitCount(homeExampleCount,allExampleRows.length);
      const importedName=stored?.fileName||'未読込';
      homeImportFileName.textContent=importedName;
      homeImportFileName.title=importedName;
    };
    const syncSubgroupAll=group=>{
      if(!group)return;
      const choices=[...group.querySelectorAll('.choice')];
      group.querySelector('.all')?.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
    };
    const syncGlobalControls=()=>{
      const selectedCount=allFilterChoices.filter(choice=>choice.classList.contains('selected')).length;
      selectAllFilters.classList.toggle('selected',selectedCount===allFilterChoices.length);
      const emptyConditions=filterSections.map((section,index)=>section.querySelector('.choice.selected')?null:index+1).filter(Boolean);
      const hasEmptyConditions=emptyConditions.length>0;
      overallFilterWarning.textContent=hasEmptyConditions?`条件${emptyConditions.join(',')}の項目がひとつも選択されていません`:'';
      overallFilterWarning.hidden=!hasEmptyConditions;
      practiceButton.disabled=false;
      practiceButton.setAttribute('aria-disabled','false');
    };
    const syncSectionControls=(section,syncGlobal=true)=>{
      if(!section)return;
      const choices=[...section.querySelectorAll('.choice')];
      const selectedCount=choices.filter(choice=>choice.classList.contains('selected')).length;
      section.querySelector('[data-section-action="select"]')?.classList.toggle('selected',choices.length>0&&selectedCount===choices.length);
      const warning=section.querySelector('.filter-warning');
      if(warning)warning.hidden=selectedCount>0;
      if(syncGlobal)syncGlobalControls();
    };
    [...levelChoices,...partChoices,...understandingChoices].forEach(button=>button.addEventListener('click',()=>{
      button.classList.toggle('selected');
      syncSubgroupAll(button.closest('.group'));
      syncSectionControls(button.closest('.filter-section'));
      refreshQuestionCount();
    }));
    subgroupAllButtons.forEach(button=>button.addEventListener('click',()=>{
      const group=button.closest('.group');
      const select=!button.classList.contains('selected');
      group.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      button.classList.toggle('selected',select);
      syncSectionControls(group.closest('.filter-section'));
      refreshQuestionCount();
    }));
    const setSectionFilters=(section,selected)=>{
      section.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',selected));
      section.querySelectorAll('.group .all').forEach(button=>button.classList.toggle('selected',selected));
      syncSectionControls(section);
      refreshQuestionCount();
    };
    const setAllFilters=selected=>{
      allFilterChoices.forEach(choice=>choice.classList.toggle('selected',selected));
      subgroupAllButtons.forEach(button=>button.classList.toggle('selected',selected));
      filterSections.forEach(section=>syncSectionControls(section,false));
      syncGlobalControls();
      refreshQuestionCount();
    };
    filterSections.forEach(section=>{
      const button=section.querySelector('[data-section-action="select"]');
      button.addEventListener('click',()=>setSectionFilters(section,!button.classList.contains('selected')));
    });
    selectAllFilters.addEventListener('click',()=>setAllFilters(!selectAllFilters.classList.contains('selected')));
    setAllFilters(true);
    const closeHelp=()=>{
      helpOverlay.hidden=true;
      helpButton.classList.remove('active');
    };
    helpButton.addEventListener('click',()=>{
      helpOverlay.hidden=false;
      helpButton.classList.add('active');
      helpClose.focus();
    });
    helpClose.addEventListener('click',closeHelp);
    helpOverlay.addEventListener('click',event=>{if(event.target===helpOverlay)closeHelp();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!helpOverlay.hidden)closeHelp();});
    document.querySelectorAll('[data-coming]').forEach(button=>button.addEventListener('click',()=>alert('この機能は次の段階で追加します。')));
    const practiceOrderTab=document.getElementById('practiceOrderTab');
    const practiceOrderLabel=document.getElementById('practiceOrderLabel');
    const questionLimit=document.getElementById('questionLimit');
    const questionPicker=document.getElementById('questionPicker');
    const questionMenu=document.getElementById('questionMenu');
    const questionLimitValue=document.getElementById('questionLimitValue');
    const setOrder=random=>{
      practiceOrderTab.classList.toggle('random',random);
      practiceOrderTab.classList.toggle('active',random);
      practiceOrderTab.setAttribute('aria-pressed',String(random));
      practiceOrderLabel.textContent='順序';
      practiceOrderTab.setAttribute('aria-label',random?'順序：ランダム':'順序：番号順');
      practiceButton.dataset.order=random?'random':'number';
    };
    practiceOrderTab.addEventListener('click',()=>{
      setOrder(!practiceOrderTab.classList.contains('random'));
      applyPracticeMethodChange();
    });
    const questionValues=['all',...Array.from({length:20},(_,index)=>String((index+1)*5))];
    const questionLabels=value=>value==='all'?'すべて':value;
    let selectedQuestionLimit='all';
    const centerQuestionOption=(option,behavior='auto')=>{
      if(!option)return;
      const top=option.offsetTop-(questionMenu.clientHeight-option.offsetHeight)/2;
      questionMenu.scrollTo({top:Math.max(0,top),behavior});
    };
    const selectQuestionLimit=value=>{
      if(selectedQuestionLimit===value)return;
      selectedQuestionLimit=value;
      questionLimitValue.textContent=questionLabels(value);
      practiceButton.dataset.questionLimit=value;
      questionMenu.querySelectorAll('.question-option').forEach(item=>{
        const selected=item.dataset.value===value;
        item.classList.toggle('selected',selected);
        item.setAttribute('aria-selected',String(selected));
      });
      applyPracticeMethodChange();
    };
    questionValues.forEach(value=>{
      const option=document.createElement('button');
      option.type='button';
      option.className='question-option'+(value==='all'?' selected':'');
      option.setAttribute('role','option');
      option.setAttribute('aria-selected',String(value==='all'));
      option.dataset.value=value;
      option.textContent=questionLabels(value);
      option.addEventListener('click',event=>{
        event.stopPropagation();
        selectQuestionLimit(value);
        centerQuestionOption(option,'smooth');
      });
      questionMenu.appendChild(option);
    });
    let questionScrollTimer=0;
    questionMenu.addEventListener('scroll',()=>{
      clearTimeout(questionScrollTimer);
      questionScrollTimer=setTimeout(()=>{
        const center=questionMenu.scrollTop+questionMenu.clientHeight/2;
        const options=[...questionMenu.querySelectorAll('.question-option')];
        const nearest=options.reduce((best,item)=>Math.abs(item.offsetTop+item.offsetHeight/2-center)<Math.abs(best.offsetTop+best.offsetHeight/2-center)?item:best,options[0]);
        selectQuestionLimit(nearest.dataset.value);
        centerQuestionOption(nearest,'smooth');
      },110);
    },{passive:true});
    questionLimit.addEventListener('click',()=>{
      const opening=questionMenu.hidden;
      questionMenu.hidden=!opening;
      questionLimit.setAttribute('aria-expanded',String(opening));
      if(opening)requestAnimationFrame(()=>centerQuestionOption(questionMenu.querySelector('.selected')));
    });
    document.addEventListener('pointerdown',event=>{
      if(!questionPicker.contains(event.target)){
        questionMenu.hidden=true;
        questionLimit.setAttribute('aria-expanded','false');
      }
    });
    setOrder(false);
    practiceButton.dataset.questionLimit=selectedQuestionLimit;

    let practiceRows=[];
    let practiceIndex=0;
    let practiceStored=null;
    let answerVisible=false;
    const applyPracticeMethodChange=()=>{
      if(practiceScreen.hidden||!practiceStored)return;
      let rows=getMatchingRows(practiceStored.rows||[]);
      if(practiceButton.dataset.order==='random')rows=shuffleRows(rows);
      const limit=practiceButton.dataset.questionLimit==='all'?rows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=rows.slice(0,limit);
      practiceIndex=0;
      renderPracticeQuestion();
      renderPracticeList();
      if(autoPlaying)restartAutoPlayback();
    };
    const currentPracticeRow=()=>practiceRows[practiceIndex];
    const setAnswerVisible=visible=>{
      answerVisible=visible;
      practiceReveal.hidden=visible;
      practiceEnglish.hidden=!visible;
      practiceAudio.disabled=!('speechSynthesis' in window);
    };
    const syncPracticeRating=row=>{
      const value=text(row?.[13])||'未登録';
      practiceRatingButtons.forEach(button=>button.classList.toggle('selected',button.dataset.value===value));
    };
    const formatPracticeNumber=(value,digits)=>{
      const raw=text(value);
      return /^\d+$/.test(raw)?raw.padStart(digits,'0'):raw||'—';
    };
    const renderPracticeQuestion=()=>{
      const row=currentPracticeRow();
      if(!row)return;
      if('speechSynthesis' in window&&!autoPlaying)speechSynthesis.cancel();
      clearSentenceSpeaking();
      practiceJapaneseAudio.disabled=!('speechSynthesis' in window);
      practiceProgress.textContent=`${practiceIndex+1} / ${practiceRows.length}`;
      practiceJapanese.textContent=text(row[8]);
      practiceEnglish.textContent=text(row[9]);
      practiceWord.textContent=text(row[3])||'—';
      practiceNumber.textContent=`No ${formatPracticeNumber(row[1],5)}-${formatPracticeNumber(row[2],2)}`;
      const part=text(row[6])||'—';
      const rank=text(row[0]).toUpperCase();
      const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
      practicePart.textContent=part;
      practicePart.className=`practice-meta-chip ${rankTone}`.trim();
      practiceLevels.replaceChildren();
      const levels=[text(row[11]),text(row[12])].filter(Boolean);
      if(!levels.length){
        const empty=document.createElement('span');
        empty.className='practice-meta-chip';
        empty.textContent='—';
        practiceLevels.append(empty);
      }else{
        levels.forEach(level=>{
          const chip=document.createElement('span');
          const digit=level.match(/[123]$/)?.[0];
          chip.className=`practice-meta-chip ${digit==='1'?'red':digit==='2'?'orange':'yellow'}`;
          chip.textContent=level.toUpperCase();
          practiceLevels.append(chip);
        });
      }
      practicePronUs.textContent=text(row[4])||'—';
      practicePronUk.textContent=text(row[5])||'—';
      practiceMeaning.textContent=text(row[7])||'意味未登録';
      practicePronUsAudio.disabled=!('speechSynthesis' in window);
      practicePronUkAudio.disabled=!('speechSynthesis' in window);
      const note=text(row[10]);
      practiceNote.textContent=note;
      practiceNote.closest('.practice-note-row').classList.toggle('is-empty',!note);
      syncPracticeRating(row);
      setAnswerVisible(false);
    };
    const renderPracticeList=()=>{
      practiceList.replaceChildren();
      if(!practiceRows.length){
        const empty=document.createElement('div');
        empty.className='practice-list-empty';
        const title=document.createElement('strong');title.textContent='表示できるカードがありません';
        const detail=document.createElement('span');detail.textContent='「＋」から登録済みの単語に文を追加できます';
        empty.append(title,detail);practiceList.append(empty);return;
      }
      practiceRows.forEach((row,index)=>{
        const item=document.createElement('div');
        item.className='practice-list-row';
        item.tabIndex=0;
        item.setAttribute('role','button');
        item.setAttribute('aria-label',`${index+1}問目 ${text(row[3])||'単語未登録'}から再生`);
        item.setAttribute('aria-current',String(index===practiceIndex));

        const copy=document.createElement('span');
        copy.className='practice-list-copy';
        const heading=document.createElement('span');
        heading.className='practice-list-title';
        const number=document.createElement('b');
        number.textContent=`${formatPracticeNumber(row[1],5)}-${formatPracticeNumber(row[2],2)}`;
        const separator=document.createElement('span');
        separator.textContent='—';
        const word=document.createElement('strong');
        word.textContent=text(row[3])||'単語未登録';
        heading.append(number,separator,word);

        const japanese=document.createElement('span');
        japanese.className='practice-list-japanese';
        japanese.textContent=text(row[8])||text(row[7])||'日本語未登録';
        copy.append(heading,japanese);

        const rowActions=document.createElement('span');
        rowActions.className='practice-list-actions';
        const menuButton=document.createElement('button');
        menuButton.type='button';
        menuButton.className='practice-list-menu';
        menuButton.textContent='•••';
        menuButton.setAttribute('aria-label',`${text(row[3])||'単語未登録'}のカードを編集または削除`);
        const openButton=document.createElement('button');
        openButton.type='button';
        openButton.className='practice-list-open';
        openButton.setAttribute('aria-label',`${index+1}問目 ${text(row[3])||'単語未登録'}をカードで開く`);
        const chevron=document.createElementNS('http://www.w3.org/2000/svg','svg');
        chevron.setAttribute('class','practice-list-chevron');
        chevron.setAttribute('viewBox','0 0 24 24');
        chevron.setAttribute('aria-hidden','true');
        const path=document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d','m9 5 7 7-7 7');
        chevron.append(path);
        openButton.append(chevron);

        rowActions.append(menuButton,openButton);
        item.append(copy,rowActions);
        const playFromItem=()=>{
          practiceIndex=index;
          renderPracticeQuestion();
          renderPracticeList();
          autoPlaying?restartAutoPlayback():startAutoPlayback();
        };
        item.addEventListener('click',playFromItem);
        item.addEventListener('keydown',event=>{
          if(event.key!=='Enter'&&event.key!==' ')return;
          event.preventDefault();
          playFromItem();
        });
        openButton.addEventListener('click',event=>{
          event.stopPropagation();
          openPracticeCard(index);
        });
        menuButton.addEventListener('click',event=>{
          event.stopPropagation();
          openCardActions(row);
        });
        practiceList.append(item);
      });
      if(practiceViewMode==='list'){
        requestAnimationFrame(()=>{
          practiceList.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'});
        });
      }
    };
    const vocabularyKey=row=>`${text(row?.[3]).toLowerCase()}\t${text(row?.[6])}`;
    const getVocabularyRows=()=>{
      const source=practiceStored?.vocabularyRows?.length?practiceStored.vocabularyRows:(practiceStored?.rows||[]);
      const unique=new Map();
      source.forEach(row=>{const key=vocabularyKey(row);if(key&&!unique.has(key))unique.set(key,row)});
      return [...unique.values()].sort((a,b)=>text(a[3]).localeCompare(text(b[3]),'en'));
    };
    const persistPracticeData=async()=>{
      if(!practiceStored)return;
      if(!practiceStored.vocabularyRows?.length)practiceStored.vocabularyRows=(practiceStored.rows||[]).map(row=>[...row]);
      practiceStored.modified=true;
      await saveImportedData(practiceStored);
      await refreshQuestionCount();
    };
    let cardActionRow=null;
    let cardEditorMode='add';
    let cardEditorRow=null;
    let selectedVocabularyRow=null;
    const closeCardActions=()=>{cardActionsOverlay.hidden=true;cardActionRow=null};
    const openCardActions=row=>{
      if(autoPlaying)stopAutoPlayback();
      cardActionRow=row;
      cardActionsWord.textContent=text(row[3])||'—';
      cardActionsNumber.textContent=`No ${formatPracticeNumber(row[1],5)}-${formatPracticeNumber(row[2],2)}`;
      cardActionsOverlay.hidden=false;
    };
    const renderWordResults=()=>{
      const query=text(cardWordSearch.value).toLowerCase();
      cardWordResults.replaceChildren();
      if(cardEditorMode==='edit'||selectedVocabularyRow){cardWordResults.hidden=true;return}
      const matches=getVocabularyRows().filter(row=>!query||text(row[3]).toLowerCase().includes(query)||text(row[7]).includes(query)).slice(0,80);
      matches.forEach(row=>{
        const button=document.createElement('button');
        button.type='button';button.className='card-word-option';button.setAttribute('role','option');
        const name=document.createElement('strong');name.textContent=text(row[3])||'—';
        const detail=document.createElement('span');detail.textContent=`${text(row[6])||'品詞未登録'}　${text(row[7])||'意味未登録'}`;
        button.append(name,detail);
        button.addEventListener('click',()=>{
          selectedVocabularyRow=row;
          cardWordSearch.value=text(row[3]);cardWordSearch.disabled=true;
          cardSelectedWord.textContent=`${text(row[6])||'品詞未登録'}　${text(row[7])||'意味未登録'}`;
          cardSelectedWord.hidden=false;cardWordResults.hidden=true;
        });
        cardWordResults.append(button);
      });
      const empty=document.createElement('p');empty.className='card-word-empty';empty.textContent=query?'該当する登録済み単語がありません':'登録済み単語がありません';
      if(!matches.length)cardWordResults.append(empty);
      cardWordResults.hidden=false;
    };
    const openCardEditor=(mode,row=null)=>{
      if(autoPlaying)stopAutoPlayback();
      cardEditorMode=mode;cardEditorRow=row;selectedVocabularyRow=mode==='edit'?row:null;
      cardEditorTitle.textContent=mode==='edit'?'カードを編集':'カードを追加';
      cardWordSearch.value=mode==='edit'?text(row[3]):'';cardWordSearch.disabled=mode==='edit';
      cardSelectedWord.textContent=mode==='edit'?`${text(row[6])||'品詞未登録'}　${text(row[7])||'意味未登録'}`:'';
      cardSelectedWord.hidden=mode!=='edit';
      cardJapaneseInput.value=mode==='edit'?text(row[8]):'';
      cardEnglishInput.value=mode==='edit'?text(row[9]):'';
      cardWordResults.replaceChildren();cardWordResults.hidden=mode==='edit';
      cardEditorOverlay.hidden=false;
      if(mode==='add')requestAnimationFrame(()=>{cardWordSearch.focus();renderWordResults()});
      else requestAnimationFrame(()=>cardJapaneseInput.focus());
    };
    const closeCardEditor=()=>{cardEditorOverlay.hidden=true;cardEditorRow=null;selectedVocabularyRow=null};
    const refreshPracticeAfterMutation=()=>{
      practiceRows=getMatchingRows(practiceStored?.rows||[]);
      const limit=practiceButton.dataset.questionLimit==='all'?practiceRows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=practiceRows.slice(0,limit);
      practiceIndex=Math.max(0,Math.min(practiceIndex,practiceRows.length-1));
      renderPracticeList();
      if(practiceRows.length)renderPracticeQuestion();
    };
    practiceCardAdd.addEventListener('click',()=>openCardEditor('add'));
    cardWordSearch.addEventListener('input',()=>{if(!cardWordSearch.disabled)renderWordResults()});
    cardEditorCancel.addEventListener('click',closeCardEditor);
    cardEditorOverlay.addEventListener('click',event=>{if(event.target===cardEditorOverlay)closeCardEditor()});
    cardEditorSave.addEventListener('click',async()=>{
      const japanese=text(cardJapaneseInput.value),english=text(cardEnglishInput.value);
      if(!selectedVocabularyRow){alert('登録済みの単語を選択してください。');return}
      if(!japanese||!english){alert('日本語文と英文を両方入力してください。');return}
      cardEditorSave.disabled=true;
      try{
        if(cardEditorMode==='edit'){
          cardEditorRow[8]=japanese;cardEditorRow[9]=english;
        }else{
          const newRow=[...selectedVocabularyRow];
          const sameNumber=(practiceStored.rows||[]).filter(row=>text(row[1])===text(newRow[1]));
          const nextSub=Math.max(0,...sameNumber.map(row=>Number.parseInt(text(row[2]),10)||0))+1;
          newRow[2]=String(nextSub);newRow[8]=japanese;newRow[9]=english;newRow[13]='';newRow[14]='';
          practiceStored.rows.push(newRow);
        }
        await persistPracticeData();refreshPracticeAfterMutation();closeCardEditor();
      }catch{alert('カードを保存できませんでした。')}
      finally{cardEditorSave.disabled=false}
    });
    cardActionCancel.addEventListener('click',closeCardActions);
    cardActionsOverlay.addEventListener('click',event=>{if(event.target===cardActionsOverlay)closeCardActions()});
    cardActionEdit.addEventListener('click',()=>{const row=cardActionRow;closeCardActions();if(row)openCardEditor('edit',row)});
    cardActionDelete.addEventListener('click',async()=>{
      const row=cardActionRow;if(!row)return;
      closeCardActions();
      if(!confirm(`「${text(row[3])}」のこのカードを削除しますか？\n\n単語データは削除されません。`))return;
      const index=practiceStored.rows.indexOf(row);if(index<0)return;
      const hasAnotherCard=practiceStored.rows.some((candidate,candidateIndex)=>candidateIndex!==index&&vocabularyKey(candidate)===vocabularyKey(row)&&text(candidate[8])&&text(candidate[9]));
      const backup=[...row];
      if(hasAnotherCard)practiceStored.rows.splice(index,1);
      else{row[8]='';row[9]='';row[13]=''}
      try{await persistPracticeData();refreshPracticeAfterMutation()}
      catch{
        if(hasAnotherCard)practiceStored.rows.splice(index,0,row);
        else backup.forEach((value,column)=>{row[column]=value});
        alert('カードを削除できませんでした。');
      }
    });
    let practiceMoving=false;
    const animatePracticeCard=async(keyframes,options)=>{
      if(!practiceExerciseCard.animate)return;
      try{await practiceExerciseCard.animate(keyframes,options).finished}catch{}
    };
    const resetPracticeDrag=()=>{practiceExerciseCard.style.transform='';practiceExerciseCard.style.opacity=''};
    const movePractice=async(delta,fromX=0)=>{
      const next=Math.max(0,Math.min(practiceRows.length-1,practiceIndex+delta));
      if(next===practiceIndex||practiceMoving){
        await animatePracticeCard([{transform:`translateX(${fromX}px)`},{transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'});
        resetPracticeDrag();return;
      }
      const resumePlayback=autoPlaying;
      if(resumePlayback){
        playbackRun+=1;
        if('speechSynthesis' in window)speechSynthesis.cancel();
      }
      practiceMoving=true;
      const distance=Math.max(innerWidth*.82,300);
      const outX=delta>0?-distance:distance;
      resetPracticeDrag();
      await animatePracticeCard([{transform:`translateX(${fromX}px)`,opacity:Math.max(.55,1-Math.abs(fromX)/innerWidth*.55)},{transform:`translateX(${outX}px)`,opacity:.08}],{duration:Math.max(120,210-Math.min(Math.abs(fromX),140)),easing:'cubic-bezier(.4,0,1,1)'});
      practiceIndex=next;renderPracticeQuestion();
      await animatePracticeCard([{transform:`translateX(${-outX}px)`,opacity:.08},{transform:'translateX(0)',opacity:1}],{duration:260,easing:'cubic-bezier(.16,.78,.24,1)'});
      resetPracticeDrag();practiceMoving=false;
      if(resumePlayback)restartAutoPlayback();
    };
    const shuffleRows=rows=>{
      const result=[...rows];
      for(let index=result.length-1;index>0;index--){
        const target=Math.floor(Math.random()*(index+1));
        [result[index],result[target]]=[result[target],result[index]];
      }
      return result;
    };
    let screenTransitionBusy=false;
    const wait=duration=>new Promise(resolve=>setTimeout(resolve,duration));
    const transitionScreen=async changeScreen=>{
      if(screenTransitionBusy)return false;
      screenTransitionBusy=true;
      screenFade.classList.add('active');
      await wait(480);
      changeScreen();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      screenFade.classList.remove('active');
      await wait(520);
      screenTransitionBusy=false;
      return true;
    };

    const PLAYBACK_STORAGE_KEY='flovo-playback-settings';
    const playbackDefaults={language:'both',repeat:'once',japanesePause:1,englishPause:1,englishRepeats:1,rate:.9};
    let playbackSettings={...playbackDefaults};
    try{playbackSettings={...playbackDefaults,...JSON.parse(localStorage.getItem(PLAYBACK_STORAGE_KEY)||'{}')}}catch{}
    const languageModes=['ja','en','both'];
    const repeatModes=['current','all','once'];
    const languageLabels={ja:'日',en:'英',both:'日・英'};
    const repeatLabels={current:'1問反復',all:'全問周回',once:'1周終了'};
    let autoPlaying=false;
    let playbackRun=0;
    const savePlaybackSettings=()=>localStorage.setItem(PLAYBACK_STORAGE_KEY,JSON.stringify(playbackSettings));
    const pauseOptions=[0,.5,1,1.5,2,3].map(value=>({value:String(value),label:value===0?'なし':value+'秒'}));
    const repeatOptions=[1,2,3,4,5].map(value=>({value:String(value),label:value+'回'}));
    const rateOptions=Array.from({length:8},(_,index)=>(.6+index*.1).toFixed(1)).map(value=>({value,label:value+'×'}));
    const practiceSettingSpecs=[
      {trigger:japanesePauseSetting,menu:japanesePauseMenu,key:'japanesePause',options:pauseOptions},
      {trigger:englishPauseSetting,menu:englishPauseMenu,key:'englishPause',options:pauseOptions},
      {trigger:englishRepeatSetting,menu:englishRepeatMenu,key:'englishRepeats',options:repeatOptions},
      {trigger:speechRateSetting,menu:speechRateMenu,key:'rate',options:rateOptions}
    ];
    const closePracticeSettingMenus=except=>practiceSettingSpecs.forEach(spec=>{
      if(spec===except)return;
      spec.menu.hidden=true;
      spec.trigger.setAttribute('aria-expanded','false');
    });
    const syncPracticeSettingPickers=()=>practiceSettingSpecs.forEach(spec=>{
      const value=String(playbackSettings[spec.key]);
      const option=spec.options.find(item=>Number(item.value)===Number(value))||spec.options[0];
      spec.trigger.value=option.value;
      spec.trigger.querySelector('.practice-setting-value').textContent=option.label;
      spec.menu.querySelectorAll('.practice-setting-option').forEach(item=>{
        const selected=Number(item.dataset.value)===Number(option.value);
        item.classList.toggle('selected',selected);
        item.setAttribute('aria-selected',String(selected));
      });
    });
    const centerPracticeSettingOption=(spec,option,behavior='auto')=>{
      if(!option)return;
      const top=option.offsetTop-(spec.menu.clientHeight-option.offsetHeight)/2;
      spec.menu.scrollTo({top:Math.max(0,top),behavior});
    };
    const selectPracticeSettingOption=(spec,option)=>{
      if(!option)return;
      const value=Number(option.dataset.value);
      if(Number(playbackSettings[spec.key])!==value){
        playbackSettings[spec.key]=value;
        savePlaybackSettings();
        syncPracticeSettingPickers();
      }
    };
    practiceSettingSpecs.forEach(spec=>{
      spec.options.forEach(item=>{
        const option=document.createElement('button');
        option.type='button';
        option.className='practice-setting-option';
        option.dataset.value=item.value;
        option.setAttribute('role','option');
        option.textContent=item.label;
        option.addEventListener('click',event=>{
          event.stopPropagation();
          selectPracticeSettingOption(spec,option);
          centerPracticeSettingOption(spec,option,'smooth');
        });
        spec.menu.appendChild(option);
      });
      spec.menu.addEventListener('scroll',()=>{
        clearTimeout(spec.scrollTimer);
        spec.scrollTimer=setTimeout(()=>{
          const center=spec.menu.scrollTop+spec.menu.clientHeight/2;
          const options=[...spec.menu.querySelectorAll('.practice-setting-option')];
          const nearest=options.reduce((best,item)=>Math.abs(item.offsetTop+item.offsetHeight/2-center)<Math.abs(best.offsetTop+best.offsetHeight/2-center)?item:best,options[0]);
          selectPracticeSettingOption(spec,nearest);
          centerPracticeSettingOption(spec,nearest,'smooth');
        },110);
      },{passive:true});
      spec.trigger.addEventListener('click',event=>{
        event.stopPropagation();
        const opening=spec.menu.hidden;
        closePracticeSettingMenus(spec);
        spec.menu.hidden=!opening;
        spec.trigger.setAttribute('aria-expanded',String(opening));
        if(opening){
          spec.menu.classList.remove('open-up');
          const triggerRect=spec.trigger.getBoundingClientRect();
          const menuHeight=174;
          if(innerHeight-triggerRect.bottom<menuHeight+18&&triggerRect.top>menuHeight+18)spec.menu.classList.add('open-up');
          requestAnimationFrame(()=>centerPracticeSettingOption(spec,spec.menu.querySelector('.selected')));
        }
      });
    });
    const syncPlaybackControls=()=>{
      autoPlayTab.classList.toggle('is-playing',autoPlaying);
      autoPlayLabel.textContent=autoPlaying?'停止':'再生';
      autoPlayTab.classList.toggle('active',autoPlaying);
      autoPlayTab.classList.toggle('is-stopping',autoPlaying);
      languageModeIcon.textContent=languageLabels[playbackSettings.language];
      languageModeIcon.dataset.mode=playbackSettings.language;
      languageModeLabel.textContent='音声';
      repeatModeLabel.textContent='リピート';
      repeatModeTab.setAttribute('aria-label','リピート：'+repeatLabels[playbackSettings.repeat]);
      repeatModeTab.classList.remove('repeat-current','repeat-all','repeat-once');
      repeatModeTab.classList.add('repeat-'+playbackSettings.repeat);
      syncPracticeSettingPickers();
      autoPlayTab.disabled=!('speechSynthesis' in window);
    };
    const stopAutoPlayback=()=>{
      autoPlaying=false;
      playbackRun+=1;
      if('speechSynthesis' in window&&!autoPlaying)speechSynthesis.cancel();
      clearSentenceSpeaking();
      syncPlaybackControls();
    };
    const autoPause=(seconds,run)=>new Promise(resolve=>setTimeout(()=>resolve(run===playbackRun),Math.max(0,Number(seconds))*1000));
    const autoSpeak=(value,lang,button,run)=>new Promise(resolve=>{
      if(!autoPlaying||run!==playbackRun||!('speechSynthesis' in window)){resolve(false);return}
      const utterance=new SpeechSynthesisUtterance(value);
      utterance.lang=lang;
      utterance.rate=Number(playbackSettings.rate);
      utterance.onstart=()=>setSentenceSpeaking(button,true,false);
      utterance.onend=utterance.onerror=()=>{setSentenceSpeaking(button,false,false);resolve(run===playbackRun)};
      speechSynthesis.speak(utterance);
    });
    const runAutoPlayback=async run=>{
      while(autoPlaying&&run===playbackRun){
        const language=playbackSettings.language;
        if(language==='ja'||language==='both'){
          if(!await autoSpeak(practiceJapanese.textContent,'ja-JP',practiceJapaneseAudio,run))break;
          if(!await autoPause(playbackSettings.japanesePause,run))break;
        }
        if(language==='en'||language==='both'){
          for(let count=0;count<Number(playbackSettings.englishRepeats);count+=1){
            if(!await autoSpeak(practiceEnglish.textContent,'en-US',practiceAudio,run))break;
            if(!await autoPause(playbackSettings.englishPause,run))break;
          }
          if(!autoPlaying||run!==playbackRun)break;
        }
        if(playbackSettings.repeat==='current')continue;
        if(practiceIndex<practiceRows.length-1){
          practiceIndex+=1;
          renderPracticeQuestion();
          if(practiceViewMode==='list')renderPracticeList();
          continue;
        }
        if(playbackSettings.repeat==='all'){
          practiceIndex=0;
          renderPracticeQuestion();
          if(practiceViewMode==='list')renderPracticeList();
          continue;
        }
        stopAutoPlayback();
      }
    };
    const startAutoPlayback=()=>{
      if(autoPlaying||!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      clearSentenceSpeaking();
      autoPlaying=true;
      playbackRun+=1;
      const run=playbackRun;
      syncPlaybackControls();
      setTimeout(()=>{
        if(autoPlaying&&run===playbackRun)runAutoPlayback(run);
      },40);
    };
    const restartAutoPlayback=()=>{
      if(!autoPlaying||!('speechSynthesis' in window))return;
      playbackRun+=1;
      speechSynthesis.cancel();
      const run=playbackRun;
      syncPlaybackControls();
      runAutoPlayback(run);
    };
    syncPlaybackControls();
    let practiceViewMode='list';
    const setPracticeViewMode=mode=>{
      practiceViewMode=mode==='card'?'card':'list';
      const listMode=practiceViewMode==='list';
      if(listMode&&autoPlaying)stopAutoPlayback();
      practiceExerciseCard.hidden=listMode;
      practiceListPlaceholder.hidden=!listMode;
      practiceBackToList.hidden=listMode;
      practiceHeaderCounts.hidden=!listMode;
      practiceFilterButton.disabled=!listMode;
      practiceFilterButton.setAttribute('aria-disabled',String(!listMode));
      if(listMode){
        renderPracticeList();
        requestAnimationFrame(()=>{
          practiceList.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'});
        });
      }
    };
    setPracticeViewMode('list');
    let practiceViewTransitioning=false;
    const openPracticeCard=async index=>{
      if(practiceViewTransitioning)return;
      practiceViewTransitioning=true;
      const continuePlayback=autoPlaying;
      practiceIndex=index;
      renderPracticeQuestion();
      setPracticeViewMode('card');
      if(continuePlayback)restartAutoPlayback();
      const main=practiceScreen.querySelector('.practice-screen-main');
      main?.scrollTo({top:0});
      if(practiceExerciseCard.animate){
        try{
          await practiceExerciseCard.animate([
            {transform:'translateX(105%)',opacity:.65},
            {transform:'translateX(0)',opacity:1}
          ],{duration:380,easing:'cubic-bezier(.16,.82,.24,1)'}).finished;
        }catch{}
      }
      practiceViewTransitioning=false;
    };
    const returnToPracticeList=async()=>{
      if(practiceViewTransitioning||practiceViewMode==='list')return;
      practiceViewTransitioning=true;
      if(autoPlaying)stopAutoPlayback();
      const cardRect=practiceExerciseCard.getBoundingClientRect();
      const supportsAnimation=typeof practiceExerciseCard.animate==='function';
      if(supportsAnimation){
        Object.assign(practiceExerciseCard.style,{
          position:'fixed',
          left:`${cardRect.left}px`,
          top:`${cardRect.top}px`,
          width:`${cardRect.width}px`,
          height:`${cardRect.height}px`,
          margin:'0',
          zIndex:'95'
        });
      }
      setPracticeViewMode('list');
      if(supportsAnimation){
        practiceExerciseCard.hidden=false;
        try{
          const cardExit=practiceExerciseCard.animate([
            {transform:'translateX(0)',opacity:1},
            {transform:'translateX(105%)',opacity:.65}
          ],{duration:380,easing:'cubic-bezier(.16,.82,.24,1)',fill:'forwards'});
          const listEnter=practiceListPlaceholder.animate([
            {transform:'translateX(-28%)',opacity:.72},
            {transform:'translateX(0)',opacity:1}
          ],{duration:380,easing:'cubic-bezier(.16,.82,.24,1)'});
          await Promise.allSettled([cardExit.finished,listEnter.finished]);
          practiceExerciseCard.hidden=true;
          cardExit.cancel();
        }catch{
          practiceExerciseCard.hidden=true;
        }
        ['position','left','top','width','height','margin','z-index'].forEach(property=>practiceExerciseCard.style.removeProperty(property));
      }
      practiceViewTransitioning=false;
    };
    let practiceFilterOpen=false;
    const restoreFilterCard=()=>{
      if(filterCardHomeNext?.parentNode===filterCardHomeParent)filterCardHomeParent.insertBefore(filterCard,filterCardHomeNext);
      else filterCardHomeParent.append(filterCard);
    };
    const openPracticeFilter=()=>{
      if(practiceFilterOpen)return;
      practiceFilterOpen=true;
      if(autoPlaying)stopAutoPlayback();
      practiceFilterSheetBody.append(filterCard);
      practiceFilterOverlay.hidden=false;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        practiceFilterOverlay.classList.add('open');
        practiceFilterClose.focus({preventScroll:true});
      }));
    };
    const closePracticeFilter=async(applyFilters=true)=>{
      if(!practiceFilterOpen)return;
      practiceFilterOpen=false;
      practiceFilterOverlay.classList.remove('open');
      await wait(340);
      restoreFilterCard();
      practiceFilterOverlay.hidden=true;
      if(applyFilters){
        applyPracticeMethodChange();
        setPracticeViewMode('list');
      }
    };
    const openPractice=async()=>{
      if(screenTransitionBusy)return;
      const stored=await getImportedData();
      let rows=getMatchingRows(stored?.rows||[]);
      if(!rows.length){
        alert('選択した条件に該当する例文がありません。');
        return;
      }
      if(practiceButton.dataset.order==='random')rows=shuffleRows(rows);
      const limit=practiceButton.dataset.questionLimit==='all'?rows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=rows.slice(0,limit);
      practiceStored=stored;
      if(!practiceStored.vocabularyRows?.length)practiceStored.vocabularyRows=(practiceStored.rows||[]).map(row=>[...row]);
      practiceIndex=0;
      await transitionScreen(()=>{
        practiceScreen.hidden=false;
        mainNav.classList.add('practice-mode');
        navHome.classList.remove('active');
        renderPracticeQuestion();
        setPracticeViewMode('list');
      });
    };
    const closePractice=async()=>{
      if(screenTransitionBusy)return;
      if(practiceFilterOpen)await closePracticeFilter(false);
      stopAutoPlayback();
      practiceSettingsOverlay.hidden=true;
      await transitionScreen(()=>{
        practiceScreen.hidden=true;
        mainNav.classList.remove('practice-mode');
        navHome.classList.add('active');
      });
      refreshQuestionCount();
    };
    practiceButton.addEventListener('click',()=>openPractice().catch(()=>alert('練習画面を開けませんでした。')));
    autoPlayTab.addEventListener('click',()=>autoPlaying?stopAutoPlayback():startAutoPlayback());
    practiceBackToList.addEventListener('click',()=>returnToPracticeList());
    practiceFilterButton.addEventListener('click',openPracticeFilter);
    practiceFilterClose.addEventListener('click',()=>closePracticeFilter());
    practiceFilterOverlay.addEventListener('click',event=>{
      if(event.target===practiceFilterOverlay)closePracticeFilter();
    });
    languageModeTab.addEventListener('click',()=>{
      const index=languageModes.indexOf(playbackSettings.language);
      playbackSettings.language=languageModes[(index+1)%languageModes.length];
      savePlaybackSettings();syncPlaybackControls();
    });
    repeatModeTab.addEventListener('click',()=>{
      const index=repeatModes.indexOf(playbackSettings.repeat);
      playbackSettings.repeat=repeatModes[(index+1)%repeatModes.length];
      savePlaybackSettings();syncPlaybackControls();
    });
    practiceSettingsTab.addEventListener('click',()=>{syncPlaybackControls();closePracticeSettingMenus();practiceSettingsOverlay.hidden=false});
    practiceSettingsClose.addEventListener('click',()=>{closePracticeSettingMenus();practiceSettingsOverlay.hidden=true});
    practiceSettingsOverlay.addEventListener('click',event=>{
      closePracticeSettingMenus();
      if(event.target===practiceSettingsOverlay)practiceSettingsOverlay.hidden=true;
    });
    navHome.addEventListener('click',()=>{if(!practiceScreen.hidden)closePractice()});
    practiceReveal.addEventListener('click',()=>setAnswerVisible(true));
    practiceEnglish.addEventListener('click',()=>setAnswerVisible(false));
    let practiceSwipeStart=null;
    practiceExerciseCard.addEventListener('pointerdown',event=>{
      if(practiceMoving||(event.pointerType==='mouse'&&event.button!==0)||event.target.closest('button'))return;
      practiceSwipeStart={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),horizontal:false};
      practiceExerciseCard.setPointerCapture?.(event.pointerId);
    });
    practiceExerciseCard.addEventListener('pointermove',event=>{
      if(!practiceSwipeStart||practiceSwipeStart.id!==event.pointerId)return;
      const dx=event.clientX-practiceSwipeStart.x,dy=event.clientY-practiceSwipeStart.y;
      if(!practiceSwipeStart.horizontal&&Math.abs(dx)>9&&Math.abs(dx)>Math.abs(dy)*1.08)practiceSwipeStart.horizontal=true;
      if(!practiceSwipeStart.horizontal)return;
      const atEdge=(practiceIndex===0&&dx>0)||(practiceIndex===practiceRows.length-1&&dx<0);
      const dragX=dx*(atEdge?.34:1);
      practiceExerciseCard.style.transform=`translateX(${dragX}px)`;
      practiceExerciseCard.style.opacity=String(Math.max(.62,1-Math.abs(dragX)/innerWidth*.5));
    });
    practiceExerciseCard.addEventListener('pointerup',event=>{
      if(!practiceSwipeStart||practiceSwipeStart.id!==event.pointerId)return;
      const start=practiceSwipeStart;practiceSwipeStart=null;
      const dx=event.clientX-start.x,elapsed=Math.max(1,performance.now()-start.time),velocity=dx/elapsed;
      if(start.horizontal&&(Math.abs(dx)>=innerWidth*.18||Math.abs(velocity)>.45))movePractice(dx<0?1:-1,dx);
      else animatePracticeCard([{transform:`translateX(${dx}px)`,opacity:practiceExerciseCard.style.opacity||1},{transform:'translateX(0)',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'}).finally(resetPracticeDrag);
    });
    practiceExerciseCard.addEventListener('pointercancel',()=>{
      practiceSwipeStart=null;
      animatePracticeCard([{transform:practiceExerciseCard.style.transform||'translateX(0)'},{transform:'translateX(0)'}],{duration:180,easing:'ease-out'}).finally(resetPracticeDrag);
    });
    const speakPracticeWord=(lang,button)=>{
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(practiceWord.textContent);
      utterance.lang=lang;
      utterance.rate=.82;
      utterance.onstart=()=>button.classList.add('speaking');
      utterance.onend=utterance.onerror=()=>button.classList.remove('speaking');
      speechSynthesis.speak(utterance);
    };
    practicePronUsAudio.addEventListener('click',()=>speakPracticeWord('en-US',practicePronUsAudio));
    practicePronUkAudio.addEventListener('click',()=>speakPracticeWord('en-GB',practicePronUkAudio));
    practiceJapaneseAudio.addEventListener('click',()=>{
      if(autoPlaying)stopAutoPlayback();
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(practiceJapanese.textContent);
      utterance.lang='ja-JP';
      utterance.rate=Number(playbackSettings.rate);
      utterance.onstart=()=>setSentenceSpeaking(practiceJapaneseAudio,true);
      utterance.onend=utterance.onerror=()=>setSentenceSpeaking(practiceJapaneseAudio,false);
      speechSynthesis.speak(utterance);
    });
    practiceAudio.addEventListener('click',()=>{
      if(autoPlaying)stopAutoPlayback();
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(practiceEnglish.textContent);
      utterance.lang='en-US';
      utterance.rate=Number(playbackSettings.rate);
      utterance.onstart=()=>setSentenceSpeaking(practiceAudio,true);
      utterance.onend=utterance.onerror=()=>setSentenceSpeaking(practiceAudio,false);
      speechSynthesis.speak(utterance);
    });
    const stopSentencePlayback=()=>{
      if(autoPlaying)stopAutoPlayback();
      else{
        if('speechSynthesis' in window)speechSynthesis.cancel();
        clearSentenceSpeaking();
      }
    };
    practiceJapaneseStop.addEventListener('click',stopSentencePlayback);
    practiceEnglishStop.addEventListener('click',stopSentencePlayback);
    practiceRatingButtons.forEach(button=>button.addEventListener('click',async()=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored)return;
      row[13]=text(row[13])===button.dataset.value?'':button.dataset.value;
      practiceStored.modified=true;
      syncPracticeRating(row);
      renderPracticeList();
      await saveImportedData(practiceStored);
    }));
    document.addEventListener('keydown',event=>{
      if(practiceScreen.hidden)return;
      if(event.key==='Escape'&&practiceFilterOpen){closePracticeFilter();return}
      if(practiceViewMode==='list')return;
      if(event.key==='ArrowLeft')movePractice(-1);
      if(event.key==='ArrowRight')movePractice(1);
      if(event.key==='Escape')closePractice();
    });

    if('serviceWorker' in navigator){
      let reloading=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(reloading)return;
        reloading=true;
        location.reload();
      });
      window.addEventListener('load',async()=>{
        const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
        registration.update();
      });
    }
