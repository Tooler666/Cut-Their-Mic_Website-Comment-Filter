## 简介 Overview
你是否苦恼于在网络冲浪时,总在视频下面看到无关或者引战的评论?
添加关键词,命中的评论会自动折叠,相当于一键静音,还你一个清爽的评论区。

Tired of seeing off-topic or flame-bait comments under every video you watch?
Add your keywords and matching comments are folded automatically, like a one-click mute,so you can enjoy a cleaner comment section.

评论关键词屏蔽是一个桌面版 Chrome 和 Edge 扩展。添加你不想看到的关键词,评论正文命中后会自动折叠,可以逐条展开查看,也可以重新折叠。

Comment Keyword Filter is a desktop Chrome and Edge extension. Add the keywords you do not want to see, and matching comments are folded automatically. You can expand each one to read it,
or fold it again.

本插件支持多个网站

This extension supports multiple websites.

## 核心功能 Key features

- 支持十个平台:B站,YouTube,X,抖音,TikTok,小红书,Instagram,Reddit,贴吧,Facebook
  Ten platforms supported: Bilibili, YouTube, X, Douyin, TikTok, Xiaohongshu, Instagram, Reddit, Tieba, Facebook
- 三档关键词匹配:整条相同,完整词语,完整词加常见变体
  Three match levels: exact, whole word, and whole word with common variants
- 例外词:同时含屏蔽词和例外词的评论会保留
  Exception words: comments with both a blocked word and an exception word are kept
- 默认不折叠自己的评论,可选择是否过滤帖子作者
  Your own comments are exempt by default, and you can choose whether to filter the post author
- 可选的内置脏话过滤,覆盖简繁中文和英文
  Optional built-in profanity filter for Chinese and English
- 仅预览模式,评论保持可见,只标出命中的词
  Preview mode keeps comments visible and only marks the matched word
- 每个平台可单独开关
  Each platform has its own switch
- 本地统计:按今天,本周,本月,今年和全部时间查看
  Local statistics by day, week, month, year and all time
- 十二种界面语言,词表可导入和导出
  Twelve interface languages, with import and export of word lists

## 隐私 Privacy

关键词,设置和统计只保存在你的浏览器里。扩展只申请 storage 权限,不会向任何服务器发送评论或关键词,也不使用 AI 或联网服务。

Keywords, settings and statistics stay in your browser. The extension requests only the storage permission, never sends comments or keywords to any server, and does not use AI or any online service.

## 限制 Limitations

只处理网页上已加载且能识别结构的评论,不覆盖弹幕,直播聊天,图片里的文字和手机 App。平台改版后可能需要更新选择器。

Only loaded comments with a recognizable page structure are handled. Danmaku, live chat, text inside images and mobile apps are not covered. Platform redesigns may require selector updates.

## 参考 References

功能参考 [清塘](https://github.com/Qyin24/bili-comment-filter) 的预览与配置管理、[MuteUI](https://chromewebstore.google.com/detail/muteui/liokhlbnokkbldcfcaegcmdgicodfbda) 商店页描述的可展开折叠，
以及 [Strapi Comments](https://github.com/Sensinum/strapi-plugin-comments) 独立开关与词表检测思路。本扩展的自动过滤在浏览器本地运行。平台 DOM 结构参考 [EchoDistill](https://github.com/Kerinlin/EchoDistill)、
[TikTok Comment Analysis](https://github.com/Ruiyang13/TikTok_Comment_Analysis) 和 [YouTube Comments Must Contain Timestamps](https://greasyfork.org/ne/scripts/454167-youtube-comments-must-contain-timestamps/code)。

Preview and configuration management: [清塘](https://github.com/Qyin24/bili-comment-filter)
Expandable folding, as described on the store page: [MuteUI](https://chromewebstore.google.com/detail/muteui/liokhlbnokkbldcfcaegcmdgicodfbda)
Independent switches and word list detection approach: [Strapi Comments](https://github.com/Sensinum/strapi-plugin-comments)
Platform DOM structures: [EchoDistill](https://github.com/Kerinlin/EchoDistill), [TikTok Comment Analysis](https://github.com/Ruiyang13/TikTok_Comment_Analysis), 
[YouTube Comments Must Contain Timestamps](https://greasyfork.org/ne/scripts/454167-youtube-comments-must-contain-timestamps/code)
