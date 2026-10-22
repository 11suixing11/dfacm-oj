'use strict';

const { mountProvider } = require('./provider.js');

function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function icon(document, path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('class', 'dfacm-assistant__icon');
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shape.setAttribute('d', path);
    svg.append(shape);
    return svg;
}

function mountAssistant({ document, config, fetchImpl = globalThis.fetch, sleep, storage, clipboard } = {}) {
    if (!config?.endpoint || !config.csrf || !['problem', 'record'].includes(config.page)) return null;
    const existing = document.getElementById('dfacm-assistant');
    if (existing) return existing;
    const host = document.querySelector('.main .row .medium-9') || document.querySelector('.main .row .large-9')
        || document.querySelector('.main .row .columns') || document.querySelector('.main .row') || document.querySelector('.main');
    if (!host) return null;
    const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const panel = element(document, 'section', 'dfacm-assistant');
    panel.id = 'dfacm-assistant';
    panel.hidden = true;
    panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'dfacm-assistant-title');
    panel.setAttribute('data-window-state', 'closed');
    const header = element(document, 'div', 'dfacm-assistant__header');
    const grabber = element(document, 'div', 'dfacm-assistant__grabber');
    grabber.setAttribute('aria-hidden', 'true');
    const heading = element(document, 'div', 'dfacm-assistant__title');
    const mark = element(document, 'span', 'dfacm-assistant__mark');
    mark.append(icon(document, 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16'));
    const titleCopy = element(document, 'div', 'dfacm-assistant__title-copy');
    const title = element(document, 'h2', '', '题目助手');
    title.id = 'dfacm-assistant-title';
    const pageTitle = document.querySelector('.main h1.section__title') || document.querySelector('.main h1');
    const contextText = config.page === 'record' ? '当前提交 · 代码诊断' : pageTitle?.textContent?.replace(/\s+/g, ' ').trim() || '当前题目';
    const context = element(document, 'span', 'dfacm-assistant__context', contextText);
    context.title = contextText;
    titleCopy.append(title, context);
    heading.append(mark, titleCopy);
    const controls = element(document, 'div', 'dfacm-assistant__window-controls');
    const minimize = element(document, 'button');
    const close = element(document, 'button');
    minimize.append(icon(document, 'M5 12h14'));
    close.append(icon(document, 'm6 6 12 12M6 18 18 6'));
    for (const [button, action, label] of [[minimize, 'minimize', '收起窗口'], [close, 'close', '关闭窗口']]) {
        button.type = 'button';
        button.setAttribute('data-window-action', action);
        button.setAttribute('aria-label', label);
        button.title = label;
    }
    controls.append(minimize, close);
    header.append(heading, controls);
    const content = element(document, 'div', 'dfacm-assistant__body');
    content.hidden = true;
    const intro = element(document, 'div', 'dfacm-assistant__intro');
    intro.append(element(document, 'h3', '', config.page === 'problem' ? '这道题卡在哪里？' : '诊断这份提交'));
    const subtitle = element(document, 'p', 'dfacm-assistant__subtitle', config.page === 'problem'
        ? '先选需要的帮助，再点击生成。' : '使用这条评测记录的原始代码和结果。');
    subtitle.id = 'dfacm-assistant-description';
    panel.setAttribute('aria-describedby', subtitle.id);
    intro.append(subtitle);
    const actions = element(document, 'div', 'dfacm-assistant__actions');
    function action(mode, label, description, path) {
        const button = element(document, 'button', 'dfacm-assistant__action');
        button.type = 'button';
        button.setAttribute('data-assistant-mode', mode);
        button.setAttribute('aria-label', label);
        const symbol = element(document, 'span', 'dfacm-assistant__action-icon');
        symbol.append(icon(document, path));
        const copy = element(document, 'span', 'dfacm-assistant__action-copy');
        copy.append(element(document, 'span', 'dfacm-assistant__action-label', label), element(document, 'span', 'dfacm-assistant__action-description', description));
        const arrow = element(document, 'span', 'dfacm-assistant__action-arrow');
        arrow.append(icon(document, 'm9 5 7 7-7 7'));
        button.append(symbol, copy, arrow);
        return button;
    }
    let selectedLevel = ['hint', 'approach', 'solution'].includes(config.defaultLevel) ? config.defaultLevel : 'hint';
    let selectedMode = config.page === 'record' ? 'debug' : 'solve';
    let selectedSource = config.page === 'record' ? 'record' : 'recent';
    let editorOpen = false;
    const levelNames = { hint: '给点提示', approach: '展开思路', solution: '完整题解' };
    const levelLabels = { hint: '提示', approach: '思路', solution: '完整题解' };
    const modes = element(document, 'div', 'dfacm-assistant__modes');
    modes.setAttribute('role', 'tablist'); modes.setAttribute('aria-label', '帮助类型');
    for (const [value, text] of [['solve', '题目讲解'], ['debug', '代码诊断']]) {
        const button = element(document, 'button', '', text); button.type = 'button';
        button.id = `dfacm-assistant-tab-${value}`; button.setAttribute('role', 'tab');
        button.setAttribute('data-assistant-view', value); button.setAttribute('aria-controls', 'dfacm-assistant-workspace');
        modes.append(button);
    }
    modes.hidden = config.page !== 'problem';
    const solve = action('solve', levelNames[selectedLevel], '从关键观察开始，也可直接查看完整题解', 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6');
    const debug = action('debug', '诊断代码', '定位错误，查看修改建议', 'm8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14');
    const manual = element(document, 'button', 'dfacm-assistant__text-button');
    manual.setAttribute('data-assistant-action', 'edit-code');
    const manualLabel = element(document, 'span', '', '粘贴代码');
    manual.append(icon(document, 'M8 5H5v16h14V5h-3M8 3h8v5H8V3Z'), manualLabel);
    for (const button of [solve, debug, manual]) button.type = 'button';
    solve.setAttribute('data-assistant-mode', 'solve');
    debug.setAttribute('data-assistant-mode', 'debug');
    if (config.page === 'problem') actions.append(solve, debug);
    else actions.append(debug);
    const levels = element(document, 'div', 'dfacm-assistant__levels');
    levels.setAttribute('role', 'group'); levels.setAttribute('aria-label', '帮助层级');
    for (const [value, text] of [['hint', '提示'], ['approach', '思路'], ['solution', '完整题解']]) {
        const button = element(document, 'button', '', text); button.type = 'button';
        button.setAttribute('data-assistant-level', value); levels.append(button);
    }
    levels.hidden = config.page !== 'problem';
    const sources = element(document, 'div', 'dfacm-assistant__sources');
    sources.setAttribute('role', 'group'); sources.setAttribute('aria-label', '诊断代码来源');
    for (const [value, text] of [['recent', '最近失败提交'], ['manual', '粘贴代码']]) {
        const button = element(document, 'button', '', text); button.type = 'button';
        button.setAttribute('data-assistant-source', value); sources.append(button);
    }
    sources.hidden = true;
    const sourceHelp = element(document, 'p', 'dfacm-assistant__source-help'); sourceHelp.hidden = true;
    const actionRow = element(document, 'div', 'dfacm-assistant__action-row');
    const refresh = element(document, 'button', 'dfacm-assistant__refresh', '重新请求'); refresh.type = 'button';
    refresh.setAttribute('data-assistant-action', 'refresh'); refresh.hidden = true;
    refresh.title = '按当前账户配置请求，OJ 可能复用短时缓存';
    actionRow.append(actions, refresh);
    const utility = element(document, 'div', 'dfacm-assistant__utility');
    if (config.page === 'problem') utility.append(manual);
    else utility.hidden = true;
    const editor = element(document, 'div', 'dfacm-assistant__editor');
    editor.id = 'dfacm-assistant-editor';
    editor.hidden = true;
    manual.setAttribute('aria-controls', editor.id);
    manual.setAttribute('aria-expanded', 'false');
    const label = element(document, 'label', '', '你的 C++ 代码');
    const textarea = element(document, 'textarea');
    textarea.id = 'dfacm-assistant-code';
    textarea.spellcheck = false;
    textarea.rows = 8;
    textarea.placeholder = '粘贴原始代码，空行也会保留。';
    label.htmlFor = textarea.id;
    const verdictLabel = element(document, 'label', '', '评测结果');
    const verdict = element(document, 'select');
    verdict.id = 'dfacm-assistant-verdict';
    verdictLabel.htmlFor = verdict.id;
    for (const [value, text] of [['UNKNOWN', '还没评测'], ['WA', 'WA · 答案错误'], ['CE', 'CE · 编译错误'], ['TLE', 'TLE · 超时'], ['RE', 'RE · 运行错误'], ['MLE', 'MLE · 内存超限'], ['OLE', 'OLE · 输出超限']]) {
        const option = element(document, 'option', '', text);
        option.value = value;
        verdict.append(option);
    }
    verdict.querySelector('option[value="UNKNOWN"]').selected = true;
    const diagnosticHelp = element(document, 'p', 'dfacm-assistant__field-help');
    const compilerEditor = element(document, 'div', 'dfacm-assistant__compiler-editor'); compilerEditor.hidden = true;
    const compilerLabel = element(document, 'label', '', '编译日志（可选）');
    const compiler = element(document, 'textarea'); compiler.id = 'dfacm-assistant-compiler'; compiler.rows = 4;
    compiler.spellcheck = false; compiler.placeholder = '粘贴评测返回的编译错误，便于定位首个根因。'; compilerLabel.htmlFor = compiler.id;
    compilerEditor.append(compilerLabel, compiler);
    editor.append(label, textarea, verdictLabel, verdict, diagnosticHelp, compilerEditor);
    function updateVerdict() {
        compilerEditor.hidden = verdict.value !== 'CE';
        diagnosticHelp.textContent = { WA: '重点检查逻辑与边界，并尝试构造小反例。', CE: '优先结合编译日志检查语法及原代码行号。',
            TLE: '重点检查复杂度、循环终止与输入输出。', RE: '重点检查越界、除零和运行时异常。',
            MLE: '重点检查内存占用。', OLE: '重点检查输出规模与循环。', UNKNOWN: '先做静态分析，发现问题后给出对应依据。' }[verdict.value] || '';
    }
    verdict.addEventListener('change', updateVerdict); updateVerdict();
    const status = element(document, 'p', 'dfacm-assistant__status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const errorActions = element(document, 'div', 'dfacm-assistant__error-actions'); errorActions.hidden = true;
    const checkSettings = element(document, 'button', 'dfacm-assistant__error-settings', '检查 AI 设置'); checkSettings.type = 'button';
    checkSettings.setAttribute('data-assistant-action', 'check-settings'); errorActions.append(checkSettings);
    const result = element(document, 'div', 'dfacm-assistant__result');
    const empty = element(document, 'div', 'dfacm-assistant__empty');
    const emptyTitle = element(document, 'h3'); const emptyText = element(document, 'p');
    empty.append(emptyTitle, emptyText);
    const live = element(document, 'div', 'dfacm-assistant__live'); live.hidden = true;
    live.setAttribute('aria-label', '正在生成的答案预览');
    const liveLabel = element(document, 'p', 'dfacm-assistant__live-label', '答案正在生成，完成后可查看全部内容');
    live.append(liveLabel);
    const toolbar = element(document, 'div', 'dfacm-assistant__toolbar');
    const taskBar = element(document, 'div', 'dfacm-assistant__task-bar'); taskBar.hidden = true;
    const taskCaption = element(document, 'span'); taskCaption.setAttribute('aria-live', 'polite');
    const taskLink = element(document, 'button', 'dfacm-assistant__text-button'); taskLink.type = 'button';
    taskLink.setAttribute('data-assistant-action', 'view-task'); taskBar.append(taskCaption, taskLink);
    toolbar.append(intro, modes, levels, sources, sourceHelp, actionRow, utility, taskBar);
    content.id = 'dfacm-assistant-workspace'; content.setAttribute('role', 'tabpanel');
    content.append(editor, status, errorActions, empty, live, result);
    const provider = mountProvider({
        document, scope: config.userScope, storage, icon: (path) => icon(document, path),
        endpoint: config.accountConfig, settingsUrl: config.accountSettings, fetchImpl,
        onChange: () => { updateToggle(); },
    });
    controls.prepend(provider.button);
    const settingsBody = element(document, 'div', 'dfacm-assistant__body dfacm-assistant__settings-body');
    settingsBody.hidden = true;
    const settingsBack = element(document, 'button', 'dfacm-assistant__back', '返回题目助手'); settingsBack.type = 'button';
    settingsBack.setAttribute('data-assistant-action', 'back-settings');
    settingsBody.append(settingsBack, provider.view);
    const footer = element(document, 'div', 'dfacm-assistant__footer');
    const tag = element(document, 'span', 'dfacm-assistant__tag', 'AI 辅助');
    const keyboard = element(document, 'span', 'dfacm-assistant__keyboard');
    keyboard.append(element(document, 'kbd', '', 'Esc'), element(document, 'span', '', '关闭'));
    const usage = element(document, 'span', 'dfacm-assistant__usage'); usage.hidden = true;
    footer.append(tag, usage, keyboard);
    panel.append(grabber, header, toolbar, content, settingsBody, footer);
    const backdrop = element(document, 'div', 'dfacm-assistant-backdrop'); backdrop.hidden = true; backdrop.setAttribute('aria-hidden', 'true');
    document.body.append(backdrop);
    document.body.append(panel);
    const toggle = element(document, 'button', 'dfacm-assistant-toggle');
    toggle.id = 'dfacm-assistant-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-haspopup', 'dialog');
    const toggleIcon = element(document, 'span', 'dfacm-assistant-toggle__icon');
    toggleIcon.append(icon(document, 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16'));
    const toggleLabel = element(document, 'span', '', '题目助手');
    const activity = element(document, 'span', 'dfacm-assistant-toggle__activity');
    activity.setAttribute('aria-hidden', 'true');
    activity.hidden = true;
    const arrow = element(document, 'span', 'dfacm-assistant-toggle__arrow');
    arrow.append(icon(document, 'm6 14 6-6 6 6'));
    toggle.append(toggleIcon, toggleLabel, activity, arrow);
    document.body.append(toggle);
    let busy = false;
    let disposed = false;
    let windowState = 'closed';
    let rememberedJob = null;
    let taskCacheHit = false;
    let elapsedTimer = null, elapsedStart = 0, lastElapsed = 0;
    const results = new Map();
    const errors = new Map();
    const positions = new Map();
    let displayedEntry = null;
    let taskDescriptor = null;
    let recoveryTask = null;
    let completedTask = null;
    let unreadResult = false;
    let activeJob = null;
    const window = document.defaultView;
    const mobileQuery = window?.matchMedia?.('(max-width: 640px)');
    let mobile = !!mobileQuery?.matches;
    const memoryKey = config.userScope ? `dfacm-assistant:${config.userScope}:${config.endpoint}` : `dfacm-assistant:${config.endpoint}`;

    function viewKey(mode = selectedMode, level = selectedLevel, source = selectedSource) {
        return mode === 'solve' ? `solve:${level}` : `debug:${source}`;
    }
    function manualSignature() {
        return JSON.stringify([textarea.value, verdict.value, verdict.value === 'CE' ? compiler.value : '']);
    }
    function currentEntry() {
        const entry = results.get(viewKey());
        return entry && (selectedSource !== 'manual' || selectedMode !== 'debug' || entry.signature === manualSignature()) ? entry : null;
    }
    function savePosition() {
        positions.set(viewKey(), content.scrollTop || 0);
        if (displayedEntry) displayedEntry.scrollTop = content.scrollTop || 0;
    }
    function taskName(task) {
        return task.mode === 'solve' ? levelLabels[task.level] : task.source === 'manual' ? '粘贴代码诊断' : task.source === 'record' ? '当前提交诊断' : '最近失败提交诊断';
    }
    function selectView(mode, { level = selectedLevel, source = selectedSource, edit } = {}) {
        if (disposed || config.page === 'record' && mode !== 'debug') return;
        savePosition();
        const sourceChanged = source !== selectedSource;
        selectedMode = mode;
        if (levelLabels[level]) selectedLevel = level;
        if (['recent', 'manual', 'record'].includes(source)) selectedSource = config.page === 'record' ? 'record' : source;
        if (typeof edit === 'boolean') editorOpen = edit;
        else if (mode === 'debug' && selectedSource === 'manual' && sourceChanged && !currentEntry()) editorOpen = true;
        if (currentEntry()) currentEntry().localReuse = true;
        panel.classList.remove('has-error');
        updateToggle();
        content.scrollTop = positions.get(viewKey()) || 0;
        if (displayedEntry) content.scrollTop = displayedEntry.scrollTop || 0;
        const entry = currentEntry();
        if (entry && !busy && !recoveryTask) {
            remember({ id: entry.job.id, mode, level: selectedLevel, source: selectedSource, cacheHit: entry.cacheHit, pending: false });
        } else if (rememberedJob) remember(rememberedJob);
    }
    function stageLabel(job, descriptor) {
        return { connecting: '等待供应商响应', generating: descriptor.mode === 'solve' ? `正在生成${levelLabels[descriptor.level]}` : '正在结合评测结果分析原始代码',
            template: '正在查阅算法模板', validating: '正在核对答案结构与原行号' }[job?.progress?.stage] || '正在生成答案';
    }
    function updateToggle() {
        tag.textContent = busy ? '正在生成' : provider.label;
        const key = viewKey(), entry = currentEntry(), error = errors.get(key);
        const viewingTask = busy && taskDescriptor?.key === key;
        textarea.disabled = verdict.disabled = compiler.disabled = busy || recoveryTask?.source === 'manual';
        if (displayedEntry !== entry) {
            if (displayedEntry) displayedEntry.scrollTop = content.scrollTop || 0;
            result.replaceChildren();
            if (entry) { result.append(entry.node); content.scrollTop = entry.scrollTop || 0; }
            displayedEntry = entry;
        }
        if (entry && entry.descriptor.key === key) positions.set(key, entry.scrollTop || 0);
        const hasResult = !!entry;
        editor.hidden = selectedMode !== 'debug' || selectedSource !== 'manual' || !editorOpen;
        result.hidden = !hasResult;
        empty.hidden = hasResult || viewingTask || !editor.hidden || !!error;
        if (!empty.hidden) {
            emptyTitle.textContent = selectedMode === 'solve' ? { hint: '从关键观察开始', approach: '展开算法思路', solution: '查看完整参考题解' }[selectedLevel] : '选择要诊断的代码';
            emptyText.textContent = selectedMode === 'solve' ? { hint: '先给提示，保留自己推导和写代码的空间。', approach: '解释算法步骤和正确性理由，暂不展示完整代码。', solution: '包含完整 C++、复杂度和点评。' }[selectedLevel] : selectedSource === 'record' ? '点击诊断，分析当前评测记录的原始代码。' : '点击诊断，读取你最近一次日常失败提交。';
        }
        panel.classList.toggle('has-result', hasResult);
        panel.classList.toggle('has-code', !editor.hidden);
        panel.classList.toggle('is-working', busy);
        panel.classList.toggle('is-settings', provider.isOpen);
        content.hidden = windowState !== 'open' || provider.isOpen;
        settingsBody.hidden = windowState !== 'open' || !provider.isOpen;
        toolbar.hidden = windowState !== 'open' || provider.isOpen;
        if (config.page === 'problem') content.setAttribute('aria-labelledby', `dfacm-assistant-tab-${selectedMode}`);
        else content.setAttribute('aria-label', '当前提交诊断');
        for (const button of modes.querySelectorAll('button')) {
            const chosen = button.getAttribute('data-assistant-view') === selectedMode;
            button.setAttribute('aria-selected', String(chosen)); button.tabIndex = chosen ? 0 : -1;
        }
        solve.hidden = selectedMode !== 'solve'; debug.hidden = selectedMode !== 'debug';
        levels.hidden = config.page !== 'problem' || selectedMode !== 'solve';
        for (const button of levels.querySelectorAll('button')) {
            const chosen = button.getAttribute('data-assistant-level') === selectedLevel;
            button.classList.toggle('is-active', chosen); button.setAttribute('aria-pressed', String(chosen)); button.disabled = false;
            button.setAttribute('data-generated', String(results.has(`solve:${button.getAttribute('data-assistant-level')}`)));
        }
        sources.hidden = config.page !== 'problem' || selectedMode !== 'debug';
        for (const button of sources.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.getAttribute('data-assistant-source') === selectedSource));
        sourceHelp.hidden = selectedMode !== 'debug';
        sourceHelp.textContent = selectedSource === 'manual' ? '诊断来源：粘贴的代码。收起输入后仍使用这份代码。' : selectedSource === 'record' ? '诊断来源：当前评测记录，使用原始代码和实际评测结果。' : '诊断来源：你最近一次日常失败提交；也可切换为粘贴代码。';
        const recover = recoveryTask?.key === key;
        const missingCode = error?.code === 'INPUT_REQUIRED' || error?.code === 'NO_CODE';
        const primary = recover ? '恢复原任务' : error && !missingCode ? '重试生成' : hasResult ? `查看${selectedMode === 'solve' ? levelLabels[selectedLevel] : '诊断结果'}`
            : selectedMode === 'solve' ? `生成${levelLabels[selectedLevel]}` : selectedSource === 'manual' ? '诊断粘贴代码' : selectedSource === 'record' ? '诊断当前提交' : '诊断最近失败提交';
        const primaryButton = selectedMode === 'solve' ? solve : debug;
        primaryButton.querySelector('.dfacm-assistant__action-label').textContent = viewingTask ? `${taskName(taskDescriptor)}生成中` : primary;
        primaryButton.setAttribute('aria-label', viewingTask ? `${taskName(taskDescriptor)}生成中` : primary);
        for (const button of [solve, debug]) button.disabled = (busy || !!recoveryTask) && !hasResult && !recover || viewingTask;
        refresh.hidden = !hasResult || !!error; refresh.disabled = busy || !!recoveryTask;
        manual.disabled = false;
        manualLabel.textContent = selectedMode === 'debug' && selectedSource === 'manual' ? editorOpen ? '收起输入' : '编辑代码' : '粘贴代码';
        utility.hidden = config.page !== 'problem' || selectedMode === 'debug' && selectedSource !== 'manual';
        panel.classList.toggle('has-error', !!error);
        panel.classList.toggle('is-compact', hasResult || busy || !editor.hidden || !!error);
        intro.hidden = hasResult || busy || !editor.hidden || !!error;
        manual.setAttribute('aria-expanded', String(!editor.hidden));
        const state = busy ? 'busy' : (recoveryTask || error || completedTask?.failed && unreadResult) ? 'error' : results.size ? 'ready' : 'idle';
        toggleLabel.textContent = busy ? '正在生成' : recoveryTask ? '恢复任务' : unreadResult ? completedTask?.failed ? '生成未完成' : '结果已就绪' : '题目助手';
        toggle.setAttribute('data-status', state);
        activity.hidden = state === 'idle';
        const label = windowState === 'open' ? '收起题目助手' : '展开题目助手';
        const statusLabel = state === 'busy' ? '，正在生成' : state === 'ready' ? '，结果已就绪' : state === 'error' ? '，请查看提示' : '';
        toggle.setAttribute('aria-label', label + statusLabel);
        toggle.title = label + statusLabel;
        status.textContent = viewingTask ? `${stageLabel(activeJob, taskDescriptor)}…${hasResult ? ' 下方保留上次答案。' : ' 可以收起窗口等待。'}` : error?.message || '';
        errorActions.hidden = viewingTask || !['AI_NOT_CONFIGURED', 'UPSTREAM_AUTH', 'UPSTREAM_CLIENT', 'UPSTREAM_CONFIG', 'UPSTREAM_MODEL_UNAVAILABLE', 'UPSTREAM_ERROR', 'INVALID_PROVIDER'].includes(error?.code);
        if (viewingTask) preview(activeJob || {}); else live.hidden = true;
        if (viewingTask && activeJob) displayUsage(activeJob);
        else if (error?.job) displayUsage(error.job);
        else if (entry) displayUsage(entry.job, { cacheHit: entry.cacheHit, localReuse: entry.localReuse });
        else usage.hidden = true;
        const notice = busy ? taskDescriptor : recoveryTask || completedTask;
        taskBar.hidden = !notice || notice.key === key;
        if (!taskBar.hidden) {
            taskCaption.textContent = busy ? `${taskName(notice)}正在生成，可继续查看已有答案。` : recoveryTask ? '原任务查询中断，可能仍在后台运行。' : `${taskName(notice)}${notice.failed ? '未完成' : '已就绪'}。`;
            taskLink.textContent = busy ? '查看进度' : recoveryTask ? '恢复原任务' : notice.failed ? '查看原因' : '查看结果';
        }
    }
    function setBusy(value) {
        busy = value;
        // Expanding or collapsing the window never starts or cancels a task.
        textarea.disabled = verdict.disabled = compiler.disabled = value;
        provider.setBusy(value);
        panel.setAttribute('aria-busy', String(value));
        updateToggle();
    }
    function remember(value) {
        rememberedJob = value;
        try {
            // Remember only public task/view metadata, never pasted code or credentials.
            value ? storage?.setItem(memoryKey, JSON.stringify({ ...value, windowState,
                view: { mode: selectedMode, level: selectedLevel, source: selectedSource } })) : storage?.removeItem(memoryKey);
        } catch { /* Storage is optional. */ }
    }
    function setWindowState(value) {
        windowState = value;
        panel.hidden = value !== 'open';
        content.hidden = value !== 'open';
        panel.setAttribute('data-window-state', value);
        toggle.classList.toggle('is-expanded', value === 'open');
        toggle.setAttribute('aria-expanded', String(value === 'open'));
        updateToggle();
        updateViewport();
        if (rememberedJob) remember(rememberedJob);
    }
    function updateViewport() {
        mobile = !!mobileQuery?.matches;
        const isModal = mobile && windowState === 'open';
        backdrop.hidden = !isModal;
        panel.setAttribute('aria-modal', String(isModal));
        document.body.classList.toggle('dfacm-assistant-drawer-open', isModal);
        toggle.hidden = isModal;
        const viewport = window?.visualViewport;
        if (mobile && viewport) {
            panel.style.setProperty('--assistant-viewport-height', `${viewport.height}px`);
            panel.style.setProperty('--assistant-viewport-bottom', `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
        }
    }
    mobileQuery?.addEventListener?.('change', updateViewport);
    window?.visualViewport?.addEventListener('resize', updateViewport);
    window?.visualViewport?.addEventListener('scroll', updateViewport);
    function openWindow() {
        if (disposed) return;
        if (unreadResult && completedTask && completedTask.key !== viewKey()) {
            selectView(completedTask.mode, { level: completedTask.level, source: completedTask.source });
        }
        unreadResult = false;
        setWindowState('open');
        panel.focus({ preventScroll: true });
    }
    function closeWindow(state = 'closed') {
        setWindowState(state);
        toggle.focus({ preventScroll: true });
    }
    function requestBody(mode) {
        const body = new URLSearchParams({ mode, csrf: config.csrf });
        if (mode === 'solve') body.set('level', selectedLevel);
        if (mode === 'debug' && selectedSource === 'manual' && config.page === 'problem') {
            body.set('code', textarea.value); body.set('verdict', verdict.value);
            if (verdict.value === 'CE' && compiler.value.trim()) body.set('compiler_output', compiler.value);
        }
        return body;
    }
    function displayUsage(job, { cacheHit = false, localReuse = false } = {}) {
        const parts = [];
        const reused = cacheHit || localReuse;
        if (localReuse) parts.push('本页已有结果，本次未请求模型');
        else if (cacheHit) parts.push('命中 OJ 缓存，本次未请求模型');
        if (Number.isFinite(job.elapsedMs)) parts.push(`${reused ? '原生成' : '耗时'} ${(job.elapsedMs / 1000).toFixed(1)}s`);
        const count = job.usage;
        if (count && Number.isSafeInteger(count.inputTokens) && Number.isSafeInteger(count.outputTokens)) {
            parts.push(`${reused ? '原用量 ' : ''}输入 ${count.inputTokens} / 输出 ${count.outputTokens} tokens`);
            if (count.cachedInputTokens > 0) parts.push(`上游缓存输入 ${count.cachedInputTokens}`);
        } else if (job.status === 'ready' || job.status === 'failed') parts.push('供应商未返回用量');
        usage.textContent = parts.join(' · '); usage.hidden = !parts.length;
    }
    function preview(job) {
        const value = job.progress?.preview || {};
        for (const [key, text] of [['meaning', '题目大意'], ['approach', selectedLevel === 'hint' ? '提示' : '思路'], ['summary', '诊断结论']]) {
            let part = live.querySelector(`[data-preview-part="${key}"]`);
            if (typeof value[key] !== 'string' || !value[key]) { part?.remove(); continue; }
            if (!part) {
                part = element(document, 'section', 'dfacm-assistant__part'); part.setAttribute('data-preview-part', key);
                part.append(element(document, 'h3', '', text), element(document, 'p', 'dfacm-assistant__preview-text'));
                live.append(part);
            }
            part.querySelector('p').textContent = value[key];
        }
        live.hidden = !live.querySelector('[data-preview-part]');
    }
    function display(job) {
        activeJob = job; lastElapsed = Number.isFinite(job.elapsedMs) ? job.elapsedMs : lastElapsed;
        elapsedStart = Date.now();
        if (job.status === 'failed') throw Object.assign(new Error(job.error?.message || '生成失败，请稍后重试。'), { code: job.error?.code, job });
        if (job.status !== 'ready') return false;
        if (typeof job.html !== 'string') throw Object.assign(new Error('结果不完整，请重试。'), { code: 'INVALID_RESULT' });
        // html is rendered by this OJ's server template with sanitized Markdown
        // and autoescaped source code, never by concatenating model strings.
        const descriptor = taskDescriptor;
        const node = element(document, 'div', 'dfacm-assistant__answer-snapshot'); node.innerHTML = job.html;
        for (const issue of job.answer?.issues || []) {
            for (const location of issue.locations) {
                for (let line = location.startLine; line <= location.endLine; line++) {
                    node.querySelector(`[data-source-line="${line}"]`)?.classList.add('is-issue');
                }
            }
        }
        if (displayedEntry) displayedEntry.scrollTop = content.scrollTop || 0;
        const scrollTop = descriptor.mode === 'solve' && descriptor.key === viewKey() && !displayedEntry ? content.scrollTop || 0 : 0;
        const entry = { job, node, cacheHit: !!job.cacheHit || taskCacheHit, localReuse: false, scrollTop, signature: descriptor.signature, descriptor: { ...descriptor } };
        results.set(descriptor.key, entry); errors.delete(descriptor.key);
        recoveryTask = null; completedTask = { ...descriptor };
        if (descriptor.mode === 'debug' && descriptor.source === 'manual' && descriptor.key === viewKey()) editorOpen = false;
        unreadResult = windowState !== 'open' || descriptor.key !== viewKey() || provider.isOpen;
        updateToggle();
        return true;
    }
    async function request(url, options = {}) {
        const response = await fetchImpl(url, { credentials: 'same-origin', ...options,
            cache: 'no-store', headers: { Accept: 'application/json', ...options.headers } });
        let payload;
        try { payload = await response.json(); }
        catch { throw Object.assign(new Error('会话或服务连接已中断，请刷新后重试。'), { code: 'CONNECTION_INTERRUPTED' }); }
        if (!response.ok || !payload.ok) throw Object.assign(new Error(payload.message || '请求失败，请稍后重试。'), { code: payload.code, httpStatus: response.status });
        return payload.job;
    }
    async function poll(job, descriptor) {
        taskCacheHit = !!job.cacheHit || taskCacheHit;
        descriptor.id = job.id;
        remember({ id: job.id, mode: descriptor.mode, level: descriptor.level, source: descriptor.source, cacheHit: taskCacheHit, pending: job.status === 'pending' });
        const deadline = Date.now() + 330000;
        while (!disposed && Date.now() < deadline) {
            if (display(job)) { remember({ id: job.id, mode: descriptor.mode, level: descriptor.level, source: descriptor.source, cacheHit: taskCacheHit, pending: false }); return; }
            updateToggle();
            await wait(1500);
            if (disposed) return;
            try { job = await request(`${config.endpoint}?job=${encodeURIComponent(job.id)}`); }
            catch (error) {
                if (!error.code && !error.httpStatus || error.code === 'CONNECTION_INTERRUPTED' || error.httpStatus >= 500) {
                    throw Object.assign(new Error('原任务查询中断，点击“恢复原任务”继续查看。'), { code: 'POLL_INTERRUPTED', resumable: true });
                }
                throw error;
            }
        }
        if (!disposed) throw Object.assign(new Error('等待时间较长，点击“恢复原任务”查询已有结果。'), { code: 'POLL_INTERRUPTED', resumable: true });
    }
    function showError(error) {
        const descriptor = taskDescriptor || { mode: selectedMode, level: selectedLevel, source: selectedSource, key: viewKey() };
        errors.set(descriptor.key, { message: error?.message || '生成失败，请稍后重试。', code: error?.code, job: error?.job });
        completedTask = { ...descriptor, failed: true };
        unreadResult = windowState !== 'open' || descriptor.key !== viewKey() || provider.isOpen;
        if (error?.resumable && descriptor.id) { recoveryTask = { ...descriptor }; remember({ ...rememberedJob, pending: true }); }
        else { recoveryTask = null; remember(null); }
        live.hidden = true;
        if (error?.code === 'AI_NOT_CONFIGURED' && config.accountSettings) provider.setOpen(true);
        if ((error?.code === 'NO_CODE' || /粘贴.*代码/.test(error?.message || '')) && config.page === 'problem') {
            selectedMode = 'debug'; selectedSource = 'manual'; editorOpen = true;
            errors.set(viewKey(), errors.get(descriptor.key));
            if (descriptor.key !== viewKey()) errors.delete(descriptor.key);
            completedTask = { ...descriptor, key: viewKey(), source: 'manual', failed: true };
            if (windowState === 'open') textarea.focus();
        }
        updateToggle();
    }
    function startElapsedTimer() {
        elapsedStart = Date.now(); lastElapsed = 0;
        clearInterval(elapsedTimer);
        elapsedTimer = setInterval(() => {
            if (!busy || disposed) return;
            const elapsedMs = lastElapsed + Date.now() - elapsedStart;
            if (taskDescriptor?.key === viewKey()) {
                if (activeJob?.usage) displayUsage({ ...activeJob, elapsedMs });
                else { usage.textContent = `已等待 ${(elapsedMs / 1000).toFixed(0)}s`; usage.hidden = false; }
            } else if (taskDescriptor) taskCaption.textContent = `${taskName(taskDescriptor)}正在生成 · 已等待 ${(elapsedMs / 1000).toFixed(0)}s`;
        }, 1000); elapsedTimer.unref?.();
    }
    function finishTask() {
        clearInterval(elapsedTimer); elapsedTimer = null;
        if (disposed) return;
        setBusy(false);
    }
    async function run(mode, { refresh: refreshRequested = false } = {}) {
        if (disposed || config.page === 'record' && mode !== 'debug') return;
        if (mode !== selectedMode) selectView(mode);
        if (!refreshRequested && recoveryTask?.key === viewKey()) return resumeTask();
        if (!refreshRequested && currentEntry() && !errors.has(viewKey())) {
            currentEntry().localReuse = true;
            if (selectedMode === 'debug' && selectedSource === 'manual') editorOpen = false;
            updateToggle(); return;
        }
        if (busy || recoveryTask) return;
        if (mode === 'debug' && selectedSource === 'manual' && !textarea.value.trim()) {
            editorOpen = true; errors.set(viewKey(), { message: '请先粘贴代码，或切换到“最近失败提交”。', code: 'INPUT_REQUIRED' });
            updateToggle(); textarea.focus({ preventScroll: true }); return;
        }
        const body = requestBody(mode);
        const headers = provider.apply(body);
        if (!headers) return;
        taskDescriptor = { mode, level: selectedLevel, source: selectedSource, key: viewKey(), signature: selectedSource === 'manual' && mode === 'debug' ? manualSignature() : null };
        errors.delete(taskDescriptor.key); recoveryTask = null; completedTask = null;
        taskCacheHit = false; activeJob = null;
        setBusy(true);
        live.hidden = true;
        for (const part of live.querySelectorAll('[data-preview-part]')) part.remove();
        usage.hidden = true; startElapsedTimer();
        try {
            await poll(await request(config.endpoint, { method: 'POST', body, headers }), taskDescriptor);
        }
        catch (error) { if (!disposed) showError(error); }
        finally { finishTask(); }
    }
    async function resumeTask() {
        if (!recoveryTask || busy || disposed) return;
        taskDescriptor = { ...recoveryTask };
        errors.delete(taskDescriptor.key); recoveryTask = null; taskCacheHit = false;
        setBusy(true); startElapsedTimer();
        try { await poll(await request(`${config.endpoint}?job=${encodeURIComponent(taskDescriptor.id)}`), taskDescriptor); }
        catch (error) {
            if (!error.code && !error.httpStatus || error.code === 'CONNECTION_INTERRUPTED' || error.httpStatus >= 500) error.resumable = true;
            if (!disposed) showError(error);
        } finally { finishTask(); }
    }
    toggle.addEventListener('click', () => {
        if (windowState === 'open') closeWindow('minimized');
        else openWindow();
    });
    minimize.addEventListener('click', () => closeWindow('minimized'));
    close.addEventListener('click', () => closeWindow());
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && mobile && !panel.hidden) {
            const nodes = [...panel.querySelectorAll('button,textarea,select,a[href]')].filter(node => !node.disabled && !node.closest('[hidden]') && node.getAttribute('tabindex') !== '-1');
            const first = nodes[0], last = nodes.at(-1);
            if (first && (event.shiftKey && (document.activeElement === first || document.activeElement === panel))) { event.preventDefault(); last.focus(); }
            else if (last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
        if (event.key !== 'Escape' || panel.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        if (provider.isOpen) { provider.setOpen(false); provider.button.focus({ preventScroll: true }); }
        else closeWindow();
    });
    backdrop.addEventListener('click', () => closeWindow('minimized'));
    let dragStart = null;
    grabber.addEventListener('pointerdown', event => { dragStart = event.clientY; grabber.setPointerCapture?.(event.pointerId); });
    grabber.addEventListener('pointerup', event => { if (mobile && dragStart !== null && event.clientY - dragStart > 55) closeWindow('minimized'); dragStart = null; });
    grabber.addEventListener('pointercancel', () => { dragStart = null; });
    function invokeRun(mode, options) {
        const running = busy;
        const operation = run(mode, options);
        if (!running) panel.task = operation;
    }
    solve.addEventListener('click', () => invokeRun('solve'));
    debug.addEventListener('click', () => invokeRun('debug'));
    modes.addEventListener('click', event => {
        const button = event.target.closest('[data-assistant-view]');
        if (button) selectView(button.getAttribute('data-assistant-view'));
    });
    modes.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const mode = event.key === 'Home' ? 'solve' : event.key === 'End' ? 'debug' : selectedMode === 'solve' ? 'debug' : 'solve';
        selectView(mode); modes.querySelector(`[data-assistant-view="${mode}"]`).focus({ preventScroll: true });
    });
    levels.addEventListener('click', event => {
        const button = event.target.closest('[data-assistant-level]');
        if (button) selectView('solve', { level: button.getAttribute('data-assistant-level') });
    });
    sources.addEventListener('click', event => {
        const button = event.target.closest('[data-assistant-source]');
        if (button) {
            selectView('debug', { source: button.getAttribute('data-assistant-source') });
            if (!editor.hidden) textarea.focus({ preventScroll: true });
        }
    });
    manual.addEventListener('click', () => {
        const sameManual = selectedMode === 'debug' && selectedSource === 'manual';
        selectView('debug', { source: 'manual', edit: sameManual ? !editorOpen : true });
        if (!editor.hidden) textarea.focus();
    });
    refresh.addEventListener('click', () => invokeRun(selectedMode, { refresh: true }));
    taskLink.addEventListener('click', () => {
        const target = busy ? taskDescriptor : recoveryTask || completedTask;
        if (!target) return;
        selectView(target.mode, { level: target.level, source: target.source });
        unreadResult = false;
        if (recoveryTask) panel.task = resumeTask();
    });
    settingsBack.addEventListener('click', () => { provider.setOpen(false); provider.button.focus({ preventScroll: true }); });
    checkSettings.addEventListener('click', () => { provider.setOpen(true); });
    for (const input of [textarea, verdict, compiler]) {
        input.addEventListener(input === verdict ? 'change' : 'input', () => {
            if (busy) return;
            errors.delete(viewKey('debug', selectedLevel, 'manual')); updateToggle();
        });
    }
    editor.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
            event.preventDefault(); invokeRun('debug');
        }
    });
    result.addEventListener('click', async (event) => {
        const jump = event.target.closest('[data-jump-line]');
        if (jump) {
            const row = result.querySelector(`[data-source-line="${jump.getAttribute('data-jump-line')}"]`);
            const details = row?.closest('details'); if (details) details.open = true;
            result.querySelector('.is-focused')?.classList.remove('is-focused');
            row?.classList.add('is-focused'); row?.focus?.({ preventScroll: true });
            row?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            return;
        }
        const copy = event.target.closest('[data-copy-solution],[data-copy-original]');
        if (!copy) return;
        const code = copy.hasAttribute('data-copy-original') ? displayedEntry?.job.source?.map(line => line.text).join('\n') : result.querySelector('[data-solution-code]')?.textContent;
        try {
            if (!clipboard?.writeText || !code) throw new Error('Clipboard unavailable');
            await clipboard.writeText(code);
            copy.textContent = '已复制';
        } catch { copy.textContent = '请选中代码复制'; }
    });
    panel.dispose = () => {
        disposed = true; clearInterval(elapsedTimer); provider.dispose();
        mobileQuery?.removeEventListener?.('change', updateViewport);
        window?.visualViewport?.removeEventListener('resize', updateViewport); window?.visualViewport?.removeEventListener('scroll', updateViewport);
        document.body.classList.remove('dfacm-assistant-drawer-open'); backdrop.remove();
        panel.remove(); toggle.remove();
    };
    setWindowState('closed');
    setBusy(false);
    try {
        const saved = JSON.parse(storage?.getItem(memoryKey) || 'null');
        if (saved && /^[a-f0-9]{32}$/.test(saved.id) && ['solve', 'debug'].includes(saved.mode)) {
            if (levelNames[saved.level]) selectedLevel = saved.level;
            selectedMode = config.page === 'record' ? 'debug' : saved.mode;
            selectedSource = config.page === 'record' ? 'record' : saved.source === 'manual' ? 'manual' : 'recent';
            taskDescriptor = { id: saved.id, mode: selectedMode, level: selectedLevel, source: selectedSource, key: viewKey(), signature: selectedSource === 'manual' ? manualSignature() : null };
            if (saved.view && ['solve', 'debug'].includes(saved.view.mode) && config.page === 'problem') {
                selectedMode = saved.view.mode;
                if (levelNames[saved.view.level]) selectedLevel = saved.view.level;
                if (['manual', 'recent'].includes(saved.view.source)) selectedSource = saved.view.source;
            }
            taskCacheHit = saved.cacheHit === true;
            rememberedJob = { id: saved.id, mode: saved.mode, level: taskDescriptor.level, source: taskDescriptor.source, cacheHit: taskCacheHit };
            setWindowState(['open', 'minimized', 'closed'].includes(saved.windowState) ? saved.windowState : 'open');
            setBusy(true);
            startElapsedTimer();
            panel.task = request(`${config.endpoint}?job=${saved.id}`).then((job) => {
                if (disposed) return;
                if (taskDescriptor.source === 'manual' && job.source?.length) {
                    textarea.value = job.source.map(line => line.text).join('\n');
                    for (const option of verdict.querySelectorAll('option')) option.selected = false;
                    verdict.querySelector(`option[value="${['UNKNOWN', 'WA', 'CE', 'TLE', 'RE', 'MLE', 'OLE'].includes(job.verdict) ? job.verdict : 'UNKNOWN'}"]`).selected = true;
                    taskDescriptor.signature = manualSignature(); updateVerdict();
                }
                return poll(job, taskDescriptor);
            }).catch(error => {
                if (!error.code && !error.httpStatus || error.code === 'CONNECTION_INTERRUPTED' || error.httpStatus >= 500) error.resumable = true;
                if (!disposed) showError(error);
            }).finally(finishTask);
        }
    } catch { remember(null); }
    return panel;
}

module.exports = { mountAssistant };
