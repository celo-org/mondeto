// Mondeto support bot entry point.
//
// Phase 1 of the support-agents rollout:
//   - Listen on the Telegram support group
//   - Route each message via the Haiku classifier
//   - Generate a specialist draft (UI/UX | Financial | Campaign)
//   - Log the routing + draft to tickets.jsonl
//   - Do NOT reply in the group (observation only)
//
// Once the routing accuracy looks solid in the log, flip the per-category
// AUTOREPLY flags below to true.

import 'dotenv/config'
import { Bot } from 'grammy'
import { routeMessage } from './router.js'
import { draftUiUxIssue } from './agents/ui-ux.js'
import { draftFinancialTicket } from './agents/financial.js'
import { draftCampaignTicket } from './agents/campaign.js'
import { logEntry, captureError, shutdown } from './log.js'

const AUTOREPLY = {
  ui_ux: false,
  financial: false,
  campaign: false,
  other: false,
} as const

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN not set — see .env.example')
}

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN)

bot.command('start', (ctx) =>
  ctx.reply(
    "I'm the Mondeto support bot — I read messages here and route them to the right human. For urgent issues, mention what happened, your tx hash if any, and your phone/wallet alias.",
  ),
)

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text
  if (!text || text.length < 3) return
  if (text.startsWith('/')) return

  const userId = ctx.from?.id
  const username = ctx.from?.username
  const messageId = ctx.message.message_id
  const chatId = ctx.chat.id

  if (!userId) return

  const userTag = username ? `@${username}` : `tg:${userId}`

  try {
    const routed = await routeMessage(text)
    console.log(
      `[route] ${userTag}: ${routed.category} (${routed.confidence.toFixed(2)}) — ${routed.reason}`,
    )

    let draft: unknown = null
    if (routed.confidence >= 0.6) {
      if (routed.category === 'ui_ux') {
        draft = await draftUiUxIssue({ message: text, user: userTag })
      } else if (routed.category === 'financial') {
        draft = await draftFinancialTicket({ message: text, user: userTag })
      } else if (routed.category === 'campaign') {
        draft = await draftCampaignTicket({ message: text, user: userTag })
      }
    }

    await logEntry({
      telegram_message_id: messageId,
      telegram_user_id: userId,
      telegram_username: username,
      chat_id: chatId,
      text,
      category: routed.category,
      confidence: routed.confidence,
      reason: routed.reason,
      draft,
    })

    if (AUTOREPLY[routed.category]) {
      await ctx.reply(
        '(auto-reply placeholder — wire real replies once routing accuracy is validated)',
        { reply_parameters: { message_id: messageId } },
      )
    }
  } catch (err) {
    console.error('[error]', userTag, err)
    captureError(err, { telegram_user_id: userId, telegram_message_id: messageId })
  }
})

bot.catch((err) => {
  console.error('[bot error]', err)
  captureError(err)
})

// Flush PostHog buffers on a clean shutdown so we don't lose the last few
// events when the container/process exits.
const onExit = async (signal: string) => {
  console.log(`[bot] received ${signal}, shutting down…`)
  try {
    await bot.stop()
  } finally {
    await shutdown()
    process.exit(0)
  }
}
process.on('SIGINT', () => void onExit('SIGINT'))
process.on('SIGTERM', () => void onExit('SIGTERM'))

console.log('Mondeto support bot starting…')
bot.start({
  onStart: (me) => console.log(`Logged in as @${me.username}`),
})
