// ChatGPT 问题队列 - 选择追踪器
(function() {
    'use strict';

    /**
     * 追踪用户在页面上的文本选择，并提供上下文捕获功能
     */
    window.SelectionTracker = class SelectionTracker {
        constructor() {
            this.currentSelection = '';
            this.popupButton = null;
            this.onCaptureCallback = null;
            this.createPopupButton();
        }

        createPopupButton() {
            this.popupButton = document.createElement('div');
            this.popupButton.className = 'qq-selection-popup';
            this.popupButton.textContent = '+';
            this.popupButton.title = '添加为上下文';
            document.body.appendChild(this.popupButton);

            this.popupButton.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const selection = window.getSelection();
                const text = selection.toString().trim();
                
                if (text.length >= CONSTANTS.MIN_CONTEXT_LENGTH && text.length <= CONSTANTS.MAX_CONTEXT_LENGTH) {
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
                }, CONSTANTS.SELECTION_DELAY);
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
            
            // 如果选中了文本且在article内，在鼠标位置显示按钮
            if (text.length >= CONSTANTS.MIN_CONTEXT_LENGTH && 
                text.length <= CONSTANTS.MAX_CONTEXT_LENGTH && 
                isInArticle) {
                this.showPopupAtMouse(mouseX, mouseY);
            } else {
                this.hidePopup();
            }
        }

        showPopupAtMouse(mouseX, mouseY) {
            // 按钮显示在光标正中间
            const offset = CONSTANTS.POPUP_BUTTON_OFFSET;
            this.popupButton.style.left = (mouseX - offset) + 'px';
            this.popupButton.style.top = (mouseY + window.scrollY - offset) + 'px';
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
    };
})();

