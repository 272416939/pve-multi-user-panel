---  
name: update-cache-version  
description: >  
  更新前端静态资源缓存版本号。当用户修改了 public/js/、public/css/、views/ 下的 JS、CSS、EJS 文件并希望浏览器立即加载新版本时触发。也适用于用户明确说"更新缓存版本"、"刷新缓存"、"cache-version"、"更新静态资源缓存"。  
  注意：只更新 public/cache-version.json 的 v 值，不改任何 JS/CSS/EJS 文件本身的逻辑。  
---  

# Skill: update-cache-version

## 工作目录

所有操作均在项目根目录（`E:\code\pve管理面板`）下执行。

## 触发逻辑

当用户表达以下任一意图时触发：

- "更新缓存版本" / "更新cache版本"
- "刷新缓存版本"
- "cache-version" / "更新静态资源缓存"
- 在告知你修改了 `public/js/`、`public/css/` 或 `views/` 下的文件后说"帮我更新缓存"
- 任何暗示需要让浏览器加载最新 JS/CSS 的表述

## 行为

1. 读取 `public/cache-version.json`，解析当前 `v` 值
2. 判断用户是否明确指定了版本号（如 "v5"、"设置成 5"、"改成 3"）
   - 如果指定了，直接使用该值
   - 如果没指定，`v` 加 1
3. 写回 `public/cache-version.json`
4. 输出以下信息：
   - 旧版本号 → 新版本号
   - 提示用户刷新浏览器（前端页面会自动带上新的 `?cv=` 参数）

## 示例

### 用户输入
```
我改了 disk.js，帮我更新缓存版本
```

### 执行过程
- 读取 `public/cache-version.json` → `{"v":3}`
- 未指定版本号 → 3 + 1 = 4
- 写入 `{"v":4}`
- 输出：
  ```
  缓存版本已更新：v3 → v4
  刷新浏览器即可加载最新的 JS/CSS。
  ```

### 用户指定版本
```
取消缓存版本改成 v10
```

- 读取 → `{"v":4}`
- 指定了 10 → 直接设为 10
- 写入 `{"v":10}`
- 输出：
  ```
  缓存版本已更新：v4 → v10
  刷新浏览器即可加载最新的 JS/CSS。
  ```
