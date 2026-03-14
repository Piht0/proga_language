// ============================================================================
// КОНСТАНТЫ И СОСТОЯНИЕ
// ============================================================================

const SNAP_DISTANCE = 20;
const STACK_X_OFFSET = 0;
const MAX_LOOP_ITERATIONS = 1000;

let draggedEl = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Для выделения группой
let isSelecting = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionBox = null;
let selectedBlocks = [];
let isDraggingGroup = false;
let groupDragOffsetX = 0;
let groupDragOffsetY = 0;

// ============================================================================
// DOM-ЭЛЕМЕНТЫ
// ============================================================================

const themeToggleBtn = document.getElementById('theme-toggle');
const blocksPanel = document.querySelector('.blocks-panel');
const canvas = document.getElementById('workspace-canvas');
const placeholder = document.getElementById('workspace-placeholder');
const resetBtn = document.getElementById('reset-btn');
const deleteArea = document.getElementById('delete-area');
const runBtn = document.querySelector('.btn.btn-primary');
const saveBtn = document.getElementById('save-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');


// ТЕМА (THEME)


const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
}

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
});


// УТИЛИТЫ: ВЫДЕЛЕНИЕ, ПОДСВЕТКА


function clearSelection() { // убирает выделение
    selectedBlocks.forEach(block => block.classList.remove('selected'));
    selectedBlocks = [];
}

