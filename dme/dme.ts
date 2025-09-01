/**
 * DME (Delete My Messages) Plugin for TeleBox
 * 智能防撤回删除插件 - 优化版本
 * 支持媒体消息防撤回处理，文本消息快速删除
 */

import { TelegramClient, Api } from "telegram";
import { getGlobalClient } from "@utils/globalClient";
import { getEntityWithHash } from "@utils/entityHelpers";
import { Plugin } from "@utils/pluginBase";
import { CustomFile } from "telegram/client/uploads";
import * as fs from "fs";
import * as path from "path";

// 常量配置
const CONFIG = {
  TROLL_IMAGE_URL: "https://www.hhlqilongzhu.cn/api/tu_tuwen.php?msg=不可以防撤回哦",
  TROLL_IMAGE_PATH: "./assets/dme/dme_troll_image.jpg",
  BATCH_SIZE: 50,
  SEARCH_LIMIT: 100,
  MAX_SEARCH_MULTIPLIER: 10,
  MIN_MAX_SEARCH: 2000,
  DELAYS: {
    BATCH: 200,
    EDIT_WAIT: 1000,
    SEARCH: 100,
    RESULT_DISPLAY: 3000
  }
} as const;

// 工具函数
const htmlEscape = (text: string): string => 
  text.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[m] || m));

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const formatProgress = (current: number, total: number): string => `<code>${current}/${total}</code>`;

/**
 * 获取防撤回图片，支持缓存
 */
async function getTrollImage(): Promise<string | null> {
  if (fs.existsSync(CONFIG.TROLL_IMAGE_PATH)) {
    return CONFIG.TROLL_IMAGE_PATH;
  }

  const dir = path.dirname(CONFIG.TROLL_IMAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    const response = await fetch(CONFIG.TROLL_IMAGE_URL);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(CONFIG.TROLL_IMAGE_PATH, buffer);
      return CONFIG.TROLL_IMAGE_PATH;
    }
    return null;
  } catch (error) {
    console.error("[DME] 下载防撤回图片失败:", error);
    return null;
  }
}

/**
 * 通用删除消息函数
 */
async function deleteMessagesUniversal(
  client: TelegramClient,
  chatEntity: any,
  messageIds: number[]
): Promise<number> {
  await client.deleteMessages(chatEntity, messageIds, { revoke: true });
  return messageIds.length;
}

/**
 * 媒体消息防撤回处理
 */
async function editMediaMessageToAntiRecall(
  client: TelegramClient,
  message: Api.Message,
  trollImagePath: string | null,
  chatEntity: any
): Promise<boolean> {
  // 只处理媒体消息（排除网页预览）
  if (!message.media || message.media instanceof Api.MessageMediaWebPage) {
    return false;
  }

  if (!trollImagePath || !fs.existsSync(trollImagePath)) {
    return false;
  }

  try {
    const uploadedFile = await client.uploadFile({
      file: new CustomFile(
        "dme_troll.jpg",
        fs.statSync(trollImagePath).size,
        trollImagePath
      ),
      workers: 1
    });

    await client.invoke(
      new Api.messages.EditMessage({
        peer: chatEntity,
        id: message.id,
        message: "",
        media: new Api.InputMediaUploadedPhoto({ file: uploadedFile })
      })
    );
    return true;
  } catch (error) {
    console.error("[DME] 编辑媒体消息失败:", error);
    return false;
  }
}

/**
 * 搜索并处理用户消息的主函数 - 静默版本
 */
