import { useState, useMemo, useEffect } from 'react'
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
  Switch,
  FormControlLabel,
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
} from '@mui/material'

import { steamDarkTheme } from './theme'
import { STEAM_CATALOG, REAL_STEAM_USERS } from './data/steamDataset'
import { buildCatalogModel, computeRecommendations } from './utils/fbcEngine'
import {
  checkBackendHealth,
  fetchUserRecommendationsApi,
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

function App() {
  // 'existing' (Usuário já existente) | 'new' (Novo usuário — começa zerado!)
  const [userType, setUserType] = useState('existing')
  const [pageView, setPageView] = useState('forYou') // 'forYou' | 'catalog'

  // Existing user state
  const [selectedUserId, setSelectedUserId] = useState(REAL_STEAM_USERS[0].user_id)
  const [customUidInput, setCustomUidInput] = useState('')

  // New user state: starts empty (0 games played, 0 genres selected)
  const [newUserTags, setNewUserTags] = useState([])
  const [newUserRefGames, setNewUserRefGames] = useState([])
  const [selectedAddGameId, setSelectedAddGameId] = useState('')

  // User-facing recommendation preferences
  const [topN, setTopN] = useState(10)
  const [useNegativeDislikes, setUseNegativeDislikes] = useState(true)
  const [useMmr, setUseMmr] = useState(false)

  // Catalog filters
  const [catalogSearch, setCatalogSearch] = useState('')
  const [catalogTagFilter, setCatalogTagFilter] = useState('ALL')

  // Details dialog
  const [inspectedRec, setInspectedRec] = useState(null)

  // API state
  const apiUrl = DEFAULT_API_URL
  const [apiOnline, setApiOnline] = useState(false)
  const [apiOverrideIds, setApiOverrideIds] = useState(null)

  const catalogModel = useMemo(() => buildCatalogModel(STEAM_CATALOG), [])

  useEffect(() => {
    let mounted = true
    checkBackendHealth(apiUrl).then((res) => {
      if (mounted) setApiOnline(res.online)
    })
    return () => {
      mounted = false
    }
  }, [apiUrl])

  const selectedExistingUser = useMemo(
    () =>
      REAL_STEAM_USERS.find((u) => u.user_id === Number(selectedUserId)) || REAL_STEAM_USERS[0],
    [selectedUserId]
  )

  const activeInteractions = useMemo(() => {
    if (userType === 'new') return newUserRefGames
    return selectedExistingUser?.interactions || []
  }, [userType, newUserRefGames, selectedExistingUser])

  const fbcResult = useMemo(() => {
    const res = computeRecommendations(catalogModel, activeInteractions, {
      topN,
      excludeConsumed: true,
      useNegativeDislikes,
      useMmr,
      mmrLambda: 0.72,
      selectedTags: userType === 'new' ? newUserTags : [],
      isNewUser: userType === 'new',
    })

    if (apiOverrideIds && apiOverrideIds.length > 0 && userType === 'existing') {
      const byId = new Map(res.recommendations.map((r) => [r.app_id, r]))
      const reordered = []
      apiOverrideIds.slice(0, topN).forEach((aid, idx) => {
        const idNum = typeof aid === 'object' ? Number(aid.app_id) : Number(aid)
        if (byId.has(idNum)) {
          reordered.push({ ...byId.get(idNum), rank: idx + 1 })
        }
      })
      if (reordered.length > 0) {
        return { ...res, recommendations: reordered }
      }
    }
    return res
  }, [
    catalogModel,
    activeInteractions,
    topN,
    useNegativeDislikes,
    useMmr,
    apiOverrideIds,
    userType,
    newUserTags,
  ])

  async function handleLookupSteamId(e) {
    e.preventDefault()
    const trimmed = customUidInput.trim()
    if (!trimmed) return
    const uid = Number(trimmed)
    const known = REAL_STEAM_USERS.find((u) => u.user_id === uid)
    if (known) {
      setSelectedUserId(known.user_id)
      setApiOverrideIds(null)
      return
    }
    const apiRes = await fetchUserRecommendationsApi(uid, {
      topN,
      excludeConsumed: true,
      baseUrl: apiUrl,
    })
    if (apiRes.fromApi && apiRes.rawList?.length) {
      setApiOverrideIds(apiRes.rawList)
      setApiOnline(true)
    } else {
      alert(`Não foi possível encontrar a conta #${uid}. Verifique o ID ou escolha um perfil da lista.`)
    }
  }

  function handleToggleNewUserTag(tag) {
    setNewUserTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  function handleAddRefGameToNewUser(appId) {
    const idNum = Number(appId)
    if (!idNum || newUserRefGames.some((i) => i.app_id === idNum)) return
    setNewUserRefGames((prev) => [...prev, { app_id: idNum, is_recommended: true }])
    setSelectedAddGameId('')
  }

  function handleRemoveNewUserRefGame(appId) {
    setNewUserRefGames((prev) => prev.filter((i) => i.app_id !== appId))
  }

  const allCatalogTags = useMemo(() => {
    const s = new Set()
    STEAM_CATALOG.forEach((g) => (g.tags || []).forEach((t) => s.add(t)))
    return Array.from(s).sort()
  }, [])

  const filteredCatalog = useMemo(() => {
    return STEAM_CATALOG.filter((g) => {
      const matchesQuery =
        !catalogSearch.trim() ||
        g.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        (g.description || '').toLowerCase().includes(catalogSearch.toLowerCase())
      const matchesTag = catalogTagFilter === 'ALL' || (g.tags || []).includes(catalogTagFilter)
      return matchesQuery && matchesTag
    })
  }, [catalogSearch, catalogTagFilter])

  const availableGamesToPick = useMemo(() => {
    const picked = new Set(newUserRefGames.map((i) => i.app_id))
    return STEAM_CATALOG.filter((g) => !picked.has(g.app_id))
  }, [newUserRefGames])

  const newUserHasAnyPreference = newUserTags.length > 0 || newUserRefGames.length > 0

  return (
    <ThemeProvider theme={steamDarkTheme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
        {/* Top Bar */}
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
              {/* Brand + Navigation */}
              <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
                <Box>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 700, letterSpacing: '0.02em', color: '#fff', lineHeight: 1.2 }}
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

              {/* Switcher: Usuário Existente vs. Novo Usuário */}
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                  Perfil:
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  color="primary"
                  value={userType}
                  exclusive
                  onChange={(_, val) => {
                    if (val) {
                      setUserType(val)
                      setPageView('forYou')
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

        {/* Main Content */}
        <Container maxWidth="xl" sx={{ py: 3.5, flex: 1 }}>
          {pageView === 'forYou' ? (
            <Stack spacing={3}>
              {/* Top Profile / Onboarding Section */}
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
                          {selectedExistingUser.handle.slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" color="primary.main">
                            Conta Steam Conectada
                          </Typography>
                          <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
                            Olá, {selectedExistingUser.handle}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID #{selectedExistingUser.user_id} · {fbcResult.profileSummary.validGames}{' '}
                            jogos na biblioteca ({fbcResult.profileSummary.totalHours}h jogadas)
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 7, md: 4 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="switch-account-label">Trocar de conta existente</InputLabel>
                        <Select
                          labelId="switch-account-label"
                          label="Trocar de conta existente"
                          value={selectedUserId}
                          onChange={(e) => {
                            setSelectedUserId(Number(e.target.value))
                            setApiOverrideIds(null)
                          }}
                        >
                          {REAL_STEAM_USERS.map((u) => (
                            <MenuItem key={u.user_id} value={u.user_id}>
                              {u.handle} ({u.interactions.length} jogos)
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid size={{ xs: 12, sm: 5, md: 3 }}>
                      <Box
                        component="form"
                        onSubmit={handleLookupSteamId}
                        sx={{ display: 'flex', gap: 1 }}
                      >
                        <TextField
                          fullWidth
                          size="small"
                          placeholder="Buscar por Steam ID..."
                          value={customUidInput}
                          onChange={(e) => setCustomUidInput(e.target.value)}
                        />
                        <Button type="submit" variant="outlined" size="small">
                          Carregar
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                ) : (
                  /* New User Onboarding: starts clean, picks genres or reference titles without fake hours */
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
                          Como você ainda não tem histórico na plataforma, selecione abaixo os
                          gêneros que mais te interessam ou algum título de referência.
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
                          }}
                          sx={{
                            color: 'text.secondary',
                            whiteSpace: 'nowrap',
                            alignSelf: { xs: 'flex-start', sm: 'center' },
                            flexShrink: 0,
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
                      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.primary' }}>
                        1. Escolha seus gêneros de interesse:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {POPULAR_GENRES.map((genre) => {
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
                    </Box>

                    <Box sx={{ maxWidth: 680 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.primary' }}>
                        2. Opcional — Marque algum jogo específico que tenha chamado sua atenção:
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <FormControl fullWidth size="small">
                          <InputLabel id="new-user-add-game">
                            Selecionar um título de referência...
                          </InputLabel>
                          <Select
                            labelId="new-user-add-game"
                            label="Selecionar um título de referência..."
                            value={selectedAddGameId}
                            onChange={(e) => setSelectedAddGameId(e.target.value)}
                          >
                            {availableGamesToPick.map((g) => (
                              <MenuItem key={g.app_id} value={g.app_id}>
                                {g.title} ({(g.tags || []).slice(0, 2).join(', ')})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          startIcon={<AddIcon />}
                          disabled={!selectedAddGameId}
                          onClick={() => handleAddRefGameToNewUser(selectedAddGameId)}
                          sx={{ px: 2, py: 0.9, whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          Marcar interesse
                        </Button>
                      </Box>
                    </Box>
                  </Stack>
                )}
              </Paper>

              {/* Main 2-Column Store Layout */}
              <Grid container spacing={3}>
                {/* Left Column */}
                <Grid size={{ xs: 12, lg: 4 }}>
                  {userType === 'existing' ? (
                    <Stack spacing={2.5}>
                      <Paper sx={{ p: 2.5 }}>
                        <Stack
                          direction="row"
                          sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
                        >
                          <Typography variant="h6">Sua Biblioteca Recente</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {fbcResult.profileSummary.totalHours}h jogadas
                          </Typography>
                        </Stack>

                        <Stack spacing={1.25}>
                          {(fbcResult.profileSummary.historyWithWeight || []).map((item) => (
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
                              <Box sx={{ width: 84, height: 40, flexShrink: 0 }}>
                                <GameCover
                                  appId={item.app_id}
                                  title={item.game?.title || ''}
                                />
                              </Box>

                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                  {item.game?.title || `App #${item.app_id}`}
                                </Typography>
                                <Stack
                                  direction="row"
                                  spacing={1}
                                  sx={{ alignItems: 'center', mt: 0.25 }}
                                >
                                  <Typography variant="caption" color="text.secondary">
                                    {item.hours}h jogadas
                                  </Typography>
                                  <Chip
                                    label={
                                      item.is_recommended !== false
                                        ? 'Recomendou'
                                        : 'Não recomendou'
                                    }
                                    size="small"
                                    color={item.is_recommended !== false ? 'default' : 'error'}
                                    variant="outlined"
                                    sx={{ height: 18, fontSize: '0.66rem' }}
                                  />
                                </Stack>
                              </Box>
                            </Paper>
                          ))}
                        </Stack>
                      </Paper>

                      {fbcResult.profileSummary.topTags.length > 0 && (
                        <Paper sx={{ p: 2.5 }}>
                          <Typography variant="h6" sx={{ mb: 0.5 }}>
                            Seus Gêneros Mais Jogados
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mb: 2 }}
                          >
                            Calculado automaticamente pelo seu tempo de jogo
                          </Typography>

                          <Stack spacing={1.25}>
                            {fbcResult.profileSummary.topTags.slice(0, 6).map((t) => (
                              <Box key={t.label}>
                                <Stack
                                  direction="row"
                                  sx={{ justifyContent: 'space-between', mb: 0.4 }}
                                >
                                  <Typography variant="body2">{t.label}</Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ fontFamily: 'monospace' }}
                                  >
                                    {(t.weight * 100).toFixed(0)}%
                                  </Typography>
                                </Stack>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(100, t.weight * 100)}
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
                    /* Left Column for NEW USER: Shows only what they selected (no fake hours!) */
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
                        <Paper sx={{ p: 3, bgcolor: '#121a24', textAlign: 'center' }}>
                          <Typography variant="body2" color="text.secondary">
                            Nenhuma preferência marcada ainda. Clique em um ou mais gêneros acima
                            para ver sugestões na hora.
                          </Typography>
                        </Paper>
                      ) : (
                        <Stack spacing={2.5}>
                          {newUserTags.length > 0 && (
                            <Box>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Gêneros selecionados ({newUserTags.length})
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
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
                                  const g = STEAM_CATALOG.find((x) => x.app_id === item.app_id)
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
                                      <Box sx={{ width: 72, height: 34, flexShrink: 0 }}>
                                        <GameCover appId={item.app_id} title={g?.title || ''} />
                                      </Box>
                                      <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                          {g?.title || `App #${item.app_id}`}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          Marcado como interesse
                                        </Typography>
                                      </Box>
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => handleRemoveNewUserRefGame(item.app_id)}
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

                {/* Right Column: Personalized Recommendations */}
                <Grid size={{ xs: 12, lg: 8 }}>
                  <Stack spacing={2}>
                    {/* Preferences Bar */}
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
                          <Typography variant="h6">Recomendados Para Você</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {userType === 'existing'
                              ? 'Jogos inéditos na sua biblioteca compatíveis com o seu histórico'
                              : 'Sugestões baseadas nos gêneros e referências que você escolheu'}
                          </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                          {userType === 'existing' && (
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={useNegativeDislikes}
                                  onChange={(e) => setUseNegativeDislikes(e.target.checked)}
                                />
                              }
                              label={
                                <Typography variant="body2">
                                  Evitar estilo de jogos que não gostei
                                </Typography>
                              }
                            />
                          )}

                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={useMmr}
                                onChange={(e) => setUseMmr(e.target.checked)}
                              />
                            }
                            label={<Typography variant="body2">Mais variedade de gêneros</Typography>}
                          />

                          <ToggleButtonGroup
                            size="small"
                            value={topN}
                            exclusive
                            onChange={(_, val) => val && setTopN(val)}
                          >
                            <ToggleButton value={5}>Top 5</ToggleButton>
                            <ToggleButton value={10}>Top 10</ToggleButton>
                            <ToggleButton value={15}>Top 15</ToggleButton>
                          </ToggleButtonGroup>
                        </Box>
                      </Box>
                    </Paper>

                    {/* Recommendation Cards */}
                    {fbcResult.recommendations.length === 0 ? (
                      <Paper sx={{ p: 6, textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                          Escolha pelo menos um gênero acima para começar
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Assim que você clicar nos gêneros de seu interesse (como RPG, FPS, Terror
                          ou Estratégia), listaremos aqui os jogos mais compatíveis do catálogo.
                        </Typography>
                      </Paper>
                    ) : (
                      fbcResult.recommendations.map((rec) => {
                        const g = rec.game
                        const exp = rec.explanation
                        return (
                          <Card key={rec.app_id} sx={{ overflow: 'hidden' }}>
                            <Grid container>
                              <Grid size={{ xs: 12, sm: 4, md: 3.6 }}>
                                <Box sx={{ height: { xs: 165, sm: '100%' }, minHeight: 145 }}>
                                  <GameCover
                                    appId={rec.app_id}
                                    title={g.title}
                                    borderRadius={0}
                                  />
                                </Box>
                              </Grid>

                              <Grid size={{ xs: 12, sm: 8, md: 8.4 }}>
                                <Box sx={{ p: 2.5 }}>
                                  <Stack
                                    direction="row"
                                    spacing={1.5}
                                    sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
                                  >
                                    <Box>
                                      <Typography
                                        variant="h6"
                                        sx={{ fontSize: '1.05rem', fontWeight: 700 }}
                                      >
                                        {g.title}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Avaliações: {g.rating} ({g.positive_ratio}%) · Lançamento:{' '}
                                        {g.date_release} ·{' '}
                                        {g.price_final === 0
                                          ? 'Gratuito para Jogar'
                                          : `$ ${g.price_final.toFixed(2)}`}
                                      </Typography>
                                    </Box>

                                    <Chip
                                      label={`${(rec.similarity * 100).toFixed(0)}% compatível`}
                                      color="secondary"
                                      size="small"
                                      sx={{ fontWeight: 700, flexShrink: 0 }}
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
                                    {g.description}
                                  </Typography>

                                  {/* Explanation Box adapted to Existing vs New User */}
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
                                      {userType === 'existing' && exp.mostSimilarConsumed ? (
                                        <Typography variant="caption" color="text.primary">
                                          Recomendado porque você jogou{' '}
                                          <Box
                                            component="span"
                                            sx={{ color: 'primary.main', fontWeight: 600 }}
                                          >
                                            {exp.mostSimilarConsumed.title}
                                          </Box>{' '}
                                          ({exp.mostSimilarConsumed.hours}h)
                                        </Typography>
                                      ) : userType === 'new' && exp.mostSimilarConsumed ? (
                                        <Typography variant="caption" color="text.primary">
                                          Semelhante ao seu interesse em{' '}
                                          <Box
                                            component="span"
                                            sx={{ color: 'primary.main', fontWeight: 600 }}
                                          >
                                            {exp.mostSimilarConsumed.title}
                                          </Box>
                                        </Typography>
                                      ) : (
                                        <Typography variant="caption" color="text.primary">
                                          Combina com os gêneros que você escolheu:
                                        </Typography>
                                      )}

                                      <Button
                                        size="small"
                                        variant="text"
                                        startIcon={<InfoOutlinedIcon fontSize="small" />}
                                        onClick={() => setInspectedRec(rec)}
                                        sx={{ py: 0, fontSize: '0.74rem' }}
                                      >
                                        Por que combina comigo?
                                      </Button>
                                    </Box>

                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                      {exp.matchedTags.slice(0, 5).map((mt) => (
                                        <Chip
                                          key={mt.tag}
                                          label={mt.tag}
                                          size="small"
                                          color="primary"
                                          variant="outlined"
                                          sx={{ height: 22, fontSize: '0.72rem' }}
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
                    )}
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          ) : (
            /* Explore Catalog View */
            <Stack spacing={3}>
              <Paper sx={{ p: 2.5 }}>
                <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Buscar jogo pelo nome ou tema"
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="tag-filter-label">Filtrar por Gênero / Tag</InputLabel>
                      <Select
                        labelId="tag-filter-label"
                        label="Filtrar por Gênero / Tag"
                        value={catalogTagFilter}
                        onChange={(e) => setCatalogTagFilter(e.target.value)}
                      >
                        <MenuItem value="ALL">Todos os Gêneros ({allCatalogTags.length})</MenuItem>
                        {allCatalogTags.map((t) => (
                          <MenuItem key={t} value={t}>
                            {t}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      {filteredCatalog.length} jogos encontrados
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>

              <Grid container spacing={2.5}>
                {filteredCatalog.map((g) => {
                  const alreadyInNewProfile = newUserRefGames.some((i) => i.app_id === g.app_id)
                  return (
                    <Grid key={g.app_id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
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
                            <GameCover appId={g.app_id} title={g.title} borderRadius={0} />
                          </Box>
                          <Box sx={{ p: 2 }}>
                            <Stack
                              direction="row"
                              spacing={1}
                              sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
                            >
                              <Typography variant="subtitle1" sx={{ fontSize: '0.95rem' }}>
                                {g.title}
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
                                {g.price_final === 0 ? 'Gratuito' : `$${g.price_final}`}
                              </Typography>
                            </Stack>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', mb: 1 }}
                            >
                              {g.rating} ({g.positive_ratio}%)
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
                              {g.description}
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {(g.tags || []).slice(0, 4).map((t) => (
                                <Chip
                                  key={t}
                                  label={t}
                                  size="small"
                                  sx={{ height: 20, fontSize: '0.68rem' }}
                                />
                              ))}
                            </Box>
                          </Box>
                        </Box>

                        <Box sx={{ px: 2, pb: 2 }}>
                          <Button
                            fullWidth
                            size="small"
                            variant={alreadyInNewProfile ? 'contained' : 'outlined'}
                            onClick={() => {
                              handleAddRefGameToNewUser(g.app_id)
                              setUserType('new')
                              setPageView('forYou')
                            }}
                          >
                            {alreadyInNewProfile
                              ? 'Marcado como interesse'
                              : 'Tenho interesse neste jogo'}
                          </Button>
                        </Box>
                      </Card>
                    </Grid>
                  )
                })}
              </Grid>
            </Stack>
          )}
        </Container>

        {/* Explanation Details Dialog */}
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
                    Índice de compatibilidade: {(inspectedRec.similarity * 100).toFixed(1)}% (Similaridade do Cosseno)
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setInspectedRec(null)}>
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
                        <strong>{inspectedRec.explanation.mostSimilarConsumed.title}</strong>
                        {userType === 'existing' &&
                          ` (${inspectedRec.explanation.mostSimilarConsumed.hours}h jogadas)`}{' '}
                        tem{' '}
                        <strong>
                          {(
                            inspectedRec.explanation.mostSimilarConsumed.itemSimilarity * 100
                          ).toFixed(0)}
                          %
                        </strong>{' '}
                        de similaridade direta com este título.
                      </Typography>
                    </Paper>
                  )}

                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 4 }}>
                      <Paper sx={{ p: 1.5, bgcolor: '#121a24', textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          Gêneros / Tags
                        </Typography>
                        <Typography variant="h6" color="primary.main">
                          {inspectedRec.explanation.breakdown.tagsPct}%
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Paper sx={{ p: 1.5, bgcolor: '#121a24', textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          Temas na Sinopse
                        </Typography>
                        <Typography variant="h6" color="secondary.main">
                          {inspectedRec.explanation.breakdown.tfidfPct}%
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid size={{ xs: 4 }}>
                      <Paper sx={{ p: 1.5, bgcolor: '#121a24', textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                          Avaliação / Preço
                        </Typography>
                        <Typography variant="h6">
                          {inspectedRec.explanation.breakdown.numPct}%
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Característica em comum</TableCell>
                        <TableCell>Origem</TableCell>
                        <TableCell align="right">Peso na recomendação</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {inspectedRec.explanation.matchedTags.map((t) => (
                        <TableRow key={`tag-${t.tag}`}>
                          <TableCell sx={{ color: 'primary.main', fontWeight: 500 }}>
                            {t.tag}
                          </TableCell>
                          <TableCell>Gênero / Tag</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                            +{(t.contribution * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                      {inspectedRec.explanation.matchedTerms.map((term) => (
                        <TableRow key={`tfidf-${term.term}`}>
                          <TableCell sx={{ color: 'secondary.main', fontFamily: 'monospace' }}>
                            {term.term}
                          </TableCell>
                          <TableCell>Termo na sinopse (TF-IDF)</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                            +{(term.contribution * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Stack>
              </DialogContent>
            </>
          )}
        </Dialog>

        {/* Footer */}
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
              sx={{ justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Typography variant="caption" color="text.secondary">
                O Que Temos Hoje? — Recomendações personalizadas de jogos
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {apiOnline ? 'Conectado ao servidor FastAPI' : 'Modo demonstração local'}
              </Typography>
            </Stack>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