function selectBlocksInRect(rect) { // выделение как на винде 
    clearSelection();
    const canvasRect = canvas.getBoundingClientRect(); // коорды холстика
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block')); 

    for (const block of blocks) {
        const blockRect = block.getBoundingClientRect();
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
// Прямоугольничек для выделения. ну чтоб всё робило
function getSelectedBlocksBounds() {
    if (selectedBlocks.length === 0) {
        return null;
    }
    const canvasRect = canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const block of selectedBlocks) {
        const x = parseFloat(block.style.left) || 0; // поз x
        const y = parseFloat(block.style.top) || 0; // поз y

        minX = Math.min(minX, x); // самый левый
        minY = Math.min(minY, y); // самый верхний 
        maxX = Math.max(maxX, x + block.offsetWidth); // самый правый 
        maxY = Math.max(maxY, y + block.offsetHeight); // самый нижний 
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// проверка наличия блоков
function updatePlaceholderVisibility() {
    const hasBlocks = canvas.querySelectorAll('.workspace-block').length > 0;
    placeholder.style.display = hasBlocks ? 'none' : 'flex';
}

// подсказки 
function updateLoopBodyHints() {
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const hasBlocks = body.querySelector('.workspace-block'); // есть ли блоки
        let hint = body.querySelector('.loop-body-hint, .if-body-hint, .else-body-hint'); // есть ли подсказки
        if (hasBlocks) {
            if (hint) hint.remove();
        } else if (!hint) {
            hint = document.createElement('div');
            hint.className = body.classList.contains('loop-body') ? 'loop-body-hint' :
                             body.classList.contains('if-body') ? 'if-body-hint' : 'else-body-hint';
            hint.textContent = body.classList.contains('else-body') 
                ? 'Перетащи блоки сюда (else)' 
                : 'Перетащи блоки сюда';
            body.appendChild(hint);
        }
    });
}

// подсвечивание блоков красненьким 
function updatePanelHighlight(e) {
    if (!draggedEl) return;

    const panelRect = blocksPanel.getBoundingClientRect(); // возварщает объект с координатами 
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

// убирает подсветку с панели блоков 
function clearPanelHighlight() {
    blocksPanel.style.boxShadow = '';
    blocksPanel.style.borderColor = '';
}

// убирает подсветку ошиьочек
function clearErrorHighlight() {
    canvas.querySelectorAll('.workspace-block.block-error').forEach(block => {
        block.classList.remove('block-error');
    });
}

function highlightBlockError(block) {
    clearErrorHighlight();
    block.classList.add('block-error');
}


// АЛАБУГА БЛОКОТЕХ
function createWorkspaceBlock(type) {
    const block = document.createElement('div');
    block.classList.add('workspace-block');

    const configs = {
        print: {
            class: 'block-print',
            html: `
                <div class="block-header">
                    <span>вывести</span>
                    <input type="text" placeholder="значение" class="input-msg" style="width: 100px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        assign: {
            class: 'block-assign',
            html: `
                <div class="block-header">
                    <input type="text" placeholder="x" class="input-target" style="width: 50px;">
                    <span>:=</span>
                    <input type="text" placeholder="5" class="input-value" style="width: 80px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        if: {
            class: 'block-if',
            html: `
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
                <div class="if-body"><div class="if-body-hint">Перетащи блоки сюда</div></div>
                <div class="else-body"><div class="else-body-hint">Перетащи блоки сюда (else)</div></div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        loop: {
            class: 'block-loop',
            html: `
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
                <div class="loop-body"><div class="loop-body-hint">Перетащи блоки сюда</div></div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        array_create: {
            class: 'block-assign',
            html: `
                <div class="block-header">
                    <span>массив</span>
                    <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
                    <span>размер</span>
                    <input type="text" placeholder="5" class="input-arr-size" style="width: 35px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        array_set: {
            class: 'block-assign',
            html: `
                <div class="block-header">
                    <input type="text" placeholder="a" class="input-arr-name" style="width: 30px;">
                    <span>[</span>
                    <input type="text" placeholder="i" class="input-arr-index" style="width: 30px;">
                    <span>]:=</span>
                    <input type="text" placeholder="0" class="input-arr-value" style="width: 65px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        array_get: {
            class: 'block-assign',
            html: `
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
            `
        },
        array_print: {
            class: 'block-print',
            html: `
                <div class="block-header">
                    <span>вывести  массив</span>
                    <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        bubble_sort: {
            class: 'block-logic',
            html: `
                <div class="block-header">
                    <span>сортировка пузырьком</span>
                    <input type="text" placeholder="a" class="input-arr-name" style="width: 35px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        },
        logical_op: {
            class: 'block-logic',
            html: `
                <div class="block-header">
                    <input type="text" placeholder="x" class="input-logic-left" style="width: 50px;">
                    <select class="input-logic-op">
                        <option value="and">and</option>
                        <option value="or">or</option>
                    </select>
                    <input type="text" placeholder="y" class="input-logic-right" style="width: 50px;">
                </div>
                <div class="connector"></div>
                <div class="notch"></div>
            `
        }
    };

    const config = configs[type];
    if (config) {
        block.classList.add(config.class); // добавляем css класс
        block.dataset.type = type; // сохраняем дата атрибутик
        block.innerHTML = config.html; // вставляем html кфг
    } else {
        block.textContent = type; // вставляем новый тип блока как текстик 
        block.innerHTML += `<div class="connector"></div><div class="notch"></div>`;
    }
    return block;
}

// функция для склеивания 
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

        const distBelow = Math.abs(blockTop - oBottom); // расстояние до блока сверху
        const distAbove = Math.abs(blockBottom - oTop); // растояние до блока снизу 
        const xCloseEnough = Math.abs(blockCenterX - oCenterX) < 60; // проверка по гор

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

// DRAG & DROP: ОБРАБОТЧИКИ СОБЫТИЙ

document.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    const paletteBlock = e.target.closest('.block[data-block-type]');
    const wsBlock = e.target.closest('.workspace-block');

    // Клик по пустому месту в canvas — выделение рамкой
    if (!paletteBlock && !wsBlock && e.target.closest('.workspace-canvas')) {
        e.preventDefault();
        const canvasRect = canvas.getBoundingClientRect();
        isSelecting = true;
        selectionStartX = e.clientX - canvasRect.left;
        selectionStartY = e.clientY - canvasRect.top;

        selectionBox = document.createElement('div');
        selectionBox.classList.add('selection-box');
        selectionBox.style.left = selectionStartX + 'px';
        selectionBox.style.top = selectionStartY + 'px';
        selectionBox.style.width = '0';
        selectionBox.style.height = '0';
        canvas.appendChild(selectionBox);

        if (!e.ctrlKey && !e.metaKey) clearSelection();
        return;
    }

    if (!paletteBlock && !wsBlock) {
        clearSelection();
        return;
    }

    e.preventDefault();
    const canvasRect = canvas.getBoundingClientRect();

    if (paletteBlock) {
        clearSelection();
        const type = paletteBlock.dataset.blockType;
        const block = createWorkspaceBlock(type);
        canvas.appendChild(block);

        block.style.left = (e.clientX - canvasRect.left - block.offsetWidth / 2) + 'px';
        block.style.top = (e.clientY - canvasRect.top - block.offsetHeight / 2) + 'px';

        draggedEl = block;
    } else {
        // Вытаскивание блока из тела цикла/условия
        const parentLoopBody = wsBlock.closest('.loop-body, .if-body');
        if (parentLoopBody) {
            const blockRect = wsBlock.getBoundingClientRect();
            wsBlock.style.setProperty('position', 'absolute', 'important');
            wsBlock.style.setProperty('left', (blockRect.left - canvasRect.left) + 'px', 'important');
            wsBlock.style.setProperty('top', (blockRect.top - canvasRect.top) + 'px', 'important');
            wsBlock.style.width = '';
            wsBlock.style.zIndex = '';
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
            draggedEl = null;
            return;
        }

        if (!wsBlock.classList.contains('selected')) clearSelection();

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

document.addEventListener('mousemove', (e) => {
    if (isSelecting && selectionBox) {
        const canvasRect = canvas.getBoundingClientRect();
        const currentX = e.clientX - canvasRect.left;
        const currentY = e.clientY - canvasRect.top;

        selectionBox.style.left = Math.min(selectionStartX, currentX) + 'px';
        selectionBox.style.top = Math.min(selectionStartY, currentY) + 'px';
        selectionBox.style.width = Math.abs(currentX - selectionStartX) + 'px';
        selectionBox.style.height = Math.abs(currentY - selectionStartY) + 'px';
        return;
    }

    if (!draggedEl) return;

    const canvasRect = canvas.getBoundingClientRect();

    // Перемещение группы
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

                x = Math.max(0, Math.min(x + deltaX, canvasRect.width - block.offsetWidth));
                y = Math.max(0, Math.min(y + deltaY, canvasRect.height - block.offsetHeight));

                block.style.left = x + 'px';
                block.style.top = y + 'px';
            }
        }

        updatePanelHighlight(e);
        canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
            const r = body.getBoundingClientRect();
            const over = e.clientX >= r.left && e.clientX <= r.right &&
                        e.clientY >= r.top  && e.clientY <= r.bottom;
            body.classList.toggle('drop-target', over);
        });

        const deleteRect = deleteArea.getBoundingClientRect();
        deleteArea.classList.toggle('active',
            e.clientX >= deleteRect.left && e.clientX <= deleteRect.right &&
            e.clientY >= deleteRect.top && e.clientY <= deleteRect.bottom
        );
        return;
    }

    // Одиночное перетаскивание
    let x = e.clientX - canvasRect.left - dragOffsetX;
    let y = e.clientY - canvasRect.top - dragOffsetY;

    x = Math.max(0, Math.min(x, canvasRect.width - draggedEl.offsetWidth));
    y = Math.max(0, Math.min(y, canvasRect.height - draggedEl.offsetHeight));

    draggedEl.style.left = x + 'px';
    draggedEl.style.top = y + 'px';

    updatePanelHighlight(e);
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const r = body.getBoundingClientRect();
        const over = e.clientX >= r.left && e.clientX <= r.right &&
                    e.clientY >= r.top  && e.clientY <= r.bottom;
        body.classList.toggle('drop-target', over);
    });

    const deleteRect = deleteArea.getBoundingClientRect();
    deleteArea.classList.toggle('active',
        e.clientX >= deleteRect.left && e.clientX <= deleteRect.right &&
        e.clientY >= deleteRect.top && e.clientY <= deleteRect.bottom
    );
});

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
            e.clientX >= panelRect.left && e.clientX <= panelRect.right &&
            e.clientY >= panelRect.top && e.clientY <= panelRect.bottom
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
        const inDelete = (
            e.clientX >= deleteRect.left && e.clientX <= deleteRect.right &&
            e.clientY >= deleteRect.top && e.clientY <= deleteRect.bottom
        );

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
            let newY = snap.position === 'below'
                ? otherRect.bottom - canvasRect.top + 4
                : otherRect.top - canvasRect.top - draggedEl.offsetHeight - 4;

            const origX = parseFloat(draggedEl.style.left) || 0;
            const origY = parseFloat(draggedEl.style.top) || 0;
            const deltaX = newX - origX;
            const deltaY = newY - origY;

            for (const block of selectedBlocks) {
                block.style.left = (parseFloat(block.style.left) + deltaX) + 'px';
                block.style.top = (parseFloat(block.style.top) + deltaY) + 'px';
            }
        }

        draggedEl.style.zIndex = '';
        draggedEl = null;
        isDraggingGroup = false;
        updatePlaceholderVisibility();
        return;
    }

    // Одиночное перетаскивание — проверка на вложение в тело цикла/условия
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
        updateBlockConnections();
        return;
    }

    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(b => b.classList.remove('drop-target'));

    // Проверка: панель блоков
    const panelRect = blocksPanel.getBoundingClientRect();
    const isInPanel = (
        e.clientX >= panelRect.left && e.clientX <= panelRect.right &&
        e.clientY >= panelRect.top && e.clientY <= panelRect.bottom
    );

    if (isInPanel) {
        draggedEl.remove();
        clearPanelHighlight();
        draggedEl = null;
        updatePlaceholderVisibility();
        return;
    }

    // Проверка: зона удаления
    const deleteRect = deleteArea.getBoundingClientRect();
    const inDelete = (
        e.clientX >= deleteRect.left && e.clientX <= deleteRect.right &&
        e.clientY >= deleteRect.top && e.clientY <= deleteRect.bottom
    );

    if (inDelete) {
        draggedEl.remove();
        deleteArea.classList.remove('active');
        draggedEl = null;
        updatePlaceholderVisibility();
        return;
    }

    clearPanelHighlight();
    deleteArea.classList.remove('active');

    // Snap к другому блоку
    const snap = findSnapTarget(draggedEl);
    if (snap) {
        const canvasRect = canvas.getBoundingClientRect();
        const otherRect = snap.other.getBoundingClientRect();

        let newX = otherRect.left - canvasRect.left + STACK_X_OFFSET;
        let newY = snap.position === 'below'
            ? otherRect.bottom - canvasRect.top + 4
            : otherRect.top - canvasRect.top - draggedEl.offsetHeight - 4;

        draggedEl.style.left = newX + 'px';
        draggedEl.style.top = newY + 'px';
    }

    draggedEl.style.zIndex = '';
    draggedEl = null;
    updatePlaceholderVisibility();
    
    // Пересчитываем связи между блоками после перемещения
    updateBlockConnections();
});

