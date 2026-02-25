// --- 1. ЛОГИКА DRAG & DROP ---
let draggedEl = null;
let isClone = false;

document.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("block")) {
        draggedEl = e.target;
        // Если тянем из палитры - это клон. Если из рабочей области - перемещение.
        isClone = e.target.closest(".sidebar") !== null;
        e.dataTransfer.effectAllowed = "move";
    }
});

document.addEventListener("dragover", (e) => {
    e.preventDefault(); // Разрешаем Drop
    const target = e.target;
    // Подсвечиваем зону, если это drop-zone и мы не тянем над самим собой
    if (target.classList.contains("drop-zone") && !target.contains(draggedEl)) {
        target.classList.add("drag-over");
    }
});

document.addEventListener("dragleave", (e) => {
    if (e.target.classList.contains("drop-zone")) {
        e.target.classList.remove("drag-over");
    }
});

document.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target;
    target.classList.remove("drag-over");

    if (target.classList.contains("drop-zone") && draggedEl) {
        // Если перетаскивали из меню - клонируем
        let node = isClone ? draggedEl.cloneNode(true) : draggedEl;

        // Если это блок управления (if/while), убеждаемся, что внутри есть зоны
        // (при клонировании они могут быть пустыми, добавим логику очистки)
        if (isClone && node.classList.contains('control')) {
            // Очищаем innerHTML зон при создании шаблона, если нужно,
            // но в HTML они уже пустые. Если перемещаем - оставляем как есть.
        }

        target.appendChild(node);
        clearErrors(); // Сброс ошибок при изменении структуры
    }
});

// Обработчики кнопок
document.getElementById('btn-run').addEventListener('click', runAlgorithm);
document.getElementById('btn-clear').addEventListener('click', () => {
    document.getElementById('root-zone').innerHTML = '';
    log("Рабочая область очищена.", false);
});
document.getElementById('btn-clear').addEventListener('click', clearErrors);


// --- 2. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (UI) ---
const log = (msg, isError = false) => {
    const out = document.getElementById('output');
    const div = document.createElement('div');
    div.style.color = isError ? '#f55' : '#0f0';
    div.textContent = (isError ? "ОШИБКА: " : "") + msg;
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
};

const clearErrors = () => {
    document.querySelectorAll('.error-highlight').forEach(el => el.classList.remove('error-highlight'));
    document.getElementById('output').innerHTML = '';
};

const highlightError = (block, msg) => {
    if (block) block.classList.add('error-highlight');
    log(msg, true);
    throw new Error(msg); // Останавливаем выполнение
};

// --- 3. ИНТЕРПРЕТАТОР ---

// Контекст выполнения (память)
class Context {
    constructor(parent = null) {
        this.vars = {}; // {name: value}
        this.arrays = {}; // {name: [v1, v2...]}
        this.parent = parent;
    }

    getVar(name) {
        if (name in this.vars) return this.vars[name];
        if (this.parent) return this.parent.getVar(name);
        return undefined;
    }

    setVar(name, val) {
        // Если переменная существует где-то выше, обновляем её
        if (this.parent && this.parent.getVar(name) !== undefined) {
            this.parent.setVar(name, val);
        } else {
            // Иначе создаем/обновляем в текущем контексте
            this.vars[name] = val;
        }
    }
}

// --- ПАРСЕР ВЫРАЖЕНИЙ ---
// Простой рекурсивный спуск для математики и логики.
// Поддерживает: +, -, *, /, %, (), >, <, =, !=, &&, ||, !

function parseExpression(text, context, block) {
    if (!text && text !== 0) return 0;
    text = String(text).trim();
    if (!text) return 0;

    // Логические операторы (низкий приоритет)
    // Простой парсер: разбиваем по операторам, учитывая скобки
    try {
        return parseLogicalOr(text, context);
    } catch (e) {
        highlightError(block, `Ошибка в выражении "${text}": ${e.message}`);
    }
}

function parseLogicalOr(text, ctx) {
    // Ищем '||' не внутри скобок
    let balance = 0;
    for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] === ')') balance++;
        if (text[i] === '(') balance--;
        if (balance === 0 && text.substr(i, 2) === '||') {
            return parseLogicalOr(text.substring(0, i), ctx) || parseLogicalAnd(text.substring(i + 2), ctx);
        }
    }
    return parseLogicalAnd(text, ctx);
}

function parseLogicalAnd(text, ctx) {
    let balance = 0;
    for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] === ')') balance++;
        if (text[i] === '(') balance--;
        if (balance === 0 && text.substr(i, 2) === '&&') {
            return parseLogicalAnd(text.substring(0, i), ctx) && parseLogicalNot(text.substring(i + 2), ctx);
        }
    }
    return parseLogicalNot(text, ctx);
}

function parseLogicalNot(text, ctx) {
    text = text.trim();
    if (text.startsWith('!')) {
        return !parseLogicalNot(text.substring(1), ctx);
    }
    return parseComparison(text, ctx);
}

