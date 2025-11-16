// ChatGPT 问题队列 - 自动发送器
import { CONSTANTS } from './constants.js';
import { getPageId } from './utils.js';

/**
 * 自动发送问题到 ChatGPT 输入框
 */
export class AutoSender {
    /**
     * @param {ChatGPTDetector} detector - ChatGPT 检测器实例
     * @param {StorageManager} storage - 存储管理器实例
     */
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

    async sendQuestion(item, onInputComplete = null, expectedPageId = null) {
        try {
            // 0. 如果提供了页面ID，检查当前页面是否匹配
            if (expectedPageId !== null) {
                const currentPageId = getPageId();
                if (currentPageId !== expectedPageId) {
                    console.warn(`[AutoSender] 页面ID不匹配，取消发送。期望: ${expectedPageId}, 当前: ${currentPageId}`);
                    return false;
                }
            }

            // 1. 获取输入框
            const element = this.detector.getTextarea();
            if (!element) {
                console.error('[AutoSender] 无法找到输入框元素');
                return false;
            }

            // 再次检查页面ID（在发送前最后确认）
            if (expectedPageId !== null) {
                const currentPageId = getPageId();
                if (currentPageId !== expectedPageId) {
                    console.warn(`[AutoSender] 发送前页面ID不匹配，取消发送。期望: ${expectedPageId}, 当前: ${currentPageId}`);
                    return false;
                }
            }

            const fullText = this.formatQuestion(item);

            // 2. 输入内容
            element.focus();
            await this.detector.sleep(CONSTANTS.FOCUS_DELAY);

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
                console.error('[AutoSender] 无法找到发送按钮');
                return false;
            }
            
            sendButton.click();
            
            await this.detector.sleep(CONSTANTS.SEND_BUTTON_DELAY);
            
            return true;
        } catch (error) {
            console.error('[AutoSender] 发送问题失败:', error);
            return false;
        }
    }
}
