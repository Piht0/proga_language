let _arrays = {};
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') body.classList.add('dark-theme');

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

function updatePanelHighlight(e) {
    if (!draggedEl) return;
    const r = blocksPanel.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    blocksPanel.style.boxShadow  = inside ? '0 0 0 3px rgba(239,68,68,0.7)' : '';
    blocksPanel.style.borderColor = inside ? 'rgba(239,68,68,0.9)' : '';
}
function clearPanelHighlight() {
    blocksPanel.style.boxShadow  = '';
    blocksPanel.style.borderColor = '';
}

function clearSelection() {
    selectedBlocks.forEach(b => b.classList.remove('selected'));
    selectedBlocks = [];
}

function selectBlocksInRect(rect) {
    clearSelection();
    Array.from(canvas.querySelectorAll('.workspace-block')).forEach(block => {
        const br = block.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        const bl = br.left - cr.left, bt = br.top - cr.top;
        const bb = bt + block.offsetHeight, brr = bl + block.offsetWidth;
        if (!(brr < rect.left || bl > rect.right || bb < rect.top || bt > rect.bottom)) {
            block.classList.add('selected');
            selectedBlocks.push(block);
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
                    :                                        'else-body-hint';
            hint.textContent = 'Перетащи блоки сюда';
            body.appendChild(hint);
        }
    });
}

// ФИХ №1: ищем наименьший (самый глубокий) контейнер под курсором
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
        block.classList.add('block-print');
        block.dataset.type = 'print';
        block.innerHTML = `
          <div class="block-header">
            <span>вывести</span>
            <input type="text" placeholder="значение" class="input-msg" style="width:100px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'assign') {
        block.classList.add('block-assign');
        block.dataset.type = 'assign';
        block.innerHTML = `
          <div class="block-header">
            <input type="text" placeholder="x" class="input-target" style="width:50px">
            <span>:=</span>
            <input type="text" placeholder="5" class="input-value" style="width:80px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'if') {
        block.classList.add('block-if');
        block.dataset.type = 'if';
        // ФИХ №4: одно поле условия поддерживает AND / OR / NOT
        block.innerHTML = `
          <div class="block-header">
            <span>если</span>
            <input type="text" placeholder="x &gt; 0 AND y &lt; 5" class="input-condition" style="width:170px">
            <span>то</span>
          </div>
          <div class="if-body"><div class="if-body-hint">Перетащи блоки сюда</div></div>
          <div class="else-label">иначе</div>
          <div class="else-body"><div class="else-body-hint">Перетащи блоки сюда</div></div>
          <div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'loop') {
        block.classList.add('block-loop');
        block.dataset.type = 'loop';
        // ФИХ №4: одно поле условия поддерживает AND / OR / NOT
        block.innerHTML = `
          <div class="block-header">
            <span>пока</span>
            <input type="text" placeholder="i &lt; 10 AND j &gt; 0" class="input-condition" style="width:160px">
          </div>
          <div class="loop-body"><div class="loop-body-hint">Перетащи блоки сюда</div></div>
          <div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'array_create') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_create';
        block.innerHTML = `
          <div class="block-header">
            <span>массив</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width:35px">
            <span>размер</span>
            <input type="text" placeholder="5" class="input-arr-size" style="width:35px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'array_set') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_set';
        block.innerHTML = `
          <div class="block-header">
            <input type="text" placeholder="a" class="input-arr-name" style="width:30px">
            <span>[</span>
            <input type="text" placeholder="i" class="input-arr-index" style="width:30px">
            <span>]:=</span>
            <input type="text" placeholder="0" class="input-arr-value" style="width:65px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'array_get') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_get';
        block.innerHTML = `
          <div class="block-header">
            <input type="text" placeholder="x" class="input-target" style="width:35px">
            <span>:=</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width:30px">
            <span>[</span>
            <input type="text" placeholder="i" class="input-arr-index" style="width:30px">
            <span>]</span>
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'array_print') {
        block.classList.add('block-print');
        block.dataset.type = 'array_print';
        block.innerHTML = `
          <div class="block-header">
            <span>вывести массив</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width:35px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else if (type === 'bubble_sort') {
        block.classList.add('block-logic');
        block.dataset.type = 'bubble_sort';
        block.innerHTML = `
          <div class="block-header">
            <span>сортировка пузырьком</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width:35px">
          </div><div class="connector"></div><div class="notch"></div>`;

    } else {
        block.textContent = type;
        block.innerHTML += `<div class="connector"></div><div class="notch"></div>`;
    }
    return block;
}

