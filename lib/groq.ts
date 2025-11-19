import Groq from 'groq-sdk';

/**
 * Cliente de Groq configurado con la API key del entorno
 * IMPORTANTE: Solo usar en el servidor (API Routes), nunca en el cliente
 */
export const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Modelo por defecto a utilizar
 * Opciones populares:
 * - llama-3.3-70b-versatile (recomendado, rápido y potente)
 * - llama-3.1-70b-versatile
 * - mixtral-8x7b-32768
 * - gemma2-9b-it
 */
export const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Verificar que la API key está configurada
 */
export function validateGroqConfig() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY no está configurada en las variables de entorno. ' +
      'Por favor, agrega GROQ_API_KEY en tu archivo .env.local'
    );
  }
}
