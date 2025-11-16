// ChatGPT 问题队列 - 工具函数
(function() {
    'use strict';

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    window.generateId = function() {
        return 'qq_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    };
    
    /**
     * 验证并清理文本输入
     * @param {string} text - 要验证的文本
     * @param {number} minLength - 最小长度
     * @param {number} maxLength - 最大长度
     * @returns {string|null} 清理后的文本，如果无效则返回 null
     */
    window.validateText = function(text, minLength, maxLength) {
        if (typeof text !== 'string') {
            return null;
        }
        const trimmed = text.trim();
        if (trimmed.length < minLength || trimmed.length > maxLength) {
            return null;
        }
        return trimmed;
    };

    /**
     * 获取当前页面的唯一标识（基于URL）
     * ChatGPT的URL格式通常是：
     * - https://chatgpt.com/c/conversation-id
     * - https://chat.openai.com/c/conversation-id
     * - 或者新对话：https://chatgpt.com/ (没有conversation-id)
     * @returns {string} 页面唯一标识
     */
    window.getPageId = function() {
        const url = window.location.href;
        const urlObj = new URL(url);
        
        // 提取路径部分（包含对话ID）
        // ChatGPT的对话URL格式：/c/conversation-id
        const pathname = urlObj.pathname;
        
        // 如果有对话ID（路径包含 /c/），使用路径作为标识
        if (pathname.startsWith('/c/') && pathname.length > 3) {
            // 提取对话ID部分
            return pathname;
        }
        
        // 如果没有对话ID（新对话页面），使用hostname + pathname作为标识
        // 这样同一个域名下的新对话页面共享同一个队列
        return urlObj.hostname + pathname;
    };

    /**
     * 生成基于URL的存储键名
     * @param {string} baseKey - 基础键名（如 'qq_questions'）
     * @returns {string} 完整的存储键名
     */
    window.getStorageKey = function(baseKey) {
        const pageId = getPageId();
        // 使用 base64 编码 pageId 以避免特殊字符问题
        // 但为了可读性，我们使用简单的替换方式
        const safePageId = pageId.replace(/[^a-zA-Z0-9]/g, '_');
        return `${baseKey}_${safePageId}`;
    };
})();