function findSnapTarget(block) {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block')).filter(b => b !== block);
    if (!blocks.length) return null;
    const cr = canvas.getBoundingClientRect();
    const r = block.getBoundingClientRect();
    const blockTop = r.top - cr.top, blockBottom = r.bottom - cr.top;
    const blockCX = r.left - cr.left;
    let best = null, bestDist = Infinity;
    for (const other of blocks) {
        const or = other.getBoundingClientRect();
        const oTop = or.top - cr.top, oBottom = or.bottom - cr.top, oCX = or.left - cr.left;
        if (Math.abs(blockCX - oCX) >= 60) continue;
        const db = Math.abs(blockTop - oBottom), da = Math.abs(blockBottom - oTop);
        if (db < bestDist && db < SNAP_DISTANCE) { bestDist = db; best = { other, position: 'below' }; }
        if (da < bestDist && da < SNAP_DISTANCE) { bestDist = da; best = { other, position: 'above' }; }
    }
    return best;
}

// ============================================
// СОБЫТИЯ МЫШИ
// ============================================
document.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const paletteBlock = e.target.closest('.block[data-block-type]');
    const wsBlock = e.target.closest('.workspace-block');

    if (!paletteBlock && !wsBlock && e.target.closest('.workspace-canvas')) {
        e.preventDefault();
        const cr = canvas.getBoundingClientRect();
        isSelecting = true;
        selectionStartX = e.clientX - cr.left;
        selectionStartY = e.clientY - cr.top;
        selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        Object.assign(selectionBox.style, { left: selectionStartX+'px', top: selectionStartY+'px', width:'0', height:'0' });
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
        block.style.left = (e.clientX - cr.left - block.offsetWidth / 2) + 'px';
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
            canvas.appendChild(wsBlock);
            updateLoopBodyHints();
        }
        draggedEl = wsBlock;
        if (e.ctrlKey || e.metaKey) {
            if (wsBlock.classList.contains('selected')) {
                wsBlock.classList.remove('selected');
                selectedBlocks = selectedBlocks.filter(b => b !== wsBlock);
            } else {
                wsBlock.classList.add('selected');
                selectedBlocks.push(wsBlock);
            }
            draggedEl = null; return;
        }
        if (!wsBlock.classList.contains('selected')) clearSelection();
        if (selectedBlocks.length > 0 && wsBlock.classList.contains('selected')) {
            isDraggingGroup = true;
            const bounds = getSelectedBlocksBounds();
            if (bounds) {
                groupDragOffsetX = e.clientX - cr.left - bounds.minX;
                groupDragOffsetY = e.clientY - cr.top  - bounds.minY;
            }
        }
    }
    const rect = draggedEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    draggedEl.style.zIndex = 1000;
});

