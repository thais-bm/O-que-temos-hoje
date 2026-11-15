
/**
 * Camada de integração com a API FastAPI.
 *
 * O backend Python é a fonte oficial dos dados e recomendações.
 * Não existe fallback automático para o motor local.
 */

export const DEFAULT_API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '')

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

async function requestJson(url, options = {}, timeoutMs = 10000) {
  let response

  try {
    response = await fetchWithTimeout(url, options, timeoutMs)
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('O backend demorou demais para responder.')
    }

    throw new Error(
      `Não foi possível conectar ao backend: ${error.message}`
    )
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      payload?.detail ||
      payload?.message ||
      `Erro HTTP ${response.status}`

    throw new Error(
      typeof detail === 'string' ? detail : JSON.stringify(detail)
    )
  }

  if (payload === null) {
    throw new Error('O backend retornou uma resposta JSON inválida.')
  }

  return payload
}

/**
 * Verifica se o servidor FastAPI está online.
 *
 * GET /health
 */
export async function checkBackendHealth(baseUrl = DEFAULT_API_URL) {
  try {
    const info = await requestJson(
      `${baseUrl.replace(/\/+$/, '')}/health`,
      { method: 'GET' },
      3000
    )

    return {
      online: info.status === 'ok',
      baseUrl,
      info,
    }
  } catch (error) {
    return {
      online: false,
      baseUrl,
      info: null,
      error: error.message,
    }
  }
}

/**
 * Consulta uma página do catálogo.
 *
 * GET /games?search=&tag=&limit=&offset=
 */
export async function fetchGamesApi({
  search = '',
  tag = '',
  limit = 24,
  offset = 0,
  baseUrl = DEFAULT_API_URL,
} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('O limite do catálogo deve estar entre 1 e 100.')
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('O offset do catálogo deve ser um inteiro não negativo.')
  }

  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  if (search.trim()) params.set('search', search.trim())
  if (tag && tag !== 'ALL') params.set('tag', tag)

  const payload = await requestJson(
    `${baseUrl.replace(/\/+$/, '')}/games?${params}`,
    { method: 'GET' },
    15000
  )

  if (!Array.isArray(payload.games)) {
    throw new Error('Formato inválido: o catálogo não contém games.')
  }

  return {
    games: payload.games,
    total: payload.total,
    limit: payload.limit,
    offset: payload.offset,
    hasMore: payload.has_more,
  }
}

/**
 * Consulta todas as tags disponíveis no catálogo.
 *
 * GET /tags
 */
export async function fetchTagsApi(baseUrl = DEFAULT_API_URL) {
  const payload = await requestJson(
    `${baseUrl.replace(/\/+$/, '')}/tags`,
    { method: 'GET' },
    10000
  )

  if (!Array.isArray(payload.tags)) {
    throw new Error('Formato inválido: o backend não retornou tags.')
  }

  return payload.tags
}

/**
 * Pesquisa um usuário por ID ou lista usuários com paginação.
 *
 * GET /users/search?user_id=
 * GET /users/search?after=&limit=
 */
export async function fetchUsersApi({
  userId,
  after,
  limit = 20,
  baseUrl = DEFAULT_API_URL,
} = {}) {
  const params = new URLSearchParams()

  if (userId !== undefined && userId !== null && String(userId).trim() !== '') {
    const parsedId = Number(userId)

    if (!Number.isSafeInteger(parsedId) || parsedId < 0) {
      throw new Error('Informe um user_id válido.')
    }

    params.set('user_id', String(parsedId))
  } else {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('O limite de usuários deve estar entre 1 e 100.')
    }

    if (after !== undefined && after !== null) {
      if (!Number.isSafeInteger(after) || after < 0) {
        throw new Error('O cursor deve ser um inteiro não negativo.')
      }

      params.set('after', String(after))
    }

    params.set('limit', String(limit))
  }

  const payload = await requestJson(
    `${baseUrl.replace(/\/+$/, '')}/users/search?${params}`,
    { method: 'GET' },
    10000
  )

  if (!Array.isArray(payload.users)) {
    throw new Error('Formato inválido: o backend não retornou users.')
  }

  return payload
}

/**
 * Busca recomendações personalizadas para um usuário existente.
 *
 * GET /users/{user_id}/recommendations
 */
export async function fetchUserRecommendationsApi(
  userId,
  {
    topN = 10,
    excludeConsumed = true,
    baseUrl = DEFAULT_API_URL,
  } = {}
) {
  if (
    userId === undefined ||
    userId === null ||
    String(userId).trim() === ''
  ) {
    throw new Error('Informe um user_id válido.')
  }

  if (!Number.isInteger(topN) || topN < 1 || topN > 50) {
    throw new Error('topN deve ser um inteiro entre 1 e 50.')
  }

  const params = new URLSearchParams({
    top_n: String(topN),
    exclude_consumed: String(Boolean(excludeConsumed)),
  })

  const payload = await requestJson(
    `${baseUrl.replace(/\/+$/, '')}/users/${encodeURIComponent(userId)}/recommendations?${params}`,
    { method: 'GET' },
    30000
  )

  if (!Array.isArray(payload.recommendations)) {
    throw new Error(
      'Formato inválido: o backend não retornou recommendations.'
    )
  }

  return {
    fromApi: true,
    rawList: payload.recommendations,
    payload,
  }
}

/**
 * Busca recomendações para novos usuários sem histórico.
 *
 * POST /recommendations/cold-start
 */
export async function fetchColdStartRecommendationsApi(
  {
    appIds = [],
    tags = [],
    topN = 10,
    baseUrl = DEFAULT_API_URL,
  } = {}
) {
  if (!Array.isArray(appIds) || !Array.isArray(tags)) {
    throw new Error('Jogos e tags devem ser informados em listas.')
  }

  if (appIds.length === 0 && tags.length === 0) {
    throw new Error('Escolha pelo menos um jogo ou uma tag.')
  }

  if (appIds.length > 20) {
    throw new Error('Escolha no máximo 20 jogos de referência.')
  }

  if (tags.length > 50) {
    throw new Error('Escolha no máximo 50 tags.')
  }

  if (!Number.isInteger(topN) || topN < 1 || topN > 50) {
    throw new Error('topN deve ser um inteiro entre 1 e 50.')
  }

  const payload = await requestJson(
    `${baseUrl.replace(/\/+$/, '')}/recommendations/cold-start`,
    {
      method: 'POST',
      body: JSON.stringify({
        app_ids: appIds.map(Number),
        tags,
        top_n: topN,
      }),
    },
    30000
  )

  if (!Array.isArray(payload.recommendations)) {
    throw new Error(
      'Formato inválido: o backend não retornou recommendations.'
    )
  }

  return {
    fromApi: true,
    rawList: payload.recommendations,
    payload,
  }
}
