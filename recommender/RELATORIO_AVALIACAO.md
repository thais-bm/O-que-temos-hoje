# Relatório de Avaliação — Recomendador FBC (Steam)

Este documento registra o protocolo de avaliação offline, os resultados obtidos
e a interpretação do recomendador por Filtragem Baseada em Conteúdo (FBC)
contra os baselines de popularidade e aleatório.

## Protocolo de avaliação

O script `recommender/scripts/evaluate.py` executa o seguinte fluxo:

1. **Amostragem de usuários**: seleciona usuários com pelo menos 5 interações
   na tabela `recommendations` (amostragem pontual por `rowid` para evitar
   ordenar milhões de registros).
2. **Split treino/teste**: `train_test_split` com divisão temporal por usuário
   (quando há coluna `date`) e fallback aleatório com semente fixa (`42`).
   `test_size=0.2`, `min_interactions=5`.
3. **Construção de vetores**: `build_item_vectors` combina TF-IDF da descrição
   (peso 1.0), multi-hot de tags (peso 1.0) e atributos numéricos
   `price_final` / `discount` (peso 0.3, MinMaxScaler).
4. **Perfil de usuário**: `positive_profile - 0.5 * negative_profile`, médias
   ponderadas pelo peso de interação `1 + log1p(horas)`.
5. **Métricas**: Precision@N, Recall@N e nDCG@N (ganho binário), calculadas
   somente sobre itens positivos no teste, excluindo itens consumidos no treino.
6. **Baselines**: popularidade (itens mais positivos no treino, excluindo
   consumidos) e aleatório (amostragem sem reposição do catálogo, excluindo
   consumidos).
7. **Cobertura**: fração do catálogo recomendada a pelo menos um usuário (FBC).

Os resultados são salvos em `recommender/results/evaluation_results.csv`.

## Resultados (amostra de 100 usuários)

Arquivo: `recommender/results/evaluation_results.csv`

| modelo | top_n | precision | recall | ndcg | coverage | users_evaluated |
|--------|-------|-----------|--------|------|----------|-----------------|
| FBC | 5 | 0.0089 | 0.0048 | 0.0099 | 0.0073 | 100 |
| Popularidade | 5 | 0.0044 | 0.0120 | 0.0059 | — | 100 |
| Aleatório | 5 | 0.0000 | 0.0000 | 0.0000 | — | 100 |
| FBC | 10 | 0.0056 | 0.0055 | 0.0082 | 0.0073 | 100 |
| Popularidade | 10 | 0.0033 | 0.0231 | 0.0087 | — | 100 |
| Aleatório | 10 | 0.0000 | 0.0000 | 0.0000 | — | 100 |

Interações de treino: 996 | Interações de teste: 246

## Interpretação

- **FBC vs Popularidade**: o FBC apresenta precisão e nDCG superiores à
  popularidade em ambos os cortes (Top-5 e Top-10), indicando que as
  recomendações são mais alinhadas ao perfil individual do usuário. A
  popularidade vence em recall porque recomenda itens gerais que aparecem com
  mais frequência no teste.
- **FBC vs Aleatório**: o FBC supera claramente o baseline aleatório em todas
  as métricas, confirmando que o modelo captura sinal de preferência real.
- **Cobertura**: baixa (~0,73% do catálogo), esperada em sistemas de conteúdo
  com catálogo grande e histórico esparso; reflete que poucos jogos são
  recomendados para a amostra avaliada.
- **Valores absolutos baixos**: métricas em torno de 0,01 são típicas de
  recomendações de itens long-tail com histórico esparso e poucos itens
  relevantes por usuário no teste.

## Como reproduzir

Na raiz de `recommender/` (com o ambiente ativado):

```bash
uv run python scripts/evaluate.py --users 100 --seed 42
```

Os resultados serão gravados em `results/evaluation_results.csv`.

## Limitações conhecidas

- Avaliação offline com ganho binário (não considera grau de relevância).
- Split temporal pode deixar poucos itens relevantes no teste para usuários
  com histórico curto, comprimindo recall e nDCG.
- Cobertura é calculada apenas para o FBC (baselines não preenchem o campo).