document.addEventListener('mousemove', (e) => {
    if (isSelecting && selectionBox) {
        const cr = canvas.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        const left = Math.min(selectionStartX, cx), top = Math.min(selectionStartY, cy);
        Object.assign(selectionBox.style, {
            left: left+'px', top: top+'px',
            width: Math.abs(cx - selectionStartX)+'px', height: Math.abs(cy - selectionStartY)+'px'
        });
        return;
    }
    if (!draggedEl) return;
    const cr = canvas.getBoundingClientRect();

    if (isDraggingGroup && selectedBlocks.length) {
        const gx = e.clientX - cr.left - groupDragOffsetX;
        const gy = e.clientY - cr.top  - groupDragOffsetY;
        const bounds = getSelectedBlocksBounds();
        if (bounds) {
            const dx = gx - bounds.minX, dy = gy - bounds.minY;
            for (const b of selectedBlocks) {
                b.style.left = Math.max(0, Math.min(parseFloat(b.style.left)||0 + dx, cr.width  - b.offsetWidth)) + 'px';
                b.style.top  = Math.max(0, Math.min(parseFloat(b.style.top) ||0 + dy, cr.height - b.offsetHeight)) + 'px';
            }
        }
    } else {
        let x = e.clientX - cr.left - dragOffsetX, y = e.clientY - cr.top - dragOffsetY;
        draggedEl.style.left = Math.max(0, Math.min(x, cr.width  - draggedEl.offsetWidth))  + 'px';
        draggedEl.style.top  = Math.max(0, Math.min(y, cr.height - draggedEl.offsetHeight)) + 'px';
    }

    updatePanelHighlight(e);
    const deepest = findDeepestDropTarget(e.clientX, e.clientY, draggedEl);
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.toggle('drop-target', b === deepest));
    const dr = deleteArea.getBoundingClientRect();
    deleteArea.classList.toggle('active',
        e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom);
});

document.addEventListener('mouseup', (e) => {
    if (isSelecting && selectionBox) {
        const cr = canvas.getBoundingClientRect();
        const cx = e.clientX - cr.left, cy = e.clientY - cr.top;
        const left = Math.min(selectionStartX, cx), top = Math.min(selectionStartY, cy);
        const w = Math.abs(cx - selectionStartX), h = Math.abs(cy - selectionStartY);
        if (w > 5 && h > 5) selectBlocksInRect({ left, top, right: left + w, bottom: top + h });
        selectionBox.remove(); selectionBox = null; isSelecting = false; return;
    }
    if (!draggedEl) return;

    function snapAndFinish() {
        const snap = findSnapTarget(draggedEl);
        if (snap) {
            const cr = canvas.getBoundingClientRect();
            const or = snap.other.getBoundingClientRect();
            draggedEl.style.left = (or.left - cr.left + STACK_X_OFFSET) + 'px';
            draggedEl.style.top  = (snap.position === 'below'
                ? or.bottom - cr.top + 4
                : or.top    - cr.top - draggedEl.offsetHeight - 4) + 'px';
        }
        draggedEl.style.zIndex = '';
        draggedEl = null;
        isDraggingGroup = false;
        updatePlaceholderVisibility();
    }

    if (isDraggingGroup) {
        const pr = blocksPanel.getBoundingClientRect();
        const dr = deleteArea.getBoundingClientRect();
        const inPanel  = e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom;
        const inDelete = e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom;
        if (inPanel || inDelete) {
            selectedBlocks.forEach(b => b.remove()); clearSelection(); clearPanelHighlight();
            deleteArea.classList.remove('active'); draggedEl = null; isDraggingGroup = false;
            updatePlaceholderVisibility(); return;
        }
        clearPanelHighlight(); deleteArea.classList.remove('active');
        const snap = findSnapTarget(draggedEl);
        if (snap) {
            const cr = canvas.getBoundingClientRect(), or = snap.other.getBoundingClientRect();
            const newX = or.left - cr.left + STACK_X_OFFSET;
            const newY = snap.position === 'below' ? or.bottom - cr.top + 4 : or.top - cr.top - draggedEl.offsetHeight - 4;
            const dx = newX - (parseFloat(draggedEl.style.left)||0);
            const dy = newY - (parseFloat(draggedEl.style.top) ||0);
            for (const b of selectedBlocks) {
                b.style.left = ((parseFloat(b.style.left)||0) + dx) + 'px';
                b.style.top  = ((parseFloat(b.style.top) ||0) + dy) + 'px';
            }
        }
        draggedEl.style.zIndex = ''; draggedEl = null; isDraggingGroup = false;
        updatePlaceholderVisibility(); return;
    }

    // ФИХ №1: самый глубокий контейнер
    const nestTarget = findDeepestDropTarget(e.clientX, e.clientY, draggedEl);
    if (nestTarget) {
        Object.assign(draggedEl.style, { position:'', left:'', top:'', zIndex:'', width:'' });
        nestTarget.appendChild(draggedEl);
        canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));
        clearPanelHighlight(); deleteArea.classList.remove('active');
        draggedEl = null; updatePlaceholderVisibility(); updateLoopBodyHints(); return;
    }
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));

    const pr = blocksPanel.getBoundingClientRect();
    const dr = deleteArea.getBoundingClientRect();
    const inPanel  = e.clientX >= pr.left && e.clientX <= pr.right && e.clientY >= pr.top && e.clientY <= pr.bottom;
    const inDelete = e.clientX >= dr.left && e.clientX <= dr.right && e.clientY >= dr.top && e.clientY <= dr.bottom;
    if (inPanel || inDelete) {
        draggedEl.remove(); clearPanelHighlight(); deleteArea.classList.remove('active');
        draggedEl = null; updatePlaceholderVisibility(); return;
    }
    clearPanelHighlight(); deleteArea.classList.remove('active');
    snapAndFinish();
});