// Сброс workspace
resetBtn.addEventListener('click', () => {
    canvas.querySelectorAll('.workspace-block').forEach((b) => b.remove());
    updatePlaceholderVisibility();
    updateBlockConnections();
});

// Отключаем нативный drag
document.addEventListener('dragstart', (e) => {
    if (e.target.closest('.block') || e.target.closest('.workspace-block')) {
        e.preventDefault();
    }
});

updatePlaceholderVisibility();

document.addEventListener('DOMContentLoaded', () => {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block'));
    blocks.forEach(block => {
        if (!block.dataset.id) block.dataset.id = generateId();
    });
    updateBlockConnections();
});

// ============================================================================
// КОНСОЛЬ
// ============================================================================

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

// ============================================================================
// ПАРСЕР ВЫРАЖЕНИЙ
// ============================================================================

function calculate(expression, vars) {
    expression = expression.replace(/\s/g, '');
    expression = substituteVariables(expression, vars);
    expression = parseeval(expression);
    expression = parsemuldiv(expression);
    expression = parseadd(expression);

    const result = parseFloat(expression);
    if (isNaN(result)) throw new Error(`Переменная не существует`);
    return result;
}

function substituteVariables(expr, vars) {
    // Замена обращений к массивам a[i]
    expr = expr.replace(/([a-zA-Z_]\w*)\[([^\]]+)\]/g, (match, name, idxExpr) => {
        if (!vars._arrays || vars._arrays[name] === undefined) {
            throw new Error(`Массив '${name}' не объявлен`);
        }
        const idx = Math.floor(evalExpression(idxExpr, vars));
        if (idx < 0 || idx >= vars._arrays[name].length) {
            throw new Error(`Выход за пределы: ${name}[${idx}]`);
        }
        return vars._arrays[name][idx];
    });

    const varNames = Object.keys(vars).filter(k => k !== '_arrays').sort((a, b) => b.length - a.length);
    for (const name of varNames) {
        const regex = new RegExp('(?<![a-zA-Z0-9_])' + name + '(?![a-zA-Z0-9_])', 'g');
        expr = expr.replace(regex, vars[name]);
    }

    return expr;
}

