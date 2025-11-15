# ChatGPT 问题队列 - Chrome 扩展

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-Extension-orange.svg)

一个强大的 Chrome 扩展，让你可以在 ChatGPT 中批量提问，自动排队发送问题。

[功能特性](#功能特性) • [安装](#安装) • [使用说明](#使用说明) • [截图](#截图) • [开发](#开发)

</div>

---

## ✨ 功能特性

### 🎯 核心功能

- **📝 问题队列管理** - 批量添加问题，自动排队等待发送
- **🤖 智能自动发送** - 检测 ChatGPT 状态，自动发送下一个问题
- **📋 上下文捕获** - 选中页面文本作为问题的上下文
- **🎨 拖拽排序** - 直观的拖拽操作调整问题顺序
- **💾 持久化存储** - 问题队列自动保存，刷新页面不丢失

### 🎭 用户体验

- **🎪 流畅动画** - 丝滑的删除、滑动、呼吸动画效果
- **🖱️ 可拖动面板** - 自由拖动到屏幕任意位置
- **📱 智能定位** - 面板根据按钮位置自动调整显示方向
- **🎨 简洁设计** - 不花里胡哨，专注于功能本身
- **⚡ 自动滚动** - 拖拽排序时靠近边缘自动滚动

### ⚙️ 高级设置

- **⏱️ 发送延迟** - 自定义问题发送后的等待时间
- **⏳ 准备等待** - 自定义检测到可输入后的等待时间
- **🔔 提示音** - 可选的操作提示音（待实现）

---

## 📦 安装

### 方法一：从源码安装（推荐）

1. **克隆或下载本仓库**
   ```bash
   git clone https://github.com/你的用户名/chatgpt-question-queue.git
   cd chatgpt-question-queue
   ```

2. **打开 Chrome 扩展管理页面**
   - 在地址栏输入：`chrome://extensions/`
   - 或者：菜单 → 更多工具 → 扩展程序

3. **启用开发者模式**
   - 点击右上角的"开发者模式"开关

4. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择 `chrome-extension` 文件夹

5. **完成！** 🎉
   - 访问 [ChatGPT](https://chatgpt.com) 即可使用

### 方法二：从 Chrome 应用商店安装

> 🚧 即将上线...

---

## 🚀 使用说明

### 快速开始

1. **打开 ChatGPT** - 访问 https://chatgpt.com

2. **查看悬浮按钮** - 页面右下角会出现一个圆形按钮（显示队列数量）

3. **添加问题**
   - 点击悬浮按钮打开面板
   - 在输入框中输入问题
   - 按回车或点击"添加"按钮

4. **自动发送** - 问题会自动排队，在 ChatGPT 空闲时自动发送

### 高级功能

#### 📋 添加上下文

1. 在 ChatGPT 对话中选中任意文本（必须在 `<article>` 标签内）
2. 光标位置会出现一个 **+** 按钮
3. 点击按钮捕获选中的文本作为上下文
4. 输入问题后，上下文会自动附加到问题前面

#### 🎯 拖拽排序

- 直接拖动问题卡片即可调整顺序
- 靠近列表边缘时会自动滚动
- 松手后顺序自动保存

#### 🎨 自定义位置

- 拖动悬浮按钮到任意位置
- 面板会智能调整显示方向
- 设置按钮会跟随悬浮按钮移动

#### ⚙️ 调整设置

1. 点击悬浮按钮上方的 ⚙️ 图标
2. 调整发送延迟和准备等待时间
3. 设置会自动保存

---

## 📸 截图

### 主界面
![主界面](screenshots/main.png)

### 问题队列
![问题队列](screenshots/queue.png)

### 上下文捕获
![上下文捕获](screenshots/context.png)

### 设置页面
![设置页面](screenshots/settings.png)

---

## 🎨 动画效果

- **删除动画** - 问题卡片向左滑出，下方卡片平滑上移
- **呼吸动画** - 等待状态时数字呼吸闪烁
- **拖尾效果** - 面板和设置按钮跟随悬浮按钮移动
- **Q弹效果** - 使用 cubic-bezier 缓动函数，动画丝滑自然

---

## 🛠️ 技术栈

- **原生 JavaScript** - 无框架依赖
- **Chrome Extension API** - 使用 Manifest V3
- **CSS3 动画** - 流畅的过渡和关键帧动画
- **Chrome Storage API** - 持久化数据存储
- **Drag and Drop API** - 拖拽排序功能

---

## 📁 项目结构

```
chrome-extension/
├── manifest.json          # 扩展配置文件
├── content.js            # 核心逻辑 (1098 行)
├── styles.css            # 样式文件 (449 行)
├── popup.html            # 弹出页面
├── INSTALL.txt           # 安装说明
├── icons/                # 图标资源
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md             # 本文件
```

---

## 🔧 开发

### 本地开发

1. **修改代码**
   ```bash
   # 编辑 content.js 或 styles.css
   ```

2. **重新加载扩展**
   - 在 `chrome://extensions/` 页面点击刷新按钮
   - 或者使用快捷键：`Ctrl+R`

3. **调试**
   - 右键点击扩展图标 → 检查弹出内容
   - 在 ChatGPT 页面按 `F12` 打开开发者工具

### 代码结构

#### 核心类

- **`StorageManager`** - 数据持久化管理
- **`SelectionTracker`** - 文本选择和上下文捕获
- **`QuestionQueueManager`** - 问题队列管理
- **`ChatGPTDetector`** - ChatGPT 状态检测
- **`AutoSender`** - 自动发送问题
- **`UIController`** - UI 交互控制

#### 关键功能

```javascript
// 检测 ChatGPT 是否准备好接收新问题
isReadyForNext() {
    const state = this.getButtonState();
    return state === 'composer-speech-button';
}

// 自动发送问题
async sendQuestion(item, onInputComplete) {
    // 输入内容
    // 触发删除动画回调
    // 点击发送按钮
}

// 带动画的删除
async removeQuestionWithAnimation(id) {
    // 1. 向左滑出动画
    // 2. 高度收缩动画
    // 3. 删除数据
}
```

---

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

- 使用 4 空格缩进
- 类名使用 PascalCase
- 方法名使用 camelCase
- CSS 类名使用 kebab-case，前缀 `qq-`

---

## 🐛 已知问题

- [ ] 提示音功能尚未实现
- [ ] 暂不支持多窗口同步
- [ ] 某些情况下检测状态可能延迟

---

## 📝 更新日志

### v1.0.0 (2024-11-15)

- ✨ 初始版本发布
- ✅ 问题队列管理
- ✅ 自动发送功能
- ✅ 上下文捕获
- ✅ 拖拽排序
- ✅ 流畅动画效果
- ✅ 持久化存储

---

## 📄 许可证

本项目严禁商用，纯属爱好

---


<div align="center">

**如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！**

</div>