resetBtn.addEventListener('click', () => {
    canvas.querySelectorAll('.workspace-block').forEach(b => b.remove());
    updatePlaceholderVisibility();
});
document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.block') || e.target.closest('.workspace-block')) e.preventDefault();
});
updatePlaceholderVisibility();

// ============================================
// ИНТЕРПРЕТАТОР
// ============================================
const consolePane = document.createElement('div');
Object.assign(consolePane.style, {
    position:'fixed', left:'12px', bottom:'12px', width:'320px', maxHeight:'180px',
    overflowY:'auto', background:'var(--bg-panel)', border:'1px solid var(--border-subtle)',
    borderRadius:'10px', fontFamily:'ui-monospace,Menlo,Monaco,Consolas,"Courier New",monospace',
    fontSize:'11px', padding:'8px', boxShadow:'0 18px 40px rgba(0,0,0,0.4)',
    color:'var(--text-main)', pointerEvents:'auto', zIndex:'9999'
});
consolePane.textContent = 'Консоль: выполните программу.';
document.body.appendChild(consolePane);

function logToConsole(msg, isError = false) {
    const line = document.createElement('div');
    line.textContent = msg;
    line.style.marginBottom = '2px';
    line.style.color = isError ? 'var(--error)' : 'var(--text-muted)';
    if (isError) line.style.fontWeight = '600';
    consolePane.appendChild(line);
    consolePane.scrollTop = consolePane.scrollHeight;
}
function clearConsole() { consolePane.textContent = ''; }

// ============================================
// ПАРСЕР АРИФМЕТИЧЕСКИХ ВЫРАЖЕНИЙ
// ============================================
function calculate(expression, vars) {
    expression = expression.replace(/\s/g, '');
    expression = substituteVariables(expression, vars);
    expression = parseeval(expression);
    expression = parsemuldiv(expression);
    expression = parseadd(expression);
    const result = parseFloat(expression);
    if (isNaN(result)) throw new Error(`Переменная не существует: '${expression}'`);
    return result;
}

function substituteVariables(expr, vars) {
    expr = expr.replace(/([a-zA-Z_]\w*)\[([^\]]+)\]/g, (match, name, idxExpr) => {
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        const idx = Math.floor(evalExpression(idxExpr, vars));
        if (idx < 0 || idx >= _arrays[name].length) throw new Error(`Выход за пределы: ${name}[${idx}]`);
        return _arrays[name][idx];
    });
    const varNames = Object.keys(vars).sort((a, b) => b.length - a.length);
    for (const name of varNames) {
        const regex = new RegExp('(?<![a-zA-Z0-9_])' + name + '(?![a-zA-Z0-9_])', 'g');
        expr = expr.replace(regex, vars[name]);
    }
    return expr;
}

function parseeval(line) {
    var k = 1;
    do {
        var openskoba = line.lastIndexOf("(");
        if (openskoba < 0) { k = 0; }
        else {
            var closeskoba = line.indexOf(")", openskoba);
            var inside = line.slice(openskoba + 1, closeskoba);
            line = line.substr(0, openskoba) + parseadd(parsemuldiv(inside)).toString() + line.substr(closeskoba + 1);
        }
    } while (k == 1);
    return line;
}

