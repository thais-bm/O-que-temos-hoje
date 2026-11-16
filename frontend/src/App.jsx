import { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react'
import {
  ThemeProvider,
  CssBaseline,
  AppBar,
  Toolbar,
  Container,
  Grid,
  Paper,
  Card,
  Typography,
  Stack,
  Box,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  IconButton,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  SvgIcon,
  Avatar,
  CircularProgress,
  Autocomplete,
} from '@mui/material'

import { steamDarkTheme } from './theme'
import { REAL_STEAM_USERS } from './data/steamDataset'
import {
  checkBackendHealth,
  fetchUserRecommendationsApi,
  fetchColdStartRecommendationsApi,
  fetchGamesApi,
  fetchTagsApi,
  fetchUsersApi,
  DEFAULT_API_URL,
} from './services/api'
import { GameCover } from './components/GameCover'

function UserIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </SvgIcon>
  )
}

function PersonAddIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </SvgIcon>
  )
}

function DeleteOutlineIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM8 9h8v10H8V9zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5z" />
    </SvgIcon>
  )
}

function AddIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </SvgIcon>
  )
}

function CloseIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </SvgIcon>
  )
}

function InfoOutlinedIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
    </SvgIcon>
  )
}

const POPULAR_GENRES = [
  'RPG',
  'Open World',
  'Action',
  'Story Rich',
  'Souls-like',
  'Dark Fantasy',
  'Horror',
  'Survival Horror',
  'Co-op',
  'Multiplayer',
  'Strategy',
  'Simulation',
  'Base Building',
  'FPS',
  'Sci-fi',
  'Survival',
  'Sandbox',
  'Indie',
  'Puzzle',
  'Roguelike',
]

const INITIAL_USER_ID = 11764552
const CATALOG_PAGE_SIZE = 24
const HISTORY_INITIAL_LIMIT = 12

const EXISTING_PRESET_IDS = REAL_STEAM_USERS.map((user) => Number(user.user_id))

function formatNumber(value, decimals = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'

  return number.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * O perfil é uma média de vetores de tags normalizados (L2), então o peso bruto
 * de cada tag é pequeno (~0.05–0.2) em bibliotecas grandes. Para exibição,
 * a intensidade é relativa à tag mais forte do perfil (a maior = 100%).
 */
function tagRelativePct(weight, tags) {
  const max = Math.max(...tags.map((t) => t.weight), 0)
  if (!max) return 0
  return Math.round(Math.min(100, (weight / max) * 100))
}

function formatPrice(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'Preço indisponível'
  }

  if (Number(value) === 0) return 'Gratuito para Jogar'

  return `$ ${Number(value).toFixed(2)}`
}

function normalizePercentage(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0

  return Math.abs(number) <= 1 ? number * 100 : number
}

function normalizeBreakdown(breakdown = {}) {
  return {
    tagsPct: normalizePercentage(
      breakdown.tags_pct ??
      breakdown.tagsPct ??
      breakdown.tags ??
      breakdown.tag
    ),
    tfidfPct: normalizePercentage(
      breakdown.tfidf_pct ??
      breakdown.tfidfPct ??
      breakdown.tfidf ??
      breakdown.description
    ),
    numPct: normalizePercentage(
      breakdown.num_pct ??
      breakdown.numPct ??
      breakdown.numeric ??
      breakdown.numerical
    ),
  }
}

function normalizeRecommendation(item) {
  const explanation = item.explanation || {}
  const similar = explanation.most_similar_consumed || null

  return {
    app_id: Number(item.app_id),
    similarity: Number(item.similarity) || 0,
    game: {
      app_id: Number(item.app_id),
      title: item.title || `App #${item.app_id}`,
      rating: item.rating,
      positive_ratio: item.positive_ratio,
      user_reviews: item.user_reviews,
      date_release: item.date_release,
      price_final: item.price_final,
      price_original: item.price_original,
      discount: item.discount,
      description: item.description || '',
      tags: item.tags || [],
    },
    explanation: {
      mostSimilarConsumed: similar
        ? {
            app_id: similar.app_id,
            title: similar.title,
            hours: Number(similar.hours) || 0,
            itemSimilarity: Number(similar.similarity) || 0,
            isRecommended: similar.is_recommended,
          }
        : null,
      matchedTags: (explanation.matched_tags || []).map((feature) => ({
        tag: feature.label,
        contribution: Number(feature.contribution) || 0,
        profileWeight: Number(feature.profile_weight) || 0,
      })),
      matchedTerms: (explanation.matched_terms || []).map((feature) => ({
        term: feature.label,
        contribution: Number(feature.contribution) || 0,
        profileWeight: Number(feature.profile_weight) || 0,
      })),
      breakdown: normalizeBreakdown(explanation.breakdown),
    },
  }
}

function normalizeProfile(profile = {}) {
  return {
    totalHours: Number(profile.total_hours) || 0,
    validGames: Number(profile.valid_games) || 0,
    validInteractions: Number(profile.valid_interactions) || 0,
    positiveInteractions: Number(profile.positive_interactions) || 0,
    negativeInteractions: Number(profile.negative_interactions) || 0,
    topTags: (profile.top_tags || []).map((feature) => ({
      label: feature.label,
      weight: Number(feature.weight) || 0,
    })),
    topTerms: (profile.top_terms || []).map((feature) => ({
      label: feature.label,
      weight: Number(feature.weight) || 0,
    })),
    historyWithWeight: (profile.history_with_weight || []).map((item) => {
      const appId = Number(item.app_id)
      const title = item.title || item.game?.title || null

      return {
        app_id: appId,
        title,
        hours: Number(item.hours) || 0,
        is_recommended: Boolean(item.is_recommended),
        weight: Number(item.weight) || 0,
        weight_share_pct: Number(item.weight_share_pct) || 0,
        game: title ? { app_id: appId, title } : null,
      }
    }),
  }
}

/**
 * Formulário isolado para busca por Steam ID.
 * Mantém o estado de digitação localmente para não re-renderizar a página inteira a cada tecla.
 */
const SteamIdLookupForm = memo(function SteamIdLookupForm({ onLookup, loading }) {
  const [input, setInput] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onLookup(trimmed, () => setInput(''))
  }

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{ display: 'flex', gap: 1 }}
    >
      <TextField
        fullWidth
        size="small"
        placeholder="Buscar por Steam ID..."
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />

      <Button
        type="submit"
        variant="outlined"
        size="small"
        disabled={loading}
      >
        {loading ? <CircularProgress size={18} /> : 'Carregar'}
      </Button>
    </Box>
  )
})

/**
 * Seletor com busca para adicionar jogo de referência no modo Novo Usuário.
 * Exibe inicialmente os jogos já carregados no catálogo e busca na API ao digitar.
 */
