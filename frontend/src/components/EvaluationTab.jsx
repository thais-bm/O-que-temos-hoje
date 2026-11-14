import { useState } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Stack,
  Divider,
  SvgIcon,
} from '@mui/material'
import { OFFLINE_EVALUATION, REAL_STEAM_USERS } from '../data/steamDataset'

function ArrowForwardIcon(props) {
  return (
    <SvgIcon {...props}>
      <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
    </SvgIcon>
  )
}

export function EvaluationTab({ onSelectUserForDemo, apiMetrics }) {
  const [selectedN, setSelectedN] = useState(10)

  const evalSource = apiMetrics || OFFLINE_EVALUATION
  const rows = selectedN === 5 ? evalSource.metricsAt5 : evalSource.metricsAt10
  const protocol = evalSource.protocol

  const maxPrecision = Math.max(...rows.map((r) => r.precision), 0.01)
  const maxRecall = Math.max(...rows.map((r) => r.recall), 0.01)
  const maxNdcg = Math.max(...rows.map((r) => r.ndcg), 0.01)

  return (
    <Stack spacing={3}>
      {/* KPI Summary Row */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2">Catálogo Steam</Typography>
            <Typography variant="h5" sx={{ color: 'primary.main', mt: 0.5 }}>
              {protocol.totalCatalogRaw.toLocaleString('pt-BR')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {protocol.gamesWithRichMetadata.toLocaleString('pt-BR')} jogos com descrição e tags
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2">Usuários no Teste</Typography>
            <Typography variant="h5" sx={{ color: 'primary.main', mt: 0.5 }}>
              {protocol.evaluatedUsers}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Mínimo de {protocol.minInteractions} interações por usuário
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2">Cobertura FBC@{selectedN}</Typography>
            <Typography variant="h5" sx={{ color: 'secondary.main', mt: 0.5 }}>
              {(rows[0].coverage * 100).toFixed(1)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">
              vs. {(rows[1].coverage * 100).toFixed(1)}% no baseline de popularidade
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle2">Protocolo Experimental</Typography>
            <Typography variant="h5" sx={{ color: 'text.primary', mt: 0.5 }}>
              Seed {protocol.randomSeed}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Divisão 80% treino / 20% teste por usuário
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Main Comparison Table */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box>
            <Typography variant="h6">Comparativo Experimental: FBC vs. Baselines</Typography>
            <Typography variant="caption" color="text.secondary">
              Métricas médias sobre os usuários de teste sem vazamento de dados
            </Typography>
          </Box>

          <ToggleButtonGroup
            size="small"
            value={selectedN}
            exclusive
            onChange={(_, val) => val && setSelectedN(val)}
          >
            <ToggleButton value={5}>Top-5</ToggleButton>
            <ToggleButton value={10}>Top-10</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <TableContainer>
          <Table size="medium">
            <TableHead>
              <TableRow>
                <TableCell>Modelo</TableCell>
                <TableCell align="right">Precision@{selectedN}</TableCell>
                <TableCell align="right">Recall@{selectedN}</TableCell>
                <TableCell align="right">nDCG@{selectedN}</TableCell>
                <TableCell align="right">Cobertura</TableCell>
                <TableCell align="right">Diversidade (ILD)</TableCell>
                <TableCell align="right">Novidade</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.key}
                  sx={{
                    bgcolor: r.highlight ? 'rgba(102, 192, 244, 0.06)' : 'transparent',
                  }}
                >
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Typography
                        variant="body2"
                         sx={{ fontWeight: r.highlight ? 600 : 400, color: 'text.primary' }}
                      >
                        {r.model}
                      </Typography>
                      {r.highlight && (
                        <Chip
                          label="Modelo Principal"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {(r.precision * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {(r.recall * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {(r.ndcg * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: r.coverage > 0.5 ? 'secondary.main' : 'warning.main',
                    }}
                  >
                    {(r.coverage * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {(r.diversity * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {(r.novelty * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ p: 3 }}>
          <Grid container spacing={2.5}>
            {[
              { title: `Precision@${selectedN}`, field: 'precision', max: maxPrecision },
              { title: `Recall@${selectedN}`, field: 'recall', max: maxRecall },
              { title: `nDCG@${selectedN}`, field: 'ndcg', max: maxNdcg },
              { title: 'Cobertura do Catálogo', field: 'coverage', max: 1.0 },
            ].map((metric) => (
              <Grid key={metric.field} size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper sx={{ p: 2, bgcolor: '#121a24' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1.5, color: 'text.primary' }}>
                    {metric.title}
                  </Typography>
                  <Stack spacing={1.2}>
                    {rows.map((r) => {
                      const pct = Math.min(100, (r[metric.field] / metric.max) * 100)
                      return (
                        <Box key={r.key}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            sx={{ mb: 0.5 }}
                          >
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {r.model.replace(' (TF-IDF + Tags + Numéricos)', '')}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: 'monospace', color: 'text.primary' }}
                            >
                              {(r[metric.field] * 100).toFixed(2)}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            color={r.highlight ? 'primary' : 'inherit'}
                            sx={{
                              height: 6,
                              borderRadius: 3,
                              bgcolor: 'rgba(255,255,255,0.06)',
                              color: r.highlight ? 'primary.main' : 'rgba(143,152,160,0.45)',
                            }}
                          />
                        </Box>
                      )
                    })}
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="subtitle2" sx={{ color: 'primary.main', mb: 1 }}>
            Análise Crítica dos Resultados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            O modelo de Filtragem Baseada em Conteúdo supera amplamente o Baseline Aleatório em
            Precision@{selectedN}, Recall@{selectedN} e nDCG@{selectedN}, comprovando a eficácia
            dos vetores TF-IDF + Multi-Hot Tags. Na comparação com o Baseline de Popularidade,
            observa-se o efeito clássico de cauda longa (long-tail) da Steam: recomendar apenas os
            10 jogos mais famosos gera acurácia bruta elevada, mas resulta em cobertura de catálogo
            de apenas {(rows[1].coverage * 100).toFixed(1)}% (zero personalização). O FBC atinge{' '}
            {(rows[0].coverage * 100).toFixed(1)}% de cobertura com recomendações personalizadas.
          </Typography>
        </Box>
      </Paper>

      {/* Qualitative Case Studies */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="h6">Avaliação Qualitativa: Casos Reais do Dataset</Typography>
          <Typography variant="caption" color="text.secondary">
            Análise de acertos e limitações em usuários reais extraídos de recommendations.csv
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {REAL_STEAM_USERS.map((u) => (
            <Grid key={u.user_id} size={{ xs: 12, md: 6 }}>
              <Paper
                sx={{
                  p: 2.5,
                  height: '100%',
                  bgcolor: '#121a24',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderColor:
                    u.case_type === 'limitation'
                      ? 'rgba(240, 180, 41, 0.35)'
                      : 'rgba(102, 192, 244, 0.14)',
                }}
              >
                <Box>
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <Typography variant="subtitle1" sx={{ color: 'text.primary' }}>
                      {u.handle}{' '}
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ fontFamily: 'monospace', color: 'text.secondary', ml: 0.5 }}
                      >
                        (#{u.user_id})
                      </Typography>
                    </Typography>
                    <Chip
                      label={u.case_badge}
                      size="small"
                      color={u.case_type === 'limitation' ? 'warning' : 'primary'}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22 }}
                    />
                  </Stack>

                  <Typography variant="body2" sx={{ color: 'text.primary', mb: 1 }}>
                    {u.summary}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {u.qualitative_analysis}
                  </Typography>
                </Box>

                <Button
                  variant="outlined"
                  size="small"
                  endIcon={<ArrowForwardIcon fontSize="small" />}
                  onClick={() => onSelectUserForDemo(u.user_id)}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Abrir usuário no recomendador
                </Button>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>
    </Stack>
  )
}