async function searchEditAndDeleteMyMessages(
  client: TelegramClient,
  chatEntity: any,
  myId: bigint,
  userRequestedCount: number
): Promise<{ processedCount: number; actualCount: number; editedCount: number }> {
  // 检查是否为频道且有管理权限
  const isChannel = chatEntity.className === 'Channel';
  if (isChannel) {
    console.log(`[DME] 检测到频道，检查管理员权限...`);
    try {
      const me = await client.getMe();
      const participant = await client.invoke(
        new Api.channels.GetParticipant({
          channel: chatEntity,
          participant: me.id
        })
      );
      
      const isAdmin = participant.participant.className === 'ChannelParticipantAdmin' || 
                      participant.participant.className === 'ChannelParticipantCreator';
      
      if (isAdmin) {
        console.log(`[DME] 拥有频道管理权限，但仍使用普通模式避免误删别人消息`);
        console.log(`[DME] 如需删除所有消息，请使用其他管理工具`);
      } else {
        console.log(`[DME] 无频道管理权限，使用普通模式`);
      }
    } catch (error) {
      console.log(`[DME] 权限检查失败，使用普通模式:`, error);
    }
  }
  
  const targetCount = userRequestedCount === 999999 ? Infinity : userRequestedCount + 2;
  
  const allMyMessages: Api.Message[] = [];
  const processedIds = new Set<number>(); // 防止重复处理
  let offsetId = 0;
  let batchCount = 0;
  let hasReachedEnd = false;
  let totalSearched = 0;
  const RATE_LIMIT_DELAY = 2000; // 每批次间隔2秒避免触发限制

  console.log(`[DME] 开始搜索消息，目标数量: ${targetCount === Infinity ? '全部' : targetCount}`);

  // 搜索用户消息 - 永不终止直到到达聊天首条消息
  while (!hasReachedEnd && (targetCount === Infinity || allMyMessages.length < targetCount)) {
    batchCount++;
    try {
      const messages = await client.getMessages(chatEntity, {
        limit: 100,
        offsetId: offsetId,
      });

      if (messages.length === 0) {
        hasReachedEnd = true;
        console.log(`[DME] 已到达聊天记录末尾，共搜索 ${totalSearched} 条消息`);
        break;
      }
      
      totalSearched += messages.length;

      // 筛选自己的消息，避免重复
      const myMessages = messages.filter((m: Api.Message) => {
        if (!m?.id || !m?.senderId) return false;
        if (processedIds.has(m.id)) return false; // 跳过已处理的消息
        return m.senderId.toString() === myId.toString();
      });
      
      // 记录找到的消息
      if (myMessages.length > 0) {
        myMessages.forEach(m => processedIds.add(m.id));
        allMyMessages.push(...myMessages);
        console.log(`[DME] 批次 ${batchCount}: 找到 ${myMessages.length} 条消息，总计 ${allMyMessages.length} 条`);
      } else {
        console.log(`[DME] 批次 ${batchCount}: 本批次无自己的消息`);
      }
      
      if (messages.length > 0) {
        offsetId = messages[messages.length - 1].id;
      }

      // 如果不是无限模式且已达到目标数量，退出
      if (targetCount !== Infinity && allMyMessages.length >= targetCount) {
        console.log(`[DME] 已达到目标数量 ${targetCount}`);
        break;
      }
      
      // 智能延迟避免API限制
      await sleep(RATE_LIMIT_DELAY);
      
    } catch (error: any) {
      if (error.message?.includes("FLOOD_WAIT")) {
        const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
        console.log(`[DME] 触发API限制，休眠 ${waitTime} 秒...`);
        
        // 每10秒输出一次等待状态
        for (let i = waitTime; i > 0; i -= 10) {
          if (i % 10 === 0 || i < 10) {
            console.log(`[DME] 等待中... 剩余 ${i} 秒`);
          }
          await sleep(Math.min(i, 10) * 1000);
        }
        
        console.log(`[DME] 休眠结束，继续搜索...`);
        continue;
      }
      console.error("[DME] 搜索消息失败:", error);
      // 其他错误也不终止，等待后重试
      await sleep(5000);
      console.log(`[DME] 5秒后重试...`);
    }
  }

  // 处理找到的消息
  const messagesToProcess = targetCount === Infinity ? allMyMessages : allMyMessages.slice(0, targetCount);
  if (messagesToProcess.length === 0) {
    console.log(`[DME] 未找到任何需要处理的消息`);
    return { processedCount: 0, actualCount: 0, editedCount: 0 };
  }
  
  console.log(`[DME] 准备处理 ${messagesToProcess.length} 条消息`);

  // 分类消息：媒体消息和文字消息
  const mediaMessages = messagesToProcess.filter((m: Api.Message) => 
    m.media && !(m.media instanceof Api.MessageMediaWebPage)
  );

  let editedCount = 0;
  if (mediaMessages.length > 0) {
    console.log(`[DME] 处理 ${mediaMessages.length} 条媒体消息...`);
    const trollImagePath = await getTrollImage();
    
    const editTasks = mediaMessages.map(message => 
      editMediaMessageToAntiRecall(client, message, trollImagePath, chatEntity)
    );

    const results = await Promise.allSettled(editTasks);
    editedCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    console.log(`[DME] 成功编辑 ${editedCount} 条媒体消息`);
    
    await sleep(CONFIG.DELAYS.EDIT_WAIT);
  }

  // 删除消息
  console.log(`[DME] 开始删除 ${messagesToProcess.length} 条消息...`);
  const deleteIds = messagesToProcess.map((m: Api.Message) => m.id);
  let deletedCount = 0;
  let deleteBatch = 0;

  for (let i = 0; i < deleteIds.length; i += CONFIG.BATCH_SIZE) {
    deleteBatch++;
    const batch = deleteIds.slice(i, i + CONFIG.BATCH_SIZE);
    
    try {
      const batchDeleted = await deleteMessagesUniversal(client, chatEntity, batch);
      deletedCount += batchDeleted;
      console.log(`[DME] 删除批次 ${deleteBatch}: 成功删除 ${batchDeleted} 条，进度 ${deletedCount}/${deleteIds.length}`);
      
      await sleep(CONFIG.DELAYS.BATCH);
    } catch (error: any) {
      if (error.message?.includes("FLOOD_WAIT")) {
        const waitTime = parseInt(error.message.match(/\d+/)?.[0] || "60");
        console.log(`[DME] 删除时触发API限制，休眠 ${waitTime} 秒...`);
        
        for (let j = waitTime; j > 0; j -= 10) {
          if (j % 10 === 0 || j < 10) {
            console.log(`[DME] 删除等待中... 剩余 ${j} 秒`);
          }
          await sleep(Math.min(j, 10) * 1000);
        }
        
        i -= CONFIG.BATCH_SIZE; // 重试当前批次
        console.log(`[DME] 休眠结束，重试批次 ${deleteBatch}`);
      } else {
        console.error("[DME] 删除批次失败:", error);
        // 其他错误等待后继续
        await sleep(5000);
      }
    }
  }
  
  console.log(`[DME] 删除完成，共删除 ${deletedCount} 条消息`);

  return { processedCount: deletedCount, actualCount: messagesToProcess.length, editedCount };
}