const ReferenceGamePicker = memo(function ReferenceGamePicker({
  availableGames,
  selectedIds,
  apiUrl,
  onAddGame,
}) {
  const [selectedGame, setSelectedGame] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [searchOptions, setSearchOptions] = useState([])
  const [searching, setSearching] = useState(false)

  const trimmedQuery = inputValue.trim()
  const matchesSelectedTitle =
    Boolean(selectedGame) &&
    trimmedQuery === (selectedGame.title || '').trim()

  useEffect(() => {
    if (!trimmedQuery || matchesSelectedTitle) {
      return undefined
    }

    const controller = new AbortController()
    const timerId = setTimeout(() => {
      fetchGamesApi({
        search: trimmedQuery,
        limit: 24,
        offset: 0,
        baseUrl: apiUrl,
        signal: controller.signal,
      })
        .then((data) => {
          setSearchOptions(data.games || [])
        })
        .catch((err) => {
          if (!err?.isCancelled && err?.name !== 'AbortError') {
            setSearchOptions([])
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false)
          }
        })
    }, 250)

    return () => {
      clearTimeout(timerId)
      controller.abort()
    }
  }, [trimmedQuery, matchesSelectedTitle, apiUrl])

  const options = useMemo(() => {
    const source =
      trimmedQuery && !matchesSelectedTitle ? searchOptions : availableGames
    const filtered = source.filter(
      (game) => !selectedIds.has(Number(game.app_id))
    )
    if (
      selectedGame &&
      !selectedIds.has(Number(selectedGame.app_id)) &&
      !filtered.some((g) => Number(g.app_id) === Number(selectedGame.app_id))
    ) {
      return [selectedGame, ...filtered]
    }
    return filtered
  }, [
    trimmedQuery,
    matchesSelectedTitle,
    searchOptions,
    availableGames,
    selectedIds,
    selectedGame,
  ])

  function handleAdd() {
    if (!selectedGame) return
    onAddGame(selectedGame.app_id, selectedGame)
    setSelectedGame(null)
    setInputValue('')
    setSearchOptions([])
    setSearching(false)
  }

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <Autocomplete
        fullWidth
        size="small"
        openOnFocus
        options={options}
        value={selectedGame}
        inputValue={inputValue}
        loading={searching}
        filterOptions={(opts) => opts}
        getOptionLabel={(option) => option?.title || ''}
        isOptionEqualToValue={(option, value) =>
          Number(option?.app_id) === Number(value?.app_id)
        }
        noOptionsText={
          trimmedQuery
            ? 'Nenhum jogo encontrado para essa busca.'
            : 'Nenhum jogo disponível.'
        }
        loadingText="Buscando jogos..."
        onChange={(_, newValue) => {
          setSelectedGame(newValue)
          setSearching(false)
        }}
        onInputChange={(_, newInputValue, reason) => {
          setInputValue(newInputValue)
          if (reason === 'reset') {
            setSearching(false)
            if (!newInputValue) {
              setSearchOptions([])
            }
            return
          }
          if (reason === 'input' && selectedGame) {
            setSelectedGame(null)
          }
          const nextTrimmed = newInputValue.trim()
          if (!nextTrimmed) {
            setSearchOptions([])
            setSearching(false)
          } else if (nextTrimmed !== trimmedQuery) {
            setSearching(true)
          }
        }}
        slotProps={{
          listbox: { style: { maxHeight: 340 } },
        }}
        renderOption={(props, option) => {
          const { key, ...optionProps } = props
          const tagPreview = (option.tags || []).slice(0, 3).join(', ')
          return (
            <Box
              component="li"
              key={key ?? option.app_id}
              {...optionProps}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start !important',
                py: 0.75,
              }}
            >
              <Typography variant="body2" fontWeight={600}>
                {option.title}
              </Typography>
              {tagPreview && (
                <Typography variant="caption" color="text.secondary">
                  {tagPreview}
                </Typography>
              )}
            </Box>
          )
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Buscar ou selecionar um título de referência..."
            placeholder="Digite o nome de um jogo ou escolha na lista"
            slotProps={{
              ...params.slotProps,
              input: {
                ...params.slotProps?.input,
                endAdornment: (
                  <>
                    {searching ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : null}
                    {params.slotProps?.input?.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />

      <Button
        variant="contained"
        color="primary"
        size="small"
        startIcon={<AddIcon />}
        disabled={!selectedGame}
        onClick={handleAdd}
        sx={{
          px: 2,
          py: 0.9,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Marcar interesse
      </Button>
    </Box>
  )
})

/**
 * Lista paginada da biblioteca recente do usuário para evitar montar centenas de cards/imagens de uma vez.
 */
const UserHistoryList = memo(function UserHistoryList({ history }) {
  const [showAll, setShowAll] = useState(false)

  const visibleHistory = useMemo(
    () => (showAll ? history : history.slice(0, HISTORY_INITIAL_LIMIT)),
    [history, showAll]
  )

  const hiddenCount = history.length - visibleHistory.length

  if (history.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Nenhum histórico disponível para este usuário.
      </Typography>
    )
  }

  return (
    <Stack spacing={1.25}>
      {visibleHistory.map((item) => (
        <Paper
          key={item.app_id}
          sx={{
            p: 1.25,
            bgcolor: '#121a24',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 84,
              height: 40,
              flexShrink: 0,
            }}
          >
            <GameCover
              appId={item.app_id}
              title={item.game?.title || ''}
            />
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 600 }}
              noWrap
            >
              {item.game?.title || `App #${item.app_id}`}
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', mt: 0.25 }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
              >
                {formatNumber(item.hours, 1)}h jogadas
              </Typography>

              <Chip
                label={
                  item.is_recommended
                    ? 'Recomendou'
                    : 'Não recomendou'
                }
                size="small"
                color={
                  item.is_recommended ? 'default' : 'error'
                }
                variant="outlined"
                sx={{
                  height: 18,
                  fontSize: '0.66rem',
                }}
              />
            </Stack>
          </Box>
        </Paper>
      ))}

      {history.length > HISTORY_INITIAL_LIMIT && (
        <Button
          size="small"
          variant="text"
          onClick={() => setShowAll((prev) => !prev)}
          sx={{ alignSelf: 'center', mt: 0.5 }}
        >
          {showAll
            ? 'Mostrar menos'
            : `Ver mais ${formatNumber(hiddenCount)} jogos da biblioteca`}
        </Button>
      )}
    </Stack>
  )
})

/**
 * Card memoizado de recomendação individual.
 */
const RecommendationCard = memo(function RecommendationCard({
  rec,
  userType,
  onInspect,
}) {
  const game = rec.game
  const explanation = rec.explanation

  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Grid container>
        <Grid size={{ xs: 12, sm: 4, md: 3.6 }}>
          <Box
            sx={{
              height: { xs: 165, sm: '100%' },
              minHeight: 145,
            }}
          >
            <GameCover
              appId={rec.app_id}
              title={game.title}
              borderRadius={0}
            />
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 8, md: 8.4 }}>
          <Box sx={{ p: 2.5 }}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                  }}
                >
                  {game.title}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                >
                  Avaliações: {game.rating || 'N/D'} (
                  {game.positive_ratio ?? 'N/D'}%) ·
                  Lançamento: {game.date_release || 'N/D'} ·{' '}
                  {formatPrice(game.price_final)}
                </Typography>
              </Box>

              <Chip
                label={`${(rec.similarity * 100).toFixed(0)}% compatível`}
                color="secondary"
                size="small"
                sx={{
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              />
            </Stack>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mt: 1,
                mb: 1.75,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {game.description || 'Descrição indisponível.'}
            </Typography>

            <Paper
              sx={{
                p: 1.5,
                bgcolor: '#111923',
                borderColor: 'rgba(102, 192, 244, 0.14)',
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: 1,
                }}
              >
                {userType === 'existing' &&
                explanation.mostSimilarConsumed ? (
                  <Typography
                    variant="caption"
                    color="text.primary"
                  >
                    Recomendado porque você jogou{' '}
                    <Box
                      component="span"
                      sx={{
                        color: 'primary.main',
                        fontWeight: 600,
                      }}
                    >
                      {explanation.mostSimilarConsumed.title}
                    </Box>{' '}
                    ({formatNumber(
                      explanation.mostSimilarConsumed.hours,
                      1
                    )}h)
                  </Typography>
                ) : (
                  <Typography
                    variant="caption"
                    color="text.primary"
                  >
                    {userType === 'new'
                      ? 'Combina com suas preferências iniciais:'
                      : 'Compatível com seu perfil de jogador:'}
                  </Typography>
                )}

                <Button
                  size="small"
                  variant="text"
                  startIcon={<InfoOutlinedIcon fontSize="small" />}
                  onClick={() => onInspect(rec)}
                  sx={{
                    py: 0,
                    fontSize: '0.74rem',
                  }}
                >
                  Por que combina comigo?
                </Button>
              </Box>

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.75,
                }}
              >
                {explanation.matchedTags.slice(0, 5).map((tag) => (
                  <Chip
                    key={tag.tag}
                    label={tag.tag}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{
                      height: 22,
                      fontSize: '0.72rem',
                    }}
                  />
                ))}
              </Box>
            </Paper>
          </Box>
        </Grid>
      </Grid>
    </Card>
  )
})

