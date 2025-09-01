# TeleBox_Plugins

## 简介
TeleBox_Plugins 是 TeleBox 项目的官方插件仓库，提供丰富的功能插件扩展。

## 插件安装方式
```bash
npm i <插件名>
```

## 可用插件列表

· `aban` - 管理用户权限工具，支持多群组操作和永久缓存  
· `bulk_delete` - 批量删除消息工具，支持回复删除和数量删除  
· `clean_member` - 群组成员清理工具，可按活跃度和时间筛选清理成员  
· `da` - 删除群内所有消息（非管理员仅删除自己的消息）  
· `dc` - 获取用户或群组的数据中心信息  
· `dig` - DNS 查询工具，支持域名解析和网络诊断  
· `dme` - 删除指定数量的自己发送的消息  
· `eat` - 生成"吃掉"表情包，支持自定义头像合成  
· `forward_cron` - 定时转发消息任务管理器  
· `gpt` - OpenAI GPT 聊天助手，支持文本对话和图像识别  
· `gt` - 谷歌翻译插件，支持中英文互译  
· `ip` - IP 地址查询工具，获取地理位置和网络信息  
· `keyword` - 关键词自动回复系统，支持正则表达式匹配  
· `komari` - Komari 服务器监控插件，获取节点状态和资源信息  
· `lottery` - 抽奖系统，支持群组抽奖活动管理  
· `music` - YouTube 音乐搜索和下载工具  
· `netease` - 网易云音乐搜索和播放功能  
· `pin_cron` - 定时置顶消息管理器  
· `pm2` - PM2 进程管理工具，支持重启和停止操作  
· `pmcaptcha` - 私聊验证系统，防止垃圾消息骚扰  
· `q` - 消息引用生成器，通过 QuotLyBot 制作引用图片  
· `search` - 频道消息搜索工具，支持多频道配置  
· `send_cron` - 定时发送消息任务调度器  
· `shift` - 智能消息转发系统，支持规则过滤和统计  
· `speednext` - 网络速度测试工具  
- `yt-dlp` - YouTube 视频下载工具，支持多种格式
- `autochangename` - 昵称显示当前时间
## 插件作者

- **TeleBoxDev**: eat, q
- **EALyce**: gt, ip, send_cron, aban, music, clean_member, speednext, shift, da, dc, keyword, pin_cron, forward_cron, lottery, dme, pmcaptcha, pm2, autochangename
- **BirdBird**: yt-dlp
- **JohnsonRan**: gpt, komari
- **Assistant**: dig

## 技术栈

- **开发语言**: TypeScript
- **数据库**: SQLite (better-sqlite3)
- **任务调度**: node-schedule
- **Telegram API**: telegram (GramJS)
- **图像处理**: Sharp
- **其他依赖**: axios, lodash 等

## 贡献指南

欢迎提交新插件或改进现有插件。请确保：
1. 遵循 TypeScript 编码规范
2. 包含完整的功能说明
3. 添加适当的错误处理
4. 更新 plugins.json 配置文件

## 许可证

本项目采用开源许可证，具体请查看各插件的许可证声明。
