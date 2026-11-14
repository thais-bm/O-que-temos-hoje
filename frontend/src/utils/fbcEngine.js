/**
 * Motor de Filtragem Baseada em Conteúdo (FBC) — Espelho matemático de:
 * - recommender/src/data/preprocess.py (TF-IDF + Multi-hot Tags + MinMaxScaler Numerics)
 * - recommender/src/models/recommender.py (Perfil ponderado por horas + Similaridade do Cosseno)
 *
 * Usado para calcular explicabilidade detalhada (contribuição real de cada feature no produto interno)
 * e como fallback determinístico quando o backend FastAPI não está em execução.
 */

const EN_PT_STOPWORDS = new Set([
  'the', 'and', 'to', 'of', 'in', 'a', 'is', 'for', 'on', 'with', 'as', 'are', 'that', 'this',
  'by', 'be', 'at', 'or', 'from', 'an', 'your', 'you', 'it', 'can', 'will', 'into', 'all',
  'have', 'has', 'more', 'new', 'their', 'up', 'out', 'who', 'which', 'when', 'where', 'how',
  'over', 'through', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'about', 'against', 'between', 'into', 'during', 'before',
  'after', 'above', 'below', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'all',
  'any', 'both', 'each', 'few', 'other', 'some', 'such', 'game', 'play', 'player', 'players',
  'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'nao', 'uma', 'os', 'no',
  'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'ao', 'ele', 'das', 'seu', 'sua'
])

/**
 * Limpeza e stemming simplificado compatível com preprocess.py:clean_text
 */
export function cleanText(text) {
  if (!text || typeof text !== 'string') return []
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && /^[a-z]+$/.test(t) && !EN_PT_STOPWORDS.has(t))
    .map((t) =>
      t
        .replace(/(ing|ed|ly|es|s)$/, '')
        .replace(/(ational|tional)$/, 'tion')
    )
    .filter((t) => t.length > 2)
}

/**
 * Constrói a representação vetorial esparsa/densa dos itens do catálogo:
 * - TF-IDF (normalizado L2) das descrições limpas
 * - Multi-hot (binário) das tags da Steam
 * - Atributos numéricos escalonados com MinMaxScaler (price_final, positive_ratio, user_reviews, discount)
 */
export function buildCatalogModel(games) {
  const N = games.length
  if (N === 0) return null

  // 1. Tokenização das descrições (usa cleaned_tokens pré-computados pelo NLTK SnowballStemmer se disponível)
  const docTokens = games.map((g) => {
    if (Array.isArray(g.cleaned_tokens) && g.cleaned_tokens.length > 0) {
      return g.cleaned_tokens
    }
    return cleanText(g.description || '')
  })

  // Frequência de documentos (DF) para cada termo
  const dfMap = new Map()
  docTokens.forEach((tokens) => {
    const unique = new Set(tokens)
    unique.forEach((term) => {
      dfMap.set(term, (dfMap.get(term) || 0) + 1)
    })
  })

  // Seleciona os top termos mais informativos (presentes em pelo menos 2 jogos ou top vocabulário)
  const sortedTerms = Array.from(dfMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 350)
    .map(([term]) => term)

  const vocabIndex = new Map(sortedTerms.map((t, i) => [t, i]))
  const idf = sortedTerms.map((term) => {
    const df = dfMap.get(term) || 1
    // Fórmula padrão do scikit-learn TfidfVectorizer (smooth_idf=True)
    return Math.log((1 + N) / (1 + df)) + 1
  })

  // 2. Coleta de todas as tags únicas (Multi-hot)
  const tagSet = new Set()
  games.forEach((g) => {
    ;(g.tags || []).forEach((tag) => tagSet.add(tag))
  })
  const allTags = Array.from(tagSet).sort()
  const tagIndex = new Map(allTags.map((t, i) => [t, i]))

  // 3. MinMaxScaler para atributos numéricos
  const numCols = ['price_final', 'positive_ratio', 'user_reviews', 'discount']
  const mins = {}
  const maxs = {}
  numCols.forEach((col) => {
    const vals = games.map((g) => Number(g[col] || 0))
    mins[col] = Math.min(...vals)
    maxs[col] = Math.max(...vals)
  })

  // Nomes das features (mesmo padrão de preprocess.py)
  const features = [
    ...sortedTerms.map((t) => ({ name: `tfidf::${t}`, label: t, group: 'tfidf' })),
    ...allTags.map((t) => ({ name: `tag::${t}`, label: t, group: 'tag' })),
    ...numCols.map((c) => ({ name: `num::${c}`, label: c, group: 'num' })),
  ]

  const dim = features.length
  const tfidfCount = sortedTerms.length
  const tagCount = allTags.length

  // Constrói vetores de cada item e calcula norma L2
  const itemVectors = new Map()
  const itemNorms = new Map()
  const gamesById = new Map()

  games.forEach((g, docIdx) => {
    const vec = new Float64Array(dim)

    // TF-IDF com normalização L2 na parte textual (como sklearn TfidfVectorizer)
    const tokens = docTokens[docIdx]
    const tfCounts = new Map()
    tokens.forEach((t) => {
      if (vocabIndex.has(t)) {
        tfCounts.set(t, (tfCounts.get(t) || 0) + 1)
      }
    })
    let tfidfNormSq = 0
    tfCounts.forEach((count, term) => {
      const idx = vocabIndex.get(term)
      const val = count * idf[idx]
      vec[idx] = val
      tfidfNormSq += val * val
    })
    if (tfidfNormSq > 0) {
      const tfidfNorm = Math.sqrt(tfidfNormSq)
      tfCounts.forEach((_, term) => {
        const idx = vocabIndex.get(term)
        vec[idx] /= tfidfNorm
      })
    }

    // Multi-hot de tags
    ;(g.tags || []).forEach((tag) => {
      const idx = tagIndex.get(tag)
      if (idx !== undefined) {
        vec[tfidfCount + idx] = 1.0
      }
    })

    // Numéricos escalonados [0, 1]
    numCols.forEach((col, cIdx) => {
      const val = Number(g[col] || 0)
      const range = maxs[col] - mins[col]
      vec[tfidfCount + tagCount + cIdx] = range > 0 ? (val - mins[col]) / range : 0.0
    })

    let normSq = 0
    for (let i = 0; i < dim; i++) {
      normSq += vec[i] * vec[i]
    }

    itemVectors.set(g.app_id, vec)
    itemNorms.set(g.app_id, Math.sqrt(normSq) || 1e-9)
    gamesById.set(g.app_id, g)
  })

  return {
    games,
    gamesById,
    features,
    itemVectors,
    itemNorms,
    dim,
    tfidfCount,
    tagCount,
  }
}

