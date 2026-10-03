import 'dotenv/config'

function required(key: string) : string {
    const value = process.env[key]
    if (!value){
        throw new Error(`Missing environment variable: ${key}` )
    }
    return value
}

export const env = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: Number(process.env.PORT ?? 3000), 
    DATABASE_URL: required('DATABASE_URL'),
    REDIS_URL: required('REDIS_URL')
}