function parseeval(line) {
    let k = 1;
    do {
        const openskoba = line.lastIndexOf("(");
        if (openskoba < 0) {
            k = 0;
        } else {
            const closeskoba = line.indexOf(")", openskoba);
            const inside = line.slice(openskoba + 1, closeskoba);
            const step1 = parsemuldiv(inside);
            const step2 = parseadd(step1);
            line = line.substr(0, openskoba) + step2.toString() + line.substr(closeskoba + 1);
        }
    } while (k === 1);
    return line;
}

function parsemuldiv(line) {
    let k = 1;
    do {
        const firstMul = line.indexOf("*");
        const firstDiv = line.indexOf("/");
        let firstOp;

        if (firstMul === -1 && firstDiv === -1) {
            firstOp = -1;
        } else if (firstMul === -1) {
            firstOp = firstDiv;
        } else if (firstDiv === -1) {
            firstOp = firstMul;
        } else {
            firstOp = Math.min(firstMul, firstDiv);
        }

        if (firstOp === -1) {
            k = 0;
        } else {
            const operator = line.charAt(firstOp);

            // Левый операнд
            let z = firstOp;
            let beforez;
            do {
                beforez = z - 1;
                if (beforez < 0 || ["*", "/", "-", "+"].includes(line.charAt(beforez))) {
                    z = -2;
                }
                z--;
            } while (z > -2);

            const op1 = beforez < 0 ? line.slice(0, firstOp) : line.slice(beforez + 1, firstOp);

            // Правый операнд
            z = firstOp;
            let afterz;
            do {
                afterz = z + 1;
                if (afterz >= line.length || ["*", "/", "-", "+"].includes(line.charAt(afterz))) {
                    z = line.length + 1;
                }
                z++;
            } while (z < line.length + 1);

            const op2 = afterz >= line.length ? line.slice(firstOp + 1) : line.slice(firstOp + 1, afterz);

            // Вычисление
            let res;
            if (operator === '*') {
                res = parseFloat(op1) * parseFloat(op2);
            } else {
                if (parseFloat(op2) === 0) throw new Error("Деление на ноль");
                res = parseFloat(op1) / parseFloat(op2);
            }

            line = (beforez < 0 ? res.toString() : line.substr(0, beforez + 1) + res.toString()) + line.substr(afterz);
        }
    } while (k === 1);
    return line;
}

function parseadd(line) {
    do {
        let before = 1;
        if (line.charAt(0) === "-") {
            before = -1;
            line = line.slice(1);
        }

        const kx = line.indexOf("+");
        const ky = line.indexOf("-");

        if (kx === -1 && ky === -1) {
            line = (before * parseFloat(line)).toString();
            break;
        }

        let lastz, attr;
        if ((kx > 0 && kx < ky) || (kx > 0 && ky === -1)) {
            lastz = kx;
            attr = 1;
        } else if ((ky > 0 && ky < kx) || (ky > 0 && kx === -1)) {
            lastz = ky;
            attr = -1;
        }

        const op1 = before * parseFloat(line.slice(0, lastz));

        let arg = lastz + 1;
        while (arg < line.length && !["+", "-"].includes(line.charAt(arg))) {
            arg++;
        }

        const op2 = attr * parseFloat(line.slice(lastz + 1, arg));
        const res = op1 + op2;

        line = res.toString() + line.slice(arg);
    } while (true);
    return line;
}