function parseComparison(text, ctx) {
    // Операторы сравнения
    const ops = ['==', '!=', '>=', '<=', '>', '<'];
    // Порядок важен: >= перед >
    // Сканируем слева направо (для правильной ассоциативности в данном случае простого сравнения)
    // Но логичнее искать последний оператор низкого приоритета, тут неважно.

    // Ищем оператор не внутри скобок
    let balance = 0;
    // Идем слева направо, чтобы найти ПЕРВЫЙ оператор (для выражений типа a < b < c - нестандартно, но возьмем первый)
    // Или лучше разбить на левую и правую часть.

    // Упрощенный поиск: проходим по строке
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '(') balance++;
        else if (char === ')') balance--;
        else if (balance === 0) {
            for (let op of ops) {
                if (text.substr(i, op.length) === op) {
                    let left = parseMathAddSub(text.substring(0, i), ctx);
                    let right = parseMathAddSub(text.substring(i + op.length), ctx);

                    if (op === '>') return left > right;
                    if (op === '<') return left < right;
                    if (op === '>=') return left >= right;
                    if (op === '<=') return left <= right;
                    if (op === '==') return left == right;
                    if (op === '!=') return left != right;
                }
            }
        }
    }
    // Если сравнения нет, идем дальше
    return parseMathAddSub(text, ctx);
}

// Математика: Сложение/Вычитание
function parseMathAddSub(text, ctx) {
    let balance = 0;
    // Идем справа налево для лево-ассоциативности (a-b-c = (a-b)-c)
    for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] === ')') balance++;
        if (text[i] === '(') balance--;
        if (balance === 0) {
            let op = text[i];
            if (op === '+' || op === '-') {
                // Унарный минус: если в начале или после оператора
                if (i === 0) break;
                let left = parseMathAddSub(text.substring(0, i), ctx);
                let right = parseMathMulDiv(text.substring(i + 1), ctx);
                return op === '+' ? left + right : left - right;
            }
        }
    }
    return parseMathMulDiv(text, ctx);
}

// Математика: Умножение/Деление/Остаток
function parseMathMulDiv(text, ctx) {
    let balance = 0;
    for (let i = text.length - 1; i >= 0; i--) {
        if (text[i] === ')') balance++;
        if (text[i] === '(') balance--;
        if (balance === 0) {
            let op = text[i];
            if (op === '*' || op === '/' || op === '%') {
                let left = parseMathMulDiv(text.substring(0, i), ctx);
                let right = parseMathPrimary(text.substring(i + 1), ctx);
                if (op === '*') return left * right;
                if (op === '/') return Math.floor(left / right); // Целочисленное деление
                if (op === '%') return left % right;
            }
        }
    }
    return parseMathPrimary(text, ctx);
}

// Первичные значения: числа, переменные, массивы, скобки
function parseMathPrimary(text, ctx) {
    text = text.trim();
    if (text.startsWith('(') && text.endsWith(')')) {
        return parseExpression(text.substring(1, text.length - 1), ctx);
    }

    // Число
    if (!isNaN(text)) return parseInt(text);

    // Массив: arr[i]
    let matchArr = text.match(/^(\w+)\[(.+)\]$/);
    if (matchArr) {
        let name = matchArr[1];
        let index = parseExpression(matchArr[2], ctx);
        // Поиск в контексте
        let obj = ctx.arrays[name];
        if (ctx.parent && obj === undefined) obj = ctx.parent.arrays[name]; // поиск выше (не реализовано полно, но для примера ок)

        // Глобальный поиск (упрощение)
        let curr = ctx;
        while(curr) {
            if (curr.arrays[name]) {
                if(index < 0 || index >= curr.arrays[name].length) throw new Error(`Индекс ${index} вне границ массива ${name}`);
                return curr.arrays[name][index];
            }
            curr = curr.parent;
        }
        throw new Error(`Массив ${name} не найден`);
    }

    // Переменная
    let val = ctx.getVar(text);
    if (val === undefined) throw new Error(`Переменная ${text} не объявлена`);
    return val;
}


// --- ИСПОЛНИТЕЛЬ АЛГОРИТМА ---

