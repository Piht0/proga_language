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

// Для выделения группой
let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionBox = null;
let selectedBlocks = [];
let isDraggingGroup = false;
let groupDragOffsetX = 0;
let groupDragOffsetY = 0;

// Подсветка панели блоков при наведении
function updatePanelHighlight(e) {
    if (!draggedEl) return;
    
    const panelRect = blocksPanel.getBoundingClientRect();
    const isInPanel = (
        e.clientX >= panelRect.left &&
        e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top &&
        e.clientY <= panelRect.bottom
    );
    
    if (isInPanel) {
        blocksPanel.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.7)';
        blocksPanel.style.borderColor = 'rgba(239, 68, 68, 0.9)';
    } else {
        blocksPanel.style.boxShadow = '';
        blocksPanel.style.borderColor = '';
    }
}

function clearPanelHighlight() {
    blocksPanel.style.boxShadow = '';
    blocksPanel.style.borderColor = '';
}

// Выделение блоков
function clearSelection() {
    selectedBlocks.forEach(block => block.classList.remove('selected'));
    selectedBlocks = [];
}

function selectBlocksInRect(rect) {
    clearSelection();
    
    const canvasRect = canvas.getBoundingClientRect();
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block'));
    
    for (const block of blocks) {
        const blockRect = block.getBoundingClientRect();
        
        // Проверяем, пересекается ли блок с рамкой выделения
        const blockLeft = blockRect.left - canvasRect.left;
        const blockTop = blockRect.top - canvasRect.top;
        const blockRight = blockLeft + block.offsetWidth;
        const blockBottom = blockTop + block.offsetHeight;
        
        const intersects = !(
            blockRight < rect.left ||
            blockLeft > rect.right ||
            blockBottom < rect.top ||
            blockTop > rect.bottom
        );
        
        if (intersects) {
            block.classList.add('selected');
            selectedBlocks.push(block);
        }
    }
}

function getSelectedBlocksBounds() {
    if (selectedBlocks.length === 0) return null;
    
    const canvasRect = canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const block of selectedBlocks) {
        const x = parseFloat(block.style.left) || 0;
        const y = parseFloat(block.style.top) || 0;
        
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + block.offsetWidth);
        maxY = Math.max(maxY, y + block.offsetHeight);
    }
    
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function updatePlaceholderVisibility() {
    const hasBlocks = canvas.querySelectorAll('.workspace-block').length > 0;
    placeholder.style.display = hasBlocks ? 'none' : 'flex';
}

// Фабрика workspace-блоков
function createWorkspaceBlock(type) {
    const block = document.createElement('div');
    block.classList.add('workspace-block');

    if (type === 'print') {
        block.classList.add('block-print');
        block.dataset.type = 'print';
        block.innerHTML = `
      <div class="block-header">
        <span>вывести</span>
        <input type="text" placeholder="значение" class="input-msg" style="width: 100px;">
      </div>
      <div class="connector"></div>
      <div class="notch"></div>
    `;
    } else if (type === 'assign') {
        block.classList.add('block-assign');
        block.dataset.type = 'assign';
        block.innerHTML = `
      <div class="block-header">
        <input type="text" placeholder="x" class="input-target" style="width: 50px;">
        <span>:=</span>
        <input type="text" placeholder="5" class="input-value" style="width: 80px;">
      </div>
      <div class="connector"></div>
      <div class="notch"></div>
    `;
    } else if (type === 'if') {
        // пока не используем в минимальном варианте, но блок может существовать
        block.classList.add('block-if');
        block.dataset.type = 'if';
        block.innerHTML = `
      <div class="block-header">
        <span>если</span>
        <input type="text" placeholder="x" class="input-cond-left" style="width: 40px;">
        <select class="input-cond-op">
          <option value=">">></option>
          <option value="<"><</option>
          <option value="==">=</option>
          <option value="!=">!=</option>
          <option value=">=">>=</option>
          <option value="<="><=</option>
        </select>
        <input type="text" placeholder="y" class="input-cond-right" style="width: 40px;">
        <span>то</span>
      </div>
      <div class="block-body"></div>
      <div class="connector"></div>
      <div class="notch"></div>
    `;
    } else {
        block.textContent = type;
        block.innerHTML += `<div class="connector"></div><div class="notch"></div>`;
    }

    return block;
}

