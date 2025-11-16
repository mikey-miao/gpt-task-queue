// ChatGPT 问题队列 - UI 控制器
import { CONSTANTS } from './constants.js';
import { getStorageKey } from './utils.js';

/**
 * UI 控制器类，负责所有用户界面交互
 */
export class UIController {
        constructor(selectionTracker, queueManager, detector, autoSender, storage) {
            this.selectionTracker = selectionTracker;
            this.queueManager = queueManager;
            this.detector = detector;
            this.autoSender = autoSender;
            this.storage = storage;
            this.isVisible = false;
            this.lastSelection = '';
            this.selectionCheckInterval = null;
            this.autoProcessInterval = null;
            // 跟踪正在删除的问题ID，防止在动画期间重新渲染
            this.deletingIds = new Set();
            // 标记是否正在本地更新，避免触发同步刷新
            this.isLocalUpdate = false;
            
            this.createUI();
            this.bindEvents();
            this.startAutoProcess();
            
            // 使用事件委托绑定删除按钮（只需要绑定一次）
            this.setupDeleteButtonDelegation();
            
            // 设置多窗口同步监听
            this.setupStorageSync();
            
            // 初始化时渲染队列，显示正确的数字
            this.renderQuestions();
        }
        
        /**
         * 清理所有事件监听器和定时器
         */
        destroy() {
            if (this.selectionCheckInterval) {
                clearInterval(this.selectionCheckInterval);
                this.selectionCheckInterval = null;
            }
            if (this.autoProcessInterval) {
                clearInterval(this.autoProcessInterval);
                this.autoProcessInterval = null;
            }
            if (this.urlCheckInterval) {
                clearInterval(this.urlCheckInterval);
                this.urlCheckInterval = null;
            }
            // 移除存储监听器
            if (this.unsubscribeStorage) {
                this.unsubscribeStorage();
                this.unsubscribeStorage = null;
            }
        }

