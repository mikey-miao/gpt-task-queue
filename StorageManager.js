// ChatGPT 问题队列 - 存储管理器

/**
 * 管理 Chrome Storage API 的封装类
 */
export class StorageManager {
    constructor() {
        // 存储变化监听器的回调函数列表
        this.changeListeners = new Map();
    }

    /**
     * 从存储中获取值
     * @param {string} key - 存储键名
     * @param {*} defaultValue - 默认值
     * @returns {Promise<*>} 存储的值或默认值
     */
    async get(key, defaultValue = null) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key] !== undefined ? result[key] : defaultValue);
            });
        });
    }

    /**
     * 设置存储值
     * @param {string} key - 存储键名
     * @param {*} value - 要存储的值
     * @returns {Promise<void>}
     */
    async set(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    /**
     * 监听存储变化
     * @param {string} key - 要监听的存储键名
     * @param {Function} callback - 变化时的回调函数 (newValue, oldValue) => void
     * @returns {Function} 取消监听的函数
     */
    onChanged(key, callback) {
        if (!this.changeListeners.has(key)) {
            this.changeListeners.set(key, []);
        }
        this.changeListeners.get(key).push(callback);

        // 如果是第一次监听这个key，设置全局监听器
        if (this.changeListeners.get(key).length === 1) {
            this.setupListener(key);
        }

        // 返回取消监听的函数
        return () => {
            const listeners = this.changeListeners.get(key);
            if (listeners) {
                const index = listeners.indexOf(callback);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    /**
     * 设置存储变化监听器
     * @param {string} key - 存储键名
     */
    setupListener(key) {
        // 使用全局的 chrome.storage.onChanged 监听器
        if (!this.globalListener) {
            this.globalListener = (changes, areaName) => {
                if (areaName !== 'local') return;

                // 遍历所有监听的key
                for (const [listenedKey, callbacks] of this.changeListeners.entries()) {
                    if (changes[listenedKey]) {
                        const change = changes[listenedKey];
                        const newValue = change.newValue;
                        const oldValue = change.oldValue;

                        // 调用所有注册的回调函数
                        callbacks.forEach(callback => {
                            try {
                                callback(newValue, oldValue);
                            } catch (error) {
                                console.error(`[StorageManager] 监听器回调执行失败 (key: ${listenedKey}):`, error);
                            }
                        });
                    }
                }
            };

            chrome.storage.onChanged.addListener(this.globalListener);
        }
    }

    /**
     * 移除所有监听器（清理资源）
     */
    removeAllListeners() {
        if (this.globalListener) {
            chrome.storage.onChanged.removeListener(this.globalListener);
            this.globalListener = null;
        }
        this.changeListeners.clear();
    }
}
