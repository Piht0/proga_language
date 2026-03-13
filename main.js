let themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') { body.classList.add('dark-theme'); }
themeToggleBtn.addEventListener('click', () => {
    body.classList.toggle('dark-theme');
    localStorage.setItem('theme', body.classList.contains('dark-theme') ? 'dark' : 'light');
});

const blocksPanel = document.querySelector('.blocks-panel');
const canvas = document.getElementById('workspace-canvas');
const placeholder = document.getElementById('workspace-placeholder');
const resetBtn = document.getElementById('reset-btn');
const deleteArea = document.getElementById('delete-area');
const runBtn = document.querySelector('.btn.btn-primary');
const saveBtn = document.getElementById('save-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');

let draggedEl = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
const SNAP_DISTANCE = 20;
const STACK_X_OFFSET = 0;

let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionBox = null;
let selectedBlocks = [];
let isDraggingGroup = false;
let groupDragOffsetX = 0;
let groupDragOffsetY = 0;

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ UI-ФУНКЦИИ
// ============================================
function updatePanelHighlight(e) {
    if (!draggedEl) return;
    const panelRect = blocksPanel.getBoundingClientRect();
    const isInPanel = (
        e.clientX >= panelRect.left && e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top  && e.clientY <= panelRect.bottom
    );
    blocksPanel.style.boxShadow = isInPanel ? '0 0 0 3px rgba(239, 68, 68, 0.7)' : '';
    blocksPanel.style.borderColor = isInPanel ? 'rgba(239, 68, 68, 0.9)' : '';
}
function clearPanelHighlight() {
    blocksPanel.style.boxShadow = '';
    blocksPanel.style.borderColor = '';
}
function clearSelection() {
    selectedBlocks.forEach(b => b.classList.remove('selected'));
    selectedBlocks = [];
}
function selectBlocksInRect(rect) {
    clearSelection();
    const cr = canvas.getBoundingClientRect();
    Array.from(canvas.querySelectorAll('.workspace-block')).forEach(block => {
        const br = block.getBoundingClientRect();
        const bl = br.left - cr.left, bt = br.top - cr.top;
        const brr = bl + block.offsetWidth, bb = bt + block.offsetHeight;
        if (!(brr < rect.left || bl > rect.right || bb < rect.top || bt > rect.bottom)) {
            block.classList.add('selected'); selectedBlocks.push(block);
        }
    });
}
function getSelectedBlocksBounds() {
    if (!selectedBlocks.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of selectedBlocks) {
        const x = parseFloat(b.style.left) || 0, y = parseFloat(b.style.top) || 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + b.offsetWidth); maxY = Math.max(maxY, y + b.offsetHeight);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
function updatePlaceholderVisibility() {
    placeholder.style.display = canvas.querySelectorAll('.workspace-block').length > 0 ? 'none' : 'flex';
}
function updateLoopBodyHints() {
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const hasBlocks = body.querySelector('.workspace-block');
        let hint = body.querySelector('.loop-body-hint, .if-body-hint, .else-body-hint');
        if (hasBlocks) { if (hint) hint.remove(); }
        else if (!hint) {
            hint = document.createElement('div');
            hint.className = body.classList.contains('loop-body') ? 'loop-body-hint'
                : body.classList.contains('if-body')   ? 'if-body-hint'
                    : 'else-body-hint';
            hint.textContent = body.classList.contains('else-body') ? 'Перетащи блоки сюда (else)' :
                'Перетащи блоки сюда';
            body.appendChild(hint);
        }
    });
}
function findDeepestDropTarget(clientX, clientY, draggedElement) {
    let bestTarget = null, smallestArea = Infinity;
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const r = body.getBoundingClientRect();
        if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;
        if (draggedElement && draggedElement.contains(body)) return;
        const area = r.width * r.height;
        if (area < smallestArea) { smallestArea = area; bestTarget = body; }
    });
    return bestTarget;
}

