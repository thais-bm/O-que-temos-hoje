# Guia do Trabalho — Sistema de Recomendação por Filtragem Baseada em Conteúdo

Nov 5, 2026 · @Fabio

## 1. Visão geral

Cada equipe deve construir, avaliar e apresentar um sistema de recomendação que use **Filtragem Baseada em Conteúdo** (FBC): recomendar itens parecidos com aqueles de que o usuário já gostou, a partir das características dos próprios itens. A entrega final é no dia **16/11/2026**.

A FBC não depende das avaliações de outros usuários. Ela compara a representação de cada item (texto, gênero, autor, atributos) com um perfil construído a partir do histórico do usuário.

**Ao final do trabalho, cada estudante deverá ser capaz de:**

1. Transformar descrições de itens em vetores de características (ex.: TF-IDF).
2. Construir o perfil de um usuário a partir dos itens que ele avaliou ou consumiu.
3. Calcular similaridade entre itens e perfis e gerar uma lista Top-N.
4. Avaliar a qualidade das recomendações com métricas e um protocolo justo.
5. Explicar por que um item foi recomendado e discutir limitações da FBC (superespecialização, cold start de usuário, dependência da qualidade dos metadados).

## 2. Equipes e cronograma

As equipes têm **até 4 membros** e devem ser informadas ao professor até 07/11/2026, junto com o domínio escolhido. Trabalhos individuais ou em dupla são aceitos, com o mesmo escopo mínimo.

**Papéis sugeridos.** Cada membro lidera uma frente, mas todos devem entender o sistema inteiro — qualquer membro pode ser chamado a explicar qualquer parte na apresentação.

| Papel                  | Responsabilidade principal                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| Engenharia de dados    | Coleta, limpeza e documentação do dataset; análise exploratória            |
| Modelagem              | Representação dos itens, perfil do usuário, função de similaridade         |
| Avaliação              | Protocolo de teste, métricas, baselines e análise dos resultados           |
| Produto e documentação | Interface de demonstração, README, relatório e organização da apresentação |

## 3. O que deve ser desenvolvido

O sistema deve seguir o pipeline clássico de FBC, de ponta a ponta, em Python (recomendado) ou outra linguagem combinada com o professor.

**3.1 Domínio e dados.** Escolha um domínio com itens bem descritos e interações de usuários. Mínimo: 500 itens com ao menos um atributo textual, e dados de preferência (notas, cliques ou listas) de pelo menos 50 usuários. Sugestões:

- Filmes: MovieLens (gêneros e tags) combinado com sinopses do TMDB
- Livros: Goodreads ou Book-Crossing (título, autor, gênero, descrição)
- Jogos: catálogo da Steam (gêneros, tags, descrição)
- Música: atributos de faixas do Spotify (dados numéricos + gênero)
- Artigos científicos: arXiv (título, resumo, categorias)

Datasets próprios (ex.: produtos de um comércio local, disciplinas de um curso) são bem-vindos, desde que documentados e sem dados pessoais identificáveis.

**3.2 Pipeline obrigatório.**

1. **Pré-processamento** — limpeza de texto (minúsculas, stopwords em PT/EN, lematização ou stemming), tratamento de valores ausentes e normalização de atributos numéricos.
2. **Representação dos itens** — pelo menos uma representação vetorial: TF-IDF, bag-of-words, one-hot de categorias ou combinação delas.
3. **Perfil do usuário** — vetor construído a partir dos itens consumidos, por exemplo a média ponderada pela nota (itens mal avaliados podem entrar com peso negativo).
4. **Similaridade** — similaridade do cosseno (obrigatória) entre o perfil e cada item ainda não consumido.
5. **Recomendação Top-N** — ranking dos N itens mais similares, excluindo os já consumidos.
6. **Explicação** — para cada item recomendado, mostrar o motivo (ex.: termos ou gêneros em comum com o perfil, item do histórico mais parecido).

**3.3 Interface de demonstração.** Uma interface simples (Streamlit, Gradio, notebook interativo ou web) em que se escolha um usuário — ou se marquem alguns itens de que se gosta — e se veja o Top-N com as explicações.

**3.4 Extensões opcionais (contam como bônus).**

- Representação com embeddings semânticos (ex.: Sentence-Transformers) comparada ao TF-IDF
- Atributos visuais extraídos de imagens (pôsteres, capas) com uma CNN ou CLIP
- Estratégia de diversidade no Top-N (ex.: MMR) para reduzir a superespecialização
- Tratamento de cold start de usuário (questionário inicial de preferências)
- Comparação com uma abordagem híbrida simples (FBC + popularidade ou colaborativa)

## 4. Avaliação experimental do sistema

O sistema precisa ser avaliado offline, com dados separados para teste, e comparado a pelo menos dois baselines. Resultados sem protocolo claro não serão considerados.

**Protocolo mínimo.**

