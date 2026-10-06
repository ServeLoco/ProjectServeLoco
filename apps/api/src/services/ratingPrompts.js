/**
 * "How was your food?" push, once per Delivered order.
 *
 * RATING_PROMPT_DELAY_MINUTES (30) after delivery, a customer who has not
 * rated anything in that order yet gets one notification. Tapping it opens
 * the Orders page on that order, where every item has 5 stars.
 *
 * A poll rather than a timer per order: nothing in the three Delivered paths
 * (admin, rider, admin-for-rider) changes, and a restart loses nothing.
 * The notification row's uniq_notification_event key (INSERT IGNORE) makes a
 * second send impossible; the NOT EXISTS below just stops each tick from
 * re-trying orders it already prompted. Orders delivered more than
 * MAX_AGE_MINUTES ago are skipped, so downtime never sends stale prompts.
 */
const config = require('../config/env');
const { pool } = require('../db/mysql');
const { listAreas } = require('../utils/areaScope');
const { istExprOf } = require('../utils/businessTime');
const notificationService = require('../utils/notificationService');
const realtimeEvents = require('../realtime/orderEvents');
const logger = require('../utils/logger');

const EVENT_KEY = 'rate_prompt';
const ACTION_TYPE = 'rate_order';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BOOT_DELAY_MS = 2 * 60 * 1000;
const MAX_AGE_MINUTES = 180;
const BATCH_LIMIT = 100;

let bootTimer = null;
let sweepTimer = null;
let running = false;

const findOrdersToPrompt = async (areaId, delayMinutes) => {
  const [rows] = await pool.query(
    `SELECT o.id, o.order_number, o.customer_id,
            DATE_FORMAT(${istExprOf('o.created_at')}, '%Y-%m-%d') AS order_date
       FROM orders o
      WHERE o.area_id = ? AND o.status = 'Delivered'
        AND o.created_at >= NOW() - INTERVAL 1 DAY
        AND o.delivered_at <= NOW() - INTERVAL ? MINUTE
        AND o.delivered_at >= NOW() - INTERVAL ? MINUTE
        AND NOT EXISTS (
          SELECT 1 FROM order_item_ratings r
           WHERE r.order_id = o.id AND r.area_id = o.area_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = o.customer_id AND n.source_type = 'order'
             AND n.source_id = o.id AND n.event_key = ?
        )
      ORDER BY o.delivered_at
      LIMIT ?`,
    [areaId, delayMinutes, MAX_AGE_MINUTES, EVENT_KEY, BATCH_LIMIT]
  );
  return rows;
};

const sendPrompt = async (order) => {
  const orderNumber = order.order_number || order.id;
  const result = await notificationService.createNotification({
    userId: order.customer_id,
    title: '⭐ How was your food?',
    body: `Tap to rate your order #${orderNumber}. Just tap the stars.`,
    type: 'info',
    sourceType: 'order',
    sourceId: order.id,
    eventKey: EVENT_KEY,
    actionType: ACTION_TYPE,
    actionPayload: { orderId: order.id, orderNumber, orderDate: order.order_date },
  });
  await realtimeEvents.emitNotificationCreated(order.customer_id, result);
  return result;
};

/**
 * One pass over every area (background jobs have no req.areaId — §9 H2).
 * @returns {Promise<number>} prompts sent
 */
const sendDueRatingPrompts = async ({ delayMinutes = config.RATING_PROMPT_DELAY_MINUTES } = {}) => {
  let sent = 0;
  for (const area of await listAreas()) {
    let orders;
    try {
      orders = await findOrdersToPrompt(area.id, delayMinutes);
    } catch (error) {
      logger.error({ err: error, areaId: area.id }, '[rating-prompts] lookup failed');
      continue;
    }
    for (const order of orders) {
      try {
        const result = await sendPrompt(order);
        if (result?.affectedRows > 0) sent += 1;
      } catch (error) {
        logger.error({ err: error, orderId: order.id }, '[rating-prompts] send failed');
      }
    }
  }
  return sent;
};

const runSweep = async () => {
  if (running) return;
  running = true;
  try {
    const sent = await sendDueRatingPrompts();
    if (sent > 0) logger.info({ sent }, '[rating-prompts] sent');
  } catch (error) {
    logger.error({ err: error }, '[rating-prompts] sweep failed');
  } finally {
    running = false;
  }
};

const startRatingPromptScheduler = () => {
  if (sweepTimer || bootTimer) return;
  bootTimer = setTimeout(() => {
    bootTimer = null;
    runSweep();
    sweepTimer = setInterval(runSweep, SWEEP_INTERVAL_MS);
    sweepTimer.unref();
  }, BOOT_DELAY_MS);
  bootTimer.unref();
};

const stopRatingPromptScheduler = () => {
  if (bootTimer) clearTimeout(bootTimer);
  if (sweepTimer) clearInterval(sweepTimer);
  bootTimer = null;
  sweepTimer = null;
};

module.exports = {
  EVENT_KEY,
  ACTION_TYPE,
  sendDueRatingPrompts,
  startRatingPromptScheduler,
  stopRatingPromptScheduler,
};