// ФИХ №3: добавлен оператор % и целочисленное деление
function parsemuldiv(line) {
    var k = 1;
    do {
        const positions = [line.indexOf("*"), line.indexOf("/"), line.indexOf("%")].filter(i => i !== -1);
        const firstOp = positions.length === 0 ? -1 : Math.min(...positions);
        if (firstOp === -1) { k = 0; continue; }

        const operator = line.charAt(firstOp);
        var z = firstOp, beforez;
        do {
            beforez = z - 1;
            if (beforez < 0 || "*/%+-".includes(line.charAt(beforez))) z = -2;
            z--;
        } while (z > -2);

        const op1 = beforez < 0 ? line.slice(0, firstOp) : line.slice(beforez + 1, firstOp);
        z = firstOp;
        var afterz;
        do {
            afterz = z + 1;
            if (afterz >= line.length || "*/%+-".includes(line.charAt(afterz))) z = line.length + 1;
            z++;
        } while (z < line.length + 1);

        const op2 = afterz >= line.length ? line.slice(firstOp + 1) : line.slice(firstOp + 1, afterz);
        let res;
        if (operator === '*') res = parseFloat(op1) * parseFloat(op2);
        else if (operator === '/') {
            if (parseFloat(op2) === 0) throw new Error("Деление на ноль");
            res = Math.trunc(parseFloat(op1) / parseFloat(op2)); // целочисленное
        } else {
            if (parseFloat(op2) === 0) throw new Error("Остаток от деления на ноль");
            res = parseFloat(op1) % parseFloat(op2);
        }
        line = (beforez < 0 ? '' : line.substr(0, beforez + 1)) + res.toString() + line.substr(afterz);
    } while (k == 1);
    return line;
}

function parseadd(line) {
    do {
        var before = 1;
        if (line.charAt(0) === "-") { before = -1; line = line.slice(1); }
        var kx = line.indexOf("+"), ky = line.indexOf("-");
        if (kx === -1 && ky === -1) { line = (before * parseFloat(line)).toString(); break; }
        var lastz, attr;
        if ((kx > 0 && kx < ky) || (kx > 0 && ky === -1)) { lastz = kx; attr = 1; }
        if ((ky > 0 && ky < kx) || (ky > 0 && kx === -1)) { lastz = ky; attr = -1; }
        var op1 = before * parseFloat(line.slice(0, lastz));
        var arg = lastz + 1;
        while (arg < line.length && line.charAt(arg) !== "+" && line.charAt(arg) !== "-") arg++;
        var op2 = attr * parseFloat(line.slice(lastz + 1, arg));
        line = (op1 + op2).toString() + line.slice(arg);
    } while (true);
    return line;
}

function evalExpression(expr, vars) {
    if (!expr || expr.trim() === '') return 0;
    return calculate(expr, vars);
}

// ============================================
// ФИХ №4: ПАРСЕР ЛОГИЧЕСКИХ ВЫРАЖЕНИЙ (AND / OR / NOT + скобки)
// ============================================

// Находит позицию первого вхождения ключевого слова op ('AND'/'OR') на верхнем уровне
// (не внутри скобок). Требует слово-граничности с обеих сторон.
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

// Находит оператор сравнения (>=, <=, ==, !=, >, <) на верхнем уровне
function findComparisonOp(str) {
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') { depth++; continue; }
        if (str[i] === ')') { depth--; continue; }
        if (depth !== 0) continue;
        for (const op of ['>=', '<=', '==', '!=', '>', '<']) {
            if (str.substring(i, i + op.length) === op) return { op, pos: i };
        }
    }
    return null;
}

// Проверяет, обёрнута ли строка во внешние совпадающие скобки
function hasOuterParens(str) {
    if (str[0] !== '(' || str[str.length - 1] !== ')') return false;
    let depth = 0;
    for (let i = 0; i < str.length; i++) {
        if (str[i] === '(') depth++;
        else if (str[i] === ')') { depth--; if (depth === 0 && i < str.length - 1) return false; }
    }
    return depth === 0;
}