/**
 * Barra de busca e filtro do catálogo com estado de digitação isolado e lista de tags memoizada.
 */
const CatalogFilterBar = memo(function CatalogFilterBar({
  initialSearch,
  onSearchChange,
  tagFilter,
  onTagFilterChange,
  allCatalogTags,
  catalogLoading,
  catalogTotal,
}) {
  const [localSearch, setLocalSearch] = useState(initialSearch)

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch)
    }, 250)
    return () => clearTimeout(timer)
  }, [localSearch, onSearchChange])

  const tagMenuItems = useMemo(
    () =>
      allCatalogTags.map((tag) => (
        <MenuItem key={tag} value={tag}>
          {tag}
        </MenuItem>
      )),
    [allCatalogTags]
  )

  return (
    <Paper sx={{ p: 2.5 }}>
      <Grid container spacing={2} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <TextField
            fullWidth
            size="small"
            label="Buscar jogo pelo nome ou tema"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
          />
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="tag-filter-label">
              Filtrar por Gênero / Tag
            </InputLabel>

            <Select
              labelId="tag-filter-label"
              label="Filtrar por Gênero / Tag"
              value={tagFilter}
              onChange={(event) => onTagFilterChange(event.target.value)}
              MenuProps={{ PaperProps: { sx: { maxHeight: 360 } } }}
            >
              <MenuItem value="ALL">
                Todos os Gêneros ({allCatalogTags.length})
              </MenuItem>

              {tagMenuItems}
            </Select>
          </FormControl>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {catalogLoading
              ? 'Buscando...'
              : `${formatNumber(catalogTotal)} jogos encontrados`}
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  )
})

/**
 * Card memoizado de item do catálogo.
 */
const CatalogGameCard = memo(function CatalogGameCard({
  game,
  alreadySelected,
  limitReached,
  onSelectGame,
}) {
  return (
    <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
      <Card
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Box sx={{ height: 135 }}>
            <GameCover
              appId={game.app_id}
              title={game.title}
              borderRadius={0}
            />
          </Box>

          <Box sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{ fontSize: '0.95rem' }}
              >
                {game.title}
              </Typography>

              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  color: 'secondary.main',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {game.price_final === 0
                  ? 'Gratuito'
                  : formatPrice(game.price_final)}
              </Typography>
            </Stack>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 1 }}
            >
              {game.rating || 'N/D'} ({game.positive_ratio ?? 'N/D'}%)
            </Typography>

            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                mb: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {game.description || 'Descrição indisponível.'}
            </Typography>

            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.5,
              }}
            >
              {(game.tags || []).slice(0, 4).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.68rem',
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>

        <Box sx={{ px: 2, pb: 2 }}>
          <Button
            fullWidth
            size="small"
            variant={alreadySelected ? 'contained' : 'outlined'}
            disabled={alreadySelected || limitReached}
            onClick={() => onSelectGame(game)}
          >
            {alreadySelected
              ? 'Marcado como interesse'
              : 'Tenho interesse neste jogo'}
          </Button>
        </Box>
      </Card>
    </Grid>
  )
})