function evalExpression(expr, vars) {
    if (!expr || expr.trim() === '') return 0;
    return calculate(expr, vars);
}


// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ИНТЕРПРЕТЕТАТОРА


function evaluateCondition(leftExpr, op, rightExpr, vars) {
    const left = evalExpression(leftExpr, vars);
    const right = evalExpression(rightExpr, vars);
    
    switch (op) {
        case '<':  return left < right;
        case '>':  return left > right;
        case '==': return left == right;
        case '!=': return left != right;
        case '>=': return left >= right;
        case '<=': return left <= right;
        case 'and': return !!left && !!right;
        case 'or':  return !!left || !!right;
        default: return false;
    }
}

function evaluateLogicalOp(leftExpr, op, rightExpr, vars) {
    const left = evalExpression(leftExpr, vars);
    const right = evalExpression(rightExpr, vars);
    
    if (op === 'and') return (left && right) ? 1 : 0;
    if (op === 'or') return (left || right) ? 1 : 0;
    return 0;
}

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

/**
 * Пересчитывает связи nextBlockId для всех блоков на основе их координат
 * Вызывается после перемещения блоков
 */
function updateBlockConnections() {
    // Обрабатываем блоки на холсте
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block'));
    
    blocks.forEach(block => {
        const nextBlock = findNextBlockInChain(block, blocks);
        if (nextBlock) {
            block.dataset.nextBlockId = nextBlock.dataset.id;
        } else {
            delete block.dataset.nextBlockId;
        }
    });
    
    // Обрабатываем вложенные блоки (в loop-body, if-body, else-body)
    canvas.querySelectorAll('.loop-body, .if-body, .else-body').forEach(body => {
        const bodyBlocks = Array.from(body.querySelectorAll(':scope > .workspace-block'));
        bodyBlocks.forEach((block, i) => {
            // Для вложенных блоков следующий = просто следующий в DOM порядке
            const nextInBody = i < bodyBlocks.length - 1 ? bodyBlocks[i + 1] : null;
            if (nextInBody) {
                block.dataset.nextBlockId = nextInBody.dataset.id;
            } else {
                delete block.dataset.nextBlockId;
            }
        });
    });
}

/**
 * Находит верхние блоки (начало цепочек)
 * Верхний блок = блок, на который нет ссылок из nextBlockId
 */
function findTopBlocks(blocks) {
    const blockIds = new Set(blocks.map(b => b.dataset.id));
    const referencedIds = new Set();
    
    // Собираем все nextBlockId
    blocks.forEach(b => {
        if (b.dataset.nextBlockId && blockIds.has(b.dataset.nextBlockId)) {
            referencedIds.add(b.dataset.nextBlockId);
        }
    });
    
    // Блоки, на которые нет ссылок — это начала цепочек
    return blocks.filter(b => !referencedIds.has(b.dataset.id));
}

// ============================================================================
// ИНТЕРПРЕТЕТАТОР: ВЫПОЛНЕНИЕ БЛОКОВ
// ============================================================================

