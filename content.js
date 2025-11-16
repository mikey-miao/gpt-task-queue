// ChatGPT 问题队列 - 主文件（初始化）
(function() {
    'use strict';

    // ==================== 初始化 ====================
    /**
     * 初始化应用，创建所有必要的实例并启动功能
     */
    async function init() {
        try {
            console.log('[Init] 开始初始化 ChatGPT 问题队列扩展...');
            
            const storage = new StorageManager();
            const selectionTracker = new SelectionTracker();
            const queueManager = new QuestionQueueManager(storage);
            const detector = new ChatGPTDetector();
            const autoSender = new AutoSender(detector, storage);

            await queueManager.loadFromStorage();
            
            const uiController = new UIController(selectionTracker, queueManager, detector, autoSender, storage);
            
            console.log('[Init] 初始化完成');

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
        } catch (error) {
            console.error('[Init] 初始化失败:', error);
        }
    }

    // 等待页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 延迟初始化，确保页面完全加载
        setTimeout(init, 1000);
    }
    
    // 添加加载状态提示（在控制台）
    console.log('[ChatGPT 问题队列] 扩展脚本已加载，等待初始化...');
})();