        /**
         * 设置多窗口存储同步监听
         */
        setupStorageSync() {
            // 获取当前页面的存储键名
            const currentStorageKey = getStorageKey('qq_questions');
            
            // 监听当前页面URL对应的问题队列存储变化
            this.unsubscribeStorage = this.storage.onChanged(currentStorageKey, async (newValue, oldValue) => {
                // 如果正在本地更新，跳过同步（避免循环）
                if (this.isLocalUpdate) {
                    return;
                }

                // 检查URL是否变化（用户切换了对话）
                const urlChanged = this.queueManager.checkUrlChanged();
                if (urlChanged) {
                    // URL变化了，需要重新加载新URL的队列
                    console.log('[UIController] 检测到URL变化，切换到新对话的队列');
                    await this.queueManager.loadFromStorage();
                    this.renderQuestions();
                    // 重新设置监听器（监听新的URL）
                    if (this.unsubscribeStorage) {
                        this.unsubscribeStorage();
                    }
                    this.setupStorageSync();
                    return;
                }

                // 比较新旧数据，如果确实变化了才刷新
                const newIds = new Set((newValue || []).map(q => q?.id).filter(Boolean));
                const oldIds = new Set((oldValue || []).map(q => q?.id).filter(Boolean));
                
                // 检查是否有实际变化
                const hasChanged = newIds.size !== oldIds.size || 
                    [...newIds].some(id => !oldIds.has(id)) ||
                    [...oldIds].some(id => !newIds.has(id));

                if (hasChanged) {
                    console.log('[UIController] 检测到其他窗口的队列变化，同步更新界面');
                    
                    // 重新加载队列
                    await this.queueManager.loadFromStorage();
                    
                    // 刷新界面（但不要打断正在进行的删除动画）
                    if (this.deletingIds.size === 0) {
                        this.renderQuestions();
                    }
                }
            });

            // 监听URL变化（用户切换对话）
            let lastUrl = window.location.href;
            this.urlCheckInterval = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;
                    console.log('[UIController] 检测到URL变化，重新加载队列');
                    // URL变化了，重新加载队列并更新监听器
                    this.queueManager.loadFromStorage().then(() => {
                        this.renderQuestions();
                        // 重新设置监听器
                        if (this.unsubscribeStorage) {
                            this.unsubscribeStorage();
                        }
                        this.setupStorageSync();
                    });
                }
            }, 1000); // 每秒检查一次URL变化
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
            this.settingsBtn.textContent = '⚙️';
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

                    // 检测是否移动超过阈值，如果是则认为是拖动
                    if (Math.abs(currentX - xOffset) > CONSTANTS.DRAG_THRESHOLD || 
                        Math.abs(currentY - yOffset) > CONSTANTS.DRAG_THRESHOLD) {
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
                        element.style.zIndex = CONSTANTS.MAX_Z_INDEX.toString();
                        
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
                    element.style.zIndex = CONSTANTS.MAX_Z_INDEX.toString();
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

            // 使用事件驱动更新选择显示，而不是定期轮询
            this.lastSelection = '';
            // 只在选择变化时更新，减少 DOM 查询
            this.selectionCheckInterval = setInterval(() => {
                const currentSelection = this.selectionTracker.getSelection();
                if (currentSelection !== this.lastSelection) {
                    this.lastSelection = currentSelection;
                    this.updateSelectionDisplay();
                }
            }, CONSTANTS.SELECTION_CHECK_INTERVAL);
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
            const panelWidth = CONSTANTS.PANEL_WIDTH;
            const panelMaxHeight = CONSTANTS.PANEL_MAX_HEIGHT;
            const gap = CONSTANTS.PANEL_GAP;

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
            
            try {
                // 标记为本地更新，避免触发同步刷新
                this.isLocalUpdate = true;
                this.queueManager.addQuestion(text, context);
                this.elements.input.value = '';
                this.selectionTracker.clearSelection();
                this.updateSelectionDisplay();
                this.renderQuestions();
                // 重置标记（延迟一下，确保存储操作完成）
                setTimeout(() => {
                    this.isLocalUpdate = false;
                }, 100);
            } catch (error) {
                this.isLocalUpdate = false;
                // 显示错误提示
                console.error('添加问题失败:', error.message);
                this.updateStatus('error', error.message);
                // 3秒后清除错误状态
                setTimeout(() => {
                    this.updateStatus('', '');
                }, 3000);
            }
        }

        renderQuestions() {
            // 保存当前transform状态
            const currentTransform = this.elements.toggleBtn.style.transform;
            // 显示总数
            this.elements.toggleBtn.textContent = this.queueManager.questions.length;
            // 恢复transform状态
            if (currentTransform) {
                this.elements.toggleBtn.style.transform = currentTransform;
            }

            const questions = this.queueManager.questions;
            const count = questions.length;
            const hasDeletingItems = this.deletingIds.size > 0;

            // 如果有正在删除的项目，使用增量更新模式（不重新渲染整个列表）
            if (hasDeletingItems) {
                // 获取当前DOM中所有项目的ID
                const currentItems = Array.from(this.elements.listContent.querySelectorAll('.qq-question-item'));
                const currentIds = new Set(currentItems.map(item => item.dataset.id));
                
                // 获取应该显示的项目ID（排除正在删除的）
                const expectedIds = new Set(questions.map(q => q.id));
                
                // 移除那些不在队列中且不在删除列表中的项目（已删除但不在动画中的）
                currentItems.forEach(item => {
                    const id = item.dataset.id;
                    if (!expectedIds.has(id) && !this.deletingIds.has(id)) {
                        item.remove();
                    }
                });
                
                // 添加新项目（只添加不在DOM中的）
                questions.forEach((q) => {
                    if (!currentIds.has(q.id)) {
                        const item = this.createQuestionItem(q);
                        this.elements.listContent.appendChild(item);
                    }
                });
                
                // 重新绑定拖动事件（删除按钮使用事件委托，不需要重新绑定）
                this.setupDragAndDrop();
                
                return;
            }

            // 没有正在删除的项目，正常渲染整个列表
            if (count === 0) {
                // 使用 textContent 防止 XSS
                this.elements.listContent.innerHTML = '';
                const emptyState = document.createElement('div');
                emptyState.className = 'qq-empty-state';
                emptyState.textContent = '暂无问题';
                this.elements.listContent.appendChild(emptyState);
                return;
            }

            // 清空列表
            this.elements.listContent.innerHTML = '';
            
            // 使用 DOM API 创建元素，防止 XSS
            questions.forEach((q) => {
                const item = this.createQuestionItem(q);
                this.elements.listContent.appendChild(item);
            });

            // 添加拖动排序功能
            this.setupDragAndDrop();
            // 删除按钮使用事件委托，不需要单独绑定
        }

        /**
         * 创建问题项DOM元素
         * @param {Object} q - 问题对象
         * @returns {HTMLElement} 创建的问题项元素
         */
        createQuestionItem(q) {
            const item = document.createElement('div');
            item.className = 'qq-question-item';
            item.setAttribute('data-id', q.id);
            item.draggable = true;
            
            const questionText = document.createElement('div');
            questionText.className = 'qq-question-text';
            questionText.textContent = q.question + (q.context ? ' [含上下文]' : '');
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'qq-delete-btn';
            deleteBtn.setAttribute('data-action', 'delete');
            deleteBtn.textContent = '×';
            
            item.appendChild(questionText);
            item.appendChild(deleteBtn);
            return item;
        }

        /**
         * 使用事件委托设置删除按钮（只需要设置一次）
         */
        setupDeleteButtonDelegation() {
            // 在列表容器上使用事件委托，避免重复绑定
            this.elements.listContent.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('[data-action="delete"]');
                if (deleteBtn) {
                    e.stopPropagation();
                    const item = deleteBtn.closest('.qq-question-item');
                    if (item) {
                        const id = item.dataset.id;
                        await this.removeQuestionWithAnimation(id);
                    }
                }
            });
        }

        /**
         * 绑定删除按钮事件（已废弃，使用事件委托代替）
         * @deprecated 使用 setupDeleteButtonDelegation() 代替
         */
        bindDeleteButtons() {
            // 此方法已不再需要，因为使用了事件委托
            // 保留此方法以避免破坏现有代码结构
        }

        async removeQuestionWithAnimation(id) {
            // 找到要删除的元素
            const itemToRemove = this.elements.listContent.querySelector(`[data-id="${id}"]`);
            if (!itemToRemove) {
                // 如果找不到元素，直接删除
                this.isLocalUpdate = true;
                this.queueManager.removeQuestion(id);
                this.renderQuestions();
                setTimeout(() => {
                    this.isLocalUpdate = false;
                }, 100);
                return;
            }

            // 立即标记为正在删除，防止在动画期间重新渲染
            this.deletingIds.add(id);
            
            // 立即从队列中移除（但保留DOM元素直到动画完成）
            this.isLocalUpdate = true;
            this.queueManager.removeQuestion(id);
            setTimeout(() => {
                this.isLocalUpdate = false;
            }, 100);
            
            // 更新按钮数字（因为队列已经减少了）
            const currentTransform = this.elements.toggleBtn.style.transform;
            this.elements.toggleBtn.textContent = this.queueManager.questions.length;
            if (currentTransform) {
                this.elements.toggleBtn.style.transform = currentTransform;
            }

            // 1. 开始删除动画（向左弹出）
            itemToRemove.classList.add('removing');

            // 2. 等待删除动画完成
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.DELETE_SLIDE_DURATION));


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
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.DELETE_COLLAPSE_DURATION));

            // 8. 从删除列表中移除，并重新渲染（此时队列中已经没有这个项目了）
            this.deletingIds.delete(id);
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
                const scrollThreshold = CONSTANTS.SCROLL_THRESHOLD;
                const maxSpeed = CONSTANTS.SCROLL_MAX_SPEED;
                const minSpeed = CONSTANTS.SCROLL_MIN_SPEED;

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
                    }, CONSTANTS.DRAG_UPDATE_DELAY);
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
            // 标记为本地更新，避免触发同步刷新
            this.isLocalUpdate = true;
            this.queueManager.saveToStorage();
            setTimeout(() => {
                this.isLocalUpdate = false;
            }, 100);
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
            // 使用 setInterval 替代 while(true) 循环，避免阻塞
            this.autoProcessInterval = setInterval(async () => {
                try {
                    if (this.queueManager.isProcessing || this.queueManager.isPaused) {
                        return;
                    }

                    // 检查URL是否变化
                    if (this.queueManager.checkUrlChanged()) {
                        // URL变化了，重新加载队列
                        console.log('[UIController] 检测到URL变化，停止处理并重新加载队列');
                        await this.queueManager.loadFromStorage();
                        this.renderQuestions();
                        this.queueManager.isProcessing = false;
                        return;
                    }

                    const nextQuestion = this.queueManager.getNextQuestion();
                    if (!nextQuestion) {
                        this.updateStatus('', '空闲');
                        return;
                    }

                    // 再次确认问题属于当前页面
                    if (!this.queueManager.isQuestionForCurrentPage(nextQuestion)) {
                        console.log('[UIController] 问题不属于当前页面，跳过发送');
                        await this.queueManager.loadFromStorage();
                        this.renderQuestions();
                        return;
                    }

                    if (this.detector.isReadyForNext()) {
                        this.queueManager.isProcessing = true;
                        this.updateStatus('processing', `等待${this.autoSender.settings.readyWaitDelay}ms...`);

                        // 等待用户设置的准备延迟
                        await this.detector.sleep(this.autoSender.settings.readyWaitDelay);

                        // 再次检查URL和问题是否仍然有效
                        if (this.queueManager.checkUrlChanged() || 
                            !this.queueManager.isQuestionForCurrentPage(nextQuestion)) {
                            console.log('[UIController] 等待期间URL变化或问题失效，取消发送');
                            await this.queueManager.loadFromStorage();
                            this.renderQuestions();
                            this.queueManager.isProcessing = false;
                            return;
                        }

                        // 再次检查状态
                        if (!this.detector.isReadyForNext()) {
                            this.queueManager.isProcessing = false;
                            return;
                        }

                        this.updateStatus('processing', '发送中...');
                        
                        // 用于存储动画Promise
                        let animationPromise = null;
                        
                        // 发送问题，并在输入完成时开始动画
                        // 传入当前页面ID用于验证
                        const success = await this.autoSender.sendQuestion(
                            nextQuestion, 
                            () => {
                                animationPromise = this.removeQuestionWithAnimation(nextQuestion.id);
                            },
                            this.queueManager.pageId // 传入当前页面ID
                        );
                        
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
                } catch (error) {
                    console.error('[UIController] 自动处理过程出错:', error);
                    this.queueManager.isProcessing = false;
                }
            }, CONSTANTS.AUTO_PROCESS_INTERVAL);
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

