// ChatGPT 问题队列 - Chrome 扩展版本
(function() {
    'use strict';


    // ==================== 工具函数 ====================
    function generateId() {
        return 'qq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ==================== 存储管理器 ====================
    class StorageManager {
        async get(key, defaultValue = null) {
            return new Promise((resolve) => {
                chrome.storage.local.get([key], (result) => {
                    resolve(result[key] !== undefined ? result[key] : defaultValue);
                });
            });
        }

        async set(key, value) {
            return new Promise((resolve) => {
                chrome.storage.local.set({ [key]: value }, resolve);
            });
        }
    }

    // ==================== 选择追踪器 ====================
    class SelectionTracker {
        constructor() {
            this.currentSelection = '';
            this.popupButton = null;
            this.onCaptureCallback = null;
            this.createPopupButton();
        }

        createPopupButton() {
            this.popupButton = document.createElement('div');
            this.popupButton.className = 'qq-selection-popup';
            this.popupButton.innerHTML = '+';
            this.popupButton.title = '添加为上下文';
            document.body.appendChild(this.popupButton);

            this.popupButton.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text.length >= 3 && text.length <= 2000) {
                    this.currentSelection = text;
                    
                    if (this.onCaptureCallback) {
                        this.onCaptureCallback(text);
                    }
                }
                
                // 点击后立即隐藏并清除选择
                this.hidePopup();
                
                // 清除文本选择，防止按钮重新出现
                if (selection.rangeCount > 0) {
                    selection.removeAllRanges();
                }
            });
        }

        startTracking(onCapture) {
            this.onCaptureCallback = onCapture;
            
            // 监听鼠标抬起事件
            document.addEventListener('mouseup', (e) => {
                // 延迟一下，确保选择已完成
                setTimeout(() => {
                    this.checkSelectionAtMouse(e.clientX, e.clientY);
                }, 10);
            });

            // 点击其他地方隐藏按钮
            document.addEventListener('click', (e) => {
                if (!this.popupButton.contains(e.target)) {
                    this.hidePopup();
                }
            });
        }

        checkSelectionAtMouse(mouseX, mouseY) {
            const selection = window.getSelection();
            const text = selection.toString().trim();
            
            // 检查选中的内容是否在article标签内
            let isInArticle = false;
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const container = range.commonAncestorContainer;
                // 如果是文本节点，获取其父元素
                const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
                // 检查是否在article标签内
                isInArticle = element && element.closest('article') !== null;
            }
            
            // 如果选中了文本（3-2000字符）且在article内，在鼠标位置显示按钮
            if (text.length >= 3 && text.length <= 2000 && isInArticle) {
                this.showPopupAtMouse(mouseX, mouseY);
            } else {
                this.hidePopup();
            }
        }

        showPopupAtMouse(mouseX, mouseY) {
            // 按钮显示在光标正中间
            this.popupButton.style.left = (mouseX - 16) + 'px'; // -16 使按钮水平居中（32/2）
            this.popupButton.style.top = (mouseY + window.scrollY - 16) + 'px'; // -16 使按钮垂直居中（32/2）
            this.popupButton.classList.add('show');
        }

        hidePopup() {
            this.popupButton.classList.remove('show');
        }

        getSelection() {
            // 不再自动清除选择
            return this.currentSelection;
        }

        clearSelection() {
            this.currentSelection = '';
            this.hidePopup();
        }
    }

    // ==================== 队列管理器 ====================
    class QuestionQueueManager {
        constructor(storage) {
            this.storage = storage;
            this.questions = [];
            this.isProcessing = false;
            this.isPaused = false;
        }

        async loadFromStorage() {
            const saved = await this.storage.get('qq_questions', []);
            this.questions = saved;
        }

        async saveToStorage() {
            await this.storage.set('qq_questions', this.questions);
        }

        addQuestion(text, context = '') {
            const question = {
                id: generateId(),
                question: text,
                context: context,
                timestamp: Date.now(),
                status: 'pending'
            };
            this.questions.push(question);
            this.saveToStorage();
            return question;
        }

        removeQuestion(id) {
            this.questions = this.questions.filter(q => q.id !== id);
            this.saveToStorage();
        }

        getNextQuestion() {
            return this.questions.find(q => q.status === 'pending');
        }
    }

    // ==================== ChatGPT 检测器 ====================
    class ChatGPTDetector {
        constructor() {
            this.checkInterval = 500;
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        getTextarea() {
            // 尝试多种选择器
            const selectors = [
                '#prompt-textarea',
                'textarea[placeholder*="Message"]',
                'textarea[placeholder*="消息"]',
                'main textarea',
                '[contenteditable="true"]',
                'div[contenteditable="true"]'
            ];
            
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element;
                }
            }
            
            return null;
        }

        getSendButton() {
            const btn = document.querySelector('button[data-testid="send-button"]');
            if (btn) {
                return btn;
            }
            
            return null;
        }

        getButtonState() {
            // 检查是否有语音按钮（独立按钮，表示输入框为空）
            const speechButton = document.querySelector('button[data-testid="composer-speech-button"]');
            if (speechButton) {
                return 'composer-speech-button';
            }
            
            // 检查发送/停止按钮的状态
            const submitButton = document.querySelector('#composer-submit-button');
            if (!submitButton) {
                return null;
            }
            
            const dataTestId = submitButton.getAttribute('data-testid') || '';
            return dataTestId;
        }

        isReadyForNext() {
            
            const state = this.getButtonState();
            
            if (!state) {
                return false;
            }
            
            if (state === 'stop-button') {
                return false;
            }
            
            if (state === 'send-button') {
                return false;
            }
            
            if (state === 'composer-speech-button') {
                return true;
            }
            
            return false;
        }
    }

    // ==================== 自动发送器 ====================
    class AutoSender {
        constructor(detector, storage) {
            this.detector = detector;
            this.storage = storage;
            this.settings = {
                autoSendDelay: 1500,
                readyWaitDelay: 2000,
                enableSound: false
            };
            this.loadSettings();
        }

        async loadSettings() {
            const saved = await this.storage.get('qq_settings', {});
            this.settings = { ...this.settings, ...saved };
        }

        async saveSettings() {
            await this.storage.set('qq_settings', this.settings);
        }

        formatQuestion(item) {
            if (item.context) {
                return `${item.context}\n\n${item.question}`;
            }
            return item.question;
        }

        async sendQuestion(item, onInputComplete = null) {
            try {
                
                // 1. 获取输入框
                const element = this.detector.getTextarea();
                if (!element) {
                    return false;
                }

                const fullText = this.formatQuestion(item);

                // 2. 输入内容
                element.focus();
                await this.detector.sleep(200);

                if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                    element.value = fullText;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (element.isContentEditable || element.contentEditable === 'true') {
                    element.focus();
                    document.execCommand('selectAll', false, null);
                    document.execCommand('delete', false, null);
                    document.execCommand('insertText', false, fullText);
                }
                
                
                // 输入完成后立即触发回调（开始动画）
                if (onInputComplete) {
                    onInputComplete();
                }
                
                await this.detector.sleep(100);
                
                // 3. 立即获取发送按钮并点击（不做任何检测）
                const sendButton = this.detector.getSendButton();
                if (!sendButton) {
                    return false;
                }
                
                sendButton.click();
                
                await this.detector.sleep(500);
                
                return true;
            } catch (e) {
                return false;
            }
        }
    }

    // ==================== UI 控制器 ====================
    class UIController {
        constructor(selectionTracker, queueManager, detector, autoSender) {
            this.selectionTracker = selectionTracker;
            this.queueManager = queueManager;
            this.detector = detector;
            this.autoSender = autoSender;
            this.isVisible = false;
            
            this.createUI();
            this.bindEvents();
            this.startAutoProcess();
            
            // 初始化时渲染队列，显示正确的数字
            this.renderQuestions();
        }

        createUI() {
            // 创建切换按钮
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.className = 'qq-toggle-btn';
            this.toggleBtn.textContent = '0';
            this.toggleBtn.title = ''; // 初始为空，hover时显示状态
            document.body.appendChild(this.toggleBtn);
            
            // 添加拖动功能
            this.makeDraggable(this.toggleBtn);

            // 创建独立的设置按钮
            this.settingsBtn = document.createElement('button');
            this.settingsBtn.className = 'qq-floating-settings-btn';
            this.settingsBtn.innerHTML = '⚙️';
            this.settingsBtn.title = '设置';
            document.body.appendChild(this.settingsBtn);

            // 创建面板
            this.panel = document.createElement('div');
            this.panel.className = 'qq-panel';
            this.panel.innerHTML = `
                <!-- 主页面 -->
                <div class="qq-page qq-main-page active">
                    <div class="qq-list-area">
                        <div class="qq-list-content">
                            <div class="qq-empty-state">某问题</div>
                        </div>
                    </div>
                    
                    <div class="qq-selection-area">
                        <div class="qq-selection-content">
                            <div class="qq-selection-text"></div>
                            <button class="qq-clear-selection-btn" title="清除上下文">−</button>
                        </div>
                    </div>
                    
                    <div class="qq-input-area">
                        <div class="qq-input-wrapper">
                            <input type="text" class="qq-input" placeholder="输入问题...">
                            <button class="qq-add-btn">添加</button>
                        </div>
                    </div>
                </div>
                
                <!-- 设置页面 -->
                <div class="qq-page qq-settings-page">
                    <div class="qq-settings-item">
                        <label class="qq-settings-label">发送延迟(ms)</label>
                        <div class="qq-settings-desc">发送问题后等待的时间</div>
                        <input type="number" class="qq-settings-input qq-delay-input" value="1500" min="500" max="10000" step="100">
                    </div>
                    
                    <div class="qq-settings-item">
                        <label class="qq-settings-label">准备等待(ms)</label>
                        <div class="qq-settings-desc">检测到可以输入后，等待的时间</div>
                        <input type="number" class="qq-settings-input qq-ready-wait-input" value="2000" min="0" max="10000" step="100">
                    </div>
                    
                    <div class="qq-settings-item">
                        <label class="qq-settings-checkbox">
                            <input type="checkbox" class="qq-sound-checkbox">
                            <span class="qq-settings-label" style="margin:0">提示音</span>
                        </label>
                    </div>
                </div>
            `;
            document.body.appendChild(this.panel);

            this.elements = {
                toggleBtn: this.toggleBtn,
                floatingSettingsBtn: this.settingsBtn,
                mainPage: this.panel.querySelector('.qq-main-page'),
                settingsPage: this.panel.querySelector('.qq-settings-page'),
                selectionArea: this.panel.querySelector('.qq-selection-area'),
                selectionText: this.panel.querySelector('.qq-selection-text'),
                clearSelectionBtn: this.panel.querySelector('.qq-clear-selection-btn'),
                input: this.panel.querySelector('.qq-input'),
                addBtn: this.panel.querySelector('.qq-add-btn'),
                listArea: this.panel.querySelector('.qq-list-area'),
                listContent: this.panel.querySelector('.qq-list-content'),
                delayInput: this.panel.querySelector('.qq-delay-input'),
                readyWaitInput: this.panel.querySelector('.qq-ready-wait-input'),
                soundCheckbox: this.panel.querySelector('.qq-sound-checkbox')
            };

            this.loadSettingsToUI();
        }

        makeDraggable(element) {
            let isDragging = false;
            let hasMoved = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            // 从transform中读取当前偏移量的辅助函数
            function getTransformOffset() {
                const transform = element.style.transform;
                if (transform && transform.includes('translate')) {
                    const match = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
                    if (match) {
                        return {
                            x: parseFloat(match[1]),
                            y: parseFloat(match[2])
                        };
                    }
                }
                return { x: 0, y: 0 };
            }

            element.addEventListener('mousedown', dragStart.bind(this));
            document.addEventListener('mousemove', drag.bind(this));
            document.addEventListener('mouseup', dragEnd.bind(this));

            const self = this;

            function dragStart(e) {
                // 从当前transform中读取偏移量
                const offset = getTransformOffset();
                xOffset = offset.x;
                yOffset = offset.y;
                
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
                isDragging = true;
                hasMoved = false;
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();

                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    // 检测是否移动超过5px，如果是则认为是拖动
                    if (Math.abs(currentX - xOffset) > 5 || Math.abs(currentY - yOffset) > 5) {
                        hasMoved = true;
                        element.classList.add('dragging');
                    }

                    if (hasMoved) {
                        xOffset = currentX;
                        yOffset = currentY;
                        setTranslate(currentX, currentY, element);
                        
                        // 拖动时不更新面板和设置按钮，等松手后再更新
                    }
                }
            }

            function dragEnd(e) {
                if (isDragging) {
                    isDragging = false;
                    
                    // 保存当前transform（在移除dragging类之前）
                    const currentTransform = element.style.transform;
                    element.classList.remove('dragging');
                    // 恢复transform
                    if (currentTransform) {
                        element.style.transform = currentTransform;
                    }
                    
                    // 如果移动了，阻止点击事件
                    if (hasMoved) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 确保按钮在top layer（使用最大z-index）
                        element.style.zIndex = '2147483647';
                        
                        // 拖动结束后，如果面板打开，更新位置（通过transition实现拖尾效果）
                        if (self.isVisible) {
                            self.positionSettingsBtn();
                            self.positionPanel();
                        }
                        
                        // 临时阻止click事件
                        const preventClick = (e) => {
                            e.stopPropagation();
                            element.removeEventListener('click', preventClick, true);
                        };
                        element.addEventListener('click', preventClick, true);
                    }
                    
                    // 即使没有移动，也更新z-index
                    element.style.zIndex = '2147483647';
                }
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate(${xPos}px, ${yPos}px)`;
            }
        }

        bindEvents() {
            // 切换面板
            this.elements.toggleBtn.addEventListener('click', () => {
                if (this.isVisible && this.elements.settingsPage.classList.contains('active')) {
                    // 如果在设置页面，返回主页面
                    this.showMain();
                } else {
                    // 否则切换面板
                    this.togglePanel();
                }
            });
            
            // 独立设置按钮
            this.elements.floatingSettingsBtn.addEventListener('click', () => {
                if (this.elements.settingsPage.classList.contains('active')) {
                    // 如果已经在设置页面，返回主页面
                    this.showMain();
                } else {
                    // 否则打开设置页面
                    if (!this.isVisible) {
                        this.isVisible = true;
                        this.panel.classList.add('show');
                        this.elements.floatingSettingsBtn.classList.add('show');
                        this.positionPanel();
                        this.positionSettingsBtn();
                    }
                    this.showSettings();
                }
            });

            // 上下文操作
            this.elements.clearSelectionBtn.addEventListener('click', () => {
                this.selectionTracker.clearSelection();
                this.updateSelectionDisplay();
            });

            // 添加问题
            this.elements.addBtn.addEventListener('click', () => this.addQuestion());
            this.elements.input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addQuestion();
            });

            // 设置
            this.elements.delayInput.addEventListener('change', () => this.saveSettings());
            this.elements.readyWaitInput.addEventListener('change', () => this.saveSettings());
            this.elements.soundCheckbox.addEventListener('change', () => this.saveSettings());

            // 定期更新选择显示
            setInterval(() => this.updateSelectionDisplay(), 500);
        }

        showSettings() {
            this.elements.mainPage.classList.remove('active');
            this.elements.settingsPage.classList.add('active');
        }

        showMain() {
            this.elements.settingsPage.classList.remove('active');
            this.elements.mainPage.classList.add('active');
        }

        togglePanel() {
            this.isVisible = !this.isVisible;
            this.panel.classList.toggle('show', this.isVisible);
            this.elements.floatingSettingsBtn.classList.toggle('show', this.isVisible);
            
            if (this.isVisible) {
                this.positionPanel();
                this.positionSettingsBtn();
                this.renderQuestions();
                this.elements.input.focus();
            }
        }

        positionSettingsBtn() {
            // 设置按钮使用相同的transform，这样它会完美跟随缩起按钮
            const toggleTransform = this.elements.toggleBtn.style.transform;
            if (toggleTransform) {
                this.elements.floatingSettingsBtn.style.transform = toggleTransform;
            }
        }

        positionPanel() {
            // 获取按钮的位置
            const btnRect = this.elements.toggleBtn.getBoundingClientRect();
            const panelWidth = 360;
            const panelMaxHeight = 400;
            const gap = 10;

            // 判断按钮在屏幕的哪个区域
            const isLeftSide = btnRect.left < window.innerWidth / 2;
            const isBottomSide = btnRect.top > window.innerHeight / 2;


            let left = null;
            let top = null;

            // 水平定位逻辑
            if (isLeftSide) {
                // 按钮在左侧，优先放在右边
                left = btnRect.right + gap;
                
                // 检查右边空间
                if (left + panelWidth > window.innerWidth - 10) {
                    // 右边不够，尝试放左边
                    const leftPos = btnRect.left - panelWidth - gap;
                    if (leftPos >= 10) {
                        left = leftPos;
                    } else {
                        left = 10;
                    }
                }
            } else {
                // 按钮在右侧，优先放在左边
                const leftPos = btnRect.left - panelWidth - gap;
                
                if (leftPos >= 10) {
                    // 左边空间足够
                    left = leftPos;
                } else {
                    // 左边空间不足，尝试放右边
                    const rightPos = btnRect.right + gap;
                    if (rightPos + panelWidth <= window.innerWidth - 10) {
                        left = rightPos;
                    } else {
                        // 两边都不够，靠左
                        left = 10;
                    }
                }
            }

            // 垂直定位逻辑
            if (isBottomSide) {
                // 按钮在下半部分，面板显示在按钮上方
                // 获取面板实际高度
                const panelHeight = this.panel.offsetHeight || panelMaxHeight;
                const spaceAbove = btnRect.top - gap;
                
                if (spaceAbove >= panelHeight) {
                    // 上方空间足够，让面板底部紧贴按钮顶部（留gap间隙）
                    top = btnRect.top - panelHeight - gap;
                } else {
                    // 上方空间不足，从顶部显示
                    top = 10;
                }
            } else {
                // 按钮在上半部分，向下显示
                top = btnRect.bottom + gap;
                
                // 确保不超出屏幕底部
                if (top + panelMaxHeight > window.innerHeight - 10) {
                    top = Math.max(10, window.innerHeight - panelMaxHeight - 10);
                }
                
            }

            // 一次性设置所有位置属性，避免中间状态
            this.panel.style.left = left + 'px';
            this.panel.style.top = top + 'px';
            this.panel.style.right = 'auto';
            this.panel.style.bottom = 'auto';
            
        }

        updateSelectionDisplay() {
            const selection = this.selectionTracker.getSelection();
            if (selection) {
                this.elements.selectionArea.classList.add('show');
                // 显示完整文本，CSS会处理2行显示和省略号
                this.elements.selectionText.textContent = selection;
            } else {
                this.elements.selectionArea.classList.remove('show');
            }
        }

        addQuestion() {
            const text = this.elements.input.value.trim();
            if (!text) return;

            const context = this.selectionTracker.getSelection();
            this.queueManager.addQuestion(text, context);
            
            this.elements.input.value = '';
            this.selectionTracker.clearSelection();
            this.updateSelectionDisplay();
            this.renderQuestions();
        }

        renderQuestions() {
            const questions = this.queueManager.questions;
            const count = questions.length;
            
            // 保存当前transform状态
            const currentTransform = this.elements.toggleBtn.style.transform;
            this.elements.toggleBtn.textContent = count;
            // 恢复transform状态
            if (currentTransform) {
                this.elements.toggleBtn.style.transform = currentTransform;
            }

            if (count === 0) {
                this.elements.listContent.innerHTML = '<div class="qq-empty-state">某问题</div>';
                return;
            }

            const html = questions.map((q, index) => `
                <div class="qq-question-item" data-id="${q.id}" draggable="true">
                    <div class="qq-question-text">${q.question}${q.context ? ' [含上下文]' : ''}</div>
                    <button class="qq-delete-btn" data-action="delete">×</button>
                </div>
            `).join('');

            this.elements.listContent.innerHTML = html;

            // 添加拖动排序功能
            this.setupDragAndDrop();

            // 绑定删除按钮
            this.elements.listContent.querySelectorAll('.qq-question-item').forEach(item => {
                const id = item.dataset.id;
                
                item.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.removeQuestionWithAnimation(id);
                });
            });
        }

        async removeQuestionWithAnimation(id) {
            // 找到要删除的元素
            const itemToRemove = this.elements.listContent.querySelector(`[data-id="${id}"]`);
            if (!itemToRemove) {
                // 如果找不到元素，直接删除
                this.queueManager.removeQuestion(id);
                this.renderQuestions();
                return;
            }


            // 1. 开始删除动画（向左弹出）
            itemToRemove.classList.add('removing');

            // 2. 等待删除动画完成（1s）
            await new Promise(resolve => setTimeout(resolve, 1000));


            // 3. 记录当前高度
            const currentHeight = itemToRemove.offsetHeight;

            // 4. 设置固定高度和transition
            itemToRemove.style.height = currentHeight + 'px';
            itemToRemove.style.overflow = 'hidden';
            itemToRemove.style.transition = 'height 2s cubic-bezier(0.34, 1.56, 0.64, 1), margin 2s cubic-bezier(0.34, 1.56, 0.64, 1), padding 2s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 2s ease';
            
            // 5. 强制重排，确保transition生效
            itemToRemove.offsetHeight;

            // 6. 开始收缩（下方卡片会自然滑上来）
            itemToRemove.style.height = '0';
            itemToRemove.style.marginTop = '0';
            itemToRemove.style.marginBottom = '0';
            itemToRemove.style.paddingTop = '0';
            itemToRemove.style.paddingBottom = '0';
            itemToRemove.style.opacity = '0';


            // 7. 等待收缩动画完成
            await new Promise(resolve => setTimeout(resolve, 2000));


            // 8. 真正删除数据并重新渲染
            this.queueManager.removeQuestion(id);
            this.renderQuestions();
        }

        setupDragAndDrop() {
            const items = this.elements.listContent.querySelectorAll('.qq-question-item');
            let draggedItem = null;
            let autoScrollAnimationId = null;
            let scrollDirection = 0; // 0: 不滚动, 1: 向下, -1: 向上
            let scrollSpeed = 0;

            // 自动滚动动画函数
            const autoScrollAnimation = () => {
                const listArea = this.elements.listArea;
                if (!listArea || scrollDirection === 0) {
                    autoScrollAnimationId = null;
                    return;
                }

                // 执行滚动
                if (scrollDirection === -1 && listArea.scrollTop > 0) {
                    listArea.scrollTop -= scrollSpeed;
                } else if (scrollDirection === 1 && listArea.scrollTop < listArea.scrollHeight - listArea.clientHeight) {
                    listArea.scrollTop += scrollSpeed;
                }

                // 继续动画
                autoScrollAnimationId = requestAnimationFrame(autoScrollAnimation);
            };

            // 处理自动滚动
            const handleAutoScroll = (e) => {
                const listArea = this.elements.listArea;
                if (!listArea) return;
                
                const rect = listArea.getBoundingClientRect();
                const scrollThreshold = 80; // 判定范围80px
                const maxSpeed = 3; // 最大速度（降低）
                const minSpeed = 0.5; // 最小速度

                // 计算鼠标相对于列表区域的位置
                const mouseY = e.clientY - rect.top;

                let newDirection = 0;
                let newSpeed = 0;

                // 向上滚动区域
                if (mouseY < scrollThreshold && mouseY > 0) {
                    newDirection = -1;
                    // 根据距离计算速度：越靠近边缘速度越快
                    const distance = scrollThreshold - mouseY;
                    const ratio = distance / scrollThreshold;
                    newSpeed = minSpeed + (maxSpeed - minSpeed) * ratio;
                }
                // 向下滚动区域
                else if (mouseY > rect.height - scrollThreshold && mouseY < rect.height) {
                    newDirection = 1;
                    // 根据距离计算速度：越靠近边缘速度越快
                    const distance = mouseY - (rect.height - scrollThreshold);
                    const ratio = distance / scrollThreshold;
                    newSpeed = minSpeed + (maxSpeed - minSpeed) * ratio;
                }

                // 更新滚动状态
                scrollDirection = newDirection;
                scrollSpeed = newSpeed;

                // 启动动画（如果还没启动）
                if (scrollDirection !== 0 && !autoScrollAnimationId) {
                    autoScrollAnimationId = requestAnimationFrame(autoScrollAnimation);
                }
            };

            items.forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    draggedItem = item;
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/html', item.innerHTML);
                });

                item.addEventListener('dragend', (e) => {
                    // 停止自动滚动
                    scrollDirection = 0;
                    scrollSpeed = 0;
                    if (autoScrollAnimationId) {
                        cancelAnimationFrame(autoScrollAnimationId);
                        autoScrollAnimationId = null;
                    }

                    // 移除拖动状态，让卡片平滑过渡到最终位置
                    item.classList.remove('dragging');
                    
                    // 稍微延迟更新顺序，确保动画完成
                    setTimeout(() => {
                        this.updateQuestionOrder();
                    }, 50);
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    
                    // 处理自动滚动
                    handleAutoScroll(e);
                    
                    if (draggedItem && draggedItem !== item) {
                        const rect = item.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        
                        if (e.clientY < midY) {
                            item.parentNode.insertBefore(draggedItem, item);
                        } else {
                            item.parentNode.insertBefore(draggedItem, item.nextSibling);
                        }
                    }
                });

                item.addEventListener('drop', (e) => {
                    e.stopPropagation();
                    return false;
                });
            });
        }

        updateQuestionOrder() {
            const items = this.elements.listContent.querySelectorAll('.qq-question-item');
            const newOrder = Array.from(items).map(item => item.dataset.id);
            
            // 重新排序问题数组
            const reorderedQuestions = newOrder.map(id => 
                this.queueManager.questions.find(q => q.id === id)
            ).filter(q => q);
            
            this.queueManager.questions = reorderedQuestions;
            this.queueManager.saveToStorage();
        }

        updateStatus(status, text) {
            // 保存当前transform状态
            const currentTransform = this.elements.toggleBtn.style.transform;
            
            // 更新按钮状态类
            this.elements.toggleBtn.className = 'qq-toggle-btn';
            if (status) {
                this.elements.toggleBtn.classList.add('status-' + status);
            }
            
            // 更新按钮title（hover时显示）
            this.elements.toggleBtn.title = text;
            
            // 恢复transform状态
            if (currentTransform) {
                this.elements.toggleBtn.style.transform = currentTransform;
            }
        }

        async startAutoProcess() {
            
            while (true) {
                await this.detector.sleep(2000);

                if (this.queueManager.isProcessing || this.queueManager.isPaused) {
                    continue;
                }

                const nextQuestion = this.queueManager.getNextQuestion();
                if (!nextQuestion) {
                    this.updateStatus('', '空闲');
                    continue;
                }


                if (this.detector.isReadyForNext()) {
                    this.queueManager.isProcessing = true;
                    this.updateStatus('processing', `等待${this.autoSender.settings.readyWaitDelay}ms...`);

                    // 等待用户设置的准备延迟
                    await this.detector.sleep(this.autoSender.settings.readyWaitDelay);

                    // 再次检查状态
                    if (!this.detector.isReadyForNext()) {
                        this.queueManager.isProcessing = false;
                        return;
                    }

                    this.updateStatus('processing', '发送中...');
                    
                    // 用于存储动画Promise
                    let animationPromise = null;
                    
                    // 发送问题，并在输入完成时开始动画
                    const success = await this.autoSender.sendQuestion(nextQuestion, () => {
                        animationPromise = this.removeQuestionWithAnimation(nextQuestion.id);
                    });
                    
                    if (success) {
                        // 等待动画完成
                        if (animationPromise) {
                            await animationPromise;
                        }
                        // 等待发送延迟
                        await this.detector.sleep(this.autoSender.settings.autoSendDelay);
                        this.updateStatus('', '成功');
                    } else {
                        // 即使失败也等待动画完成
                        if (animationPromise) {
                            await animationPromise;
                        }
                        this.updateStatus('error', '失败');
                    }

                    this.queueManager.isProcessing = false;
                } else {
                    this.updateStatus('processing', '等待...');
                }
            }
        }

        loadSettingsToUI() {
            this.elements.delayInput.value = this.autoSender.settings.autoSendDelay;
            this.elements.readyWaitInput.value = this.autoSender.settings.readyWaitDelay;
            this.elements.soundCheckbox.checked = this.autoSender.settings.enableSound;
        }

        saveSettings() {
            this.autoSender.settings.autoSendDelay = parseInt(this.elements.delayInput.value);
            this.autoSender.settings.readyWaitDelay = parseInt(this.elements.readyWaitInput.value);
            this.autoSender.settings.enableSound = this.elements.soundCheckbox.checked;
            this.autoSender.saveSettings();
        }
    }

    // ==================== 初始化 ====================
    async function init() {

        const storage = new StorageManager();
        const selectionTracker = new SelectionTracker();
        const queueManager = new QuestionQueueManager(storage);
        const detector = new ChatGPTDetector();
        const autoSender = new AutoSender(detector, storage);

        await queueManager.loadFromStorage();
        
        const uiController = new UIController(selectionTracker, queueManager, detector, autoSender);

        // 启动选择追踪，传入回调函数
        selectionTracker.startTracking((text) => {
            uiController.updateSelectionDisplay();
            
            // 自动打开面板并focus到输入框
            if (!uiController.isVisible) {
                uiController.isVisible = true;
                uiController.panel.classList.add('show');
                uiController.elements.floatingSettingsBtn.classList.add('show');
                uiController.positionPanel();
                uiController.positionSettingsBtn();
            }
            
            // 确保在主页面并focus输入框
            if (uiController.elements.settingsPage.classList.contains('active')) {
                uiController.showMain();
            }
            uiController.elements.input.focus();
        });

    }

    // 等待页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }
})();

