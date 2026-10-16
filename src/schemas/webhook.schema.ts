import { z } from 'zod'

export const createWebhookBody = z.object({
    url: z.url(),
    payload: z.looseObject({})
})

export const createWebhookHeaders = z.object({
    'idempotency-key': z.string().min(1)
})

export type CreateWebhookBody = z.infer<typeof createWebhookBody>
export type CreateWebhookHeaders = z.infer<typeof createWebhookHeaders>
