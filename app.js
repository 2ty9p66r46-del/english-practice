'use strict';

// FloVo home behavior. Shared screen styles live in styles.css.
const EXPECTED_HEADERS=['単語番号','単語','発音記号US','発音記号UK','品詞番号','品詞','品詞ランク','Sレベル','Wレベル','意味番号','意味','例文番号','日本語文','英文','補足','理解度','◯回数','×回数','△回数'];
const LEGACY_HEADERS=[...EXPECTED_HEADERS.slice(0,-1),'？回数'];
const COL=Object.freeze({
  wordNo:0,word:1,pronUs:2,pronUk:3,posNo:4,pos:5,posRank:6,sLevel:7,wLevel:8,
  meaningNo:9,meaning:10,exampleNo:11,japanese:12,english:13,note:14,understanding:15,
  correctCount:16,wrongCount:17,questionCount:18
});
    const importButton=document.getElementById('importButton');
    const exportButton=document.getElementById('exportButton');
    const reloadButton=document.getElementById('reloadButton');
    const templateButton=document.getElementById('templateButton');
    const excelInput=document.getElementById('excelInput');
    const helpButton=document.getElementById('helpButton');
    const helpOverlay=document.getElementById('helpOverlay');
    const helpClose=document.getElementById('helpClose');
    const homeModules=document.querySelector('.home-modules');
    const homeModuleCards=[...document.querySelectorAll('.home-modules>.home-module-card')];
    const homeCarouselDots=[...document.querySelectorAll('.home-carousel-dots button')];
    const text=value=>String(value??'').trim();
    let homeCarouselFrame=0;
    const syncHomeCarousel=()=>{
      homeCarouselFrame=0;
      if(!homeModules||!homeModuleCards.length)return;
      const center=homeModules.scrollLeft+(homeModules.clientWidth/2);
      const activeIndex=homeModuleCards.reduce((closest,card,index)=>{
        const distance=Math.abs((card.offsetLeft+(card.offsetWidth/2))-center);
        return distance<closest.distance?{index,distance}:closest;
      },{index:0,distance:Infinity}).index;
      homeCarouselDots.forEach((dot,index)=>{
        const active=index===activeIndex;
        dot.classList.toggle('active',active);
        if(active)dot.setAttribute('aria-current','true');
        else dot.removeAttribute('aria-current');
      });
    };
    homeModules?.addEventListener('scroll',()=>{
      if(!homeCarouselFrame)homeCarouselFrame=requestAnimationFrame(syncHomeCarousel);
    },{passive:true});
    homeCarouselDots.forEach((dot,index)=>dot.addEventListener('click',()=>{
      const card=homeModuleCards[index];
      if(!card||!homeModules)return;
      const paddingLeft=parseFloat(getComputedStyle(homeModules).paddingLeft)||0;
      homeModules.scrollTo({left:card.offsetLeft-homeModules.offsetLeft-paddingLeft,behavior:'smooth'});
    }));
    window.addEventListener('resize',syncHomeCarousel,{passive:true});
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
    const headersMatch=headers=>Array.isArray(headers)&&headers.length===EXPECTED_HEADERS.length&&(
      EXPECTED_HEADERS.every((header,index)=>text(headers[index])===header)||
      LEGACY_HEADERS.every((header,index)=>text(headers[index])===header)
    );
    const getImportedData=()=>importedDataPromise||(importedDataPromise=loadImportedData().then(stored=>{
      if(!headersMatch(stored?.headers))return null;
      if(LEGACY_HEADERS.every((header,index)=>text(stored.headers[index])===header))stored.modified=true;
      stored.headers=[...EXPECTED_HEADERS];
      return stored;
    }).catch(error=>{
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
      const wordNumbers=new Map();
      const wordsByNumber=new Map();
      const posNumbers=new Map();
      const meaningsByNumber=new Map();
      const meaningNumbers=new Map();
      const exampleNumbers=new Set();
      rows.forEach((row,index)=>{
        const rowNo=index+2;
        const required=[COL.wordNo,COL.word,COL.pronUs,COL.pronUk,COL.posNo,COL.pos,COL.posRank];
        if(required.some(column=>!text(row[column])))errors.push(`${rowNo}行目：必須項目が空欄です`);
        if(!text(row[COL.sLevel])&&!text(row[COL.wLevel]))errors.push(`${rowNo}行目：Sレベル・Wレベルが両方空欄です`);
        if(text(row[COL.sLevel])&&!/^S[1-3]$/.test(text(row[COL.sLevel])))errors.push(`${rowNo}行目：Sレベルの値が不正です`);
        if(text(row[COL.wLevel])&&!/^W[1-3]$/.test(text(row[COL.wLevel])))errors.push(`${rowNo}行目：Wレベルの値が不正です`);
        const understanding=text(row[COL.understanding]);
        if(understanding&&!['0%','50%','80%','100%'].includes(understanding))errors.push(`${rowNo}行目：理解度の値が不正です`);
        [COL.correctCount,COL.wrongCount,COL.questionCount].forEach(column=>{
          const value=text(row[column]);
          if(value&&!/^\d+$/.test(value))errors.push(`${rowNo}行目：回数は0以上の整数で入力してください`);
        });

        const word=text(row[COL.word]).toLowerCase();
        const wordNo=text(row[COL.wordNo]);
        const part=text(row[COL.pos]);
        const posNo=text(row[COL.posNo]);
        const meaning=text(row[COL.meaning]);
        const meaningNo=text(row[COL.meaningNo]);
        const exampleNo=text(row[COL.exampleNo]);
        const japanese=text(row[COL.japanese]);
        const english=text(row[COL.english]);
        if(word&&wordNo){
          if(wordNumbers.has(word)&&wordNumbers.get(word)!==wordNo)errors.push(`${rowNo}行目：同じ単語が別の単語番号で定義されています`);
          else wordNumbers.set(word,wordNo);
          if(wordsByNumber.has(wordNo)&&wordsByNumber.get(wordNo)!==word)errors.push(`${rowNo}行目：同じ単語番号に別の単語があります`);
          else wordsByNumber.set(wordNo,word);
        }
        if(word&&part&&posNo){
          const key=`${word}\t${part}`;
          if(posNumbers.has(key)&&posNumbers.get(key)!==posNo)errors.push(`${rowNo}行目：同じ単語・品詞が別の品詞番号で定義されています`);
          else posNumbers.set(key,posNo);
        }
        const hasMeaningData=meaning||meaningNo;
        const hasExampleData=exampleNo||japanese||english;
        if(hasMeaningData&&(!meaning||!meaningNo))errors.push(`${rowNo}行目：意味番号と意味は両方入力してください`);
        if(hasExampleData&&(!meaning||!meaningNo||!exampleNo||!japanese||!english))errors.push(`${rowNo}行目：例文には意味番号・意味・例文番号・日本語文・英文が必要です`);
        if(word&&part&&meaning&&meaningNo){
          const pairKey=`${word}\t${part}`;
          const numberKey=`${pairKey}\t${meaningNo}`;
          const meaningKey=`${pairKey}\t${meaning}`;
          if(meaningsByNumber.has(numberKey)&&meaningsByNumber.get(numberKey)!==meaning)errors.push(`${rowNo}行目：同じ意味番号に別の意味があります`);
          else meaningsByNumber.set(numberKey,meaning);
          if(meaningNumbers.has(meaningKey)&&meaningNumbers.get(meaningKey)!==meaningNo)errors.push(`${rowNo}行目：同じ意味が別の意味番号で定義されています`);
          else meaningNumbers.set(meaningKey,meaningNo);
          if(exampleNo){
            const exampleKey=`${numberKey}\t${exampleNo}`;
            if(exampleNumbers.has(exampleKey))errors.push(`${rowNo}行目：同じ意味で例文番号が重複しています`);
            else exampleNumbers.add(exampleKey);
          }
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
    const repairLegacyFloVoExport=sourceBytes=>{
      const archive=XLSX.CFB.read(new Uint8Array(sourceBytes),{type:'array'});
      const decoder=new TextDecoder();
      const encoder=new TextEncoder();
      const parser=new DOMParser();
      let changed=false;
      (archive.FullPaths||[]).filter(path=>/\/xl\/worksheets\/sheet\d+\.xml$/i.test(path)).forEach(path=>{
        const entry=XLSX.CFB.find(archive,path)||XLSX.CFB.find(archive,path.replace(/^Root Entry\//,''));
        if(!entry?.content)return;
        const sheetXml=parser.parseFromString(decoder.decode(entry.content),'application/xml');
        if(sheetXml.querySelector('parsererror'))return;
        const namespace=sheetXml.documentElement.namespaceURI;
        const prefix=sheetXml.documentElement.prefix;
        const createElement=name=>sheetXml.createElementNS(namespace,prefix?`${prefix}:${name}`:name);
        const cells=[...sheetXml.getElementsByTagNameNS('*','c')];
        let sheetChanged=false;
        cells.forEach(cell=>{
          if(cell.getAttribute('t')!=='inlineStr')return;
          const inline=[...cell.children].find(child=>child.localName==='is');
          if(!inline)return;
          const value=[...inline.getElementsByTagNameNS('*','t')].map(item=>item.textContent||'').join('');
          inline.remove();
          cell.setAttribute('t','str');
          const stringValue=createElement('v');
          stringValue.textContent=value;
          cell.append(stringValue);
          sheetChanged=true;
        });
        if(!sheetChanged)return;
        entry.content=encoder.encode(new XMLSerializer().serializeToString(sheetXml));
        entry.size=entry.content.length;
        changed=true;
      });
      return changed?XLSX.CFB.write(archive,{type:'array',fileType:'zip',compression:true}):sourceBytes;
    };
    const writeRowsIntoOriginalWorkbook=stored=>{
      const archive=XLSX.CFB.read(new Uint8Array(stored.fileBytes),{type:'array'});
      const decoder=new TextDecoder();
      const encoder=new TextEncoder();
      const findEntry=path=>XLSX.CFB.find(archive,path)||XLSX.CFB.find(archive,`Root Entry/${path}`);
      const workbookEntry=findEntry('xl/workbook.xml');
      const relationsEntry=findEntry('xl/_rels/workbook.xml.rels');
      if(!workbookEntry||!relationsEntry)throw new Error('元のExcel構造を読み込めませんでした。');
      const parser=new DOMParser();
      const workbookXml=parser.parseFromString(decoder.decode(workbookEntry.content),'application/xml');
      const relationsXml=parser.parseFromString(decoder.decode(relationsEntry.content),'application/xml');
      const elements=(root,name)=>{
        const namespaced=[...root.getElementsByTagNameNS('*',name)];
        return namespaced.length?namespaced:[...root.getElementsByTagName('*')].filter(element=>element.localName===name||element.tagName===name);
      };
      const sheets=elements(workbookXml,'sheet');
      const selected=sheets.find(sheet=>sheet.getAttribute('name')==='単語リスト')||sheets[0];
      const relationId=selected?.getAttribute('r:id')||selected?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
      const relation=elements(relationsXml,'Relationship').find(item=>item.getAttribute('Id')===relationId);
      const target=(relation?.getAttribute('Target')||'worksheets/sheet1.xml').replace(/^\/+|^\.\.\//g,'');
      const sheetEntry=findEntry(target.startsWith('xl/')?target:`xl/${target}`);
      if(!sheetEntry)throw new Error('単語リストのExcelシートを読み込めませんでした。');
      const sheetXml=parser.parseFromString(decoder.decode(sheetEntry.content),'application/xml');
      if(sheetXml.querySelector('parsererror'))throw new Error('Excelシートの解析に失敗しました。');
      const namespace=sheetXml.documentElement.namespaceURI;
      const prefix=sheetXml.documentElement.prefix;
      const createSheetElement=name=>sheetXml.createElementNS(namespace,prefix?`${prefix}:${name}`:name);
      const sheetData=elements(sheetXml,'sheetData')[0];
      if(!sheetData)throw new Error('Excelの行データを読み込めませんでした。');
      const rowsByNumber=new Map(elements(sheetData,'row').map(row=>[Number(row.getAttribute('r')),row]));
      const values=[stored.headers,...stored.rows];
      const existingLastRow=Math.max(1,...rowsByNumber.keys());
      const lastRow=Math.max(existingLastRow,values.length);
      const numericColumns=new Set([COL.wordNo,COL.posNo,COL.meaningNo,COL.exampleNo,COL.correctCount,COL.wrongCount,COL.questionCount]);
      const formulaForCell=()=>'';
      const copyRowAttributes=(source,target,rowNumber)=>{
        if(source)[...source.attributes].forEach(attribute=>{if(attribute.name!=='r')target.setAttribute(attribute.name,attribute.value)});
        target.setAttribute('r',String(rowNumber));
      };
      const insertInOrder=(parent,node,key,getKey)=>{
        const next=[...parent.children].find(child=>getKey(child)>key);
        if(next)parent.insertBefore(node,next);else parent.append(node);
      };
      const templateRow=rowsByNumber.get(existingLastRow)||rowsByNumber.get(2)||rowsByNumber.get(1);
      for(let excelRow=1;excelRow<=lastRow;excelRow+=1){
        let rowElement=rowsByNumber.get(excelRow);
        if(!rowElement){
          rowElement=createSheetElement('row');
          copyRowAttributes(templateRow,rowElement,excelRow);
          insertInOrder(sheetData,rowElement,excelRow,item=>Number(item.getAttribute('r'))||0);
          rowsByNumber.set(excelRow,rowElement);
        }
        const rowValues=values[excelRow-1]||[];
        const cellsByColumn=new Map(elements(rowElement,'c').map(cell=>[XLSX.utils.decode_cell(cell.getAttribute('r')).c,cell]));
        for(let column=0;column<stored.headers.length;column+=1){
          const address=XLSX.utils.encode_cell({r:excelRow-1,c:column});
          let cell=cellsByColumn.get(column);
          const templateCell=templateRow?elements(templateRow,'c').find(item=>XLSX.utils.decode_cell(item.getAttribute('r')).c===column):null;
          if(!cell){
            cell=createSheetElement('c');
            cell.setAttribute('r',address);
            if(templateCell?.hasAttribute('s'))cell.setAttribute('s',templateCell.getAttribute('s'));
            insertInOrder(rowElement,cell,column,item=>XLSX.utils.decode_cell(item.getAttribute('r')).c);
          }
          const value=String(rowValues[column]??'');
          elements(cell,'f').forEach(item=>item.remove());
          const formulaText=formulaForCell(column,excelRow);
          let formula=null;
          if(formulaText){formula=createSheetElement('f');formula.textContent=formulaText;cell.prepend(formula)}
          [...cell.children].filter(child=>child.localName==='v'||child.localName==='is').forEach(child=>child.remove());
          if(formula){
            cell.setAttribute('t','str');
            const cached=createSheetElement('v');cached.textContent=value;cell.append(cached);
          }else if(value===''){
            cell.removeAttribute('t');
          }else if(numericColumns.has(column)&&/^\d+$/.test(value)){
            cell.setAttribute('t','n');
            const numeric=createSheetElement('v');numeric.textContent=value;cell.append(numeric);
          }else{
            cell.setAttribute('t','str');
            const stringValue=createSheetElement('v');stringValue.textContent=value;cell.append(stringValue);
          }
        }
      }
      const dimension=elements(sheetXml,'dimension')[0];
      if(dimension)dimension.setAttribute('ref',`A1:${XLSX.utils.encode_col(stored.headers.length-1)}${lastRow}`);
      const calcPr=elements(workbookXml,'calcPr')[0];
      if(calcPr){calcPr.setAttribute('calcMode','auto');calcPr.setAttribute('fullCalcOnLoad','1');calcPr.setAttribute('forceFullCalc','1');workbookEntry.content=encoder.encode(new XMLSerializer().serializeToString(workbookXml));workbookEntry.size=workbookEntry.content.length}
      sheetEntry.content=encoder.encode(new XMLSerializer().serializeToString(sheetXml));
      sheetEntry.size=sheetEntry.content.length;
      return XLSX.CFB.write(archive,{type:'array',fileType:'zip',compression:true});
    };
    exportButton.addEventListener('click',async()=>{
      exportButton.disabled=true;
      try{
        const stored=await getImportedData();
        if(!stored)throw new Error('書き出すデータがありません。先にExcelを読み込んでください。');
        let bytes=stored.fileBytes;
        if(!bytes||stored.modified){
          if(typeof XLSX==='undefined')throw new Error('Excel書出機能を準備できませんでした。通信状態を確認してください。');
          if(stored.fileBytes)bytes=writeRowsIntoOriginalWorkbook(stored);
          else{
            const sheet=XLSX.utils.aoa_to_sheet([stored.headers,...stored.rows]);
            const workbook=XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook,sheet,'単語リスト');
            bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array',cellStyles:true});
          }
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
    excelInput.addEventListener('change',async()=>{
      const file=excelInput.files?.[0];
      if(!file)return;
      importButton.classList.add('disabled');
      importButton.setAttribute('aria-disabled','true');
      excelInput.disabled=true;
      try{
        if(typeof XLSX==='undefined')throw new Error('Excel読込機能を準備できませんでした。通信状態を確認して、アプリを開き直してください。');
        const originalFileBytes=await file.arrayBuffer();
        const fileBytes=repairLegacyFloVoExport(originalFileBytes);
        const workbook=XLSX.read(fileBytes,{type:'array',cellFormula:true});
        const sheet=workbook.Sheets['単語リスト']||workbook.Sheets[workbook.SheetNames[0]];
        if(!sheet)throw new Error('読み込めるシートがありません。');
        const allRows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
        const importedHeaders=(allRows[0]||[]).map(text);
        const formatMatches=headersMatch(importedHeaders);
        if(!formatMatches)throw new Error('雛形と列名または列順が違います。雛形ファイルにデータを入力して読み込んでください。');
        const legacyHeaders=LEGACY_HEADERS.every((header,index)=>text(importedHeaders[index])===header);
        const headers=[...EXPECTED_HEADERS];
        const rows=allRows.slice(1).filter(row=>row.some(value=>text(value)));
        if(!rows.length)throw new Error('読み込めるデータがありません。');
        const errors=validateRows(rows);
        if(errors.length)throw new Error(`データにエラーがあります。\\n\\n${errors.slice(0,5).join('\\n')}${errors.length>5?`\\nほか${errors.length-5}件`:''}`);
        await saveImportedData({headers,rows,vocabularyRows:rows.map(row=>[...row]),fileName:file.name,fileBytes,modified:legacyHeaders,importedAt:new Date().toISOString()});
        await refreshQuestionCount();
        alert(`${rows.length}行のデータを読み込みました。`);
      }catch(error){
        alert(error?.message||'Excelの読み込みに失敗しました。');
      }finally{
        excelInput.disabled=false;
        importButton.classList.remove('disabled');
        importButton.removeAttribute('aria-disabled');
        excelInput.value='';
      }
    });
    const scroller=document.getElementById('mainScroll');
    const practiceButton=document.getElementById('practiceButton');
    const wordCount=document.getElementById('wordCount');
    const exampleCount=document.getElementById('exampleCount');
    const filterWordCount=document.getElementById('filterWordCount');
    const filterExampleCount=document.getElementById('filterExampleCount');
    const homeWordCount=document.getElementById('homeWordCount');
    const homeExampleCount=document.getElementById('homeExampleCount');
    const homeImportFileName=document.getElementById('homeImportFileName');
    const homeUnderstandingDonut=document.getElementById('homeUnderstandingDonut');
    const homeMasteryRate=document.getElementById('homeMasteryRate');
    const homeMasteredCount=document.getElementById('homeMasteredCount');
    const homeSteadyCount=document.getElementById('homeSteadyCount');
    const homeLearningCount=document.getElementById('homeLearningCount');
    const homeNewCount=document.getElementById('homeNewCount');
    const homeStatTabs=[...document.querySelectorAll('[data-home-stat]')];
    const homeStatPanels=[...document.querySelectorAll('.home-stat-panel')];
    const homeAnswerDonut=document.getElementById('homeAnswerDonut');
    const homeAnswerRate=document.getElementById('homeAnswerRate');
    const homeAnswerBar=document.getElementById('homeAnswerBar');
    const homeCorrectBar=document.getElementById('homeCorrectBar');
    const homeWrongBar=document.getElementById('homeWrongBar');
    const homeUnsureBar=document.getElementById('homeUnsureBar');
    const homeCorrectCount=document.getElementById('homeCorrectCount');
    const homeWrongCount=document.getElementById('homeWrongCount');
    const homeUnsureCount=document.getElementById('homeUnsureCount');
    const homeTotalWordCount=document.getElementById('homeTotalWordCount');
    const homeActiveWordCount=document.getElementById('homeActiveWordCount');
    const homeActiveWordBar=document.getElementById('homeActiveWordBar');
    const homeLevelStats=document.getElementById('homeLevelStats');
    const homePosStats=document.getElementById('homePosStats');
    const homeStatPanelIds={understanding:'homeUnderstandingPanel',answers:'homeAnswerPanel',words:'homeWordPanel'};
    homeStatTabs.forEach(button=>button.addEventListener('click',()=>{
      homeStatTabs.forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active))});
      homeStatPanels.forEach(panel=>{panel.hidden=panel.id!==homeStatPanelIds[button.dataset.homeStat]});
    }));
    const filterSections=[...document.querySelectorAll('#filterCard .filter-section')];
    const subgroupAllButtons=[...document.querySelectorAll('#filterCard .group .all')];
    const levelChoices=[...document.querySelectorAll('#filterCard .level-group .choice')];
    const partChoices=[...document.querySelectorAll('#filterCard .part-group .choice')];
    const understandingChoices=[...document.querySelectorAll('#filterCard .understanding .choice')];
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
    const practiceWordNumber=document.getElementById('practiceWordNumber');
    const practicePart=document.getElementById('practicePart');
    const practiceMeaningExampleNumber=document.getElementById('practiceMeaningExampleNumber');
    const practiceLevels=document.getElementById('practiceLevels');
    const practiceMeaning=document.getElementById('practiceMeaning');
    const practicePronUs=document.getElementById('practicePronUs');
    const practicePronUk=document.getElementById('practicePronUk');
    const practicePronUsAudio=document.getElementById('practicePronUsAudio');
    const practicePronUkAudio=document.getElementById('practicePronUkAudio');
    const practiceNote=document.getElementById('practiceNote');
    const practiceCardAdd=document.getElementById('practiceCardAdd');
    const practiceCardMenu=document.getElementById('practiceCardMenu');
    const cardActionsOverlay=document.getElementById('cardActionsOverlay');
    const cardActionsWord=document.getElementById('cardActionsWord');
    const cardActionsNumber=document.getElementById('cardActionsNumber');
    const cardActionEdit=document.getElementById('cardActionEdit');
    const cardActionDelete=document.getElementById('cardActionDelete');
    const cardActionCancel=document.getElementById('cardActionCancel');
    const cardEditorOverlay=document.getElementById('cardEditorOverlay');
    const cardEditorSheet=cardEditorOverlay.querySelector('.card-editor-sheet');
    const cardEditorBody=cardEditorOverlay.querySelector('.card-editor-body');
    const cardEditorHandle=cardEditorOverlay.querySelector('.practice-filter-handle');
    const cardEditorTitle=document.getElementById('cardEditorTitle');
    const cardEditorCancel=document.getElementById('cardEditorCancel');
    const cardEditorSave=document.getElementById('cardEditorSave');
    const cardWordStep=document.getElementById('cardWordStep');
    const cardWordFilterToggle=document.getElementById('cardWordFilterToggle');
    const cardWordFilterPanel=document.getElementById('cardWordFilterPanel');
    const cardWordSearchRow=document.getElementById('cardWordSearchRow');
    const cardWordSearch=document.getElementById('cardWordSearch');
    const cardWordResults=document.getElementById('cardWordResults');
    const cardSelectedWord=document.getElementById('cardSelectedWord');
    const cardSelectedWordText=document.getElementById('cardSelectedWordText');
    const cardWordReselect=document.getElementById('cardWordReselect');
    const cardWordMessage=document.getElementById('cardWordMessage');
    const cardMeaningStep=document.getElementById('cardMeaningStep');
    const cardMeaningResults=document.getElementById('cardMeaningResults');
    const cardMeaningField=document.getElementById('cardMeaningField');
    const cardMeaningNumberBadge=document.getElementById('cardMeaningNumberBadge');
    const cardMeaningInput=document.getElementById('cardMeaningInput');
    const cardMeaningConfirm=document.getElementById('cardMeaningConfirm');
    const cardMeaningMessage=document.getElementById('cardMeaningMessage');
    const cardSelectedMeaning=document.getElementById('cardSelectedMeaning');
    const cardSelectedMeaningNumber=document.getElementById('cardSelectedMeaningNumber');
    const cardSelectedMeaningText=document.getElementById('cardSelectedMeaningText');
    const cardMeaningChanged=document.getElementById('cardMeaningChanged');
    const cardMeaningEditActions=document.getElementById('cardMeaningEditActions');
    const cardMeaningKeep=document.getElementById('cardMeaningKeep');
    const cardMeaningChange=document.getElementById('cardMeaningChange');
    const cardMeaningReselect=document.getElementById('cardMeaningReselect');
    const cardExampleStep=document.getElementById('cardExampleStep');
    const cardExampleCarousel=document.getElementById('cardExampleCarousel');
    const cardFilterLevelChoices=[...cardWordFilterPanel.querySelectorAll('.level-group .choice')];
    const cardFilterPartChoices=[...cardWordFilterPanel.querySelectorAll('.part-group .choice')];
    const cardFilterUnderstandingChoices=[...cardWordFilterPanel.querySelectorAll('[data-understanding-filter]')];
    const cardFilterMeaningCountChoices=[...cardWordFilterPanel.querySelectorAll('[data-meaning-count-filter]')];
    const cardFilterSections=[...cardWordFilterPanel.querySelectorAll('[data-card-filter-section]')];
    const cardSelectAllFilters=document.getElementById('cardSelectAllFilters');
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
    const practiceFilterSheet=practiceFilterOverlay.querySelector('.practice-filter-sheet');
    const practiceFilterHandle=practiceFilterOverlay.querySelector('.practice-filter-handle');
    const practiceFilterSheetBody=document.getElementById('practiceFilterSheetBody');
    const practiceFilterCancel=document.getElementById('practiceFilterCancel');
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
    understandingChoices.forEach(button=>button.classList.add(understandingTones[button.dataset.value||button.textContent.trim()]));
    const selectedValues=buttons=>new Set(buttons.filter(button=>button.classList.contains('selected')).map(button=>button.dataset.value||button.textContent.trim()));
    const comparePracticeNumber=(a,b)=>{
      for(const column of [COL.wordNo,COL.meaningNo,COL.exampleNo]){
        const aNumber=Number.parseInt(text(a?.[column]),10);
        const bNumber=Number.parseInt(text(b?.[column]),10);
        const difference=(Number.isFinite(aNumber)?aNumber:Number.MAX_SAFE_INTEGER)-(Number.isFinite(bNumber)?bNumber:Number.MAX_SAFE_INTEGER);
        if(difference)return difference;
      }
      return 0;
    };
    const getMatchingRows=rows=>{
      const levels=selectedValues(levelChoices);
      const parts=selectedValues(partChoices);
      const understandings=selectedValues(understandingChoices);
      return rows.filter(row=>{
        if(!text(row[COL.japanese])||!text(row[COL.english]))return false;
        if(levels.size&&![text(row[COL.sLevel]),text(row[COL.wLevel])].some(value=>levels.has(value)))return false;
        if(parts.size&&!parts.has(text(row[COL.pos])))return false;
        const understanding=text(row[COL.understanding])||'未登録';
        return !understandings.size||understandings.has(understanding);
      }).sort(comparePracticeNumber);
    };
    const refreshQuestionCount=async()=>{
      const stored=await getImportedData();
      const sourceRows=stored?.rows||[];
      const matchingRows=getMatchingRows(sourceRows);
      const allExampleRows=sourceRows.filter(row=>text(row[COL.japanese])&&text(row[COL.english]));
      const matchingPairCount=new Set(matchingRows.map(row=>text(row[COL.wordNo])||text(row[COL.word]).toLowerCase())).size;
      const totalPairCount=new Set(allExampleRows.map(row=>text(row[COL.wordNo])||text(row[COL.word]).toLowerCase())).size;
      const wordKey=row=>text(row[COL.wordNo])||text(row[COL.word]).toLowerCase();
      const totalWordKeys=new Set(sourceRows.map(wordKey).filter(Boolean));
      practiceButton.dataset.questionCount=String(matchingRows.length);
      practiceButton.dataset.pairCount=String(matchingPairCount);
      const fiveDigitCountMarkup=value=>{
        const number=Math.min(99999,Math.max(0,Math.trunc(Number(value)||0)));
        const digits=String(number);
        const padding='0'.repeat(5-digits.length);
        return `<span class="count-padding">${padding}</span><span class="count-value">${digits}</span>`;
      };
      const renderFiveDigitCount=(element,value)=>{
        if(!element)return;
        element.innerHTML=fiveDigitCountMarkup(value);
      };
      const renderCountFraction=(element,value,total)=>{
        if(!element)return;
        element.innerHTML=`<span class="count-current">${fiveDigitCountMarkup(value)}</span><span class="count-separator">/</span><span class="count-total">${fiveDigitCountMarkup(total)}</span>`;
      };
      renderCountFraction(wordCount,matchingPairCount,totalPairCount);
      renderCountFraction(exampleCount,matchingRows.length,allExampleRows.length);
      renderCountFraction(filterWordCount,matchingPairCount,totalPairCount);
      renderCountFraction(filterExampleCount,matchingRows.length,allExampleRows.length);
      renderFiveDigitCount(homeWordCount,totalPairCount);
      renderFiveDigitCount(homeExampleCount,allExampleRows.length);
      const understandingCounts={mastered:0,steady:0,learning:0,new:0};
      allExampleRows.forEach(row=>{
        const value=text(row[COL.understanding]);
        if(value==='100%')understandingCounts.mastered+=1;
        else if(value==='80%')understandingCounts.steady+=1;
        else if(value==='50%')understandingCounts.learning+=1;
        else understandingCounts.new+=1;
      });
      const understandingTotal=allExampleRows.length;
      const masteryRate=understandingTotal?Math.round((understandingCounts.mastered/understandingTotal)*100):0;
      homeMasteryRate.textContent=`${masteryRate}%`;
      homeMasteredCount.textContent=String(understandingCounts.mastered);
      homeSteadyCount.textContent=String(understandingCounts.steady);
      homeLearningCount.textContent=String(understandingCounts.learning);
      homeNewCount.textContent=String(understandingCounts.new);
      if(understandingTotal){
        const tones=[['#35b972',understandingCounts.mastered],['#efd044',understandingCounts.steady],['#ef9b3a',understandingCounts.learning],['#df5b69',understandingCounts.new]];
        let cursor=0;
        const stops=tones.map(([color,count])=>{const start=cursor;cursor+=(count/understandingTotal)*100;return `${color} ${start}% ${cursor}%`});
        homeUnderstandingDonut.style.background=`conic-gradient(${stops.join(',')})`;
      }else homeUnderstandingDonut.style.background='#e9edf3';
      homeUnderstandingDonut.setAttribute('aria-label',understandingTotal?`理解度：習得${understandingCounts.mastered}件、定着${understandingCounts.steady}件、練習中${understandingCounts.learning}件、未定着${understandingCounts.new}件`:'理解度データなし');
      const sumColumn=column=>allExampleRows.reduce((sum,row)=>sum+(Number.parseInt(text(row[column]),10)||0),0);
      const correctCount=sumColumn(COL.correctCount);
      const wrongCount=sumColumn(COL.wrongCount);
      const unsureCount=sumColumn(COL.questionCount);
      const answerTotal=correctCount+wrongCount+unsureCount;
      const answerRate=answerTotal?Math.round((correctCount/answerTotal)*100):null;
      homeAnswerRate.textContent=answerRate===null?'—%':`${answerRate}%`;
      homeCorrectCount.textContent=String(correctCount);
      homeWrongCount.textContent=String(wrongCount);
      homeUnsureCount.textContent=String(unsureCount);
      homeCorrectBar.style.width=`${answerTotal?(correctCount/answerTotal)*100:0}%`;
      homeWrongBar.style.width=`${answerTotal?(wrongCount/answerTotal)*100:0}%`;
      homeUnsureBar.style.width=`${answerTotal?(unsureCount/answerTotal)*100:0}%`;
      if(answerTotal){
        const correctEnd=(correctCount/answerTotal)*100;
        const partialEnd=correctEnd+(unsureCount/answerTotal)*100;
        homeAnswerDonut.style.background=`conic-gradient(#35b972 0% ${correctEnd}%,#9a75d3 ${correctEnd}% ${partialEnd}%,#df5b69 ${partialEnd}% 100%)`;
      }else homeAnswerDonut.style.background='#e9edf3';
      homeAnswerDonut.setAttribute('aria-label',answerTotal?`正解率${answerRate}パーセント`:'回答結果データなし');
      homeAnswerBar.setAttribute('aria-label',answerTotal?`回答結果：正解${correctCount}回、惜しい${unsureCount}回、不正解${wrongCount}回`:'回答結果データなし');
      homeTotalWordCount.textContent=String(totalWordKeys.size);
      homeActiveWordCount.textContent=String(matchingPairCount);
      homeActiveWordBar.style.width=`${totalWordKeys.size?Math.min(100,(matchingPairCount/totalWordKeys.size)*100):0}%`;
      const levelSets=Object.fromEntries(['S1','S2','S3','W1','W2','W3'].map(level=>[level,new Set()]));
      const posSets=new Map();
      sourceRows.forEach(row=>{
        const key=wordKey(row);
        if(!key)return;
        [text(row[COL.sLevel]),text(row[COL.wLevel])].forEach(level=>{if(levelSets[level])levelSets[level].add(key)});
        const part=text(row[COL.pos]);
        if(part){if(!posSets.has(part))posSets.set(part,new Set());posSets.get(part).add(key)}
      });
      homeLevelStats.replaceChildren(...Object.entries(levelSets).map(([level,words])=>{
        const item=document.createElement('span');
        const count=document.createElement('strong');
        item.append(document.createTextNode(level),count);
        count.textContent=String(words.size);
        return item;
      }));
      const sortedParts=[...posSets].map(([part,words])=>[part,words.size]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja'));
      const visibleParts=sortedParts;
      const maxPartCount=Math.max(1,...visibleParts.map(item=>item[1]));
      const posRows=visibleParts.map(([part,count])=>{
        const row=document.createElement('div');row.className='home-pos-row';
        const label=document.createElement('span');label.textContent=part;label.title=part;
        const track=document.createElement('span');track.className='home-pos-track';
        const bar=document.createElement('i');bar.style.width=`${(count/maxPartCount)*100}%`;track.append(bar);
        const value=document.createElement('strong');value.textContent=String(count);
        row.append(label,track,value);return row;
      });
      if(!posRows.length){const empty=document.createElement('div');empty.className='home-pos-row';const label=document.createElement('span');label.textContent='データなし';empty.append(label);posRows.push(empty)}
      homePosStats.replaceChildren(...posRows);
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
      practiceFilterClose.disabled=hasEmptyConditions;
      practiceFilterClose.setAttribute('aria-disabled',String(hasEmptyConditions));
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
    setOrder(false);
    practiceButton.dataset.questionLimit='all';

    let practiceRows=[];
    let practiceIndex=0;
    let practiceStored=null;
    let answerVisible=false;
    const applyPracticeMethodChange=(preserveRow=null)=>{
      if(practiceScreen.hidden||!practiceStored)return;
      let rows=getMatchingRows(practiceStored.rows||[]);
      if(practiceButton.dataset.order==='random')rows=shuffleRows(rows);
      const limit=practiceButton.dataset.questionLimit==='all'?rows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=rows.slice(0,limit);
      const preservedIndex=preserveRow?practiceRows.indexOf(preserveRow):-1;
      practiceIndex=preservedIndex>=0?preservedIndex:0;
      renderPracticeQuestion();
      renderPracticeList();
      if(autoPlaying)restartAutoPlayback();
    };
    const currentPracticeRow=()=>practiceRows[practiceIndex];
    const fitTextToFixedArea=(element,minSize)=>{
      if(!element||element.hidden)return;
      element.style.fontSize='';
      let size=Number.parseFloat(getComputedStyle(element).fontSize)||16;
      const overflows=()=>element.scrollHeight>element.clientHeight+1||element.scrollWidth>element.clientWidth+1;
      while(size>minSize&&overflows()){
        size=Math.max(minSize,size-.5);
        element.style.fontSize=`${size}px`;
      }
    };
    const fitPracticeCardText=()=>{
      fitTextToFixedArea(practiceWord,11);
      fitTextToFixedArea(practiceMeaning,10);
      fitTextToFixedArea(practiceNote,9);
      fitTextToFixedArea(practiceJapanese,11);
      if(answerVisible)fitTextToFixedArea(practiceEnglish,11);
    };
    const setAnswerVisible=visible=>{
      answerVisible=visible;
      practiceReveal.hidden=visible;
      practiceEnglish.hidden=!visible;
      practiceAudio.disabled=!('speechSynthesis' in window);
      requestAnimationFrame(fitPracticeCardText);
    };
    const syncPracticeRating=row=>{
      const value=text(row?.[COL.understanding])||'未登録';
      practiceRatingButtons.forEach(button=>button.classList.toggle('selected',button.dataset.value===value));
    };
    const formatPracticeNumber=(value,digits)=>{
      const raw=text(value);
      return /^\d+$/.test(raw)?raw.padStart(digits,'0'):raw||'—';
    };
    const formatSingleDigitNumber=value=>{
      const raw=text(value);
      return /^\d+$/.test(raw)?String(Number(raw)):raw||'—';
    };
    const formatExampleLetter=value=>{
      const raw=text(value);
      if(!/^\d+$/.test(raw))return raw||'—';
      let number=Number(raw);
      if(number<1)return raw;
      let letters='';
      while(number>0){
        number-=1;
        letters=String.fromCharCode(97+(number%26))+letters;
        number=Math.floor(number/26);
      }
      return letters;
    };
    const formatCardNumber=row=>[
      formatPracticeNumber(row?.[COL.wordNo],5),
      formatSingleDigitNumber(row?.[COL.meaningNo]),
      formatSingleDigitNumber(row?.[COL.exampleNo])
    ].join('-');
    const renderPracticeQuestion=()=>{
      const row=currentPracticeRow();
      if(!row)return;
      if('speechSynthesis' in window&&!autoPlaying)speechSynthesis.cancel();
      clearSentenceSpeaking();
      practiceJapaneseAudio.disabled=!('speechSynthesis' in window);
      practiceProgress.textContent=`${practiceIndex+1} / ${practiceRows.length}`;
      practiceJapanese.textContent=text(row[COL.japanese]);
      practiceEnglish.textContent=text(row[COL.english]);
      practiceWord.textContent=text(row[COL.word])||'—';
      practiceWordNumber.textContent=`No ${formatPracticeNumber(row?.[COL.wordNo],5)}`;
      const part=text(row[COL.pos])||'—';
      const meaningNumber=formatSingleDigitNumber(row?.[COL.meaningNo]);
      const exampleLetter=formatExampleLetter(row?.[COL.exampleNo]);
      const rank=text(row[COL.posRank]).toUpperCase();
      const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
      practicePart.textContent=part;
      practicePart.className=`practice-meta-chip ${rankTone}`.trim();
      practiceMeaningExampleNumber.textContent=`${meaningNumber}-${exampleLetter}`;
      practiceMeaningExampleNumber.className='practice-sub-number practice-meta-chip is-black-transparent';
      practiceLevels.replaceChildren();
      const levels=[text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean);
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
      practicePronUs.textContent=text(row[COL.pronUs])||'—';
      practicePronUk.textContent=text(row[COL.pronUk])||'—';
      practiceMeaning.textContent=text(row[COL.meaning])||'意味未登録';
      practicePronUsAudio.disabled=!('speechSynthesis' in window);
      practicePronUkAudio.disabled=!('speechSynthesis' in window);
      const note=text(row[COL.note]);
      practiceNote.textContent=note;
      practiceNote.closest('.practice-note-row').classList.toggle('is-empty',!note);
      syncPracticeRating(row);
      setAnswerVisible(false);
      requestAnimationFrame(fitPracticeCardText);
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
        item.setAttribute('aria-label',`${index+1}問目 ${text(row[COL.word])||'単語未登録'}から再生`);
        item.setAttribute('aria-current',String(index===practiceIndex));

        const copy=document.createElement('span');
        copy.className='practice-list-copy';
        const identifiers=document.createElement('span');
        identifiers.className='practice-list-card-badges practice-card-badges';
        const number=document.createElement('b');
        number.className='practice-list-word-no practice-number';
        number.textContent=`No ${formatPracticeNumber(row?.[COL.wordNo],5)}`;
        const rank=text(row[COL.posRank]).toUpperCase();
        const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
        const partBadge=document.createElement('span');
        partBadge.className=`practice-meta-chip ${rankTone}`.trim();
        partBadge.textContent=text(row[COL.pos])||'品詞未登録';
        const subBadge=document.createElement('span');
        subBadge.className='practice-meta-chip is-transparent';
        subBadge.textContent=`${formatSingleDigitNumber(row?.[COL.meaningNo])}-${formatExampleLetter(row?.[COL.exampleNo])}`;
        const levelBadges=document.createElement('span');
        levelBadges.className='practice-list-levels practice-level-chips';
        [text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean).forEach(level=>{
          const chip=document.createElement('span');
          const digit=level.match(/[123]$/)?.[0];
          chip.className=`practice-meta-chip ${digit==='1'?'red':digit==='2'?'orange':'yellow'}`;
          chip.textContent=level.toUpperCase();
          levelBadges.append(chip);
        });
        const summary=document.createElement('span');
        summary.className='practice-list-summary';
        const word=document.createElement('strong');
        word.className='practice-list-word';
        word.textContent=text(row[COL.word])||'単語未登録';
        const meaning=document.createElement('span');
        meaning.className='practice-list-meaning';
        meaning.textContent=text(row[COL.meaning])||'意味未登録';
        identifiers.append(number,partBadge,subBadge,levelBadges);

        const sentences=document.createElement('span');
        sentences.className='practice-list-sentences';
        const japanese=document.createElement('span');
        japanese.className='practice-list-japanese';
        japanese.textContent=text(row[COL.japanese])||text(row[COL.meaning])||'日本語未登録';
        const english=document.createElement('span');
        english.className='practice-list-english';
        english.textContent=text(row[COL.english])||'英語未登録';
        summary.append(word,meaning);
        sentences.append(japanese,english);
        copy.append(identifiers,summary,sentences);

        const rowActions=document.createElement('span');
        rowActions.className='practice-list-actions';
        const menuButton=document.createElement('button');
        menuButton.type='button';menuButton.className='practice-list-menu';menuButton.textContent='•••';
        menuButton.setAttribute('aria-label',`${text(row[COL.word])||'単語未登録'}のカードを編集`);
        const openButton=document.createElement('button');
        openButton.type='button';
        openButton.className='practice-list-open';
        openButton.setAttribute('aria-label',`${index+1}問目 ${text(row[COL.word])||'単語未登録'}をカードで開く`);
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
          openCardEditor('edit',row);
        });
        practiceList.append(item);
      });
      if(practiceViewMode==='list'){
        requestAnimationFrame(()=>{
          practiceList.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'});
        });
      }
    };
    const vocabularyKey=row=>`${text(row?.[COL.word]).toLowerCase()}\t${text(row?.[COL.pos])}`;
    const normalizedMeaning=value=>text(value).replace(/\s+/g,' ').toLowerCase();
    const restoredVocabularyStores=new WeakSet();
    const restoreVocabularyRows=stored=>{
      if(!stored)return [];
      if(restoredVocabularyStores.has(stored))return Array.isArray(stored.vocabularyRows)?stored.vocabularyRows:[];
      const catalog=[];
      const addRows=rows=>{
        if(!Array.isArray(rows))return;
        rows.forEach(row=>{if(text(row?.[COL.word])&&text(row?.[COL.pos]))catalog.push([...row])});
      };
      addRows(stored.vocabularyRows);
      addRows(stored.rows);
      if(stored.fileBytes&&typeof XLSX!=='undefined'){
        try{
          const workbook=XLSX.read(stored.fileBytes,{type:'array',cellFormula:true});
          const sheet=workbook.Sheets['単語リスト']||workbook.Sheets[workbook.SheetNames[0]];
          addRows(sheet?XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false}).slice(1):[]);
        }catch(error){console.warn('候補用の単語一覧を元Excelから復元できませんでした。',error)}
      }
      const unique=new Map();
      catalog.forEach(row=>{const key=vocabularyKey(row);if(key&&!unique.has(key))unique.set(key,row)});
      stored.vocabularyRows=[...unique.values()];
      restoredVocabularyStores.add(stored);
      return stored.vocabularyRows;
    };
    const getVocabularyRows=()=>{
      const savedVocabulary=restoreVocabularyRows(practiceStored);
      const currentRows=Array.isArray(practiceStored?.rows)?practiceStored.rows:[];
      const source=currentRows.concat(savedVocabulary);
      const unique=new Map();
      source.forEach(row=>{const key=vocabularyKey(row);if(text(row?.[COL.word])&&text(row?.[COL.pos])&&key&&!unique.has(key))unique.set(key,row)});
      return [...unique.values()].sort((a,b)=>text(a[COL.word]).localeCompare(text(b[COL.word]),'en'));
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
    let selectedMeaningMode=null;
    let pendingMeaningChoice=null;
    let selectedMeaningNumber='';
    let cardExampleDrafts=[];
    let cardDeletedExampleRows=[];
    let cardEditorAnimationRun=0;
    const closeCardActions=()=>{cardActionsOverlay.hidden=true;cardActionRow=null};
    const openCardActions=row=>{
      if(autoPlaying)stopAutoPlayback();
      cardActionRow=row;
      cardActionsWord.textContent=text(row[COL.word])||'—';
      cardActionsNumber.textContent=`No ${formatCardNumber(row)}`;
      cardActionsOverlay.hidden=false;
    };
    const syncCardWordFilterGroup=group=>{
      const choices=[...group.querySelectorAll('.choice')];
      group.querySelector('.all')?.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
    };
    const syncCardFilterControls=()=>{
      cardFilterSections.forEach(section=>{
        const choices=[...section.querySelectorAll('.choice')];
        section.querySelector('[data-card-section-action]')?.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
      });
      const choices=[...cardWordFilterPanel.querySelectorAll('.choice')];
      cardSelectAllFilters.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
    };
    const resetCardWordFilters=()=>{
      [...cardFilterLevelChoices,...cardFilterPartChoices,...cardFilterUnderstandingChoices,...cardFilterMeaningCountChoices].forEach(choice=>choice.classList.add('selected'));
      cardWordFilterPanel.querySelectorAll('.group .all').forEach(button=>button.classList.add('selected'));
      syncCardFilterControls();
      cardWordFilterPanel.hidden=true;
      cardWordFilterToggle.setAttribute('aria-expanded','false');
    };
    cardWordFilterToggle.addEventListener('click',()=>{
      const expand=cardWordFilterPanel.hidden;
      cardWordFilterPanel.hidden=!expand;
      cardWordFilterToggle.setAttribute('aria-expanded',String(expand));
    });
    [...cardFilterLevelChoices,...cardFilterPartChoices,...cardFilterUnderstandingChoices,...cardFilterMeaningCountChoices].forEach(button=>button.addEventListener('click',()=>{
      button.classList.toggle('selected');
      syncCardWordFilterGroup(button.closest('.group'));
      syncCardFilterControls();
      renderWordResults();
    }));
    cardWordFilterPanel.querySelectorAll('.group .all').forEach(button=>button.addEventListener('click',()=>{
      const group=button.closest('.group');
      const select=!button.classList.contains('selected');
      group.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      button.classList.toggle('selected',select);
      syncCardFilterControls();
      renderWordResults();
    }));
    cardFilterSections.forEach(section=>section.querySelector('[data-card-section-action]')?.addEventListener('click',event=>{
      const select=!event.currentTarget.classList.contains('selected');
      section.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      section.querySelectorAll('.group').forEach(syncCardWordFilterGroup);
      syncCardFilterControls();renderWordResults();
    }));
    cardSelectAllFilters.addEventListener('click',()=>{
      const select=!cardSelectAllFilters.classList.contains('selected');
      cardWordFilterPanel.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      cardWordFilterPanel.querySelectorAll('.group').forEach(syncCardWordFilterGroup);
      syncCardFilterControls();renderWordResults();
    });
    const renderWordResults=()=>{
      const query=text(cardWordSearch.value).toLowerCase();
      cardWordResults.replaceChildren();
      cardWordResults.onscroll=null;
      if(cardEditorMode==='edit'||selectedVocabularyRow){cardWordResults.hidden=true;cardWordSearch.setAttribute('aria-expanded','false');return}
      const candidates=getVocabularyRows();
      const meaningsByKey=new Map();
      [...(practiceStored.rows||[]),...(practiceStored.vocabularyRows||[])].forEach(row=>{
        const key=vocabularyKey(row);
        const meaning=text(row?.[COL.meaning]);
        if(!key||!meaning)return;
        if(!meaningsByKey.has(key))meaningsByKey.set(key,[]);
        const meanings=meaningsByKey.get(key);
        const meaningNo=text(row?.[COL.meaningNo]);
        if(!meanings.some(item=>item.number===meaningNo&&item.text===meaning))meanings.push({number:meaningNo,text:meaning});
      });
      meaningsByKey.forEach(meanings=>meanings.sort((a,b)=>(Number(a.number)||Number.MAX_SAFE_INTEGER)-(Number(b.number)||Number.MAX_SAFE_INTEGER)));
      const selectedLevels=new Set(cardFilterLevelChoices.filter(choice=>choice.classList.contains('selected')).map(choice=>choice.dataset.value));
      const selectedParts=new Set(cardFilterPartChoices.filter(choice=>choice.classList.contains('selected')).map(choice=>choice.dataset.value));
      const selectedUnderstanding=new Set(cardFilterUnderstandingChoices.filter(choice=>choice.classList.contains('selected')).map(choice=>choice.dataset.understandingFilter));
      const selectedMeaningCounts=new Set(cardFilterMeaningCountChoices.filter(choice=>choice.classList.contains('selected')).map(choice=>choice.dataset.meaningCountFilter));
      const restrictLevels=selectedLevels.size!==cardFilterLevelChoices.length;
      const restrictParts=selectedParts.size!==cardFilterPartChoices.length;
      const restrictUnderstanding=selectedUnderstanding.size!==cardFilterUnderstandingChoices.length;
      const restrictMeaningCounts=selectedMeaningCounts.size!==cardFilterMeaningCountChoices.length;
      const understandingByKey=new Map();
      (practiceStored.rows||[]).forEach(example=>{
        const key=vocabularyKey(example);if(!key)return;
        if(!understandingByKey.has(key))understandingByKey.set(key,new Set());
        understandingByKey.get(key).add(text(example[COL.understanding])||'未登録');
      });
      const starts=[];
      candidates.forEach(row=>{
        const word=text(row[COL.word]).toLowerCase();
        if(query&&!word.startsWith(query))return;
        if(restrictLevels&&![text(row[COL.sLevel]),text(row[COL.wLevel])].some(value=>selectedLevels.has(value)))return;
        if(restrictParts&&!selectedParts.has(text(row[COL.pos])))return;
        const understandingValues=understandingByKey.get(vocabularyKey(row))||new Set(['未登録']);
        if(restrictUnderstanding&&![...understandingValues].some(value=>selectedUnderstanding.has(value)))return;
        const meaningCount=(meaningsByKey.get(vocabularyKey(row))||[]).length;
        const meaningCountFilter=meaningCount===0?'0':meaningCount===1?'1':'multiple';
        if(restrictMeaningCounts&&!selectedMeaningCounts.has(meaningCountFilter))return;
        starts.push(row);
      });
      const matches=starts;
      const appendMatch=row=>{
        const button=document.createElement('button');
        button.type='button';button.className='card-word-option';button.setAttribute('role','option');
        const identifiers=document.createElement('span');
        identifiers.className='practice-list-card-badges practice-card-badges';
        const number=document.createElement('b');
        number.className='practice-list-word-no practice-number';
        number.textContent=`No ${formatPracticeNumber(row?.[COL.wordNo],5)}`;
        const rank=text(row[COL.posRank]).toUpperCase();
        const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
        const partBadge=document.createElement('span');
        partBadge.className=`practice-meta-chip ${rankTone}`.trim();
        partBadge.textContent=text(row[COL.pos])||'品詞未登録';
        const subBadge=document.createElement('span');
        const meanings=meaningsByKey.get(vocabularyKey(row))||[];
        const meaningCount=meanings.length;
        subBadge.className=`practice-meta-chip meaning-count-badge ${meaningCount?'has-meanings':'has-no-meanings'}`;
        subBadge.textContent=`意味 ${meaningCount}個`;
        const levelBadges=document.createElement('span');
        levelBadges.className='practice-list-levels practice-level-chips';
        [text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean).forEach(level=>{
          const chip=document.createElement('span');
          const digit=level.match(/[123]$/)?.[0];
          chip.className=`practice-meta-chip ${digit==='1'?'red':digit==='2'?'orange':'yellow'}`;
          chip.textContent=level.toUpperCase();
          levelBadges.append(chip);
        });
        identifiers.append(number,partBadge,subBadge,levelBadges);
        const summary=document.createElement('span');
        summary.className='practice-list-summary';
        const name=document.createElement('strong');
        name.className='practice-list-word';name.textContent=text(row[COL.word])||'単語未登録';
        const meaning=document.createElement('span');
        meaning.className=`practice-list-meaning${meanings.length?'':' is-unregistered'}`;
        if(meanings.length){
          meanings.forEach((item,index)=>{
            if(index)meaning.append(document.createTextNode('　'));
            const badge=document.createElement('span');
            badge.className='practice-meta-chip card-candidate-meaning-no';
            badge.textContent=item.number?formatSingleDigitNumber(item.number):'—';
            meaning.append(badge,document.createTextNode(` ${item.text}`));
          });
        }else meaning.textContent='-';
        summary.append(name,meaning);
        button.append(identifiers,summary);
        button.addEventListener('click',async()=>{
          if(cardWordResults.dataset.switching==='true')return;
          cardWordResults.dataset.switching='true';
          const fadeTargets=[cardWordMessage,cardWordSearchRow,cardWordFilterPanel,cardWordResults].filter(target=>!target.hidden&&typeof target.animate==='function');
          const fadeAnimations=fadeTargets.map(target=>target.animate([{opacity:1},{opacity:0}],{duration:420,easing:'ease-in-out',fill:'forwards'}));
          if(fadeAnimations.length)await Promise.allSettled(fadeAnimations.map(animation=>animation.finished));
          fadeAnimations.forEach(animation=>animation.cancel());
          selectedVocabularyRow=row;
          cardWordStep.classList.add('has-selection');
          cardWordSearch.value=text(row[COL.word]);cardWordSearchRow.hidden=true;cardWordFilterPanel.hidden=true;cardWordFilterToggle.setAttribute('aria-expanded','false');
          const rank=text(row[COL.posRank]).toUpperCase();
          const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
          const numberBadge=document.createElement('span');numberBadge.className='practice-list-word-no practice-number';numberBadge.textContent=`No ${formatPracticeNumber(row?.[COL.wordNo],5)}`;
          const partBadge=document.createElement('span');partBadge.className=`practice-meta-chip ${rankTone}`.trim();partBadge.textContent=text(row[COL.pos])||'品詞未登録';
          const wordName=document.createElement('strong');wordName.className='card-selected-word-name';wordName.textContent=text(row[COL.word])||'単語未登録';
          const levelBadges=document.createElement('span');levelBadges.className='practice-list-levels practice-level-chips';
          [text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean).forEach(level=>{
            const chip=document.createElement('span');const digit=level.match(/[123]$/)?.[0];
            chip.className=`practice-meta-chip ${digit==='1'?'red':digit==='2'?'orange':'yellow'}`;chip.textContent=level.toUpperCase();levelBadges.append(chip);
          });
          cardSelectedWordText.replaceChildren(numberBadge,partBadge,wordName,levelBadges);cardSelectedWordText.classList.add('is-badged');
          cardSelectedWord.hidden=false;cardWordMessage.hidden=true;cardWordReselect.hidden=false;cardWordResults.hidden=true;cardWordSearch.setAttribute('aria-expanded','false');
          renderMeaningResults();
          cardWordResults.dataset.switching='false';
          [cardSelectedWord,cardMeaningStep].forEach(target=>{
            if(typeof target.animate==='function')target.animate([{opacity:0},{opacity:1}],{duration:420,easing:'ease-in-out'});
          });
        });
        cardWordResults.append(button);
      };
      let rendered=0;
      const appendNextBatch=()=>{
        const end=Math.min(matches.length,rendered+100);
        for(;rendered<end;rendered+=1)appendMatch(matches[rendered]);
      };
      appendNextBatch();
      cardWordResults.onscroll=()=>{
        if(cardWordResults.scrollTop+cardWordResults.clientHeight>=cardWordResults.scrollHeight-120)appendNextBatch();
      };
      const empty=document.createElement('p');empty.className='card-word-empty';empty.textContent=query?'この文字で始まる登録済み単語がありません':'追加する単語を候補から選択してください';
      if(!matches.length)cardWordResults.append(empty);
      cardWordResults.hidden=false;cardWordSearch.setAttribute('aria-expanded','true');
    };
    const syncCardEditorMessages=()=>{
      cardWordMessage.hidden=Boolean(selectedVocabularyRow);
      cardWordReselect.hidden=!selectedVocabularyRow||cardEditorMode==='edit';
      const meaningConfirmed=['new','existing','unchanged','changed'].includes(selectedMeaningMode);
      cardMeaningMessage.hidden=meaningConfirmed||Boolean(text(cardMeaningInput.value));
      cardExampleCarousel.querySelectorAll('.card-example-form').forEach(form=>{
        const japanese=form.querySelector('[data-example-field="japanese"]');
        const english=form.querySelector('[data-example-field="english"]');
        form.querySelector('[data-example-message="japanese"]').hidden=Boolean(text(japanese?.value));
        form.querySelector('[data-example-message="english"]').hidden=Boolean(text(english?.value));
      });
    };
    const fadeMeaningTransition=async(outTargets,change,inTargets)=>{
      const outgoing=outTargets.filter(target=>target&&!target.hidden&&typeof target.animate==='function');
      const fades=outgoing.map(target=>target.animate([{opacity:1},{opacity:0}],{duration:420,easing:'ease-in-out',fill:'forwards'}));
      if(fades.length)await Promise.allSettled(fades.map(animation=>animation.finished));
      fades.forEach(animation=>animation.cancel());
      change();
      inTargets.filter(target=>target&&!target.hidden&&typeof target.animate==='function').forEach(target=>target.animate([{opacity:0},{opacity:1}],{duration:420,easing:'ease-in-out'}));
    };
    const showSelectedMeaning=(number,value,changed=false,showReselect=true)=>{
      cardSelectedMeaningNumber.textContent=formatSingleDigitNumber(number);
      cardSelectedMeaningText.textContent=value;
      selectedMeaningNumber=text(number);
      cardSelectedMeaning.hidden=false;
      cardMeaningChanged.hidden=!changed;
      cardMeaningReselect.hidden=!showReselect;
    };
    const loadCardExampleDrafts=()=>{
      const pairKey=vocabularyKey(selectedVocabularyRow);
      const matching=(practiceStored.rows||[]).filter(row=>vocabularyKey(row)===pairKey&&text(row[COL.meaningNo])===selectedMeaningNumber&&text(row[COL.japanese])&&text(row[COL.english]));
      if(cardEditorMode==='edit'&&cardEditorRow&&!matching.includes(cardEditorRow))matching.push(cardEditorRow);
      cardExampleDrafts=matching.sort((a,b)=>(Number(a[COL.exampleNo])||Number.MAX_SAFE_INTEGER)-(Number(b[COL.exampleNo])||Number.MAX_SAFE_INTEGER)).map(row=>({
        row,exampleNo:text(row[COL.exampleNo])||'1',japanese:text(row[COL.japanese]),english:text(row[COL.english]),note:text(row[COL.note])
      }));
      cardDeletedExampleRows=[];
      if(!cardExampleDrafts.length)cardExampleDrafts.push({row:null,exampleNo:'1',japanese:'',english:'',note:''});
    };
    const renderCardExampleCarousel=(focusIndex=null)=>{
      cardExampleCarousel.replaceChildren();
      cardExampleDrafts.forEach((draft,index)=>{
        const form=document.createElement('article');form.className='card-example-page card-example-form';form.dataset.draftIndex=String(index);
        const heading=document.createElement('div');heading.className='card-example-number';
        const headingLabel=document.createElement('span');headingLabel.textContent='例文番号';
        const badge=document.createElement('span');badge.className='practice-meta-chip';badge.textContent=formatExampleLetter(draft.exampleNo);
        heading.append(headingLabel,badge);
        if(cardExampleDrafts.length>1){
          const remove=document.createElement('button');remove.type='button';remove.className='card-example-remove';remove.textContent='削除';
          remove.addEventListener('click',()=>{
            if(draft.row)cardDeletedExampleRows.push(draft.row);
            cardExampleDrafts.splice(index,1);cardExampleDrafts.forEach((item,itemIndex)=>{item.exampleNo=String(itemIndex+1)});renderCardExampleCarousel();
          });
          heading.append(remove);
        }
        const makeField=(labelText,key,rows,optional=false)=>{
          const label=document.createElement('label');label.className='card-editor-field';
          const title=document.createElement('span');title.textContent=labelText;
          if(optional){const small=document.createElement('small');small.textContent=' 任意';title.append(small)}
          else{const required=document.createElement('em');required.className='card-required-mark';required.setAttribute('aria-hidden','true');required.textContent='※';title.append(' ',required)}
          const input=document.createElement('textarea');input.rows=rows;input.placeholder=`${labelText}を入力`;input.dataset.exampleField=key;input.value=draft[key];if(key==='english')input.lang='en';
          input.addEventListener('input',()=>{draft[key]=input.value;syncCardEditorMessages()});label.append(title,input);return label;
        };
        const japaneseField=makeField('日本語','japanese',4);
        const japaneseMessage=document.createElement('p');japaneseMessage.className='card-field-message';japaneseMessage.dataset.exampleMessage='japanese';japaneseMessage.textContent='※日本語を入力してください';
        const englishField=makeField('英語','english',4);
        const englishMessage=document.createElement('p');englishMessage.className='card-field-message';englishMessage.dataset.exampleMessage='english';englishMessage.textContent='※英語を入力してください';
        form.append(heading,japaneseField,japaneseMessage,englishField,englishMessage,makeField('補足','note',3,true));cardExampleCarousel.append(form);
      });
      const nextExampleNo=String(nextNumber(cardExampleDrafts.map(draft=>{const row=[];row[COL.exampleNo]=draft.exampleNo;return row}),COL.exampleNo));
      const addPage=document.createElement('button');addPage.type='button';addPage.className='card-example-page card-example-add';
      const addBadge=document.createElement('span');addBadge.className='practice-meta-chip';addBadge.textContent=formatExampleLetter(nextExampleNo);
      const addText=document.createElement('strong');addText.textContent='＋例文追加';addPage.append(addBadge,addText);
      addPage.addEventListener('click',()=>{const newIndex=cardExampleDrafts.length;cardExampleDrafts.push({row:null,exampleNo:nextExampleNo,japanese:'',english:'',note:''});renderCardExampleCarousel(newIndex)});
      cardExampleCarousel.append(addPage);syncCardEditorMessages();
      if(Number.isInteger(focusIndex))requestAnimationFrame(()=>{cardExampleCarousel.scrollLeft=cardExampleCarousel.clientWidth*focusIndex});
    };
    const showCardExampleEditor=()=>{loadCardExampleDrafts();renderCardExampleCarousel();cardExampleStep.hidden=false};
    const renderMeaningResults=(preserveSelection=false)=>{
      cardMeaningResults.replaceChildren();
      pendingMeaningChoice=null;cardMeaningResults.hidden=false;cardSelectedMeaning.hidden=true;cardMeaningChanged.hidden=true;cardMeaningEditActions.hidden=true;cardMeaningConfirm.hidden=true;cardMeaningReselect.hidden=true;
      cardMeaningStep.classList.toggle('is-choosing',!preserveSelection);
      if(!preserveSelection){selectedMeaningMode=null;cardMeaningInput.value='';cardMeaningField.hidden=true;cardMeaningNumberBadge.hidden=true}
      if(!selectedVocabularyRow){cardMeaningStep.hidden=true;return}
      const pairKey=vocabularyKey(selectedVocabularyRow);
      const samePair=(practiceStored.rows||[]).filter(row=>vocabularyKey(row)===pairKey);
      const meaningMap=new Map();
      samePair.forEach(row=>{const value=text(row[COL.meaning]);if(value&&!meaningMap.has(value))meaningMap.set(value,text(row[COL.meaningNo]))});
      const meanings=[...meaningMap].map(([value,number])=>({value,label:value,number,kind:'existing'})).sort((a,b)=>(Number(a.number)||Number.MAX_SAFE_INTEGER)-(Number(b.number)||Number.MAX_SAFE_INTEGER));
      if(preserveSelection){
        pendingMeaningChoice={number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
        cardMeaningStep.classList.remove('is-choosing');cardMeaningResults.hidden=true;cardMeaningField.hidden=true;cardMeaningNumberBadge.hidden=true;cardMeaningEditActions.hidden=false;cardExampleStep.hidden=true;selectedMeaningMode='existing-choice';
        showSelectedMeaning(pendingMeaningChoice.number,pendingMeaningChoice.value,false,false);syncCardEditorMessages();cardMeaningStep.hidden=false;return;
      }
      const choices=[{value:'',label:'新規登録',number:String(nextNumber(samePair,COL.meaningNo)),kind:'new'},...meanings];
      choices.forEach(choice=>{
        const button=document.createElement('button');button.type='button';button.className='card-meaning-option';
        if(choice.kind==='new'){button.classList.add('is-new');button.textContent=choice.label}
        else{
          const number=document.createElement('span');number.className='practice-meta-chip';number.textContent=formatSingleDigitNumber(choice.number);
          const label=document.createElement('span');label.className='card-meaning-option-text';label.textContent=choice.label;button.append(number,label);
        }
        button.addEventListener('click',async()=>{
          if(choice.kind==='new'){
            await fadeMeaningTransition([cardMeaningResults],()=>{
              cardMeaningStep.classList.remove('is-choosing');selectedMeaningMode='new-draft';cardMeaningInput.value='';cardMeaningResults.hidden=true;cardMeaningField.hidden=false;
              cardMeaningNumberBadge.className='practice-meta-chip';cardMeaningNumberBadge.textContent=formatSingleDigitNumber(choice.number);cardMeaningNumberBadge.hidden=false;
              cardMeaningConfirm.textContent='この意味で登録';cardMeaningConfirm.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
            },[cardMeaningField,cardMeaningConfirm,cardMeaningMessage]);
          }else{
            await fadeMeaningTransition([cardMeaningResults,cardMeaningMessage],()=>{
              cardMeaningStep.classList.remove('is-choosing');selectedMeaningMode='existing-choice';pendingMeaningChoice={number:choice.number,value:choice.value};cardMeaningInput.value=choice.value;cardMeaningResults.hidden=true;cardMeaningField.hidden=true;cardMeaningConfirm.hidden=true;
              showSelectedMeaning(choice.number,choice.value,false,false);cardMeaningEditActions.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
            },[cardSelectedMeaning,cardMeaningEditActions]);
          }
        });
        cardMeaningResults.append(button);
      });
      cardMeaningStep.hidden=false;syncCardEditorMessages();
    };
    const openCardEditor=(mode,row=null)=>{
      if(autoPlaying)stopAutoPlayback();
      cardEditorMode=mode;cardEditorRow=row;selectedVocabularyRow=mode==='edit'?row:null;
      cardWordStep.classList.toggle('has-selection',mode==='edit');
      cardEditorOverlay.dataset.mode=mode;
      cardEditorTitle.textContent='例文編集';
      cardEditorBody.scrollTop=0;pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];cardExampleCarousel.replaceChildren();
      selectedMeaningMode=mode==='edit'?'existing':null;
      cardWordStep.hidden=false;
      if(mode==='add')resetCardWordFilters();
      cardWordSearch.value=mode==='edit'?text(row[COL.word]):'';cardWordSearch.disabled=mode==='edit';cardWordSearchRow.hidden=mode==='edit';
      cardSelectedWordText.replaceChildren();cardSelectedWordText.classList.toggle('is-badged',mode==='edit');
      if(mode==='edit'){
        const rank=text(row[COL.posRank]).toUpperCase();
        const rankTone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank]||'';
        const numberBadge=document.createElement('span');numberBadge.className='practice-list-word-no practice-number';numberBadge.textContent=`No ${formatPracticeNumber(row?.[COL.wordNo],5)}`;
        const partBadge=document.createElement('span');partBadge.className=`practice-meta-chip ${rankTone}`.trim();partBadge.textContent=text(row[COL.pos])||'品詞未登録';
        const wordName=document.createElement('strong');wordName.className='card-selected-word-name';wordName.textContent=text(row[COL.word])||'単語未登録';
        const levelBadges=document.createElement('span');levelBadges.className='practice-list-levels practice-level-chips';
        [text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean).forEach(level=>{
          const chip=document.createElement('span');const digit=level.match(/[123]$/)?.[0];
          chip.className=`practice-meta-chip ${digit==='1'?'red':digit==='2'?'orange':'yellow'}`;chip.textContent=level.toUpperCase();levelBadges.append(chip);
        });
        cardSelectedWordText.append(numberBadge,partBadge,wordName,levelBadges);
        cardMeaningNumberBadge.className='practice-meta-chip';
        cardMeaningNumberBadge.textContent=formatSingleDigitNumber(row?.[COL.meaningNo]);
      }
      cardMeaningNumberBadge.hidden=mode!=='edit';
      cardSelectedWord.hidden=mode!=='edit';
      cardWordReselect.hidden=true;cardMeaningStep.hidden=mode==='add';cardMeaningField.hidden=mode==='add';cardExampleStep.hidden=mode==='add';
      cardMeaningInput.value=mode==='edit'?text(row[COL.meaning]):'';
      cardWordResults.replaceChildren();cardWordResults.hidden=mode==='edit';
      cardWordSearch.setAttribute('aria-expanded',String(mode!=='edit'));
      syncCardEditorMessages();
      if(mode==='edit')renderMeaningResults(true);
      const animationRun=++cardEditorAnimationRun;
      cardEditorOverlay.classList.remove('open');
      if(mode==='add')renderWordResults();
      cardEditorOverlay.hidden=false;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(animationRun!==cardEditorAnimationRun)return;
        cardEditorOverlay.classList.add('open');
      }));
    };
    const closeCardEditor=async()=>{
      const animationRun=++cardEditorAnimationRun;
      cardEditorOverlay.classList.remove('open');
      await wait(340);
      if(animationRun!==cardEditorAnimationRun)return;
      cardEditorOverlay.hidden=true;cardEditorRow=null;selectedVocabularyRow=null;selectedMeaningMode=null;pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];
    };
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
    cardWordSearch.addEventListener('focus',()=>{if(!cardWordSearch.disabled)renderWordResults()});
    cardWordReselect.addEventListener('click',()=>{
      selectedVocabularyRow=null;selectedMeaningMode=null;pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];cardExampleCarousel.replaceChildren();cardWordStep.classList.remove('has-selection');cardSelectedWord.hidden=true;cardWordSearchRow.hidden=false;cardWordSearch.disabled=false;cardWordSearch.value='';cardMeaningStep.classList.remove('is-choosing');cardMeaningStep.hidden=true;cardMeaningField.hidden=true;cardMeaningNumberBadge.hidden=true;cardMeaningConfirm.hidden=true;cardSelectedMeaning.hidden=true;cardMeaningChanged.hidden=true;cardMeaningEditActions.hidden=true;cardMeaningReselect.hidden=true;cardMeaningInput.value='';cardExampleStep.hidden=true;syncCardEditorMessages();renderWordResults();
    });
    cardMeaningReselect.addEventListener('click',async()=>{
      await fadeMeaningTransition([cardSelectedMeaning,cardMeaningChanged,cardMeaningReselect,cardExampleStep],()=>{
        cardMeaningReselect.hidden=true;cardExampleStep.hidden=true;
        renderMeaningResults(cardEditorMode==='edit');
      },[cardMeaningResults,cardMeaningEditActions,cardMeaningMessage]);
    });
    cardMeaningKeep.addEventListener('click',async()=>{
      const choice=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
      await fadeMeaningTransition([cardMeaningEditActions,cardSelectedMeaning,cardMeaningMessage],()=>{
        selectedMeaningMode=cardEditorMode==='edit'?'unchanged':'existing';cardMeaningInput.value=choice.value;cardMeaningEditActions.hidden=true;
        showSelectedMeaning(choice.number,choice.value);showCardExampleEditor();syncCardEditorMessages();
      },[cardSelectedMeaning,cardExampleStep]);
    });
    cardMeaningChange.addEventListener('click',async()=>{
      const choice=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
      await fadeMeaningTransition([cardMeaningEditActions,cardSelectedMeaning],()=>{
        selectedMeaningMode='change-draft';cardMeaningEditActions.hidden=true;cardSelectedMeaning.hidden=true;cardMeaningReselect.hidden=true;cardMeaningInput.value=choice.value;
        cardMeaningNumberBadge.className='practice-meta-chip';cardMeaningNumberBadge.textContent=formatSingleDigitNumber(choice.number);cardMeaningNumberBadge.hidden=false;
        cardMeaningField.hidden=false;cardMeaningConfirm.textContent='この意味に変更';cardMeaningConfirm.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
      },[cardMeaningField,cardMeaningConfirm]);
    });
    cardMeaningConfirm.addEventListener('click',async()=>{
      const value=text(cardMeaningInput.value);
      if(!value){syncCardEditorMessages();return}
      const pairKey=vocabularyKey(selectedVocabularyRow);
      const samePair=(practiceStored.rows||[]).filter(row=>vocabularyKey(row)===pairKey);
      let number=text(cardMeaningNumberBadge.textContent);
      let mode='new';
      let changed=false;
      if(selectedMeaningMode==='new-draft'){
        const duplicate=samePair.find(row=>normalizedMeaning(row[COL.meaning])===normalizedMeaning(value));
        if(duplicate){alert('同じ意味がすでに登録されています。');return}
      }else{
        const original=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
        const oldValue=original.value;
        const currentNumber=original.number;
        const others=cardEditorMode==='edit'?samePair.filter(row=>row!==cardEditorRow):samePair;
        const duplicate=others.find(row=>text(row[COL.meaningNo])!==currentNumber&&normalizedMeaning(row[COL.meaning])===normalizedMeaning(value));
        if(duplicate){alert('同じ意味がすでに登録されています。');return}
        if(value!==oldValue&&(cardEditorMode==='add'||others.some(row=>text(row[COL.meaningNo])===currentNumber)))number=String(nextNumber(samePair,COL.meaningNo));
        else number=currentNumber;
        changed=value!==oldValue;mode=changed?'changed':'unchanged';
      }
      await fadeMeaningTransition([cardMeaningField,cardMeaningConfirm,cardMeaningMessage],()=>{
        selectedMeaningMode=mode;cardMeaningField.hidden=true;cardMeaningConfirm.hidden=true;
        showSelectedMeaning(number,value,changed);showCardExampleEditor();syncCardEditorMessages();
      },[cardSelectedMeaning,cardMeaningChanged,cardExampleStep]);
    });
    cardMeaningInput.addEventListener('input',syncCardEditorMessages);
    cardEditorCancel.addEventListener('click',closeCardEditor);
    cardEditorOverlay.addEventListener('click',event=>{if(event.target===cardEditorOverlay)closeCardEditor()});
    const nextNumber=(rows,column)=>Math.max(0,...rows.map(row=>Number.parseInt(text(row[column]),10)||0))+1;
    cardEditorSave.addEventListener('click',async()=>{
      const meaning=text(cardMeaningInput.value);
      if(!selectedVocabularyRow){alert('登録済みの単語を選択してください。');return}
      if(!['new','existing','unchanged','changed'].includes(selectedMeaningMode)){alert('意味を入力してください。');return}
      if(!meaning||!cardExampleDrafts.length){alert('例文を追加してください。');return}
      if(cardExampleDrafts.some(draft=>!text(draft.japanese)||!text(draft.english))){alert('すべての例文に日本語と英語を入力してください。');syncCardEditorMessages();return}
      cardEditorSave.disabled=true;
      try{
        const pairKey=vocabularyKey(selectedVocabularyRow);
        const deletedRows=new Set(cardDeletedExampleRows);
        const samePair=(practiceStored.rows||[]).filter(row=>vocabularyKey(row)===pairKey&&!deletedRows.has(row));
        const draftRows=new Set(cardExampleDrafts.map(draft=>draft.row).filter(Boolean));
        const duplicateMeaning=samePair.find(row=>!draftRows.has(row)&&text(row[COL.meaningNo])!==selectedMeaningNumber&&normalizedMeaning(row[COL.meaning])===normalizedMeaning(meaning));
        if(duplicateMeaning){alert('同じ意味がすでに登録されています。');return}
        cardDeletedExampleRows.forEach(row=>{const index=practiceStored.rows.indexOf(row);if(index>=0)practiceStored.rows.splice(index,1)});
        const existingMeaning=samePair.find(row=>!draftRows.has(row)&&text(row[COL.meaning])===meaning)||samePair.find(row=>text(row[COL.meaning])===meaning);
        const meaningNo=text(existingMeaning?.[COL.meaningNo])||selectedMeaningNumber||String(nextNumber(samePair,COL.meaningNo));
        const occupied=new Set(samePair.filter(row=>!draftRows.has(row)&&text(row[COL.meaningNo])===meaningNo).map(row=>text(row[COL.exampleNo])).filter(Boolean));
        let nextExample=Math.max(0,...samePair.filter(row=>text(row[COL.meaningNo])===meaningNo).map(row=>Number.parseInt(text(row[COL.exampleNo]),10)||0));
        cardExampleDrafts.forEach(draft=>{
          let exampleNo=text(draft.exampleNo);
          if(!exampleNo||occupied.has(exampleNo)){do{nextExample+=1;exampleNo=String(nextExample)}while(occupied.has(exampleNo))}
          occupied.add(exampleNo);draft.exampleNo=exampleNo;
          let target=draft.row;
          if(!target){
            target=samePair.find(row=>!draftRows.has(row)&&!text(row[COL.meaning])&&!text(row[COL.japanese])&&!text(row[COL.english]));
            if(target)draftRows.add(target);
            else{
              target=[...selectedVocabularyRow];
              let insertIndex=-1;practiceStored.rows.forEach((row,index)=>{if(vocabularyKey(row)===pairKey)insertIndex=index});
              practiceStored.rows.splice(insertIndex>=0?insertIndex+1:practiceStored.rows.length,0,target);
            }
            draft.row=target;target[COL.understanding]='';target[COL.correctCount]=0;target[COL.wrongCount]=0;target[COL.questionCount]=0;
          }
          target[COL.meaningNo]=meaningNo;target[COL.meaning]=meaning;target[COL.exampleNo]=exampleNo;
          target[COL.japanese]=text(draft.japanese);target[COL.english]=text(draft.english);target[COL.note]=text(draft.note);
        });
        await persistPracticeData();refreshPracticeAfterMutation();closeCardEditor();
      }catch{alert('カードを保存できませんでした。')}
      finally{cardEditorSave.disabled=false}
    });
    cardActionCancel.addEventListener('click',closeCardActions);
    cardActionsOverlay.addEventListener('click',event=>{if(event.target===cardActionsOverlay)closeCardActions()});
    cardActionEdit.addEventListener('click',()=>{const row=cardActionRow;closeCardActions();if(row)openCardEditor('edit',row)});
    const deleteCardRow=async row=>{
      if(!row)return false;
      if(!confirm(`「${text(row[COL.word])}」のこのカードを削除しますか？\n\n単語データは削除されません。`))return;
      const index=practiceStored.rows.indexOf(row);if(index<0)return;
      const hasAnotherCard=practiceStored.rows.some((candidate,candidateIndex)=>candidateIndex!==index&&vocabularyKey(candidate)===vocabularyKey(row)&&text(candidate[COL.japanese])&&text(candidate[COL.english]));
      const backup=[...row];
      if(hasAnotherCard)practiceStored.rows.splice(index,1);
      else{
        row[COL.meaningNo]='';
        row[COL.meaning]='';
        row[COL.exampleNo]='';
        row[COL.japanese]='';
        row[COL.english]='';
        row[COL.note]='';
        row[COL.understanding]='';
        row[COL.correctCount]=0;
        row[COL.wrongCount]=0;
        row[COL.questionCount]=0;
      }
      try{await persistPracticeData();refreshPracticeAfterMutation();return true}
      catch{
        if(hasAnotherCard)practiceStored.rows.splice(index,0,row);
        else backup.forEach((value,column)=>{row[column]=value});
        alert('カードを削除できませんでした。');
        return false;
      }
    };
    cardActionDelete.addEventListener('click',async()=>{const row=cardActionRow;closeCardActions();await deleteCardRow(row)});
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
      {trigger:speechRateSetting,menu:speechRateMenu,key:'rate',options:rateOptions,mode:'wheel'},
      {trigger:japanesePauseSetting,menu:japanesePauseMenu,key:'japanesePause',options:pauseOptions,mode:'cycle'},
      {trigger:englishPauseSetting,menu:englishPauseMenu,key:'englishPause',options:pauseOptions,mode:'cycle'},
      {trigger:englishRepeatSetting,menu:englishRepeatMenu,key:'englishRepeats',options:repeatOptions,mode:'cycle'}
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
      if(spec.mode==='cycle'){
        spec.trigger.addEventListener('click',()=>{
          const current=spec.options.findIndex(item=>Number(item.value)===Number(playbackSettings[spec.key]));
          const next=spec.options[(current+1)%spec.options.length];
          playbackSettings[spec.key]=Number(next.value);savePlaybackSettings();syncPracticeSettingPickers();
        });
        return;
      }
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
      practiceFilterButton.disabled=false;
      practiceFilterButton.setAttribute('aria-disabled','false');
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
    let practiceFilterSnapshot=null;
    const restoreFilterCard=()=>{
      if(filterCardHomeNext?.parentNode===filterCardHomeParent)filterCardHomeParent.insertBefore(filterCard,filterCardHomeNext);
      else filterCardHomeParent.append(filterCard);
    };
    const openPracticeFilter=()=>{
      if(practiceFilterOpen)return;
      practiceFilterOpen=true;
      practiceFilterSnapshot=allFilterChoices.map(choice=>choice.classList.contains('selected'));
      if(autoPlaying)stopAutoPlayback();
      practiceFilterSheetBody.append(filterCard);
      practiceFilterOverlay.hidden=false;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        practiceFilterOverlay.classList.add('open');
        practiceFilterClose.focus({preventScroll:true});
      }));
    };
    const closePracticeFilter=async(applyFilters=false)=>{
      if(!practiceFilterOpen)return;
      const previousViewMode=practiceViewMode;
      const previousRow=previousViewMode==='card'?currentPracticeRow():null;
      practiceFilterOpen=false;
      practiceFilterOverlay.classList.remove('open');
      await wait(340);
      restoreFilterCard();
      practiceFilterOverlay.hidden=true;
      if(applyFilters){
        applyPracticeMethodChange(previousRow);
        setPracticeViewMode(previousViewMode==='card'&&practiceRows.length?'card':'list');
      }
      practiceFilterSnapshot=null;
    };
    const cancelPracticeFilter=()=>{
      if(practiceFilterSnapshot){
        allFilterChoices.forEach((choice,index)=>choice.classList.toggle('selected',practiceFilterSnapshot[index]));
        subgroupAllButtons.forEach(button=>syncSubgroupAll(button.closest('.group')));
        filterSections.forEach(section=>syncSectionControls(section,false));
        syncGlobalControls();
        refreshQuestionCount();
      }
      return closePracticeFilter(false);
    };
    const enableBottomSheetGrab=(overlay,sheet,handle,onDismiss)=>{
      let drag=null;
      const clearDragStyles=()=>{
        sheet.style.removeProperty('transition');
        sheet.style.removeProperty('transform');
        overlay.style.removeProperty('transition');
        overlay.style.removeProperty('background-color');
        handle.classList.remove('dragging');
      };
      handle.addEventListener('pointerdown',event=>{
        if((event.pointerType==='mouse'&&event.button!==0)||drag)return;
        drag={id:event.pointerId,startY:event.clientY,lastY:event.clientY,startTime:performance.now(),distance:0};
        sheet.style.transition='none';
        overlay.style.transition='none';
        handle.classList.add('dragging');
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      handle.addEventListener('pointermove',event=>{
        if(!drag||drag.id!==event.pointerId)return;
        const distance=Math.max(0,event.clientY-drag.startY);
        drag.distance=distance;drag.lastY=event.clientY;
        sheet.style.transform=`translateY(${distance}px)`;
        const fade=Math.max(0,.45*(1-distance/Math.max(1,sheet.offsetHeight*.75)));
        overlay.style.backgroundColor=`rgba(17,24,39,${fade})`;
        event.preventDefault();
      });
      const finishDrag=(event,cancelled=false)=>{
        if(!drag||drag.id!==event.pointerId)return;
        const current=drag;drag=null;
        const elapsed=Math.max(1,performance.now()-current.startTime);
        const velocity=current.distance/elapsed;
        const dismiss=!cancelled&&(current.distance>Math.min(120,sheet.offsetHeight*.18)||velocity>.5);
        sheet.style.transition='transform 240ms cubic-bezier(.2,.8,.2,1)';
        overlay.style.transition='background-color 240ms ease';
        if(dismiss){
          sheet.style.transform='translateY(104%)';
          overlay.style.backgroundColor='rgba(17,24,39,0)';
          onDismiss();
          setTimeout(clearDragStyles,360);
        }else{
          sheet.style.transform='translateY(0)';
          overlay.style.backgroundColor='rgba(17,24,39,.45)';
          setTimeout(clearDragStyles,250);
        }
      };
      handle.addEventListener('pointerup',event=>finishDrag(event));
      handle.addEventListener('pointercancel',event=>finishDrag(event,true));
    };
    enableBottomSheetGrab(practiceFilterOverlay,practiceFilterSheet,practiceFilterHandle,()=>cancelPracticeFilter());
    enableBottomSheetGrab(cardEditorOverlay,cardEditorSheet,cardEditorHandle,()=>closeCardEditor());
    const openPractice=async()=>{
      if(screenTransitionBusy)return;
      const stored=await getImportedData();
      let rows=getMatchingRows(stored?.rows||[]);
      if(practiceButton.dataset.order==='random')rows=shuffleRows(rows);
      const limit=practiceButton.dataset.questionLimit==='all'?rows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=rows.slice(0,limit);
      practiceStored=stored||{headers:[...EXPECTED_HEADERS],rows:[],vocabularyRows:[],fileName:'未読込',modified:true};
      restoreVocabularyRows(practiceStored);
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
      if(practiceFilterOpen)await cancelPracticeFilter();
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
    practiceCardMenu.addEventListener('click',()=>{const row=currentPracticeRow();if(row)openCardEditor('edit',row)});
    autoPlayTab.addEventListener('click',()=>autoPlaying?stopAutoPlayback():startAutoPlayback());
    practiceBackToList.addEventListener('click',()=>returnToPracticeList());
    practiceFilterButton.addEventListener('click',openPracticeFilter);
    practiceFilterCancel.addEventListener('click',cancelPracticeFilter);
    practiceFilterClose.addEventListener('click',()=>{if(!practiceFilterClose.disabled)closePracticeFilter(true)});
    practiceFilterOverlay.addEventListener('click',event=>{
      if(event.target===practiceFilterOverlay)cancelPracticeFilter();
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
      row[COL.understanding]=text(row[COL.understanding])===button.dataset.value?'':button.dataset.value;
      practiceStored.modified=true;
      syncPracticeRating(row);
      renderPracticeList();
      await saveImportedData(practiceStored);
    }));
    window.addEventListener('resize',()=>{
      if(!practiceScreen.hidden&&practiceViewMode==='card')requestAnimationFrame(fitPracticeCardText);
    },{passive:true});
    document.addEventListener('keydown',event=>{
      if(practiceScreen.hidden)return;
      if(event.key==='Escape'&&practiceFilterOpen){cancelPracticeFilter();return}
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
