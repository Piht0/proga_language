let _arrays = {};
const themeToggleBtn = document.getElementById('theme-toggle');
const body = document.body;

// Проверяем сохранённую тему в localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    body.classList.add('dark-theme');
}

// Обработчик клика по кнопке темы
themeToggleBtn.addEventListener('click', () => {
    body.classList.toggle('dark-theme');

    // Сохраняем выбор пользователя
    if (body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
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

// Обновляет подсказку внутри тела цикла и условия
function updateLoopBodyHints() {
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const hasBlocks = body.querySelector('.workspace-block');
        let hint = body.querySelector('.loop-body-hint, .if-body-hint, .else-body-hint');
        if (hasBlocks) {
            if (hint) hint.remove();
        } else if (!hint) {
            hint = document.createElement('div');
            if (body.classList.contains('loop-body'))     hint.className = 'loop-body-hint';
            else if (body.classList.contains('if-body'))  hint.className = 'if-body-hint';
            else                                          hint.className = 'else-body-hint';
            hint.textContent = 'Перетащи блоки сюда';
            body.appendChild(hint);
        }
    });
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
        block.classList.add('block-if');
        block.dataset.type = 'if';
        block.innerHTML = `
            <div class="block-header">
            <span>если</span>
            <input type="text" placeholder="x" class="input-cond-left" style="width: 40px;">
            <select class="input-cond-op">
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value="==">=</option>
              <option value="!=">!=</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
            <input type="text" placeholder="y" class="input-cond-right" style="width: 40px;">
            <span>то</span>
          </div>
          <div class="if-body">
            <div class="if-body-hint">Перетащи блоки сюда</div>
          </div>
          <div class="else-label">иначе</div>
          <div class="else-body">
            <div class="else-body-hint">Перетащи блоки сюда</div>
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
    `;
    } else if (type === 'loop') {
        block.classList.add('block-loop');
        block.dataset.type = 'loop';
        block.innerHTML = `
          <div class="block-header">
            <span>пока</span>
            <input type="text" placeholder="i" class="input-cond-left" style="width:36px;">
            <select class="input-cond-op">
              <option value="<">&lt;</option>
              <option value=">">&gt;</option>
              <option value="==">==</option>
              <option value="!=">!=</option>
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
            </select>
            <input type="text" placeholder="10" class="input-cond-right" style="width:36px;">
          </div>
          <div class="loop-body">
            <div class="loop-body-hint">Перетащи блоки сюда</div>
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
        `;
    } else if (type === 'array_create') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_create';
        block.innerHTML = `
          <div class="block-header">
            <span>массив</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
            <span>размер</span>
            <input type="text" placeholder="5" class="input-arr-size" style="width: 35px;">
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
        `;
    } else if (type === 'array_set') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_set';
        block.innerHTML = `
          <div class="block-header">
            <input type="text" placeholder="a" class="input-arr-name" style="width: 30px;">
            <span>[</span>
            <input type="text" placeholder="i" class="input-arr-index" style="width: 30px;">
            <span>]:=</span>
            <input type="text" placeholder="0" class="input-arr-value" style="width: 65px;">
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
        `;
    } else if (type === 'array_get') {
        block.classList.add('block-assign');
        block.dataset.type = 'array_get';
        block.innerHTML = `
          <div class="block-header">
            <input type="text" placeholder="x" class="input-target" style="width: 35px;">
            <span>:=</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width: 30px;">
            <span>[</span>
            <input type="text" placeholder="i" class="input-arr-index" style="width: 30px;">
            <span>]</span>
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
        `;
    } else if (type === 'array_print') {
        block.classList.add('block-print');
        block.dataset.type = 'array_print';
        block.innerHTML = `
          <div class="block-header">
            <span>вывести  массив</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
          </div>
          <div class="connector"></div>
          <div class="notch"></div>
        `;
    } else if (type === 'bubble_sort') {
        block.classList.add('block-logic');
        block.dataset.type = 'bubble_sort';
        block.innerHTML = `
          <div class="block-header">
            <span>сортировка пузырьком</span>
            <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
          </div>
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

        // Создаём рамку выделени
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
        // Если блок находится внутри тела цикла или условия — вытащить его на холст
        const parentLoopBody = wsBlock.closest('.loop-body, .if-body, .else-body');
        if (parentLoopBody) {
            const blockRect = wsBlock.getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            wsBlock.style.setProperty('position', 'absolute', 'important');
            wsBlock.style.setProperty('left', (blockRect.left - canvasRect.left) + 'px', 'important');
            wsBlock.style.setProperty('top', (blockRect.top - canvasRect.top) + 'px', 'important');
            wsBlock.style.width = '';
            wsBlock.style.zIndex = '';
            canvas.appendChild(wsBlock);
            updateLoopBodyHints();
        }
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
            draggedEl = null;
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
        // Подсветка loop-body и if-body при наведении
        canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
            const r = body.getBoundingClientRect();
            const over = e.clientX >= r.left && e.clientX <= r.right &&
                e.clientY >= r.top  && e.clientY <= r.bottom;
            body.classList.toggle('drop-target', over);
        });

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
    // Подсветка loop-body и if-body при наведении
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const r = body.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top  && e.clientY <= r.bottom;
        body.classList.toggle('drop-target', over);
    });

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

        if (width > 5 && height > 5) {
            selectBlocksInRect({ left, top, right: left + width, bottom: top + height });
        }

        selectionBox.remove();
        selectionBox = null;
        isSelecting = false;
        return;
    }

    if (!draggedEl) return;

    // Завершение перемещения группы
    if (isDraggingGroup) {
        const panelRect = blocksPanel.getBoundingClientRect();
        const isInPanel = (
            e.clientX >= panelRect.left &&
            e.clientX <= panelRect.right &&
            e.clientY >= panelRect.top &&
            e.clientY <= panelRect.bottom
        );

        if (isInPanel) {
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

    // Проверяем: блок отпущен над телом цикла или условия?
    const loopBodies = Array.from(canvas.querySelectorAll('.loop-body, .if-body, .else-body'));
    let nestTarget = null;
    for (const body of loopBodies) {
        const r = body.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right &&
            e.clientY >= r.top  && e.clientY <= r.bottom &&
            !draggedEl.contains(body)) {
            nestTarget = body;
            break;
        }
    }
    if (nestTarget) {
        draggedEl.style.position = '';
        draggedEl.style.left = '';
        draggedEl.style.top  = '';
        draggedEl.style.zIndex = '';
        draggedEl.style.width  = '';
        nestTarget.appendChild(draggedEl);
        canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));
        clearPanelHighlight();
        deleteArea.classList.remove('active');
        draggedEl = null;
        updatePlaceholderVisibility();
        updateLoopBodyHints();
        return;
    }
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));

    // Одиночное перетаскивание
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
consolePane.style.background = 'var(--bg-panel)';
consolePane.style.border = '1px solid var(--border-subtle)';
consolePane.style.borderRadius = '10px';
consolePane.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
consolePane.style.fontSize = '11px';
consolePane.style.padding = '8px';
consolePane.style.boxShadow = '0 18px 40px rgba(0,0,0,0.4)';
consolePane.style.color = 'var(--text-main)';
consolePane.style.pointerEvents = 'auto';
consolePane.style.zIndex = '9999';
consolePane.textContent = 'Консоль: выполните программу.';
document.body.appendChild(consolePane);

function logToConsole(msg, isError = false) {
    const line = document.createElement('div');
    line.textContent = msg;
    line.style.marginBottom = '2px';
    if (isError) {
        line.style.color = 'var(--error)';
        line.style.fontWeight = '600';
    } else {
        line.style.color = 'var(--text-muted)';
    }
    consolePane.appendChild(line);
    consolePane.scrollTop = consolePane.scrollHeight;
}

function clearConsole() {
    consolePane.textContent = '';
}

// ============================================
// ПАРСЕР МАТЕМАТИЧЕСКИХ ВЫРАЖЕНИЙ
// ============================================

function calculate(expression, vars) {
    expression = expression.replace(/\s/g, '');
    expression = substituteVariables(expression, vars);

    // Сначала обрабатываем скобки
    expression = parseeval(expression);

    // Потом умножение/деление (слева направо)
    expression = parsemuldiv(expression);

    // В конце сложение/вычитание
    expression = parseadd(expression);

    const result = parseFloat(expression);
    if (isNaN(result)) {
        throw new Error(`Переменная не существует`);
    }
    return result;
}

function substituteVariables(expr, vars) {
    // Сначала заменяем обращения к элементам массивов a[i]
    expr = expr.replace(/([a-zA-Z_]\w*)\[([^\]]+)\]/g, (match, name, idxExpr) => {
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        const idx = Math.floor(evalExpression(idxExpr, vars));
        if (idx < 0 || idx >= _arrays[name].length)
            throw new Error(`Выход за пределы: ${name}[${idx}]`);
        return _arrays[name][idx];
    });

    // Заменяем имена переменных на их значения
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
        if (openskoba < 0) {
            k = 0;
        } else {
            var closeskoba = line.indexOf(")", openskoba);
            var inside = line.slice(openskoba + 1, closeskoba);
            var step1 = parsemuldiv(inside);
            var step2 = parseadd(step1);
            line = line.substr(0, openskoba) +
                step2.toString() +
                line.substr(closeskoba + 1);
        }
    } while (k == 1);

    return line;
}

function parsemuldiv(line) {
    var k = 1;

    do {
        var firstMul = line.indexOf("*");
        var firstDiv = line.indexOf("/");
        var firstOp;

        if (firstMul == -1 && firstDiv == -1) {
            firstOp = -1;
        } else if (firstMul == -1) {
            firstOp = firstDiv;
        } else if (firstDiv == -1) {
            firstOp = firstMul;
        } else {
            firstOp = Math.min(firstMul, firstDiv);
        }

        if (firstOp == -1) {
            k = 0;
        } else {
            var operator = line.charAt(firstOp);

            var z = firstOp;
            var beforez;

            do {
                beforez = z - 1;
                if (beforez < 0 ||
                    line.charAt(beforez) == "*" ||
                    line.charAt(beforez) == "/" ||
                    line.charAt(beforez) == "-" ||
                    line.charAt(beforez) == "+") {
                    z = -2;
                }
                z = z - 1;
            } while (z > -2);

            var op1;
            if (beforez < 0) {
                op1 = line.slice(0, firstOp);
            } else {
                op1 = line.slice(beforez + 1, firstOp);
            }

            z = firstOp;
            var afterz;

            do {
                afterz = z + 1;
                if (afterz >= line.length ||
                    line.charAt(afterz) == "*" ||
                    line.charAt(afterz) == "/" ||
                    line.charAt(afterz) == "-" ||
                    line.charAt(afterz) == "+") {
                    z = line.length + 1;
                }
                z = z + 1;
            } while (z < line.length + 1);

            var op2;
            if (afterz >= line.length) {
                op2 = line.slice(firstOp + 1, line.length);
            } else {
                op2 = line.slice(firstOp + 1, afterz);
            }

            var res;
            if (operator == '*') {
                res = parseFloat(op1) * parseFloat(op2);
            } else {
                if (parseFloat(op2) === 0) {
                    throw new Error("Деление на ноль");
                }
                res = parseFloat(op1) / parseFloat(op2);
            }

            if (beforez < 0) {
                line = res.toString() + line.substr(afterz);
            } else {
                line = line.substr(0, beforez + 1) +
                    res.toString() +
                    line.substr(afterz);
            }
        }
    } while (k == 1);

    return line;
}

function parseadd(line) {
    do {
        var before = 1;
        if (line.charAt(0) == "-") {
            before = -1;
            line = line.slice(1);
        }

        var kx = line.indexOf("+");
        var ky = line.indexOf("-");

        if (kx == -1 && ky == -1) {
            line = (before * parseFloat(line)).toString();
            break;
        } else {
            var lastz, attr;

            if ((kx > 0 && kx < ky) || (kx > 0 && ky == -1)) {
                lastz = kx;
                attr = 1;
            }
            if ((ky > 0 && ky < kx) || (ky > 0 && kx == -1)) {
                lastz = ky;
                attr = -1;
            }

            var op1 = before * parseFloat(line.slice(0, lastz));

            var arg = lastz + 1;
            do {
                if (arg >= line.length ||
                    line.charAt(arg) == "+" ||
                    line.charAt(arg) == "-") {
                    break;
                }
                arg = arg + 1;
            } while (arg <= line.length);

            var op2 = attr * parseFloat(line.slice(lastz + 1, arg));
            var res = op1 + op2;

            line = res.toString() + line.slice(arg);
        }
    } while (true);

    return line;
}

function evalExpression(expr, vars) {
    if (!expr || expr.trim() === '') return 0;
    return calculate(expr, vars);
}

// Оценка условия
function evaluateCondition(leftExpr, op, rightExpr, vars) {
    const left  = evalExpression(leftExpr,  vars);
    const right = evalExpression(rightExpr, vars);
    switch (op) {
        case '<':  return left <  right;
        case '>':  return left >  right;
        case '==': return left == right;
        case '!=': return left != right;
        case '>=': return left >= right;
        case '<=': return left <= right;
    }
    return false;
}

// Находит следующий блок в цепочке (снизу от текущего)
function findNextBlockInChain(currentBlock, allBlocks) {
    const canvasRect = canvas.getBoundingClientRect();
    const currentRect = currentBlock.getBoundingClientRect();
    const currentBottom = currentRect.bottom - canvasRect.top;
    const currentCenterX = currentRect.left - canvasRect.left + currentRect.width / 2;

    let nextBlock = null;
    let minDistance = Infinity;

    for (const block of allBlocks) {
        if (block === currentBlock) continue;

        const rect = block.getBoundingClientRect();
        const blockTop = rect.top - canvasRect.top;
        const blockCenterX = rect.left - canvasRect.left + rect.width / 2;

        const xClose = Math.abs(blockCenterX - currentCenterX) < 60;
        const distance = blockTop - currentBottom;

        if (xClose && distance > 0 && distance < SNAP_DISTANCE + 10 && distance < minDistance) {
            minDistance = distance;
            nextBlock = block;
        }
    }

    return nextBlock;
}

// Находит верхние блоки (начало цепочек)
function findTopBlocks(blocks) {
    const canvasRect = canvas.getBoundingClientRect();
    const topBlocks = [];

    for (const block of blocks) {
        const rect = block.getBoundingClientRect();
        const blockTop = rect.top - canvasRect.top;
        const blockCenterX = rect.left - canvasRect.left + rect.width / 2;

        let hasBlockAbove = false;
        for (const other of blocks) {
            if (other === block) continue;
            const otherRect = other.getBoundingClientRect();
            const otherBottom = otherRect.bottom - canvasRect.top;
            const otherCenterX = otherRect.left - canvasRect.left + otherRect.width / 2;

            const xClose = Math.abs(blockCenterX - otherCenterX) < 60;
            const yClose = Math.abs(blockTop - otherBottom) < SNAP_DISTANCE + 10;

            if (xClose && yClose && otherBottom < blockTop) {
                hasBlockAbove = true;
                break;
            }
        }

        if (!hasBlockAbove) {
            topBlocks.push(block);
        }
    }
    return topBlocks;
}
// ============================================
// ЭТО НЕ ПРОСТО СМЕЛО ЭТО ПИЗДЕЦ КАК СМЕЛО
// ============================================

function runProgram() {
    clearConsole();
    _arrays = {};

    // Берём только прямые дочерние блоки холста (верхний уровень)
    const allTopBlocks = Array.from(
        canvas.querySelectorAll(':scope > .workspace-block')
    );

    if (allTopBlocks.length === 0) {
        logToConsole('Нет блоков для выполнения.', true);
        return;
    }

    // Находим начала цепочек (блоки без блока сверху)
    const startBlocks = findTopBlocks(allTopBlocks);
    startBlocks.sort((a, b) =>
        parseFloat(a.style.top) - parseFloat(b.style.top)
    );

    const scope = {};          // переменные программы
    const stack = [];          // явный стек фреймов

    // Раскладываем все стартовые цепочки на стек
    // В обратном порядке — чтобы первая цепочка оказалась на вершине
    for (let ci = startBlocks.length - 1; ci >= 0; ci--) {
        pushChain(stack, startBlocks[ci], allTopBlocks);
    }

    const MAX_TOTAL = 50000;   // защита от бесконечного числа шагов
    let steps = 0;

    try {
        while (stack.length > 0) {
            if (steps++ > MAX_TOTAL) {
                throw new Error('Превышен лимит шагов — бесконечный цикл?');
            }

            const frame = stack.pop();

            if (frame.type === 'block') {
                executeSingleBlock(frame.block, scope, stack);
            }

            else if (frame.type === 'loop_check') {
                const { block, iterations } = frame;
                const leftExpr  = block.querySelector('.input-cond-left').value.trim();
                const op        = block.querySelector('.input-cond-op').value;
                const rightExpr = block.querySelector('.input-cond-right').value.trim();

                if (evaluateCondition(leftExpr, op, rightExpr, scope)) {
                    if (iterations >= 1000) {
                        throw new Error('Превышен лимит 1000 итераций — бесконечный цикл?');
                    }

                    // Кладём loop_check обратно — он сработает после тела
                    stack.push({ type: 'loop_check', block, iterations: iterations + 1 });

                    // Кладём тело цикла поверх (в обратном порядке)
                    const bodyBlocks = Array.from(
                        block.querySelector('.loop-body')
                            .querySelectorAll(':scope > .workspace-block')
                    );
                    for (let i = bodyBlocks.length - 1; i >= 0; i--) {
                        stack.push({ type: 'block', block: bodyBlocks[i] });
                    }
                }
                // Если условие false — просто не кладём ничего, цикл заканчивается
            }
        }

        logToConsole('✓ Выполнено. Переменные: ' + JSON.stringify(scope));

    } catch (err) {
        logToConsole('Ошибка: ' + err.message, true);
    }
}

// Кладёт на стек всю цепочку начиная с startBlock (в обратном порядке)
function pushChain(stack, startBlock, allBlocks) {
    const chain = [];
    let current = startBlock;
    while (current) {
        chain.push(current);
        current = findNextBlockInChain(current, allBlocks);
    }
    // Обратный порядок: первый блок цепочки окажется на вершине стека
    for (let i = chain.length - 1; i >= 0; i--) {
        stack.push({ type: 'block', block: chain[i] });
    }
}

// Выполняет один блок. Для loop кладёт loop_check на стек вместо рекурсии.
function executeSingleBlock(block, scope, stack) {
    const type = block.dataset.type;

    if (type === 'assign') {
        const name = block.querySelector('.input-target').value.trim();
        const expr = block.querySelector('.input-value').value.trim();
        if (!name) throw new Error('Пустое имя переменной в блоке присваивания');
        if (scope[name] === undefined) scope[name] = 0;
        scope[name] = evalExpression(expr, scope);
    }

    else if (type === 'print') {
        const expr = block.querySelector('.input-msg').value.trim();
        logToConsole(String(evalExpression(expr, scope)));
    }

    else if (type === 'loop') {
        // Не выполняем цикл здесь — кладём проверку условия на стек
        stack.push({ type: 'loop_check', block, iterations: 0 });
    }

    else if (type === 'if') {
        const leftExpr  = block.querySelector('.input-cond-left').value.trim();
        const op        = block.querySelector('.input-cond-op').value;
        const rightExpr = block.querySelector('.input-cond-right').value.trim();

        const ifBodyBlocks = Array.from(
            block.querySelector('.if-body')
                .querySelectorAll(':scope > .workspace-block')
        );
        const elseBodyEl = block.querySelector('.else-body');
        const elseBodyBlocks = elseBodyEl
            ? Array.from(elseBodyEl.querySelectorAll(':scope > .workspace-block'))
            : [];

        const bodyToRun = evaluateCondition(leftExpr, op, rightExpr, scope)
            ? ifBodyBlocks
            : elseBodyBlocks;

        // Кладём нужную ветку на стек (в обратном порядке)
        for (let i = bodyToRun.length - 1; i >= 0; i--) {
            stack.push({ type: 'block', block: bodyToRun[i] });
        }
    }

    else if (type === 'array_create') {
        const name = block.querySelector('.input-arr-name').value.trim();
        const size = Math.floor(evalExpression(
            block.querySelector('.input-arr-size').value.trim(), scope
        ));
        if (!name) throw new Error('Пустое имя массива');
        if (size <= 0 || size > 10000) throw new Error(`Недопустимый размер: ${size}`);
        _arrays[name] = new Array(size).fill(0);
        logToConsole(`Массив '${name}' размером ${size} создан`);
    }

    else if (type === 'array_set') {
        const name = block.querySelector('.input-arr-name').value.trim();
        const idx  = Math.floor(evalExpression(
            block.querySelector('.input-arr-index').value.trim(), scope
        ));
        const val  = evalExpression(
            block.querySelector('.input-arr-value').value.trim(), scope
        );
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        if (idx < 0 || idx >= _arrays[name].length)
            throw new Error(`Выход за пределы: ${name}[${idx}]`);
        _arrays[name][idx] = val;
    }

    else if (type === 'array_get') {
        const target = block.querySelector('.input-target').value.trim();
        const name   = block.querySelector('.input-arr-name').value.trim();
        const idx    = Math.floor(evalExpression(
            block.querySelector('.input-arr-index').value.trim(), scope
        ));
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        if (idx < 0 || idx >= _arrays[name].length)
            throw new Error(`Выход за пределы: ${name}[${idx}]`);
        scope[target] = _arrays[name][idx];
    }

    else if (type === 'array_print') {
        const name = block.querySelector('.input-arr-name').value.trim();
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        logToConsole(`${name} = [${_arrays[name].join(', ')}]`);
    }

    else if (type === 'bubble_sort') {
        const name = block.querySelector('.input-arr-name').value.trim();
        if (_arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
        const arr = _arrays[name];
        const n = arr.length;
        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - i - 1; j++) {
                if (arr[j] > arr[j + 1]) {
                    const temp = arr[j]; arr[j] = arr[j + 1]; arr[j + 1] = temp;
                }
            }
        }
        logToConsole(`'${name}' отсортирован: [${arr.join(', ')}]`);
    }
}

runBtn.addEventListener('click', runProgram);