function findSnapTarget(block) {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block')).filter(b => b !== block);
    if (blocks.length === 0) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const rect = block.getBoundingClientRect();
    const blockTop = rect.top - canvasRect.top;
    const blockBottom = rect.bottom - canvasRect.top;
    const blockCenterX = rect.left - canvasRect.left;

    let best = null;
    let bestDist = Infinity;

    for (const other of blocks) {
        const r = other.getBoundingClientRect();
        const oTop = r.top - canvasRect.top;
        const oBottom = r.bottom - canvasRect.top;
        const oCenterX = r.left - canvasRect.left;

        const distBelow = Math.abs(blockTop - oBottom);
        const distAbove = Math.abs(blockBottom - oTop);
        const xCloseEnough = Math.abs(blockCenterX - oCenterX) < 60;

        if (xCloseEnough) {
            if (distBelow < bestDist && distBelow < SNAP_DISTANCE) {
                bestDist = distBelow;
                best = { other, position: 'below' };
            }
            if (distAbove < bestDist && distAbove < SNAP_DISTANCE) {
                bestDist = distAbove;
                best = { other, position: 'above' };
            }
        }
    }

    return best;
}

// mousedown: старт drag или выделения
document.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const paletteBlock = e.target.closest('.block[data-block-type]');
    const wsBlock = e.target.closest('.workspace-block');

    // Если клик по пустому месту в canvas — начинаем выделение рамкой или снимаем выделение
    if (!paletteBlock && !wsBlock && e.target.closest('.workspace-canvas')) {
        e.preventDefault();
        
        const canvasRect = canvas.getBoundingClientRect();
        isSelecting = true;
        selectionStartX = e.clientX - canvasRect.left;
        selectionStartY = e.clientY - canvasRect.top;
        
        // Создаём рамку выделения
        selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        selectionBox.style.left = selectionStartX + 'px';
        selectionBox.style.top = selectionStartY + 'px';
        selectionBox.style.width = '0';
        selectionBox.style.height = '0';
        canvas.appendChild(selectionBox);
        
        // Снимаем предыдущее выделение, если нет Ctrl
        if (!e.ctrlKey && !e.metaKey) {
            clearSelection();
        }
        return;
    }

    if (!paletteBlock && !wsBlock) {
        // Клик вне canvas — снимаем выделение
        clearSelection();
        return;
    }

    e.preventDefault();

    const canvasRect = canvas.getBoundingClientRect();

    if (paletteBlock) {
        // Снимаем выделение при создании нового блока
        clearSelection();
        
        const type = paletteBlock.dataset.blockType;
        const block = createWorkspaceBlock(type);
        canvas.appendChild(block);

        const x = e.clientX - canvasRect.left - block.offsetWidth / 2;
        const y = e.clientY - canvasRect.top - block.offsetHeight / 2;

        block.style.left = x + 'px';
        block.style.top = y + 'px';

        draggedEl = block;
    } else {
        // Клик по блоку
        draggedEl = wsBlock;
        
        // Если зажат Ctrl — переключаем выделение блока
        if (e.ctrlKey || e.metaKey) {
            if (wsBlock.classList.contains('selected')) {
                wsBlock.classList.remove('selected');
                selectedBlocks = selectedBlocks.filter(b => b !== wsBlock);
            } else {
                wsBlock.classList.add('selected');
                selectedBlocks.push(wsBlock);
            }
            draggedEl = null; // Не тащим при Ctrl+клике
            return;
        }
        
        // Если блок не выделен — снимаем выделение с остальных
        if (!wsBlock.classList.contains('selected')) {
            clearSelection();
        }
        
        // Если есть выделенные блоки — тащим группу
        if (selectedBlocks.length > 0 && wsBlock.classList.contains('selected')) {
            isDraggingGroup = true;
            const bounds = getSelectedBlocksBounds();
            if (bounds) {
                groupDragOffsetX = e.clientX - canvasRect.left - bounds.minX;
                groupDragOffsetY = e.clientY - canvasRect.top - bounds.minY;
            }
        }
    }

    const rect = draggedEl.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    draggedEl.style.zIndex = 1000;
});

