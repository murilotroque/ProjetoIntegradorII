# Projeto Integrador II — Comércio Exterior do Porto de Santos

Dashboard acadêmico para análise dos fluxos de importação e exportação do Porto de Santos entre 2018 e 2025, com foco em produtos, parceiros comerciais e sazonalidade.

<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Pandas-150458?style=for-the-badge&logo=pandas&logoColor=white" alt="Pandas">
  <img src="https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/Power%20BI-F2C811?style=for-the-badge&logo=powerbi&logoColor=111111" alt="Power BI">
  <img src="https://img.shields.io/badge/Processo-163A55?style=for-the-badge&logo=git&logoColor=white" alt="Processo de dados">
  <img src="https://img.shields.io/badge/ETL-2AA7A1?style=for-the-badge&logo=apacheairflow&logoColor=white" alt="ETL">
</p>

## Sobre o projeto

O projeto organiza e transforma dados de comércio exterior em uma interface interativa para leitura quantitativa dos fluxos vinculados ao Porto de Santos. A análise considera os países China, Estados Unidos e Rússia e permite explorar evolução temporal, composição da pauta, concentração geográfica e sazonalidade.

### Funcionalidades

- Filtros por ano, produto e país.
- Abas de Resumo, Qualidade, Importações, Exportações, Produtos e Metodologia.
- Aba **Mapa** com visualização geográfica dos fluxos entre o Porto de Santos, Brasil, China, Estados Unidos e Rússia.
- Tooltips com valores detalhados em pontos, segmentos e gráficos.
- Comparação da participação dos três países por produto em janela interativa.
- Catálogo paginado com fluxo, código NCM, descrição, ano e país.
- Gráficos de evolução anual, participação por país, estrutura da pauta, sazonalidade mensal e valor unitário anual.

### Mapa Interativo

A aba **Mapa** apresenta os fluxos comerciais por meio de um mapa-múndi interativo. As rotas de exportação partem do Porto de Santos e as rotas de importação chegam ao porto, com cores, animações e espessuras proporcionais ao valor FOB agregado.

O mapa permite filtrar por ano, produto e fluxo, ampliar com a roda do mouse e navegar segurando o botão esquerdo. Ao selecionar Brasil, China, Estados Unidos ou Rússia, a visualização centraliza o território escolhido, reduz os demais elementos e abre um painel de detalhe com valor FOB, toneladas, participação, número de registros e os três principais produtos importados e exportados no recorte.

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
├── map.js                  # Interações e agregações do mapa
├── assets/
│   ├── data.js             # Agregações anuais
│   ├── data-monthly.js     # Agregações mensais
│   ├── d3.v7.min.js        # Biblioteca de visualização do mapa
│   ├── world.js            # Geometria mundial usada pelo mapa
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

## Autores

- Grazielly dos Santos da Costa
- João Vitor da Silva Maia
- Miguel Silva Pereira
- Murilo Teixeira Roque Banuis

Projeto desenvolvido na **FATEC Baixada Santista — Rubens Lara**.

## Licença

Este repositório está licenciado conforme o arquivo [LICENSE](LICENSE).
