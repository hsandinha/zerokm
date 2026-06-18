# Catálogo Relacional de Variações e Preços

## Objetivo

Separar catálogo mestre de veículos e preço/oferta da concessionária para evitar duplicação de dados.

O modelo legado `Vehicle` continua existindo durante a homologação. A nova arquitetura usa:

- `VehicleVariation`: variação mestre criada por operador/admin.
- `DealerVehiclePrice`: tabela de ligação entre concessionária e variação, criada apenas quando existe preço.
- `Concessionaria.marcaId`/`Concessionaria.marca`: vínculo da concessionária com a marca representada.

## MER

```text
Marca 1 ─── N VehicleVariation

Marca 1 ─── N Concessionaria

Concessionaria 1 ─── N DealerVehiclePrice N ─── 1 VehicleVariation
```

## Collections

### `vehiclevariations`

Catálogo mestre. Não contém preço por concessionária.

Campos principais:

- `_id`
- `marcaId`
- `marca`
- `modelo`
- `versao`
- `codigoFipe`
- `tipoVeiculo`
- `anoModelo`
- `anoFabricacao`
- `combustivel`
- `transmissao`
- `motor`
- `carroceria`
- `portas`
- `opcionaisPadrao`
- `imagemUrl`
- `ativo`

Índice único parcial:

```text
marca + modelo + versao + anoModelo + combustivel + transmissao
```

### `dealervehicleprices`

Tabela pivot. Só deve existir quando a concessionária informa preço.

Campos principais:

- `_id`
- `variationId`
- `concessionariaId`
- `preco`
- `frete`
- `coresDisponiveis`
- `observacoes`
- `ativo`

Índices:

```text
unique(variationId, concessionariaId)
concessionariaId + ativo + updatedAt
variationId + ativo
```

## Regras

### Onboarding

1. Operador/admin cadastra ou reutiliza uma marca.
2. Operador/admin vincula a concessionária à marca.
3. O painel da concessionária passa a exibir todas as variações ativas dessa marca.
4. Nenhum registro de preço é criado automaticamente.

Endpoint de vínculo:

```http
PATCH /api/concessionarias/:id/catalog-brand
{
  "marcaId": "...",
  "marca": "Toyota"
}
```

Também existe UI em:

- Admin: aba `Catálogo Mestre`.
- Operador: aba `Catálogo Mestre`.

### Precificação

Endpoint:

```http
GET /api/dealership/pricing-catalog
PATCH /api/dealership/pricing-catalog
```

Regra:

- preço vazio, nulo ou `<= 0`: remove a linha da pivot e o item fica inativo.
- preço `> 0`: cria/atualiza a pivot e o item fica ativo.

### Cliente Final

Endpoint:

```http
GET /api/catalog/active-vehicles
```

Retorna somente linhas com:

- `DealerVehiclePrice.ativo = true`
- `DealerVehiclePrice.preco > 0`
- `VehicleVariation.ativo = true`
- `Concessionaria.ativo != false`

Também preserva bloqueio de assinatura vencida e trial grátis expirado.

## Migração Recomendada

1. Criar marcas e variações mestre a partir da base atual de `Vehicle`.
2. Vincular cada concessionária a uma marca.
3. Migrar preços existentes criando `DealerVehiclePrice` por par `variationId + concessionariaId`.
4. Homologar a aba `Preços` da concessionária.
5. Homologar o dashboard cliente lendo `/api/catalog/active-vehicles`.
6. Só depois descontinuar a criação de novos registros no modelo legado `Vehicle`.

Script auxiliar:

```bash
npx tsx scripts/migrateVehicleCatalog.ts
```

O comando acima roda em `dry-run`. Para gravar:

```bash
npx tsx scripts/migrateVehicleCatalog.ts --write
```