function executeSingleBlock(block, scope) {
    const type = block.dataset.type;
    
    try {
        if (type === 'assign') {
            const name = block.querySelector('.input-target').value.trim();
            const expr = block.querySelector('.input-value').value.trim();
            if (!name) throw new Error('Пустое имя переменной в блоке присваивания');
            if (scope[name] === undefined) scope[name] = 0;
            scope[name] = evalExpression(expr, scope);
        }

        if (type === 'print') {
            const expr = block.querySelector('.input-msg').value.trim();
            logToConsole(String(evalExpression(expr, scope)));
        }

        if (type === 'logical_op') {
            const leftExpr = block.querySelector('.input-logic-left').value.trim();
            const op = block.querySelector('.input-logic-op').value;
            const rightExpr = block.querySelector('.input-logic-right').value.trim();
            const result = evaluateLogicalOp(leftExpr, op, rightExpr, scope);
            logToConsole(String(result));
        }

        if (type === 'loop') {
            const leftExpr = block.querySelector('.input-cond-left').value.trim();
            const op = block.querySelector('.input-cond-op').value;
            const rightExpr = block.querySelector('.input-cond-right').value.trim();

            const bodyBlocks = Array.from(
                block.querySelector('.loop-body').querySelectorAll(':scope > .workspace-block')
            );

            let iterations = 0;
            while (evaluateCondition(leftExpr, op, rightExpr, scope)) {
                if (iterations++ >= MAX_LOOP_ITERATIONS) {
                    throw new Error('Превышен лимит 1000 итераций — бесконечный цикл?');
                }
                executeBlockList(bodyBlocks, scope, true);
            }
        }

        if (type === 'if') {
            const leftExpr = block.querySelector('.input-cond-left').value.trim();
            const op = block.querySelector('.input-cond-op').value;
            const rightExpr = block.querySelector('.input-cond-right').value.trim();

            const bodyBlocks = Array.from(
                block.querySelector('.if-body').querySelectorAll(':scope > .workspace-block')
            );
            const elseBodyBlocks = Array.from(
                block.querySelector('.else-body').querySelectorAll(':scope > .workspace-block')
            );

            if (evaluateCondition(leftExpr, op, rightExpr, scope)) {
                executeBlockList(bodyBlocks, scope, true);
            } else if (elseBodyBlocks.length > 0) {
                executeBlockList(elseBodyBlocks, scope, true);
            }
        }

        if (type === 'array_create') {
            const name = block.querySelector('.input-arr-name').value.trim();
            const size = Math.floor(evalExpression(block.querySelector('.input-arr-size').value.trim(), scope));
            
            if (!name) throw new Error('Пустое имя массива');
            if (size <= 0 || size > 10000) throw new Error(`Недопустимый размер: ${size}`);
            
            scope._arrays[name] = new Array(size).fill(0);
            logToConsole(`Массив '${name}' размером ${size} создан`);
        }

        if (type === 'array_set') {
            const name = block.querySelector('.input-arr-name').value.trim();
            const idx = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));
            const val = evalExpression(block.querySelector('.input-arr-value').value.trim(), scope);
            
            if (scope._arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
            if (idx < 0 || idx >= scope._arrays[name].length) throw new Error(`Выход за пределы: ${name}[${idx}]`);
            
            scope._arrays[name][idx] = val;
        }

        if (type === 'array_get') {
            const target = block.querySelector('.input-target').value.trim();
            const name = block.querySelector('.input-arr-name').value.trim();
            const idx = Math.floor(evalExpression(block.querySelector('.input-arr-index').value.trim(), scope));

            if (!target) throw new Error('Пустое имя переменной‑приёмника');
            if (scope._arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
            if (idx < 0 || idx >= scope._arrays[name].length) throw new Error(`Выход за пределы: ${name}[${idx}]`);

            scope[target] = scope._arrays[name][idx];
        }

        if (type === 'array_print') {
            const name = block.querySelector('.input-arr-name').value.trim();
            if (scope._arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);
            logToConsole(`${name}[] = [${scope._arrays[name].join(', ')}]`);
        }

        if (type === 'bubble_sort') {
            const name = block.querySelector('.input-arr-name').value.trim();
            if (!name) throw new Error('Пустое имя массива для сортировки');
            if (scope._arrays[name] === undefined) throw new Error(`Массив '${name}' не объявлен`);

            const arr = scope._arrays[name];
            const n = arr.length;
            
            for (let i = 0; i < n - 1; i++) {
                for (let j = 0; j < n - i - 1; j++) {
                    if (arr[j] > arr[j + 1]) {
                        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
                    }
                }
            }
            
            logToConsole(`Массив '${name}' отсортирован: [${arr.join(', ')}]`);
        }
    } catch (e) {
        e.errorBlock = block;
        throw e;
    }
}

function findErrorBlock(e) {
    let current = e;
    while (current && current.errorBlock === undefined) {
        if (!current.cause) break;
        current = current.cause;
    }
    return current.errorBlock || null;
}

/**
 * Выполняет цепочку блоков последовательно
 * Использует nextBlockId из data-атрибутов (детерминировано)
 */
function executeChain(startBlock, allBlocks, scope) {
    const blockMap = new Map(allBlocks.map(b => [b.dataset.id, b]));
    
    let current = startBlock;
    while (current) {
        executeSingleBlock(current, scope);
        
        // Ищем следующий блок по nextBlockId
        const nextBlockId = current.dataset.nextBlockId;
        current = nextBlockId ? blockMap.get(nextBlockId) : null;
    }
}

function executeBlockList(blocks, vars, isIsolated = false) {
    // Пересчитываем связи перед выполнением (только для блоков верхнего уровня)
    const topLevelBlocks = blocks.filter(b => 
        !b.closest('.loop-body, .if-body, .else-body')
    );
    
    topLevelBlocks.forEach(block => {
        const nextBlock = findNextBlockInChain(block, topLevelBlocks);
        if (nextBlock) {
            block.dataset.nextBlockId = nextBlock.dataset.id;
        } else {
            delete block.dataset.nextBlockId;
        }
    });
    
    const scope = isIsolated ? { ...vars } : vars;
    const topBlocks = findTopBlocks(blocks);
    
    for (const startBlock of topBlocks) {
        executeChain(startBlock, blocks, scope);
    }
}

// ============================================================================
// CHECK-REVIEW: ВАЛИДАЦИЯ ПРОГРАММЫ ПЕРЕД ЗАПУСКОМ
// ============================================================================