// 已移除频道直接删除功能，避免误删别人消息
// 所有情况下都使用普通模式，只删除自己的消息

const dmePlugin: Plugin = {
  command: ["dme"],
  description: `智能防撤回删除插件
- 媒体消息：防撤回图片替换
- 文字消息：直接删除提升速度
- 支持所有聊天类型`,
  cmdHandler: async (msg: Api.Message) => {
    const text = msg.message || "";
    const chatId = msg.chatId?.toString() || msg.peerId?.toString() || "";
    const args = text.trim().split(/\s+/);
    const countArg = args[1];

    const client = await getGlobalClient();
    if (!client) {
      await msg.edit({ text: "❌ 客户端未初始化", parseMode: "html" });
      return;
    }

    if (!countArg) {
      const helpMsg = `<b>🛡️ 智能防撤回删除插件 - DME 优化版</b>

<b>用法:</b> <code>.dme [数量]</code>

<b>核心特性:</b>
• 🧠 <b>智能策略</b>：媒体消息防撤回，文字消息快速删除
• 🖼️ <b>媒体消息</b>：替换为防撤回图片（真正防撤回）
• 📝 <b>文字消息</b>：直接删除（提升速度）
• ➕ <b>智能+2</b>：实际处理数量=输入数量+2
• ⚡ <b>性能优化</b>：批量处理，减少API调用
• 🌍 支持所有聊天类型
<b>工作流程:</b>
1️⃣ 搜索历史消息 → 2️⃣ 分类处理 → 3️⃣ 媒体防撤回 → 4️⃣ 批量删除`;
      
      await msg.edit({
        text: helpMsg,
        parseMode: "html",
        linkPreview: false
      });
      return;
    }

    const userRequestedCount = parseInt(countArg);
    if (isNaN(userRequestedCount) || userRequestedCount <= 0) {
      await msg.edit({ 
        text: "❌ <b>参数错误:</b> 数量必须是正整数", 
        parseMode: "html" 
      });
      return;
    }

    try {
      const me = await client.getMe();
      const myId = BigInt(me.id.toString());
      
      const chatEntity = await getEntityWithHash(client, chatId);

      // 删除命令消息
      try {
        await client.deleteMessages(chatEntity as any, [msg.id], { revoke: true });
      } catch {}

      // 执行主要操作 - 静默模式，不发送任何进度消息
      console.log(`[DME] ========== 开始执行DME任务 ==========`);
      console.log(`[DME] 聊天ID: ${chatId}`);
      console.log(`[DME] 请求数量: ${userRequestedCount}`);
      const startTime = Date.now();
      
      const result = await searchEditAndDeleteMyMessages(client, chatEntity as any, myId, userRequestedCount);
      
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`[DME] ========== 任务完成 ==========`);
      console.log(`[DME] 总耗时: ${duration} 秒`);
      console.log(`[DME] 处理消息: ${result.processedCount} 条`);
      console.log(`[DME] 编辑媒体: ${result.editedCount} 条`);
      console.log(`[DME] =============================`);

    } catch (error: any) {
      console.error("[DME] 操作失败:", error);
      // 静默模式：不显示错误消息
    }
  },
};

export default dmePlugin;