async function executeBlock(block, context) {
    let type = block.dataset.type;

    // Визуализация выполнения (подсветка)
    block.style.boxShadow = "0 0 10px blue";
    await new Promise(r => setTimeout(r, 50)); // Маленькая задержка для анимации
    block.style.boxShadow = "";

    if (type === 'var_decl') {
        let input = block.querySelector('.var-names').value;
        if(!input) highlightError(block, "Не указаны имена переменных");
        let names = input.split(',').map(s => s.trim());
        names.forEach(n => {
            if(!n) highlightError(block, "Пустое имя переменной");
            context.vars[n] = 0;
        });
    }
    else if (type === 'arr_decl') {
        let name = block.querySelector('.arr-name').value.trim();
        let size = parseInt(block.querySelector('.arr-size').value);
        if(!name) highlightError(block, "Не указано имя массива");
        if(isNaN(size) || size <= 0) highlightError(block, "Некорректный размер массива");
        context.arrays[name] = new Array(size).fill(0);
    }
    else if (type === 'assign') {
        let targetRaw = block.querySelector('.target-var').value.trim();
        let exprRaw = block.querySelector('.expression').value.trim();

        // Разбор цели (переменная или элемент массива)
        let isArr = targetRaw.match(/(.+)\[(.+)\]/);
        let targetName, index = null;

        if (isArr) {
            targetName = isArr[1].trim();
            index = parseExpression(isArr[2], context, block);
        } else {
            targetName = targetRaw;
        }

        let val = parseExpression(exprRaw, context, block);

        // Присваивание
        if (isArr) {
            if (!context.arrays[targetName] && (!context.parent || !context.parent.arrays[targetName]))
                highlightError(block, `Массив ${targetName} не объявлен`);
            // Ищем где массив
            let ctx = context;
            while(ctx) { if(ctx.arrays[targetName]) { ctx.arrays[targetName][index] = val; break; } ctx = ctx.parent; }
        } else {
            if (context.getVar(targetName) === undefined && !context.vars.hasOwnProperty(targetName))
                highlightError(block, `Переменная ${targetName} не объявлена`);
            context.setVar(targetName, val);
        }
        log(`[${targetRaw}] = ${val}`);
    }
    else if (type === 'if' || type === 'if_else') {
        let condRaw = block.querySelector('.condition').value;
        let cond = parseExpression(condRaw, context, block);

        if (cond) {
            let body = block.querySelector('.body');
            await executeSequence(body.children, context);
        } else if (type === 'if_else') {
            let elseBody = block.querySelector('.else-body');
            await executeSequence(elseBody.children, context);
        }
    }
    else if (type === 'while') {
        let condRaw = block.querySelector('.condition').value;
        let safetyCounter = 0; // Защита от бесконечного цикла
        while (parseExpression(condRaw, context, block)) {
            let body = block.querySelector('.body');
            await executeSequence(body.children, new Context(context)); // Новый scope для тела (опционально)

            safetyCounter++;
            if (safetyCounter > 10000) highlightError(block, "Превышен лимит итераций цикла (10000)");
        }
    }
    else if (type === 'for') {
        // Цикл For: Инициализация; Условие; Итератор
        let initBlock = { dataset: { type: 'assign' }, querySelector: (s) => {
                if(s === '.target-var') return { value: block.querySelector('.init').value.split('=')[0].trim() };
                if(s === '.expression') return { value: block.querySelector('.init').value.split('=')[1].trim() };
            }};
        await executeBlock(initBlock, context); // Init

        let condRaw = block.querySelector('.condition').value;
        let iterRaw = block.querySelector('.iter').value;

        let safetyCounter = 0;
        while (parseExpression(condRaw, context, block)) {
            let body = block.querySelector('.body');
            await executeSequence(body.children, new Context(context));

            // Выполнение итератора (упрощенно - можно распарсить как присваивание или инкремент)
            // Для простоты парсим "i = i + 1" или "i++"
            if (iterRaw.includes('++')) {
                let v = iterRaw.replace('++', '').trim();
                context.setVar(v, context.getVar(v) + 1);
            } else if (iterRaw.includes('--')) {
                let v = iterRaw.replace('--', '').trim();
                context.setVar(v, context.getVar(v) - 1);
            } else if (iterRaw.includes('=')) {
                // Полное выражение присваивания
                let parts = iterRaw.split('=');
                let target = parts[0].trim();
                let val = parseExpression(parts[1], context, block);
                context.setVar(target, val);
            }

            safetyCounter++;
            if (safetyCounter > 10000) highlightError(block, "Превышен лимит итераций цикла (10000)");
        }
    }
}

async function executeSequence(blocks, context) {
    // blocks - это HTMLCollection, нужно конвертировать в массив, так как DOM может меняться
    let arr = Array.from(blocks);
    for (let block of arr) {
        if (block.classList.contains('block')) {
            await executeBlock(block, context);
        }
    }
}

function runAlgorithm() {
    clearErrors();
    log("--- Запуск программы ---");

    const root = document.getElementById('root-zone');
    const blocks = root.querySelectorAll(':scope > .block'); // Только прямые потомки

    const globalContext = new Context();

    // Запуск асинхронной цепочки
    executeSequence(blocks, globalContext).then(() => {
        log("--- Завершено ---");
        log(`Итоговые переменные: ${JSON.stringify(globalContext.vars)}`);
        log(`Итоговые массивы: ${JSON.stringify(globalContext.arrays)}`);
    }).catch(err => {
        // Ошибка уже подсвечена
    });
}