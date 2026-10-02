Warning: truncated output (original token count: 51342)
Total output lines: 3056

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
    const helpMenu=document.getElementById('helpMenu');
    const helpVersionButton=document.getElementById('helpVersionButton');
    const helpUsageButton=document.getElementById('helpUsageButton');
    const helpVersionPanel=document.getElementById('helpVersionPanel');
    const helpUsagePanel=document.getElementById('helpUsagePanel');
    const homeSettingsButton=document.getElementById('homeSettingsButton');
    const homeSettingsOverlay=document.getElementById('homeSettingsOverlay');
    const homeSettingsClose=document.getElementById('homeSettingsClose');
    const themeOptions=[...document.querySelectorAll('[data-theme-option]')];
    const THEME_STORAGE_KEY='flovo-theme';
    const systemTheme=matchMedia('(prefers-color-scheme: dark)');
    let themePreference=document.documentElement.dataset.themePreference||'auto';
    const applyTheme=preference=>{
      themePreference=['auto','light','dark'].includes(preference)?preference:'auto';
      const dark=themePreference==='dark'||(themePreference==='auto'&&systemTheme.matches);
      document.documentElement.dataset.theme=dark?'dark':'light';
      document.documentElement.dataset.themePreference=themePreference;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#111722':'#f6f6fb');
      themeOptions.forEach(button=>{const selected=button.dataset.themeOption===themePreference;button.classList.toggle('selected',selected);button.setAttribute('aria-checked',String(selected))});
    };
    applyTheme(themePreference);
    systemTheme.addEventListener?.('change',()=>{if(themePreference==='auto')applyTheme('auto')});
    homeSettingsButton.addEventListener('click',()=>{applyTheme(themePreference);homeSettingsOverlay.hidden=false;homeSettingsClose.focus({preventScroll:true})});
    const closeHomeSettings=()=>{homeSettingsOverlay.hidden=true;homeSettingsButton.focus({preventScroll:true})};
    homeSettingsClose.addEventListener('click',closeHomeSettings);
    homeSettingsOverlay.addEventListener('click',event=>{if(event.target===homeSettingsOverlay)closeHomeSettings()});
    themeOptions.forEach(button=>button.addEventListener('click',()=>{const preference=button.dataset.themeOption;try{localStorage.setItem(THEME_STORAGE_KEY,preference)}catch{}applyTheme(preference)}));
    const homeModules=document.querySelector('.home-modules');
    const homeModuleCards=[...document.querySelectorAll('.home-modules>.home-module-card')];
    const homeCarouselDots=[...document.querySelectorAll('.home-carousel-dots button')];
    const text=value=>String(value??'').trim();
    const compareDataRows=(a,b)=>{
      for(const column of [COL.wordNo,COL.posNo,COL.meaningNo,COL.exampleNo]){
        const aNumber=Number.parseInt(text(a?.[column]),10);
        const bNumber=Number.parseInt(text(b?.[column]),10);
        const difference=(Number.isFinite(aNumber)?aNumber:Number.MAX_SAFE_INTEGER)-(Number.isFinite(bNumber)?bNumber:Number.MAX_SAFE_INTEGER);
        if(difference)return difference;
      }
      return 0;
    };
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
      request.onupgradeneeded=()=>{
        if(!request.result.objectStoreNames.contains('app'))request.result.createObjectStore('app');
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    let importedDataPromise=null;
    let pendingImportedDataSave=null;
    let importedDataSaveActive=false;
    const writeImportedData=async payload=>{
      const database=await openDatabase();
      try{
        await new Promise((resolve,reject)=>{
          const transaction=database.transaction('app','readwrite');
          transaction.objectStore('app').put(payload,'importedExcel');
          transaction.oncomplete=resolve;
          transaction.onerror=()=>reject(transaction.error);
          transaction.onabort=()=>reject(transaction.error||new Error('データ保存が中断されました。'));
        });
      }finally{database.close()}
      importedDataPromise=Promise.resolve(payload);
    };
    const drainImportedDataSaves=async()=>{
      if(importedDataSaveActive)return;
      importedDataSaveActive=true;
      try{
        while(pendingImportedDataSave){
          const batch=pendingImportedDataSave;
          pendingImportedDataSave=null;
          try{
            await writeImportedData(batch.payload);
            batch.waiters.forEach(waiter=>waiter.resolve());
          }catch(error){batch.waiters.forEach(waiter=>waiter.reject(error))}
        }
      }finally{
        importedDataSaveActive=false;
        if(pendingImportedDataSave)drainImportedDataSaves();
      }
    };
    const saveImportedData=payload=>new Promise((resolve,reject)=>{
      if(pendingImportedDataSave){
        pendingImportedDataSave.payload=payload;
        pendingImportedDataSave.waiters.push({resolve,reject});
      }else pendingImportedDataSave={payload,waiters:[{resolve,reject}]};
      drainImportedDataSaves();
    });
    const activePracticeAdapter=()=>window.flovoPracticeAdapter?.active?window.flovoPracticeAdapter:null;
    const getPracticeSourceData=()=>activePracticeAdapter()?.getData?.()||getImportedData();
    const savePracticeSourceData=stored=>activePracticeAdapter()?.saveData?.(stored)||saveImportedData(stored);
    const loadImportedData=async()=>{
      const database=await openDatabase();
      try{
        return await new Promise((resolve,reject)=>{
          const transaction=database.transaction('app','readonly');
          const request=transaction.objectStore('app').get('importedExcel');
          request.onsuccess=()=>resolve(request.result);
          request.onerror=()=>reject(request.error);
          transaction.onabort=()=>reject(transaction.error||new Error('データ読込が中断されました。'));
        });
      }finally{database.close()}
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
        if(typeof XLSX==='undefined')throw new Error('Excel書出機能を準備できませんでした。通信状態を確認してください。');
        const sortedRows=[...stored.rows].sort(compareDataRows);
        const exportData={...stored,rows:sortedRows};
        let bytes;
        if(stored.fileBytes)bytes=writeRowsIntoOriginalWorkbook(exportData);
        else{
          const sheet=XLSX.utils.aoa_to_sheet([stored.headers,...sortedRows]);
          const workbook=XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook,sheet,'単語リスト');
          bytes=XLSX.write(workbook,{bookType:'xlsx',type:'array',cellStyles:true});
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
    const filterSections=[...document.querySelectorAll('#filterCard .filter-section:not([data-filter-section="text"]):not([data-filter-section="word"])')];
    const subgroupAllButtons=[...document.querySelectorAll('#filterCard .group .all')];
    const levelChoices=[...document.querySelectorAll('#filterCard [data-level-mode]')];
    const levelIncludeChoices=levelChoices.filter(choice=>choice.dataset.levelMode==='include');
    const levelExcludeChoices=levelChoices.filter(choice=>choice.dataset.levelMode==='exclude');
    const levelFilterSection=document.querySelector('#filterCard [data-filter-section="word"]');
    const levelFilterReset=levelFilterSection.querySelector('[data-level-filter-reset]');
    const partChoices=[...document.querySelectorAll('#filterCard .part-group .choice')];
    const understandingChoices=[...document.querySelectorAll('#filterCard .understanding .choice')];
    const wordStartsWith=document.getElementById('wordStartsWith');
    const wordEndsWith=document.getElementById('wordEndsWith');
    const wordIncludes=document.getElementById('wordIncludes');
    const wordFrom=document.getElementById('wordFrom');
    const wordRegex=document.getElementById('wordRegex');
    const wordRegexWarning=document.getElementById('wordRegexWarning');
    const answerCountFilters=document.querySelector('#filterCard [data-answer-count-filters]');
    const practiceDisplayLimit=document.getElementById('practiceDisplayLimit');
    const practiceDisplayLimitAll=document.getElementById('practiceDisplayLimitAll');
    const practiceDisplayLimitWarning=document.getElementById('practiceDisplayLimitWarning');
    const wordTextFilterReset=document.getElementById('wordTextFilterReset');
    const allFilterChoices=[...levelChoices,...partChoices,...understandingChoices];
    const selectableFilterChoices=[...partChoices,...understandingChoices];
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
    const practiceAnswer=practiceReveal.closest('.practice-answer');
    const practiceAudio=document.getElementById('practiceAudio');
    const practiceJapaneseAudio=document.getElementById('practiceJapaneseAudio');
    const practiceJapaneseCopy=document.getElementById('practiceJapaneseCopy');
    const practiceEnglishCopy=document.getElementById('practiceEnglishCopy');
    const practiceJapaneseEdit=document.getElementById('practiceJapaneseEdit');
    const practiceEnglishEdit=document.getElementById('practiceEnglishEdit');
    const sentenceEditorOverlay=document.getElementById('sentenceEditorOverlay');
    const sentenceEditorSheet=sentenceEditorOverlay.querySelector('.sentence-editor-sheet');
    const sentenceEditorTitle=document.getElementById('sentenceEditorTitle');
    const sentenceEditorInput=document.getElementById('sentenceEditorInput');
    const sentenceEditorMessage=document.getElementById('sentenceEditorMessage');
    const sentenceEditorCancel=document.getElementById('sentenceEditorCancel');
    const sentenceEditorSave=document.getElementById('sentenceEditorSave');
    const practiceResultEdit=document.getElementById('practiceResultEdit');
    const resultEditorOverlay=document.getElementById('resultEditorOverlay');
    const resultEditorCancel=document.getElementById('resultEditorCancel');
    const resultEditorSave=document.getElementById('resultEditorSave');
    const resultEditorResetAll=document.getElementById('resultEditorResetAll');
    const resultEditorMessage=document.getElementById('resultEditorMessage');
    const resultEditorInputs={correct:document.getElementById('resultEditorCorrect'),unsure:document.getElementById('resultEditorUnsure'),wrong:document.getElementById('resultEditorWrong')};
    const practiceJapaneseStop=document.getElementById('practiceJapaneseStop');
    const practiceEnglishStop=document.getElementById('practiceEnglishStop');
    const practiceWord=document.getElementById('practiceWord');
    const practiceWordCopy=document.getElementById('practiceWordCopy');
    const practiceWordNumber=document.getElementById('practiceWordNumber');
    const practicePart=document.getElementById('practicePart');
    const practiceMeaningExampleNumber=document.getElementById('practiceMeaningExampleNumber');
    const practiceLevels=document.getElementById('practiceLevels');
    const practiceMeaning=document.getElementById('practiceMeaning');
    const practiceMeaningEdit=document.getElementById('practiceMeaningEdit');
    const practiceMeaningCopy=document.getElementById('practiceMeaningCopy');
    const practicePronUs=document.getElementById('practicePronUs');
    const practicePronUk=document.getElementById('practicePronUk');
    const practicePronUsAudio=document.getElementById('practicePronUsAudio');
    const practicePronUkAudio=document.getElementById('practicePronUkAudio');
    const practiceNote=document.getElementById('practiceNote');
    const practiceNoteButton=document.getElementById('practiceNoteButton');
    const practiceNotePopover=document.getElementById('practiceNotePopover');
    const practiceNoteEdit=document.getElementById('practiceNoteEdit');
    const practiceNoteCopy=document.getElementById('practiceNoteCopy');

    const fitPracticeWord=()=>{
      if(!practiceWord)return;
      const maxSize=1.3;
      const minSize=.58;
      practiceWord.style.fontSize=`${maxSize}rem`;
      if(!practiceWord.clientWidth||practiceWord.scrollWidth<=practiceWord.clientWidth)return;
      let low=minSize;
      let high=maxSize;
      for(let index=0;index<9;index+=1){
        const size=(low+high)/2;
        practiceWord.style.fontSize=`${size}rem`;
        if(practiceWord.scrollWidth<=practiceWord.clientWidth)low=size;
        else high=size;
      }
      practiceWord.style.fontSize=`${low}rem`;
    };

    const schedulePracticeWordFit=()=>requestAnimationFrame(fitPracticeWord);
    if('ResizeObserver' in window)new ResizeObserver(schedulePracticeWordFit).observe(practiceWord.parentElement);
    else window.addEventListener('resize',schedulePracticeWordFit);
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
    const cardWordSticky=cardEditorOverlay.querySelector('.card-word-sticky');
    const cardEditorBody=cardEditorOverlay.querySelector('.card-editor-body');
    const cardEditorHandle=cardEditorOverlay.querySelector('.practice-filter-handle');
    const cardEditorTitle=document.getElementById('cardEditorTitle');
    const cardEditorCancel=document.getElementById('cardEditorCancel');
    const cardEditorSave=document.getElementById('cardEditorSave');
    const cardEditorConfirm=document.createElement('div');cardEditorConfirm.className='card-editor-confirm';cardEditorConfirm.hidden=true;
    const cardEditorConfirmPanel=document.createElement('section');cardEditorConfirmPanel.className='card-editor-confirm-panel';
    const cardEditorConfirmTitle=document.createElement('h3');
    const cardEditorConfirmChanges=document.createElement('div');cardEditorConfirmChanges.className='card-editor-confirm-changes';
    const cardEditorConfirmActions=document.createElement('div');cardEditorConfirmActions.className='card-editor-confirm-actions';
    const cardEditorConfirmCancel=document.createElement('button');cardEditorConfirmCancel.type='button';cardEditorConfirmCancel.textContent='編集画面に戻る';
    const cardEditorConfirmOk=document.createElement('button');cardEditorConfirmOk.type='button';cardEditorConfirmOk.textContent='OK';
    cardEditorConfirmActions.append(cardEditorConfirmCancel,cardEditorConfirmOk);cardEditorConfirmPanel.append(cardEditorConfirmTitle,cardEditorConfirmChanges,cardEditorConfirmActions);cardEditorConfirm.append(cardEditorConfirmPanel);cardEditorSheet.append(cardEditorConfirm);
    const cardWordStep=document.getElementById('cardWordStep');
    const cardWordFilterToggle=document.getElementById('cardWordFilterToggle');
    const cardWordFilterPanel=document.getElementById('cardWordFilterPanel');
    const cardWordSearchRow=document.getElementById('cardWordSearchRow');
    const cardWordSearch=document.getElementById('cardWordSearch');
    const cardWordResults=document.getElementById('cardWordResults');
    const cardWordResultsShell=document.createElement('div');cardWordResultsShell.className='card-word-results-shell';
    const cardWordScrollbar=document.createElement('div');cardWordScrollbar.className='card-word-scrollbar';cardWordScrollbar.setAttribute('role','scrollbar');cardWordScrollbar.setAttribute('aria-label','単語候補のスクロール');cardWordScrollbar.setAttribute('aria-orientation','vertical');cardWordScrollbar.tabIndex=0;
    const cardWordScrollThumb=document.createElement('span');cardWordScrollThumb.className='card-word-scroll-thumb';cardWordScrollbar.append(cardWordScrollThumb);
    cardWordResults.before(cardWordResultsShell);cardWordResultsShell.append(cardWordResults,cardWordScrollbar);
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
    const cardMeaningNew=document.getElementById('cardMeaningNew');
    const cardMeaningChanged=document.getElementById('cardMeaningChanged');
    const cardMeaningEditActions=document.getElementById('cardMeaningEditActions');
    const cardMeaningKeep=document.getElementById('cardMeaningKeep');
    const cardMeaningChange=document.getElementById('cardMeaningChange');
    const cardMeaningReselect=document.getElementById('cardMeaningReselect');
    const cardExampleStep=document.getElementById('cardExampleStep');
    const cardExampleCarousel=document.getElementById('cardExampleCarousel');
    const cardExampleCommit=document.getElementById('cardExampleCommit');
    const cardSelectAllFilters=document.getElementById('cardSelectAllFilters');
    const cardEditorRevealObserver=new MutationObserver(mutations=>{
      mutations.forEach(mutation=>{
        const target=mutation.target;
        if(!(target instanceof HTMLElement)||target.hidden||target===cardEditorOverlay||target.closest('[hidden]')||typeof target.animate!=='function')return;
        if(target.getAnimations().some(animation=>animation.playState==='running'))return;
        target.animate([{opacity:0},{opacity:1}],{duration:420,easing:'ease-in-out'});
      });
    });
    cardEditorRevealObserver.observe(cardEditorOverlay,{subtree:true,attributes:true,attributeFilter:['hidden']});
    const cardFilterWordCount=document.createElement('strong');
    const cardFilterExampleCount=document.createElement('strong');
    const cardFilterCounts=document.createElement('div');cardFilterCounts.className='filter-result-counts';
    const cardFilterWordSummary=document.createElement('span');const cardFilterWordLabel=document.createElement('b');cardFilterWordLabel.textContent='単語数';cardFilterWordSummary.append(cardFilterWordLabel,cardFilterWordCount);
    const cardFilterExampleSummary=document.createElement('span');const cardFilterExampleLabel=document.createElement('b');cardFilterExampleLabel.textContent='例文数';cardFilterExampleSummary.append(cardFilterExampleLabel,cardFilterExampleCount);cardFilterCounts.append(cardFilterWordSummary,cardFilterExampleSummary);
    const cardFilterStickySummary=document.createElement('div');cardFilterStickySummary.className='card-filter-sticky-summary';cardFilterStickySummary.hidden=true;cardFilterStickySummary.append(cardFilterCounts,cardSelectAllFilters);cardWordSticky.append(cardFilterStickySummary);
    const sharedCardFilterSections=[...document.querySelectorAll('#filterCard .filter-section')].map(section=>section.cloneNode(true));
    sharedCardFilterSections.forEach(section=>section.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id')));
    cardWordFilterPanel.replaceChildren(...sharedCardFilterSections);
    const cardFilterStartsWith=cardWordFilterPanel.querySelector('[data-word-text-filter="starts"]');
    const cardFilterEndsWith=cardWordFilterPanel.querySelector('[data-word-text-filter="ends"]');
    const cardFilterIncludes=cardWordFilterPanel.querySelector('[data-word-text-filter="includes"]');
    const cardFilterFrom=cardWordFilterPanel.querySelector('[data-word-text-filter="from"]');
    const cardFilterRegex=cardWordFilterPanel.querySelector('[data-word-text-filter="regex"]');
    const cardRegexWarning=cardWordFilterPanel.querySelector('[data-regex-warning]');
    const cardAnswerCountFilters=cardWordFilterPanel.querySelector('[data-answer-count-filters]');
    cardRegexWarning.id='cardWordRegexWarning';cardFilterRegex.setAttribute('aria-describedby',cardRegexWarning.id);
    const cardTextFilterReset=cardWordFilterPanel.querySelector('.word-text-reset');
    const cardFilterLevelChoices=[...cardWordFilterPanel.querySelectorAll('[data-level-mode]')];
    const cardFilterLevelIncludeChoices=cardFilterLevelChoices.filter(choice=>choice.dataset.levelMode==='include');
    const cardFilterLevelExcludeChoices=cardFilterLevelChoices.filter(choice=>choice.dataset.levelMode==='exclude');
    const cardLevelFilterSection=cardWordFilterPanel.querySelector('[data-filter-section="word"]');
    const cardLevelFilterReset=cardLevelFilterSection.querySelector('[data-level-filter-reset]');
    const cardFilterPartChoices=[...cardWordFilterPanel.querySelectorAll('.part-group .choice')];
    const cardFilterUnderstandingChoices=[...cardWordFilterPanel.querySelectorAll('.understanding .choice')];
    const cardFilterMeaningCountChoices=[...cardWordFilterPanel.querySelectorAll('.meaning-count-group .choice')];
    const cardFilterExampleCountChoices=[...cardWordFilterPanel.querySelectorAll('.example-count-group .choice')];
    const cardFilterSections=[...cardWordFilterPanel.querySelectorAll('.filter-section:not([data-filter-section="text"]):not([data-filter-section="word"])')];
    const practiceRatingButtons=[...document.querySelectorAll('.practice-rating-button')];
    const practiceResultActions=document.getElementById('practiceResultActions');
    const practiceResultButtons=[...document.querySelectorAll('.practice-result-button')];
    const practiceCorrectCount=document.getElementById('practiceCorrectCount');
    const practiceUnsureCount=document.getElementById('practiceUnsureCount');
    const practiceWrongCount=document.getElementById('practiceWrongCount');
    const setSentenceSpeaking=(button,active,showStop=true)=>{
      button.classList.toggle('speaking',active);
      const stopButton=button===practiceJapaneseAudio?practiceJapaneseStop:practiceEnglishStop;
      stopButton.hidden=!active||!showStop;
    };
    const clearSentenceSpeaking=()=>{
      setSentenceSpeaking(practiceJapaneseAudio,false);
      setSentenceSpeaking(practiceAudio,false);
    };
    let activeManualSpeech=null;
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
    const practiceFilterFixedSummary=document.getElementById('practiceFilterFixedSummary');
    const practiceFilterSheetBody=document.getElementById('practiceFilterSheetBody');
    const practiceFilterCancel=document.getElementById('practiceFilterCancel');
    const practiceFilterClose=document.getElementById('practiceFilterClose');
    const filterCard=document.getElementById('filterCard');
    const filterCardSectionHead=filterCard.querySelector(':scope > .section-head');
    const filterCardHomeParent=filterCard.parentNode;
    const filterCardHomeNext=filterCard.nextSibling;
    const practiceSettingsTab=document.getElementById('practiceSettingsTab');
    const practiceSettingsOverlay=document.getElementById('practiceSettingsOverlay');
    const practiceSettingsClose=document.getElementById('practiceSettingsClose');
    const practiceLearningReset=document.getElementById('practiceLearningReset');
    const learningResetOverlay=document.getElementById('learningResetOverlay');
    const learningResetCancel=document.getElementById('learningResetCancel');
    const learningResetConfirm=document.getElementById('learningResetConfirm');
    const japanesePauseSetting=document.getElementById('japanesePauseSetting');
    const englishPauseSetting=document.getElementById('englishPauseSetting');
    const englishRepeatSetting=document.getElementById('englishRepeatSetting');
    const japaneseRateSetting=document.getElementById('japaneseRateSetting');
    const englishRateSetting=document.getElementById('englishRateSetting');
    const japanesePauseMenu=document.getElementById('japanesePauseMenu');
    const englishPauseMenu=document.getElementById('englishPauseMenu');
    const englishRepeatMenu=document.getElementById('englishRepeatMenu');
    const japaneseRateMenu=document.getElementById('japaneseRateMenu');
    const englishRateMenu=document.getElementById('englishRateMenu');
    document.querySelectorAll('.part-group').forEach(group=>{
      const rank=group.querySelector('.group-title span')?.textContent.trim().slice(-1);
      const tone={S:'red',A:'orange',B:'yellow',C:'green',D:'purple'}[rank];
      if(tone)group.querySelectorAll('.choice').forEach(button=>button.classList.add(tone));
    });
    const understandingTones={'未登録':'purple','0%':'red','50%':'orange','80%':'yellow','100%':'green'};
    understandingChoices.forEach(button=>button.classList.add(understandingTones[button.dataset.value||button.textContent.trim()]));
    const selectedValues=buttons=>new Set(buttons.filter(button=>button.classList.contains('selected')).map(button=>button.dataset.value||button.textContent.trim()));
    const PRACTICE_FILTER_STORAGE_KEY='flovo-practice-filter-v1';
    const PRACTICE_TEXT_FILTER_STORAGE_KEY='flovo-practice-text-filter-v1';
    const CARD_FILTER_STORAGE_KEY='flovo-card-filter-v1';
    const CARD_TEXT_FILTER_STORAGE_KEY='flovo-card-text-filter-v1';
    const filterChoiceKey=choice=>`${choice.closest('.filter-section')?.dataset.filterSection||''}|${choice.dataset.levelMode||choice.closest('.group')?.querySelector('.group-title span')?.textContent.trim()||''}|${choice.dataset.value||choice.textContent.trim()}`;
    const saveFilterSelection=(key,choices)=>{try{localStorage.setItem(key,JSON.stringify(choices.filter(choice=>choice.classList.contains('selected')).map(filterChoiceKey)))}catch{}};
    const restoreFilterSelection=(key,choices)=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(!Array.isArray(saved))return false;const selected=new Set(saved);choices.forEach(choice=>choice.classList.toggle('selected',selected.has(filterChoiceKey(choice))));return true}catch{return false}};
    const parseWordRegex=value=>{const pattern=text(value);if(!pattern)return null;try{return new RegExp(pattern,'i')}catch{return false}};
    const syncWordRegexValidity=(input,warning)=>{const valid=parseWordRegex(input.value)!==false;input.setAttribute('aria-invalid',String(!valid));warning.hidden=valid;return valid};
    const syncDisplayLimitValidity=()=>{const value=practiceDisplayLimit.value;const active=value!=='';const valid=!active||(Number.isInteger(Number(value))&&Number(value)>=1);practiceDisplayLimit.setAttribute('aria-invalid',String(!valid));practiceDisplayLimitWarning.hidden=valid;practiceDisplayLimitAll.disabled=!active;practiceDisplayLimitAll.classList.toggle('selected',active);practiceDisplayLimitAll.setAttribute('aria-pressed',String(active));return valid};
    const applyDisplayLimit=()=>{practiceButton.dataset.questionLimit=practiceDisplayLimit.value===''?'all':practiceDisplayLimit.value};
    const answerCountColumns={correct:COL.correctCount,unsure:COL.questionCount,wrong:COL.wrongCount};
    const getAnswerCountValues=container=>Object.fromEntries([...container.querySelectorAll('[data-answer-count]')].map(row=>{
      const key=row.dataset.answerCount;return [key,{min:row.querySelector('[data-answer-bound="min"]').value,max:row.querySelector('[data-answer-bound="max"]').value,mode:row.querySelector('[data-answer-mode].selected')?.dataset.answerMode||'any'}];
    }));
    const setAnswerCountMode=(row,mode)=>row.querySelectorAll('[data-answer-mode]').forEach(button=>{const selected=button.dataset.answerMode===mode;button.classList.toggle('selected',selected);button.setAttribute('aria-checked',String(selected))});
    const restoreAnswerCountValues=(container,values={})=>{
      container.querySelectorAll('[data-answer-count]').forEach(row=>{
        const saved=values[row.dataset.answerCount]||{};
        row.querySelector('[data-answer-bound="min"]').value=saved.min??'';
        row.querySelector('[data-answer-bound="max"]').value=saved.max??'';
        const hasValue=(saved.min??'')!==''||(saved.max??'')!=='';setAnswerCountMode(row,saved.mode|| (hasValue?'and':'any'));
      });
    };
    const readAnswerCountFilters=container=>{
      let valid=true;const filters={};
      container.querySelectorAll('[data-answer-count]').forEach(row=>{
        const minValue=row.querySelector('[data-answer-bound="min"]').value;
        const maxValue=row.querySelector('[data-answer-bound="max"]').value;
        const min=minValue===''?null:Number(minValue);const max=maxValue===''?null:Number(maxValue);
        const mode=row.querySelector('[data-answer-mode].selected')?.dataset.answerMode||'any';
        const values=[min,max].filter(value=>value!==null);
        if(values.some(value=>!Number.isInteger(value)||value<0)||(min!==null&&max!==null&&min>max))valid=false;
        filters[row.dataset.answerCount]={min,max,mode};
      });
      container.querySelector('[data-answer-count-warning]').hidden=valid;
      return {filters,valid};
    };
    const syncAnswerCountRows=container=>container.querySelectorAll('[data-answer-count]').forEach(row=>{const selected=row.querySelector('[data-answer-mode].selected');setAnswerCountMode(row,selected?.dataset.answerMode||'any')});
    const resetAnswerCountFilters=container=>{container.querySelectorAll('[data-answer-count]').forEach(row=>{row.querySelectorAll('input').forEach(input=>{input.value=''});setAnswerCountMode(row,'any')});readAnswerCountFilters(container)};
    const bindAnswerCountFilters=(container,onChange)=>{
      container.querySelectorAll('[data-answer-count]').forEach(row=>{
        row.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
          const hasValue=[...row.querySelectorAll('input')].some(field=>field.value!=='');const mode=row.querySelector('[data-answer-mode].selected')?.dataset.answerMode;
          if(!hasValue)setAnswerCountMode(row,'any');else if(mode==='any')setAnswerCountMode(row,'and');
          readAnswerCountFilters(container);onChange();
        }));
        row.querySelectorAll('[data-answer-mode]').forEach(button=>button.addEventListener('click',()=>{
          const mode=button.dataset.answerMode;setAnswerCountMode(row,mode);
          if(mode==='any')row.querySelectorAll('input').forEach(input=>{input.value=''});
          readAnswerCountFilters(container);onChange();
        }));
      });
      syncAnswerCountRows(container);readAnswerCountFilters(container);
    };
    const matchesAnswerCountFilters=(row,state)=>{
      const active=Object.entries(state.filters).filter(([,filter])=>filter.mode!=='any'&&(filter.min!==null||filter.max!==null));
      const matches=([key,{min,max}])=>{const count=Number.parseInt(text(row[answerCountColumns[key]]),10)||0;return (min===null||count>=min)&&(max===null||count<=max)};
      const andFilters=active.filter(([,filter])=>filter.mode!=='or');const orFilters=active.filter(([,filter])=>filter.mode==='or');
      return andFilters.every(matches)&&(!orFilters.length||orFilters.some(matches));
    };
    const hasAnswerCountFilters=state=>Object.values(state.filters).some(({min,max,mode})=>mode!=='any'&&(min!==null||max!==null));
    const savePracticeTextFilters=()=>{try{localStorage.setItem(PRACTICE_TEXT_FILTER_STORAGE_KEY,JSON.stringify({startsWith:wordStartsWith.value,endsWith:wordEndsWith.value,includes:wordIncludes.value,from:wordFrom.value,regex:wordRegex.value,displayLimit:practiceDisplayLimit.value,answerCounts:getAnswerCountValues(answerCountFilters)}))}catch{}};
    const restorePracticeTextFilters=()=>{try{const saved=JSON.parse(localStorage.getItem(PRACTICE_TEXT_FILTER_STORAGE_KEY)||'null');if(!saved||typeof saved!=='object')return;wordStartsWith.value=saved.startsWith||'';wordEndsWith.value=saved.endsWith||'';wordIncludes.value=saved.includes||'';wordFrom.value=saved.from||'';wordRegex.value=saved.regex||'';practiceDisplayLimit.value=saved.displayLimit||'';restoreAnswerCountValues(answerCountFilters,saved.answerCounts)}catch{}};
    const fiveDigitCountMarkup=value=>{
      const number=Math.min(99999,Math.max(0,Math.trunc(Number(value)||0)));const digits=String(number);const padding='0'.repeat(5-digits.length);
      return `<span class="count-padding">${padding}</span><span class="count-value">${digits}</span>`;
    };
    const renderCountFraction=(element,value,total)=>{if(element)element.innerHTML=`<span class="count-current">${fiveDigitCountMarkup(value)}</span><span class="count-separator">/</span><span class="count-total">${fiveDigitCountMarkup(total)}</span>`};
    const countCategory=count=>count===0?'0':count===1?'1':'multiple';
    const matchesLevelFilters=(row,includeChoices,excludeChoices)=>{
      const included=selectedValues(includeChoices);const excluded=selectedValues(excludeChoices);
      const values=[text(row[COL.sLevel]),text(row[COL.wLevel])].filter(Boolean);
      return (!included.size||values.some(value=>included.has(value)))&&!values.some(value=>excluded.has(value));
    };
    const buildVocabularyCounts=rows=>{
      const result=new Map();
      (rows||[]).forEach(row=>{
        const key=vocabularyKey(row);if(!key)return;
        if(!result.has(key))result.set(key,{meanings:new Set(),examples:0});
        const entry=result.get(key);const meaning=text(row[COL.meaning]);
        if(meaning)entry.meanings.add(`${text(row[COL.meaningNo])}\u0000${meaning}`);
        if(text(row[COL.japanese])&&text(row[COL.english]))entry.examples+=1;
      });
      return result;
    };
    const getMatchingRows=rows=>{
      const externalPractice=Boolean(activePracticeAdapter());
      const parts=selectedValues(partChoices);
      const understandings=selectedValues(understandingChoices);
      const startsWith=text(wordStartsWith.value).toLowerCase();
      const endsWith=text(wordEndsWith.value).toLowerCase();
      const includes=text(wordIncludes.value).toLowerCase();
      const from=text(wordFrom.value).toLowerCase();
      const regex=parseWordRegex(wordRegex.value);
      const answerCounts=readAnswerCountFilters(answerCountFilters);
      if(regex===false||!answerCounts.valid)return [];
      return …21342 tokens truncated…dFilterPanel.hidden=true;cardFilterStickySummary.hidden=true;cardWordFilterToggle.setAttribute('aria-expanded','false');cardEditorBody.scrollTop=0;cardWordFilterPanel.scrollTop=0;
      cardEditorOverlay.classList.remove('open');
      await wait(340);
      if(animationRun!==cardEditorAnimationRun)return;
      cardEditorOverlay.hidden=true;cardEditorRow=null;selectedVocabularyRow=null;selectedMeaningMode=null;pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];cardExampleCommitStatus=new Map();
      if(!practiceScreen.hidden)(practiceViewMode==='card'?practiceCardMenu:practiceList.querySelector('[aria-current="true"] .practice-list-menu'))?.focus({preventScroll:true});
    };
    const requestCardEditorClose=async()=>{
      if(!cardEditorConfirm.hidden)return;
      const confirmed=await showCardEditorConfirmation([],true);
      if(!confirmed)return;
      await closeCardEditor(true);
    };
    const refreshPracticeAfterMutation=()=>{
      practiceRows=getMatchingRows(practiceStored?.rows||[]);
      const limit=practiceButton.dataset.questionLimit==='all'?practiceRows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=practiceRows.slice(0,limit);
      setPracticeIndex(Math.max(0,Math.min(practiceIndex,practiceRows.length-1)));
      renderPracticeList();
      if(practiceRows.length)renderPracticeQuestion();
    };
    practiceCardAdd.addEventListener('click',()=>openCardEditor('add'));
    cardWordSearch.addEventListener('input',()=>{if(!cardWordSearch.disabled)renderWordResults()});
    cardWordSearch.addEventListener('focus',()=>{if(!cardWordSearch.disabled)renderWordResults()});
    cardWordReselect.addEventListener('click',()=>{
      if(blockUnregisteredCardExampleChanges())return;
      if(blockIncompleteExamples())return;
      selectedVocabularyRow=null;selectedMeaningMode=null;pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];cardExampleCarousel.replaceChildren();cardWordStep.classList.remove('has-selection');cardSelectedWord.hidden=true;cardWordSearchRow.hidden=false;cardWordSearch.disabled=false;cardWordSearch.value='';cardMeaningStep.classList.remove('is-choosing');cardMeaningStep.hidden=true;cardMeaningField.hidden=true;cardMeaningNumberBadge.hidden=true;cardMeaningConfirm.hidden=true;cardSelectedMeaning.hidden=true;cardMeaningChanged.hidden=true;cardMeaningEditActions.hidden=true;cardMeaningReselect.hidden=true;cardMeaningInput.value='';cardExampleStep.hidden=true;syncCardEditorMessages();renderWordResults();
    });
    cardMeaningReselect.addEventListener('click',async()=>{
      if(blockUnregisteredCardExampleChanges())return;
      if(blockIncompleteExamples())return;
      await fadeMeaningTransition([cardSelectedMeaning,cardMeaningNew,cardMeaningChanged,cardMeaningReselect,cardMeaningField,cardMeaningConfirm,cardExampleStep],()=>{
        cardMeaningReselect.hidden=true;cardExampleStep.hidden=true;
        renderMeaningResults(false);
      },[cardMeaningResults,cardMeaningEditActions,cardMeaningMessage]);
    });
    cardMeaningKeep.addEventListener('click',async()=>{
      const choice=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
      await fadeMeaningTransition([cardMeaningEditActions,cardMeaningMessage],()=>{
        selectedMeaningMode=cardEditorMode==='edit'?'unchanged':'existing';cardMeaningInput.value=choice.value;cardMeaningEditActions.hidden=true;
        showCardExampleEditor();syncCardEditorMessages();
      },[cardExampleStep]);
    });
    cardMeaningChange.addEventListener('click',async()=>{
      const choice=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
      await fadeMeaningTransition([cardMeaningEditActions,cardSelectedMeaning],()=>{
        selectedMeaningMode='change-draft';cardMeaningEditActions.hidden=true;cardSelectedMeaning.hidden=true;cardMeaningInput.value=choice.value;
        cardMeaningNumberBadge.className='practice-meta-chip';cardMeaningNumberBadge.textContent=formatSingleDigitNumber(choice.number);cardMeaningNumberBadge.hidden=false;
        cardMeaningField.hidden=false;cardMeaningConfirm.textContent='この意味を登録';cardMeaningConfirm.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
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
        let stagedRow=samePair.find(row=>text(row[COL.meaningNo])===number&&!text(row[COL.meaning]));
        if(!stagedRow){
          stagedRow=[...selectedVocabularyRow];let insertIndex=-1;practiceStored.rows.forEach((row,index)=>{if(vocabularyKey(row)===pairKey)insertIndex=index});practiceStored.rows.splice(insertIndex>=0?insertIndex+1:practiceStored.rows.length,0,stagedRow);
        }
        stagedRow[COL.meaningNo]=number;stagedRow[COL.meaning]=value;stagedRow[COL.exampleNo]='';stagedRow[COL.japanese]='';stagedRow[COL.english]='';stagedRow[COL.note]='';stagedRow[COL.understanding]='';stagedRow[COL.correctCount]=0;stagedRow[COL.wrongCount]=0;stagedRow[COL.questionCount]=0;cardEditorHasStagedChanges=true;
      }else{
        const original=pendingMeaningChoice||{number:text(cardEditorRow?.[COL.meaningNo]),value:text(cardEditorRow?.[COL.meaning])};
        const oldValue=original.value;
        const currentNumber=original.number;
        const others=cardEditorMode==='edit'?samePair.filter(row=>row!==cardEditorRow):samePair;
        const duplicate=others.find(row=>text(row[COL.meaningNo])!==currentNumber&&normalizedMeaning(row[COL.meaning])===normalizedMeaning(value));
        if(duplicate){alert('同じ意味がすでに登録されています。');return}
        number=currentNumber;
        if(value!==oldValue){samePair.filter(row=>text(row[COL.meaningNo])===currentNumber).forEach(row=>{row[COL.meaning]=value});cardEditorHasStagedChanges=true}
        changed=value!==oldValue;mode=changed?'changed':'unchanged';
      }
      await fadeMeaningTransition([cardMeaningField,cardMeaningConfirm,cardMeaningMessage],()=>{
        selectedMeaningMode=mode;cardMeaningField.hidden=true;cardMeaningConfirm.hidden=true;
        showSelectedMeaning(number,value,changed);showCardExampleEditor();syncCardEditorMessages();
      },[cardSelectedMeaning,cardMeaningChanged,cardExampleStep]);
    });
    cardMeaningInput.addEventListener('input',syncCardEditorMessages);
    cardEditorCancel.addEventListener('click',requestCardEditorClose);
    cardEditorOverlay.addEventListener('click',event=>{if(event.target===cardEditorOverlay)requestCardEditorClose()});
    const nextNumber=(rows,column)=>Math.max(0,...rows.map(row=>Number.parseInt(text(row[column]),10)||0))+1;
    cardEditorSave.addEventListener('click',async()=>{
      if(blockUnregisteredCardExampleChanges())return;
      if(blockIncompleteExamples())return;
      const changes=collectCardEditorChanges();
      const confirmed=await showCardEditorConfirmation(changes);
      if(!confirmed)return;
      if(!changes.length){await closeCardEditor(true);return}
      cardEditorSave.disabled=true;
      try{
        await persistPracticeData();refreshPracticeAfterMutation();cardEditorRowsSnapshot=null;await closeCardEditor(false);
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
        cancelActiveAutoSpeech();
        if('speechSynthesis' in window)speechSynthesis.cancel();
      }
      practiceMoving=true;
      const distance=Math.max(innerWidth*.82,300);
      const outX=delta>0?-distance:distance;
      resetPracticeDrag();
      await animatePracticeCard([{transform:`translateX(${fromX}px)`,opacity:Math.max(.55,1-Math.abs(fromX)/innerWidth*.55)},{transform:`translateX(${outX}px)`,opacity:.08}],{duration:Math.max(120,210-Math.min(Math.abs(fromX),140)),easing:'cubic-bezier(.4,0,1,1)'});
      setPracticeIndex(next);renderPracticeQuestion();
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
    const playbackDefaults={language:'both',repeat:'once',japanesePause:1,englishPause:1,englishRepeats:1,japaneseRate:.9,englishRate:.9};
    let playbackSettings={...playbackDefaults};
    try{
      const savedPlayback=JSON.parse(localStorage.getItem(PLAYBACK_STORAGE_KEY)||'{}');
      playbackSettings={...playbackDefaults,...savedPlayback};
      if(savedPlayback.rate!=null){
        if(savedPlayback.japaneseRate==null)playbackSettings.japaneseRate=savedPlayback.rate;
        if(savedPlayback.englishRate==null)playbackSettings.englishRate=savedPlayback.rate;
      }
      delete playbackSettings.rate;
    }catch{}
    const languageModes=['ja','en','both'];
    const repeatModes=['current','all','once'];
    const languageLabels={ja:'日',en:'英',both:'日・英'};
    const repeatLabels={current:'1問反復',all:'全問周回',once:'1周終了'};
    let autoPlaying=false;
    let playbackRun=0;
    let activeAutoSpeech=null;
    let screenWakeLock=null;
    let screenWakeLockRequest=null;
    let pageActive=true;
    let clearFocusAfterBackground=false;
    const clearActiveFocus=()=>{
      const active=document.activeElement;
      if(active instanceof HTMLElement&&active!==document.body)active.blur();
    };
    const acquireScreenWakeLock=()=>{
      if(!pageActive||document.visibilityState!=='visible'||!('wakeLock' in navigator)||screenWakeLock)return Promise.resolve();
      if(screenWakeLockRequest)return screenWakeLockRequest;
      screenWakeLockRequest=navigator.wakeLock.request('screen').then(lock=>{
        if(!pageActive||document.visibilityState!=='visible'){
          lock.release().catch(()=>{});
          return;
        }
        screenWakeLock=lock;
        lock.addEventListener('release',()=>{
          if(screenWakeLock===lock)screenWakeLock=null;
          if(pageActive&&document.visibilityState==='visible')setTimeout(acquireScreenWakeLock,250);
        });
      }).catch(()=>{}).finally(()=>{screenWakeLockRequest=null});
      return screenWakeLockRequest;
    };
    const releaseScreenWakeLock=()=>{
      const lock=screenWakeLock;
      screenWakeLock=null;
      if(lock&&!lock.released)lock.release().catch(()=>{});
    };
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){clearFocusAfterBackground=true;clearActiveFocus()}
      else if(clearFocusAfterBackground){requestAnimationFrame(clearActiveFocus);clearFocusAfterBackground=false}
      if(pageActive&&document.visibilityState==='visible'){
        acquireScreenWakeLock();
      }else releaseScreenWakeLock();
    });
    window.addEventListener('pageshow',()=>{pageActive=true;if(clearFocusAfterBackground){requestAnimationFrame(clearActiveFocus);clearFocusAfterBackground=false}acquireScreenWakeLock()});
    window.addEventListener('pagehide',()=>{clearFocusAfterBackground=true;clearActiveFocus();pageActive=false;releaseScreenWakeLock()});
    window.addEventListener('focus',acquireScreenWakeLock);
    document.addEventListener('pointerdown',acquireScreenWakeLock,{passive:true});
    acquireScreenWakeLock();
    const savePlaybackSettings=()=>{try{localStorage.setItem(PLAYBACK_STORAGE_KEY,JSON.stringify(playbackSettings))}catch{}};
    const pauseOptions=[0,1,2,3,4,5].map(value=>({value:String(value),label:value===0?'なし':value+'秒'}));
    const repeatOptions=[1,2,3,4,5].map(value=>({value:String(value),label:value+'回'}));
    const rateOptions=Array.from({length:16},(_,index)=>(.5+index*.1).toFixed(1)).map(value=>({value,label:value+'×'}));
    const practiceSettingSpecs=[
      {trigger:japaneseRateSetting,menu:japaneseRateMenu,key:'japaneseRate',options:rateOptions,mode:'wheel'},
      {trigger:englishRateSetting,menu:englishRateMenu,key:'englishRate',options:rateOptions,mode:'wheel'},
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
          spec.menu.hidden=true;
          spec.trigger.setAttribute('aria-expanded','false');
        });
        spec.menu.appendChild(option);
      });
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
      cancelActiveAutoSpeech();
      if('speechSynthesis' in window&&!autoPlaying)speechSynthesis.cancel();
      clearSentenceSpeaking();
      syncPlaybackControls();
    };
    const autoPause=(seconds,run)=>new Promise(resolve=>setTimeout(()=>resolve(run===playbackRun),Math.max(0,Number(seconds))*1000));
    const autoSpeak=(value,lang,button,run)=>new Promise(resolve=>{
      if(!autoPlaying||run!==playbackRun||!('speechSynthesis' in window)){resolve(false);return}
      const utterance=new SpeechSynthesisUtterance(value);
      utterance.lang=lang;
      utterance.rate=Number(lang.startsWith('ja')?playbackSettings.japaneseRate:playbackSettings.englishRate);
      utterance.onstart=()=>setSentenceSpeaking(button,true,false);
      const finish=()=>{
        if(activeAutoSpeech?.utterance===utterance)activeAutoSpeech=null;
        setSentenceSpeaking(button,false,false);
        resolve(run===playbackRun);
      };
      utterance.onend=utterance.onerror=finish;
      activeAutoSpeech={utterance,resolve:()=>{setSentenceSpeaking(button,false,false);resolve(false)}};
      speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    });
    const cancelActiveAutoSpeech=()=>{
      const active=activeAutoSpeech;
      activeAutoSpeech=null;
      if(!active)return;
      active.utterance.onend=null;
      active.utterance.onerror=null;
      active.resolve();
    };
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
          setPracticeIndex(practiceIndex+1);
          renderPracticeQuestion();
          if(practiceViewMode==='list')renderPracticeList();
          continue;
        }
        if(playbackSettings.repeat==='all'){
          setPracticeIndex(0);
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
      acquireScreenWakeLock();
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
      cancelActiveAutoSpeech();
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
      practiceResultActions.hidden=listMode;
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
      setPracticeIndex(index);
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
      if(filterCardSectionHead.parentNode!==filterCard)filterCard.prepend(filterCardSectionHead);
      if(filterCardHomeNext?.parentNode===filterCardHomeParent)filterCardHomeParent.insertBefore(filterCard,filterCardHomeNext);
      else filterCardHomeParent.append(filterCard);
    };
    const openPracticeFilter=()=>{
      if(practiceFilterOpen)return;
      practiceFilterOpen=true;
      practiceFilterSnapshot={choices:allFilterChoices.map(choice=>choice.classList.contains('selected')),text:practiceTextFilterInputs.map(input=>input.value),answerCounts:getAnswerCountValues(answerCountFilters),displayLimit:practiceDisplayLimit.value};
      if(autoPlaying)stopAutoPlayback();
      practiceFilterFixedSummary.append(filterCardSectionHead);
      practiceFilterSheetBody.append(filterCard);
      practiceFilterSheetBody.scrollTop=0;practiceFilterSheetBody.scrollLeft=0;
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
        saveFilterSelection(PRACTICE_FILTER_STORAGE_KEY,allFilterChoices);
        savePracticeTextFilters();
        applyDisplayLimit();
        applyPracticeMethodChange(previousRow);
        setPracticeViewMode(previousViewMode==='card'&&practiceRows.length?'card':'list');
      }
      practiceFilterSnapshot=null;
    };
    const cancelPracticeFilter=()=>{
      if(practiceFilterSnapshot){
        allFilterChoices.forEach((choice,index)=>choice.classList.toggle('selected',practiceFilterSnapshot.choices[index]));
        practiceTextFilterInputs.forEach((input,index)=>{input.value=practiceFilterSnapshot.text[index]||''});
        restoreAnswerCountValues(answerCountFilters,practiceFilterSnapshot.answerCounts);syncAnswerCountRows(answerCountFilters);readAnswerCountFilters(answerCountFilters);
        practiceDisplayLimit.value=practiceFilterSnapshot.displayLimit||'';syncDisplayLimitValidity();
        syncWordTextFilterReset();
        subgroupAllButtons.forEach(button=>syncSubgroupAll(button.closest('.group')));
        filterSections.forEach(section=>syncSectionControls(section,false));syncLevelFilterControls(levelFilterSection);
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
          const dismissResult=onDismiss();
          if(dismissResult===false){
            sheet.style.transform='translateY(0)';overlay.style.backgroundColor='rgba(17,24,39,.45)';setTimeout(clearDragStyles,250);
          }else{
            sheet.style.transform='translateY(104%)';overlay.style.backgroundColor='rgba(17,24,39,0)';setTimeout(clearDragStyles,360);
          }
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
    enableBottomSheetGrab(cardEditorOverlay,cardEditorSheet,cardEditorHandle,()=>closeCardEditor(true));
    const openPractice=async()=>{
      if(screenTransitionBusy)return;
      const stored=await getPracticeSourceData();
      practiceResultLocks=new WeakMap();practiceResultSaving=false;
      let rows=getMatchingRows(stored?.rows||[]);
      if(practiceButton.dataset.order==='random')rows=shuffleRows(rows);
      const limit=practiceButton.dataset.questionLimit==='all'?rows.length:Number(practiceButton.dataset.questionLimit);
      practiceRows=rows.slice(0,limit);
      practiceStored=stored||{headers:[...EXPECTED_HEADERS],rows:[],vocabularyRows:[],fileName:'未読込',modified:true};
      restoreVocabularyRows(practiceStored);
      practiceIndex=0;
      setAnswerVisible(false);
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
    let practiceNoteAnimation=null;
    const syncPracticeNotePosition=()=>{
      const shell=document.querySelector('.shell');
      const questionMeta=practiceExerciseCard.querySelector('.practice-question-meta');
      if(!shell||!questionMeta)return;
      const shellRect=shell.getBoundingClientRect();
      const cardRect=practiceExerciseCard.getBoundingClientRect();
      const metaRect=questionMeta.getBoundingClientRect();
      practiceNotePopover.style.setProperty('--practice-note-top',`${Math.round(metaRect.bottom-shellRect.top+8)}px`);
      practiceNotePopover.style.setProperty('--practice-note-left',`${Math.round(cardRect.left-shellRect.left+10)}px`);
      practiceNotePopover.style.setProperty('--practice-note-right',`${Math.round(shellRect.right-cardRect.right+10)}px`);
      practiceNotePopover.style.setProperty('--practice-note-bottom',`${Math.round(shellRect.bottom-cardRect.bottom+10)}px`);
    };
    const closePracticeNote=async()=>{
      if(practiceNotePopover.hidden)return;
      practiceNoteAnimation?.cancel();
      practiceNoteButton.setAttribute('aria-expanded','false');
      if(practiceNotePopover.animate){
        practiceNoteAnimation=practiceNotePopover.animate([{opacity:1},{opacity:0}],{duration:180,easing:'ease-in',fill:'both'});
        await practiceNoteAnimation.finished.catch(()=>{});
      }
      practiceNotePopover.hidden=true;
      practiceNoteAnimation?.cancel();
      practiceNoteAnimation=null;
      practiceNoteButton.focus({preventScroll:true});
    };
    practiceNoteButton.addEventListener('click',event=>{
      event.stopPropagation();
      const opening=practiceNotePopover.hidden;
      if(!opening){closePracticeNote();return}
      practiceNoteAnimation?.cancel();
      practiceNotePopover.hidden=false;
      syncPracticeNotePosition();
      practiceNoteButton.setAttribute('aria-expanded',String(opening));
      practiceNoteEdit.focus({preventScroll:true});
      if(practiceNotePopover.animate){
        practiceNoteAnimation=practiceNotePopover.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out'});
        practiceNoteAnimation.finished.catch(()=>{}).finally(()=>{practiceNoteAnimation=null});
      }
    });
    practiceNoteEdit.addEventListener('click',event=>{
      event.stopPropagation();
      editPracticeSentence(COL.note,'補足',true);
    });
    practiceNotePopover.addEventListener('click',event=>{
      event.stopPropagation();
      if(!event.target.closest?.('.practice-note-popover'))closePracticeNote();
    });
    window.addEventListener('resize',()=>{if(!practiceNotePopover.hidden)syncPracticeNotePosition()});
    document.addEventListener('click',event=>{if(!practiceNotePopover.hidden&&!event.target.closest?.('#practiceNotePopover,#practiceNoteButton'))closePracticeNote()});
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
    const closePracticeSettings=()=>{closePracticeSettingMenus();practiceSettingsOverlay.hidden=true;practiceSettingsTab.focus({preventScroll:true})};
    practiceSettingsTab.addEventListener('click',()=>{syncPlaybackControls();closePracticeSettingMenus();practiceSettingsOverlay.hidden=false;practiceSettingsClose.focus({preventScroll:true})});
    practiceSettingsClose.addEventListener('click',closePracticeSettings);
    practiceSettingsOverlay.addEventListener('click',event=>{
      closePracticeSettingMenus();
      if(event.target===practiceSettingsOverlay)closePracticeSettings();
    });
    const closeLearningReset=()=>{learningResetOverlay.hidden=true;practiceLearningReset.focus({preventScroll:true})};
    practiceLearningReset.addEventListener('click',()=>{closePracticeSettingMenus();learningResetOverlay.hidden=false;learningResetCancel.focus({preventScroll:true})});
    learningResetCancel.addEventListener('click',closeLearningReset);
    learningResetOverlay.addEventListener('click',event=>{if(event.target===learningResetOverlay)closeLearningReset()});
    learningResetConfirm.addEventListener('click',async()=>{
      if(!practiceStored)return;
      learningResetConfirm.disabled=true;
      const stores=[practiceStored.rows,practiceStored.vocabularyRows].filter(Array.isArray);
      const rows=[...new Set(stores.flat())];
      const snapshots=rows.map(row=>({row,values:[row[COL.understanding],row[COL.correctCount],row[COL.wrongCount],row[COL.questionCount]]}));
      rows.forEach(row=>{row[COL.understanding]='';row[COL.correctCount]=0;row[COL.wrongCount]=0;row[COL.questionCount]=0});
      practiceStored.modified=true;
      try{
        await savePracticeSourceData(practiceStored);
        closeLearningReset();practiceSettingsOverlay.hidden=true;
        if(currentPracticeRow())renderPracticeQuestion();
        renderPracticeList();await refreshQuestionCount();
      }catch{snapshots.forEach(({row,values})=>{row[COL.understanding]=values[0];row[COL.correctCount]=values[1];row[COL.wrongCount]=values[2];row[COL.questionCount]=values[3]});alert('学習データをリセットできませんでした。')}
      finally{learningResetConfirm.disabled=false}
    });
    navHome.addEventListener('click',()=>{if(!practiceScreen.hidden)closePractice()});
    practiceReveal.addEventListener('click',()=>setAnswerVisible(true,true));
    practiceEnglish.addEventListener('click',()=>setAnswerVisible(false,true));
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
    const speakManual=(value,lang,rate,onStart,onFinish)=>{
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      speechSynthesis.resume();
      const utterance=new SpeechSynthesisUtterance(value);
      utterance.lang=lang;
      utterance.rate=Number(rate);
      utterance.onstart=onStart;
      utterance.onend=utterance.onerror=()=>{
        if(activeManualSpeech===utterance)activeManualSpeech=null;
        onFinish();
      };
      activeManualSpeech=utterance;
      speechSynthesis.speak(utterance);
    };
    const speakPracticeWord=(lang,button)=>{
      if(autoPlaying)stopAutoPlayback();
      speakManual(practiceWord.textContent,lang,playbackSettings.englishRate,()=>button.classList.add('speaking'),()=>button.classList.remove('speaking'));
    };
    practicePronUsAudio.addEventListener('click',()=>speakPracticeWord('en-US',practicePronUsAudio));
    practicePronUkAudio.addEventListener('click',()=>speakPracticeWord('en-GB',practicePronUkAudio));
    practiceJapaneseAudio.addEventListener('click',()=>{
      if(autoPlaying)stopAutoPlayback();
      speakManual(practiceJapanese.textContent,'ja-JP',playbackSettings.japaneseRate,()=>setSentenceSpeaking(practiceJapaneseAudio,true),()=>setSentenceSpeaking(practiceJapaneseAudio,false));
    });
    practiceAudio.addEventListener('click',()=>{
      if(autoPlaying)stopAutoPlayback();
      speakManual(practiceEnglish.textContent,'en-US',playbackSettings.englishRate,()=>setSentenceSpeaking(practiceAudio,true),()=>setSentenceSpeaking(practiceAudio,false));
    });
    const stopSentencePlayback=()=>{
      if(autoPlaying)stopAutoPlayback();
      else{
        if('speechSynthesis' in window)speechSynthesis.cancel();
        activeManualSpeech=null;
        clearSentenceSpeaking();
      }
    };
    practiceJapaneseStop.addEventListener('click',stopSentencePlayback);
    practiceEnglishStop.addEventListener('click',stopSentencePlayback);
    const practiceCopyEntries=[
      {button:practiceWordCopy,element:practiceWord,label:'単語をコピー'},
      {button:practiceMeaningCopy,element:practiceMeaning,label:'意味をコピー'},
      {button:practiceNoteCopy,element:practiceNote,label:'補足をコピー'},
      {button:practiceJapaneseCopy,element:practiceJapanese,label:'日本語文をコピー'},
      {button:practiceEnglishCopy,element:practiceEnglish,label:'英文をコピー'}
    ];
    const resetPracticeCopyButton=button=>{
      const entry=practiceCopyEntries.find(candidate=>candidate.button===button);
      button.classList.remove('copied');
      button.removeAttribute('data-copied-text');
      button.setAttribute('aria-label',entry?.label||'コピー');
    };
    const syncPracticeCopyButtons=async()=>{
      const copiedEntries=practiceCopyEntries.filter(({button})=>button.classList.contains('copied'));
      copiedEntries.forEach(({button,element})=>{if(button.dataset.copiedText!==(element.textContent||''))resetPracticeCopyButton(button)});
      const remaining=copiedEntries.filter(({button})=>button.classList.contains('copied'));
      if(!remaining.length||!navigator.clipboard?.readText)return;
      try{
        const clipboardText=await navigator.clipboard.readText();
        remaining.forEach(({button})=>{if(button.dataset.copiedText!==clipboardText)resetPracticeCopyButton(button)});
      }catch{}
    };
    const copyPracticeText=async(element,button)=>{
      const value=element.textContent||'';
      if(!value)return;
      try{
        if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
        else{
          const helper=document.createElement('textarea');
          helper.value=value;helper.setAttribute('readonly','');helper.style.position='fixed';helper.style.opacity='0';
          document.body.append(helper);helper.select();document.execCommand('copy');helper.remove();
        }
        practiceCopyEntries.forEach(({button:copyButton})=>resetPracticeCopyButton(copyButton));
        button.dataset.copiedText=value;
        button.setAttribute('aria-label','コピー済み');button.classList.add('copied');
      }catch{alert('文をコピーできませんでした。')}
    };
    practiceWordCopy.addEventListener('click',()=>copyPracticeText(practiceWord,practiceWordCopy));
    practiceMeaningCopy.addEventListener('click',()=>copyPracticeText(practiceMeaning,practiceMeaningCopy));
    practiceNoteCopy.addEventListener('click',()=>copyPracticeText(practiceNote,practiceNoteCopy));
    practiceJapaneseCopy.addEventListener('click',()=>copyPracticeText(practiceJapanese,practiceJapaneseCopy));
    practiceEnglishCopy.addEventListener('click',()=>copyPracticeText(practiceEnglish,practiceEnglishCopy));
    document.addEventListener('copy',event=>{if(!event.target.closest?.('.practice-copy-button'))practiceCopyEntries.forEach(({button})=>resetPracticeCopyButton(button))});
    document.addEventListener('cut',()=>practiceCopyEntries.forEach(({button})=>resetPracticeCopyButton(button)));
    window.addEventListener('focus',syncPracticeCopyButtons);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncPracticeCopyButtons()});
    const practiceCopyObserver=new MutationObserver(()=>syncPracticeCopyButtons());
    practiceCopyEntries.forEach(({element})=>practiceCopyObserver.observe(element,{childList:true,characterData:true,subtree:true}));
    let sentenceEditorState=null;
    let sentenceEditorTransitioning=false;
    let sentenceEditorCloseRequested=false;
    const closeSentenceEditor=async()=>{
      if(sentenceEditorOverlay.hidden)return;
      if(sentenceEditorTransitioning){sentenceEditorCloseRequested=true;return}
      sentenceEditorCloseRequested=false;
      const returnTarget=sentenceEditorState?.column===COL.note?practiceNoteEdit:sentenceEditorState?.column===COL.meaning?practiceMeaningEdit:sentenceEditorState?.column===COL.english?practiceEnglishEdit:practiceJapaneseEdit;
      sentenceEditorTransitioning=true;
      const animations=[];
      if(sentenceEditorSheet.animate){
        animations.push(
          sentenceEditorSheet.animate([{transform:'translateY(0)'},{transform:'translateY(100%)'}],{duration:240,easing:'cubic-bezier(.4,0,1,1)',fill:'both'}),
          sentenceEditorOverlay.animate([{opacity:1},{opacity:0}],{duration:220,easing:'ease-in',fill:'both'})
        );
        await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      }
      sentenceEditorOverlay.hidden=true;
      animations.forEach(animation=>animation.cancel());
      sentenceEditorState=null;sentenceEditorMessage.hidden=true;sentenceEditorTransitioning=false;
      returnTarget?.focus({preventScroll:true});
    };
    const editPracticeSentence=async(column,label,allowEmpty=false)=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored||sentenceEditorTransitioning)return;
      sentenceEditorCloseRequested=false;
      const targets=column===COL.meaning
        ? [...new Set([...(practiceStored.rows||[]),...(practiceStored.vocabularyRows||[])])].filter(candidate=>vocabularyKey(candidate)===vocabularyKey(row)&&text(candidate[COL.meaningNo])===text(row[COL.meaningNo]))
        : [row];
      sentenceEditorState={row,targets,column,label,originals:targets.map(target=>target[column]),original:text(row[column]),allowEmpty};
      sentenceEditorTitle.textContent=`${label}を編集`;
      sentenceEditorInput.value=sentenceEditorState.original;
      sentenceEditorMessage.hidden=true;sentenceEditorOverlay.hidden=false;
      sentenceEditorTransitioning=true;
      const animations=[];
      if(sentenceEditorSheet.animate){
        animations.push(
          sentenceEditorSheet.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}],{duration:270,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'}),
          sentenceEditorOverlay.animate([{opacity:0},{opacity:1}],{duration:240,easing:'ease-out',fill:'both'})
        );
        await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
      }
      animations.forEach(animation=>animation.cancel());
      sentenceEditorTransitioning=false;
      if(sentenceEditorCloseRequested){closeSentenceEditor();return}
      if(!sentenceEditorOverlay.hidden)requestAnimationFrame(()=>{sentenceEditorInput.focus();sentenceEditorInput.setSelectionRange(sentenceEditorInput.value.length,sentenceEditorInput.value.length)});
    };
    sentenceEditorSave.addEventListener('click',async()=>{
      if(!sentenceEditorState)return;
      const value=sentenceEditorInput.value.trim();
      if(!value&&!sentenceEditorState.allowEmpty){sentenceEditorMessage.hidden=false;sentenceEditorInput.focus();return}
      const {targets,column,label,originals}=sentenceEditorState;
      const keepNoteOpen=column===COL.note;
      const keepAnswerVisible=answerVisible;
      targets.forEach(target=>{target[column]=value});practiceStored.modified=true;sentenceEditorSave.disabled=true;
      try{
        await savePracticeSourceData(practiceStored);
        await closeSentenceEditor();renderPracticeQuestion(keepNoteOpen,keepAnswerVisible);renderPracticeList();
      }catch{
        targets.forEach((target,index)=>{target[column]=originals[index]});
        alert(`${label}を保存できませんでした。`);
      }finally{sentenceEditorSave.disabled=false}
    });
    sentenceEditorInput.addEventListener('input',()=>{if(sentenceEditorInput.value.trim())sentenceEditorMessage.hidden=true});
    sentenceEditorCancel.addEventListener('click',closeSentenceEditor);
    sentenceEditorOverlay.addEventListener('click',event=>{event.stopPropagation();if(event.target===sentenceEditorOverlay)closeSentenceEditor()});
    practiceJapaneseEdit.addEventListener('click',()=>editPracticeSentence(COL.japanese,'日本語'));
    practiceEnglishEdit.addEventListener('click',()=>editPracticeSentence(COL.english,'英語'));
    practiceMeaningEdit.addEventListener('click',()=>editPracticeSentence(COL.meaning,'意味'));
    const resultColumn={correct:COL.correctCount,unsure:COL.questionCount,wrong:COL.wrongCount};
    const closeResultEditor=()=>{resultEditorOverlay.hidden=true;resultEditorMessage.hidden=true;practiceResultEdit.focus({preventScroll:true})};
    practiceResultEdit.addEventListener('click',()=>{
      const row=currentPracticeRow();if(!row)return;
      Object.entries(resultEditorInputs).forEach(([key,input])=>{input.value=String(Number(row[resultColumn[key]])||0)});
      resultEditorMessage.hidden=true;resultEditorOverlay.hidden=false;resultEditorCancel.focus({preventScroll:true});
    });
    resultEditorOverlay.querySelectorAll('.result-editor-row').forEach(editorRow=>{
      const input=resultEditorInputs[editorRow.dataset.resultEdit];
      editorRow.querySelector('[data-result-reset]').addEventListener('click',()=>{input.value='0';resultEditorMessage.hidden=true});
      editorRow.querySelectorAll('[data-result-step]').forEach(button=>button.addEventListener('click',()=>{
        input.value=String(Math.max(0,(Number(input.value)||0)+Number(button.dataset.resultStep)));resultEditorMessage.hidden=true;
      }));
    });
    resultEditorResetAll.addEventListener('click',()=>{Object.values(resultEditorInputs).forEach(input=>{input.value='0'});resultEditorMessage.hidden=true});
    resultEditorSave.addEventListener('click',async()=>{
      const row=currentPracticeRow();if(!row||!practiceStored)return;
      const values=Object.fromEntries(Object.entries(resultEditorInputs).map(([key,input])=>[key,Number(input.value)]));
      if(Object.values(values).some(value=>!Number.isInteger(value)||value<0)){resultEditorMessage.hidden=false;return}
      const originals=Object.fromEntries(Object.entries(resultColumn).map(([key,column])=>[key,row[column]]));
      Object.entries(resultColumn).forEach(([key,column])=>{row[column]=values[key]});
      practiceStored.modified=true;resultEditorSave.disabled=true;
      try{await savePracticeSourceData(practiceStored);practiceResultLocks.delete(row);closeResultEditor();syncPracticeResultCounts(row);syncPracticeResultLock(row)}
      catch{Object.entries(resultColumn).forEach(([key,column])=>{row[column]=originals[key]});alert('結果を保存できませんでした。')}
      finally{resultEditorSave.disabled=false}
    });
    resultEditorCancel.addEventListener('click',closeResultEditor);
    resultEditorOverlay.addEventListener('click',event=>{if(event.target===resultEditorOverlay)closeResultEditor()});
    practiceResultButtons.forEach(button=>button.addEventListener('click',async()=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored||practiceMoving||practiceResultSaving)return;
      const column=button.dataset.result==='correct'?COL.correctCount:button.dataset.result==='wrong'?COL.wrongCount:COL.questionCount;
      const currentLock=practiceResultLocks.get(row);
      if(currentLock){
        if(currentLock.result!==button.dataset.result)return;
        practiceResultSaving=true;row[currentLock.column]=currentLock.originalValue;practiceStored.modified=true;syncPracticeResultCounts(row);
        try{await savePracticeSourceData(practiceStored);practiceResultLocks.delete(row);syncPracticeResultLock(row)}
        catch{row[currentLock.column]=currentLock.recordedValue;syncPracticeResultCounts(row);alert('結果を取り消せませんでした。')}
        finally{practiceResultSaving=false}
        return;
      }
      const originalValue=row[column];const recordedValue=(Number(originalValue)||0)+1;
      row[column]=recordedValue;practiceResultLocks.set(row,{result:button.dataset.result,column,originalValue,recordedValue});practiceResultSaving=true;
      practiceStored.modified=true;syncPracticeResultCounts(row);syncPracticeResultLock(row);
      const count=button.closest('.practice-result-choice')?.querySelector('small');
      button.animate?.([{transform:'scale(.82)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:260,easing:'cubic-bezier(.2,.85,.3,1)'});
      count?.animate?.([{transform:'translateY(2px) scale(.75)',opacity:.35},{transform:'translateY(-2px) scale(1.35)',opacity:1},{transform:'translateY(0) scale(1)',opacity:1}],{duration:320,easing:'cubic-bezier(.2,.85,.3,1)'});
      try{await savePracticeSourceData(practiceStored)}catch{
        row[column]=originalValue;practiceResultLocks.delete(row);syncPracticeResultCounts(row);syncPracticeResultLock(row);alert('結果を保存できませんでした。');
      }finally{practiceResultSaving=false}
    }));
    practiceRatingButtons.forEach(button=>button.addEventListener('click',async()=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored)return;
      const originalValue=row[COL.understanding];
      row[COL.understanding]=text(row[COL.understanding])===button.dataset.value?'':button.dataset.value;
      practiceStored.modified=true;
      syncPracticeRating(row);
      try{await savePracticeSourceData(practiceStored)}catch{
        row[COL.understanding]=originalValue;
        syncPracticeRating(row);
        alert('理解度を保存できませんでした。');
      }
    }));
    window.addEventListener('resize',()=>{
      if(!practiceScreen.hidden&&practiceViewMode==='card')requestAnimationFrame(fitPracticeCardText);
    },{passive:true});
    document.addEventListener('keydown',event=>{
      if(practiceScreen.hidden)return;
      const modalOpen=practiceFilterOpen||!cardEditorOverlay.hidden||!sentenceEditorOverlay.hidden||!resultEditorOverlay.hidden||!practiceNotePopover.hidden||!practiceSettingsOverlay.hidden||!learningResetOverlay.hidden||!cardActionsOverlay.hidden;
      if(modalOpen){
        if(event.key!=='Escape')return;
        event.preventDefault();event.stopPropagation();
        if(!cardEditorConfirm.hidden){cardEditorConfirmCancel.click();return}
        if(!sentenceEditorOverlay.hidden){closeSentenceEditor();return}
        if(!resultEditorOverlay.hidden){closeResultEditor();return}
        if(!practiceNotePopover.hidden){closePracticeNote();return}
        if(!learningResetOverlay.hidden){closeLearningReset();return}
        if(!practiceSettingsOverlay.hidden){closePracticeSettings();return}
        if(!cardActionsOverlay.hidden){closeCardActions();return}
        if(!cardEditorOverlay.hidden){requestCardEditorClose();return}
        if(practiceFilterOpen){cancelPracticeFilter();return}
      }
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
        try{
          const registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
          await registration.update();
        }catch(error){console.warn('アプリ更新の確認に失敗しました。',error)}
      });
    }
