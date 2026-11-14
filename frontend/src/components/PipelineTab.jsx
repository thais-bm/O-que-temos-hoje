import { useState } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Chip,
  Stack,
  Divider,
} from '@mui/material'
import { cleanText } from '../utils/fbcEngine'

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Pré-processamento Textual',
    module: 'src/data/preprocess.py :: clean_text()',
    desc: 'Conversão para minúsculas, tokenização alfabética, remoção de stopwords em inglês e português (NLTK) e redução ao radical com SnowballStemmer.',
  },
  {
    step: '02',
    title: 'Representação Vetorial dos Itens',
    module: 'src/data/preprocess.py :: build_item_vectors()',
    desc: 'Concatenação em matriz esparsa CSR: TF-IDF das sinopses (5000 features), codificação Multi-Hot das tags da Steam e MinMaxScaler dos atributos numéricos.',
  },
  {
    step: '03',
    title: 'Construção do Perfil do Usuário',
    module: 'src/data/preprocess.py :: build_user_profile()',
    desc: 'Média ponderada dos vetores dos itens consumidos pelo usuário, utilizando o tempo jogado (hours) como peso e permitindo penalização de avaliações negativas.',
  },
  {
    step: '04',
    title: 'Similaridade do Cosseno',
    module: 'src/models/recommender.py :: cosine_similarity()',
    desc: 'Cálculo do cosseno do ângulo entre o vetor do perfil p_u e cada vetor de item v_i do catálogo: sim(p_u, v_i) = (p_u · v_i) / (||p_u|| · ||v_i||).',
  },
  {
    step: '05',
    title: 'Ranking Top-N e Filtro de Consumidos',
    module: 'src/models/recommender.py :: recommend()',
    desc: 'Exclusão obrigatória dos jogos já consumidos pelo usuário e ordenação decrescente pelos maiores scores de similaridade (ou re-ranking MMR).',
  },
  {
    step: '06',
    title: 'Explicabilidade da Recomendação',
    module: 'Decomposição do Produto Interno',
    desc: 'Cálculo da contribuição individual c_k = (p_{u,k} · v_{i,k}) / (||p_u|| · ||v_i||) para identificar quais tags, termos TF-IDF e itens do histórico geraram a recomendação.',
  },
]