// mousemove: перемещение или выделение рамкой
document.addEventListener('mousemove', (e) => {
    // Обработка выделения рамкой
    if (isSelecting && selectionBox) {
        const canvasRect = canvas.getBoundingClientRect();
        const currentX = e.clientX - canvasRect.left;
        const currentY = e.clientY - canvasRect.top;
        
        const left = Math.min(selectionStartX, currentX);
        const top = Math.min(selectionStartY, currentY);
        const width = Math.abs(currentX - selectionStartX);
        const height = Math.abs(currentY - selectionStartY);
        
        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
        return;
    }
    
    if (!draggedEl) return;

    const canvasRect = canvas.getBoundingClientRect();

    // Если тащим группу
    if (isDraggingGroup && selectedBlocks.length > 0) {
        const groupX = e.clientX - canvasRect.left - groupDragOffsetX;
        const groupY = e.clientY - canvasRect.top - groupDragOffsetY;
        
        const bounds = getSelectedBlocksBounds();
        if (bounds) {
            const deltaX = groupX - bounds.minX;
            const deltaY = groupY - bounds.minY;
            
            for (const block of selectedBlocks) {
                let x = parseFloat(block.style.left) || 0;
                let y = parseFloat(block.style.top) || 0;
                
                x += deltaX;
                y += deltaY;
                
                x = Math.max(0, Math.min(x, canvasRect.width - block.offsetWidth));
                y = Math.max(0, Math.min(y, canvasRect.height - block.offsetHeight));
                
                block.style.left = x + 'px';
                block.style.top = y + 'px';
            }
        }
        
        // Подсветка панели блоков
        updatePanelHighlight(e);

        const deleteRect = deleteArea.getBoundingClientRect();
        if (
            e.clientX >= deleteRect.left &&
            e.clientX <= deleteRect.right &&
            e.clientY >= deleteRect.top &&
            e.clientY <= deleteRect.bottom
        ) {
            deleteArea.classList.add('active');
        } else {
            deleteArea.classList.remove('active');
        }
        return;
    }

    // Одиночное перетаскивание
    let x = e.clientX - canvasRect.left - dragOffsetX;
    let y = e.clientY - canvasRect.top - dragOffsetY;

    x = Math.max(0, Math.min(x, canvasRect.width - draggedEl.offsetWidth));
    y = Math.max(0, Math.min(y, canvasRect.height - draggedEl.offsetHeight));

    draggedEl.style.left = x + 'px';
    draggedEl.style.top = y + 'px';

    // Подсветка панели блоков
    updatePanelHighlight(e);

    const deleteRect = deleteArea.getBoundingClientRect();
    if (
        e.clientX >= deleteRect.left &&
        e.clientX <= deleteRect.right &&
        e.clientY >= deleteRect.top &&
        e.clientY <= deleteRect.bottom
    ) {
        deleteArea.classList.add('active');
    } else {
        deleteArea.classList.remove('active');
    }
});