function checkReview() {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block'));
    const errors = [];
    const warnings = [];

    if (blocks.length === 0) {
        errors.push('Нет блоков для выполнения');
        return { valid: false, errors, warnings };
    }

    // Проверка пустых полей в блоках
    blocks.forEach((block, index) => {
        const type = block.dataset.type;
        const blockNum = index + 1;

        switch (type) {
            case 'assign': {
                const target = block.querySelector('.input-target')?.value.trim();
                const value = block.querySelector('.input-value')?.value.trim();
                if (!target) errors.push(`Блок #${blockNum}: пустое имя переменной`);
                if (!value) warnings.push(`Блок #${blockNum}: пустое значение`);
                break;
            }
            case 'print': {
                const msg = block.querySelector('.input-msg')?.value.trim();
                if (!msg) warnings.push(`Блок #${blockNum}: пустое выражение для вывода`);
                break;
            }
            case 'if':
            case 'loop': {
                const left = block.querySelector('.input-cond-left')?.value.trim();
                const right = block.querySelector('.input-cond-right')?.value.trim();
                if (!left || !right) errors.push(`Блок #${blockNum}: пустое условие`);
                break;
            }
            case 'array_create': {
                const name = block.querySelector('.input-arr-name')?.value.trim();
                const size = block.querySelector('.input-arr-size')?.value.trim();
                if (!name) errors.push(`Блок #${blockNum}: пустое имя массива`);
                if (!size) errors.push(`Блок #${blockNum}: пустой размер массива`);
                break;
            }
            case 'array_set':
            case 'array_get': {
                const name = block.querySelector('.input-arr-name')?.value.trim();
                const index = block.querySelector('.input-arr-index')?.value.trim();
                if (!name) errors.push(`Блок #${blockNum}: пустое имя массива`);
                if (!index) errors.push(`Блок #${blockNum}: пустой индекс`);
                break;
            }
            case 'array_print':
            case 'bubble_sort': {
                const name = block.querySelector('.input-arr-name')?.value.trim();
                if (!name) errors.push(`Блок #${blockNum}: пустое имя массива`);
                break;
            }
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

// ============================================================================
// СОХРАНЕНИЕ И ИМПОРТ ПРОГРАММЫ
// ============================================================================

/**
 * Генерирует уникальный ID для блока
 */
function generateId() {
    return 'blk_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Собирает данные всех блоков в сериализуемый формат
 */
function serializeProgram() {
    const blocks = Array.from(canvas.querySelectorAll('.workspace-block'));
    
    // Сначала присваиваем ID всем блокам (если ещё нет)
    blocks.forEach(block => {
        if (!block.dataset.id) {
            block.dataset.id = generateId();
        }
    });

    // Определяем связи между блоками (кто за кем следует)
    const blockMap = new Map(blocks.map(b => [b.dataset.id, b]));
    
    return blocks.map(block => {
        const nextBlock = findNextBlockInChain(block, blocks);
        
        const data = {
            id: block.dataset.id,
            nextBlockId: nextBlock ? nextBlock.dataset.id : null,
            type: block.dataset.type,
            x: parseFloat(block.style.left) || 0,
            y: parseFloat(block.style.top) || 0,
            inputs: {}
        };

        // Сохраняем все input и select значения
        const inputs = block.querySelectorAll('input, select');
        inputs.forEach((input, index) => {
            data.inputs[index] = input.tagName === 'INPUT' ? input.value : input.value;
        });

        // Рекурсивно сохраняем вложенные блоки (в телах if, loop, else)
        const loopBody = block.querySelector('.loop-body');
        const ifBody = block.querySelector('.if-body');
        const elseBody = block.querySelector('.else-body');

        if (loopBody) {
            const loopBlocks = Array.from(loopBody.querySelectorAll(':scope > .workspace-block'));
            loopBlocks.forEach(b => { if (!b.dataset.id) b.dataset.id = generateId(); });
            
            data.loopBody = loopBlocks.map((child, i) => {
                const nextInLoop = i < loopBlocks.length - 1 ? loopBlocks[i + 1] : null;
                return {
                    id: child.dataset.id,
                    nextBlockId: nextInLoop ? nextInLoop.dataset.id : null,
                    type: child.dataset.type,
                    x: parseFloat(child.style.left) || 0,
                    y: parseFloat(child.style.top) || 0,
                    inputs: Object.fromEntries(
                        Array.from(child.querySelectorAll('input, select')).map((inp, j) => [j, inp.value])
                    )
                };
            });
        }

        if (ifBody) {
            const ifBlocks = Array.from(ifBody.querySelectorAll(':scope > .workspace-block'));
            ifBlocks.forEach(b => { if (!b.dataset.id) b.dataset.id = generateId(); });
            
            data.ifBody = ifBlocks.map((child, i) => {
                const nextInIf = i < ifBlocks.length - 1 ? ifBlocks[i + 1] : null;
                return {
                    id: child.dataset.id,
                    nextBlockId: nextInIf ? nextInIf.dataset.id : null,
                    type: child.dataset.type,
                    x: parseFloat(child.style.left) || 0,
                    y: parseFloat(child.style.top) || 0,
                    inputs: Object.fromEntries(
                        Array.from(child.querySelectorAll('input, select')).map((inp, j) => [j, inp.value])
                    )
                };
            });
        }

        if (elseBody) {
            const elseBlocks = Array.from(elseBody.querySelectorAll(':scope > .workspace-block'));
            elseBlocks.forEach(b => { if (!b.dataset.id) b.dataset.id = generateId(); });
            
            data.elseBody = elseBlocks.map((child, i) => {
                const nextInElse = i < elseBlocks.length - 1 ? elseBlocks[i + 1] : null;
                return {
                    id: child.dataset.id,
                    nextBlockId: nextInElse ? nextInElse.dataset.id : null,
                    type: child.dataset.type,
                    x: parseFloat(child.style.left) || 0,
                    y: parseFloat(child.style.top) || 0,
                    inputs: Object.fromEntries(
                        Array.from(child.querySelectorAll('input, select')).map((inp, j) => [j, inp.value])
                    )
                };
            });
        }

        return data;
    });
}

/**
 * Создаёт блок из сериализованных данных
 */
function deserializeBlock(data, isNested = false) {
    const block = createWorkspaceBlock(data.type);
    
    // Сохраняем ID
    block.dataset.id = data.id;
    if (data.nextBlockId) {
        block.dataset.nextBlockId = data.nextBlockId;
    }
    
    if (!isNested) {
        block.style.left = data.x + 'px';
        block.style.top = data.y + 'px';
    }

    // Восстанавливаем значения input и select
    const inputs = block.querySelectorAll('input, select');
    Object.entries(data.inputs || {}).forEach(([index, value]) => {
        if (inputs[index]) inputs[index].value = value;
    });

    return block;
}

/**
 * Сохраняет программу в JSON файл
 */
function saveProgram() {
    const programData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        blocks: serializeProgram()
    };

    const json = JSON.stringify(programData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'program.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logToConsole('✓ Программа сохранена в program.json');
}

/**
 * Загружает программу из JSON файла
 */
function loadProgram(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const programData = JSON.parse(e.target.result);
            
            if (!programData.blocks || !Array.isArray(programData.blocks)) {
                throw new Error('Неверный формат файла');
            }

            // Очищаем текущий workspace
            canvas.querySelectorAll('.workspace-block').forEach(b => b.remove());

            // Восстанавливаем блоки
            programData.blocks.forEach(blockData => {
                const block = deserializeBlock(blockData);
                canvas.appendChild(block);

                // Восстанавливаем вложенные блоки
                if (blockData.loopBody) {
                    const loopBody = block.querySelector('.loop-body');
                    blockData.loopBody.forEach(childData => {
                        loopBody.appendChild(deserializeBlock(childData, true));
                    });
                }

                if (blockData.ifBody) {
                    const ifBody = block.querySelector('.if-body');
                    blockData.ifBody.forEach(childData => {
                        ifBody.appendChild(deserializeBlock(childData, true));
                    });
                }

                if (blockData.elseBody) {
                    const elseBody = block.querySelector('.else-body');
                    blockData.elseBody.forEach(childData => {
                        elseBody.appendChild(deserializeBlock(childData, true));
                    });
                }
            });

            updatePlaceholderVisibility();
            updateLoopBodyHints();
            logToConsole(`✓ Программа загружена: ${programData.blocks.length} блоков`);
            
        } catch (err) {
            logToConsole('✕ Ошибка загрузки: ' + err.message, true);
        }
    };

    reader.readAsText(file);
}

// Обработчики кнопок сохранения и импорта
if (saveBtn) saveBtn.addEventListener('click', saveProgram);

if (importBtn) {
    importBtn.addEventListener('click', () => importFileInput.click());
}

if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadProgram(file);
            e.target.value = ''; // Сброс для повторной загрузки
        }
    });
}

