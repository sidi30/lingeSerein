import { Queue, type ConnectionOptions } from "bullmq";

/**
 * Queue names used across the application.
 */
export const QUEUE_NAMES = {
  NOTIFICATIONS: "notifications",
  STOCK_ALERTS: "stock-alerts",
  INVOICES: "invoices",
  QUOTE_EXPIRY: "quote-expiry",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Creates a BullMQ Queue for the given name and Redis connection.
 */
export function createQueue(name: QueueName, connection: ConnectionOptions): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
}