// mouseup: завершение drag, выделения или перемещения группы
document.addEventListener('mouseup', (e) => {
    // Завершение выделения рамкой
    if (isSelecting && selectionBox) {
        const canvasRect = canvas.getBoundingClientRect();
        const currentX = e.clientX - canvasRect.left;
        const currentY = e.clientY - canvasRect.top;
        
        const left = Math.min(selectionStartX, currentX);
        const top = Math.min(selectionStartY, currentY);
        const width = Math.abs(currentX - selectionStartX);
        const height = Math.abs(currentY - selectionStartY);
        
        // Выделяем блоки в прямоугольнике
        if (width > 5 && height > 5) { // Минимальный размер, чтобы не выделять случайно
            selectBlocksInRect({ left, top, right: left + width, bottom: top + height });
        }
        
        // Удаляем рамку
        selectionBox.remove();
        selectionBox = null;
        isSelecting = false;
        return;
    }
    
    if (!draggedEl) return;

    // Завершение перемещения группы
    if (isDraggingGroup) {
        // Проверяем, отпущен ли блок над панелью блоков
        const panelRect = blocksPanel.getBoundingClientRect();
        const isInPanel = (
            e.clientX >= panelRect.left &&
            e.clientX <= panelRect.right &&
            e.clientY >= panelRect.top &&
            e.clientY <= panelRect.bottom
        );

        if (isInPanel) {
            // Удаляем все выделенные блоки
            selectedBlocks.forEach(block => block.remove());
            clearSelection();
            clearPanelHighlight();
            draggedEl = null;
            isDraggingGroup = false;
            updatePlaceholderVisibility();
            return;
        }

        const deleteRect = deleteArea.getBoundingClientRect();
        const inDelete =
            e.clientX >= deleteRect.left &&
            e.clientX <= deleteRect.right &&
            e.clientY >= deleteRect.top &&
            e.clientY <= deleteRect.bottom;

        if (inDelete) {
            // Удаляем все выделенные блоки
            selectedBlocks.forEach(block => block.remove());
            clearSelection();
            deleteArea.classList.remove('active');
            draggedEl = null;
            isDraggingGroup = false;
            updatePlaceholderVisibility();
            return;
        }

        clearPanelHighlight();
        deleteArea.classList.remove('active');
        
        // Применяем snap к первому блоку группы
        const snap = findSnapTarget(draggedEl);
        if (snap) {
            const canvasRect = canvas.getBoundingClientRect();
            const otherRect = snap.other.getBoundingClientRect();

            let newX = otherRect.left - canvasRect.left + STACK_X_OFFSET;
            let newY;

            if (snap.position === 'below') {
                newY = otherRect.bottom - canvasRect.top + 4;
            } else {
                newY = otherRect.top - canvasRect.top - draggedEl.offsetHeight - 4;
            }

            // Вычисляем смещение для всех блоков
            const origX = parseFloat(draggedEl.style.left) || 0;
            const origY = parseFloat(draggedEl.style.top) || 0;
            const deltaX = newX - origX;
            const deltaY = newY - origY;

            for (const block of selectedBlocks) {
                let x = parseFloat(block.style.left) || 0;
                let y = parseFloat(block.style.top) || 0;
                block.style.left = (x + deltaX) + 'px';
                block.style.top = (y + deltaY) + 'px';
            }
        }

        draggedEl.style.zIndex = '';
        draggedEl = null;
        isDraggingGroup = false;
        updatePlaceholderVisibility();
        return;
    }

    // Одиночное перетаскивание (существующий код)
    // Проверяем, отпущен ли блок над панелью блоков
    const panelRect = blocksPanel.getBoundingClientRect();
    const isInPanel = (
        e.clientX >= panelRect.left &&
        e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top &&
        e.clientY <= panelRect.bottom
    );

    if (isInPanel) {
        draggedEl.remove();
        clearPanelHighlight();
        draggedEl = null;
        updatePlaceholderVisibility();
        return;
    }

    const deleteRect = deleteArea.getBoundingClientRect();
    const inDelete =
        e.clientX >= deleteRect.left &&
        e.clientX <= deleteRect.right &&
        e.clientY >= deleteRect.top &&
        e.clientY <= deleteRect.bottom;

    if (inDelete) {
        draggedEl.remove();
        deleteArea.classList.remove('active');
        draggedEl = null;
        updatePlaceholderVisibility();
        return;
    }

    clearPanelHighlight();
    deleteArea.classList.remove('active');

    const snap = findSnapTarget(draggedEl);
    if (snap) {
        const canvasRect = canvas.getBoundingClientRect();
        const otherRect = snap.other.getBoundingClientRect();

        let newX = otherRect.left - canvasRect.left + STACK_X_OFFSET;
        let newY;

        if (snap.position === 'below') {
            newY = otherRect.bottom - canvasRect.top + 4;
        } else {
            newY = otherRect.top - canvasRect.top - draggedEl.offsetHeight - 4;
        }

        draggedEl.style.left = newX + 'px';
        draggedEl.style.top = newY + 'px';
    }

    draggedEl.style.zIndex = '';
    draggedEl = null;
    updatePlaceholderVisibility();
});

// Сброс workspace
resetBtn.addEventListener('click', () => {
    canvas.querySelectorAll('.workspace-block').forEach((b) => b.remove());
    updatePlaceholderVisibility();
});

// Отключаем нативный drag
document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.block') || e.target.closest('.workspace-block')) {
        e.preventDefault();
    }
});

updatePlaceholderVisibility();


// --- МИНИМАЛЬНЫЙ ИНТЕРПРЕТАТОР ---