// Главная функция оценки логического условия с AND/OR/NOT/скобками
function evaluateConditionExpr(raw, vars) {
    const str = raw.trim();
    if (!str) throw new Error('Пустое условие');

    // OR (наименьший приоритет)
    const orPos = findTopLevelKeyword(str, 'OR');
    if (orPos !== -1) {
        return evaluateConditionExpr(str.slice(0, orPos), vars) ||
            evaluateConditionExpr(str.slice(orPos + 2), vars);
    }

    // AND
    const andPos = findTopLevelKeyword(str, 'AND');
    if (andPos !== -1) {
        return evaluateConditionExpr(str.slice(0, andPos), vars) &&
            evaluateConditionExpr(str.slice(andPos + 3), vars);
    }

    // NOT
    if (str.toUpperCase().startsWith('NOT')) {
        const after = str.slice(3).trim();
        if (after) return !evaluateConditionExpr(after, vars);
    }

    // Снимаем внешние скобки
    if (hasOuterParens(str)) return evaluateConditionExpr(str.slice(1, -1), vars);

    // Атомарное сравнение: left op right
    const cmp = findComparisonOp(str);
    if (!cmp) throw new Error(`Неверное условие: '${str}'`);
    const left  = evalExpression(str.slice(0, cmp.pos).trim(), vars);
    const right = evalExpression(str.slice(cmp.pos + cmp.op.length).trim(), vars);
    switch (cmp.op) {
        case '<':  return left < right;
        case '>':  return left > right;
        case '==': return left == right;
        case '!=': return left != right;
        case '>=': return left >= right;
        case '<=': return left <= right;
    }
    return false;
}

// ============================================
// СТЕКОВЫЙ ИНТЕРПРЕТАТОР
// ============================================
function findNextBlockInChain(currentBlock, allBlocks) {
    const cr = canvas.getBoundingClientRect();
    const cur = currentBlock.getBoundingClientRect();
    const curBottom = cur.bottom - cr.top;
    const curCX = cur.left - cr.left + cur.width / 2;
    let next = null, minDist = Infinity;
    for (const b of allBlocks) {
        if (b === currentBlock) continue;
        const r = b.getBoundingClientRect();
        const bTop = r.top - cr.top, bCX = r.left - cr.left + r.width / 2;
        const dist = bTop - curBottom;
        if (Math.abs(bCX - curCX) < 60 && dist > 0 && dist < SNAP_DISTANCE + 10 && dist < minDist) {
            minDist = dist; next = b;
        }
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
            const oBottom = or.bottom - cr.top, oCX = or.left - cr.left + or.width / 2;
            return Math.abs(bCX - oCX) < 60 &&
                Math.abs(bTop - oBottom) < SNAP_DISTANCE + 10 &&
                oBottom < bTop;
        });
    });
}

function pushChain(stack, startBlock, allBlocks) {
    const chain = [];
    let cur = startBlock;
    while (cur) { chain.push(cur); cur = findNextBlockInChain(cur, allBlocks); }
    for (let i = chain.length - 1; i >= 0; i--) stack.push({ type: 'block', block: chain[i] });
}

function runProgram() {
    clearConsole();
    _arrays = {};
    const allTopBlocks = Array.from(canvas.querySelectorAll(':scope > .workspace-block'));
    if (!allTopBlocks.length) { logToConsole('Нет блоков для выполнения.', true); return; }

    const startBlocks = findTopBlocks(allTopBlocks);
    startBlocks.sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top));

    const scope = {}, stack = [];
    for (let i = startBlocks.length - 1; i >= 0; i--) pushChain(stack, startBlocks[i], allTopBlocks);

    const MAX_TOTAL = 50000;
    let steps = 0;
    try {
        while (stack.length) {
            if (steps++ > MAX_TOTAL) throw new Error('Превышен лимит шагов — бесконечный цикл?');
            const frame = stack.pop();

            if (frame.type === 'block') {
                executeSingleBlock(frame.block, scope, stack);
            } else if (frame.type === 'loop_check') {
                const { block, iterations } = frame;
                const condStr = block.querySelector('.input-condition').value.trim();
                if (evaluateConditionExpr(condStr, scope)) {
                    // ФИХ №2: лимит 10000 итераций вместо 1000
                    if (iterations >= 10000) throw new Error('Превышен лимит 10000 итераций — бесконечный цикл?');
                    stack.push({ type: 'loop_check', block, iterations: iterations + 1 });
                    const bodyBlocks = Array.from(
                        block.querySelector('.loop-body').querySelectorAll(':scope > .workspace-block')
                    );
                    for (let i = bodyBlocks.length - 1; i >= 0; i--) stack.push({ type: 'block', block: bodyBlocks[i] });
                }
            }
        }
        logToConsole('✓ Выполнено. Переменные: ' + JSON.stringify(scope));
    } catch (err) {
        logToConsole('Ошибка: ' + err.message, true);
    }
}

