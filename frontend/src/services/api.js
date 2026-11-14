/**
 * Camada de integração com a API FastAPI (recommender/src/api/main.py).
 * Suporta conexão em tempo real com http://localhost:8000 e fallback transparente
 * para o motor FBC no navegador (alimentado pelos dados reais de data/raw/).
 */

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function fetchWithTimeout(url, options = {}, timeoutMs = 1800) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    clearTimeout(timer)
    return response
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

/**
 * Verifica se o servidor FastAPI está online
 */
export async function checkBackendHealth(baseUrl = DEFAULT_API_URL) {
  const urlsToTry = [`${baseUrl}/health`, `${baseUrl}/`]
  for (const url of urlsToTry) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 1200)
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        return { online: true, baseUrl, info: data }
      }
    } catch {
      // Continua tentando próxima rota
    }
  }
  return { online: false, baseUrl, info: null }
}

/**
 * Busca recomendações Top-N para um user_id na API FastAPI.
 * Suporta múltiplos formatos de resposta ({ recommendations: [...] } ou lista de app_ids/objetos).
 */
export async function fetchUserRecommendationsApi(
  userId,
  { topN = 10, excludeConsumed = true, baseUrl = DEFAULT_API_URL } = {}
) {
  const endpoints = [
    `${baseUrl}/users/${userId}/recommendations?top_n=${topN}&exclude_consumed=${excludeConsumed}`,
    `${baseUrl}/recommend/${userId}?top_n=${topN}&exclude_consumed=${excludeConsumed}`,
    `${baseUrl}/recommendations?user_id=${userId}&top_n=${topN}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 2500)
      if (res.ok) {
        const payload = await res.json()
        const list = Array.isArray(payload)
          ? payload
          : payload.recommendations || payload.items || payload.app_ids || []
        return { fromApi: true, rawList: list, payload }
      }
    } catch {
      // Tenta próximo formato de rota
    }
  }
  return { fromApi: false, rawList: null, payload: null }
}

/**
 * Busca métricas de avaliação offline na API FastAPI caso o endpoint exista
 */
export async function fetchEvaluationMetricsApi(baseUrl = DEFAULT_API_URL) {
  const endpoints = [`${baseUrl}/evaluation`, `${baseUrl}/metrics`, `${baseUrl}/evaluation/metrics`]
  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 2000)
      if (res.ok) {
        const data = await res.json()
        return { fromApi: true, data }
      }
    } catch {
      // Fallback para dados offline
    }
  }
  return { fromApi: false, data: null }
}

export { DEFAULT_API_URL }
