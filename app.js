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
    const filterSections=[...document.querySelectorAll('#filterCard .filter-section:not([data-filter-section="text"])')];
    const subgroupAllButtons=[...document.querySelectorAll('#filterCard .group .all')];
    const levelChoices=[...document.querySelectorAll('#filterCard .level-group .choice')];
    const partChoices=[...document.querySelectorAll('#filterCard .part-group .choice')];
    const understandingChoices=[...document.querySelectorAll('#filterCard .understanding .choice')];
    const wordStartsWith=document.getElementById('wordStartsWith');
    const wordEndsWith=document.getElementById('wordEndsWith');
    const wordIncludes=document.getElementById('wordIncludes');
    const wordTextFilterReset=document.getElementById('wordTextFilterReset');
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
    const cardTextFilterReset=cardWordFilterPanel.querySelector('.word-text-reset');
    const cardFilterLevelChoices=[...cardWordFilterPanel.querySelectorAll('.level-group .choice')];
    const cardFilterPartChoices=[...cardWordFilterPanel.querySelectorAll('.part-group .choice')];
    const cardFilterUnderstandingChoices=[...cardWordFilterPanel.querySelectorAll('.understanding .choice')];
    const cardFilterMeaningCountChoices=[...cardWordFilterPanel.querySelectorAll('.meaning-count-group .choice')];
    const cardFilterExampleCountChoices=[...cardWordFilterPanel.querySelectorAll('.example-count-group .choice')];
    const cardFilterSections=[...cardWordFilterPanel.querySelectorAll('.filter-section:not([data-filter-section="text"])')];
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
    levelChoices.forEach(button=>button.classList.add(button.textContent.trim().endsWith('1')?'red':button.textContent.trim().endsWith('2')?'orange':'yellow'));
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
    const filterChoiceKey=choice=>`${choice.closest('.filter-section')?.dataset.filterSection||''}|${choice.closest('.group')?.querySelector('.group-title span')?.textContent.trim()||''}|${choice.dataset.value||choice.textContent.trim()}`;
    const saveFilterSelection=(key,choices)=>{try{localStorage.setItem(key,JSON.stringify(choices.filter(choice=>choice.classList.contains('selected')).map(filterChoiceKey)))}catch{}};
    const restoreFilterSelection=(key,choices)=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(!Array.isArray(saved))return false;const selected=new Set(saved);choices.forEach(choice=>choice.classList.toggle('selected',selected.has(filterChoiceKey(choice))));return true}catch{return false}};
    const savePracticeTextFilters=()=>{try{localStorage.setItem(PRACTICE_TEXT_FILTER_STORAGE_KEY,JSON.stringify({startsWith:wordStartsWith.value,endsWith:wordEndsWith.value,includes:wordIncludes.value}))}catch{}};
    const restorePracticeTextFilters=()=>{try{const saved=JSON.parse(localStorage.getItem(PRACTICE_TEXT_FILTER_STORAGE_KEY)||'null');if(!saved||typeof saved!=='object')return;wordStartsWith.value=saved.startsWith||'';wordEndsWith.value=saved.endsWith||'';wordIncludes.value=saved.includes||''}catch{}};
    const fiveDigitCountMarkup=value=>{
      const number=Math.min(99999,Math.max(0,Math.trunc(Number(value)||0)));const digits=String(number);const padding='0'.repeat(5-digits.length);
      return `<span class="count-padding">${padding}</span><span class="count-value">${digits}</span>`;
    };
    const renderCountFraction=(element,value,total)=>{if(element)element.innerHTML=`<span class="count-current">${fiveDigitCountMarkup(value)}</span><span class="count-separator">/</span><span class="count-total">${fiveDigitCountMarkup(total)}</span>`};
    const countCategory=count=>count===0?'0':count===1?'1':'multiple';
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
      const levels=selectedValues(levelChoices);
      const parts=selectedValues(partChoices);
      const understandings=selectedValues(understandingChoices);
      const startsWith=text(wordStartsWith.value).toLowerCase();
      const endsWith=text(wordEndsWith.value).toLowerCase();
      const includes=text(wordIncludes.value).toLowerCase();
      return rows.filter(row=>{
        if(!text(row[COL.japanese])||!text(row[COL.english]))return false;
        const word=text(row[COL.word]).toLowerCase();
        if(startsWith&&!word.startsWith(startsWith))return false;
        if(endsWith&&!word.endsWith(endsWith))return false;
        if(includes&&!word.includes(includes))return false;
        if(levels.size&&![text(row[COL.sLevel]),text(row[COL.wLevel])].some(value=>levels.has(value)))return false;
        if(parts.size&&!parts.has(text(row[COL.pos])))return false;
        const understanding=text(row[COL.understanding])||'未登録';
        if(understandings.size&&!understandings.has(understanding))return false;
        return true;
      }).sort(compareDataRows);
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
      renderCountFraction(wordCount,matchingPairCount,totalPairCount);
      renderCountFraction(exampleCount,matchingRows.length,allExampleRows.length);
      renderCountFraction(filterWordCount,matchingPairCount,totalPairCount);
      renderCountFraction(filterExampleCount,matchingRows.length,allExampleRows.length);
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
      const emptyConditions=filterSections.map(section=>section.querySelector('.choice.selected')?null:section.querySelector('.condition-badge')?.textContent.replace('条件','')).filter(Boolean);
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
    const syncWordTextFilterReset=()=>{wordTextFilterReset.disabled=![wordStartsWith,wordEndsWith,wordIncludes].some(input=>Boolean(text(input.value)))};
    [wordStartsWith,wordEndsWith,wordIncludes].forEach(input=>input.addEventListener('input',()=>{syncWordTextFilterReset();refreshQuestionCount()}));
    wordTextFilterReset.addEventListener('click',()=>{
      [wordStartsWith.value,wordEndsWith.value,wordIncludes.value]=['','',''];
      syncWordTextFilterReset();refreshQuestionCount();
    });
    restorePracticeTextFilters();
    syncWordTextFilterReset();
    if(restoreFilterSelection(PRACTICE_FILTER_STORAGE_KEY,allFilterChoices)){
      subgroupAllButtons.forEach(button=>syncSubgroupAll(button.closest('.group')));
      filterSections.forEach(section=>syncSectionControls(section,false));syncGlobalControls();refreshQuestionCount();
    }else setAllFilters(true);
    const closeHelp=()=>{
      helpOverlay.hidden=true;
      helpButton.classList.remove('active');
      helpButton.focus({preventScroll:true});
    };
    const showHelpMenu=()=>{helpMenu.hidden=false;helpVersionPanel.hidden=true;helpUsagePanel.hidden=true};
    const showHelpPanel=panel=>{helpMenu.hidden=true;helpVersionPanel.hidden=panel!==helpVersionPanel;helpUsagePanel.hidden=panel!==helpUsagePanel};
    helpButton.addEventListener('click',()=>{
      showHelpMenu();
      helpOverlay.hidden=false;
      helpButton.classList.add('active');
      helpClose.focus();
    });
    helpVersionButton.addEventListener('click',()=>showHelpPanel(helpVersionPanel));
    helpUsageButton.addEventListener('click',()=>showHelpPanel(helpUsagePanel));
    document.querySelectorAll('[data-help-back]').forEach(button=>button.addEventListener('click',showHelpMenu));
    helpClose.addEventListener('click',closeHelp);
    helpOverlay.addEventListener('click',event=>{if(event.target===helpOverlay)closeHelp();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!helpOverlay.hidden)closeHelp();else if(event.key==='Escape'&&!homeSettingsOverlay.hidden)closeHomeSettings();});
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
    const fitTextToFixedArea=(element,minSize,allowScroll=false)=>{
      if(!element||element.hidden)return;
      element.classList.remove('is-scrollable');
      element.style.fontSize='';
      let size=Number.parseFloat(getComputedStyle(element).fontSize)||16;
      const overflows=()=>element.scrollHeight>element.clientHeight+1||element.scrollWidth>element.clientWidth+1;
      while(size>minSize&&overflows()){
        size=Math.max(minSize,size-.5);
        element.style.fontSize=`${size}px`;
      }
      if(allowScroll&&overflows())element.classList.add('is-scrollable');
    };
    const fitPracticeCardText=()=>{
      fitTextToFixedArea(practiceWord,11);
      practiceMeaning.style.fontSize='';
      practiceMeaning.classList.remove('is-scrollable');
      [practiceJapanese,practiceEnglish].forEach(element=>{element.style.fontSize='';element.classList.remove('is-scrollable')});
    };
    let answerTransitioning=false;
    const setAnswerVisible=async(visible,animate=false)=>{
      if(animate&&answerTransitioning)return;
      if(animate&&practiceAnswer.animate){
        answerTransitioning=true;
        try{await practiceAnswer.animate([{opacity:1},{opacity:0}],{duration:140,easing:'ease-in'}).finished}catch{}
      }
      answerVisible=visible;
      practiceReveal.hidden=visible;
      practiceEnglish.hidden=!visible;
      practiceAudio.disabled=!('speechSynthesis' in window);
      requestAnimationFrame(fitPracticeCardText);
      if(animate&&practiceAnswer.animate){
        try{await practiceAnswer.animate([{opacity:0},{opacity:1}],{duration:190,easing:'ease-out'}).finished}catch{}
      }
      answerTransitioning=false;
    };
    const syncPracticeRating=row=>{
      const value=text(row?.[COL.understanding])||'未登録';
      practiceRatingButtons.forEach(button=>button.classList.toggle('selected',button.dataset.value===value));
    };
    const syncPracticeResultCounts=row=>{
      practiceCorrectCount.textContent=String(Number(row?.[COL.correctCount])||0);
      practiceUnsureCount.textContent=String(Number(row?.[COL.questionCount])||0);
      practiceWrongCount.textContent=String(Number(row?.[COL.wrongCount])||0);
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
    const renderPracticeQuestion=(keepNoteOpen=false,keepAnswerVisible=false)=>{
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
      practiceNote.textContent=note||'補足なし';
      practiceNoteButton.hidden=false;
      practiceNoteButton.disabled=false;
      practiceNotePopover.hidden=!keepNoteOpen;
      practiceNoteButton.setAttribute('aria-expanded',String(keepNoteOpen));
      if(keepNoteOpen)requestAnimationFrame(syncPracticeNotePosition);
      syncPracticeRating(row);
      syncPracticeResultCounts(row);
      setAnswerVisible(keepAnswerVisible);
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
    let cardEditorRowsSnapshot=null;
    let cardEditorRowBaseline=new Map();
    let cardEditorHasStagedChanges=false;
    let cardExampleCommitStatus=new Map();
    let cardEditorAnimationRun=0;
    const updateCardWordScrollbar=()=>{
      const maximum=Math.max(0,cardWordResults.scrollHeight-cardWordResults.clientHeight);const trackHeight=cardWordScrollbar.clientHeight;
      cardWordScrollbar.hidden=!maximum||!trackHeight;if(!maximum||!trackHeight)return;
      const thumbHeight=Math.max(36,trackHeight*(cardWordResults.clientHeight/cardWordResults.scrollHeight));const travel=Math.max(0,trackHeight-thumbHeight);const top=maximum?travel*(cardWordResults.scrollTop/maximum):0;
      cardWordScrollThumb.style.height=`${thumbHeight}px`;cardWordScrollThumb.style.transform=`translateY(${top}px)`;cardWordScrollbar.setAttribute('aria-valuemin','0');cardWordScrollbar.setAttribute('aria-valuemax',String(Math.round(maximum)));cardWordScrollbar.setAttribute('aria-valuenow',String(Math.round(cardWordResults.scrollTop)));
    };
    let cardScrollbarDrag=null;
    cardWordScrollbar.addEventListener('pointerdown',event=>{
      event.preventDefault();const trackRect=cardWordScrollbar.getBoundingClientRect();const thumbRect=cardWordScrollThumb.getBoundingClientRect();const maximum=Math.max(0,cardWordResults.scrollHeight-cardWordResults.clientHeight);const travel=Math.max(1,trackRect.height-thumbRect.height);if(!maximum)return;
      if(event.target!==cardWordScrollThumb){const thumbTop=Math.max(0,Math.min(travel,event.clientY-trackRect.top-thumbRect.height/2));cardWordResults.scrollTop=(thumbTop/travel)*maximum;updateCardWordScrollbar()}
      cardScrollbarDrag={pointerId:event.pointerId,startY:event.clientY,startScroll:cardWordResults.scrollTop,maximum,travel};cardWordScrollbar.setPointerCapture?.(event.pointerId);cardWordScrollbar.classList.add('dragging');
    });
    cardWordScrollbar.addEventListener('pointermove',event=>{if(!cardScrollbarDrag||event.pointerId!==cardScrollbarDrag.pointerId)return;event.preventDefault();cardWordResults.scrollTop=cardScrollbarDrag.startScroll+((event.clientY-cardScrollbarDrag.startY)/cardScrollbarDrag.travel)*cardScrollbarDrag.maximum});
    const finishCardScrollbarDrag=event=>{if(!cardScrollbarDrag||event.pointerId!==cardScrollbarDrag.pointerId)return;cardScrollbarDrag=null;cardWordScrollbar.classList.remove('dragging')};
    cardWordScrollbar.addEventListener('pointerup',finishCardScrollbarDrag);cardWordScrollbar.addEventListener('pointercancel',finishCardScrollbarDrag);
    cardWordScrollbar.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))return;event.preventDefault();const page=cardWordResults.clientHeight*.85;const amount=event.key==='ArrowUp'?-44:event.key==='ArrowDown'?44:event.key==='PageUp'?-page:event.key==='PageDown'?page:event.key==='Home'?-cardWordResults.scrollHeight:cardWordResults.scrollHeight;cardWordResults.scrollBy({top:amount,behavior:'smooth'})});
    new ResizeObserver(updateCardWordScrollbar).observe(cardWordResultsShell);
    const closeCardActions=()=>{cardActionsOverlay.hidden=true;cardActionRow=null};
    const openCardActions=row=>{
      if(autoPlaying)stopAutoPlayback();
      cardActionRow=row;
      cardActionsWord.textContent=text(row[COL.word])||'—';
      cardActionsNumber.textContent=`No ${formatCardNumber(row)}`;
      cardActionsOverlay.hidden=false;
      cardActionEdit.focus({preventScroll:true});
    };
    const syncCardWordFilterGroup=group=>{
      const choices=[...group.querySelectorAll('.choice')];
      group.querySelector('.all')?.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
    };
    const syncCardFilterControls=()=>{
      cardFilterSections.forEach(section=>{
        const choices=[...section.querySelectorAll('.choice')];
        section.querySelector('[data-section-action]')?.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
      });
      const choices=[...cardWordFilterPanel.querySelectorAll('.choice')];
      cardSelectAllFilters.classList.toggle('selected',choices.length>0&&choices.every(choice=>choice.classList.contains('selected')));
    };
    const cardFilterChoices=[...cardFilterLevelChoices,...cardFilterPartChoices,...cardFilterUnderstandingChoices,...cardFilterMeaningCountChoices,...cardFilterExampleCountChoices];
    const cardTextFilterInputs=[cardFilterStartsWith,cardFilterEndsWith,cardFilterIncludes];
    const syncCardTextFilterReset=()=>{cardTextFilterReset.disabled=!cardTextFilterInputs.some(input=>Boolean(text(input.value)))};
    const saveCardTextFilters=()=>{try{localStorage.setItem(CARD_TEXT_FILTER_STORAGE_KEY,JSON.stringify({startsWith:cardFilterStartsWith.value,endsWith:cardFilterEndsWith.value,includes:cardFilterIncludes.value}))}catch{}};
    const restoreCardTextFilters=()=>{try{const saved=JSON.parse(localStorage.getItem(CARD_TEXT_FILTER_STORAGE_KEY)||'null');if(!saved||typeof saved!=='object')return;cardFilterStartsWith.value=saved.startsWith||'';cardFilterEndsWith.value=saved.endsWith||'';cardFilterIncludes.value=saved.includes||''}catch{}};
    const initializeCardWordFilters=()=>{
      if(!restoreFilterSelection(CARD_FILTER_STORAGE_KEY,cardFilterChoices))cardFilterChoices.forEach(choice=>choice.classList.add('selected'));
      restoreCardTextFilters();syncCardTextFilterReset();
      cardWordFilterPanel.querySelectorAll('.group').forEach(syncCardWordFilterGroup);
      syncCardFilterControls();
      cardWordFilterPanel.hidden=true;cardFilterStickySummary.hidden=true;
      cardWordFilterToggle.setAttribute('aria-expanded','false');
    };
    const saveCardWordFilters=()=>saveFilterSelection(CARD_FILTER_STORAGE_KEY,cardFilterChoices);
    initializeCardWordFilters();
    cardTextFilterInputs.forEach(input=>input.addEventListener('input',()=>{syncCardTextFilterReset();saveCardTextFilters();renderWordResults()}));
    cardTextFilterReset.addEventListener('click',()=>{
      cardTextFilterInputs.forEach(input=>{input.value=''});syncCardTextFilterReset();saveCardTextFilters();renderWordResults();
    });
    cardWordFilterToggle.addEventListener('click',()=>{
      const expand=cardWordFilterPanel.hidden;
      cardWordFilterPanel.hidden=!expand;
      cardFilterStickySummary.hidden=!expand;
      cardWordFilterToggle.setAttribute('aria-expanded',String(expand));
      if(expand)requestAnimationFrame(()=>{cardEditorBody.scrollTop=0;cardWordFilterPanel.scrollTop=0});
    });
    [...cardFilterLevelChoices,...cardFilterPartChoices,...cardFilterUnderstandingChoices,...cardFilterMeaningCountChoices,...cardFilterExampleCountChoices].forEach(button=>button.addEventListener('click',()=>{
      button.classList.toggle('selected');
      syncCardWordFilterGroup(button.closest('.group'));
      syncCardFilterControls();
      saveCardWordFilters();
      renderWordResults();
    }));
    cardWordFilterPanel.querySelectorAll('.group .all').forEach(button=>button.addEventListener('click',()=>{
      const group=button.closest('.group');
      const select=!button.classList.contains('selected');
      group.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      button.classList.toggle('selected',select);
      syncCardFilterControls();
      saveCardWordFilters();
      renderWordResults();
    }));
    cardFilterSections.forEach(section=>section.querySelector('[data-section-action]')?.addEventListener('click',event=>{
      const select=!event.currentTarget.classList.contains('selected');
      section.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      section.querySelectorAll('.group').forEach(syncCardWordFilterGroup);
      syncCardFilterControls();saveCardWordFilters();renderWordResults();
    }));
    cardSelectAllFilters.addEventListener('click',()=>{
      const select=!cardSelectAllFilters.classList.contains('selected');
      cardWordFilterPanel.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',select));
      cardWordFilterPanel.querySelectorAll('.group').forEach(syncCardWordFilterGroup);
      syncCardFilterControls();saveCardWordFilters();renderWordResults();
    });
    const renderWordResults=()=>{
      const query=text(cardWordSearch.value).toLowerCase();
      cardWordResults.replaceChildren();
      cardWordResults.scrollTop=0;cardWordResults.scrollLeft=0;
      cardWordResults.onscroll=null;
      if(cardEditorMode==='edit'||selectedVocabularyRow){cardWordResults.hidden=true;cardWordSearch.setAttribute('aria-expanded','false');return}
      const candidates=getVocabularyRows();
      const meaningsByKey=new Map();
      const countsByKey=buildVocabularyCounts(practiceStored.rows||[]);
      (practiceStored.rows||[]).forEach(row=>{
        const key=vocabularyKey(row);
        const meaning=text(row?.[COL.meaning]);
        if(!key||!meaning)return;
        if(!meaningsByKey.has(key))meaningsByKey.set(key,[]);
        const meanings=meaningsByKey.get(key);
        const meaningNo=text(row?.[COL.meaningNo]);
        if(!meanings.some(item=>item.number===meaningNo&&item.text===meaning))meanings.push({number:meaningNo,text:meaning});
      });
      meaningsByKey.forEach(meanings=>meanings.sort((a,b)=>(Number(a.number)||Number.MAX_SAFE_INTEGER)-(Number(b.number)||Number.MAX_SAFE_INTEGER)));
      const selectedLevels=selectedValues(cardFilterLevelChoices);
      const selectedParts=selectedValues(cardFilterPartChoices);
      const selectedUnderstanding=selectedValues(cardFilterUnderstandingChoices);
      const selectedMeaningCounts=selectedValues(cardFilterMeaningCountChoices);
      const selectedExampleCounts=selectedValues(cardFilterExampleCountChoices);
      const startsWith=text(cardFilterStartsWith.value).toLowerCase();
      const endsWith=text(cardFilterEndsWith.value).toLowerCase();
      const includes=text(cardFilterIncludes.value).toLowerCase();
      const restrictLevels=selectedLevels.size!==cardFilterLevelChoices.length;
      const restrictParts=selectedParts.size!==cardFilterPartChoices.length;
      const restrictUnderstanding=selectedUnderstanding.size!==cardFilterUnderstandingChoices.length;
      const restrictMeaningCounts=selectedMeaningCounts.size!==cardFilterMeaningCountChoices.length;
      const restrictExampleCounts=selectedExampleCounts.size!==cardFilterExampleCountChoices.length;
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
        if(startsWith&&!word.startsWith(startsWith))return;
        if(endsWith&&!word.endsWith(endsWith))return;
        if(includes&&!word.includes(includes))return;
        if(restrictLevels&&![text(row[COL.sLevel]),text(row[COL.wLevel])].some(value=>selectedLevels.has(value)))return;
        if(restrictParts&&!selectedParts.has(text(row[COL.pos])))return;
        const understandingValues=understandingByKey.get(vocabularyKey(row))||new Set(['未登録']);
        if(restrictUnderstanding&&![...understandingValues].some(value=>selectedUnderstanding.has(value)))return;
        const meaningCount=(meaningsByKey.get(vocabularyKey(row))||[]).length;
        const meaningCountFilter=countCategory(meaningCount);
        if(restrictMeaningCounts&&!selectedMeaningCounts.has(meaningCountFilter))return;
        const exampleCount=countsByKey.get(vocabularyKey(row))?.examples||0;
        if(restrictExampleCounts&&!selectedExampleCounts.has(countCategory(exampleCount)))return;
        starts.push(row);
      });
      const matches=starts;
      const allCandidateKeys=new Set(candidates.map(vocabularyKey));
      const matchedCandidateKeys=new Set(matches.map(vocabularyKey));
      const countExamples=keys=>[...keys].reduce((sum,key)=>sum+(countsByKey.get(key)?.examples||0),0);
      renderCountFraction(cardFilterWordCount,matches.length,candidates.length);
      renderCountFraction(cardFilterExampleCount,countExamples(matchedCandidateKeys),countExamples(allCandidateKeys));
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
          cardWordSearch.value=text(row[COL.word]);cardWordSearchRow.hidden=true;cardWordFilterPanel.hidden=true;cardFilterStickySummary.hidden=true;cardWordFilterToggle.setAttribute('aria-expanded','false');
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
        requestAnimationFrame(updateCardWordScrollbar);
      };
      appendNextBatch();
      cardWordResults.onscroll=()=>{
        if(cardWordResults.scrollTop+cardWordResults.clientHeight>=cardWordResults.scrollHeight-120)appendNextBatch();
        updateCardWordScrollbar();
      };
      const empty=document.createElement('p');empty.className='card-word-empty';empty.textContent=query?'この文字で始まる登録済み単語がありません':'追加する単語を候補から選択してください';
      if(!matches.length)cardWordResults.append(empty);
      cardWordResults.hidden=false;cardWordSearch.setAttribute('aria-expanded','true');requestAnimationFrame(updateCardWordScrollbar);
    };
    const syncCardEditorMessages=()=>{
      cardWordMessage.hidden=Boolean(selectedVocabularyRow);
      cardWordReselect.hidden=!selectedVocabularyRow||cardEditorMode==='edit';
      const meaningConfirmed=['new','existing','unchanged','changed'].includes(selectedMeaningMode);
      cardMeaningMessage.hidden=meaningConfirmed||Boolean(text(cardMeaningInput.value));
      cardMeaningNew.hidden=!['new-draft','new'].includes(selectedMeaningMode);
      cardExampleCarousel.querySelectorAll('.card-example-form').forEach(form=>{
        const japanese=form.querySelector('[data-example-field="japanese"]');
        const english=form.querySelector('[data-example-field="english"]');
        const draft=cardExampleDrafts[Number(form.dataset.draftIndex)];
        const requiresInput=Boolean(draft&&!draft.isPendingAdd);
        form.querySelector('[data-example-message="japanese"]').hidden=!requiresInput||Boolean(text(japanese?.value));
        form.querySelector('[data-example-message="english"]').hidden=!requiresInput||Boolean(text(english?.value));
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
      if(cardEditorMode==='edit'&&cardEditorRow&&!matching.includes(cardEditorRow)&&text(cardEditorRow[COL.meaningNo])===selectedMeaningNumber&&text(cardEditorRow[COL.japanese])&&text(cardEditorRow[COL.english]))matching.push(cardEditorRow);
      cardExampleDrafts=matching.sort((a,b)=>(Number(a[COL.exampleNo])||Number.MAX_SAFE_INTEGER)-(Number(b[COL.exampleNo])||Number.MAX_SAFE_INTEGER)).map(row=>({
        row,exampleNo:text(row[COL.exampleNo])||'1',japanese:text(row[COL.japanese]),english:text(row[COL.english]),note:text(row[COL.note])
      }));
      cardDeletedExampleRows=[];
    };
    const cardExampleCommitKey=()=>`${vocabularyKey(selectedVocabularyRow)}::${selectedMeaningNumber}`;
    const renumberCardExampleDrafts=()=>{
      let nextNumber=1;
      cardExampleDrafts.forEach(draft=>{if(!draft.isPendingAdd)draft.exampleNo=String(nextNumber++)});
      cardExampleDrafts.forEach(draft=>{if(draft.isPendingAdd)draft.exampleNo=String(nextNumber)});
    };
    const markCardExampleDraftDirty=()=>{
      cardExampleCommitStatus.set(cardExampleCommitKey(),false);
      cardExampleCommit.textContent='この内容を登録';
      syncCardExampleCommitState();
    };
    const blockUnregisteredCardExampleChanges=()=>{
      if(cardExampleCommitStatus.get(cardExampleCommitKey())!==false)return false;
      alert('例文の変更内容がまだ登録されていません。');
      return true;
    };
    const syncCardExampleCommitState=()=>{
      const hasContent=cardExampleDrafts.some(draft=>!draft.isPendingAdd)||cardDeletedExampleRows.length;
      const registered=cardExampleCommitStatus.get(cardExampleCommitKey())===true;
      cardExampleCommit.textContent=registered?'登録しました':'この内容を登録';
      cardExampleCommit.disabled=!hasContent||registered;
    };
    cardExampleCarousel.addEventListener('scroll',syncCardExampleCommitState,{passive:true});
    const renderCardExampleCarousel=(focusIndex=null,animateFocus=true)=>{
      if(!cardExampleDrafts.some(draft=>draft.isPendingAdd)){
        const nextExampleNo=String(nextNumber(cardExampleDrafts.map(draft=>{const row=[];row[COL.exampleNo]=draft.exampleNo;return row}),COL.exampleNo));
        cardExampleDrafts.push({row:null,exampleNo:nextExampleNo,japanese:'',english:'',note:'',isPendingAdd:true});
      }
      cardExampleCarousel.replaceChildren();
      cardExampleDrafts.forEach((draft,index)=>{
        const form=document.createElement('article');form.className='card-example-page card-example-form';form.dataset.draftIndex=String(index);
        const heading=document.createElement('div');heading.className='card-example-number';
        const headingLabel=document.createElement('span');headingLabel.textContent='例文番号';
        const badge=document.createElement('span');badge.className='practice-meta-chip';badge.textContent=formatExampleLetter(draft.exampleNo);
        heading.append(headingLabel,badge);
        const orderActions=document.createElement('span');orderActions.className='card-example-order-actions';
        const moveExample=(delta)=>{
          const target=index+delta;if(target<0||target>=cardExampleDrafts.length)return;
          if(draft.isPendingAdd||cardExampleDrafts[target]?.isPendingAdd)return;
          [cardExampleDrafts[index],cardExampleDrafts[target]]=[cardExampleDrafts[target],cardExampleDrafts[index]];
          renumberCardExampleDrafts();
          cardEditorHasStagedChanges=true;markCardExampleDraftDirty();
          renderCardExampleCarousel(target);
        };
        const moveUp=document.createElement('button');moveUp.type='button';moveUp.className='card-order-button';moveUp.textContent='↑';moveUp.setAttribute('aria-label',`${formatExampleLetter(draft.exampleNo)}の例文を前へ移動`);moveUp.disabled=draft.isPendingAdd||index===0||cardExampleDrafts[index-1]?.isPendingAdd;moveUp.addEventListener('click',()=>moveExample(-1));
        const moveDown=document.createElement('button');moveDown.type='button';moveDown.className='card-order-button';moveDown.textContent='↓';moveDown.setAttribute('aria-label',`${formatExampleLetter(draft.exampleNo)}の例文を後ろへ移動`);moveDown.disabled=draft.isPendingAdd||index===cardExampleDrafts.length-1||cardExampleDrafts[index+1]?.isPendingAdd;moveDown.addEventListener('click',()=>moveExample(1));
        orderActions.append(moveUp,moveDown);heading.append(orderActions);
        const remove=document.createElement('button');remove.type='button';remove.className='card-example-remove';remove.textContent='削除';remove.disabled=Boolean(draft.isPendingAdd);
        remove.addEventListener('click',()=>{
          if(draft.row)cardDeletedExampleRows.push(draft.row);
          cardExampleDrafts.splice(index,1);renumberCardExampleDrafts();cardEditorHasStagedChanges=true;markCardExampleDraftDirty();renderCardExampleCarousel();
        });
        heading.append(remove);
        const makeField=(labelText,key,rows,optional=false)=>{
          const label=document.createElement('label');label.className='card-editor-field';
          const title=document.createElement('span');title.textContent=labelText;
          if(optional){const small=document.createElement('small');small.textContent=' 任意';title.append(small)}
          const input=document.createElement('textarea');input.rows=rows;input.placeholder=`${labelText}を入力`;input.dataset.exampleField=key;input.value=draft.editing?.[key]??draft[key];if(key==='english')input.lang='en';
          input.addEventListener('input',()=>{draft.editing={...(draft.editing||{}),[key]:input.value};markCardExampleDraftDirty();syncCardEditorMessages()});label.append(title,input);return label;
        };
        const japaneseField=makeField('日本語','japanese',4);
        const japaneseMessage=document.createElement('em');japaneseMessage.className='card-field-message';japaneseMessage.dataset.exampleMessage='japanese';japaneseMessage.textContent='※入力は必須です';japaneseField.querySelector(':scope > span').append(japaneseMessage);
        const englishField=makeField('英語','english',4);
        const englishMessage=document.createElement('em');englishMessage.className='card-field-message';englishMessage.dataset.exampleMessage='english';englishMessage.textContent='※入力は必須です';englishField.querySelector(':scope > span').append(englishMessage);
        const noteField=makeField('補足','note',3,true);
        form.append(heading,japaneseField,englishField,noteField);
        if(draft.isPendingAdd){
          const addCover=document.createElement('button');addCover.type='button';addCover.className='card-example-add-cover';addCover.textContent='＋例文追加';
          addCover.addEventListener('click',async()=>{
            const options={duration:420,easing:'ease-in-out',fill:'forwards'};
            const coverAnimation=addCover.animate([{opacity:1},{opacity:0}],options);
            const formAnimations=[japaneseField,englishField,noteField].map(field=>field.animate([{opacity:0},{opacity:1}],options));
            try{await Promise.all([coverAnimation.finished,...formAnimations.map(animation=>animation.finished)])}catch{}
            formAnimations.forEach(animation=>animation.cancel());draft.isPendingAdd=false;remove.disabled=false;addCover.remove();markCardExampleDraftDirty();syncCardEditorMessages();renderCardExampleCarousel(index,false);
          });
          form.append(addCover);
        }
        cardExampleCarousel.append(form);
      });
      syncCardEditorMessages();
      requestAnimationFrame(syncCardExampleCommitState);
      if(Number.isInteger(focusIndex))requestAnimationFrame(()=>{
        cardExampleCarousel.scrollLeft=cardExampleCarousel.clientWidth*focusIndex;
        syncCardExampleCommitState();
        const focusedPage=cardExampleCarousel.querySelector(`[data-draft-index="${focusIndex}"]`);
        if(animateFocus&&focusedPage&&typeof focusedPage.animate==='function')focusedPage.animate([{opacity:0},{opacity:1}],{duration:420,easing:'ease-in-out'});
      });
    };
    const showCardExampleEditor=()=>{
      loadCardExampleDrafts();
      renderCardExampleCarousel();
      cardExampleStep.hidden=false;
      cardExampleCarousel.scrollLeft=0;
      requestAnimationFrame(()=>{cardExampleCarousel.scrollLeft=0});
    };
    cardExampleCommit.addEventListener('click',()=>{
      renumberCardExampleDrafts();
      const pages=[...cardExampleCarousel.querySelectorAll('.card-example-form')];
      const entries=pages.map(page=>({page,draft:cardExampleDrafts[Number(page.dataset.draftIndex)]})).filter(entry=>entry.draft&&!entry.draft.isPendingAdd).map(({page,draft})=>({
        draft,
        japanese:page.querySelector('[data-example-field="japanese"]')?.value||'',
        english:page.querySelector('[data-example-field="english"]')?.value||'',
        note:page.querySelector('[data-example-field="note"]')?.value||''
      }));
      if(!entries.length&&!cardDeletedExampleRows.length)return;
      if(entries.some(entry=>!text(entry.japanese)||!text(entry.english))){syncCardEditorMessages();alert('未入力の日本語または英語があります。');return}
      const pairKey=vocabularyKey(selectedVocabularyRow);
      const meaning=text(cardMeaningInput.value);
      const meaningNo=selectedMeaningNumber;
      const deletedRows=new Set(cardDeletedExampleRows);
      cardDeletedExampleRows.forEach(row=>{const rowIndex=practiceStored.rows.indexOf(row);if(rowIndex>=0)practiceStored.rows.splice(rowIndex,1)});
      const usedRows=new Set(entries.map(entry=>entry.draft.row).filter(Boolean));
      entries.forEach(({draft,japanese,english,note})=>{
        if(text(draft.japanese)!==text(japanese)||text(draft.english)!==text(english)||text(draft.note)!==text(note))cardEditorHasStagedChanges=true;
        draft.japanese=japanese;draft.english=english;draft.note=note;draft.editing=null;
        let target=draft.row;
        if(!target){
          target=(practiceStored.rows||[]).find(row=>vocabularyKey(row)===pairKey&&!deletedRows.has(row)&&!usedRows.has(row)&&text(row[COL.meaningNo])===meaningNo&&!text(row[COL.japanese])&&!text(row[COL.english]));
          if(!target){target=[...selectedVocabularyRow];let insertIndex=-1;practiceStored.rows.forEach((row,index)=>{if(vocabularyKey(row)===pairKey)insertIndex=index});practiceStored.rows.splice(insertIndex>=0?insertIndex+1:practiceStored.rows.length,0,target)}
          draft.row=target;usedRows.add(target);target[COL.understanding]='';target[COL.correctCount]=0;target[COL.wrongCount]=0;target[COL.questionCount]=0;
        }
        target[COL.meaningNo]=meaningNo;target[COL.meaning]=meaning;target[COL.exampleNo]=draft.exampleNo;target[COL.japanese]=text(japanese);target[COL.english]=text(english);target[COL.note]=text(note);
      });
      if(!entries.length){
        let target=(practiceStored.rows||[]).find(row=>vocabularyKey(row)===pairKey&&text(row[COL.meaningNo])===meaningNo);
        if(!target){target=[...selectedVocabularyRow];let insertIndex=-1;practiceStored.rows.forEach((row,index)=>{if(vocabularyKey(row)===pairKey)insertIndex=index});practiceStored.rows.splice(insertIndex>=0?insertIndex+1:practiceStored.rows.length,0,target)}
        target[COL.meaningNo]=meaningNo;target[COL.meaning]=meaning;target[COL.exampleNo]='';target[COL.japanese]='';target[COL.english]='';target[COL.note]='';
      }
      cardDeletedExampleRows=[];cardEditorHasStagedChanges=true;cardExampleCommitStatus.set(cardExampleCommitKey(),true);syncCardExampleCommitState();
      syncCardEditorMessages();
    });
    const blockIncompleteExamples=()=>{
      const incomplete=cardExampleDrafts.some(draft=>!draft.isPendingAdd&&(!text(draft.japanese)||!text(draft.english)));
      if(!incomplete)return false;
      syncCardEditorMessages();alert('未入力の日本語または英語があります。');return true;
    };
    const collectCardEditorChanges=()=>{
      const changes=[];const seen=new Set();const currentRows=practiceStored.rows||[];
      const shown=value=>text(value)||'空欄';
      const add=(row,message,meaningNumber=null)=>{
        const source=row||selectedVocabularyRow||cardEditorRow;
        const word=source?shown(source[COL.word]):'データ';
        const part=source?shown(source[COL.pos]):'';
        const number=text(meaningNumber??source?.[COL.meaningNo]);
        const prefix=`${word}${part?` ${part}`:''}${number?`の意味${formatSingleDigitNumber(number)}`:''}`;
        const line=`${prefix} ${message}`;
        if(!seen.has(line)){seen.add(line);changes.push(line)}
      };
      cardEditorRowBaseline.forEach((before,row)=>{
        if(!currentRows.includes(row)){
          if(text(before[COL.exampleNo]))add(before,`例文${formatExampleLetter(before[COL.exampleNo])}が削除されます（日本語：「${shown(before[COL.japanese])}」／英語：「${shown(before[COL.english])}」）`,before[COL.meaningNo]);
          else add(before,`が削除されます（意味：「${shown(before[COL.meaning])}」）`,before[COL.meaningNo]);
          return;
        }
        if(text(before[COL.meaning])!==text(row[COL.meaning]))add(row,`が「${shown(before[COL.meaning])}」から「${shown(row[COL.meaning])}」に変更されます`,row[COL.meaningNo]);
        if(text(before[COL.meaningNo])!==text(row[COL.meaningNo]))add(row,`の番号が意味${formatSingleDigitNumber(before[COL.meaningNo])}から意味${formatSingleDigitNumber(row[COL.meaningNo])}に変更されます`,row[COL.meaningNo]);
        const exampleNumber=row[COL.exampleNo]||before[COL.exampleNo];
        const label=`例文${formatExampleLetter(exampleNumber)}`;
        if(text(before[COL.exampleNo])!==text(row[COL.exampleNo]))add(row,`例文${formatExampleLetter(before[COL.exampleNo])}が例文${formatExampleLetter(row[COL.exampleNo])}に変更されます`,row[COL.meaningNo]);
        if(text(before[COL.japanese])!==text(row[COL.japanese]))add(row,`${label}の日本語が「${shown(before[COL.japanese])}」から「${shown(row[COL.japanese])}」に変更されます`,row[COL.meaningNo]);
        if(text(before[COL.english])!==text(row[COL.english]))add(row,`${label}の英語が「${shown(before[COL.english])}」から「${shown(row[COL.english])}」に変更されます`,row[COL.meaningNo]);
        if(text(before[COL.note])!==text(row[COL.note]))add(row,`${label}の補足が「${shown(before[COL.note])}」から「${shown(row[COL.note])}」に変更されます`,row[COL.meaningNo]);
      });
      currentRows.filter(row=>!cardEditorRowBaseline.has(row)).forEach(row=>{
        if(text(row[COL.exampleNo]))add(row,`例文${formatExampleLetter(row[COL.exampleNo])}が追加されます（意味：「${shown(row[COL.meaning])}」／日本語：「${shown(row[COL.japanese])}」／英語：「${shown(row[COL.english])}」${text(row[COL.note])?`／補足：「${shown(row[COL.note])}」`:''}）`,row[COL.meaningNo]);
        else if(text(row[COL.meaning]))add(row,`が新規登録されます（意味：「${shown(row[COL.meaning])}」）`,row[COL.meaningNo]);
      });
      const rowsChanged=Boolean(cardEditorRowsSnapshot)&&JSON.stringify(currentRows)!==JSON.stringify(cardEditorRowsSnapshot);
      if(rowsChanged&&!changes.length)add(selectedVocabularyRow||cardEditorRow,'の意味・例文構成が変更されます');
      return changes;
    };
    let cardEditorConfirmResolve=null;
    const showCardEditorConfirmation=(changes,isCancel=false)=>new Promise(resolve=>{
      cardEditorConfirmResolve=resolve;cardEditorConfirmTitle.textContent=isCancel?'キャンセルしますか？':changes.length?'データ変更があります':'データ変更はありません';
      cardEditorConfirmChanges.replaceChildren();
      if(isCancel){cardEditorConfirmChanges.textContent='編集中のデータはマスタに反映されません'}
      else if(changes.length){const list=document.createElement('ul');changes.forEach(change=>{const item=document.createElement('li');item.textContent=change;list.append(item)});cardEditorConfirmChanges.append(list)}
      cardEditorConfirmChanges.hidden=!isCancel&&!changes.length;cardEditorConfirmCancel.hidden=false;cardEditorConfirmActions.classList.remove('single');cardEditorConfirm.hidden=false;cardEditorConfirmOk.focus({preventScroll:true});
    });
    cardEditorConfirmCancel.addEventListener('click',()=>{cardEditorConfirm.hidden=true;const resolve=cardEditorConfirmResolve;cardEditorConfirmResolve=null;resolve?.(false);cardEditorCancel.focus({preventScroll:true})});
    cardEditorConfirmOk.addEventListener('click',()=>{
      cardEditorConfirm.hidden=true;const resolve=cardEditorConfirmResolve;cardEditorConfirmResolve=null;resolve?.(true);
    });
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
        showSelectedMeaning(pendingMeaningChoice.number,pendingMeaningChoice.value,false,true);syncCardEditorMessages();cardMeaningStep.hidden=false;return;
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
              cardMeaningConfirm.textContent='この意味を登録';cardMeaningConfirm.hidden=false;cardMeaningReselect.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
            },[cardMeaningNew,cardMeaningField,cardMeaningConfirm,cardMeaningReselect]);
          }else{
            await fadeMeaningTransition([cardMeaningResults,cardMeaningMessage],()=>{
              cardMeaningStep.classList.remove('is-choosing');selectedMeaningMode='existing-choice';pendingMeaningChoice={number:choice.number,value:choice.value};cardMeaningInput.value=choice.value;cardMeaningResults.hidden=true;cardMeaningField.hidden=true;cardMeaningConfirm.hidden=true;
              showSelectedMeaning(choice.number,choice.value,false,true);cardMeaningEditActions.hidden=false;cardExampleStep.hidden=true;syncCardEditorMessages();
            },[cardSelectedMeaning,cardMeaningEditActions]);
          }
        });
        if(choice.kind==='new')cardMeaningResults.append(button);
        else{
          const row=document.createElement('div');row.className='card-meaning-option-row';
          const orderActions=document.createElement('span');orderActions.className='card-meaning-order-actions';
          const meaningIndex=meanings.findIndex(item=>text(item.number)===text(choice.number));
          const moveMeaning=delta=>{
            const target=meaningIndex+delta;if(target<0||target>=meanings.length)return;
            const targetChoice=meanings[target];
            const changedRows=(practiceStored.rows||[]).filter(item=>vocabularyKey(item)===pairKey&&[text(choice.number),text(targetChoice.number)].includes(text(item[COL.meaningNo])));
            changedRows.forEach(item=>{item[COL.meaningNo]=text(item[COL.meaningNo])===text(choice.number)?text(targetChoice.number):text(choice.number)});
            cardEditorHasStagedChanges=true;renderMeaningResults();
          };
          const moveUp=document.createElement('button');moveUp.type='button';moveUp.className='card-order-button';moveUp.textContent='↑';moveUp.setAttribute('aria-label',`意味${choice.number}を前へ移動`);moveUp.disabled=meaningIndex===0;moveUp.addEventListener('click',()=>moveMeaning(-1));
          const moveDown=document.createElement('button');moveDown.type='button';moveDown.className='card-order-button';moveDown.textContent='↓';moveDown.setAttribute('aria-label',`意味${choice.number}を後ろへ移動`);moveDown.disabled=meaningIndex===meanings.length-1;moveDown.addEventListener('click',()=>moveMeaning(1));
          orderActions.append(moveUp,moveDown);
          const remove=document.createElement('button');remove.type='button';remove.className='card-meaning-option-remove';remove.textContent='削除';
          remove.addEventListener('click',()=>{
            if(!confirm(`意味「${choice.value}」を削除しますか？\n\nこの意味に登録されている例文も削除されます。`))return;
            const targetRows=(practiceStored.rows||[]).filter(item=>vocabularyKey(item)===pairKey&&text(item[COL.meaningNo])===text(choice.number));
            const remainingPair=(practiceStored.rows||[]).filter(item=>vocabularyKey(item)===pairKey&&!targetRows.includes(item));
            if(remainingPair.length){practiceStored.rows=practiceStored.rows.filter(item=>!targetRows.includes(item))}
            else{
              const base=targetRows[0];practiceStored.rows=practiceStored.rows.filter(item=>!targetRows.includes(item)||item===base);
              base[COL.meaningNo]='';base[COL.meaning]='';base[COL.exampleNo]='';base[COL.japanese]='';base[COL.english]='';base[COL.note]='';base[COL.understanding]='';base[COL.correctCount]=0;base[COL.wrongCount]=0;base[COL.questionCount]=0;
            }
            const remaining=(practiceStored.rows||[]).filter(item=>vocabularyKey(item)===pairKey&&text(item[COL.meaning]));
            const numbers=[...new Set(remaining.map(item=>text(item[COL.meaningNo])).filter(Boolean))].sort((a,b)=>(Number(a)||Number.MAX_SAFE_INTEGER)-(Number(b)||Number.MAX_SAFE_INTEGER));
            const renumber=new Map(numbers.map((number,index)=>[number,String(index+1)]));
            remaining.forEach(item=>{item[COL.meaningNo]=renumber.get(text(item[COL.meaningNo]))||item[COL.meaningNo]});
            cardEditorHasStagedChanges=true;renderMeaningResults();
          });
          row.append(button,orderActions,remove);cardMeaningResults.append(row);
        }
      });
      cardMeaningStep.hidden=false;syncCardEditorMessages();
    };
    const openCardEditor=(mode,row=null)=>{
      if(autoPlaying)stopAutoPlayback();
      cardEditorRowsSnapshot=(practiceStored.rows||[]).map(item=>[...item]);cardEditorRowBaseline=new Map((practiceStored.rows||[]).map(item=>[item,[...item]]));cardEditorHasStagedChanges=false;cardExampleCommitStatus=new Map();
      cardEditorMode=mode;cardEditorRow=row;selectedVocabularyRow=mode==='edit'?row:null;
      cardWordStep.classList.toggle('has-selection',mode==='edit');
      cardEditorOverlay.dataset.mode=mode;
      cardEditorTitle.textContent='データ編集';
      cardEditorBody.scrollTop=0;cardWordFilterPanel.scrollTop=0;cardWordFilterPanel.hidden=true;cardFilterStickySummary.hidden=true;cardWordFilterToggle.setAttribute('aria-expanded','false');pendingMeaningChoice=null;selectedMeaningNumber='';cardExampleDrafts=[];cardDeletedExampleRows=[];cardExampleCarousel.replaceChildren();
      selectedMeaningMode=mode==='edit'?'existing':null;
      cardWordStep.hidden=false;
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
        cardEditorCancel.focus({preventScroll:true});
      }));
    };
    const closeCardEditor=async(restore=true)=>{
      const animationRun=++cardEditorAnimationRun;
      if(restore&&cardEditorRowsSnapshot){practiceStored.rows=cardEditorRowsSnapshot.map(item=>[...item]);refreshPracticeAfterMutation()}
      cardEditorRowsSnapshot=null;cardEditorRowBaseline=new Map();cardEditorHasStagedChanges=false;
      cardEditorConfirm.hidden=true;cardEditorConfirmResolve=null;
      cardWordFilterPanel.hidden=true;cardFilterStickySummary.hidden=true;cardWordFilterToggle.setAttribute('aria-expanded','false');cardEditorBody.scrollTop=0;cardWordFilterPanel.scrollTop=0;
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
      practiceIndex=Math.max(0,Math.min(practiceIndex,practiceRows.length-1));
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
      if(filterCardSectionHead.parentNode!==filterCard)filterCard.prepend(filterCardSectionHead);
      if(filterCardHomeNext?.parentNode===filterCardHomeParent)filterCardHomeParent.insertBefore(filterCard,filterCardHomeNext);
      else filterCardHomeParent.append(filterCard);
    };
    const openPracticeFilter=()=>{
      if(practiceFilterOpen)return;
      practiceFilterOpen=true;
      practiceFilterSnapshot={choices:allFilterChoices.map(choice=>choice.classList.contains('selected')),text:[wordStartsWith.value,wordEndsWith.value,wordIncludes.value]};
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
        applyPracticeMethodChange(previousRow);
        setPracticeViewMode(previousViewMode==='card'&&practiceRows.length?'card':'list');
      }
      practiceFilterSnapshot=null;
    };
    const cancelPracticeFilter=()=>{
      if(practiceFilterSnapshot){
        allFilterChoices.forEach((choice,index)=>choice.classList.toggle('selected',practiceFilterSnapshot.choices[index]));
        [wordStartsWith.value,wordEndsWith.value,wordIncludes.value]=practiceFilterSnapshot.text;
        syncWordTextFilterReset();
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
        await saveImportedData(practiceStored);
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
    const speakPracticeWord=(lang,button)=>{
      if(autoPlaying)stopAutoPlayback();
      if(!('speechSynthesis' in window))return;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(practiceWord.textContent);
      utterance.lang=lang;
      utterance.rate=Number(playbackSettings.englishRate);
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
      utterance.rate=Number(playbackSettings.japaneseRate);
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
      utterance.rate=Number(playbackSettings.englishRate);
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
        await saveImportedData(practiceStored);
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
      try{await saveImportedData(practiceStored);closeResultEditor();syncPracticeResultCounts(row)}
      catch{Object.entries(resultColumn).forEach(([key,column])=>{row[column]=originals[key]});alert('結果を保存できませんでした。')}
      finally{resultEditorSave.disabled=false}
    });
    resultEditorCancel.addEventListener('click',closeResultEditor);
    resultEditorOverlay.addEventListener('click',event=>{if(event.target===resultEditorOverlay)closeResultEditor()});
    practiceResultButtons.forEach(button=>button.addEventListener('click',async()=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored||practiceMoving)return;
      const column=button.dataset.result==='correct'?COL.correctCount:button.dataset.result==='wrong'?COL.wrongCount:COL.questionCount;
      const originalValue=row[column];
      row[column]=(Number(row[column])||0)+1;
      practiceStored.modified=true;
      syncPracticeResultCounts(row);
      const count=button.closest('.practice-result-choice')?.querySelector('small');
      button.animate?.([{transform:'scale(.82)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:260,easing:'cubic-bezier(.2,.85,.3,1)'});
      count?.animate?.([{transform:'translateY(2px) scale(.75)',opacity:.35},{transform:'translateY(-2px) scale(1.35)',opacity:1},{transform:'translateY(0) scale(1)',opacity:1}],{duration:320,easing:'cubic-bezier(.2,.85,.3,1)'});
      try{await saveImportedData(practiceStored)}catch{
        row[column]=originalValue;
        syncPracticeResultCounts(row);
        alert('結果を保存できませんでした。');
      }
    }));
    practiceRatingButtons.forEach(button=>button.addEventListener('click',async()=>{
      const row=currentPracticeRow();
      if(!row||!practiceStored)return;
      const originalValue=row[COL.understanding];
      row[COL.understanding]=text(row[COL.understanding])===button.dataset.value?'':button.dataset.value;
      practiceStored.modified=true;
      syncPracticeRating(row);
      try{await saveImportedData(practiceStored)}catch{
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
