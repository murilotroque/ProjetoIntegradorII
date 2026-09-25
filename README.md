# Projeto Integrador II — Comércio Exterior do Porto de Santos

Dashboard acadêmico para análise dos fluxos de importação e exportação do Porto de Santos entre 2018 e 2025, com foco em produtos, parceiros comerciais e sazonalidade.

## Sobre o projeto

O projeto organiza e transforma dados de comércio exterior em uma interface interativa para leitura quantitativa dos fluxos vinculados ao Porto de Santos. A análise considera os países China, Estados Unidos e Rússia e permite explorar evolução temporal, composição da pauta, concentração geográfica e sazonalidade.

### Funcionalidades

- Filtros por ano, produto e país.
- Abas de Resumo, Qualidade, Importações, Exportações, Produtos e Metodologia.
- Tooltips com valores detalhados em pontos, segmentos e gráficos.
- Comparação da participação dos três países por produto em janela interativa.
- Catálogo paginado com fluxo, código NCM, descrição, ano e país.
- Gráficos de evolução anual, participação por país, estrutura da pauta, sazonalidade mensal e valor unitário anual.

## Base utilizada

Os dados foram harmonizados e agregados a partir de 14 arquivos de origem, totalizando:

- **1.403.861 registros** tratados;
- **8.564 produtos** identificados;
- **114.286 combinações** anuais de fluxo, ano, país e produto;
- período de **2018 a 2025**;
- fluxos de **Importação** e **Exportação**.

Os indicadores financeiros são apresentados em valor FOB (US$) e os indicadores físicos em quilograma líquido. As participações e os valores unitários são calculados diretamente sobre as agregações disponibilizadas no projeto.

As 14 planilhas utilizadas como fonte estão disponíveis no diretório [`dados/`](dados/). Para a execução do dashboard, as informações tratadas e agregadas encontram-se em `assets/`.

## Estrutura

```text
.
├── index.html              # Interface principal
├── styles.css              # Estilos responsivos
├── app.js                  # Filtros, cálculos e visualizações
├── assets/
│   ├── data.js             # Agregações anuais
│   ├── data-monthly.js     # Agregações mensais
│   └── data-summary.json   # Resumo técnico da base
├── dados/                   # 14 planilhas originais de importação e exportação
└── LICENSE
```

## Execução local

Como o dashboard carrega arquivos JavaScript de dados, utilize um servidor HTTP local:

```bash
python -m http.server 4173
```

Depois, acesse `http://localhost:4173`.

## Acesso ao dashboard

O dashboard está publicado e pode ser acessado em:

**[analiseeestudodecaso.vercel.app](https://analiseeestudodecaso.vercel.app/)**

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE).

## Autores

- Grazielly dos Santos da Costa
- João Vitor da Silva Maia
- Miguel Silva Pereira
- Murilo Teixeira Roque Banuis