function executeSingleBlock(block, scope, stack) {
    const type = block.dataset.type;

    if (type === 'assign') {
        const name = block.querySelector('.input-target').value.trim();
        const expr = block.querySelector('.input-value').value.trim();
        if (!name) throw new Error('Пустое имя переменной');
        if (scope[name] === undefined) scope[name] = 0;
        scope[name] = evalExpression(expr, scope);

    } else if (type === 'print') {
        logToConsole(String(evalExpression(block.querySelector('.input-msg').value.trim(), scope)));

    } else if (type === 'loop') {
        stack.push({ type: 'loop_check', block, iterations: 0 });

    } else if (type === 'if') {
        const condStr = block.querySelector('.input-condition').value.trim();
        const ifBlocks   = Array.from(block.querySelector('.if-body').querySelectorAll(':scope > .workspace-block'));
        const elseEl     = block.querySelector('.else-body');
        const elseBlocks = elseEl ? Array.from(elseEl.querySelectorAll(':scope > .workspace-block')) : [];
        const run = evaluateConditionExpr(condStr, scope) ? ifBlocks : elseBlocks;
        for (let i = run.length - 1; i >= 0; i--) stack.push({ type: 'block', block: run[i] });

    } else if (type === 'array_create') {
        const name = block.querySelector('.input-arr-name').value.trim();
        const size = Math.floor(evalExpression(block.querySelector('.input-arr-size').value.trim(), scope));
        if (!name) throw new Error('Пустое имя массива');
        if (size <= 0 || size > 10000) throw new Error(`Недопустимый размер массива: ${size}`);
        _arrays[name] = new Array(size).fill(0);
        logToConsole(`Массив '${name}' размером ${size} создан`);

    } else if (type === 'array_set') {
        const name = block.querySelector('.input-arr-name').value.trim();
        const idx  = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));
        const val  = evalExpression(block.querySelector('.input-arr-value').value.trim(), scope);
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        if (idx < 0 || idx >= _arrays[name].length) throw new Error(`Выход за пределы: ${name}[${idx}]`);
        _arrays[name][idx] = val;

    } else if (type === 'array_get') {
        const target = block.querySelector('.input-target').value.trim();
        const name   = block.querySelector('.input-arr-name').value.trim();
        const idx    = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        if (idx < 0 || idx >= _arrays[name].length) throw new Error(`Выход за пределы: ${name}[${idx}]`);
        scope[target] = _arrays[name][idx];

    } else if (type === 'array_print') {
        const name = block.querySelector('.input-arr-name').value.trim();
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        logToConsole(`${name} = [${_arrays[name].join(', ')}]`);

    } else if (type === 'bubble_sort') {
        const name = block.querySelector('.input-arr-name').value.trim();
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        const arr = _arrays[name], n = arr.length;
        for (let i = 0; i < n - 1; i++)
            for (let j = 0; j < n - i - 1; j++)
                if (arr[j] > arr[j + 1]) { const t = arr[j]; arr[j] = arr[j+1]; arr[j+1] = t; }
        logToConsole(`'${name}' отсортирован: [${arr.join(', ')}]`);
    }
}

runBtn.addEventListener('click', runProgram);