const consolePane = document.createElement('div');
consolePane.style.position = 'fixed';
consolePane.style.left = '12px';
consolePane.style.bottom = '12px';
consolePane.style.width = '320px';
consolePane.style.maxHeight = '180px';
consolePane.style.overflowY = 'auto';
consolePane.style.background = 'rgba(15,23,42,0.96)';
consolePane.style.border = '1px solid rgba(31,41,55,1)';
consolePane.style.borderRadius = '10px';
consolePane.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
consolePane.style.fontSize = '11px';
consolePane.style.padding = '8px';
consolePane.style.boxShadow = '0 18px 40px rgba(0,0,0,0.9)';
consolePane.style.color = '#e5e7eb';
consolePane.style.pointerEvents = 'auto';
consolePane.style.zIndex = '9999';
consolePane.textContent = 'Консоль: выполните программу.';
document.body.appendChild(consolePane);

function logToConsole(msg, isError = false) {
    const line = document.createElement('div');
    line.textContent = msg;
    line.style.marginBottom = '2px';
    if (isError) {
        line.style.color = '#f97373';
        line.style.fontWeight = '600';
    } else {
        line.style.color = '#a5b4fc';
    }
    consolePane.appendChild(line);
    consolePane.scrollTop = consolePane.scrollHeight;
}

function clearConsole() {
    consolePane.textContent = '';
}

// Упрощённый парсер выражений: только числа и переменные + операции без приоритета
function evalExpression(expr, vars) {
    if (!expr || expr.trim() === '') return 0;

    // разбиваем на токены по пробелам
    const tokens = expr.trim().split(/\s+/);

    let result = null;
    let currentOp = '+';

    function getValue(token) {
        if (/^-?\d+$/.test(token)) {
            return parseInt(token, 10);
        }
        if (vars[token] === undefined) {
            throw new Error(`Переменная '${token}' не объявлена`);
        }
        return vars[token];
    }

    for (const token of tokens) {
        if (['+', '-', '*', '/', '%'].includes(token)) {
            currentOp = token;
        } else {
            const value = getValue(token);
            if (result === null) {
                result = value;
            } else {
                if (currentOp === '+') result += value;
                else if (currentOp === '-') result -= value;
                else if (currentOp === '*') result *= value;
                else if (currentOp === '/') {
                    if (value === 0) throw new Error('Деление на 0');
                    result = Math.trunc(result / value);
                } else if (currentOp === '%') {
                    if (value === 0) throw new Error('Остаток от деления на 0');
                    result = result % value;
                }
            }
        }
    }

    if (result === null) return 0;
    return result;
}

// Запуск программы
runBtn.addEventListener('click', () => {
    clearConsole();
    logToConsole('Начало выполнения...');

    const vars = {}; // все переменные здесь

    try {
        // Собираем все блоки в workspace, игнорируя их геометрию — выполняем в произвольном порядке появления.
        // На следующем шаге можно сделать сортировку по top для более предсказуемого порядка.
        // Собираем блоки и сортируем по top (визуальный порядок сверху вниз)
        const canvasRect = canvas.getBoundingClientRect();
        const blocks = Array.from(canvas.querySelectorAll('.workspace-block')).sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            const ya = ra.top - canvasRect.top;
            const yb = rb.top - canvasRect.top;
            return ya - yb;
        });

        for (const block of blocks) {

            const type = block.dataset.type;

            if (type === 'assign') {
                const targetInput = block.querySelector('.input-target');
                const valueInput = block.querySelector('.input-value');

                const name = targetInput.value.trim();
                const expr = valueInput.value.trim();

                if (!name) {
                    throw new Error('Пустое имя переменной в блоке присваивания');
                }

                // неявное объявление: если переменной нет, считаем, что она создаётся с 0,
                // но сразу ей присваиваем выражение (как в большинстве языков это не делают,
                // но для минимальной версии так проще)
                if (vars[name] === undefined) {
                    vars[name] = 0;
                }

                const val = evalExpression(expr, vars);
                vars[name] = val;
            }

            if (type === 'print') {
                const msgInput = block.querySelector('.input-msg');
                const expr = msgInput.value.trim();
                const val = evalExpression(expr, vars);
                logToConsole(String(val));
            }
        }

        logToConsole('Выполнение завершено.');
        logToConsole('Состояние переменных: ' + JSON.stringify(vars));
    } catch (e) {
        logToConsole('Ошибка: ' + e.message, true);
    }
});