/**
 * Calcula similaridade do cosseno entre dois vetores
 */
export function cosineSimilarityVec(vecA, normA, vecB, normB) {
  if (!vecA || !vecB || normA <= 0 || normB <= 0) return 0
  let dot = 0
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i]
  }
  return dot / (normA * normB)
}

/**
 * Constrói o vetor de perfil do usuário (média ponderada pelas horas jogadas)
 * e gera o ranking Top-N com explicações matemáticas detalhadas.
 */
export function computeRecommendations(model, interactions, options = {}) {
  const {
    topN = 10,
    excludeConsumed = true,
    useNegativeDislikes = false,
    useMmr = false,
    mmrLambda = 0.75,
    selectedTags = [],
    isNewUser = false,
  } = options

  if (
    !model ||
    ((!interactions || interactions.length === 0) && (!selectedTags || selectedTags.length === 0))
  ) {
    return {
      recommendations: [],
      popularityBaseline: [],
      randomBaseline: [],
      intraListDiversity: 0,
      profileSummary: {
        topTags: [],
        topTerms: [],
        numericProfile: {},
        totalHours: 0,
        validGames: 0,
        historyWithWeight: [],
      },
    }
  }

  const { games, gamesById, features, itemVectors, itemNorms, dim } = model

  const profileVec = new Float64Array(dim)
  const consumedIds = new Set()
  const validHistory = []
  let weightSum = 0
  let totalHours = 0

  // 1. Incorpora jogos consumidos (usuário existente com horas) ou jogos de referência (novo usuário, peso uniforme = 1)
  ;(interactions || []).forEach((inter) => {
    const appId = Number(inter.app_id)
    const vec = itemVectors.get(appId)
    if (!vec) return

    consumedIds.add(appId)
    const rawHours = isNewUser ? 1.0 : Math.max(0.5, Number(inter.hours) || 1.0)
    if (!isNewUser) {
      totalHours += rawHours
    }

    const isRec = inter.is_recommended !== false
    const signedWeight = useNegativeDislikes && !isRec ? -0.35 * rawHours : rawHours

    for (let i = 0; i < dim; i++) {
      profileVec[i] += vec[i] * signedWeight
    }
    weightSum += Math.abs(signedWeight)
    validHistory.push({
      ...inter,
      app_id: appId,
      hours: isNewUser ? null : rawHours,
      signedWeight,
      game: gamesById.get(appId),
    })
  })

  // 2. Incorpora gêneros/tags escolhidos diretamente pelo Novo Usuário (Cold Start de Gêneros)
  if (selectedTags && selectedTags.length > 0) {
    const tagSet = new Set(selectedTags)
    features.forEach((feat, idx) => {
      if (feat.group === 'tag' && tagSet.has(feat.label)) {
        profileVec[idx] += 1.5
        weightSum += 1.5
      }
    })
  }

  if (weightSum <= 0) {
    return {
      recommendations: [],
      popularityBaseline: [],
      randomBaseline: [],
      intraListDiversity: 0,
      profileSummary: {
        topTags: [],
        topTerms: [],
        numericProfile: {},
        totalHours: 0,
        validGames: 0,
        historyWithWeight: [],
      },
    }
  }

  let profileNormSq = 0
  for (let i = 0; i < dim; i++) {
    profileVec[i] /= weightSum
    profileNormSq += profileVec[i] * profileVec[i]
  }
  const profileNorm = Math.sqrt(profileNormSq) || 1e-9

  // Extrai o resumo do perfil do usuário (Top Tags e Top Termos TF-IDF no vetor do usuário)
  const tagWeights = []
  const termWeights = []
  const numericProfile = {}

  for (let i = 0; i < dim; i++) {
    const val = profileVec[i]
    if (val <= 0) continue
    const feat = features[i]
    if (feat.group === 'tag') {
      tagWeights.push({ label: feat.label, weight: val })
    } else if (feat.group === 'tfidf') {
      termWeights.push({ label: feat.label, weight: val })
    } else if (feat.group === 'num') {
      numericProfile[feat.label] = val
    }
  }

  tagWeights.sort((a, b) => b.weight - a.weight)
  termWeights.sort((a, b) => b.weight - a.weight)

  // Calcula similaridade do cosseno para cada candidato
  const candidates = []
  games.forEach((game) => {
    const appId = game.app_id
    const isConsumed = consumedIds.has(appId)
    if (excludeConsumed && isConsumed) return

    const itemVec = itemVectors.get(appId)
    const itemNorm = itemNorms.get(appId)
    const sim = cosineSimilarityVec(profileVec, profileNorm, itemVec, itemNorm)

    candidates.push({
      game,
      app_id: appId,
      similarity: sim,
      isConsumed,
    })
  })

  // Ordena por similaridade decrescente
  candidates.sort((a, b) => b.similarity - a.similarity)

  // Se MMR (Maximal Marginal Relevance - Bônus Seção 3.4) estiver ativo, re-ranqueia visando diversidade
  let selectedCandidates = []
  if (useMmr && candidates.length > 0) {
    const pool = candidates.slice(0, Math.min(40, candidates.length))
    while (selectedCandidates.length < topN && pool.length > 0) {
      let bestIdx = 0
      let bestScore = -Infinity

      for (let i = 0; i < pool.length; i++) {
        const cand = pool[i]
        const candVec = itemVectors.get(cand.app_id)
        const candNorm = itemNorms.get(cand.app_id)

        let maxSimToSelected = 0
        for (const sel of selectedCandidates) {
          const selVec = itemVectors.get(sel.app_id)
          const selNorm = itemNorms.get(sel.app_id)
          const s = cosineSimilarityVec(candVec, candNorm, selVec, selNorm)
          if (s > maxSimToSelected) maxSimToSelected = s
        }

        const mmrScore =
          selectedCandidates.length === 0
            ? cand.similarity
            : mmrLambda * cand.similarity - (1 - mmrLambda) * maxSimToSelected

        if (mmrScore > bestScore) {
          bestScore = mmrScore
          bestIdx = i
        }
      }

      const [picked] = pool.splice(bestIdx, 1)
      picked.mmrScore = bestScore
      selectedCandidates.push(picked)
    }
  } else {
    selectedCandidates = candidates.slice(0, topN)
  }

  // Para cada item no Top-N, calcula a EXPLICABILIDADE MATEMÁTICA REAL
  const denomBase = profileNorm
  const explainedRecommendations = selectedCandidates.map((cand, rankIdx) => {
    const itemVec = itemVectors.get(cand.app_id)
    const itemNorm = itemNorms.get(cand.app_id)
    const denom = denomBase * itemNorm

    const matchedTags = []
    const matchedTerms = []
    let tagContribution = 0
    let tfidfContribution = 0
    let numContribution = 0

    for (let i = 0; i < dim; i++) {
      const contrib = denom > 0 ? (profileVec[i] * itemVec[i]) / denom : 0
      if (contrib <= 0) continue
      const feat = features[i]
      if (feat.group === 'tag') {
        tagContribution += contrib
        matchedTags.push({ tag: feat.label, contribution: contrib, profileWeight: profileVec[i] })
      } else if (feat.group === 'tfidf') {
        tfidfContribution += contrib
        matchedTerms.push({ term: feat.label, contribution: contrib })
      } else if (feat.group === 'num') {
        numContribution += contrib
      }
    }

    matchedTags.sort((a, b) => b.contribution - a.contribution)
    matchedTerms.sort((a, b) => b.contribution - a.contribution)

    const totalPositiveContrib = tagContribution + tfidfContribution + numContribution || 1e-9

    // Encontra o item do histórico do usuário mais similar a este item recomendado
    let bestHistoryMatch = null
    let bestHistorySim = -1
    validHistory.forEach((h) => {
      if (h.signedWeight < 0) return
      const hVec = itemVectors.get(h.app_id)
      const hNorm = itemNorms.get(h.app_id)
      const s = cosineSimilarityVec(hVec, hNorm, itemVec, itemNorm)
      if (s > bestHistorySim) {
        bestHistorySim = s
        bestHistoryMatch = h
      }
    })

    return {
      rank: rankIdx + 1,
      app_id: cand.app_id,
      game: cand.game,
      similarity: cand.similarity,
      mmrScore: cand.mmrScore ?? null,
      isConsumed: cand.isConsumed,
      explanation: {
        matchedTags: matchedTags.slice(0, 6),
        matchedTerms: matchedTerms.slice(0, 6),
        breakdown: {
          tagsPct: Math.round((tagContribution / totalPositiveContrib) * 100),
          tfidfPct: Math.round((tfidfContribution / totalPositiveContrib) * 100),
          numPct: Math.max(
            0,
            100 -
              Math.round((tagContribution / totalPositiveContrib) * 100) -
              Math.round((tfidfContribution / totalPositiveContrib) * 100)
          ),
        },
        mostSimilarConsumed: bestHistoryMatch
          ? {
              app_id: bestHistoryMatch.app_id,
              title: bestHistoryMatch.game?.title || `App #${bestHistoryMatch.app_id}`,
              hours: bestHistoryMatch.hours,
              itemSimilarity: bestHistorySim,
            }
          : null,
      },
    }
  })

  // Calcula a Diversidade Intra-Lista (ILD = 1 - média de similaridade par-a-par no Top-N)
  let pairCount = 0
  let pairSimSum = 0
  for (let i = 0; i < explainedRecommendations.length; i++) {
    for (let j = i + 1; j < explainedRecommendations.length; j++) {
      const idA = explainedRecommendations[i].app_id
      const idB = explainedRecommendations[j].app_id
      pairSimSum += cosineSimilarityVec(
        itemVectors.get(idA),
        itemNorms.get(idA),
        itemVectors.get(idB),
        itemNorms.get(idB)
      )
      pairCount++
    }
  }
  const intraListDiversity = pairCount > 0 ? 1 - pairSimSum / pairCount : 0

  // Baseline de Popularidade (excluindo ou mantendo conforme regra do baseline)
  const popularityBaseline = [...games]
    .filter((g) => !excludeConsumed || !consumedIds.has(g.app_id))
    .sort((a, b) => (b.user_reviews || 0) - (a.user_reviews || 0))
    .slice(0, topN)
    .map((g, idx) => ({
      rank: idx + 1,
      app_id: g.app_id,
      game: g,
      similarity: cosineSimilarityVec(
        profileVec,
        profileNorm,
        itemVectors.get(g.app_id),
        itemNorms.get(g.app_id)
      ),
    }))

  // Baseline Aleatório determinístico (seed = 42 + soma dos app_ids)
  const seedBase = Array.from(consumedIds).reduce((acc, v) => acc + v, 42)
  const availForRandom = [...games].filter((g) => !excludeConsumed || !consumedIds.has(g.app_id))
  const randomBaseline = availForRandom
    .map((g, idx) => ({
      g,
      sortKey: Math.sin(seedBase * 997 + idx * 131 + g.app_id) * 10000,
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, topN)
    .map(({ g }, idx) => ({
      rank: idx + 1,
      app_id: g.app_id,
      game: g,
      similarity: cosineSimilarityVec(
        profileVec,
        profileNorm,
        itemVectors.get(g.app_id),
        itemNorms.get(g.app_id)
      ),
    }))

  return {
    recommendations: explainedRecommendations,
    popularityBaseline,
    randomBaseline,
    intraListDiversity,
    profileSummary: {
      topTags: tagWeights.slice(0, 10),
      topTerms: termWeights.slice(0, 10),
      numericProfile,
      totalHours: Number(totalHours.toFixed(1)),
      validGames: validHistory.length,
      historyWithWeight: validHistory.map((h) => ({
        ...h,
        weightSharePct: Math.round((Math.abs(h.signedWeight) / weightSum) * 100),
      })),
    },
  }
}

/**
 * URL oficial da capa (Header Image) da CDN pública da Steam
 */
export function getSteamHeaderImage(appId) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`
}
