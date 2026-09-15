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
        await saveImportedData({headers,rows,fileName:file.name,fileBytes,modified:false,importedAt:new Date().toISOString()});
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
    const subgroupAllButtons=[...document.querySelectorAll('.group .all')];
    const levelChoices=[...document.querySelectorAll('.level-group .choice')];
    const partChoices=[...document.querySelectorAll('.part-group .choice')];
    const understandingChoices=[...document.querySelectorAll('.understanding .choice')];
    const allFilterChoices=[...levelChoices,...partChoices,...understandingChoices];
    const selectAllFilters=document.getElementById('selectAllFilters');
    const overallFilterWarning=document.getElementById('overallFilterWarning');
    levelChoices.forEach(button=>button.classList.add(button.textContent.trim().endsWith('1')?'red':button.textContent.trim().endsWith('2')?'orange':'yellow'));
    document.querySelectorAll('.part-group').forEach(group=>{
      const rank=group.querySelector('.group-title span')?.textContent.trim().slice(-1);
      const tone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank];
      if(tone)group.querySelectorAll('.choice').forEach(button=>button.classList.add(tone));
    });
    const understandingTones={'未登録':'purple','0%':'red','50%':'orange','80%':'yellow','100%':'green'};
    understandingChoices.forEach(button=>button.classList.add(understandingTones[button.textContent.trim()]));
    const selectedValues=buttons=>new Set(buttons.filter(button=>button.classList.contains('selected')).map(button=>button.dataset.value||button.textContent.trim()));
    const refreshQuestionCount=async()=>{
      const stored=await getImportedData();
      const rows=stored?.rows||[];
      const levels=selectedValues(levelChoices);
      const parts=selectedValues(partChoices);
      const understandings=selectedValues(understandingChoices);
      const matchingRows=rows.filter(row=>{
        if(!text(row[8])||!text(row[9]))return false;
        if(!levels.size||![text(row[11]),text(row[12])].some(value=>levels.has(value)))return false;
        if(!parts.size||!parts.has(text(row[6])))return false;
        const understanding=text(row[13])||'未登録';
        if(!understandings.size||!understandings.has(understanding))return false;
        return true;
      });
      const pairCount=new Set(matchingRows.map(row=>`${text(row[3]).toLowerCase()}\\t${text(row[6])}`)).size;
      practiceButton.dataset.questionCount=String(matchingRows.length);
      practiceButton.dataset.pairCount=String(pairCount);
      const renderFiveDigitCount=(element,value)=>{
        const number=Math.min(99999,Math.max(0,Math.trunc(Number(value)||0)));
        const digits=String(number);
        const padding='0'.repeat(5-digits.length);
        element.innerHTML=`<span class="count-padding">${padding}</span><span class="count-value">${digits}</span>`;
      };
      renderFiveDigitCount(wordCount,pairCount);
      renderFiveDigitCount(exampleCount,matchingRows.length);
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
      practiceButton.disabled=hasEmptyConditions;
      practiceButton.setAttribute('aria-disabled',String(hasEmptyConditions));
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
    const filterSections=[...document.querySelectorAll('.filter-section')];
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
    const orderSwitch=document.getElementById('orderSwitch');
    const questionLimit=document.getElementById('questionLimit');
    const questionPicker=document.getElementById('questionPicker');
    const questionMenu=document.getElementById('questionMenu');
    const questionLimitValue=document.getElementById('questionLimitValue');
    const orderThumb=orderSwitch.querySelector('.order-thumb');
    const setOrder=ordered=>{
      orderThumb.style.transform='';
      orderSwitch.classList.toggle('ordered',ordered);
      orderSwitch.setAttribute('aria-pressed',String(ordered));
      practiceButton.dataset.order=ordered?'ordered':'shuffle';
    };
    orderSwitch.addEventListener('click',()=>{
      setOrder(!orderSwitch.classList.contains('ordered'));
    });
    const questionValues=['all',...Array.from({length:20},(_,index)=>String((index+1)*5))];
    const questionLabels=value=>value==='all'?'すべて':value;
    let selectedQuestionLimit='all';
    questionValues.forEach(value=>{
      const option=document.createElement('button');
      option.type='button';
      option.className='question-option'+(value==='all'?' selected':'');
      option.setAttribute('role','option');
      option.setAttribute('aria-selected',String(value==='all'));
      option.dataset.value=value;
      option.textContent=questionLabels(value);
      option.addEventListener('click',()=>{
        selectedQuestionLimit=value;
        questionLimitValue.textContent=questionLabels(value);
        practiceButton.dataset.questionLimit=value;
        questionMenu.querySelectorAll('.question-option').forEach(item=>{
          const selected=item.dataset.value===value;
          item.classList.toggle('selected',selected);
          item.setAttribute('aria-selected',String(selected));
        });
        questionMenu.hidden=true;
        questionLimit.setAttribute('aria-expanded','false');
      });
      questionMenu.appendChild(option);
    });
    questionLimit.addEventListener('click',()=>{
      const opening=questionMenu.hidden;
      questionMenu.hidden=!opening;
      questionLimit.setAttribute('aria-expanded',String(opening));
    });
    document.addEventListener('pointerdown',event=>{
      if(!questionPicker.contains(event.target)){
        questionMenu.hidden=true;
        questionLimit.setAttribute('aria-expanded','false');
      }
    });
    practiceButton.dataset.order='shuffle';
    practiceButton.dataset.questionLimit=selectedQuestionLimit;
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