export function PipelineTab() {
  const [sampleInput, setSampleInput] = useState(
    'Enter the dark fantasy world of ELDEN RING. Explore vast dungeons, fight colossal monsters and master magic in this action RPG.'
  )
  const [hoursGameA, setHoursGameA] = useState(40)
  const [hoursGameB, setHoursGameB] = useState(10)

  const cleanedTokens = cleanText(sampleInput)

  const vecA = [1, 0, 0.8, 0]
  const vecB = [1, 1, 0.4, 0]
  const cand1 = [1, 1, 0.7, 0]
  const cand2 = [0, 0, 0.2, 1]

  const totalW = Math.max(1, Number(hoursGameA) + Number(hoursGameB))
  const profile = vecA.map(
    (v, idx) => (v * Number(hoursGameA) + vecB[idx] * Number(hoursGameB)) / totalW
  )

  const norm = (arr) => Math.sqrt(arr.reduce((acc, x) => acc + x * x, 0)) || 1e-9
  const dot = (a, b) => a.reduce((acc, x, i) => acc + x * b[i], 0)

  const pNorm = norm(profile)
  const c1Norm = norm(cand1)
  const c2Norm = norm(cand2)
  const sim1 = dot(profile, cand1) / (pNorm * c1Norm)
  const sim2 = dot(profile, cand2) / (pNorm * c2Norm)

  return (
    <Stack spacing={3}>
      {/* 6 Stages Grid */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ mb: 2.5 }}>
          <Typography variant="h6">Arquitetura do Pipeline FBC</Typography>
          <Typography variant="caption" color="text.secondary">
            As seis etapas obrigatórias implementadas no projeto
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {PIPELINE_STEPS.map((item) => (
            <Grid key={item.step} size={{ xs: 12, sm: 6, md: 4 }}>
              <Paper sx={{ p: 2.5, height: '100%', bgcolor: '#121a24' }}>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                  <Chip
                    label={item.step}
                    size="small"
                    color="primary"
                    sx={{ fontFamily: 'monospace', fontWeight: 700, height: 22 }}
                  />
                  <Typography variant="subtitle1" sx={{ fontSize: '0.95rem' }}>
                    {item.title}
                  </Typography>
                </Stack>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontFamily: 'monospace',
                    color: 'secondary.main',
                    mb: 1,
                  }}
                >
                  {item.module}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {item.desc}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Interactive Simulators Row */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Simulador de Pré-processamento (clean_text)
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Teste a remoção de stopwords e stemming sobre qualquer descrição textual
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={3}
              size="small"
              label="Descrição do item"
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
              sx={{ mb: 2 }}
            />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Radicais gerados ({cleanedTokens.length} tokens)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {cleanedTokens.map((tok, i) => (
                <Chip
                  key={`${tok}-${i}`}
                  label={`tfidf::${tok}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
              ))}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Exemplo Numérico Passo a Passo
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Espaço vetorial reduzido de 4 dimensões: [tag::RPG, tag::Souls-like, tfidf::world, tag::FPS]
            </Typography>

            <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Horas em Witcher 3 [1, 0, 0.8, 0]"
                type="number"
                size="small"
                value={hoursGameA}
                onChange={(e) => setHoursGameA(Number(e.target.value) || 1)}
                fullWidth
              />
              <TextField
                label="Horas em Dark Souls [1, 1, 0.4, 0]"
                type="number"
                size="small"
                value={hoursGameB}
                onChange={(e) => setHoursGameB(Number(e.target.value) || 1)}
                fullWidth
              />
            </Stack>

            <Paper sx={{ p: 2, bgcolor: '#101720', fontFamily: 'monospace', fontSize: '0.8rem' }}>
              <Box sx={{ color: 'primary.main', mb: 1 }}>
                Perfil p_u = [{profile.map((x) => x.toFixed(2)).join(', ')}] (norma L2 ={' '}
                {pNorm.toFixed(2)})
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ color: 'secondary.main', mb: 0.5 }}>
                Candidato 1 (Elden Ring [1, 1, 0.7, 0]): cos = {dot(profile, cand1).toFixed(2)} / (
                {pNorm.toFixed(2)} * {c1Norm.toFixed(2)}) = {(sim1 * 100).toFixed(1)}%
              </Box>
              <Box sx={{ color: 'text.secondary' }}>
                Candidato 2 (Counter-Strike [0, 0, 0.2, 1]): cos ={' '}
                {dot(profile, cand2).toFixed(2)} / ({pNorm.toFixed(2)} * {c2Norm.toFixed(2)}) ={' '}
                {(sim2 * 100).toFixed(1)}%
              </Box>
            </Paper>
          </Paper>
        </Grid>
      </Grid>

      {/* Limitations Section */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 0.5 }}>
          Limitações da Filtragem Baseada em Conteúdo
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
          Análise crítica exigida na especificação do trabalho
        </Typography>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: '#121a24' }}>
              <Typography variant="subtitle1" sx={{ color: 'warning.main', mb: 1 }}>
                1. Superespecialização
              </Typography>
              <Typography variant="body2" color="text.secondary">
                O modelo tende a recomendar apenas itens muito similares aos jogos com mais horas
                acumuladas (ex.: usuário #11150647 com 444.8h em Terraria). Para mitigar esse
                efeito, implementamos o re-ranking por diversidade via Maximal Marginal Relevance
                (MMR).
              </Typography>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: '#121a24' }}>
              <Typography variant="subtitle1" sx={{ color: 'primary.main', mb: 1 }}>
                2. Cold Start de Usuário
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Usuários novos sem interações prévias em recommendations.csv não possuem vetor de
                perfil. Na interface, resolvemos esse problema com o modo interativo de Cold Start,
                permitindo selecionar jogos ou gêneros favoritos iniciais.
              </Typography>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2.5, height: '100%', bgcolor: '#121a24' }}>
              <Typography variant="subtitle1" sx={{ color: 'warning.main', mb: 1 }}>
                3. Qualidade dos Metadados
              </Typography>
              <Typography variant="body2" color="text.secondary">
                A FBC depende diretamente da riqueza das descrições e tags. No dataset bruto
                games_metadata.json, 15.316 de 50.872 jogos não possuem tags ou sinopse, fazendo o
                vetor depender apenas de atributos numéricos se não houver curadoria.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>
    </Stack>
  )
}
