import { z } from 'zod'

/** Body do POST /webhooks: URL válida e payload JSON (objeto com qualquer campo). */
export const createWebhookBody = z.object({
    url: z.url(),
    payload: z.looseObject({})
})

/** Headers do POST /webhooks: Idempotency-Key obrigatório. */
export const createWebhookHeaders = z.object({
    'idempotency-key': z.string().min(1)
})

/** `:id` da URL: chega como string, é convertido (coerce) e precisa ser inteiro >= 1. */
export const webhookIdParams = z.object({
    id: z.coerce.number().min(1).int()
})

export type CreateWebhookBody = z.infer<typeof createWebhookBody>
export type CreateWebhookHeaders = z.infer<typeof createWebhookHeaders>
export type WebhookIdParams = z.infer<typeof webhookIdParams>
