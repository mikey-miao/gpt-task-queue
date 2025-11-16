// ChatGPT 问题队列 - ChatGPT 检测器
(function() {
    'use strict';

    /**
     * 检测 ChatGPT 页面状态，判断是否可以发送新问题
     */
    window.ChatGPTDetector = class ChatGPTDetector {
        constructor() {
            this.checkInterval = 500;
        }

        /**
         * 延迟指定毫秒数
         * @param {number} ms - 延迟毫秒数
         * @returns {Promise<void>}
         */
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
    };
})();