// ============================================================================
// ЗАПУСК ПРОГРАММЫ
// ============================================================================

runBtn.addEventListener('click', () => {
    clearConsole();
    clearErrorHighlight();

    // Check-review перед запуском
    const review = checkReview();
    
    if (!review.valid) {
        logToConsole('✕ Ошибки валидации:', true);
        review.errors.forEach(err => logToConsole('  • ' + err, true));
        if (review.warnings.length > 0) {
            logToConsole('Предупреждения:');
            review.warnings.forEach(warn => logToConsole('  • ' + warn));
        }
        return;
    }

    if (review.warnings.length > 0) {
        logToConsole('⚠ Предупреждения:');
        review.warnings.forEach(warn => logToConsole('  • ' + warn));
    }

    logToConsole('▶ Начало выполнения...');
    
    const vars = { _arrays: {} };
    
    try {
        const blocks = Array.from(canvas.querySelectorAll(':scope > .workspace-block'));
        executeBlockList(blocks, vars);
        logToConsole('■ Выполнение завершено.');
        logToConsole('Переменные: ' + JSON.stringify(vars));
    } catch (e) {
        logToConsole('✕ Ошибка: ' + e.message, true);
        const errorBlock = findErrorBlock(e);
        if (errorBlock) highlightBlockError(errorBlock);
    }
});