function App() {
  const [userType, setUserType] = useState('existing')
  const [pageView, setPageView] = useState('forYou')

  // Usuário existente: o ID inicial já foi validado no backend.
  const [selectedUserId, setSelectedUserId] = useState(INITIAL_USER_ID)
  const [userMetadata, setUserMetadata] = useState(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // Preferências de cold-start.
  const [newUserTags, setNewUserTags] = useState([])
  const [newUserRefGames, setNewUserRefGames] = useState([])
  const [knownGamesById, setKnownGamesById] = useState(() => new Map())

  // Quantidade de recomendações.
  const [topN, setTopN] = useState(10)

  // Catálogo remoto.
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogTagFilter, setCatalogTagFilter] = useState('ALL')
  const [catalogGames, setCatalogGames] = useState([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const [catalogOffset, setCatalogOffset] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false)
  const [catalogError, setCatalogError] = useState('')
  const [allCatalogTags, setAllCatalogTags] = useState([])

  // Recomendações remotas.
  const [recommendations, setRecommendations] = useState([])
  const [profileSummary, setProfileSummary] = useState({
    totalHours: 0,
    validGames: 0,
    validInteractions: 0,
    positiveInteractions: 0,
    negativeInteractions: 0,
    topTags: [],
    topTerms: [],
    historyWithWeight: [],
  })
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState('')

  // Estado geral da API.
  const apiUrl = DEFAULT_API_URL
  const [apiOnline, setApiOnline] = useState(false)

  // Dialog de explicação.
  const [inspectedRec, setInspectedRec] = useState(null)

  // Evita requisição duplicada ao buscar um Steam ID manualmente.
  const prefetchedUserRecRef = useRef(null)

  const selectedExistingUser = useMemo(() => {
    return (
      REAL_STEAM_USERS.find(
        (user) => Number(user.user_id) === Number(selectedUserId)
      ) || null
    )
  }, [selectedUserId])

  const selectedHandle =
    selectedExistingUser?.handle ||
    userMetadata?.handle ||
    'Usuário Steam'

  const newUserHasAnyPreference =
    newUserTags.length > 0 || newUserRefGames.length > 0

  const newUserRefIdSet = useMemo(
    () => new Set(newUserRefGames.map((item) => Number(item.app_id))),
    [newUserRefGames]
  )

  const availablePopularTags = useMemo(() => {
    const canonical = new Map(
      allCatalogTags.map((tag) => [tag.toLocaleLowerCase('pt-BR'), tag])
    )

    const matched = POPULAR_GENRES
      .map((genre) => canonical.get(genre.toLocaleLowerCase('pt-BR')))
      .filter(Boolean)

    return matched.length > 0 ? matched : allCatalogTags.slice(0, 20)
  }, [allCatalogTags])

  const availableGamesToPick = useMemo(() => {
    return catalogGames.filter(
      (game) => !newUserRefIdSet.has(Number(game.app_id))
    )
  }, [catalogGames, newUserRefIdSet])

  // Verifica a API e carrega as tags reais do catálogo.
  useEffect(() => {
    let active = true

    checkBackendHealth(apiUrl).then((result) => {
      if (active) setApiOnline(result.online)
    })

    fetchTagsApi(apiUrl)
      .then((tags) => {
        if (active) setAllCatalogTags(tags)
      })
      .catch((error) => {
        if (active) setCatalogError(error.message)
      })

    return () => {
      active = false
    }
  }, [apiUrl])

  // Carrega a primeira página do catálogo apenas quando necessária
  // (aba Explorar Catálogo ou modo Novo Usuário para seleção de jogos de referência).
  const needsCatalog = pageView === 'catalog' || userType === 'new'

  useEffect(() => {
    if (!needsCatalog) return

    let active = true
    const controller = new AbortController()

    async function loadCatalogFirstPage() {
      setCatalogLoading(true)
      setCatalogError('')
      setCatalogOffset(0)

      try {
        const result = await fetchGamesApi({
          search: catalogSearch,
          tag: catalogTagFilter,
          limit: CATALOG_PAGE_SIZE,
          offset: 0,
          baseUrl: apiUrl,
          signal: controller.signal,
        })

        if (!active) return

        setCatalogGames(result.games)
        setKnownGamesById((prev) => {
          const next = new Map(prev)
          result.games.forEach((g) => next.set(Number(g.app_id), g))
          return next
        })
        setCatalogTotal(result.total)
        setCatalogHasMore(result.hasMore)
        setCatalogOffset(result.games.length)
        setApiOnline(true)
      } catch (error) {
        if (!active || error.isCancelled) return

        setCatalogGames([])
        setCatalogTotal(0)
        setCatalogHasMore(false)
        setCatalogError(error.message)
      } finally {
        if (active) setCatalogLoading(false)
      }
    }

    loadCatalogFirstPage()

    return () => {
      active = false
      controller.abort()
    }
  }, [needsCatalog, catalogSearch, catalogTagFilter, apiUrl])

  // Carrega mais jogos usando a paginação do backend.
  const handleLoadMoreCatalog = useCallback(async () => {
    if (catalogLoadingMore || !catalogHasMore) return

    setCatalogLoadingMore(true)
    setCatalogError('')

    try {
      const result = await fetchGamesApi({
        search: catalogSearch,
        tag: catalogTagFilter,
        limit: CATALOG_PAGE_SIZE,
        offset: catalogOffset,
        baseUrl: apiUrl,
      })

      setCatalogGames((previous) => {
        const existingIds = new Set(previous.map((game) => Number(game.app_id)))
        const newGames = result.games.filter(
          (game) => !existingIds.has(Number(game.app_id))
        )

        return [...previous, ...newGames]
      })

      setKnownGamesById((prev) => {
        const next = new Map(prev)
        result.games.forEach((g) => next.set(Number(g.app_id), g))
        return next
      })

      setCatalogOffset((previous) => previous + result.games.length)
      setCatalogHasMore(result.hasMore)
      setApiOnline(true)
    } catch (error) {
      if (!error.isCancelled) {
        setCatalogError(error.message)
      }
    } finally {
      setCatalogLoadingMore(false)
    }
  }, [
    catalogLoadingMore,
    catalogHasMore,
    catalogSearch,
    catalogTagFilter,
    catalogOffset,
    apiUrl,
  ])

  // Busca recomendações reais sempre que o perfil ou top N mudar.
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const delayMs = userType === 'new' && newUserHasAnyPreference ? 180 : 0

    async function loadRecommendations() {
      if (userType === 'new' && !newUserHasAnyPreference) {
        setRecommendationLoading(false)
        setRecommendationError('')
        setRecommendations([])
        setProfileSummary({
          totalHours: 0,
          validGames: 0,
          validInteractions: 0,
          positiveInteractions: 0,
          negativeInteractions: 0,
          topTags: [],
          topTerms: [],
          historyWithWeight: [],
        })
        return
      }

      // Reaproveita resultado já buscado pelo lookup manual de Steam ID para evitar chamada dupla.
      if (
        userType === 'existing' &&
        prefetchedUserRecRef.current &&
        prefetchedUserRecRef.current.userId === Number(selectedUserId) &&
        prefetchedUserRecRef.current.topN === topN
      ) {
        const cached = prefetchedUserRecRef.current.result
        prefetchedUserRecRef.current = null
        setRecommendationError('')
        setRecommendationLoading(false)
        setProfileSummary(normalizeProfile(cached.payload.profile))
        setRecommendations((cached.rawList || []).map(normalizeRecommendation))
        setApiOnline(true)
        return
      }

      setRecommendationError('')
      setRecommendationLoading(true)

      try {
        let result

        if (userType === 'existing') {
          result = await fetchUserRecommendationsApi(selectedUserId, {
            topN,
            excludeConsumed: true,
            baseUrl: apiUrl,
            signal: controller.signal,
          })

          if (!active) return

          const payload = result.payload
          setProfileSummary(normalizeProfile(payload.profile))
        } else {
          result = await fetchColdStartRecommendationsApi({
            appIds: newUserRefGames.map((item) => Number(item.app_id)),
            tags: newUserTags,
            topN,
            baseUrl: apiUrl,
            signal: controller.signal,
          })

          if (!active) return

          const profile = result.payload.profile || {}

          setProfileSummary({
            totalHours: 0,
            validGames: Number(profile.num_reference_games) || 0,
            validInteractions: 0,
            positiveInteractions: 0,
            negativeInteractions: 0,
            topTags: (profile.top_tags || []).map((feature) => ({
              label: feature.label,
              weight: Number(feature.weight) || 0,
            })),
            topTerms: (profile.top_terms || []).map((feature) => ({
              label: feature.label,
              weight: Number(feature.weight) || 0,
            })),
            historyWithWeight: [],
          })
        }

        if (!active) return

        setRecommendations(
          (result.rawList || []).map(normalizeRecommendation)
        )
        setApiOnline(true)
      } catch (error) {
        if (!active || error.isCancelled) return

        setRecommendations([])
        setRecommendationError(error.message)
      } finally {
        if (active) setRecommendationLoading(false)
      }
    }

    const timer = setTimeout(loadRecommendations, delayMs)

    return () => {
      active = false
      clearTimeout(timer)
      controller.abort()
    }
  }, [
    userType,
    selectedUserId,
    topN,
    newUserTags,
    newUserRefGames,
    newUserHasAnyPreference,
    apiUrl,
  ])

  const handleLookupSteamId = useCallback(
    async (trimmedInput, onSuccessClear) => {
      const uid = Number(trimmedInput)

      if (!Number.isSafeInteger(uid) || uid < 0) {
        setRecommendationError('Informe um Steam ID numérico válido.')
        return
      }

      setLookupLoading(true)
      setRecommendationError('')

      try {
        const userResult = await fetchUsersApi({
          userId: uid,
          baseUrl: apiUrl,
        })

        if (!userResult.users?.length) {
          throw new Error(`A conta #${uid} não foi encontrada no banco de dados.`)
        }

        // A consulta de recomendações confirma se existe histórico utilizável
        // e já armazena o resultado para evitar uma segunda chamada idêntica no useEffect.
        const recResult = await fetchUserRecommendationsApi(uid, {
          topN,
          excludeConsumed: true,
          baseUrl: apiUrl,
        })

        prefetchedUserRecRef.current = {
          userId: uid,
          topN,
          result: recResult,
        }

        if (Number(selectedUserId) === uid && userType === 'existing') {
          prefetchedUserRecRef.current = null
          setProfileSummary(normalizeProfile(recResult.payload.profile))
          setRecommendations((recResult.rawList || []).map(normalizeRecommendation))
        }

        setSelectedUserId(uid)
        setUserMetadata(userResult.users[0])
        setUserType('existing')
        setPageView('forYou')
        setApiOnline(true)
        if (onSuccessClear) onSuccessClear()
      } catch (error) {
        setRecommendationError(error.message)
      } finally {
        setLookupLoading(false)
      }
    },
    [apiUrl, topN, selectedUserId, userType]
  )

  const handleToggleNewUserTag = useCallback((tag) => {
    setNewUserTags((previous) =>
      previous.includes(tag)
        ? previous.filter((item) => item !== tag)
        : [...previous, tag]
    )
  }, [])

  const handleAddRefGameToNewUser = useCallback(
    (appId, gameObj = null) => {
      const id = Number(appId)

      if (!Number.isSafeInteger(id) || id <= 0) return

      if (gameObj) {
        setKnownGamesById((prev) => {
          if (prev.has(id)) return prev
          const next = new Map(prev)
          next.set(id, gameObj)
          return next
        })
      }

      setNewUserRefGames((previous) => {
        if (previous.some((item) => Number(item.app_id) === id)) {
          return previous
        }
        if (previous.length >= 20) {
          setRecommendationError(
            'O cold-start permite no máximo 20 jogos de referência.'
          )
          return previous
        }
        setRecommendationError('')
        return [...previous, { app_id: id, is_recommended: true }]
      })
    },
    []
  )

  const handleSelectGameFromCatalog = useCallback(
    (game) => {
      handleAddRefGameToNewUser(game.app_id, game)
      setUserType('new')
      setPageView('forYou')
    },
    [handleAddRefGameToNewUser]
  )

  const handleRemoveNewUserRefGame = useCallback((appId) => {
    setNewUserRefGames((previous) =>
      previous.filter((item) => Number(item.app_id) !== Number(appId))
    )
  }, [])

  const handleSelectExistingUser = useCallback((userId) => {
    setSelectedUserId(Number(userId))
    setUserMetadata(null)
    setRecommendationError('')
  }, [])

  return (
    <ThemeProvider theme={steamDarkTheme}>
      <CssBaseline />

      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
        }}
      >
        {/* Barra superior */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: '#171a21',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Container maxWidth="xl">
            <Toolbar
              disableGutters
              sx={{
                justifyContent: 'space-between',
                py: 1,
                flexWrap: 'wrap',
                gap: 2,
              }}
            >
              <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
                <Box>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      color: '#fff',
                      lineHeight: 1.2,
                    }}
                  >
                    O QUE TEMOS HOJE?
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    Descoberta personalizada de jogos na Steam
                  </Typography>
                </Box>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant={pageView === 'forYou' ? 'contained' : 'text'}
                    color="primary"
                    size="small"
                    onClick={() => setPageView('forYou')}
                  >
                    Para Você
                  </Button>

                  <Button
                    variant={pageView === 'catalog' ? 'contained' : 'text'}
                    color="primary"
                    size="small"
                    onClick={() => setPageView('catalog')}
                  >
                    Explorar Catálogo
                  </Button>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: { xs: 'none', sm: 'block' } }}
                >
                  Perfil:
                </Typography>

                <ToggleButtonGroup
                  size="small"
                  color="primary"
                  value={userType}
                  exclusive
                  onChange={(_, value) => {
                    if (value) {
                      setUserType(value)
                      setPageView('forYou')
                      setRecommendationError('')
                    }
                  }}
                  sx={{ bgcolor: '#10161f' }}
                >
                  <ToggleButton value="existing" sx={{ px: 2, gap: 1 }}>
                    <UserIcon fontSize="small" />
                    Usuário Já Existente
                  </ToggleButton>

                  <ToggleButton value="new" sx={{ px: 2, gap: 1 }}>
                    <PersonAddIcon fontSize="small" />
                    Novo Usuário
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Toolbar>
          </Container>
        </AppBar>

        {/* Conteúdo principal */}
        <Container maxWidth="xl" sx={{ py: 3.5, flex: 1 }}>
          {pageView === 'forYou' ? (
            <Stack spacing={3}>
              {/* Perfil / onboarding */}
              <Paper sx={{ p: 3, bgcolor: '#16202d' }}>
                {userType === 'existing' ? (
                  <Grid container spacing={3} sx={{ alignItems: 'center' }}>
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        <Avatar
                          sx={{
                            width: 48,
                            height: 48,
                            bgcolor: 'primary.dark',
                            color: '#fff',
                            fontWeight: 700,
                          }}
                        >
                          {selectedHandle.slice(0, 2).toUpperCase()}
                        </Avatar>

                        <Box>
                          <Typography variant="subtitle2" color="primary.main">
                            Conta Steam consultada no banco
                          </Typography>

                          <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
                            Olá, {selectedHandle}
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            ID #{selectedUserId} ·{' '}
                            {formatNumber(profileSummary.validGames)} jogos na biblioteca
                            {' '}({formatNumber(profileSummary.totalHours, 1)}h jogadas)
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 7, md: 4 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="switch-account-label">
                          Trocar de conta existente
                        </InputLabel>

                        <Select
                          labelId="switch-account-label"
                          label="Trocar de conta existente"
                          value={selectedUserId}
                          onChange={(event) =>
                            handleSelectExistingUser(event.target.value)
                          }
                        >
                          {!EXISTING_PRESET_IDS.includes(Number(selectedUserId)) && (
                            <MenuItem value={selectedUserId}>
                              Usuário #{selectedUserId}
                            </MenuItem>
                          )}

                          {REAL_STEAM_USERS.map((user) => (
                            <MenuItem
                              key={user.user_id}
                              value={Number(user.user_id)}
                            >
                              {user.handle} (ID #{user.user_id})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 5, md: 3 }}>
                      <SteamIdLookupForm
                        onLookup={handleLookupSteamId}
                        loading={lookupLoading}
                      />
                    </Grid>
                  </Grid>
                ) : (
                  <Stack spacing={2.5}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', sm: 'row' },
                        justifyContent: 'space-between',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        gap: 1.5,
                      }}
                    >
                      <Box>
                        <Typography variant="subtitle2" color="secondary.main">
                          Novo Usuário · Sem histórico de jogos
                        </Typography>

                        <Typography variant="h6" sx={{ mt: 0.25 }}>
                          O que você tem vontade de jogar hoje?
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          Selecione tags e jogos de referência. O sistema usará
                          essas preferências para gerar recomendações iniciais.
                        </Typography>
                      </Box>

                      {newUserHasAnyPreference && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="inherit"
                          onClick={() => {
                            setNewUserTags([])
                            setNewUserRefGames([])
                            setRecommendationError('')
                          }}
                          sx={{
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            px: 1.5,
                            py: 0.5,
                            fontSize: '0.78rem',
                          }}
                        >
                          Limpar escolhas
                        </Button>
                      )}
                    </Box>

                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        1. Escolha seus gêneros de interesse:
                      </Typography>

                      {allCatalogTags.length === 0 ? (
                        <Typography variant="caption" color="text.secondary">
                          {catalogLoading
                            ? 'Carregando tags do catálogo...'
                            : 'Não foi possível carregar as tags.'}
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {availablePopularTags.map((genre) => {
                            const selected = newUserTags.includes(genre)

                            return (
                              <Chip
                                key={genre}
                                label={genre}
                                clickable
                                color={selected ? 'primary' : 'default'}
                                variant={selected ? 'filled' : 'outlined'}
                                onClick={() => handleToggleNewUserTag(genre)}
                              />
                            )
                          })}
                        </Box>
                      )}
                    </Box>

                    <Box sx={{ maxWidth: 680 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        2. Opcional — Marque jogos específicos que chamaram sua atenção:
                      </Typography>

                      <ReferenceGamePicker
                        availableGames={availableGamesToPick}
                        selectedIds={newUserRefIdSet}
                        apiUrl={apiUrl}
                        onAddGame={handleAddRefGameToNewUser}
                      />

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.75 }}
                      >
                        O menu exibe inicialmente os jogos carregados do catálogo
                        e busca em todo o catálogo conforme você digita.
                      </Typography>
                    </Box>
                  </Stack>
                )}
              </Paper>

              {recommendationError && (
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: 'rgba(211, 47, 47, 0.10)',
                    border: '1px solid',
                    borderColor: 'error.dark',
                  }}
                >
                  <Typography variant="body2" color="error.light">
                    {recommendationError}
                  </Typography>
                </Paper>
              )}

              {/* Layout de duas colunas */}
              <Grid container spacing={3}>
                {/* Coluna esquerda */}
                <Grid size={{ xs: 12, lg: 4 }}>
                  {userType === 'existing' ? (
                    <Stack spacing={2.5}>
                      <Paper sx={{ p: 2.5 }}>
                        <Stack
                          direction="row"
                          sx={{
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            mb: 2,
                          }}
                        >
                          <Typography variant="h6">
                            Sua Biblioteca Recente
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            {formatNumber(profileSummary.totalHours, 1)}h jogadas
                          </Typography>
                        </Stack>

                        {recommendationLoading &&
                        profileSummary.historyWithWeight.length === 0 ? (
                          <Box sx={{ py: 3, textAlign: 'center' }}>
                            <CircularProgress size={24} />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mt: 1 }}
                            >
                              Carregando histórico...
                            </Typography>
                          </Box>
                        ) : (
                          <UserHistoryList
                            key={selectedUserId}
                            history={profileSummary.historyWithWeight}
                          />
                        )}
                      </Paper>

                      {profileSummary.topTags.length > 0 && (
                        <Paper sx={{ p: 2.5 }}>
                          <Typography variant="h6" sx={{ mb: 0.5 }}>
                            Seus Gêneros Mais Jogados
                          </Typography>

                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mb: 2 }}
                          >
                            Características mais relevantes do seu perfil
                          </Typography>

                          <Stack spacing={1.25}>
                            {profileSummary.topTags.slice(0, 6).map((tag) => (
                              <Box key={tag.label}>
                                <Stack
                                  direction="row"
                                  sx={{
                                    justifyContent: 'space-between',
                                    mb: 0.4,
                                  }}
                                >
                                  <Typography variant="body2">
                                    {tag.label}
                                  </Typography>

                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ fontFamily: 'monospace' }}
                                  >
                                    {tagRelativePct(tag.weight, profileSummary.topTags)}%
                                  </Typography>
                                </Stack>

                                <LinearProgress
                                  variant="determinate"
                                  value={tagRelativePct(tag.weight, profileSummary.topTags)}
                                  color="primary"
                                  sx={{ height: 6, borderRadius: 3 }}
                                />
                              </Box>
                            ))}
                          </Stack>
                        </Paper>
                      )}
                    </Stack>
                  ) : (
                    <Paper sx={{ p: 2.5 }}>
                      <Typography variant="h6" sx={{ mb: 0.5 }}>
                        Suas Preferências Atuais
                      </Typography>

                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mb: 2 }}
                      >
                        Resumo do que você escolheu para guiar as recomendações
                      </Typography>

                      {!newUserHasAnyPreference ? (
                        <Paper
                          sx={{
                            p: 3,
                            bgcolor: '#121a24',
                            textAlign: 'center',
                          }}
                        >
                          <Typography variant="body2" color="text.secondary">
                            Nenhuma preferência marcada ainda. Selecione um ou
                            mais gêneros acima ou escolha jogos de referência.
                          </Typography>
                        </Paper>
                      ) : (
                        <Stack spacing={2.5}>
                          {newUserTags.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Gêneros selecionados ({newUserTags.length})
                              </Typography>

                              <Box
                                sx={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 0.75,
                                }}
                              >
                                {newUserTags.map((tag) => (
                                  <Chip
                                    key={tag}
                                    label={tag}
                                    size="small"
                                    color="primary"
                                    onDelete={() => handleToggleNewUserTag(tag)}
                                  />
                                ))}
                              </Box>
                            </Box>
                          )}

                          {newUserRefGames.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Títulos de referência ({newUserRefGames.length})
                              </Typography>

                              <Stack spacing={1}>
                                {newUserRefGames.map((item) => {
                                  const game = knownGamesById.get(
                                    Number(item.app_id)
                                  )

                                  return (
                                    <Paper
                                      key={item.app_id}
                                      sx={{
                                        p: 1,
                                        bgcolor: '#121a24',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          width: 72,
                                          height: 34,
                                          flexShrink: 0,
                                        }}
                                      >
                                        <GameCover
                                          appId={item.app_id}
                                          title={game?.title || ''}
                                        />
                                      </Box>

                                      <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography
                                          variant="body2"
                                          sx={{ fontWeight: 600 }}
                                          noWrap
                                        >
                                          {game?.title || `App #${item.app_id}`}
                                        </Typography>

                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          Marcado como interesse
                                        </Typography>
                                      </Box>

                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() =>
                                          handleRemoveNewUserRefGame(item.app_id)
                                        }
                                      >
                                        <DeleteOutlineIcon fontSize="small" />
                                      </IconButton>
                                    </Paper>
                                  )
                                })}
                              </Stack>
                            </Box>
                          )}
                        </Stack>
                      )}
                    </Paper>
                  )}
                </Grid>

                {/* Coluna direita: recomendações */}
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Stack spacing={2}>
                    <Paper sx={{ px: 2.5, py: 1.75 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: 2,
                        }}
                      >
                        <Box>
                          <Typography variant="h6">
                            Recomendados Para Você
                          </Typography>

                          <Typography variant="caption" color="text.secondary">
                            {userType === 'existing'
                              ? 'Jogos inéditos na sua biblioteca, compatíveis com seu histórico'
                              : 'Sugestões baseadas nos gêneros e jogos que você escolheu'}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: 'flex',
                            gap: 2,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          {recommendationLoading && recommendations.length > 0 && (
                            <CircularProgress size={18} />
                          )}

                          <ToggleButtonGroup
                            size="small"
                            value={topN}
                            exclusive
                            onChange={(_, value) => {
                              if (value) setTopN(value)
                            }}
                          >
                            <ToggleButton value={5}>Top 5</ToggleButton>
                            <ToggleButton value={10}>Top 10</ToggleButton>
                            <ToggleButton value={15}>Top 15</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      </Box>
                    </Paper>

                    {recommendationLoading && recommendations.length === 0 ? (
                      <Paper sx={{ p: 6, textAlign: 'center' }}>
                        <CircularProgress size={32} />

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 2 }}
                        >
                          Consultando o motor de recomendação...
                        </Typography>
                      </Paper>
                    ) : recommendationError ? (
                      <Paper sx={{ p: 4, textAlign: 'center' }}>
                        <Typography variant="h6" color="error.main" sx={{ mb: 1 }}>
                          Não foi possível carregar as recomendações
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          {recommendationError}
                        </Typography>
                      </Paper>
                    ) : userType === 'new' && !newUserHasAnyPreference ? (
                      <Paper sx={{ p: 6, textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                          Escolha suas preferências para começar
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          Selecione pelo menos um gênero ou jogo de referência.
                          O sistema calculará recomendações iniciais com base
                          nessas escolhas.
                        </Typography>
                      </Paper>
                    ) : recommendations.length === 0 ? (
                      <Paper sx={{ p: 6, textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                          Nenhuma recomendação disponível
                        </Typography>

                        <Typography variant="body2" color="text.secondary">
                          O backend não encontrou jogos elegíveis para os
                          parâmetros selecionados.
                        </Typography>
                      </Paper>
                    ) : (
                      <Stack
                        spacing={2}
                        sx={{
                          opacity: recommendationLoading ? 0.65 : 1,
                          transition: 'opacity 150ms ease',
                        }}
                      >
                        {recommendations.map((rec) => (
                          <RecommendationCard
                            key={rec.app_id}
                            rec={rec}
                            userType={userType}
                            onInspect={setInspectedRec}
                          />
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          ) : (
            /* Explorar catálogo */
            <Stack spacing={3}>
              <CatalogFilterBar
                initialSearch={catalogSearch}
                onSearchChange={setCatalogSearch}
                tagFilter={catalogTagFilter}
                onTagFilterChange={setCatalogTagFilter}
                allCatalogTags={allCatalogTags}
                catalogLoading={catalogLoading}
                catalogTotal={catalogTotal}
              />

              {catalogError && (
                <Paper
                  sx={{
                    p: 2,
                    bgcolor: 'rgba(211, 47, 47, 0.10)',
                    border: '1px solid',
                    borderColor: 'error.dark',
                  }}
                >
                  <Typography variant="body2" color="error.light">
                    {catalogError}
                  </Typography>
                </Paper>
              )}

              {catalogLoading && catalogGames.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <CircularProgress />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2 }}
                  >
                    Carregando catálogo do banco de dados...
                  </Typography>
                </Box>
              ) : catalogGames.length === 0 ? (
                <Paper sx={{ p: 5, textAlign: 'center' }}>
                  <Typography variant="h6">
                    Nenhum jogo encontrado
                  </Typography>

                  <Typography variant="body2" color="text.secondary">
                    Tente alterar o termo de busca ou o filtro selecionado.
                  </Typography>
                </Paper>
              ) : (
                <>
                  <Grid
                    container
                    spacing={2.5}
                    sx={{
                      opacity: catalogLoading ? 0.6 : 1,
                      transition: 'opacity 150ms ease',
                    }}
                  >
                    {catalogGames.map((game) => (
                      <CatalogGameCard
                        key={game.app_id}
                        game={game}
                        alreadySelected={newUserRefIdSet.has(
                          Number(game.app_id)
                        )}
                        limitReached={newUserRefGames.length >= 20}
                        onSelectGame={handleSelectGameFromCatalog}
                      />
                    ))}
                  </Grid>

                  {catalogHasMore && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                      <Button
                        variant="outlined"
                        onClick={handleLoadMoreCatalog}
                        disabled={catalogLoadingMore}
                      >
                        {catalogLoadingMore ? (
                          <CircularProgress size={20} />
                        ) : (
                          'Carregar mais jogos'
                        )}
                      </Button>
                    </Box>
                  )}

                  {!catalogHasMore && catalogGames.length > 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      textAlign="center"
                    >
                      Todos os {formatNumber(catalogTotal)} resultados desta
                      pesquisa foram carregados.
                    </Typography>
                  )}
                </>
              )}
            </Stack>
          )}
        </Container>

        {/* Dialog de explicação */}
        <Dialog
          open={Boolean(inspectedRec)}
          onClose={() => setInspectedRec(null)}
          maxWidth="sm"
          fullWidth
        >
          {inspectedRec && (
            <>
              <DialogTitle
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Box>
                  <Typography variant="h6">
                    Por que recomendamos {inspectedRec.game.title}?
                  </Typography>

                  <Typography variant="caption" color="text.secondary">
                    Índice de compatibilidade:{' '}
                    {(inspectedRec.similarity * 100).toFixed(1)}%
                    {' '}(Similaridade do Cosseno)
                  </Typography>
                </Box>

                <IconButton
                  size="small"
                  onClick={() => setInspectedRec(null)}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </DialogTitle>

              <DialogContent sx={{ pt: 3 }}>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                  {inspectedRec.explanation.mostSimilarConsumed && (
                    <Paper sx={{ p: 2, bgcolor: '#121a24' }}>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        {userType === 'existing'
                          ? 'Jogo mais parecido na sua biblioteca'
                          : 'Título de referência mais próximo'}
                      </Typography>

                      <Typography variant="body2">
                        <strong>
                          {inspectedRec.explanation.mostSimilarConsumed.title}
                        </strong>

                        {userType === 'existing' &&
                          ` (${formatNumber(
                            inspectedRec.explanation.mostSimilarConsumed.hours,
                            1
                          )}h jogadas)`}{' '}

                        tem{' '}
                        <strong>
                          {(
                            inspectedRec.explanation.mostSimilarConsumed
                              .itemSimilarity * 100
                          ).toFixed(0)}
                          %
                        </strong>{' '}
                        de similaridade direta com este título.
                      </Typography>
                    </Paper>
                  )}

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 4 }}>
                      <Paper
                        sx={{
                          p: 1.5,
                          bgcolor: '#121a24',
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Gêneros / Tags
                        </Typography>

                        <Typography variant="h6" color="primary.main">
                          {inspectedRec.explanation.breakdown.tagsPct.toFixed(1)}%
                        </Typography>
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 4 }}>
                      <Paper
                        sx={{
                          p: 1.5,
                          bgcolor: '#121a24',
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Temas na Sinopse
                        </Typography>

                        <Typography variant="h6" color="secondary.main">
                          {inspectedRec.explanation.breakdown.tfidfPct.toFixed(1)}%
                        </Typography>
                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 4 }}>
                      <Paper
                        sx={{
                          p: 1.5,
                          bgcolor: '#121a24',
                          textAlign: 'center',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          Avaliação / Preço
                        </Typography>

                        <Typography variant="h6">
                          {inspectedRec.explanation.breakdown.numPct.toFixed(1)}%
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {inspectedRec.explanation.matchedTerms.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Nenhum termo de sinopse (TF-IDF) em comum: este jogo ou
                      os jogos do seu histórico não têm descrição no dataset.
                    </Typography>
                  )}

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Característica em comum</TableCell>
                        <TableCell>Origem</TableCell>
                        <TableCell align="right">
                          Peso na recomendação
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {inspectedRec.explanation.matchedTags.map((tag) => (
                        <TableRow key={`tag-${tag.tag}`}>
                          <TableCell
                            sx={{
                              color: 'primary.main',
                              fontWeight: 500,
                            }}
                          >
                            {tag.tag}
                          </TableCell>

                          <TableCell>Gênero / Tag</TableCell>

                          <TableCell
                            align="right"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            +{(tag.contribution * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}

                      {inspectedRec.explanation.matchedTerms.map((term) => (
                        <TableRow key={`tfidf-${term.term}`}>
                          <TableCell
                            sx={{
                              color: 'secondary.main',
                              fontFamily: 'monospace',
                            }}
                          >
                            {term.term}
                          </TableCell>

                          <TableCell>Termo na sinopse (TF-IDF)</TableCell>

                          <TableCell
                            align="right"
                            sx={{ fontFamily: 'monospace' }}
                          >
                            +{(term.contribution * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}

                      {inspectedRec.explanation.matchedTags.length === 0 &&
                        inspectedRec.explanation.matchedTerms.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={3}>
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                O backend não retornou contribuições individuais
                                para esta recomendação.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                    </TableBody>
                  </Table>
                </Stack>
              </DialogContent>
            </>
          )}
        </Dialog>

        {/* Rodapé */}
        <Box
          component="footer"
          sx={{
            py: 2.5,
            px: 3,
            bgcolor: '#171a21',
            borderTop: '1px solid',
            borderColor: 'divider',
            mt: 'auto',
          }}
        >
          <Container maxWidth="xl">
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                O Que Temos Hoje? — Recomendações personalizadas de jogos
              </Typography>

              <Typography
                variant="caption"
                color={apiOnline ? 'success.main' : 'error.main'}
              >
                {apiOnline
                  ? 'Conectado ao servidor FastAPI'
                  : 'Backend indisponível'}
              </Typography>
            </Stack>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