// ============================================
// ФАБРИКА БЛОКОВ
// ============================================
function createWorkspaceBlock(type) {
    const block = document.createElement('div');
    block.classList.add('workspace-block');

    if (type === 'print') {
        block.classList.add('block-print'); block.dataset.type = 'print';
        block.innerHTML = `<div class="block-header"><span>🖨</span><input type="text" placeholder="выражение" 
            class="input-msg" style="width:110px"></div><div class="connector"></div><div class="notch"></div>`;
    } else if (type === 'assign') {
        block.classList.add('block-assign'); block.dataset.type = 'assign';
        block.innerHTML = `<div class="block-header"><input type="text" placeholder="x" class="input-target" 
            style="width:50px"><span>←</span><input type="text" placeholder="выражение" class="input-value" 
            style="width:90px"></div><div class="connector"></div><div class="notch"></div>`;
    } else if (type === 'declare') {
        block.classList.add('block-assign'); block.dataset.type = 'declare';
        block.innerHTML = `<div class="block-header"><span>var</span><input type="text" placeholder="x, y, z" 
            class="input-declare" style="width:120px"></div><div class="connector"></div><div class="notch"></div>`;

        // ★ if  AND / OR / NOT
    } else if (type === 'if') {
        block.classList.add('block-if'); block.dataset.type = 'if';
        block.innerHTML = `
            <div class="block-header">
                <span>if</span>
                <input type="text" placeholder="x > 0 AND y &lt; 5" class="input-condition" style="width:170px">
                <span>:</span>
            </div>
            <div class="if-body"><div class="if-body-hint">Перетащи блоки сюда</div></div>
            <div class="else-label">else</div>
            <div class="else-body"><div class="else-body-hint">Перетащи блоки сюда (else)</div></div>
            <div class="connector"></div><div class="notch"></div>`;

        // ★ while — одно поле условия с поддержкой AND / OR / NOT
    } else if (type === 'loop') {
        block.classList.add('block-loop'); block.dataset.type = 'loop';
        block.innerHTML = `
            <div class="block-header">
                <span>while</span>
                <input type="text" placeholder="i &lt; 10 AND j &gt; 0" class="input-condition" style="width:160px">
            </div>
            <div class="loop-body"><div class="loop-body-hint">Перетащи блоки сюда</div></div>
            <div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'arraycreate') {
        block.classList.add('block-assign'); block.dataset.type = 'arraycreate';
        block.innerHTML = `<div class="block-header"><span>📦</span><input type="text" placeholder="a" 
            class="input-arr-name" style="width:35px"><span>= new Array[</span><input type="text" placeholder="5" 
            class="input-arr-size" style="width:35px"><span>]</span></div><div class="connector"></div><div class="notch"></div>`;
    } else if (type === 'arrayset') {
        block.classList.add('block-assign'); block.dataset.type = 'arrayset';
        block.innerHTML = `<div class="block-header"><input type="text" placeholder="a" class="input-arr-name" 
            style="width:30px"><span>[</span><input type="text" placeholder="i" class="input-arr-index" 
            style="width:30px"><span>] ←</span><input type="text" placeholder="0" class="input-arr-value" 
            style="width:65px"></div><div class="connector"></div><div class="notch"></div>`;
    } else if (type === 'arrayget') {
        block.classList.add('block-assign'); block.dataset.type = 'arrayget';
        block.innerHTML = `<div class="block-header"><input type="text" placeholder="x" class="input-target" 
            style="width:35px"><span>←</span><input type="text" placeholder="a" class="input-arr-name" 
            style="width:30px"><span>[</span><input type="text" placeholder="i" class="input-arr-index" 
            style="width:30px"><span>]</span></div><div class="connector"></div><div class="notch"></div>`;
    } else if (type === 'arrayprint') {
        block.classList.add('block-print'); block.dataset.type = 'arrayprint';
        block.innerHTML = `<div class="block-header"><span>🖨 print[</span><input type="text" placeholder="a" 
            class="input-arr-name" style="width:35px"><span>]</span></div><div class="connector"></div><div 
            class="notch"></div>`;
    } else if (type === 'bubblesort') {
        block.classList.add('block-logic'); block.dataset.type = 'bubblesort';
        block.innerHTML = `<div class="block-header"><span>🔀 sort(</span><input type="text" placeholder="a" 
            class="input-arr-name" style="width:35px"><span>)</span></div><div class="connector"></div><div 
            class="notch"></div>`;
    } else {
        block.textContent = type;
        block.innerHTML += '<div class="connector"></div><div class="notch"></div>';
    }
    return block;
}

// ============================================
// SNAP
// ============================================
function findSnapTarget(block) {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block')).filter(b => b !== block);
    if (!blocks.length) return null;
    const cr = canvas.getBoundingClientRect(), r = block.getBoundingClientRect();
    const blockTop = r.top - cr.top, blockBottom = r.bottom - cr.top;
    const blockCX  = r.left - cr.left;
    let best = null, bestDist = Infinity;
    for (const other of blocks) {
        const or = other.getBoundingClientRect();
        const oTop = or.top - cr.top, oBottom = or.bottom - cr.top, oCX = or.left - cr.left;
        const db = Math.abs(blockTop - oBottom), da = Math.abs(blockBottom - oTop);
        if (Math.abs(blockCX - oCX) < 60) {
            if (db < bestDist && db < SNAP_DISTANCE) { bestDist = db; best = { other, position: 'below' }; }
            if (da < bestDist && da < SNAP_DISTANCE) { bestDist = da; best = { other, position: 'above' }; }
        }
    }
    return best;
}

// ============================================
// DRAG & DROP
// ============================================
document.addEventListener('mousedown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const paletteBlock = e.target.closest('.block[data-block-type]');
    const wsBlock = e.target.closest('.workspace-block');
    if (!paletteBlock && !wsBlock && e.target.closest('.workspace-canvas')) {
        e.preventDefault();
        const cr = canvas.getBoundingClientRect();
        isSelecting = true;
        selectionStartX = e.clientX - cr.left; selectionStartY = e.clientY - cr.top;
        selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        Object.assign(selectionBox.style, { left: selectionStartX + 'px', top:
                selectionStartY + 'px', width: '0', height: '0' });
        canvas.appendChild(selectionBox);
        if (!e.ctrlKey && !e.metaKey) clearSelection();
        return;
    }
    if (!paletteBlock && !wsBlock) { clearSelection(); return; }
    e.preventDefault();
    const cr = canvas.getBoundingClientRect();
    if (paletteBlock) {
        clearSelection();
        const block = createWorkspaceBlock(paletteBlock.dataset.blockType);
        canvas.appendChild(block);
        block.style.left = (e.clientX - cr.left - block.offsetWidth  / 2) + 'px';
        block.style.top  = (e.clientY - cr.top  - block.offsetHeight / 2) + 'px';
        draggedEl = block;
    } else {
        const parentBody = wsBlock.closest('.loop-body, .if-body, .else-body');
        if (parentBody) {
            const br = wsBlock.getBoundingClientRect();
            wsBlock.style.setProperty('position', 'absolute', 'important');
            wsBlock.style.setProperty('left', (br.left - cr.left) + 'px', 'important');
            wsBlock.style.setProperty('top',  (br.top  - cr.top)  + 'px', 'important');
            wsBlock.style.width = ''; wsBlock.style.zIndex = '';
            canvas.appendChild(wsBlock); updateLoopBodyHints();
        }
        if (e.ctrlKey || e.metaKey) {
            if (wsBlock.classList.contains('selected')) { wsBlock.classList.remove('selected');
                selectedBlocks = selectedBlocks.filter(b => b !== wsBlock); }
            else { wsBlock.classList.add('selected'); selectedBlocks.push(wsBlock); }
            draggedEl = null; return;
        }
        if (!wsBlock.classList.contains('selected')) clearSelection();
        if (selectedBlocks.length > 0 && wsBlock.classList.contains('selected')) {
            isDraggingGroup = true;
            const bounds = getSelectedBlocksBounds();
            if (bounds) { groupDragOffsetX = e.clientX - cr.left - bounds.minX;
                groupDragOffsetY = e.clientY - cr.top - bounds.minY; }
        }
        const rect = wsBlock.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left; dragOffsetY = e.clientY - rect.top;
        wsBlock.style.zIndex = 1000; draggedEl = wsBlock;
    }
});

document.addEventListener('mousemove', e => {
    if (isSelecting && selectionBox) {
        const cr = canvas.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        Object.assign(selectionBox.style, {
            left: Math.min(selectionStartX, cx) + 'px', top: Math.min(selectionStartY, cy) + 'px',
            width: Math.abs(cx - selectionStartX) + 'px', height: Math.abs(cy - selectionStartY) + 'px'
        });
        return;
    }
    if (!draggedEl) return;
    const cr = canvas.getBoundingClientRect();
    if (isDraggingGroup && selectedBlocks.length > 0) {
        const gx = e.clientX - cr.left - groupDragOffsetX, gy = e.clientY - cr.top - groupDragOffsetY;
        const bounds = getSelectedBlocksBounds();
        if (bounds) {
            const dx = gx - bounds.minX, dy = gy - bounds.minY;
            for (const b of selectedBlocks) {
                b.style.left = Math.max(0, Math.min((parseFloat(b.style.left)||0)+dx, cr.width  - b.offsetWidth))  + 'px';
                b.style.top  = Math.max(0, Math.min((parseFloat(b.style.top) ||0)+dy, cr.height - b.offsetHeight)) + 'px';
            }
        }
    } else {
        draggedEl.style.left = Math.max(0, Math.min(e.clientX - cr.left - dragOffsetX, cr.width  - draggedEl.offsetWidth))  + 'px';
        draggedEl.style.top  = Math.max(0, Math.min(e.clientY - cr.top  - dragOffsetY, cr.height - draggedEl.offsetHeight)) + 'px';
    }
    updatePanelHighlight(e);
    const deepest = findDeepestDropTarget(e.clientX, e.clientY, draggedEl);
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.toggle('drop-target', b === deepest));
    const dr = deleteArea.getBoundingClientRect();
    deleteArea.classList.toggle('active', e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom);
});

document.addEventListener('mouseup', e => {
    if (isSelecting && selectionBox) {
        const cr = canvas.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        const left = Math.min(selectionStartX, cx), top = Math.min(selectionStartY, cy);
        const w = Math.abs(cx - selectionStartX), h = Math.abs(cy - selectionStartY);
        if (w > 5 || h > 5) selectBlocksInRect({ left, top, right: left + w, bottom: top + h });
        selectionBox.remove(); selectionBox = null; isSelecting = false; return;
    }
    if (!draggedEl) return;
    const pr = blocksPanel.getBoundingClientRect(), dr = deleteArea.getBoundingClientRect();
    const inPanel  = e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom;
    const inDelete = e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom;
    if (isDraggingGroup) {
        if (inPanel || inDelete) { selectedBlocks.forEach(b => b.remove()); clearSelection(); }
        else {
            const snap = findSnapTarget(draggedEl);
            if (snap) {
                const cr = canvas.getBoundingClientRect(), or = snap.other.getBoundingClientRect();
                const newX = or.left - cr.left + STACK_X_OFFSET;
                const newY = snap.position === 'below' ? or.bottom - cr.top + 4 : or.top - cr.top - draggedEl.offsetHeight - 4;
                const dx = newX - (parseFloat(draggedEl.style.left)||0), dy = newY - (parseFloat(draggedEl.style.top)||0);
                for (const b of selectedBlocks) { b.style.left = ((parseFloat(b.style.left)||0)+dx)+'px'; b.style.top = ((parseFloat(b.style.top)||0)+dy)+'px'; }
                draggedEl.style.zIndex = '';
            }
        }
        clearPanelHighlight(); deleteArea.classList.remove('active'); draggedEl = null; isDraggingGroup = false; updatePlaceholderVisibility(); return;
    }
    clearPanelHighlight(); deleteArea.classList.remove('active');
    if (inPanel || inDelete) { draggedEl.remove(); draggedEl = null; updatePlaceholderVisibility(); canvas.querySelectorAll('.loop-body,.if-body,.else-body').forEach(b=>b.classList.remove('drop-target')); return; }
    const nestTarget = findDeepestDropTarget(e.clientX, e.clientY, draggedEl);
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));
    if (nestTarget) {
        Object.assign(draggedEl.style, { position: '', left: '', top: '', zIndex: '', width: '' });
        nestTarget.appendChild(draggedEl); draggedEl = null; updatePlaceholderVisibility(); updateLoopBodyHints(); return;
    }
    const snap = findSnapTarget(draggedEl);
    if (snap) {
        const cr = canvas.getBoundingClientRect(), or = snap.other.getBoundingClientRect();
        draggedEl.style.left = (or.left - cr.left + STACK_X_OFFSET) + 'px';
        draggedEl.style.top  = (snap.position === 'below' ? or.bottom - cr.top + 4 : or.top - cr.top - draggedEl.offsetHeight - 4) + 'px';
    }
    draggedEl.style.zIndex = ''; draggedEl = null; updatePlaceholderVisibility();
});

resetBtn.addEventListener('click', () => { canvas.querySelectorAll('.workspace-block').forEach(b => b.remove()); updatePlaceholderVisibility(); });
document.addEventListener('dragstart', e => { if (e.target.closest('.block') || e.target.closest('.workspace-block')) e.preventDefault(); });
updatePlaceholderVisibility();

// ============================================
// СОХРАНЕНИЕ / ЗАГРУЗКА
// ============================================
function serializeBlock(block) {
    const data = { type: block.dataset.type, left: block.style.left, top: block.style.top, inputs: {} };
    block.querySelectorAll(':scope > .block-header input, :scope > .block-header select').forEach(el => { data.inputs[el.className] = el.value; });
    ['loop-body', 'if-body', 'else-body'].forEach(cls => {
        const body = block.querySelector(':scope > .' + cls);
        if (body) data[cls] = Array.from(body.querySelectorAll(':scope > .workspace-block')).map(serializeBlock);
    });
    return data;
}
function deserializeBlock(data) {
    const block = createWorkspaceBlock(data.type);
    block.style.left = data.left || '20px'; block.style.top = data.top || '20px';
    Object.entries(data.inputs || {}).forEach(([cls, val]) => { const el = block.querySelector('.' + cls.trim().split(' ')[0]); if (el) el.value = val; });
    ['loop-body', 'if-body', 'else-body'].forEach(cls => {
        if (data[cls] && data[cls].length) {
            const body = block.querySelector('.' + cls);
            if (body) data[cls].forEach(cd => { const c = deserializeBlock(cd); Object.assign(c.style, { position: '', left: '', top: '' }); body.appendChild(c); });
        }
    });
    updateLoopBodyHints(); return block;
}
saveBtn.addEventListener('click', () => {
    const json = JSON.stringify({ version: 2, blocks: Array.from(canvas.querySelectorAll(':scope > .workspace-block')).map(serializeBlock) }, null, 2);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'workspace.json'; a.click();
});
importBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { try { const data = JSON.parse(ev.target.result); canvas.querySelectorAll('.workspace-block').forEach(b => b.remove()); (data.blocks||[]).forEach(d => canvas.appendChild(deserializeBlock(d))); updatePlaceholderVisibility(); updateLoopBodyHints(); } catch(err) { alert('Ошибка импорта: ' + err.message); } };
    reader.readAsText(file); importFileInput.value = '';
});

// ============================================
// КОНСОЛЬ
// ============================================
const consolePane = document.createElement('div');
consolePane.style.cssText = 'position:fixed;left:12px;bottom:12px;width:320px;max-height:180px;overflow-y:auto;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:10px;font-family:ui-monospace,Menlo,Monaco,Consolas,"Courier New",monospace;font-size:11px;padding:8px;box-shadow:0 18px 40px rgba(0,0,0,0.4);color:var(--text-main);pointer-events:auto;z-index:9999;';
consolePane.textContent = '▶ ожидание запуска…';
document.body.appendChild(consolePane);
function logToConsole(msg, isError = false) {
    const line = document.createElement('div');
    line.textContent = msg; line.style.marginBottom = '2px';
    line.style.color = isError ? 'var(--error)' : 'var(--text-muted)';
    if (isError) line.style.fontWeight = '600';
    consolePane.appendChild(line); consolePane.scrollTop = consolePane.scrollHeight;
}
function clearConsole() { consolePane.textContent = ''; }

// ============================================
// БЭКЕНД: ВЫЧИСЛИТЕЛЬ ВЫРАЖЕНИЙ
// ============================================

function substituteVariables(expr, vars) {
    // Подставляем значения элементов массива: a[i+1]
    expr = expr.replace(/([a-zA-Z][a-zA-Z0-9_]*)\[([^\]]+)\]/g, (match, name, idxExpr) => {
        if (!vars.arrays || vars.arrays[name] === undefined) throw new Error('Массив не найден: ' + name);
        const idx = Math.floor(evalExpression(idxExpr, vars));
        if (idx < 0 || idx >= vars.arrays[name].length) throw new Error('Индекс вне диапазона: ' + name + '[' + idx + ']');
        return vars.arrays[name][idx];
    });
    // Подставляем переменные (от длинных к коротким — чтобы abc не заменилось как a+bc)
    const varNames = Object.keys(vars).filter(k => k !== 'arrays').sort((a, b) => b.length - a.length);
    for (const name of varNames) {
        const regex = new RegExp('(?<![a-zA-Z0-9_])' + name + '(?![a-zA-Z0-9_])', 'g');
        expr = expr.replace(regex, vars[name]);
    }
    return expr;
}

// Раскрываем скобки
function parseeval(line) {
    var k = 1;
    do {
        var open = line.lastIndexOf('(');
        if (open < 0) { k = 0; }
        else {
            var close = line.indexOf(')', open);
            if (close < 0) throw new Error('Незакрытая скобка');
            var inside = line.slice(open + 1, close);
            line = line.substr(0, open) + parseadd(parsemultiply(inside)).toString() + line.substr(close + 1);
        }
    } while (k === 1);
    return line;
}

// ★ ИСПРАВЛЕНО: parsemultiply обрабатывает *, / (целая часть) и % (остаток)
function parsemultiply(line) {
    var k = 1;
    do {
        // Находим первый *, / или %
        var candidates = [
            { op: '*', pos: line.indexOf('*') },
            { op: '/', pos: line.indexOf('/') },
            { op: '%', pos: line.indexOf('%') }
        ].filter(c => c.pos !== -1).sort((a, b) => a.pos - b.pos);

        if (!candidates.length) { k = 0; continue; }
        var firstOp = candidates[0].pos;
        var operator = candidates[0].op;

        // Ищем начало левого операнда: сканируем назад до +-  или начала строки
        var leftStart = firstOp - 1;
        while (leftStart > 0 && '+-'.indexOf(line.charAt(leftStart - 1)) === -1) {
            leftStart--;
        }
        // Унарный знак в начале: если leftStart=1 и перед ним +/-, то это разделитель — не включаем
        // Если leftStart=0, первый символ может быть унарным '-', включаем его
        if (leftStart === 1 && '+-'.indexOf(line.charAt(0)) !== -1) {
            leftStart = 0; // включаем унарный знак
        }

        // Находим конец правого операнда
        var rightEnd = firstOp + 1;
        // Правый операнд может начинаться с унарного знака
        if (rightEnd < line.length && '+-'.indexOf(line.charAt(rightEnd)) !== -1) rightEnd++;
        while (rightEnd < line.length && '+-'.indexOf(line.charAt(rightEnd)) === -1) rightEnd++;

        var op1 = parseFloat(line.slice(leftStart, firstOp));
        var op2 = parseFloat(line.slice(firstOp + 1, rightEnd));
        var res;
        if (operator === '*') {
            res = op1 * op2;
        } else if (operator === '/') {
            if (op2 === 0) throw new Error('Деление на ноль');
            res = Math.trunc(op1 / op2);  // целочисленное деление
        } else { // %
            if (op2 === 0) throw new Error('Деление на ноль (остаток)');
            res = ((op1 % op2) + Math.abs(op2)) % Math.abs(op2); // всегда неотрицательный остаток
        }
        line = line.slice(0, leftStart) + res.toString() + line.slice(rightEnd);
    } while (k === 1);
    return line;
}
function parseadd(line) {
    do {
        var before = 1;
        if (line.charAt(0) === '-') { before = -1; line = line.slice(1); }
        var kx = line.indexOf('+'), ky = line.indexOf('-');
        if (kx === -1 && ky === -1) { line = before * parseFloat(line.toString()); break; }
        var lastz = -1, attr = 0;
        if (kx > 0 && (kx < ky || ky === -1)) { lastz = kx; attr =  1; }
        if (ky > 0 && (ky < kx || kx === -1)) { lastz = ky; attr = -1; }
        if (lastz === -1) { line = before * parseFloat(line); break; } // защита
        var op1 = before * parseFloat(line.slice(0, lastz));
        var arg = lastz + 1;
        // Пропускаем знаки (унарный -, напр. 3+-2)
        while (arg < line.length && '+-'.includes(line.charAt(arg))) arg++;
        // ★ argEnd: конец числа (до следующего бинарного оператора)
        var argEnd = arg;
        while (argEnd < line.length && '+-'.indexOf(line.charAt(argEnd)) === -1) argEnd++;
        var op2 = attr * parseFloat(line.slice(lastz + 1, argEnd));
        line = (op1 + op2).toString() + line.slice(argEnd);
    } while (true);
    return line;
}

function evalExpression(expr, vars) {
    if (!expr || !expr.trim()) return 0;
    var e = expr.replace(/\s/g, '');
    e = substituteVariables(e, vars);
    e = parseeval(e);
    e = parsemultiply(e);
    e = parseadd(e);
    var result = parseFloat(e);
    if (isNaN(result)) throw new Error('Ошибка вычисления: ' + expr);
    return result;
}

// ============================================
// ★ НОВОЕ: ПОЛНЫЙ ПАРСЕР УСЛОВИЙ (AND / OR / NOT / скобки)
// ============================================
function findTopLevelKeyword(str, op) {
    let depth = 0;
    for (let i = 0; i <= str.length - op.length; i++) {
        if (str[i] === '(') { depth++; continue; }
        if (str[i] === ')') { depth--; continue; }
        if (depth !== 0) continue;
        if (str.substring(i, i + op.length).toUpperCase() !== op) continue;
        const prev = i > 0 ? str[i - 1] : ' ';
        const next = i + op.length < str.length ? str[i + op.length] : ' ';
        if (!/[a-zA-Z0-9_]/.test(prev) && !/[a-zA-Z0-9_]/.test(next)) return i;
    }
    return -1;
}

function findComparisonOp(str) {
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') { depth++; continue; }
        if (str[i] === ')') { depth--; continue; }
        if (depth !== 0) continue;
        for (const op of ['<=', '>=', '!=', '==', '<', '>']) {
            if (str.substring(i, i + op.length) === op) return { op, pos: i };
        }
    }
    return null;
}

function hasOuterParens(str) {
    if (str[0] !== '(' || str[str.length - 1] !== ')') return false;
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') { depth--; if (depth === 0 && i < str.length - 1) return false; }
    }
    return depth === 0;
}

function evaluateConditionExpr(raw, vars) {
    const str = raw.trim();
    if (!str) throw new Error('Условие не указано');

    // OR (наименьший приоритет)
    const orPos = findTopLevelKeyword(str, 'OR');
    if (orPos !== -1)
        return evaluateConditionExpr(str.slice(0, orPos), vars) ||
            evaluateConditionExpr(str.slice(orPos + 2), vars);

    // AND
    const andPos = findTopLevelKeyword(str, 'AND');
    if (andPos !== -1)
        return evaluateConditionExpr(str.slice(0, andPos), vars) &&
            evaluateConditionExpr(str.slice(andPos + 3), vars);

    // NOT
    if (str.toUpperCase().startsWith('NOT')) {
        const after = str.slice(3).trim();
        if (after) return !evaluateConditionExpr(after, vars);
    }

    // Внешние скобки
    if (hasOuterParens(str)) return evaluateConditionExpr(str.slice(1, -1), vars);

    // Базовое сравнение: left OP right
    const cmp = findComparisonOp(str);
    if (!cmp) throw new Error('Неверное условие: ' + str);
    const left  = evalExpression(str.slice(0, cmp.pos).trim(), vars);
    const right = evalExpression(str.slice(cmp.pos + cmp.op.length).trim(), vars);
    switch (cmp.op) {
        case '<':  return left <  right;
        case '>':  return left >  right;
        case '==': return left === right;
        case '!=': return left !== right;
        case '>=': return left >= right;
        case '<=': return left <= right;
    }
    return false;
}

// ============================================
// ВЫПОЛНЕНИЕ ЦЕПОЧЕК БЛОКОВ
// ============================================
function findNextBlockInChain(currentBlock, allBlocks) {
    const cr = canvas.getBoundingClientRect(), cur = currentBlock.getBoundingClientRect();
    const curBottom = cur.bottom - cr.top, curCX = cur.left - cr.left + cur.width / 2;
    let next = null, minDist = Infinity;
    for (const b of allBlocks) {
        if (b === currentBlock) continue;
        const r = b.getBoundingClientRect();
        const bTop = r.top - cr.top, bCX = r.left - cr.left + r.width / 2;
        const dist = bTop - curBottom;
        if (Math.abs(bCX - curCX) < 60 && dist > 0 && dist < SNAP_DISTANCE + 10 && dist < minDist) { minDist = dist; next = b; }
    }
    return next;
}
function findTopBlocks(blocks) {
    const cr = canvas.getBoundingClientRect();
    return blocks.filter(block => {
        const r = block.getBoundingClientRect();
        const bTop = r.top - cr.top, bCX = r.left - cr.left + r.width / 2;
        return !blocks.some(other => {
            if (other === block) return false;
            const or = other.getBoundingClientRect();
            return Math.abs(bCX - (or.left - cr.left + or.width / 2)) < 60 &&
                Math.abs(bTop - (or.bottom - cr.top)) < SNAP_DISTANCE + 10 &&
                (or.bottom - cr.top) < bTop;
        });
    });
}

function executeSingleBlock(block, scope) {
    const type = block.dataset.type;
    try {
        if (type === 'declare') {
            // ★ НОВОЕ: var x, y, z — объявляем переменные через запятую
            const names = block.querySelector('.input-declare').value.split(',');
            for (const n of names) {
                const name = n.trim();
                if (!name) continue;
                if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) throw new Error('Неверное имя переменной: ' + name);
                if (scope[name] === undefined) scope[name] = 0;
            }
        }
        else if (type === 'assign') {
            const name = block.querySelector('.input-target').value.trim();
            const expr = block.querySelector('.input-value').value.trim();
            if (!name) throw new Error('Не указано имя переменной');
            if (scope[name] === undefined) scope[name] = 0;
            scope[name] = evalExpression(expr, scope);
        }
        else if (type === 'print') {
            logToConsole(String(evalExpression(block.querySelector('.input-msg').value.trim(), scope)));
        }
        // ★ ОБНОВЛЕНО: loop использует evaluateConditionExpr (AND/OR/NOT)
        else if (type === 'loop') {
            const condStr = block.querySelector('.input-condition').value.trim();
            const bodyBlocks = Array.from(block.querySelector('.loop-body').querySelectorAll(':scope > .workspace-block'));
            const MAX_ITER = 10000;
            let iterations = 0;
            while (evaluateConditionExpr(condStr, scope)) {
                if (iterations++ > MAX_ITER) throw new Error('Превышен лимит итераций (' + MAX_ITER + '). Бесконечный цикл?');
                executeBlockList(bodyBlocks, scope, true);
            }
        }
        // ★ ОБНОВЛЕНО: if использует evaluateConditionExpr (AND/OR/NOT)
        else if (type === 'if') {
            const condStr = block.querySelector('.input-condition').value.trim();
            const ifBlocks   = Array.from(block.querySelector('.if-body').querySelectorAll(':scope > .workspace-block'));
            const elseEl     = block.querySelector('.else-body');
            const elseBlocks = elseEl ? Array.from(elseEl.querySelectorAll(':scope > .workspace-block')) : [];
            if (evaluateConditionExpr(condStr, scope)) executeBlockList(ifBlocks, scope, true);
            else if (elseBlocks.length > 0)            executeBlockList(elseBlocks, scope, true);
        }
        else if (type === 'arraycreate') {
            const name = block.querySelector('.input-arr-name').value.trim();
            const size = Math.floor(evalExpression(block.querySelector('.input-arr-size').value.trim(), scope));
            if (!name) throw new Error('Не указано имя массива');
            if (size <= 0 || size > 100000) throw new Error('Некорректный размер: ' + size);
            if (!scope.arrays) scope.arrays = {};
            scope.arrays[name] = new Array(size).fill(0);
            logToConsole('✅ ' + name + ' = new Array[' + size + ']');
        }
        else if (type === 'arrayset') {
            const name = block.querySelector('.input-arr-name').value.trim();
            const idx  = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));
            const val  = evalExpression(block.querySelector('.input-arr-value').value.trim(), scope);
            if (!scope.arrays || scope.arrays[name] === undefined) throw new Error('Массив не найден: ' + name);
            if (idx < 0 || idx >= scope.arrays[name].length) throw new Error('Индекс вне диапазона: ' + name + '[' + idx + ']');
            scope.arrays[name][idx] = val;
        }
        else if (type === 'arrayget') {
            const target = block.querySelector('.input-target').value.trim();
            const name   = block.querySelector('.input-arr-name').value.trim();
            const idx    = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));
            if (!target) throw new Error('Не указана переменная-цель');
            if (!scope.arrays || scope.arrays[name] === undefined) throw new Error('Массив не найден: ' + name);
            if (idx < 0 || idx >= scope.arrays[name].length) throw new Error('Индекс вне диапазона');
            scope[target] = scope.arrays[name][idx];
        }
        else if (type === 'arrayprint') {
            const name = block.querySelector('.input-arr-name').value.trim();
            if (!scope.arrays || scope.arrays[name] === undefined) throw new Error('Массив не найден: ' + name);
            logToConsole(name + ' = [' + scope.arrays[name].join(', ') + ']');
        }
        else if (type === 'bubblesort') {
            const name = block.querySelector('.input-arr-name').value.trim();
            if (!scope.arrays || scope.arrays[name] === undefined) throw new Error('Массив не найден: ' + name);
            const arr = scope.arrays[name], n = arr.length;
            for (let i = 0; i < n - 1; i++)
                for (let j = 0; j < n - i - 1; j++)
                    if (arr[j] > arr[j+1]) { const t = arr[j]; arr[j] = arr[j+1]; arr[j+1] = t; }
            logToConsole('✅ ' + name + ' отсортирован: [' + arr.join(', ') + ']');
        }
    } catch(e) { e.errorBlock = block; throw e; }
}

function findErrorBlock(e) {
    let cur = e;
    while (cur) { if (cur.errorBlock !== undefined) return cur.errorBlock; cur = cur.cause || null; }
    return null;
}
function executeChain(startBlock, allBlocks, scope) {
    let cur = startBlock;
    while (cur) { executeSingleBlock(cur, scope); cur = findNextBlockInChain(cur, allBlocks); }
}
// ★ ИСПРАВЛЕНО: if (isIsolated) вместо if (!isIsolated) — переменные внутри цикла/if работают
function executeBlockList(blocks, vars, isIsolated = false) {
    const scope = isIsolated ? { ...vars, arrays: vars.arrays } : vars;
    const topBlocks = findTopBlocks(blocks);
    for (const startBlock of topBlocks) executeChain(startBlock, blocks, scope);
    if (isIsolated) Object.assign(vars, scope); // записываем изменения обратно
}

function clearErrorHighlight() { canvas.querySelectorAll('.workspace-block.block-error').forEach(b => b.classList.remove('block-error')); }
function highlightBlockError(block) { clearErrorHighlight(); block.classList.add('block-error'); }

runBtn.addEventListener('click', () => {
    clearConsole(); clearErrorHighlight(); logToConsole('▶ Запуск…');
    const vars = { arrays: {} };
    try {
        const blocks = Array.from(canvas.querySelectorAll(':scope > .workspace-block'));
        executeBlockList(blocks, vars);
        logToConsole('─────────────────');
        const scalars = Object.fromEntries(Object.entries(vars).filter(([k]) => k !== 'arrays'));
        logToConsole('✅ Готово. ' + JSON.stringify(scalars));
    } catch(e) {
        logToConsole('❌ ' + e.message, true);
        const eb = findErrorBlock(e); if (eb) highlightBlockError(eb);
    }
});
