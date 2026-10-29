import 'dotenv/config'

/** Lê uma variável obrigatória; derruba o processo na inicialização se estiver faltando. */
function required(key: string) : string {
    const value = process.env[key]
    if (!value){
        throw new Error(`Missing environment variable: ${key}` )
    }
    return value
}

/** Configuração tipada a partir do `.env` (veja `.env.example`). */
export const env = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 3000), 
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: required('REDIS_URL'),
    WEBHOOK_SECRET: required('WEBHOOK_SECRET'),
    DELIVERY_TIMEOUT_MS: Number(process.env.DELIVERY_TIMEOUT_MS ?? 10000),
    DELIVERY_ATTEMPTS: Number(process.env.DELIVERY_ATTEMPTS ?? 5),
    DELIVERY_BACKOFF_MS: Number(process.env.DELIVERY_BACKOFF_MS ?? 1000)
}