1. Para cada usuário, separe parte das interações relevantes (ex.: 20% mais recentes, ou _leave-one-out_) como conjunto de teste.
2. Construa o perfil apenas com as interações de treino.
3. Gere o Top-N (N = 5 e N = 10) e verifique quantos itens de teste aparecem na lista.
4. Defina e justifique o que é um item "relevante" (ex.: nota ≥ 4 em escala de 1 a 5).
5. Fixe a semente aleatória e registre todos os parâmetros, para que o resultado seja reproduzível.

**Métricas obrigatórias:** Precision@N, Recall@N e nDCG@N (média sobre os usuários). **Métricas além da acurácia (escolher pelo menos uma):** cobertura do catálogo, diversidade intra-lista ou novidade.

**Baselines obrigatórios:**

- Recomendação aleatória
- Itens mais populares

**Avaliação qualitativa.** Mostre de 2 a 3 usuários reais do dataset com seu histórico, as recomendações e as explicações, e discuta se fazem sentido. Inclua ao menos um caso em que o sistema erra e analise por quê.

## 5. Entregáveis

Tudo deve ser enviado até **16/11/2026, antes do início da aula**, por um único membro da equipe, com o link do repositório e os arquivos anexados no AVA.

| Entregável            | Conteúdo exigido                                                                                                                         | Formato                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Repositório           | Código-fonte, requirements.txt, script ou notebook que reproduz os resultados, dataset (ou script de download)                           | GitHub ou GitLab, público ou com o professor como colaborador |
| README                | Como instalar e executar, estrutura das pastas, membros e o papel de cada um                                                             | Markdown no repositório                                       |
| Relatório técnico     | Introdução e domínio; dados e análise exploratória; metodologia; protocolo e resultados; discussão de limitações; conclusão; referências | PDF, de 6 a 10 páginas                                        |
| Slides                | Versão visual da apresentação (seção 6)                                                                                                  | PDF                                                           |
| Vídeo de demonstração | Uso da interface com pelo menos um usuário, mostrando recomendações e explicações                                                        | Até 3 minutos, link no README                                 |

O relatório deve incluir uma tabela comparando o sistema com os baselines em todas as métricas, e uma seção curta "Contribuição de cada membro".

## 6. Apresentação

Cada equipe terá **15 minutos de apresentação + 5 minutos de perguntas**, no dia 16/11/2026, em ordem sorteada no início da aula. Todos os membros devem falar.

**Roteiro sugerido:**

1. **Problema e domínio** (2 min) — que itens são recomendados, para quem e por que FBC faz sentido aqui.
2. **Dados** (2 min) — origem, tamanho, atributos usados e principais achados da análise exploratória.
3. **Como o sistema funciona** (4 min) — representação, perfil, similaridade e um exemplo numérico pequeno.
4. **Demonstração ao vivo** (3 min) — escolher um usuário, mostrar o Top-N e as explicações. Tenha o vídeo como plano B.
5. **Resultados** (3 min) — tabela ou gráfico contra os baselines e o que os números significam.
6. **Limitações e próximos passos** (1 min) — onde o sistema falha e o que fariam com mais tempo.

**Perguntas individuais.** O professor fará ao menos uma pergunta dirigida a cada membro, sobre qualquer parte do trabalho. A resposta compõe a nota individual (seção 7).

## 7. Critérios de avaliação

A nota final vai de 0 a 10: **8,0 pontos de nota da equipe + 2,0 pontos de nota individual**, com até 1,0 ponto de bônus pelas extensões opcionais (limitada a 10).

**Nota da equipe (8,0)**

| Critério                      | Peso | O que se espera para a nota máxima                                                                  |
| ----------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| Implementação do pipeline FBC | 2,0  | Representação, perfil, similaridade do cosseno e Top-N corretos, sem recomendar itens já consumidos |
| Avaliação experimental        | 1,5  | Protocolo sem vazamento de dados, Precision/Recall/nDCG@N, baselines e análise crítica dos números  |
| Dados e pré-processamento     | 1,0  | Dataset adequado e documentado, limpeza justificada, análise exploratória útil                      |
| Explicabilidade e interface   | 1,0  | Interface funcional e explicações que realmente refletem o cálculo feito                            |
| Relatório técnico             | 1,0  | Estrutura completa, escrita clara, figuras e tabelas legíveis, referências citadas                  |
| Apresentação                  | 1,0  | Dentro do tempo, demonstração funcionando, todos os membros participando                            |
| Código e reprodutibilidade    | 0,5  | README claro; resultados reproduzidos com um único comando ou notebook                              |

**Nota individual (2,0)**

| Critério            | Peso | Como é medido                                                                                                              |
| ------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| Domínio do trabalho | 1,0  | Resposta à pergunta individual na apresentação                                                                             |
| Contribuição        | 1,0  | Histórico de commits, seção de contribuições do relatório e avaliação entre pares (formulário enviado após a apresentação) |

**Bônus (até 1,0):** cada extensão opcional da seção 3.4 bem implementada e avaliada vale até 0,5.

**Penalidades:** código que não executa a partir do README perde até 50% do critério "Código e reprodutibilidade" e do critério "Implementação"; apresentação acima de 17 minutos perde 0,5.
