// ChatGPT 问题队列 - 队列管理器
(function() {
    'use strict';

    /**
     * 管理问题队列的类，负责添加、删除、保存和加载问题
     */
    window.QuestionQueueManager = class QuestionQueueManager {
        /**
         * @param {StorageManager} storage - 存储管理器实例
         */
        constructor(storage) {
            this.storage = storage;
            this.questions = [];
            this.isProcessing = false;
            this.isPaused = false;
            // 当前页面的存储键名（基于URL）
            this.storageKey = getStorageKey('qq_questions');
            // 当前页面的ID
            this.pageId = getPageId();
        }

        /**
         * 检查URL是否变化（用户切换了对话）
         * @returns {boolean} URL是否变化
         */
        checkUrlChanged() {
            const currentPageId = getPageId();
            if (currentPageId !== this.pageId) {
                this.pageId = currentPageId;
                this.storageKey = getStorageKey('qq_questions');
                return true;
            }
            return false;
        }

        async loadFromStorage() {
            try {
                // 检查URL是否变化
                const urlChanged = this.checkUrlChanged();
                if (urlChanged) {
                    console.log(`[QuestionQueueManager] URL已变化，切换到新的队列: ${this.pageId}`);
                }

                const saved = await this.storage.get(this.storageKey, []);
                // 验证加载的数据格式
                if (Array.isArray(saved)) {
                    this.questions = saved.filter(q => 
                        q && 
                        typeof q === 'object' && 
                        q.id && 
                        q.question && 
                        typeof q.question === 'string'
                    );
                    console.log(`[QuestionQueueManager] 已加载 ${this.questions.length} 个问题 (页面: ${this.pageId})`);
                } else {
                    console.warn('[QuestionQueueManager] 存储的数据格式无效，重置为空数组');
                    this.questions = [];
                }
            } catch (error) {
                console.error('[QuestionQueueManager] 加载存储失败:', error);
                this.questions = [];
            }
        }

        async saveToStorage() {
            try {
                // 确保使用最新的存储键名
                this.checkUrlChanged();
                await this.storage.set(this.storageKey, this.questions);
            } catch (error) {
                console.error('[QuestionQueueManager] 保存到存储失败:', error);
            }
        }

        addQuestion(text, context = '') {
            // 验证问题文本
            const validatedQuestion = validateText(
                text, 
                CONSTANTS.MIN_QUESTION_LENGTH, 
                CONSTANTS.MAX_QUESTION_LENGTH
            );
            if (!validatedQuestion) {
                throw new Error(`问题长度必须在 ${CONSTANTS.MIN_QUESTION_LENGTH}-${CONSTANTS.MAX_QUESTION_LENGTH} 字符之间`);
            }
            
            // 验证上下文（如果提供）
            let validatedContext = '';
            if (context) {
                const validated = validateText(
                    context,
                    CONSTANTS.MIN_CONTEXT_LENGTH,
                    CONSTANTS.MAX_CONTEXT_LENGTH
                );
                if (validated) {
                    validatedContext = validated;
                }
            }
            
            const question = {
                id: generateId(),
                question: validatedQuestion,
                context: validatedContext,
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

        /**
         * 检查问题是否属于当前页面
         * @param {Object} question - 问题对象
         * @returns {boolean} 是否属于当前页面
         */
        isQuestionForCurrentPage(question) {
            // 检查URL是否变化
            const urlChanged = this.checkUrlChanged();
            if (urlChanged) {
                // URL变化了，这个问题不属于当前页面
                return false;
            }
            // 检查问题是否在当前队列中
            return this.questions.some(q => q.id === question.id);
        }

        getNextQuestion() {
            // 先检查URL是否变化
            if (this.checkUrlChanged()) {
                // URL变化了，清空当前队列（会重新加载）
                this.questions = [];
                return null;
            }
            return this.questions.find(q => q.status === 'pending');
        }
    };
})();

